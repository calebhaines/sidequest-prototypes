'use strict';

// Run with `node loom/checks.cjs`, or `node checks.cjs` in the source download.
// These checks exercise the actual DSP and project schema without a browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const scope = {
  Blob, DOMException, Math, Number, Map, Set, Promise, setTimeout,
  navigator: {}, crypto: webcrypto,
  btoa: value => Buffer.from(value, 'binary').toString('base64'),
  atob: value => Buffer.from(value, 'base64').toString('binary')
};
scope.window = scope;
vm.createContext(scope);
for (const name of ['effects-catalog.js', 'effects.js', 'schema.js', 'audio-engine.js', 'clip-transfer.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, name), 'utf8'), scope, { filename: name });
}
const S = scope.LoomSchema;
const DSP = scope.createLoomEngineDSP(scope.createLoomEffectsDSP);
const passed = [];
function check(name, run) { run(); passed.push(name); }
function session() {
  const state = S.defaultState();
  state.tempo = 120;
  state.lengthBars = 4;
  state.loopEnabled = false;
  state.master.level = .8;
  state.tracks.forEach(track => { track.level = 1; track.instrumentLive = false; });
  return state;
}
function lane(target, points, interpolation = 'linear', effectType) {
  return { target, enabled: true, interpolation, points: points.map(([beat, value]) => ({ beat, value })), ...(effectType ? { effectType } : {}) };
}
const state = session();
state.tracks[0].effects[0] = S.effect({ type: 'cinder', params: scope.LoomEffectsCatalog.find(e => e.id === 'cinder').defaults });
state.tracks[0].automation = [
  lane('level', [[0, 0], [2, 1]]),
  lane('pan', [[0, -1], [2, 1]]),
  lane('fx:0:drive', [[0, 0], [2, 30]], 'linear', 'cinder'),
  lane('fx:0:mix', [[0, .2], [1, .8]], 'hold', 'cinder')
];
state.markers = [
  { id: 'verse', name: 'Verse', beat: 0, color: '#edab7c' },
  { id: 'chorus', name: 'Chorus', beat: 8, color: '#b6c995' }
];
state.recording = { countInBars: 2, punchEnabled: true, punchStart: 4, punchEnd: 8 };

check('Old projects receive new defaults and retain eight tracks / four slots', () => {
  const old = session();
  delete old.recording;
  delete old.markers;
  old.tracks.forEach(track => delete track.automation);
  const restored = S.parseProject(JSON.stringify({ format: 'loom-project', formatVersion: 1, state: old }));
  assert.equal(restored.recording.countInBars, 0);
  assert.equal(restored.markers.length, 0);
  assert.equal(restored.tracks.length, 8);
  assert(restored.tracks.every(track => track.effects.length === 4 && track.automation.length === 0));
});

check('Automation, markers and recording settings survive portable projects', () => {
  const serialized = S.serializeProject(state);
  assert.equal(S.serializeProject(S.parseProject(serialized)), serialized);
  assert.equal(S.automationValue(state.tracks[0].automation[0], 1, 99), .5);
  assert.equal(S.automationValue(state.tracks[0].automation[3], .9, 99), .2);
  assert.equal(S.automationValue(state.tracks[0].automation[3], 1, 99), .8);
  assert(S.automationTargets(state.tracks[0]).some(target => target.target === 'fx:0:mix' && target.max === 1));
});

check('Malformed automation rejects; replacing an effect removes incompatible lanes', () => {
  const malformed = JSON.parse(S.serializeProject(state));
  malformed.state.tracks[0].automation[0].points[0].value = null;
  assert.throws(() => S.parseProject(JSON.stringify(malformed)), /automation point/i);
  const swapped = S.copy(state);
  swapped.tracks[0].effects[0] = S.effect({ type: 'prism', params: scope.LoomEffectsCatalog[0].defaults });
  assert(!S.normalize(swapped).tracks[0].automation.some(item => item.effectType === 'cinder'));
});

const sampleRate = 48000;
const totalFrames = sampleRate * 2;
const signal = Float32Array.from({ length: totalFrames }, (_, i) => .12 * Math.sin(2 * Math.PI * 777 * i / sampleRate));
const assets = { tone: { left: signal, right: signal, sampleRate } };
state.tracks[0].clips = [{ assetId: 'tone', start: 0, length: 4, sourceStart: 0, sourceEnd: 2, rate: 1, gain: 1, fadeIn: 0, fadeOut: 0 }];
function render(blockSize) {
  const core = new DSP.Core(state, assets, sampleRate);
  core.start(0);
  const left = new Float32Array(totalFrames), right = new Float32Array(totalFrames);
  for (let at = 0; at < totalFrames; at += blockSize) {
    core.processBlock(left.subarray(at, Math.min(at + blockSize, totalFrames)), right.subarray(at, Math.min(at + blockSize, totalFrames)));
  }
  return { left, right };
}
let live, offline, blockError = 0;
check('Live and offline block sizes produce identical automated audio', () => {
  live = render(128);
  offline = render(2048);
  for (let i = 0; i < totalFrames; i++) blockError = Math.max(blockError, Math.abs(live.left[i] - offline.left[i]), Math.abs(live.right[i] - offline.right[i]));
  assert(blockError < 1e-7, 'Live/export automation differs by ' + blockError);
});
function rms(data, start, length) {
  let power = 0;
  for (let i = start; i < start + length; i++) power += data[i] * data[i];
  return Math.sqrt(power / length);
}
check('The pan curve audibly moves the automated voice from left to right', () => {
  assert(rms(live.left, 10000, 2000) > rms(live.right, 10000, 2000) * 1.7);
  assert(rms(live.right, 40000, 2000) > rms(live.left, 40000, 2000) * 1.5);
});

check('Count-in excludes clicks / pre-roll and punch records the exact source range', () => {
  const recordingState = session();
  recordingState.tracks[0].instrumentLive = true;
  const rate = 8000;
  const core = new DSP.Core(recordingState, {}, rate, { includeMetronome: true });
  core.setRecordingHold(true);
  core.beginRecording({ countInBeats: 4, punchEnabled: true, startTransport: true });
  const chunks = [], limits = [];
  const recorder = new DSP.Recorder(rate, chunk => chunks.push(chunk), info => limits.push(info));
  recorder.start(1, [0], 0, rate * 120, { countInBeats: 4, punchEnabled: true, punchStart: 1, punchEnd: 2, requireTransport: true });
  let processed = 0, clickEnergy = 0, countInEnds = 0;
  while (recorder.active && processed < 40000) {
    // An odd block size forces count-in and punch boundaries inside blocks.
    const size = 127;
    const input = [new Float32Array(size).fill(.45), new Float32Array(size).fill(-.27)];
    const left = new Float32Array(size), right = new Float32Array(size);
    core.processBlock(left, right, [input]);
    if (core.countInEnded) countInEnds++;
    for (let i = 0; i < size; i++) if (core.timelineCountIn[i]) {
      clickEnergy += Math.abs(left[i]);
      assert.equal(core.timelineBeats[i], 0, 'The count-in must hold the playhead');
    }
    recorder.capture([input], size, core);
    processed += size;
  }
  const take = recorder.stop();
  assert.equal(countInEnds, 1);
  assert(clickEnergy > 1, 'Count-in click must reach the output');
  assert.equal(take.frames, 4000);
  assert(Math.abs(take.startBeat - 1) < 1e-8);
  assert.equal(limits.length, 1);
  assert.equal(limits[0].reason, 'punch');
  assert(chunks.every(chunk => chunk.left.every(value => Math.abs(value - .45) < 1e-7) && chunk.right.every(value => Math.abs(value + .27) < 1e-7)), 'Clicks and post-effects audio must not enter the raw recording');
});

check('Stopping during count-in returns no empty or contaminated take', () => {
  const core = new DSP.Core(session(), {}, 8000);
  core.beginRecording({ countInBeats: 8, startTransport: true });
  const recorder = new DSP.Recorder(8000, () => { throw Error('Count-in audio entered the recorder'); });
  recorder.start(2, [0], 0, 8000, { countInBeats: 8, requireTransport: true });
  const input = new Float32Array(1024).fill(.5);
  core.processBlock(new Float32Array(1024), new Float32Array(1024), [[input, input]]);
  recorder.capture([[input, input]], 1024, core);
  core.stop();
  assert.equal(recorder.stop().frames, 0);
});

(async () => {
  const sourceRate=48000,sourceFrames=sourceRate*3;
  const source={sampleRate:sourceRate,left:Float32Array.from({length:sourceFrames},(_,i)=>Math.sin(i*.023)*.3),right:Float32Array.from({length:sourceFrames},(_,i)=>Math.cos(i*.017)*.2)};
  for(const edits of [{rate:1},{rate:.5,reverse:true},{rate:2,loop:true}]){
    const clip={name:'Exchange region',start:4,length:4,sourceStart:.2,sourceEnd:2.8,sourceOffset:.1,gain:.7,fadeIn:.01,fadeOut:.03,...edits};
    const full=await scope.LoomClipTransfer.render(clip,source,120);
    const region=await scope.LoomClipTransfer.render(clip,source,120,{startSeconds:.4,endSeconds:1.4,maxSeconds:1});
    assert.equal(region.pcm.length,sourceRate*2);
    assert(Math.abs(region.pcm[0])<1e-12,'A newly cut edge must start without a click');
    let error=0;
    for(let i=150;i<sourceRate-150;i++)for(let ch=0;ch<2;ch++)error=Math.max(error,Math.abs(region.pcm[i*2+ch]-full.pcm[(i+sourceRate*.4)*2+ch]));
    assert(error<.00001,'Selected region changed clip source offset, rate, reverse, loop, or gain');
  }
  passed.push('Selected audio regions preserve stereo clip edits and fade newly cut edges');
  await assert.rejects(scope.LoomClipTransfer.render({length:4},source,120,{maxSeconds:.5}),/destination accepts/);
  await assert.rejects(scope.LoomClipTransfer.render({length:4},source,120,{signal:{aborted:true}}),error=>error.name==='AbortError');
  passed.push('Over-limit and canceled transfers produce no received audio');
  const engine = new scope.LoomAudio(state);
  const wav = await engine.renderWav(state, assets, { startBeat: 0, endBeat: 4 });
  const view = new DataView(await wav.arrayBuffer());
  assert.equal(view.getUint32(40, true), totalFrames * 4);
  let quantizationError = 0;
  for (let i = 0; i < totalFrames; i++) quantizationError = Math.max(quantizationError, Math.abs(view.getInt16(44 + i * 4, true) / 32768 - offline.left[i]), Math.abs(view.getInt16(46 + i * 4, true) / 32768 - offline.right[i]));
  assert(quantizationError < .00004, 'WAV automation differs beyond 16-bit quantization');
  passed.push('WAV export contains the same automation within 16-bit quantization');
  for (const name of passed) console.log('PASS ' + name);
  console.log(passed.length + ' checks passed. Live/export block error: ' + blockError + '.');
})().catch(error => { console.error(error); process.exitCode = 1; });
