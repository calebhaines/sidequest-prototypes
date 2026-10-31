'use strict';
// Message traffic must follow sound changes, not percussion strike count.
// The comparison bank uses the released setVoice delivery method so the
// optimized bank is checked against the same real serialized DSP and clocks.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const directory = fs.existsSync(path.join(__dirname, 'galley-effects', 'effects.js')) ? path.join(__dirname, 'galley-effects') : path.join(__dirname, '..', 'loom');
const files = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'lofi-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'lofi-dsp.js', 'effects.js'];
const sources = files.map(file => [file, fs.readFileSync(path.join(directory, file), 'utf8')]);
const current = fs.readFileSync(path.join(__dirname, 'voice-effects.js'), 'utf8');
const originalMethod = `      setVoice(index, value) { check(index); const next = normalizeSlots(value), prior = hasEffects(slots[index]); slots[index] = next; const rack = racks[index] || (hasEffects(next) ? makeRack(index) : null); if (rack) { if (rack.mode === 'worklet') rack.node.port.postMessage({ type: 'slots', slots: next }); else rack.core.setSlots(next); if (prior !== hasEffects(next)) reroute(index); } },`;
const method = /      setVoice\(index, value\) \{[\s\S]*?\n      input\(index\)/;
assert(method.test(current), 'Locate the actual bank method for released-delivery comparison.');
const released = current.replace(method, originalMethod + '\n      input(index)')
  .replace('this.clocks=[];this.disposed=false;this.offlineId=', 'this.clocks=[];this.count=0;this.disposed=false;this.offlineId=')
  .replace('          return true;\n        }\n      }\n      registerProcessor', "          if(++this.count>=16){this.count=0;this.port.postMessage({type:'meters',value:this.core.getMeters()});}return true;\n        }\n      }\n      registerProcessor")
  .replace('        };\n      }\n      if (rack.offlineId)', '          rack.meters = rack.core.getMeters();\n        };\n      }\n      if (rack.offlineId)');
const clone = value => JSON.parse(JSON.stringify(value));
let passed = 0;

class Param {
  constructor(value = 1) { this.value = value; this.events = []; }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.value = value; this.events.push(['ramp', value, time]); }
}
class Node {
  constructor(context) { this.context = context; this.gain = new Param(); this.connections = new Set(); }
  connect(node) { this.connections.add(node); return node; }
  disconnect(node) { if (node) this.connections.delete(node); else this.connections.clear(); }
}
function fixture(code = current, mode = 'worklet') {
  let Processor, worker, meterReads = 0;
  const nodes = [], context = { sampleRate: 48000, currentTime: 0, createGain() { return new Node(context); } };
  const scope = { console, Blob, URL, fetch, DOMException, Math, Number, Object, JSON, Array, Map, Set, WeakMap, Float32Array, Float64Array, Int32Array, Uint8Array };
  scope.window = scope;
  scope.AudioWorkletNode = class extends Node {
    constructor(context, name, options) {
      super(context); this.processor = new Processor(options); this.messages = []; this.responses = []; this.reports = []; this.closed = false;
      this.port = { postMessage: message => { if (this.closed) return; const copy = clone(message); this.messages.push(copy); this.processor.port.onmessage?.({ data: copy }); }, close: () => { this.closed = true; }, onmessage: null };
      this.processor.port.postMessage = message => { const copy = clone(message); this.responses.push(copy); this.reports.push(copy); };
      nodes.push(this);
    }
    flushResponses() { for (const message of this.responses.splice(0)) this.port.onmessage?.({ data: message }); }
  };
  if (mode === 'worklet') context.audioWorklet = { async addModule(url) {
    const source = await (await fetch(url)).text();
    worker ||= vm.createContext({ sampleRate: 48000, currentFrame: 0, Math, Number, Object, JSON, Array, Map, Set, Float32Array, Float64Array, Int32Array, Uint8Array,
      AudioWorkletProcessor: class { constructor() { this.port = { onmessage: null, postMessage() {} }; } },
      registerProcessor(name, value) { Processor = value; }
    });
    vm.runInContext(source, worker);
  } };
  if (mode === 'script') context.createScriptProcessor = frames => {
    const node = new Node(context); node.bufferSize = frames; node.onaudioprocess = null; nodes.push(node); return node;
  };
  if (mode === 'offline-unavailable') context.startRendering = () => Promise.resolve();
  vm.createContext(scope);
  for (const [file, source] of sources) vm.runInContext(source, scope, { filename: file });
  vm.runInContext(code, scope, { filename: 'voice-effects.js' });
  if (mode === 'script') {
    const originalFactory = scope.createLoomEffectsDSP;
    scope.createLoomEffectsDSP = (...args) => {
      const effects = originalFactory(...args), create = effects.create;
      effects.create = (...args) => {
        const processor = create(...args), getMeters = processor.getMeters;
        if (getMeters) processor.getMeters = () => { meterReads++; return getMeters(); };
        return processor;
      };
      return effects;
    };
  }
  const api = scope.KitchenVoiceEffects;
  return { api, context, nodes, get meterReads() { return meterReads; }, frame(value) { context.currentTime = value / context.sampleRate; if (worker) worker.currentFrame = value; },
    effect(type, params = {}) { return { type, params: { ...clone(api.defaults(type)), ...params } }; },
    async bank(count = 2) { await api.prepare(context); return api.createBank(context, new Node(context), { voiceCount: count, tempo: 120 }); }
  };
}
async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }

