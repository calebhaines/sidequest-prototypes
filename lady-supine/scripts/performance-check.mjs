import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';

// Run this suite alone: competing browser suites make frame-rate comparisons meaningless.
// Headless Chromium uses this machine's graphics configuration; results are comparative,
// not a promise that every desktop or GPU will achieve the same frame rate.
const base = process.env.GAME_URL || 'http://localhost:5173';
const output = process.env.PERFORMANCE_REPORT || 'artifacts/desktop-performance.json';
const sampleMs = Number(process.env.SAMPLE_MS || 3000);
const warmupMs = Number(process.env.WARMUP_MS || 1200);
const views = [
  { id: 'desktop-1080p', width: 1920, height: 1080, dpr: 1 },
  { id: 'desktop-1080p-retina', width: 1920, height: 1080, dpr: 2 },
  { id: 'desktop-1440p-retina', width: 2560, height: 1440, dpr: 2 },
  { id: 'mobile', width: 390, height: 844, dpr: 3, mobile: true },
  { id: 'desktop-4k', width: 3840, height: 2160, dpr: 1 },
  { id: 'desktop-1080p-zoom1', width: 1920, height: 1080, dpr: 1, zoom: 1 },
  { id: 'desktop-1440p-zoom1', width: 2560, height: 1440, dpr: 1, zoom: 1 },
].filter(view => process.env.REFRESH_CHECK_ONLY ? false : process.env.PERFORMANCE_VIEWS ? process.env.PERFORMANCE_VIEWS.split(',').includes(view.id) : process.env.PERFORMANCE_VIEW ? view.id === process.env.PERFORMANCE_VIEW : process.env.PERFORMANCE_MATRIX === 'targeted' ? view.id.includes('zoom1') || view.id === 'desktop-4k' : !view.id.includes('zoom1') && view.id !== 'desktop-4k');
const scenes = (process.env.PERFORMANCE_SCENES || 'entrance,forest,lake,shanty').split(',');
const report = { method: 'One isolated headless Chromium, default full animations and particles, actual engine frames and canvas draws after warmup. CDP TaskDuration includes main-thread work; callback cost measures engine JavaScript and canvas submission, not GPU execution.', base, sampleMs, warmupMs, forceSmoothing: process.env.PERFORMANCE_SMOOTHING || null, forceEngineDpr: process.env.FORCE_ENGINE_DPR || null, results: [], regression: {} };
const rounded = value => Math.round(value * 100) / 100;
function distribution(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const percentile = fraction => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0;
  return { count: sorted.length, mean: rounded(values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)), p50: rounded(percentile(.5)), p95: rounded(percentile(.95)), max: rounded(sorted.at(-1) || 0) };
}

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  for (const view of views) {
    const context = await browser.newContext({ viewport: { width: view.width, height: view.height }, deviceScaleFactor: view.dpr, isMobile: Boolean(view.mobile), hasTouch: Boolean(view.mobile), reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.routeWebSocket('**', socket => socket.close());
    await page.addInitScript(({ smoothing, engineDpr }) => {
      if (engineDpr) Object.defineProperty(window, 'devicePixelRatio', { configurable: true, get: () => engineDpr });
      if (smoothing) {
        const descriptor = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'imageSmoothingQuality');
        Object.defineProperty(CanvasRenderingContext2D.prototype, 'imageSmoothingQuality', { ...descriptor, set(value) { descriptor.set.call(this, smoothing); } });
      }
      window.__qaPerf = { callbacks: [], draws: [], canvasCreates: [] };
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(timestamp => {
        const begin = performance.now();
        callback(timestamp);
        if (callback.name === 'frame') window.__qaPerf.callbacks.push({ timestamp, cost: performance.now() - begin });
      });
      const setTransform = CanvasRenderingContext2D.prototype.setTransform;
      CanvasRenderingContext2D.prototype.setTransform = function (...args) {
        if (this.canvas.classList?.contains('ow-canvas')) window.__qaPerf.draws.push(performance.now());
        return setTransform.apply(this, args);
      };
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (...args) {
        if (!this.isConnected) {
          const terrainSize = this.width === this.height && [138, 276, 414, 552].includes(this.width);
          window.__qaPerf.canvasCreates.push({ width: this.width, height: this.height, terrain: terrainSize && new Error().stack.includes('groundChunk') });
        }
        return getContext.apply(this, args);
      };
    }, { smoothing: process.env.PERFORMANCE_SMOOTHING || null, engineDpr: Number(process.env.FORCE_ENGINE_DPR || 0) });
    await page.goto(base);
    await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
    await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
    await page.waitForFunction(() => !window.__ladySupine.getWorld().paused);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    for (const scene of scenes) {
      const geometry = await page.evaluate(({ scene, zoom }) => {
        window.__qaPerf.callbacks = []; window.__qaPerf.draws = []; window.__qaPerf.canvasCreates = [];
        const game = window.__ladySupine, data = game.getData(), region = data.regions.find(region => region.id === scene);
        const engine = game.getEngine();
        engine.setFlags(['gate_open', 'reservoir_open']);
        engine.teleport('overworld', region.landmark);
        const save = engine.getSave();
        engine.load({ ...save, elapsed: 120, dayTime: .3, options: { ...save.options, zoom, reducedMotion: false, particles: true } });
        const canvas = document.querySelector('.ow-canvas'), bounds = canvas.getBoundingClientRect();
        const hw = bounds.width / (32 * zoom) / 2 + 2, hh = bounds.height / (32 * zoom) / 2 + 2;
        const visible = data.overworld.objects.filter(object => Math.abs(object.x - region.landmark.x) < hw + (object.width || 1) + 2 && Math.abs(object.y - region.landmark.y) < hh + (object.height || 1) + 4);
        return { cssWidth: bounds.width, cssHeight: bounds.height, devicePixelRatio, pixelWidth: canvas.width, pixelHeight: canvas.height, pixels: canvas.width * canvas.height, nearbyObjects: visible.length, nearbyTrees: visible.filter(object => object.kind === 'tree' || object.kind === 'willow').length, options: engine.getSave().options };
      }, { scene, zoom: view.zoom || 1.5 });
      assert.equal(geometry.options.reducedMotion, false, 'Performance must be measured with animations enabled');
      assert.equal(geometry.options.particles, true, 'Performance must be measured with particles enabled');
      if (process.env.ASSERT_PIXEL_BUDGET) {
        assert.ok(geometry.pixels <= 2550000, 'Large desktop displays must have a bounded canvas workload');
        if (view.id === 'mobile') assert.equal(geometry.pixels, 390 * 844 * 4, 'Small mobile screens must retain their existing 2× resolution');
      }
      await page.waitForTimeout(warmupMs);
      const cold = await page.evaluate(() => ({ callbacks: window.__qaPerf.callbacks.slice(0, 5), canvasCreates: window.__qaPerf.canvasCreates.slice() }));
      await page.evaluate(() => { window.__qaPerf.callbacks = []; window.__qaPerf.draws = []; window.__qaPerf.canvasCreates = []; });
      const metricsBefore = (await cdp.send('Performance.getMetrics')).metrics;
      const started = await page.evaluate(() => performance.now());
      await page.waitForTimeout(sampleMs);
      const metricsAfter = (await cdp.send('Performance.getMetrics')).metrics;
      const sample = await page.evaluate(started => ({ ...window.__qaPerf, elapsed: performance.now() - started }), started);
      assert.ok(sample.callbacks.length > 1, 'The DEV engine RAF callback must be instrumented');
      assert.ok(sample.draws.length > 1, 'The world must actually render');
      const deltas = {};
      for (const metric of ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration']) deltas[metric] = rounded(((metricsAfter.find(entry => entry.name === metric)?.value || 0) - (metricsBefore.find(entry => entry.name === metric)?.value || 0)) * 1000);
      const result = { viewport: view.id, scene, geometry, actualDrawFps: rounded(sample.draws.length * 1000 / sample.elapsed), engineCallbackFps: rounded(sample.callbacks.length * 1000 / sample.elapsed), engineCallbackMs: distribution(sample.callbacks.map(frame => frame.cost)), engineFrameIntervalMs: distribution(sample.callbacks.slice(1).map((frame, i) => frame.timestamp - sample.callbacks[i].timestamp)), drawIntervalMs: distribution(sample.draws.slice(1).map((time, i) => time - sample.draws[i])), mainThreadMs: deltas, coldFirstFramesMs: distribution(cold.callbacks.map(frame => frame.cost)), warmupCanvasCreates: cold.canvasCreates.length, warmCanvasCreates: sample.canvasCreates.length, warmTerrainCanvasCreates: sample.canvasCreates.filter(canvas => canvas.terrain).length };
      if (process.env.ASSERT_TERRAIN_REUSE) assert.equal(result.warmTerrainCanvasCreates, 0, `${view.id}/${scene}: a stationary view must reuse terrain instead of repainting it every frame`);
      report.results.push(result);
      console.log(JSON.stringify(result));
    }
    // A performance fix must retain real movement, time accounting, save data and animated scenery.
    await page.evaluate(() => {
      const engine = window.__ladySupine.getEngine(); engine.teleport('overworld', { x: 45, y: 106 });
      engine.setFlags(['gate_open', 'reservoir_open']);
    });
    const before = await page.evaluate(() => ({ world: window.__ladySupine.getWorld(), story: window.__ladySupine.getStory() }));
    if (view.mobile) await page.evaluate(() => window.__ladySupine.getEngine().setTouchDirection({ x: 0, y: -1 }));
    else await page.keyboard.down('w');
    await page.waitForFunction(elapsed => window.__ladySupine.getWorld().elapsed - elapsed >= .5, before.world.elapsed);
    if (view.mobile) await page.evaluate(() => window.__ladySupine.getEngine().setTouchDirection({ x: 0, y: 0 }));
    else await page.keyboard.up('w');
    const after = await page.evaluate(() => ({ world: window.__ladySupine.getWorld(), story: window.__ladySupine.getStory() }));
    const distance = Math.hypot(after.world.player.x - before.world.player.x, after.world.player.y - before.world.player.y);
    assert.ok(distance > .5, 'Input must still move the player freely');
    assert.ok(after.world.elapsed > before.world.elapsed, 'The simulation must advance while playing');
    const beforePause = await page.evaluate(() => { const engine = window.__ladySupine.getEngine(); engine.setPaused(true); return { world: engine.getSave(), story: window.__ladySupine.getStory() }; });
    await page.waitForTimeout(1200); // Let the camera settle before testing a static menu background.
    const pausedDrawStart = await page.evaluate(() => window.__qaPerf.draws.length);
    await page.waitForTimeout(350);
    const afterPause = await page.evaluate(() => ({ world: window.__ladySupine.getWorld(), story: window.__ladySupine.getStory() }));
    assert.equal(afterPause.world.elapsed, beforePause.world.elapsed, 'Menus must retain a paused simulation');
    assert.equal(afterPause.story.time, beforePause.story.time, 'Menus must retain paused borrowed time');
    let pausedRendering = null;
    if (process.env.ASSERT_STATIC_PAUSE) {
      const pausedDrawEnd = await page.evaluate(() => window.__qaPerf.draws.length);
      assert.equal(pausedDrawEnd, pausedDrawStart, 'A settled paused view must not keep repainting');
      const optionBefore = await page.evaluate(() => ({ draws: window.__qaPerf.draws.length, zoom: window.__ladySupine.getWorld().options.zoom }));
      await page.evaluate(zoom => window.__ladySupine.getEngine().setOptions({ zoom: zoom + .1 }), optionBefore.zoom);
      await page.waitForTimeout(120);
      const optionAfter = await page.evaluate(() => ({ draws: window.__qaPerf.draws.length, zoom: window.__ladySupine.getWorld().options.zoom }));
      assert.ok(optionAfter.draws > optionBefore.draws, 'Changing zoom while paused must visibly redraw the canvas');
      assert.ok(optionAfter.zoom > optionBefore.zoom, 'Paused settings changes must apply');
      await page.evaluate(zoom => window.__ladySupine.getEngine().setOptions({ zoom }), optionBefore.zoom);
      await page.waitForTimeout(120);
      const resizeBefore = await page.evaluate(() => ({ draws: window.__qaPerf.draws.length, width: document.querySelector('.ow-canvas').width, height: document.querySelector('.ow-canvas').height }));
      await page.setViewportSize({ width: view.width - 16, height: view.height - 16 });
      await page.waitForTimeout(150);
      const resizeAfter = await page.evaluate(() => ({ draws: window.__qaPerf.draws.length, width: document.querySelector('.ow-canvas').width, height: document.querySelector('.ow-canvas').height }));
      assert.ok(resizeAfter.draws > resizeBefore.draws, 'Resizing while paused must redraw the canvas');
      assert.ok(resizeAfter.width !== resizeBefore.width || resizeAfter.height !== resizeBefore.height, 'The paused canvas must fit the resized viewport');
      await page.setViewportSize({ width: view.width, height: view.height });
      await page.waitForTimeout(150);
      let sameAspectResizeRedraw = null;
      if (view.width >= 1920) {
        const resizeStart = await page.evaluate(() => ({ draws: window.__qaPerf.draws.length, width: document.querySelector('.ow-canvas').width, height: document.querySelector('.ow-canvas').height }));
        const alternateWidth = view.width >= 3840 ? 2560 : 3840;
        await page.setViewportSize({ width: alternateWidth, height: Math.round(alternateWidth * view.height / view.width) });
        await page.waitForTimeout(180);
        const resizeEnd = await page.evaluate(() => ({ draws: window.__qaPerf.draws.length, width: document.querySelector('.ow-canvas').width, height: document.querySelector('.ow-canvas').height }));
        assert.ok(resizeEnd.draws > resizeStart.draws, 'A CSS viewport change must redraw even when the pixel budget keeps backing dimensions identical');
        sameAspectResizeRedraw = { backingDimensionsUnchanged: resizeStart.width === resizeEnd.width && resizeStart.height === resizeEnd.height, redraw: true };
        await page.setViewportSize({ width: view.width, height: view.height });
        await page.waitForTimeout(150);
      }
      pausedRendering = { settledDraws: pausedDrawEnd - pausedDrawStart, optionsRedraw: true, resizeRedraw: true, sameAspectResizeRedraw };
    }
    const roundtrip = await page.evaluate(() => { const engine = window.__ladySupine.getEngine(), save = engine.getSave(); engine.load(JSON.parse(JSON.stringify(save))); return { before: save, after: engine.getSave() }; });
    assert.deepEqual(roundtrip.after.inventory, roundtrip.before.inventory, 'Save loading must retain inventory');
    assert.equal(roundtrip.after.player.x, roundtrip.before.player.x, 'Save loading must retain the player position');
    assert.deepEqual(roundtrip.after.options, roundtrip.before.options, 'Full animation settings must survive save loading');
    const scenery = await page.evaluate(async () => {
      const { renderWorld } = await import('/src/openworld/renderer.ts');
      const data = window.__ladySupine.getData(), save = window.__ladySupine.getEngine().getSave();
      const tree = data.overworld.objects.find(object => object.kind === 'willow' && object.x > 53 && object.x < 103) || data.overworld.objects.find(object => object.kind === 'tree');
      const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 240;
      const ctx = canvas.getContext('2d');
      // Hide actors, weather and other time-dependent scenery: the selected tree must
      // itself animate, rather than merely share a canvas with a blinking player.
      const frame = { scene: { ...data.overworld, outdoors: false }, data, player: { ...save.player, x: tree.x + 100, y: tree.y + 100 }, actors: [], objects: [tree], harvested: {}, particles: [], floating: [], camera: { x: tree.x, y: tree.y - 1.2 }, zoom: 1.5, time: .7, dayTime: .3, flags: [], selected: '', nearby: null, fishing: null, waypoint: null, reducedMotion: false, particlesEnabled: false, impacts: [] };
      const hash = () => {
        let value = 2166136261;
        for (const byte of ctx.getImageData(0, 0, canvas.width, canvas.height).data) value = Math.imul(value ^ byte, 16777619);
        return value >>> 0;
      };
      renderWorld(ctx, frame, canvas.width, canvas.height); const animatedBefore = hash();
      renderWorld(ctx, { ...frame, time: 2.8 }, canvas.width, canvas.height); const animatedAfter = hash();
      renderWorld(ctx, { ...frame, reducedMotion: true }, canvas.width, canvas.height); const reducedBefore = hash();
      renderWorld(ctx, { ...frame, time: 2.8, reducedMotion: true }, canvas.width, canvas.height); const reducedAfter = hash();
      return { treeMoves: animatedBefore !== animatedAfter, reducedMotionRemainsStill: reducedBefore === reducedAfter };
    });
    assert.ok(scenery.treeMoves, 'Tree animation must remain visibly dynamic after optimization');
    assert.ok(scenery.reducedMotionRemainsStill, 'Reduced motion must still make scenery still');
    assert.deepEqual(errors, [], 'There must be no browser errors');
    report.regression[view.id] = { playerMovedTiles: rounded(distance), simulatedSeconds: rounded(after.world.elapsed - before.world.elapsed), menusPauseSimulationAndBorrowedTime: true, pausedRendering, saveRoundtrip: true, scenery, browserErrors: errors };
    await context.close();
  }
  if (process.env.REFRESH_CHECK || process.env.REFRESH_CHECK_ONLY) {
    const context = await browser.newContext({ viewport: { width: 640, height: 360 } });
    const page = await context.newPage();
    await page.routeWebSocket('**', socket => socket.close());
    await page.goto(base);
    await page.waitForFunction(() => Boolean(window.__ladySupine?.getEngine()));
    report.refreshRates = await page.evaluate(async () => {
      window.__ladySupine.getEngine().destroy();
      const { createEngine } = await import('/src/openworld/engine.ts');
      const originalRaf = window.requestAnimationFrame, originalCancel = window.cancelAnimationFrame;
      const results = [];
      try {
        for (const { hz, jitterMs } of [59.94, 60, 120, 144, 240].flatMap(hz => [{ hz, jitterMs: 0 }, { hz, jitterMs: .75 }])) {
          let pending = null, draws = 0, borrowed = 0;
          window.requestAnimationFrame = callback => { pending = callback; return 1; };
          window.cancelAnimationFrame = () => { pending = null; };
          const canvas = document.createElement('canvas'); canvas.style.width = '640px'; canvas.style.height = '360px';
          document.body.replaceChildren(canvas);
          const ctx = canvas.getContext('2d'), transform = ctx.setTransform.bind(ctx);
          ctx.setTransform = (...args) => { draws++; return transform(...args); };
          // An empty, walkable field isolates clock and movement from collisions and story dialogs.
          const scene = { id: 'clock-field', name: 'Clock field', location: 'clock-field', width: 80, height: 80, tiles: Array(6400).fill('grass'), objects: [], actors: [], spawn: { x: 40, y: 40 }, outdoors: true };
          const region = { id: 'clock-field', name: 'Clock field', subtitle: '', x: 0, y: 0, width: 80, height: 80, color: '#8e9b71', landmark: scene.spawn };
          const data = { seed: 914729, overworld: scene, interiors: {}, regions: [region] };
          const engine = createEngine(canvas, data, { onInteract() {}, onNotify() {}, onTimeChange(seconds) { borrowed += seconds; }, onArea() {}, onRecovery() {}, onSound() {} });
          engine.setTouchDirection({ x: 0, y: -1 }); engine.start();
          const ticks = Math.round(hz * 3.2), duration = ticks / hz;
          for (let tick = 0; tick <= ticks; tick++) {
            const callback = pending; pending = null;
            if (!callback) throw new Error('The engine stopped scheduling animation frames');
            const jitter = tick === 0 || tick === ticks ? 0 : Math.sin(tick * 2.399963229728653) * jitterMs;
            callback(100 + tick * 1000 / hz + jitter);
          }
          const snapshot = engine.getSnapshot();
          results.push({ hz, jitterMs, elapsed: snapshot.elapsed, movedTiles: 40 - snapshot.player.y, animationPhase: snapshot.player.animation, borrowedTimeChange: borrowed, draws, duration });
          engine.destroy();
        }
      } finally { window.requestAnimationFrame = originalRaf; window.cancelAnimationFrame = originalCancel; }
      return results;
    });
    for (const result of report.refreshRates) {
      assert.ok(Math.abs(result.elapsed - result.duration) < .001, `${result.hz}Hz: simulation time must follow actual elapsed time`);
      assert.ok(Math.abs(result.movedTiles - 3.3 * result.duration) < .001, `${result.hz}Hz: movement speed must be independent of monitor refresh rate`);
      assert.ok(Math.abs(result.animationPhase - result.duration) < .001, `${result.hz}Hz: animation phase must follow simulation time`);
      assert.equal(result.borrowedTimeChange, -1, `${result.hz}Hz: borrowed-time debt must be independent of monitor refresh rate`);
      if (process.env.ASSERT_DRAW_CAP) {
        assert.ok(result.draws <= Math.ceil(result.duration * 60) + 3, `${result.hz}Hz/${result.jitterMs}ms jitter: painting must remain bounded on high-refresh monitors`);
        assert.ok(result.draws >= Math.floor(result.duration * 59) - 1, `${result.hz}Hz/${result.jitterMs}ms jitter: timestamp rounding must not unnecessarily skip ordinary display refreshes`);
      }
    }
    await context.close();
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Saved ${output}`);
} finally { await browser.close(); }
