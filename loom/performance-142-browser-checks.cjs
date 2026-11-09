'use strict';

/* Sustained production AudioWorklet measurements, with recorded audio clips.
 * Run Chromium exclusively. This harness never changes the shipped HTML.
 * GALLEY_142_HTML selects an immutable build; GALLEY_142_DIR stores evidence.
 * GALLEY_142_FILTER limits scenario names. GALLEY_142_MS/WARMUP_MS set windows.
 * GALLEY_142_TRACE=1 records one extra high-resolution Chrome audio task trace.
 * GALLEY_142_TRACE_CASES selects per-case traces, outside CPU windows.
 * GALLEY_142_REGRESSION=1 runs current UI and production-host PCM checks only.
 * Timings are observations, never machine-dependent pass/fail thresholds.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { createHash } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const DIR = process.env.GALLEY_142_DIR || '/tmp/galley-performance-142-browser';
const HTML = process.env.GALLEY_142_HTML || path.join(__dirname, 'index.html');
const WINDOW = Math.max(500, Number(process.env.GALLEY_142_MS) || 2500);
const WARMUP = Math.max(100, Number(process.env.GALLEY_142_WARMUP_MS) || 650);
const FILTER = process.env.GALLEY_142_FILTER ? new RegExp(process.env.GALLEY_142_FILTER) : null;
const TRACE_CASES = process.env.GALLEY_142_TRACE_CASES ? new RegExp(process.env.GALLEY_142_TRACE_CASES) : null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { format: 'galley-realtime-performance', version: 1, createdAt: new Date().toISOString(), html: HTML, windowMs: WINDOW, warmupMs: WARMUP, measurements: [], errors: [], external: [], notes: [
  'Actual production AudioWorklet, headless Chromium with its local audio sink; hardware and operating-system audio dropouts are not measured.',
  'Process CPU includes every thread; 100% means one fully occupied logical core. Main Task/Script time is measured separately by CDP.',
  'The optional QA wrapper observes the unchanged production callback. Preallocated rings, two clock reads per callback, no per-callback messages. Disabled/unwrapped controls quantify overhead.',
  'Date.now callback durations have roughly 1 ms precision. Miss lower/upper bounds use this uncertainty. Callback arrival gaps are scheduling observations and may reflect normal sink batching; they are not dropout counts.'
] };
fs.mkdirSync(DIR, { recursive: true });
let browser, server, active = 'startup';
const save = () => fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2) + '\n');

// This is appended to the production module, after the existing registration.
// It does not rebuild Core, synthesize audio, modify inputs/outputs, or invoke
// GALLEY's own inspector. Commands occur only outside measured callbacks.
function workletObserver() {
  const native = LoomProcessor.prototype.process;
  const clock = typeof globalThis.performance?.now === 'function' ? () => globalThis.performance.now() : () => Date.now();
  const name = typeof globalThis.performance?.now === 'function' ? 'performance.now' : 'Date.now';
  const durations = new Float64Array(32768), gaps = new Float64Array(32768);
  const q = { meterRows: [], enabled: false, count: 0, frames: 0, last: NaN, first: NaN, end: NaN, invalid: 0, clock: name, budgetMs: 0 };
  let installed = false;
  LoomProcessor.prototype.process = function(inputs, outputs) {
    if (!installed) {
      installed = true;
      this.port.addEventListener('message', event => {
        const m = event.data;
        if (m?.type !== 'qa142') return;
        if (m.action === 'watchMeters') {
          q.meterRows = [];
          for (const [owners, racks] of [[this.core.tracks, this.core.slots], [this.core.returns, this.core.returnSlots], [this.core.buses, this.core.busSlots], [[this.core.master], [this.core.masterSlots]]]) {
            owners.forEach((owner, index) => racks[index].forEach((slot, insert) => { if (!slot || typeof slot.dsp.getMeters !== 'function') return; const row = { ownerId: owner.id, slot: insert, type: slot.type, reads: 0 }, getter = slot.dsp.getMeters; q.meterRows.push(row); slot.dsp.getMeters = function(...args) { row.reads++; return getter.apply(this, args); }; }));
          }
        }
        if (m.action === 'start') { q.count = q.frames = q.invalid = 0; q.last = q.first = q.end = NaN; q.enabled = true; }
        else if (m.action === 'stop') q.enabled = false;
        const count = Math.min(q.count, durations.length);
        this.port.postMessage({ type: 'qa142', id: m.id, meterReads: q.meterRows.map(row => ({ ...row })), clock: q.clock, capacity: durations.length, count: q.count, frames: q.frames, invalid: q.invalid, first: q.first, end: q.end, budgetMs: q.budgetMs,
          durations: m.action === 'stop' ? durations.slice(0, count) : null, gaps: m.action === 'stop' ? gaps.slice(0, count) : null });
      });
      this.port.start();
    }
    if (!q.enabled) return native.call(this, inputs, outputs);
    const begin = clock();
    const result = native.call(this, inputs, outputs);
    const end = clock(), index = q.count++, frames = outputs[0]?.[0]?.length || 128;
    if (index < durations.length) { durations[index] = end - begin; gaps[index] = Number.isFinite(q.last) ? begin - q.last : NaN; }
    q.frames += frames; q.budgetMs = frames * 1000 / sampleRate;
    if (!Number.isFinite(q.first)) q.first = begin;
    if (!Number.isFinite(end - begin) || end < begin) q.invalid++;
    q.last = begin; q.end = end;
    return result;
  };
}
const EXTENSION = '\n;(' + workletObserver.toString() + ')();\n';

function distribution(raw) {
  const values = Array.from(raw || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!values.length) return { count: 0 };
  const percentile = p => values[Math.min(values.length - 1, Math.ceil(values.length * p) - 1)];
  return { count: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99), p999Ms: percentile(.999), maxMs: values.at(-1), zeros: values.filter(x => x === 0).length };
}
function summarizeCallbacks(value) {
  if (!value) return null;
  const uncertainty = value.clock === 'Date.now' ? 1 : .01;
  const durations = Array.from(value.durations || []), gaps = Array.from(value.gaps || []);
  return { clock: value.clock, precisionNote: value.clock === 'Date.now' ? 'coarse 1 ms clock; sub-millisecond work may quantize to zero' : 'high-resolution monotonic clock', callbacks: value.count, frames: value.frames, capturedCallbacks: durations.length, ringCapacity: value.capacity, ringOverflow: value.count > value.capacity, invalid: value.invalid, budgetMs: value.budgetMs, sampledWallMs: value.end - value.first,
    durations: distribution(durations), arrivalGaps: distribution(gaps), measuredOverBudget: durations.filter(x => x > value.budgetMs).length,
    definiteOverBudget: durations.filter(x => x - uncertainty > value.budgetMs).length,
    possibleOverBudget: durations.filter(x => x + uncertainty > value.budgetMs).length,
    gapsOverFourQuanta: gaps.filter(x => x > value.budgetMs * 4).length };
}
async function openPage(url, wrapped = true, fallback = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const origin = new URL(url).origin;
  await context.route('**/*', route => {
    const address = route.request().url();
    if (/^(blob:|data:|about:)/.test(address) || new URL(address).origin === origin) return route.continue();
    report.external.push({ active, address }); return route.abort();
  });
  if (wrapped) await context.addInitScript(extension => {
    const NativeBlob = window.Blob;
    window.Blob = class extends NativeBlob {
      constructor(parts = [], options) {
        const isMixer = /javascript/.test(options?.type || '') && parts.some(p => typeof p === 'string' && p.includes("registerProcessor('loom-eight-track',LoomProcessor)"));
        super(isMixer ? [...parts, extension] : parts, options); if (isMixer) window.__qa142ProductionBlob = this;
      }
    };
    const NativeNode = window.AudioWorkletNode;
    if (NativeNode) window.AudioWorkletNode = class extends NativeNode { constructor(...args) { super(...args); if (args[1] === 'loom-eight-track') window.__qa142ProductionOptions = args[2]; } };
  }, EXTENSION);
  if (fallback) await context.addInitScript(() => Object.defineProperty(window, 'AudioWorkletNode', { value: undefined, configurable: true }));
  const page = await context.newPage();
  page.on('pageerror', error => report.errors.push({ active, message: error.message, stack: error.stack }));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.LoomApp && window.LoomSchema && window.LoomEffectsCatalog);
  await page.evaluate(() => {
    const effect = (type, params = {}) => {
      const d = LoomEffectsCatalog.find(e => e.id === type); if (!d) throw Error('Missing effect ' + type);
      return LoomSchema.effect({ type, params: { ...d.defaults, ...params } });
    };
    window.qa142 = {
      effect,
      fixture(count, kind = 'mixed', automation = false) {
        const s = LoomSchema.defaultState(); s.name = 'Recorded ' + count + ' / ' + kind; s.tempo = 120; s.lengthBars = 8; s.loopEnabled = true; s.loopStart = 0; s.loopEnd = 32; s.recording.punchEnd = 32;
        s.master.level = .75; s.master.effects.fill(null); s.master.automation = [];
        s.lfos.forEach(l => { l.enabled = false; l.routes = []; });
        for (const owner of [...s.returns, ...(s.buses || [])]) { owner.effects.fill(null); owner.automation = []; owner.level = .6; owner.pan = 0; owner.mute = false; owner.solo = false; }
        s.assets = []; const rate = 48000, frames = rate * 2;
        s.tracks.forEach((t, index) => {
          t.instrument = null; t.instrumentLive = false; t.clips = []; t.effects.fill(null); t.automation = []; t.level = .35; t.pan = (index % 3 - 1) * .15; t.sends = [0, 0]; t.sendPre = [false, false]; t.output = 'master'; t.disabled = false; t.mute = false; t.solo = false;
          if (index >= count) return;
          // A periodic, recorded-like stereo phrase. All source frequencies and
          // envelope periods fit two seconds, preventing fixture loop clicks.
          const left = new Float32Array(frames), right = new Float32Array(frames);
          const f = [55, 82.5, 110, 137.5, 165, 220, 275, 330, 440, 660][index];
          for (let i = 0; i < frames; i++) {
            const time = i / rate, envelope = .45 + .55 * Math.pow(Math.sin(Math.PI * 2 * time), 2);
            left[i] = .035 * envelope * (Math.sin(2 * Math.PI * f * time) + .22 * Math.sin(2 * Math.PI * f * 3 * time) + .09 * Math.sin(2 * Math.PI * 2333 * time));
            right[i] = .032 * envelope * (Math.sin(2 * Math.PI * f * time + .19) + .19 * Math.sin(2 * Math.PI * f * 5 * time));
          }
          const id = 'recorded-' + index; s.assets.push(LoomSchema.encodeAsset({ id, name: 'Recorded phrase ' + (index + 1), sampleRate: rate, left, right }));
          t.clips = [{ id: 'clip-' + index, name: 'Recorded phrase ' + (index + 1), type: 'audio', assetId: id, start: 0, length: 32, sourceStart: 0, sourceEnd: 2, sourceOffset: 0, rate: 1, reverse: false, loop: true, gain: 1, fadeIn: 0, fadeOut: 0 }];
          if (kind === 'clean') return;
          const chain = {
            mixed: [['velvet', { model: 'clean' }], ['preserve', { noise: 0, wow: 0, flutter: 0 }], ['strainer', {}], ['cupboard', {}], ['cinder', { shape: 'soft' }], ['prism', {}], ['velvet', { model: 'opto-2a' }], ['parallax', { mix: .15 }], ['vestige', { model: 'room', mix: .15 }], ['preserve', {}]],
            cupboard1: [['cupboard', {}]],
            cupboard4: [['cupboard', { mic2Enabled: 'on', mic3Enabled: 'on', mic4Enabled: 'on', alignment: 'natural', mic2Pan: -.6, mic3Pan: .6 }]],
            nonlinear: [['cinder', { shape: 'valve' }]],
            tape: [['preserve', {}]],
            reverb: [['vestige', { model: 'hall', mix: .2 }]],
            amps: [['broiler', {}], ['sunday', {}], ['cellar', {}], ['board', {}]]
          }[kind];
          if (!chain) throw Error('Unknown fixture ' + kind);
          const [type, patch] = chain[index % chain.length]; t.effects[0] = effect(type, patch);
          t.effects[1] = effect('prism', { highpass: 35 });
          t.eq = { ...t.eq, low: 1, lowMid: -.75, highMid: .5, high: -.5 };
          if (automation) t.automation = [{ target: 'level', enabled: true, interpolation: 'linear', points: [{ beat: 0, value: .3 }, { beat: 16, value: .4 }, { beat: 32, value: .3 }] }];
          if (kind === 'mixed') t.sends = [.06, .04];
        });
        if (kind === 'mixed') { s.returns[0].effects[0] = effect('vestige', { model: 'room', mix: 1 }); s.returns[1].effects[0] = effect('parallax', { mix: 1 }); s.master.effects[0] = effect('velvet', { model: 'clean', ratio: 2, makeup: 0 }); }
        if (automation) Object.assign(s.lfos[0], { enabled: true, wave: 'sine', sync: false, rate: .7, routes: [{ id: 'qa-pan', ownerId: 'track-1', target: 'pan', amount: .1, enabled: true }] });
        return LoomSchema.normalize(s);
      },
      request(action) {
        const node = LoomApp.engine.node, id = ++this.sequence;
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { node.port.removeEventListener('message', listener); reject(Error('QA Worklet did not respond to ' + action)); }, 10000);
          const listener = event => { if (event.data?.type !== 'qa142' || event.data.id !== id) return; clearTimeout(timeout); node.port.removeEventListener('message', listener); resolve({ ...event.data, durations: event.data.durations ? Array.from(event.data.durations) : null, gaps: event.data.gaps ? Array.from(event.data.gaps) : null }); };
          node.port.addEventListener('message', listener); node.port.start(); node.port.postMessage({ type: 'qa142', action, id });
        });
      }, sequence: 0
    };
  });
  const cdp = await context.newCDPSession(page); await cdp.send('Performance.enable');
  return { context, page, cdp, wrapped };
}
async function snapshot(bundle, system) {
  const [processes, metrics, audio] = await Promise.all([
    system.send('SystemInfo.getProcessInfo'), bundle.cdp.send('Performance.getMetrics'),
    bundle.page.evaluate(() => { const e = LoomApp.engine, c = e.context, inspector = LoomApp.cpuInspector; return { wall: performance.now(), audioTime: c?.currentTime || 0, outputTimestamp: c?.getOutputTimestamp?.(), mode: e.mode, contextState: c?.state || null, sampleRate: c?.sampleRate || null, baseLatency: c?.baseLatency, outputLatency: c?.outputLatency, meter: e.getMeters().master, diagnostics: e.getDiagnostics(), inspector: { active: inspector.active, open: inspector.element.open, visible: inspector.visible, mode: inspector.mode, released: inspector.released }, frames: document.querySelectorAll('iframe').length, hidden: document.hidden }; })
  ]);
  return { at: performance.now(), processes: processes.processInfo, metrics: Object.fromEntries(metrics.metrics.map(m => [m.name, m.value])), audio };
}
async function loadFixture(bundle, count, kind, automation = false) {
  await bundle.page.evaluate(async ({ count, kind, automation }) => {
    const e = LoomApp.engine; e.stop(); document.querySelector('#cpuInspector').open = false;
    await LoomApp.loadState(qa142.fixture(count, kind, automation));
    if (!e.context) { await e.applyAudioSettings({ sampleRate: 48000, latencyProfile: 'live' }); await e.init(); }
    e.setDiagnostics({ enabled: false, release: true }); await e.play(0); window.scrollTo(0, 0);
  }, { count, kind, automation });
  await bundle.page.waitForFunction(() => LoomApp.engine.mode === 'worklet' && LoomApp.engine.context.state === 'running' && LoomApp.engine.getMeters().master?.peak > 1e-5);
}
async function view(bundle, mode) {
  await bundle.page.evaluate(mode => {
    const p = document.querySelector('#cpuInspector'); p.open = false;
    LoomApp.engine.setDiagnostics({ enabled: false, release: true });
    if (mode === 'editor') { LoomApp.selectEffect(0, 'track-4'); document.querySelector('#effectEditor').scrollIntoView({ block: 'start', behavior: 'instant' }); }
    else if (mode === 'light' || mode === 'deep') { p.open = true; const select = p.querySelector('[data-cpu-mode]'); select.value = mode; select.dispatchEvent(new Event('change', { bubbles: true })); p.scrollIntoView({ block: 'start', behavior: 'instant' }); }
    else window.scrollTo(0, 0);
  }, mode);
  if (mode === 'light' || mode === 'deep') await bundle.page.waitForFunction(() => LoomApp.cpuInspector.active);
  else await bundle.page.waitForFunction(() => !LoomApp.cpuInspector.active && !LoomApp.engine.getDiagnostics().enabled);
}
async function measure(bundle, system, name, options = {}) {
  if (FILTER && !FILTER.test(name)) return;
  active = name; await sleep(WARMUP);
  const instrumented = bundle.wrapped && options.qa !== false;
  if (instrumented) await bundle.page.evaluate(() => qa142.request('start'));
  const a = await snapshot(bundle, system); await sleep(WINDOW); const b = await snapshot(bundle, system);
  const callbacks = instrumented ? await bundle.page.evaluate(() => qa142.request('stop')) : null;
  const seconds = (b.at - a.at) / 1000, cpuByType = {};
  for (const p of b.processes) { const previous = a.processes.find(old => old.id === p.id); if (previous) cpuByType[p.type] = (cpuByType[p.type] || 0) + (p.cpuTime - previous.cpuTime) / seconds * 100; }
  const d = b.audio.diagnostics;
  const value = { name, ...options, wrapperInstalled: bundle.wrapped, wrapperEnabled: instrumented, seconds, cpuByType, totalCPUPercent: Object.values(cpuByType).reduce((a, b) => a + b, 0), mainTaskMs: (b.metrics.TaskDuration - a.metrics.TaskDuration) * 1000, mainScriptMs: (b.metrics.ScriptDuration - a.metrics.ScriptDuration) * 1000, heapBytes: b.metrics.JSHeapUsedSize,
    audioProgressSeconds: b.audio.audioTime - a.audio.audioTime, audioProgressPerWallSecond: (b.audio.audioTime - a.audio.audioTime) / seconds, callback: summarizeCallbacks(callbacks), start: a.audio, end: b.audio,
    inspectorHotspots: (d.rows || []).filter(row => row.kind === 'effect').sort((x, y) => (y.meanMs || 0) - (x.meanMs || 0)).slice(0, 12) };
  report.measurements.push(value); save();
  console.log('MEASURE', name, JSON.stringify({ cpu: +value.totalCPUPercent.toFixed(1), renderer: +(cpuByType.renderer || 0).toFixed(1), mainMs: +value.mainTaskMs.toFixed(1), p95: value.callback?.durations.p95Ms, p99: value.callback?.durations.p99Ms, maximum: value.callback?.durations.maxMs, definiteMisses: value.callback?.definiteOverBudget, inspector: b.audio.inspector.active }));
  assert.equal(b.audio.mode, 'worklet'); assert.equal(b.audio.contextState, 'running'); assert(!b.audio.hidden); assert(Number.isFinite(b.audio.meter.peak)); assert(b.audio.meter.peak > 1e-6, 'Recorded clips must remain audible'); if (value.callback) { assert(value.callback.callbacks > 0); assert.equal(value.callback.invalid, 0); assert.equal(value.callback.ringOverflow, false); }
  if (TRACE_CASES?.test(name)) await trace(bundle, name);
  return value;
}
function analyzeTrace(events, budgetMs) {
  const threads = events.filter(e => e.ph === 'M' && e.name === 'thread_name').map(e => ({ pid: e.pid, tid: e.tid, name: e.args?.name }));
  const audioThreads = threads.filter(t => /audio|worklet/i.test(t.name));
  const isAudio = event => audioThreads.some(t => t.pid === event.pid && t.tid === event.tid);
  const tasks = events.filter(e => e.ph === 'X' && Number.isFinite(e.dur) && isAudio(e));
  const renders = tasks.filter(e => e.args?.src_func === 'Render' && /audio_destination/.test(e.args?.src_file || '')).sort((a, b) => a.ts - b.ts);
  const spanMs = renders.length ? (renders.at(-1).ts + renders.at(-1).dur - renders[0].ts) / 1000 : 0;
  const threadCpuMs = renders.reduce((sum, event) => sum + (event.tdur || 0) / 1000, 0);
  const grouped = new Map(); for (const event of tasks) { const key = event.name + ' / ' + event.pid + ':' + event.tid; if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(event.dur / 1000); }
  return { threads: audioThreads, audioRender: { tasks: renders.length, spanMs, budgetMs, wallTime: distribution(renders.map(e => e.dur / 1000)), threadCpuTime: distribution(renders.map(e => Number.isFinite(e.tdur) ? e.tdur / 1000 : NaN)), schedulingInterruption: distribution(renders.map(e => Number.isFinite(e.tdur) ? Math.max(0, e.dur - e.tdur) / 1000 : NaN)), threadCpuMs, threadCPUPercent: spanMs > 0 ? threadCpuMs / spanMs * 100 : null, deadlineOverruns: renders.filter(e => e.dur / 1000 > budgetMs).length, cpuOverBudget: renders.filter(e => Number.isFinite(e.tdur) && e.tdur / 1000 > budgetMs).length, note: 'Chrome audio_destination::Render tasks include the whole graph. dur is high-resolution wall time; tdur is actual thread CPU. A task longer than one quantum is a deadline observation, not a detected audible dropout.' }, groups: [...grouped].map(([name, durations]) => ({ name, ...distribution(durations) })).sort((a, b) => b.meanMs * b.count - a.meanMs * a.count).slice(0, 40) };
}
async function trace(bundle, name = 'eight-mixed') {
  active = 'audio-thread-trace-' + name;
  const available = await bundle.cdp.send('Tracing.getCategories');
  const categories = available.categories.filter(name => /audio/i.test(name)); report.availableAudioTraceCategories = categories;
  const selected = [...new Set([...categories, 'toplevel', '__metadata'])].join(',');
  const completed = new Promise(resolve => bundle.cdp.once('Tracing.tracingComplete', resolve));
  await bundle.cdp.send('Tracing.start', { categories: selected, transferMode: 'ReturnAsStream', options: 'record-continuously' });
  await sleep(WINDOW); await bundle.cdp.send('Tracing.end'); const { stream } = await completed;
  let data = ''; for (;;) { const part = await bundle.cdp.send('IO.read', { handle: stream }); data += part.base64Encoded ? Buffer.from(part.data, 'base64').toString() : part.data; if (part.eof) break; } await bundle.cdp.send('IO.close', { handle: stream });
  const file = name.replace(/[^a-z0-9-]+/gi, '-') + '.trace.json'; fs.writeFileSync(path.join(DIR, file), data);
  const budgetMs = await bundle.page.evaluate(() => (LoomApp.engine._processingFrames || 128) * 1000 / LoomApp.engine.context.sampleRate);
  const value = { name, file, categories: selected, bytes: data.length, ...analyzeTrace(JSON.parse(data).traceEvents, budgetMs) };
  (report.traces ||= []).push(value); save(); console.log('TRACE', name, JSON.stringify(value.audioRender));
}
async function hosted(bundle, system) {
  if (FILTER && !['eight-mixed-brine-prepared-visible', 'eight-mixed-brine-playing-visible', 'eight-mixed-brine-playing-hidden'].some(n => FILTER.test(n))) return;
  await loadFixture(bundle, 8, 'mixed');
  await bundle.page.evaluate(async () => {
    const state = LoomApp.getState(); state.tracks[8].instrumentLive = true; await LoomApp.loadState(state); await LoomApp.engine.play(0);
    const frame = document.createElement('iframe'); frame.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:99999;border:0;background:#222'; document.body.append(frame);
    const host = new LoomInstrumentHost({ context: () => LoomApp.engine.context, getTrackInput: () => LoomApp.engine.getTrackInput('track-9'), embedded: LoomEmbeddedInstruments });
    window.__qaHosted142 = { host, frame }; await host.load('qa-brine', { id: 'brine' }, frame); await host.command('qa-brine', 'prepare');
  });
  try {
    await measure(bundle, system, 'eight-mixed-brine-prepared-visible');
    await bundle.page.evaluate(async () => { const h = __qaHosted142; await h.host.command('qa-brine', 'start', { tempo: 120, when: LoomApp.engine.context.currentTime + .05 }); });
    await bundle.page.waitForFunction(() => __qaHosted142.frame.contentWindow.BrineApp.engine.isPlaying && LoomApp.engine.getMeters().tracks[8].peak > 1e-5);
    await measure(bundle, system, 'eight-mixed-brine-playing-visible');
    await bundle.page.evaluate(() => { __qaHosted142.frame.hidden = true; });
    await measure(bundle, system, 'eight-mixed-brine-playing-hidden');
  } finally { await bundle.page.evaluate(async () => { await __qaHosted142.host.dispose(); __qaHosted142.frame.remove(); delete window.__qaHosted142; }); }
}
async function regressionChecks(bundle, url) {
  const check = async (name, run) => { active = name; const value = await run(); (report.regressions ||= []).push({ name, value }); save(); console.log('PASS', name, JSON.stringify(value)); };
  await check('Only the visible selected owner insert supplies detailed meters', async () => {
    await loadFixture(bundle, 4, 'mixed');
    await bundle.page.evaluate(async () => { const s = LoomApp.getState(); s.tracks[0].output = 'bus-1'; s.buses[0].effects[0] = qa142.effect('velvet'); await LoomApp.loadState(s); await LoomApp.engine.play(0); });
    await bundle.page.evaluate(() => window.scrollTo(0, 0));
    await bundle.page.waitForFunction(() => LoomApp.engine._meterDetail === null && LoomApp.engine.getMeters().buses?.[0]?.peak > 1e-5);
    await bundle.page.evaluate(() => qa142.request('watchMeters')); await sleep(120);
    const cold = await bundle.page.evaluate(() => qa142.request('meters')); assert(cold.meterReads.length > 0); assert(cold.meterReads.every(row => row.reads === 0), 'Hidden rich meter getters stay cold');
    const selected = [];
    for (const owner of ['track-1', 'track-4', 'return-1', 'master', 'bus-1']) {
      await bundle.page.evaluate(owner => { LoomApp.selectEffect(0, owner); document.querySelector('#effectEditor').scrollIntoView({ block: 'start', behavior: 'instant' }); }, owner);
      await bundle.page.waitForFunction(owner => { const e = LoomApp.engine, m = e.getMeters(), all = [...(m.effects || []).flat(), ...(m.returnEffects || []).flat(), ...(m.busEffects || []).flat(), ...(m.masterEffects || [])].filter(Boolean); const actual = owner === 'master' ? m.masterEffects?.[0] : owner.startsWith('track-') ? m.effects?.[Number(owner.slice(6)) - 1]?.[0] : owner.startsWith('return-') ? m.returnEffects?.[Number(owner.slice(7)) - 1]?.[0] : m.busEffects?.[Number(owner.slice(4)) - 1]?.[0]; const expected = LoomSchema.automationOwner(LoomApp.getState(), owner).effects[0].type; return e._meterDetail?.ownerId === owner && e._meterDetail?.slot === 0 && all.length === 1 && actual?.type === expected; }, owner);
      const readsBefore = await bundle.page.evaluate(() => qa142.request('meters')); await sleep(120); const readsAfter = await bundle.page.evaluate(() => qa142.request('meters'));
      assert(readsAfter.meterReads.find(row => row.ownerId === owner && row.slot === 0).reads > readsBefore.meterReads.find(row => row.ownerId === owner && row.slot === 0).reads, owner + ' selected meter warms');
      for (const row of readsAfter.meterReads.filter(row => row.ownerId !== owner || row.slot !== 0)) assert.equal(row.reads, readsBefore.meterReads.find(old => old.ownerId === row.ownerId && old.slot === row.slot).reads, 'Only selected meter getter runs');
      selected.push(await bundle.page.evaluate(() => { const e = LoomApp.engine, m = e.getMeters(); return { detail: e._meterDetail, nonnull: [...m.effects.flat(), ...m.returnEffects.flat(), ...m.busEffects.flat(), ...m.masterEffects].filter(Boolean).map(x => x.type) }; }));
      selected.at(-1).getterReadsBefore = readsBefore.meterReads.find(row => row.ownerId === owner && row.slot === 0).reads; selected.at(-1).getterReadsAfter = readsAfter.meterReads.find(row => row.ownerId === owner && row.slot === 0).reads;
    }
    const cleared = async () => { await bundle.page.waitForFunction(() => { const e = LoomApp.engine, m = e.getMeters(); return e._meterDetail === null && [...(m.effects || []).flat(), ...(m.returnEffects || []).flat(), ...(m.busEffects || []).flat(), ...(m.masterEffects || [])].every(x => x === null); }); };
    await bundle.page.evaluate(() => window.scrollTo(0, 0)); await cleared();
    const closedBefore = await bundle.page.evaluate(() => qa142.request('meters')); await sleep(120); const closedAfter = await bundle.page.evaluate(() => qa142.request('meters')); assert.deepEqual(closedAfter.meterReads, closedBefore.meterReads, 'Hidden meters stop calling every rich getter');
    await bundle.page.evaluate(() => document.querySelector('#effectEditor').scrollIntoView({ block: 'start', behavior: 'instant' }));
    await bundle.page.waitForFunction(() => LoomApp.engine._meterDetail?.ownerId === 'bus-1');
    await bundle.page.evaluate(() => document.querySelector('#helpDialog').showModal()); await cleared();
    await bundle.page.evaluate(() => document.querySelector('#helpDialog').close()); await bundle.page.waitForFunction(() => LoomApp.engine._meterDetail?.ownerId === 'bus-1');
    await bundle.page.evaluate(() => LoomApp.service.open()); await cleared();
    await bundle.page.evaluate(async () => { LoomApp.service.close(); await LoomApp.engine.play(0); }); await bundle.page.waitForFunction(() => LoomApp.engine._meterDetail?.ownerId === 'bus-1');
    await bundle.page.evaluate(() => { window.__qaHidden142 = true; Object.defineProperty(document, 'hidden', { configurable: true, get: () => __qaHidden142 }); document.dispatchEvent(new Event('visibilitychange')); }); await cleared();
    await bundle.page.evaluate(() => { delete document.hidden; delete window.__qaHidden142; document.dispatchEvent(new Event('visibilitychange')); }); await bundle.page.waitForFunction(() => LoomApp.engine._meterDetail?.ownerId === 'bus-1');
    const immutable = await bundle.page.evaluate(async () => { const old = LoomApp.engine.getMeters(), before = JSON.stringify(old); await new Promise(resolve => setTimeout(resolve, 100)); return { unchanged: JSON.stringify(old) === before, running: LoomApp.engine.context.state, peak: LoomApp.engine.getMeters().master.peak }; });
    assert(immutable.unchanged); assert.equal(immutable.running, 'running'); assert(immutable.peak > 0); return { selected, hiddenColdAndSelectedWarm: true, hiddenModalServiceCleared: true, snapshotImmutable: immutable.unchanged };
  });
  await check('Sound-only fader, EQ and effect edits preserve the open piano canvas; note edits still work', async () => {
    await bundle.page.evaluate(async () => {
      LoomApp.engine.stop(); const s = qa142.fixture(2, 'mixed');
      const pattern = MusicLabPatternSchema.normalize({ format: 'musiclab-pattern', version: 1, name: 'Piano identity', sourceApp: 'brine', kind: 'notes', tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4], seed: 142, voices: [{ id: 'tone', name: 'Tone', pitch: 60 }], notes: [{ id: 'qa-note-a', voice: 'tone', pitch: 60, beat: 0, duration: .75, velocity: .8, probability: 1, accent: false, slide: false }] });
      s.tracks[0].clips.push(LoomSchema.noteClip({ id: 'qa-notes', name: 'Piano identity', type: 'notes', pattern, voiceMap: { tone: 'tone' }, start: 8, length: 4, sourceOffset: 0, rate: 1, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0, loop: false }));
      await LoomApp.loadState(s); LoomApp.selectClip('qa-notes'); LoomApp.noteWorkflow.piano.open(); LoomApp.selectEffect(0, 'track-1');
      window.__qaPiano142 = document.querySelector('.piano-canvas'); if (!__qaPiano142) throw Error('Piano roll did not open');
    });
    await bundle.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await bundle.page.evaluate(() => { window.__qaPiano142 = document.querySelector('.piano-canvas'); window.__qaPianoCalls142 = []; const editor = LoomApp.noteWorkflow.piano, nativeRender = editor.render; editor.render = function(...args) { __qaPianoCalls142.push(new Error().stack); return nativeRender.apply(this, args); }; });
    const edits = [];
    for (const [selector, value, type] of [['#level-0', '.41', 'range'], ['[data-eq-band="low"][data-track="0"]', null, 'knob'], ['#fx-threshold', '-23', 'range']]) {
      await bundle.page.evaluate(({ selector, value, type }) => { const input = document.querySelector(selector); if (!input) throw Error('Missing sound control ' + selector); if (type === 'knob') { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); input.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true })); } else { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); } }, { selector, value, type });
      const result = await bundle.page.evaluate(() => ({ preserved: __qaPiano142 === document.querySelector('.piano-canvas'), level: LoomApp.getState().tracks[0].level, eq: LoomApp.getState().tracks[0].eq.low, threshold: LoomApp.getState().tracks[0].effects[0].params.threshold, renders: __qaPianoCalls142.slice() })); assert(result.preserved, selector + ' ' + JSON.stringify(result.renders)); edits.push({ selector, ...result });
    }
    assert.equal(edits.at(-1).level, .41); assert.equal(edits.at(-1).threshold, -23); assert(edits.at(-1).eq > 1);
    await bundle.page.evaluate(() => LoomApp.engine.play(0)); await sleep(160); assert(await bundle.page.evaluate(() => __qaPiano142 === document.querySelector('.piano-canvas')), 'Play transport preserves piano DOM');
    await bundle.page.evaluate(() => LoomApp.engine.stop()); await sleep(160); assert(await bundle.page.evaluate(() => __qaPiano142 === document.querySelector('.piano-canvas')), 'Stop transport preserves piano DOM');
    const note = await bundle.page.evaluate(() => { const old = LoomApp.getState().tracks[0].clips.find(c => c.id === 'qa-notes').pattern.notes.length; document.querySelector('[data-piano-action="add"]').click(); const count = LoomApp.getState().tracks[0].clips.find(c => c.id === 'qa-notes').pattern.notes.length; return { old, count, drawn: document.querySelectorAll('[data-piano-note]').length }; }); assert.equal(note.count, note.old + 1); assert(note.drawn >= note.count); return { edits, playStopPreserved: true, note };
  });
  const cases = [{ count: 2, kind: 'clean' }, { count: 10, kind: 'clean' }, { count: 4, kind: 'mixed' }, { count: 10, kind: 'mixed', automation: true }, { count: 4, kind: 'cupboard4' }, { count: 4, kind: 'amps' }];
  await check('Actual production Worklet uses renderRealtime and preserves exact stereo PCM', async () => {
    const rows = await bundle.page.evaluate(async cases => {
      await LoomApp.loadState(qa142.fixture(2, 'clean')); await LoomApp.engine.init(); await LoomApp.engine.context.suspend();
      const source = await __qa142ProductionBlob.text(), Core = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP, createLoomCPUProfiler, createLoomTrackEQDSP, createLoomMasteringDSP).Core;
      if (!source.includes('this.core.renderRealtime(')) throw Error('Production Worklet has not adopted renderRealtime');
      const extension = '\nregisterProcessor("qa142-parity",class extends LoomProcessor{constructor(o){super(o);this.core=new DSP.Core(o.processorOptions.state,o.processorOptions.qaAssets,sampleRate,{linear:true,includeMetronome:true});this.core.start(0);}});';
      const rows = [], frames = 16384;
      for (const item of cases) {
        const state = qa142.fixture(item.count, item.kind, item.automation), assets = LoomSchema.decodeAssets(state.assets), core = new Core(state, assets, 48000, { linear: true, includeMetronome: true }), left = new Float32Array(frames), right = left.slice(); core.start(0);
        for (let at = 0; at < frames; at += 128) core.processBlock(left.subarray(at, at + 128), right.subarray(at, at + 128));
        const offline = new OfflineAudioContext(2, frames, 48000), moduleURL = URL.createObjectURL(new Blob([source, extension], { type: 'application/javascript' }));
        try { await offline.audioWorklet.addModule(moduleURL); } finally { URL.revokeObjectURL(moduleURL); }
        const node = new AudioWorkletNode(offline, 'qa142-parity', { ...__qa142ProductionOptions, processorOptions: { ...__qa142ProductionOptions.processorOptions, state, qaAssets: assets } }); node.connect(offline.destination);
        const rendered = await offline.startRendering(); let error = 0, peak = 0;
        for (let i = 0; i < frames; i++) for (let ch = 0; ch < 2; ch++) { const value = rendered.getChannelData(ch)[i]; if (!Number.isFinite(value)) throw Error('Non-finite production audio'); error = Math.max(error, Math.abs(value - (ch ? right : left)[i])); peak = Math.max(peak, Math.abs(value)); }
        rows.push({ ...item, error, peak, frames }); node.disconnect(); node.port.close();
      } return rows;
    }, cases);
    for (const row of rows) { assert.equal(row.error, 0); assert(row.peak > 0); } return rows;
  });
  const fallback = await openPage(url, false, true);
  try { await check('Actual ScriptProcessor renderRealtime callbacks preserve exact stereo PCM', async () => {
    const rows = await fallback.page.evaluate(async cases => {
      const Core = createLoomEngineDSP(createLoomEffectsDSP, createLoomLFODSP, createLoomCPUProfiler, createLoomTrackEQDSP, createLoomMasteringDSP).Core, Native = window.AudioContext, rows = [], frames = 16384;
      for (const item of cases) {
        const state = qa142.fixture(item.count, item.kind, item.automation), assets = LoomSchema.decodeAssets(state.assets), context = new Native({ sampleRate: 48000 }); await context.suspend(); const nativeResume = context.resume; context.resume = async () => {}; window.AudioContext = function() { return context; }; const engine = new LoomAudio(state); engine.setAssets(assets);
        try { await engine.init(); if (engine.mode !== 'fallback') throw Error('Expected ScriptProcessor fallback'); const nativeRender = engine.core.renderRealtime; if (typeof nativeRender !== 'function') throw Error('Missing realtime Core method'); let realtimeCalls = 0; engine.core.renderRealtime = function(...args) { realtimeCalls++; return nativeRender.apply(this, args); }; engine.core.start(0); const block = engine.node.bufferSize, core = new Core(state, assets, 48000, { linear: true, includeMetronome: true }), left = new Float32Array(frames), right = left.slice(), actualLeft = left.slice(), actualRight = left.slice(), zero = new Float32Array(block); core.start(0);
          for (let at = 0; at < frames; at += block) { core.processBlock(left.subarray(at, at + block), right.subarray(at, at + block)); engine.node.onaudioprocess({ playbackTime: at / 48000, inputBuffer: { length: block, getChannelData: () => zero }, outputBuffer: { length: block, getChannelData: channel => (channel ? actualRight : actualLeft).subarray(at, at + block) } }); }
          let error = 0, peak = 0; for (let i = 0; i < frames; i++) for (let ch = 0; ch < 2; ch++) { const value = (ch ? actualRight : actualLeft)[i]; if (!Number.isFinite(value)) throw Error('Non-finite fallback audio'); error = Math.max(error, Math.abs(value - (ch ? right : left)[i])); peak = Math.max(peak, Math.abs(value)); } if (realtimeCalls !== frames / block) throw Error('Fallback callback did not invoke renderRealtime: ' + realtimeCalls); rows.push({ ...item, mode: engine.mode, block, realtimeCalls, error, peak });
        } finally { window.AudioContext = Native; context.resume = nativeResume; await engine.dispose(); }
      } return rows;
    }, cases); for (const row of rows) { assert.equal(row.mode, 'fallback'); assert.equal(row.error, 0); assert(row.peak > 0); } return rows;
  }); } finally { await fallback.context.close(); }
}
async function main() {
  const html = fs.readFileSync(HTML); report.htmlSHA256 = createHash('sha256').update(html).digest('hex'); report.htmlBytes = html.length;
  server = http.createServer((request, response) => { if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; } response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }); response.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const url = 'http://127.0.0.1:' + server.address().port + '/loom/';
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  report.chromiumVersion = browser.version(); const system = await browser.newBrowserCDPSession();
  const bundle = await openPage(url);
  try {
    if (process.env.GALLEY_142_REGRESSION) { await regressionChecks(bundle, url); await bundle.page.evaluate(() => LoomApp.engine.dispose()); assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); save(); return; }
    for (const kind of ['clean', 'mixed']) for (const count of [2, 4, 8, 10]) { const name = count + '-' + kind + '-inspector-off'; if (FILTER && !FILTER.test(name)) continue; await loadFixture(bundle, count, kind); await measure(bundle, system, name, { count, fixture: kind }); }
    for (const kind of ['cupboard1', 'cupboard4', 'nonlinear', 'tape', 'reverb', 'amps']) { const name = '8-' + kind + '-inspector-off'; if (FILTER && !FILTER.test(name)) continue; await loadFixture(bundle, 8, kind); await measure(bundle, system, name, { count: 8, fixture: kind }); }
    if (!FILTER || ['8-mixed-wrapper-disabled', '8-mixed-wrapper-enabled', '8-mixed-editor-visible', '8-mixed-inspector-light', '8-mixed-inspector-deep', '8-mixed-inspector-closed-again'].some(n => FILTER.test(n))) {
      await loadFixture(bundle, 8, 'mixed'); await measure(bundle, system, '8-mixed-wrapper-disabled', { qa: false }); await measure(bundle, system, '8-mixed-wrapper-enabled');
      await view(bundle, 'editor'); await measure(bundle, system, '8-mixed-editor-visible');
      for (const mode of ['light', 'deep', 'closed-again']) { await view(bundle, mode); await measure(bundle, system, '8-mixed-inspector-' + mode); }
    }
    if (!FILTER || FILTER.test('10-mixed-automation-inspector-off')) { await loadFixture(bundle, 10, 'mixed', true); await measure(bundle, system, '10-mixed-automation-inspector-off'); }
    await hosted(bundle, system);
    if (process.env.GALLEY_142_TRACE && !TRACE_CASES) { await loadFixture(bundle, 8, 'mixed'); await sleep(WARMUP); await trace(bundle); }
    await bundle.page.evaluate(() => LoomApp.engine.dispose());
  } finally { await bundle.context.close(); }
  // A fresh production page without any Worklet injection is the overhead control.
  if (!FILTER || FILTER.test('8-mixed-unwrapped')) { const plain = await openPage(url, false); try { await loadFixture(plain, 8, 'mixed'); await measure(plain, system, '8-mixed-unwrapped', { qa: false }); await plain.page.evaluate(() => LoomApp.engine.dispose()); } finally { await plain.context.close(); } }
  assert.deepEqual(report.errors, []); assert.deepEqual(report.external, []); save(); console.log('COMPLETE', report.measurements.length, DIR);
}
if (require.main === module) main().catch(error => { report.failure = { active, stack: error.stack }; process.exitCode = 1; console.error(error); }).finally(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); save(); });

module.exports = { analyzeTrace, distribution, summarizeCallbacks };