async function renderBank(code, mode, observeMeters = false) {
  const f = fixture(code, mode), bank = await f.bank(1), frames = 16384, block = mode === 'script' ? 256 : 128;
  let patch = [f.effect('parallax', { clock: 'free', time: 23, feedback: .7, mix: .75, spread: .3 }), f.effect('cinder', { shape: 'led', drive: 12, output: -9, mix: .4 })];
  bank.setVoice(0, patch); const node = bank.input(0);
  bank.setClock({ tempo: 120, beat: 0, time: 0, playing: true });
  bank.setClock({ tempo: 138, beat: .75, time: 2400 / 48000, playing: true });
  bank.reset(0, 5001 / 48000);
  const left = new Float32Array(frames), right = new Float32Array(frames);
  for (let at = 0; at < frames; at += block) {
    f.frame(at);
    if (at === 1024) patch[0].params.feedback = .51;
    if (at === 3072) patch = [patch[1], patch[0]];
    if (at === 4096) patch[0].params.bypass = true;
    if (at === 6144) patch = [null, patch[1]];
    if (at === 8192) patch = [null, null];
    if (at === 10240) patch = [f.effect('velvet', { bandMode: 'multiband', model: 'bus-4k', colour: .1, makeup: 0 }), f.effect('cinder', { shape: 'sinefold', drive: 14, output: -9, mix: .35 })];
    bank.setVoice(0, patch);
    if (observeMeters) { bank.getMeters(0); node.flushResponses?.(); }
    if (at === 7168) { bank.setAudible(0, false); bank.setAudible(0, true); }
    const input = [0, 1].map(channel => Float32Array.from({ length: block }, (_, i) => {
      const sample = at + i; return sample < 9000 ? .06 * Math.sin(sample * (channel ? .031 : .017)) + .013 * Math.cos(sample * (channel ? .053 : .079)) : 0;
    }));
    const output = [left.subarray(at, at + block), right.subarray(at, at + block)];
    if (mode === 'script') node.onaudioprocess({ playbackTime: at / 48000, inputBuffer: { numberOfChannels: 2, getChannelData: index => input[index] }, outputBuffer: { numberOfChannels: 2, getChannelData: index => output[index] } });
    else node.processor.process([input], [output]);
  }
  const sent = node.messages?.filter(message => message.type === 'slots').length;
  const controls = mode === 'worklet' ? node.messages.filter(message => message.type !== 'slots') : null;
  const gate = [...node.connections][0].gain.events;
  const reports = node.reports?.length;
  bank.dispose(); return { left, right, sent, controls, gate, reports, meterReads: f.meterReads };
}

