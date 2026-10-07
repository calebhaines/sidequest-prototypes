import { test, expect } from "@playwright/test";

// These journeys intentionally use real timers. Separate machine and drag
// checks missed the ordinary task: place a cup, pull the lever, take the cup.
// Coordinates follow painted artwork, never an invisible drop-zone center.
async function espressoCafe(page, context, testInfo) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.addInitScript(() => {
    window.__espressoInputs = [];
    document.addEventListener("pointerdown", (event) => {
      window.__espressoInputs.push({
        trusted: event.isTrusted,
        type: event.pointerType,
      });
    }, true);
  });
  await page.goto("./");
  testInfo.annotations.push({
    type: "application-bundle",
    description: await page.locator('script[type="module"]').first().getAttribute("src"),
  });
  await page.evaluate(() => document.fonts.ready);
  const canvas = page.locator("canvas.cafe-game");
  await expect(canvas).toHaveAttribute("data-phase", "practice");
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0);
  const cdp = touch ? await context.newCDPSession(page) : null;
  const state = () => canvas.evaluate((c) => ({
    phase: c.dataset.phase,
    dock: c.dataset.cupDock,
    drink: JSON.parse(c.dataset.drink),
    jobs: JSON.parse(c.dataset.jobs),
    food: JSON.parse(c.dataset.food),
    served: Number(c.dataset.served),
    sources: c.__draggables,
  }));
  async function visibleBox(kind, id) {
    return canvas.evaluate((c, { kind, id }) => {
      const box = kind === "object"
        ? c.__view.objects[id]
        : (kind === "source" ? c.__draggables : c.__targets)
          .find((item) => item.id === id);
      if (!box) throw Error(`Missing painted ${kind} ${id}`);
      const paint = box.paintRect || box;
      const rect = c.getBoundingClientRect();
      return {
        ...box,
        ...paint,
        screen: {
          x: rect.left + paint.x * rect.width / c.__view.width,
          y: rect.top + paint.y * rect.height / c.__view.height,
          w: paint.w * rect.width / c.__view.width,
          h: paint.h * rect.height / c.__view.height,
        },
      };
    }, { kind, id });
  }
  const center = (box) => ({
    x: box.screen.x + box.screen.w / 2,
    y: box.screen.y + box.screen.h / 2,
  });
  // All illustrations preserve their native proportions inside the painted box.
  function artPoint(box, width, height, x, y) {
    const b = box.screen;
    const scale = Math.min(b.w / width, b.h / height);
    return {
      x: b.x + (b.w - width * scale) / 2 + x * scale,
      y: b.y + (b.h - height * scale) / 2 + y * scale,
    };
  }
  const machinePoint = async (x, y) =>
    artPoint(await visibleBox("target", "machine-espresso"), 240, 205, x, y);
  const cupPoint = async (handle = false) =>
    artPoint(await visibleBox("source", "drag-cup"), 200, 180,
      handle ? 174 : 93, handle ? 93 : 113);
  const paintedCupPoint = async (x, y) =>
    artPoint(await visibleBox("source", "drag-cup"), 200, 180, x, y);
  async function paintedPixels(points) {
    return canvas.evaluate((c, points) => {
      const rect = c.getBoundingClientRect();
      return points.map((point) => [...c.getContext("2d").getImageData(
        Math.round((point.x - rect.left) * c.width / rect.width),
        Math.round((point.y - rect.top) * c.height / rect.height), 1, 1).data]);
    }, points);
  }
  const paintedPixel = async (point) => (await paintedPixels([point]))[0];
  async function pointer(type, point) {
    if (touch) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: { down: "touchStart", move: "touchMove", up: "touchEnd" }[type],
        touchPoints: point ? [{
          x: point.x, y: point.y, id: 1, radiusX: 7, radiusY: 7, force: 1,
        }] : [],
      });
    } else if (type === "down") {
      await page.mouse.move(point.x, point.y);
      await page.mouse.down();
    } else if (type === "move") await page.mouse.move(point.x, point.y);
    else await page.mouse.up();
  }
  async function click(id) {
    const box = await visibleBox("target", id);
    expect(box.disabled, `${id} is available`).not.toBe(true);
    const at = center(box);
    if (touch) await page.touchscreen.tap(at.x, at.y);
    else await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(100);
  }
  async function drag(from, destination, { preview = false, hesitate = false } = {}) {
    const to = { ...destination };
    if (preview && touch) to.y += 36;
    expect(from.x).toBeGreaterThanOrEqual(0);
    expect(from.y).toBeGreaterThanOrEqual(0);
    expect(to.y).toBeLessThan(page.viewportSize().height);
    await pointer("down", from);
    if (hesitate) {
      // Normal uncertainty on pickup must not activate the underlying machine.
      for (const [dx, dy] of [[2, 1], [4, -2], [1, -3]]) {
        await pointer("move", { x: from.x + dx, y: from.y + dy });
        await page.waitForTimeout(65);
      }
    }
    for (let i = 1; i <= 12; i++) {
      const t = i / 12;
      const bend = Math.sin(t * Math.PI) * Math.min(22, Math.abs(to.y - from.y) / 9);
      await pointer("move", {
        x: from.x + (to.x - from.x) * t + bend,
        y: from.y + (to.y - from.y) * t + Math.sin(i * 2.1) * (i === 12 ? 0 : 1.5),
      });
      await page.waitForTimeout(28);
    }
    await pointer("up");
    await page.waitForTimeout(350);
  }
  async function receipt() {
    const source = await visibleBox("source", "drag-cup");
    const machine = await visibleBox("target", "machine-espresso");
    const wellLeft = artPoint(machine, 240, 205, 45, 112);
    const wellRight = artPoint(machine, 240, 205, 188, 186);
    const cupCenter = center(source);
    expect(cupCenter.x, "Cup source sits in the painted espresso well").toBeGreaterThan(wellLeft.x);
    expect(cupCenter.x).toBeLessThan(wellRight.x);
    expect(cupCenter.y).toBeGreaterThan(wellLeft.y);
    expect(cupCenter.y).toBeLessThan(wellRight.y);
    // A metadata-only test can pass while the actual well remains empty.
    // Sample the painted cup body: its peach ceramic differs from the green well.
    const [pixel, liquid] = await paintedPixels([
      artPoint(source, 200, 180, 93, 113),
      artPoint(source, 200, 180, 78, 55),
    ]);
    expect(pixel[0], "Actual ceramic cup is painted in the well").toBeGreaterThan(175);
    expect(pixel[1]).toBeGreaterThan(110);
    return { source, pixel, liquid };
  }
  async function film(name, extra = {}) {
    await testInfo.attach(name, {
      body: await page.screenshot(), contentType: "image/png",
    });
    await testInfo.attach(`${name}-state`, {
      body: Buffer.from(JSON.stringify({ ...await state(), ...extra }, null, 2)),
      contentType: "application/json",
    });
  }
  async function pullLever() {
    const control = await visibleBox("target", "control-espresso");
    const at = center(control);
    expect(control.disabled).not.toBe(true);
    await pointer("down", at);
    for (let i = 1; i <= 6; i++) {
      await pointer("move", { x: at.x + Math.sin(i) * 1.4, y: at.y + i * 9 });
      await page.waitForTimeout(35);
    }
    await pointer("up");
    await page.waitForTimeout(120);
  }
  const source = async (id) => center(await visibleBox("source", id));
  const target = async (id) => center(await visibleBox("target", id));
  const object = async (id) => center(await visibleBox("object", id));
  async function clean() {
    expect(errors).toEqual([]);
    const inputs = await page.evaluate(() => window.__espressoInputs);
    expect(inputs.length).toBeGreaterThan(5);
    expect(inputs.every((input) => input.trusted)).toBe(true);
    expect(inputs.every((input) => input.type === (touch ? "touch" : "mouse"))).toBe(true);
  }
  return { touch, state, click, drag, cupPoint, machinePoint, source, target,
    object, receipt, pullLever, film, clean, paintedPixel, paintedCupPoint,
    pointer };
}

