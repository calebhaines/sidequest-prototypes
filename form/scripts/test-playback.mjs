/** Browser regression checks against the PCM buffers sent to Web Audio playback.
 * Build first, then run with a local Playwright install:
 * PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test-playback.mjs
 * FORM_URL may point to a running dev server; otherwise releases/FORM.html is opened
 * as a self-contained document. CHROMIUM_PATH selects the browser executable.
 */
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleName = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(
  path.isAbsolute(moduleName) ? pathToFileURL(moduleName).href : moduleName
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || chromium.executablePath(),
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--autoplay-policy=no-user-gesture-required",
  ],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
});
await context.addInitScript(() => {
  window.__formPlayback = [];
  const original = AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start = function (...args) {
    const pcm = this.buffer.getChannelData(0).slice();
    const bytes = new Uint8Array(pcm.buffer);
    let hash = 2166136261;
    let energy = 0;
    let peak = 0;
    for (let i = 0; i < bytes.length; i++) {
      hash = Math.imul(hash ^ bytes[i], 16777619);
    }
    for (let i = 0; i < pcm.length; i++) {
      energy += pcm[i] * pcm[i];
      peak = Math.max(peak, Math.abs(pcm[i]));
    }
    window.__formPlayback.push({
      hash: hash >>> 0,
      pcm,
      rms: Math.sqrt(energy / pcm.length),
      peak,
    });
    return original.apply(this, args);
  };
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
let checks = 0;
const pass = (message) => {
  checks++;
  console.log(`PASS ${message}`);
};

async function exactValue(label, value, commit = true) {
  await page
    .getByRole("button", {
      name: new RegExp(`^Edit ${escapeRegex(label)} value`),
    })
    .click();
  const editor = page.getByRole("spinbutton", {
    name: new RegExp(`^${escapeRegex(label)} value`),
  });
  await editor.fill(String(value));
  if (commit) {
    await editor.press("Enter");
    await editor.waitFor({ state: "hidden" });
  }
}

async function audition(buttonName = "Audition sound") {
  const count = await page.evaluate(() => window.__formPlayback.length);
  await page.locator(".hotplate-deep-recipe").getByRole("button", { name: buttonName, exact: true }).click();
  await page.waitForFunction(
    (count) => window.__formPlayback.length > count,
    count,
  );
  return page.evaluate(() => {
    const index = window.__formPlayback.length - 1;
    const { hash, rms, peak } = window.__formPlayback[index];
    return { index, hash, rms, peak };
  });
}

async function pcmDifference(a, b) {
  return page.evaluate(
    ([a, b]) => {
      const x = window.__formPlayback[a].pcm;
      const y = window.__formPlayback[b].pcm;
      let energyX = 0;
      let energyY = 0;
      let difference = 0;
      for (let i = 0; i < Math.max(x.length, y.length); i++) {
        const first = x[i] || 0;
        const second = y[i] || 0;
        energyX += first * first;
        energyY += second * second;
        difference += (first - second) ** 2;
      }
      return Math.sqrt(difference / Math.max(energyX, energyY, 1e-20));
    },
    [a, b],
  );
}

try {
  if (process.env.FORM_URL) {
    await page.goto(process.env.FORM_URL, { waitUntil: "networkidle" });
  } else {
    const html = await fs.readFile(
      process.env.FORM_FILE || path.join(root, "releases/FORM.html"),
      "utf8",
    );
    await page.route("http://localhost/form-playback-check", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: html }),
    );
    await page.goto("http://localhost/form-playback-check", {
      waitUntil: "load",
    });
  }
  await page.getByRole("button", { name: /^Open recipe/ }).click();
  await page.locator(".layer-lab").waitFor();
  assert.equal(await page.locator(".drum-pad").count(), 8);
  assert.equal(
    await page
      .getByRole("slider", { name: "Layer A level", exact: true })
      .inputValue(),
    "0.91",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Disable layer A", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  pass("fresh default kit has an active audible layer A");

  for (const [engine, parameter, low, high] of [
    ["subtractive", "Cutoff", 20, 20000],
    ["fm", "FM index", 0, 24],
    ["wavetable", "Table position", 0, 1],
    ["granular", "Grain size", 5, 250],
  ]) {
    await page.getByLabel("Layer A synthesis engine").selectOption(engine);
    await exactValue(parameter, low);
    const before = await audition();
    const repeat = await audition();
    assert.equal(
      before.hash,
      repeat.hash,
      "unchanged sound must be deterministic",
    );
    // Clicking waveform play must also commit a value that is still being edited.
    await exactValue(parameter, high, false);
    const after = await audition();
    assert.notEqual(
      before.hash,
      after.hash,
      `${parameter} must change playback PCM`,
    );
    assert(Number.isFinite(after.rms) && after.rms > 0.001);
    assert(Number.isFinite(after.peak) && after.peak <= 1.001);
    const difference = await pcmDifference(before.index, after.index);
    assert(
      difference > 0.1,
      `${parameter} must have an appreciable audible effect`,
    );
    pass(
      `${engine}: exact ${parameter} edit changes waveform-button playback PCM (${difference.toFixed(3)} relative RMS)`,
    );
  }

  // Calculate both expected buffers using the manual waveform play button first.
  // During transport, do not audition manually: only sequencer starts may satisfy
  // the new-buffer check, so a stale sequencer cache cannot accidentally pass.
  await exactValue("Grain size", 250);
  const after = await audition();
  await exactValue("Grain size", 5);
  const before = await audition();
  const startCount = await page.evaluate(() => window.__formPlayback.length);
  await page
    .getByRole("button", { name: "Play sequencer", exact: true })
    .click();
  await page.waitForFunction(
    ({ count, hash }) =>
      window.__formPlayback.slice(count).some((play) => play.hash === hash),
    { count: startCount, hash: before.hash },
    { timeout: 10000 },
  );
  const editCount = await page.evaluate(() => window.__formPlayback.length);
  await exactValue("Grain size", 250);
  await page.waitForFunction(
    ({ count, hash }) =>
      window.__formPlayback.slice(count).some((play) => play.hash === hash),
    { count: editCount, hash: after.hash },
    { timeout: 10000 },
  );
  await page
    .getByRole("button", { name: "Stop sequencer", exact: true })
    .click();
  pass("running sequencer uses newly edited engine PCM without restarting");

  // Return to the original default patch, whose quiet granular transient can be
  // masked by the kick body. Compare the whole sound with a layer-only preview.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "load" });
  await page.getByRole("button", { name: /^Open recipe/ }).click();
  await page.locator(".layer-lab").waitFor();
  await page.getByRole("button", { name: /^Edit layer C / }).click();
  assert.equal(
    await page.getByLabel("Layer C synthesis engine").inputValue(),
    "granular",
  );
  const originalLevel = await page
    .getByRole("slider", { name: "Layer C level", exact: true })
    .inputValue();
  assert(Number(originalLevel) > 0 && Number(originalLevel) < 0.2);
  await exactValue("Position", 0);
  const wholeBefore = await audition();
  const layerBefore = await audition("Audition layer C");
  await exactValue("Position", 1);
  const wholeAfter = await audition();
  const layerAfter = await audition("Audition layer C");
  const wholeDifference = await pcmDifference(
    wholeBefore.index,
    wholeAfter.index,
  );
  const layerDifference = await pcmDifference(
    layerBefore.index,
    layerAfter.index,
  );
  assert.notEqual(
    layerBefore.hash,
    layerAfter.hash,
    "granular position must change layer playback",
  );
  assert(layerBefore.rms > 0.001 && layerAfter.rms > 0.001);
  assert(
    layerDifference > 0.1,
    "layer preview must make the grain-position change appreciable",
  );
  assert(
    layerDifference > wholeDifference * 2,
    "isolating the quiet layer must remove masking",
  );
  pass(
    `quiet layer C preview reveals parameter edits (${layerDifference.toFixed(3)} isolated versus ${wholeDifference.toFixed(3)} mixed relative RMS)`,
  );

  // Audition is a monitor action. It must not overwrite stored synth levels,
  // disable layers, disconnect interactions, or alter the following full hit.
  await page.waitForTimeout(700);
  const savedBefore = await page.evaluate(() =>
    localStorage.getItem("form-studio-v2"),
  );
  await audition("Audition layer C");
  const fullAgain = await audition();
  await page.waitForTimeout(700);
  assert.equal(
    fullAgain.hash,
    wholeAfter.hash,
    "full audition must remain unchanged after layer preview",
  );
  const savedAfter = await page.evaluate(() =>
    localStorage.getItem("form-studio-v2"),
  );
  assert(savedBefore, "project must be persisted");
  assert.equal(
    savedAfter,
    savedBefore,
    "layer preview must not edit the saved project",
  );
  assert.equal(
    await page
      .getByRole("slider", { name: "Layer C level", exact: true })
      .inputValue(),
    originalLevel,
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Disable layer A", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Disable layer B", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  pass(
    "layer-only audition preserves project, layer levels, and subsequent full-sound playback",
  );

  await page
    .getByRole("button", { name: "Disable layer C", exact: true })
    .click();
  const disabledPreview = await audition("Audition layer C");
  assert(
    disabledPreview.rms > 0.001,
    "disabled layers must still be inspectable",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Enable layer C", exact: true })
      .getAttribute("aria-pressed"),
    "false",
  );
  pass(
    "previewing a disabled layer produces sound without enabling it in the patch",
  );
  assert.deepEqual(
    errors,
    [],
    "browser must have no runtime or console errors",
  );
  pass("browser reports no runtime errors");
  console.log(`${checks} playback checks passed.`);
} finally {
  await browser.close();
}