async function runSourceChecks() {
  await check('Repeated strikes send one patch while changed values, mutable callers and independent voices remain visible', async () => {
    const f = fixture(), bank = await f.bank(), patch = [f.effect('velvet', { bandMode: 'multiband' }), null];
    bank.setVoice(0, patch); const node = bank.input(0);
    const count = () => node.messages.filter(message => message.type === 'slots').length;
    assert.equal(count(), 1);
    for (let i = 0; i < 128; i++) bank.setVoice(0, i % 2 ? clone(patch) : patch);
    assert.equal(count(), 1, 'Unchanged strikes must not wake the audio thread with another full patch.');
    patch[0].params.lowThreshold = -37; bank.setVoice(0, patch); assert.equal(count(), 2);
    patch[0].params.lowThreshold = -24; assert.equal(node.messages.at(-1).slots[0].params.lowThreshold, -37, 'Caller edits cannot mutate a delivered patch.');
    bank.setVoice(0, patch); assert.equal(count(), 3);
    bank.setVoice(1, patch); assert.equal(bank.input(1).messages.filter(message => message.type === 'slots').length, 1, 'Voices do not share a cache.');
    patch[0].params.bypass = true; bank.setVoice(0, patch); assert.equal(count(), 4);
    bank.setVoice(0, [null, null]); bank.setVoice(0, [null, null]); assert.equal(count(), 5);
    bank.setVoice(0, patch); assert.equal(count(), 6, 'Removing and re-adding is a real transition.');
    patch[0].type = 'unknown'; assert.throws(() => bank.setVoice(0, patch), /unknown|invalid/i); assert.equal(count(), 6);
    bank.dispose();
  });
  await check('Rejected offline preparation remains retryable and an empty patch still restores the native route', async () => {
    const f = fixture(current, 'offline-unavailable'), bank = await f.bank(1), destination = bank.input(0), patch = [f.effect('prism'), null];
    bank.setVoice(0, [null, null]);
    for (let i = 0; i < 2; i++) assert.throws(() => bank.setVoice(0, patch), /cannot render|Offline AudioWorklet/i);
    bank.setVoice(0, [null, null]); assert.equal(bank.input(0), destination); bank.dispose();
  });
  await check('Unobserved voice Worklets send no meters; a selected voice allows only one pending real snapshot', async () => {
    const f = fixture(), bank = await f.bank(), patch = [f.effect('velvet', { bandMode: 'multiband', makeup: 0 }), null];
    bank.setVoice(0, patch); bank.setVoice(1, patch); const first = bank.input(0), second = bank.input(1);
    const input = new Float32Array(128).fill(.08), output = [new Float32Array(128), new Float32Array(128)];
    for (let block = 0; block < 32; block++) { f.frame(block * 128); first.processor.process([[input, input]], [output]); second.processor.process([[input, input]], [output]); }
    assert.equal(first.reports.length, 0); assert.equal(second.reports.length, 0, 'Unselected voices stay quiet on the message port.');
    for (let request = 0; request < 128; request++) bank.getMeters(0);
    assert.equal(first.messages.filter(message => message.type === 'meters').length, 1);
    assert.equal(first.reports.length, 1); assert.equal(second.reports.length, 0);
    first.flushResponses(); const reading = bank.getMeters(0);
    assert.equal(reading[0].type, 'velvet'); assert.equal(reading[0].bandMode, 'multiband');
    assert(Number.isFinite(reading[0].inputDb) && reading[0].inputDb > -80);
    assert(Number.isFinite(reading[0].bands.low.reductionDb));
    assert.equal(first.messages.filter(message => message.type === 'meters').length, 2, 'Only a received response allows another request.');
    const copies = clone(reading); reading[0].inputDb = 99; first.flushResponses(); assert.equal(bank.getMeters(0)[0].inputDb, copies[0].inputDb, 'Returned meters are detached snapshots.');
    const prior = first.reports.length;
    for (let block = 32; block < 64; block++) { f.frame(block * 128); first.processor.process([[input, input]], [output]); }
    assert.equal(first.reports.length, prior, 'Audio rendering never restarts a report stream.');
    bank.dispose(); const requests = first.messages.length; bank.getMeters(0); assert.equal(first.messages.length, requests);
  });
  await check('Fallback processing avoids unused meter reads while an observed voice still reports actual DSP values', async () => {
    const f = fixture(current, 'script'), bank = await f.bank(1); bank.setVoice(0, [f.effect('velvet', { makeup: 0 }), null]); const node = bank.input(0);
    const input = new Float32Array(256).fill(.08), output = [new Float32Array(256), new Float32Array(256)];
    for (let block = 0; block < 8; block++) { f.frame(block * 256); node.onaudioprocess({ playbackTime: block * 256 / 48000, inputBuffer: { numberOfChannels: 2, getChannelData: () => input }, outputBuffer: { getChannelData: channel => output[channel] } }); }
    assert.equal(f.meterReads, 0);
    const reading = bank.getMeters(0); assert.equal(f.meterReads, 1); assert.equal(reading[0].type, 'velvet'); assert(Number.isFinite(reading[0].inputDb) && reading[0].inputDb > -80);
    bank.dispose(); bank.getMeters(0); assert.equal(f.meterReads, 1);
  });
  await check('Permanent disposal terminates live and offline voice processors without clearing DSP on the audio thread', async () => {
    for (const offline of [false, true]) {
      const f = fixture(); if (offline) f.context.startRendering = () => Promise.resolve();
      const bank = await f.bank(1), slots = [f.effect('parallax', { clock: 'free', time: 23, feedback: .7, mix: 1 }), null];
      bank.setVoice(0, slots); const node = bank.input(0);
      assert.equal(!!node.processor.offlineId, offline);
      const input = new Float32Array(128).fill(.08), output = [new Float32Array(128), new Float32Array(128)];
      assert.equal(node.processor.process([[input, input]], [output]), true);
      for (const key of ['process', 'reset', 'setSlots', 'getMeters']) node.processor.core[key] = () => { throw Error('Disposed processor must not invoke DSP ' + key); };
      bank.dispose(); assert.equal(node.messages.at(-1).type, 'dispose'); assert.equal(node.closed, true); assert.equal(node.processor.disposed, true);
      const sent = node.messages.length, reports = node.reports.length;
      bank.dispose(); bank.getMeters(0); bank.setClock({ tempo: 135, beat: 2, playing: true }); assert.equal(node.messages.length, sent);
      assert.throws(() => bank.setVoice(0, slots), /disposed/i);
      for (const data of [{ type: 'meters' }, { type: 'slots', slots }, { type: 'reset', frame: 0 }, { type: 'clock', clock: { tempo: 135, beat: 2, time: 0, playing: true } }]) node.processor.port.onmessage({ data });
      assert.equal(node.reports.length, reports, 'Queued controls and meter requests cannot restart disposed processing.');
      const channels = [[new Float32Array(128).fill(.7), new Float32Array(128).fill(-.7)], [new Float32Array(128).fill(.4)]];
      assert.equal(node.processor.process([[input, input]], channels), false);
      assert(channels.every(bus => bus.every(channel => channel.every(value => value === 0))));
      assert.equal(node.processor.process([[input, input]], channels), false, 'Disposal is terminal.');
    }
  });
  for (const mode of ['worklet', 'script']) await check(mode + ' stereo audio, scheduled controls and transition gates remain exact against released delivery', async () => {
    const actual = await renderBank(current, mode), expected = await renderBank(released, mode);
    assert.deepEqual(actual.left, expected.left); assert.deepEqual(actual.right, expected.right);
    assert(actual.left.some(value => Math.abs(value) > .0001)); assert.notDeepEqual(actual.left, actual.right);
    assert.deepEqual(actual.controls, expected.controls); assert.deepEqual(actual.gate, expected.gate);
    if (mode === 'worklet') {
      assert.equal(actual.sent, 7); assert(expected.sent >= 128, 'Reference must retain per-strike delivery.');
      assert.equal(actual.reports, 0); assert(expected.reports > 0, 'Reference must retain its periodic meter stream.');
      console.log('  Slot messages: ' + expected.sent + ' → ' + actual.sent + '; maximum stereo PCM difference: 0');
    } else { assert.equal(actual.meterReads, 0); assert(expected.meterReads > 0); }
    const observed = await renderBank(current, mode, true);
    assert.deepEqual(observed.left, actual.left); assert.deepEqual(observed.right, actual.right, 'Requesting meters cannot change sound.');
  });
  console.log(passed + ' voice-effects message and exact-audio performance groups passed.');
}