test("a small landscape iced-cup straw is a cup pickup beside the lever",
  async ({ page, context, browserName }, testInfo) => {
    test.skip(browserName !== "chromium" ||
      !testInfo.project.name.includes("landscape"),
    "This is a native Chromium touch regression for the smallest landscape machine.");
    await page.setViewportSize({ width: 750, height: 342 });
    const game = await espressoCafe(page, context, testInfo);
    await game.click("cup-type");
    expect((await game.state()).drink.cup).toBe("iced");
    await game.drag(await game.paintedCupPoint(97, 36),
      await game.machinePoint(116, 149), { preview: true, hesitate: true });
    expect((await game.state()).dock).toBe("espresso");
    expect((await game.state()).drink.shots).toBe(0);
    expect((await game.state()).jobs.espresso).toBeNull();
    await game.film("iced-cup-under-nozzle");
    // The bent straw extends above the rim near the enlarged lever touch area.
    // Picking up that visible detail must move the cup without pulling a shot.
    await game.drag(await game.paintedCupPoint(148, 11),
      await game.object("tray"), { preview: true, hesitate: true });
    expect((await game.state()).dock).toBe("");
    expect((await game.state()).drink.shots).toBe(0);
    expect((await game.state()).jobs.espresso).toBeNull();
    await game.film("iced-cup-retrieved-by-straw");
  });

