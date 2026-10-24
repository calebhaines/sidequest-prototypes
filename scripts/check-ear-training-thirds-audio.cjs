// Measure rendered samples, rather than trusting MIDI labels or oscillator parameters.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const baseURL = process.env.OVERTONE_QA_URL || 'http://127.0.0.1:8765/ear-training/';

(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium', args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.goto(baseURL);
    const result = await page.evaluate(async () => {
      const { AudioEngine } = await import('./audio.js');
      const { generateQuestion, LEVEL_CONFIGS, INTERVALS } = await import('./music.js');
      const rate = 44100;
      const hz = midi => 440 * 2 ** ((midi - 69) / 12);

      async function offlineEngine(seconds, timbre) {
        const context = new OfflineAudioContext(1, Math.ceil(seconds * rate), rate);
        const engine = new AudioEngine();
        const original = globalThis.AudioContext;
        // Exercise the real graph setup, including its compressor. An offline
        // context cannot be resumed, so expose running only during that setup.
        Object.defineProperty(context, 'state', {configurable:true, value:'running'});
        globalThis.AudioContext = function () { return context; };
        try { await engine.ensure(); }
        finally { globalThis.AudioContext = original; delete context.state; }
        engine.ensure = async () => context;
        engine.timbre = timbre;
        return {context, engine};
      }

      function power(data, frequency) {
        const step = 2 * Math.PI * frequency / rate;
        const cosine = Math.cos(step), sine = Math.sin(step);
        let c = 1, s = 0, real = 0, imaginary = 0;
        for (const sample of data) {
          real += sample * c; imaginary += sample * s;
          const next = c * cosine - s * sine;
          s = s * cosine + c * sine; c = next;
        }
        return real * real + imaginary * imaginary;
      }
      function windowed(samples, from, to) {
        const first = Math.round(from * rate), size = Math.round(to * rate) - first;
        return Float64Array.from({length:size}, (_, i) => samples[first + i] * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1))));
      }
      function fundamental(samples, from, to, expected) {
        const data = windowed(samples, from, to);
        const at = cents => power(data, expected * 2 ** (cents / 1200));
        // The independent search is wide enough to catch a semitone mix-up.
        let center = 0, best = -1;
        for (let cents = -150; cents <= 150; cents += 15) {
          const strength = at(cents);
          if (strength > best) { center = cents; best = strength; }
        }
        let left = center - 15, right = center + 15;
        for (let i = 0; i < 23; i++) {
          const a = left + (right - left) / 3, b = right - (right - left) / 3;
          if (at(a) < at(b)) left = a; else right = b;
        }
        return expected * 2 ** (((left + right) / 2) / 1200);
      }
      function rms(samples, from, to) {
        const start = Math.round(from * rate), end = Math.round(to * rate);
        let sum = 0;
        for (let i = start; i < end; i++) sum += samples[i] ** 2;
        return Math.sqrt(sum / (end - start));
      }

      function question(root, semitones, direction) {
        const index = root === 60 ? 6 : 7;
        const config = LEVEL_CONFIGS.intervals[index];
        const pool = INTERVALS.filter(interval => config.pool.includes(interval.value));
        const expected = semitones === 3 ? 'm3' : 'M3';
        const values = [
          (pool.findIndex(interval => interval.value === expected) + .5) / pool.length,
          (config.directions.indexOf(direction) + .5) / config.directions.length,
          (root - config.rootMin + .5) / (config.rootMax - config.rootMin + 1),
        ];
        const q = generateQuestion('intervals', `level-${index + 1}`, () => values.shift());
        if (q.answer !== expected || !q.context.includes(direction)) throw new Error('Could not construct the requested third.');
        return q;
      }

      const cases = [];
      for (const timbre of ['warm','sine','piano']) {
        for (const root of [48,49,60,72]) {
          for (const semitones of [3,4]) {
            for (const direction of root === 60 ? ['ascending','descending','simultaneous'] : ['simultaneous']) {
              const q = question(root, semitones, direction);
              const duration = Math.max(...q.events.map(event => event.at + event.duration)) + .3;
              const {context, engine} = await offlineEngine(duration, timbre);
              const playback = engine.play(q.events);
              await Promise.resolve();
              const output = await context.startRendering();
              engine.stop(); await playback;
              const samples = output.getChannelData(0);
              const second = root + (direction === 'descending' ? -semitones : semitones);
              const offset = direction === 'simultaneous' ? 0 : q.events[1].at;
              const firstHz = fundamental(samples, .16, .46, hz(root));
              const secondHz = fundamental(samples, offset + .16, offset + .46, hz(second));
              const cents = 1200 * Math.log2(secondHz / firstHz);
              let maximum = 0;
              for (const sample of samples) maximum = Math.max(maximum, Math.abs(sample));
              cases.push({timbre,root,semitones,direction,cents,error:cents - (direction === 'descending' ? -1 : 1) * semitones * 100,maximum});
            }
          }
        }
      }

      const replay = [];
      for (const timbre of ['warm','sine','piano']) {
        const {context, engine} = await offlineEngine(2, timbre);
        const old = engine.play([{at:0,duration:.45,notes:[72]},{at:.6,duration:.45,notes:[76]}]);
        await Promise.resolve();
        const paused = context.suspend(.2), rendering = context.startRendering();
        await paused;
        const stoppedAt = context.currentTime;
        engine.stop();
        const cancelled = (await old).cancelled;
        const fresh = engine.play([{at:0,duration:.45,notes:[60]},{at:.6,duration:.45,notes:[63]}]);
        await Promise.resolve(); await context.resume();
        const output = await rendering;
        engine.stop(); await fresh;
        const samples = output.getChannelData(0), start = stoppedAt + .06;
        const first = fundamental(samples, start + .1, start + .4, hz(60));
        const second = fundamental(samples, start + .7, start + 1, hz(63));
        const data = windowed(samples, start + .7, start + 1);
        const staleRatio = Math.sqrt(power(data, hz(76)) / power(data, hz(63)));
        replay.push({timbre,cancelled,cents:1200 * Math.log2(second / first),quiet:rms(samples, stoppedAt + .035, stoppedAt + .055),staleRatio});
      }
      return {cases,replay};
    });
    for (const item of result.cases) {
      const label = `${item.timbre}, MIDI ${item.root}, ${item.semitones} semitones, ${item.direction}`;
      assert.ok(Math.abs(item.error) < .75, `${label}: rendered ${item.cents.toFixed(3)} cents`);
      assert.ok(item.maximum > .01 && item.maximum < .98, `${label}: missing or clipped output (${item.maximum})`);
    }
    for (const item of result.replay) {
      assert.equal(item.cancelled, true, `${item.timbre}: interrupted playback must settle as cancelled`);
      assert.ok(Math.abs(item.cents - 300) < .75, `${item.timbre}: replayed minor third measured ${item.cents} cents`);
      assert.ok(item.quiet < 1e-6, `${item.timbre}: previous note persisted beyond its cancellation fade`);
      assert.ok(item.staleRatio < .001, `${item.timbre}: cancelled queued major-third note leaked into replay`);
    }
    const worst = Math.max(...result.cases.map(item => Math.abs(item.error)));
    console.log(`PASS: ${result.cases.length} rendered minor/major thirds, three timbres and directions, low/high registers; maximum error ${worst.toFixed(3)} cents; no clipping.`);
    console.log('PASS: stopping an active note cancels its queued partner; replay renders a clean minor third in all three timbres.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