async function runBrowserChecks() {
  const http = require('node:http');
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const scripts = sources.map(([, source]) => source).join('\n') + '\n' + current;
  const html = '<!doctype html><meta charset="utf-8"><title>Voice effects lifecycle</title><script>' + scripts.replace(/<\/script/gi, '<\\/script') + '</script>';
  const server = http.createServer((request, response) => { response.setHeader('Content-Type', 'text/html'); response.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
    const page = await browser.newPage(), errors = [], origin = 'http://127.0.0.1:' + server.address().port;
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => { const url = route.request().url(); return url.startsWith(origin) || url.startsWith('blob:') || url.startsWith('data:') ? route.continue() : route.abort(); });
    await page.goto(origin);
    const evidence = await page.evaluate(async () => {
      const context = new AudioContext({ sampleRate: 48000 }), nativeAddModule = context.audioWorklet.addModule.bind(context.audioWorklet);
      const prefix = `
        globalThis.__voiceFxDisposeEvidence={active:0,received:0,accepted:0,terminal:0,zero:true};
        const registerProcessor=(name,Processor)=>{
          if(name==='kitchen-voice-effects-v1')globalThis.registerProcessor(name,class extends Processor{
            constructor(options){super(options);const handler=this.port.onmessage;this.port.onmessage=event=>{const stopping=event.data?.type==='dispose';if(stopping)globalThis.__voiceFxDisposeEvidence.received++;handler(event);if(stopping&&this.disposed)globalThis.__voiceFxDisposeEvidence.accepted++;};}
            process(inputs,outputs,parameters){const result=super.process(inputs,outputs,parameters),stats=globalThis.__voiceFxDisposeEvidence;if(this.disposed){stats.terminal++;stats.zero=stats.zero&&result===false&&outputs.every(bus=>bus.every(channel=>channel.every(value=>value===0)));}else stats.active++;return result;}
          });else globalThis.registerProcessor(name,Processor);
        };
      `;
      const observerSource = `
        registerProcessor('voice-fx-dispose-observer',class extends AudioWorkletProcessor{
          constructor(){super();this.port.onmessage=()=>this.port.postMessage({...globalThis.__voiceFxDisposeEvidence});}
          process(){return true;}
        });
      `;
      context.audioWorklet.addModule = async (url, options) => {
        const source = await (await fetch(url)).text(), observed = URL.createObjectURL(new Blob([prefix + source + observerSource], { type: 'application/javascript' }));
        try { return await nativeAddModule(observed, options); } finally { URL.revokeObjectURL(observed); }
      };
      let bank, oscillator, node, observer, sink;
      try {
        await KitchenVoiceEffects.prepare(context);
        observer = new AudioWorkletNode(context, 'voice-fx-dispose-observer'); observer.connect(context.destination);
        const snapshot = () => new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Observer did not respond')), 2000);
          observer.port.onmessage = event => { clearTimeout(timeout); resolve(event.data); }; observer.port.postMessage('read');
        });
        sink = context.createGain(); sink.gain.value = 0; sink.connect(context.destination);
        bank = KitchenVoiceEffects.createBank(context, sink, { voiceCount: 1, tempo: 120 });
        bank.setVoice(0, [{ type: 'velvet', params: { ...KitchenVoiceEffects.defaults('velvet'), makeup: 0 } }, null]); node = bank.input(0);
        oscillator = context.createOscillator(); oscillator.frequency.value = 137; const level = context.createGain(); level.gain.value = .05;
        oscillator.connect(level); level.connect(node); oscillator.start(); await context.resume();
        await new Promise(resolve => setTimeout(resolve, 80));
        bank.getMeters(0); await new Promise(resolve => setTimeout(resolve, 30)); const meter = bank.getMeters(0)[0], before = await snapshot();
        bank.dispose();
        // Keep a separate observation route so disconnecting the ordinary bank
        // cannot masquerade as delivery of its queued terminal message.
        node.connect(sink);
        let after;
        for (let attempt = 0; attempt < 30; attempt++) {
          after = await snapshot(); if (after.received === 1 && after.accepted === 1 && after.terminal > 0) break;
          await new Promise(resolve => setTimeout(resolve, 15));
        }
        bank.dispose(); bank.getMeters(0); bank.setClock({ tempo: 135, beat: 2, playing: true });
        const final = await snapshot();
        return { sampleRate: context.sampleRate, before, after, final, meter: meter && { type: meter.type, inputDb: meter.inputDb, outputDb: meter.outputDb } };
      } finally {
        bank?.dispose(); oscillator?.stop(); node?.disconnect(); observer?.disconnect(); observer?.port.close(); sink?.disconnect(); await context.close();
      }
    });
    assert.deepEqual(errors, []);
    assert(evidence.before.active > 0, 'The real voice processor must be active before disposal.');
    assert.equal(evidence.meter?.type, 'velvet'); assert(Number.isFinite(evidence.meter.inputDb) && evidence.meter.inputDb > -80);
    assert.equal(evidence.after.received, 1, 'The dispose message must survive immediate sender MessagePort.close().');
    assert.equal(evidence.after.accepted, 1); assert(evidence.after.terminal > 0); assert.equal(evidence.after.zero, true);
    assert.equal(evidence.final.received, 1, 'Disposal must remain idempotent.'); assert.equal(evidence.final.zero, true);
    const output = process.env.VOICE_FX_PERF_QA_DIR || '/tmp/galley-voice-fx-performance-qa'; fs.mkdirSync(output, { recursive: true });
    fs.writeFileSync(path.join(output, 'native-dispose-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
    console.log('PASS Actual Chromium voice Worklet receives queued dispose before sender close, reports real demand meters, then returns false with zero output');
    console.log(JSON.stringify(evidence));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}

(process.env.VOICE_FX_PERF_BROWSER === '1' ? runBrowserChecks() : runSourceChecks()).catch(error => { console.error(error); process.exitCode = 1; });