test("a compact 568 by 320 landscape keeps the physical cup and lever usable",
  async ({ page, context, browserName }, testInfo) => {
    test.skip(browserName !== "chromium" ||
      !testInfo.project.name.includes("landscape"),
    "Focused native touch coverage for compact landscape geometry.");
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 568, height: 320 });
    const game = await espressoCafe(page, context, testInfo);
    await game.drag(await game.cupPoint(true),
      await game.machinePoint(116, 149), { preview: true, hesitate: true });
    const placed = await game.state();
    expect(placed.dock).toBe("espresso");
    expect(placed.drink.shots).toBe(0);
    expect(placed.jobs.espresso).toBeNull();
    await game.film("compact-cup-received", await game.receipt());
    await game.pullLever();
    await expect.poll(async () => (await game.state()).drink.shots).toBe(1);
    const filled = await game.receipt();
    expect(filled.liquid[0]).toBeLessThan(175);
    await game.film("compact-one-shot-in-machine", filled);
    const tray = await game.object("tray");
    // Finger aiming near the tray center leaves the lifted preview beside the
    // old well on this tight layout. The user still chose to return the cup.
    await game.drag(await game.cupPoint(true), { x: tray.x, y: tray.y - 2 },
      { hesitate: true });
    const retrieved = await game.state();
    expect(retrieved.dock).toBe("");
    expect(retrieved.drink.shots).toBe(1);
    expect(retrieved.jobs.espresso).toBeNull();
    await game.film("compact-cup-retrieved");
  });

for (const timed of [false, true]) {
  test(`physical espresso journey with ${timed ? "real timed" : "practice"} machines`,
    async ({ page, context, browserName }, testInfo) => {
      test.skip(browserName !== "chromium", "Native touch movement uses Chromium CDP; no synthetic substitute in this journey.");
      test.setTimeout(120_000);
      const landscape = testInfo.project.name.includes("landscape");
      const phone = testInfo.project.name.includes("phone");
      // Use the browser's usable viewport, including the space lost to mobile
      // browser chrome, rather than the phone's full physical screen dimensions.
      await page.setViewportSize(landscape ? { width: 750, height: 342 }
        : phone ? { width: 390, height: 664 } : { width: 1440, height: 700 });
      const game = await espressoCafe(page, context, testInfo);
      if (timed) await game.click("start-shift");
      // A short laptop screen requires scrolling while keeping the cup visible.
      if (!game.touch) {
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(150);
      }
      await game.film("01-empty-cup");
      const trayBodyPoint = await game.cupPoint(false);
      const originalCupPixel = await game.paintedPixel(trayBodyPoint);
      const approach = await game.machinePoint(timed ? 124 : 108, 149);
      await game.drag(await game.cupPoint(timed), approach,
        { preview: true, hesitate: true });
      const placed = await game.state();
      expect(placed.drink.shots, "Placement does not dispense espresso").toBe(0);
      expect(placed.jobs.espresso).toBeNull();
      expect(placed.dock).toBe("espresso");
      const received = await game.receipt();
      expect(received.liquid[0], "Empty cup has a cream-colored interior").toBeGreaterThan(220);
      const emptyTrayPixel = await game.paintedPixel(trayBodyPoint);
      expect(Math.hypot(...emptyTrayPixel.slice(0, 3).map((value, i) =>
        value - originalCupPixel[i])), "Cup's old tray position is visibly empty").toBeGreaterThan(30);
      await game.film("02-cup-received", { ...received, originalCupPixel, emptyTrayPixel });
      await game.pullLever();
      if (timed) {
        expect((await game.state()).jobs.espresso).toMatchObject({ ready: false });
        // A held gesture that began on a locked cup stays blocked after the
        // 4-second job finishes. Releasing it on Pull Shot must not start a
        // second espresso through stale gesture state.
        await game.pointer("down", await game.cupPoint(false));
        await game.film("03-espresso-filling", await game.receipt());
      }
      await expect.poll(async () => (await game.state()).drink.shots,
        { timeout: 7_000 }).toBe(1);
      if (timed) {
        await game.pointer("move", await game.target("station-espresso"));
        await game.pointer("up");
        await page.waitForTimeout(120);
        expect((await game.state()).drink.shots).toBe(1);
      }
      const finishedShot = await game.state();
      expect(finishedShot.jobs.espresso).toBeNull();
      expect(finishedShot.dock).toBe("espresso");
      await page.waitForTimeout(250);
      const filled = await game.receipt();
      expect(filled.liquid[0], "Espresso is visibly dark in the cup").toBeLessThan(175);
      expect(filled.liquid[1]).toBeLessThan(140);
      await game.film("04-one-shot-in-machine", filled);
      // Take the physical cup back by its visible handle, including the small
      // landscape well next to the lever. It must not become another lever pull.
      await game.drag(await game.cupPoint(true), await game.object("tray"),
        { preview: true, hesitate: true });
      const retrieved = await game.state();
      expect(retrieved.dock).toBe("");
      expect(retrieved.drink.shots).toBe(1);
      expect(retrieved.jobs.espresso).toBeNull();
      await game.film("05-cup-retrieved");
      if (game.touch) await game.click("mobile-milk");
      await game.drag(await game.cupPoint(false), await game.target("station-milk"));
      await expect.poll(async () => (await game.state()).drink.milk,
        { timeout: 8_000 }).toBe(1);
      expect((await game.state()).drink.shots).toBe(1);
      if (game.touch) await game.click("mobile-oven");
      await game.drag(await game.source("rack-croissant"), await game.target("station-oven"));
      await expect.poll(async () => (await game.state()).jobs.oven?.ready,
        { timeout: 10_000 }).toBe(true);
      await game.drag(await game.source("warm-food"), await game.object("foodSlot"),
        { preview: true });
      expect((await game.state()).food).toEqual({ id: "croissant", warm: true });
      await game.film("06-complete-latte-order");
      if (!game.touch) {
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(100);
      }
      await game.drag(await game.cupPoint(true), await game.target("serve"));
      const served = await game.state();
      expect(served.served).toBe(1);
      expect(served.drink.shots).toBe(0);
      expect(served.food).toBeNull();
      await game.film("07-order-served");
      await game.clean();
    });
}
