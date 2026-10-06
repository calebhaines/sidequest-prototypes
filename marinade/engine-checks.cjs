'use strict';
// Run: node marinade/engine-checks.cjs [--analysis]. Exercises actual analysis and synthesis.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const analysisOnly = process.argv.includes('--analysis');
const coreOnly = process.argv.includes('--core');
const scope = {console, Blob, URL, AbortController, DOMException, TextEncoder, TextDecoder,
  setTimeout, clearTimeout, performance, Float32Array, Float64Array, Uint8Array, Int16Array, ArrayBuffer,
  requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 0),
  location: {protocol: 'file:'}, navigator: {}, addEventListener() {}, removeEventListener() {}};
scope.window = scope; scope.self = scope;
function load(file) {
  new Function('window', 'self', 'createMarinadeAnalysis', 'createMarinadeSequence',
    fs.readFileSync(path.join(__dirname, file), 'utf8'))(scope, scope, scope.createMarinadeAnalysis, scope.createMarinadeSequence);
}
load('analysis.js');
load('sources.js');
const analysis = scope.MarinadeAnalysis;
const sources = scope.MarinadeSources;
if (!analysisOnly) {
  const sharedSchema = fs.existsSync(path.join(__dirname, 'shared', 'pattern-schema.js')) ? 'shared/pattern-schema.js' : '../shared/pattern-schema.js';
  load(sharedSchema); load('schema.js'); load('sequence.js'); if (!coreOnly) load('presets.js'); load('audio-engine.js');
}
const S = scope.MarinadeSchema, sequence = scope.MarinadeSequence, DSP = scope.MarinadeDSP;
const sr = 48000;
const plain = value => JSON.parse(JSON.stringify(value));
const results = [], failures = [];
async function check(name, run) {
  if (process.env.MARINADE_QA_FILTER && !new RegExp(process.env.MARINADE_QA_FILTER).test(name)) return;
  const began = performance.now();
  try { const evidence = await run(); results.push({name, milliseconds: Math.round(performance.now() - began), evidence}); console.log('PASS ' + name + (evidence ? ' ' + JSON.stringify(evidence) : '')); }
  catch (error) { failures.push({name, message: error.stack || String(error)}); console.error('FAIL ' + name + '\n' + (error.stack || error)); }
}
function signal(components, seconds = .5) {
  return Float32Array.from({length: Math.round(sr * seconds)}, (_, i) => components.reduce((sum, [hz, amplitude, phase = 0]) => sum + Math.sin(2 * Math.PI * hz * i / sr + phase) * amplitude, 0));
}
function strongest(model, frame = Math.floor(model.frames / 2)) {
  const peaks = [];
  for (let lane = 0; lane < model.lanes; lane++) {
    const at = frame * model.lanes + lane;
    peaks.push({lane, frequency: model.frequencies[at], amplitude: model.amplitudes[at]});
  }
  return peaks.sort((a, b) => b.amplitude - a.amplitude);
}
function stats(pcm, from = 0, to = pcm.left.length) {
  let energy = 0, peak = 0, sum = 0, nonfinite = 0;
  for (let i = from; i < to; i++) for (const channel of [pcm.left, pcm.right]) {
    const x = channel[i]; if (!Number.isFinite(x)) nonfinite++; energy += x * x; sum += x; peak = Math.max(peak, Math.abs(x));
  }
  const n = Math.max(1, (to - from) * 2); return {rms: Math.sqrt(energy / n), peak, mean: sum / n, nonfinite};
}
function difference(a, b, from = 0, to = a.left.length) {
  assert.equal(a.left.length, b.left.length); let squared = 0, maximum = 0;
  for (let i = from; i < to; i++) for (const key of ['left', 'right']) { const d = a[key][i] - b[key][i]; squared += d * d; maximum = Math.max(maximum, Math.abs(d)); }
  return {rms: Math.sqrt(squared / Math.max(1, (to - from) * 2)), maximum};
}
function spectrum(samples, offset = 4096, size = 16384) {
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  for (let i = 0; i < size; i++) real[i] = (samples[offset + i] || 0) * (.5 - .5 * Math.cos(2 * Math.PI * i / (size - 1)));
  analysis.fft(real, imaginary); return Array.from({length: size / 2}, (_, i) => Math.hypot(real[i], imaginary[i]));
}
function peakHz(magnitudes, wanted, range = 25) {
  const size = magnitudes.length * 2, low = Math.max(2, Math.floor((wanted - range) * size / sr)), high = Math.min(magnitudes.length - 2, Math.ceil((wanted + range) * size / sr));
  let bin = low; for (let i = low + 1; i <= high; i++) if (magnitudes[i] > magnitudes[bin]) bin = i;
  const a = Math.log(magnitudes[bin - 1] + 1e-15), b = Math.log(magnitudes[bin] + 1e-15), c = Math.log(magnitudes[bin + 1] + 1e-15);
  const delta = .5 * (a - c) / (a - 2 * b + c); return (bin + (Number.isFinite(delta) ? delta : 0)) * sr / size;
}
async function factory(state) { return new DSP.Core(sr, S.normalize(state), await analysis.prepare(state)); }
function dryState() {
  const state=S.defaultState();Object.assign(state.fx,{drive:0,chorus:0,delay:0,feedback:0,space:0,width:1,volume:.7});
  Object.assign(state.synth,{morph:0,pitchBlend:0,texture:0,transient:0,scanRate:0,formantShift:0,formantLock:false,inharmonic:0,smear:0,spread:0});
  Object.assign(state.synth.filter,{cutoff:18000,resonance:0,envAmount:0,keytrack:0});Object.assign(state.synth.amp,{attack:.001,decay:.005,sustain:1,release:.08});
  state.synth.lfo.depth=0;state.morphPath.enabled=false;for(const bay of state.samples){bay.freeze=true;bay.position=.5;}
  return state;
}
function analyticState(a=[[440,.7]],b=a) {
  const state=dryState();state.root=69;for(const [index,components]of[a,b].entries()){
    state.samples[index].ref=sources.encodeAudio({pcm:[signal(components,.65)],sampleRate:sr,name:'Analytic '+index});state.samples[index].rootNote=69;
  }return state;
}
function render(core,seconds,chunk=128) {
  const count=Math.round(seconds*sr),left=new Float32Array(count),right=new Float32Array(count);
  for(let at=0;at<count;at+=chunk)core.processBlock(left.subarray(at,Math.min(count,at+chunk)),right.subarray(at,Math.min(count,at+chunk)));
  return {left,right,meters:plain(core.getMeters())};
}
async function notePCM(state,{note=state.root,velocity=.85,duration=.6,seconds=1.1,chunk=128}={}) {
  const core=await factory(state);core.scheduleNote({note,velocity,duration,frame:0,source:'test'});return render(core,seconds,chunk);
}
function validPacket() {return{format:'musiclab-pattern',version:1,name:'Exact borrowed phrase',sourceApp:'proof',kind:'notes',tempo:120,swing:0,lengthBeats:4,meter:[4,4],seed:19,
  voices:[{id:'donor',name:'Borrowed notes'}],notes:[{id:'n1',voice:'donor',pitch:60,beat:0,duration:.73,velocity:.61,probability:1},{id:'n2',voice:'donor',pitch:64,beat:.37,duration:1.11,velocity:.88,probability:1}],tags:[]};}

(async () => {
  await check('FFT spectral analysis measures actual input fundamentals and harmonics', () => {
    const measured = {};
    for (const hz of [110, 220, 440, 880, 1760, 3520]) {
      const model = analysis.analyze(signal([[hz, .8]]), {sampleRate: sr, rootNote: 69}), peak = strongest(model)[0];
      assert(Math.abs(peak.frequency - hz) < 1.2, hz + 'Hz measured ' + peak.frequency);
      assert(peak.amplitude > .3, 'real spectral energy'); measured[hz] = +peak.frequency.toFixed(4);
      assert.equal(model.frames <= 96, true); assert.equal(model.lanes, 72); assert.equal(model.bands, 6);
      assert.equal(model.amplitudes.length, model.frames * model.lanes);
    }
    const harmonic = analysis.analyze(signal([[220, .6], [440, .3], [660, .15]]), {sampleRate: sr, rootNote: 57});
    const peaks = strongest(harmonic).slice(0, 3).sort((a, b) => a.frequency - b.frequency);
    for (let i = 0; i < 3; i++) assert(Math.abs(peaks[i].frequency - 220 * (i + 1)) < 1.2);
    assert(peaks[0].amplitude > peaks[1].amplitude * 1.7 && peaks[1].amplitude > peaks[2].amplitude * 1.7, 'harmonic strengths follow source');
    return {fundamentals: measured, harmonicAmplitudes: peaks.map(p => +p.amplitude.toFixed(4))};
  });
  await check('Spectral trajectories retain changing source character and source trim', () => {
    const first = signal([[220, .5]], .3), last = signal([[880, .5]], .3), source = new Float32Array(first.length + last.length); source.set(first); source.set(last, first.length);
    const whole = analysis.analyze(source, {sampleRate: sr, rootNote: 57});
    const early = strongest(whole, Math.floor(whole.frames * .2))[0], late = strongest(whole, Math.floor(whole.frames * .8))[0];
    assert(Math.abs(early.frequency - 220) < 1.2); assert(Math.abs(late.frequency - 880) < 1.2);
    const trim = analysis.analyze(source, {sampleRate: sr, rootNote: 57, start: .55, end: 1});
    assert(Math.abs(trim.duration - .27) < 1 / sr); assert(Math.abs(strongest(trim)[0].frequency - 880) < 1.2);
    assert.equal(trim.rootNote, 57); assert(Math.abs(trim.rootFrequency - 220) < 1e-10);
    return {earlyHz: early.frequency, lateHz: late.frequency, trimmedSeconds: trim.duration};
  });
  await check('Analyzer handles stereo, silence and corrupt samples with bounded finite models', async () => {
    const mono = signal([[440, .4]], .2), stereo = analysis.analyze([mono, mono], {sampleRate: sr});
    assert(Math.abs(strongest(stereo)[0].frequency - 440) < 1.2);
    const cancel = analysis.analyze([mono, Float32Array.from(mono, x => -x)], {sampleRate: sr}); assert.equal(cancel.peak, 0);
    for (const input of [new Float32Array(1), new Float32Array(sr), Float32Array.from([NaN, Infinity, -Infinity, .1])]) {
      const model = analysis.analyze(input, {sampleRate: sr});
      for (const field of ['amplitudes', 'frequencies', 'texture', 'rms', 'centroid', 'transient', 'laneWeight']) for (const x of model[field]) assert(Number.isFinite(x), field);
      assert(model.frames >= 2 && model.frames <= 96);
    }
    assert.throws(() => analysis.analyze(new Float32Array(), {sampleRate: sr}));
    assert.throws(() => analysis.analyze(new Float32Array(sr * 31), {sampleRate: sr}));
    await assert.rejects(analysis.analyzeAsync(new Float32Array(), {sampleRate: sr}));
    const asyncModel = await analysis.analyzeAsync(mono, {sampleRate: sr}); assert(Math.abs(strongest(asyncModel)[0].frequency - 440) < 1.2);
  });
  await check('All 24 source ingredients contain distinct original PCM and isolate cached audio', () => {
    assert.equal(sources.catalog.length, 24); const hashes = new Set(), evidence = [];
    const hash = require('node:crypto').createHash;
    for (const item of sources.catalog) {
      const audio = sources.resolve({kind: 'factory', id: item.id});
      assert.equal(audio.sampleRate, 22050); assert.equal(audio.pcm.length, 1);
      assert(audio.pcm[0].length >= 22050 * 2 && audio.pcm[0].length <= 22050 * 4);
      let energy = 0, peak = 0; for (const value of audio.pcm[0]) {assert(Number.isFinite(value)); energy += value * value; peak = Math.max(peak, Math.abs(value));}
      assert(peak > .02 && peak <= 1.00001, item.id + ' real source audio');
      const digest = hash('sha256').update(Buffer.from(audio.pcm[0].buffer)).digest('hex'); assert(!hashes.has(digest), item.id + ' unique PCM'); hashes.add(digest);
      const original = audio.pcm[0][100]; audio.pcm[0][100] = 123;
      assert.equal(sources.resolve({kind: 'factory', id: item.id}).pcm[0][100], original, 'caller cannot corrupt source cache');
      evidence.push({id: item.id, seconds: audio.pcm[0].length / audio.sampleRate, rms: +Math.sqrt(energy / audio.pcm[0].length).toFixed(5), peak: +peak.toFixed(5)});
    }
    assert.throws(() => sources.resolve({kind: 'factory', id: 'missing-source'})); return evidence;
  });
  await check('Custom stereo audio is portable mono PCM with exact decoding and bounded import', () => {
    const sine = signal([[440, .7]], .2), ref = sources.encodeAudio({pcm: [sine, sine], sampleRate: sr, name: 'QA custom sine'});
    assert.equal(ref.kind, 'pcm'); assert.equal(ref.channels, 1); assert.equal(ref.sampleRate, 22050); assert.equal(ref.frames, 4410);
    assert.equal(sources.validateRef(ref).data, ref.data);
    const decoded = sources.resolve(ref); assert.equal(decoded.pcm[0].length, 4410);
    const model = analysis.analyze(decoded.pcm, {sampleRate: decoded.sampleRate, rootNote: 69}); assert(Math.abs(strongest(model)[0].frequency - 440) < 1.2);
    for (const edit of [r => r.frames++, r => r.sampleRate = 48000, r => r.channels = 2, r => r.data = 'not base64!', r => r.data += 'AAAA']) {
      const bad = plain(ref); edit(bad); assert.throws(() => sources.validateRef(bad));
    }
    assert.throws(() => sources.encodeAudio({pcm: [new Float32Array()], sampleRate: sr, name: 'Empty'}));
    assert.throws(() => sources.encodeAudio({pcm: [new Float32Array(sr * 21)], sampleRate: sr, name: 'Oversized'}));
    return {sourceFrames: sine.length, portableFrames: ref.frames, base64Bytes: ref.data.length};
  });
  if (!analysisOnly) {
    await check('Strict portable projects preserve full custom PCM and reject corrupt controls, metadata and overlays',()=>{
      const state=analyticState([[440,.6]],[[660,.5]]);state.synth.formantShift=7;state.sequence.steps[5].ratchet=4;state.musicLabPattern={pattern:validPacket(),voiceMap:{donor:'synth'}};
      const serialized=S.serialize(state),restored=S.parseProject(serialized);assert.equal(S.serialize(restored),serialized);assert.equal(restored.samples[0].ref.data,state.samples[0].ref.data);
      assert.throws(()=>S.parseProject('{broken'));assert.throws(()=>S.parseProject(' '.repeat(S.LIMITS.projectBytes+1)));
      for(const edit of[s=>s.tempo=NaN,s=>s.synth.morph=Infinity,s=>s.samples[0].ref.frames++,s=>s.samples[0].trimEnd=s.samples[0].trimStart,
        s=>s.synth.filter.cutoff=NaN,s=>s.sequence.steps[0].probability=NaN,s=>s.morphPath.points.pop(),s=>delete s.morphPath.points[5],s=>delete s.samples[1],s=>delete s.sequence.steps[3],
        s=>delete s.synth.formantLock,s=>delete s.samples[0].freeze,s=>delete s.fx.delayDivision,s=>s.unknown='discard',s=>s.synth.scanMode='wrong',
        s=>s.musicLabPattern.pattern.notes[0].voice='missing',s=>s.musicLabPattern.voiceMap.donor=4,s=>s.musicLabPattern.pattern.notes[1].id='n1']){
        const project=JSON.parse(serialized);edit(project.state);assert.throws(()=>S.parseProject(project));
      }
      const raw=S.copy(state);raw.unknown=123;raw.synth.unknown=456;const normalized=S.normalize(raw);assert.equal(normalized.unknown,undefined);assert.equal(normalized.synth.unknown,undefined);
      return{portableBytes:serialized.length,sourceDataPreserved:true};
    });
    await check('Native melody, chords, ratchets and seeded chance retain timing under arbitrary event queries',()=>{
      const state=S.defaultState();state.swing=.2;state.sequence.division='1/16T';state.sequence.steps.forEach((step,i)=>{step.probability=.55;step.ratchet=i%4+1;step.offset=i%2?-.2:.13;step.chord=i%3?'single':'minor';});
      const whole=plain(sequence.events(state,{startBeat:0,lengthBeats:8}));assert(whole.length>0);assert.deepEqual(plain(sequence.events(state,{startBeat:0,lengthBeats:8})),whole);
      const parts=[];for(let at=0;at<8;at+=.37)parts.push(...plain(sequence.events(state,{startBeat:at,lengthBeats:Math.min(.37,8-at)})));
      const sort=list=>list.sort((a,b)=>a.startBeat-b.startBeat||a.note-b.note);assert.deepEqual(sort(parts),sort(whole));state.seed++;assert.notDeepEqual(plain(sequence.events(state,{startBeat:0,lengthBeats:8})),whole);
      const basic=S.defaultState();basic.swing=0;basic.sequence.division='1/16';basic.sequence.steps.forEach(s=>{s.probability=1;s.ratchet=4;s.chord='major';});assert.equal(sequence.events(basic,{startBeat:0,lengthBeats:4}).length,16*4*3);
      basic.sequence.steps.forEach(s=>s.probability=0);assert.equal(sequence.events(basic,{startBeat:0,lengthBeats:4}).length,0);return{realizedEvents:whole.length,seeded:true};
    });
    await check('Imported fractional notes stay exact, swing applies once, and chance changes only realization',()=>{
      const state=S.defaultState(),packet=validPacket();packet.swing=.4;packet.notes[0].beat=.17;packet.notes[0].duration=.31;packet.notes[1].beat=.25;
      state.musicLabPattern={pattern:packet,voiceMap:{donor:'synth'}};const events=sequence.events(state,{startBeat:0,lengthBeats:4});assert.equal(events[0].startBeat,.17);assert.equal(events[0].durationBeats,.31);assert.equal(events[1].startBeat,.35);
      assert.equal(packet.notes[1].beat,.25);packet.notes.forEach(n=>n.probability=0);assert.equal(sequence.events(state,{startBeat:0,lengthBeats:4}).length,0);
    });
    await check('Source gain, trim and reverse affect real analysis without rebuilding unrelated controls',async()=>{
      const state=analyticState(),first=await analysis.prepare(state);state.samples[0].gain=.5;const half=await analysis.prepare(state);assert.equal(half[0].frames,first[0].frames);
      assert(Math.abs(strongest(half[0])[0].amplitude/strongest(first[0])[0].amplitude-.5)<1e-6,'gain is audible after normalization');
      const rising=Float32Array.from(signal([[440,.7]],.6),(x,i)=>x*(i/(.6*sr)));state.samples[0].ref=sources.encodeAudio({pcm:[rising],sampleRate:sr,name:'Rising'});state.samples[0].gain=1;
      const forward=await analysis.prepare(state);state.samples[0].reverse=true;const backward=await analysis.prepare(state);
      assert(strongest(forward[0],Math.floor(forward[0].frames*.15))[0].amplitude<strongest(backward[0],Math.floor(backward[0].frames*.15))[0].amplitude*.5);
      state.samples[0].trimStart=.25;state.samples[0].trimEnd=.75;const trimmed=await analysis.prepare(state),frames=state.samples[0].ref.frames;
      assert.equal(trimmed[0].duration,(Math.ceil(.75*frames)-Math.floor(.25*frames))/22050);
      state.synth.morph=.8;const same=await analysis.prepare(state);assert.equal(same[0],trimmed[0],'unrelated knobs reuse exact cached analysis');return{trimmedSeconds:trimmed[0].duration};
    });
    await check('Independent spectral pitch interpolation creates new frequencies rather than a PCM crossfade',async()=>{
      const state=analyticState([[440,.7]],[[464,.7]]);state.synth.morph=.5;const measurements={};
      for(const blend of[0,.5,1]){state.synth.pitchBlend=blend;const pcm=await notePCM(state,{note:69,duration:1,seconds:1}),expected=Math.exp(Math.log(440)*(1-blend)+Math.log(464)*blend),measured=peakHz(spectrum(pcm.left),expected,18);assert(Math.abs(measured-expected)<1.3,blend+' expects '+expected+' measured '+measured);assert(stats(pcm).rms>.001);measurements[blend]=measured;}
      assert(measurements[.5]>445&&measurements[.5]<459,'new frequency between input tones');return measurements;
    });
    await check('Spectral amplitude morph changes harmonic strengths independently of pitch',async()=>{
      const state=analyticState([[440,.65],[880,.1]],[[440,.1],[880,.65]]);state.synth.pitchBlend=.5;const ratios=[];
      for(const morph of[0,.5,1]){state.synth.morph=morph;const pcm=await notePCM(state,{duration:1,seconds:1}),mag=spectrum(pcm.left);const strength=hz=>{const bin=Math.round(hz*32768/sr);return Math.max(...mag.slice(Math.max(1,Math.floor(hz*mag.length*2/sr)-2),Math.ceil(hz*mag.length*2/sr)+3));};ratios.push(strength(880)/strength(440));assert(Math.abs(peakHz(mag,440)-440)<1.3);}
      assert(ratios[0]<.35&&ratios[2]>2.5,'opposite endpoint harmonic emphasis');assert(ratios[1]>ratios[0]&&ratios[1]<ratios[2]);return{secondToFundamental:ratios};
    });
    await check('Actual synthesized fundamental tracks keyboard pitches and source root note',async()=>{
      const state=analyticState(),measurements={};for(const note of[57,69,81]){const pcm=await notePCM(state,{note,duration:1,seconds:1}),wanted=440*2**((note-69)/12),measured=peakHz(spectrum(pcm.left),wanted);assert(Math.abs(measured-wanted)<1.3,note+' expected '+wanted+' measured '+measured);measurements[note]=measured;}
      state.samples.forEach(s=>s.rootNote=57);const pcm=await notePCM(state,{note:69,duration:1,seconds:1});assert(Math.abs(peakHz(spectrum(pcm.left),880)-880)<1.3);return measurements;
    });
    await check('Different source fundamentals align through root notes across both amplitude and pitch blends',async()=>{
      const state=analyticState([[440,.7]],[[220,.7]]);state.samples[1].rootNote=57;const measurements=[];
      for(const morph of[0,.5,1])for(const pitchBlend of[0,.5,1]){state.synth.morph=morph;state.synth.pitchBlend=pitchBlend;const pcm=await notePCM(state,{note:69,duration:1,seconds:1}),measured=peakHz(spectrum(pcm.left),440);assert(Math.abs(measured-440)<1.3,'morph'+morph+' pitch'+pitchBlend+' measured'+measured);assert(stats(pcm).rms>.001);measurements.push({morph,pitchBlend,hz:measured});}return measurements;
    });
    await check('Freeze selects source moments and scanning traverses the actual source trajectory',async()=>{
      const source=new Float32Array(sr*.6);source.set(signal([[220,.6]],.3));source.set(signal([[880,.6]],.3),sr*.3);const state=dryState();state.root=57;state.samples.forEach(s=>{s.ref=sources.encodeAudio({pcm:[source],sampleRate:sr,name:'Two moments'});s.rootNote=57;});
      const measurements=[];for(const position of[.2,.8]){state.samples.forEach(s=>s.position=position);const pcm=await notePCM(state,{duration:1,seconds:1}),wanted=position<.5?220:880,measured=peakHz(spectrum(pcm.left),wanted);assert(Math.abs(measured-wanted)<1.3);measurements.push(measured);}
      state.samples.forEach(s=>{s.freeze=false;s.position=0;});state.synth.scanRate=1;state.synth.scanMode='oneShot';const pcm=await notePCM(state,{duration:1,seconds:1});const early=spectrum(pcm.left,3000,8192),late=spectrum(pcm.left,22000,8192);assert(Math.abs(peakHz(early,220)-220)<1.3);assert(Math.abs(peakHz(late,880)-880)<1.3);return{frozenHz:measurements,scan:true};
    });
    await check('Formant transfer changes the spectral envelope while retaining harmonic pitch',async()=>{
      const components=Array.from({length:48},(_,i)=>{const hz=110*(i+1);return[hz,.04*Math.exp(-.5*((hz-1000)/450)**2)+.002/(i+1)];});
      const state=analyticState(components);state.root=45;state.samples.forEach(s=>s.rootNote=45);state.synth.formantLock=true;const measured=[];
      for(const shift of[0,12]){state.synth.formantShift=shift;const pcm=await notePCM(state,{note:45,duration:1,seconds:1}),m=spectrum(pcm.left);let energy=0,weighted=0;for(let i=1;i<m.length;i++){energy+=m[i]*m[i];weighted+=m[i]*m[i]*i*sr/(m.length*2);}const fundamental=peakHz(m,110);assert(Math.abs(fundamental-110)<1.3);measured.push({shift,centroid:weighted/energy,fundamental});}
      assert(measured[1].centroid>measured[0].centroid*1.25,'formant transfer raises energy envelope without transposing harmonics');return measured;
    });
    await check('Every spectral, filter, modulation and stereo effect control changes actual PCM',async()=>{
      const base=dryState();base.samples[0].ref={kind:'factory',id:'vowel-choir'};base.samples[0].rootNote=57;base.samples[1].ref={kind:'factory',id:'glass-bell'};base.samples[1].rootNote=69;base.root=57;base.synth.morph=.4;base.synth.pitchBlend=.4;
      const experiments=[['Amplitude morph',s=>s.synth.morph=0,s=>s.synth.morph=1],['Pitch morph',s=>s.synth.pitchBlend=0,s=>s.synth.pitchBlend=1],['Noise texture',s=>s.synth.texture=0,s=>s.synth.texture=1],['Independent texture source',s=>{s.synth.texture=1;s.synth.textureBlend=0;},s=>s.synth.textureBlend=1],['Source transient',s=>s.synth.transient=0,s=>s.synth.transient=1],['Independent transient source',s=>{s.synth.transient=1;s.synth.transientBlend=0;},s=>s.synth.transientBlend=1],
        ['Formant shift',s=>s.synth.formantShift=0,s=>s.synth.formantShift=12],['Formant lock',s=>s.synth.formantLock=false,s=>s.synth.formantLock=true],['Inharmonic',s=>s.synth.inharmonic=0,s=>s.synth.inharmonic=1],['Smear',s=>s.synth.smear=0,s=>s.synth.smear=1],['Spread',s=>s.synth.spread=0,s=>s.synth.spread=1],
        ['Filter cutoff',s=>s.synth.filter.cutoff=500,s=>s.synth.filter.cutoff=8000],['Filter type',s=>{s.synth.filter.cutoff=900;s.synth.filter.type='lp';},s=>s.synth.filter.type='hp'],['Filter resonance',s=>{s.synth.filter.cutoff=900;s.synth.filter.resonance=0;},s=>s.synth.filter.resonance=.85],['Filter envelope',s=>{s.synth.filter.cutoff=500;s.synth.filter.envAmount=0;},s=>s.synth.filter.envAmount=4],
        ['Path',s=>s.morphPath.enabled=false,s=>{s.morphPath.enabled=true;s.morphPath.depth=1;s.morphPath.beats=1;}],['Drive',s=>s.fx.drive=0,s=>s.fx.drive=.8],['Chorus',s=>s.fx.chorus=0,s=>s.fx.chorus=.8],['Delay',s=>s.fx.delay=0,s=>s.fx.delay=.8],['Space',s=>s.fx.space=0,s=>s.fx.space=.8],['Width',s=>{s.synth.spread=1;s.fx.width=0;},s=>s.fx.width=1.5],['Volume',s=>s.fx.volume=.2,s=>s.fx.volume=.8]];
      for(const target of S.ENUMS.lfoTarget)experiments.push(['LFO '+target,s=>{s.synth.lfo.depth=0;s.synth.lfo.target=target;s.synth.lfo.rate=3;if(target==='position'){s.samples.forEach(x=>x.freeze=false);}},s=>s.synth.lfo.depth=.8]);
      const evidence={};for(const[name,prepare,edit]of experiments){const a=S.copy(base);prepare(a);const b=S.copy(a);edit(b);const delta=difference(await notePCM(a,{note:64,seconds:.75,duration:.6}),await notePCM(b,{note:64,seconds:.75,duration:.6})).rms;assert(delta>.000015,name+' audible difference '+delta);evidence[name]=+delta.toFixed(6);}
      for(const shape of S.ENUMS.lfoShape){const a=S.copy(base);Object.assign(a.synth.lfo,{depth:.7,rate:5,target:'pan',shape});const pcm=await notePCM(a,{duration:.6,seconds:.75});assert(stats(pcm).rms>.0001);assert.equal(stats(pcm).nonfinite,0);}
      return evidence;
    });
    await check('LFO shapes, triplet clock and note retriggering change actual modulation',async()=>{
      const state=analyticState();Object.assign(state.synth.lfo,{depth:.8,rate:3,target:'pan',shape:'sine'});const shapePCM=[];
      for(const shape of S.ENUMS.lfoShape){state.synth.lfo.shape=shape;shapePCM.push(await notePCM(state,{duration:1,seconds:1}));}
      for(let i=0;i<shapePCM.length;i++)for(let j=i+1;j<shapePCM.length;j++)assert(difference(shapePCM[i],shapePCM[j]).rms>.00002,'distinct '+S.ENUMS.lfoShape[i]+'/'+S.ENUMS.lfoShape[j]);
      state.synth.lfo.shape='sine';state.synth.lfo.sync='1/8';const straight=await notePCM(state,{duration:1,seconds:1});state.synth.lfo.sync='1/8T';assert(difference(straight,await notePCM(state,{duration:1,seconds:1})).rms>.001);
      state.synth.lfo.sync='free';const evidence={};for(const retrigger of[false,true]){state.synth.lfo.retrigger=retrigger;const a=await factory(state),b=await factory(state);a.scheduleNote({note:69,velocity:.8,frame:0,duration:.7,source:'one'});b.scheduleNote({note:69,velocity:.8,frame:16800,duration:.7,source:'one'});const first=render(a,.5),later=render(b,.85),aligned={left:later.left.slice(16800),right:later.right.slice(16800)},delta=difference(first,aligned).rms;evidence[retrigger]=delta;if(retrigger)assert(delta<1e-7,'retriggered per-note phase ignores absolute start');else assert(delta>.001,'free phase continues before note');}return evidence;
    });
    await check('ADSR attack and sustain alter audio, scheduled releases leave no stuck voices',async()=>{
      const fast=analyticState(),slow=S.copy(fast);slow.synth.amp.attack=.3;const a=await notePCM(fast,{duration:.6,seconds:1.5}),b=await notePCM(slow,{duration:.6,seconds:1.5});assert(stats(b,0,2400).rms<stats(a,0,2400).rms*.6);for(const pcm of[a,b]){assert(stats(pcm,sr,Math.round(1.5*sr)).rms<.0001);assert.equal(pcm.meters.voices,0);}
      const sustain=S.copy(fast);sustain.synth.amp.sustain=.1;sustain.synth.amp.decay=.1;const c=await notePCM(sustain,{duration:.6,seconds:.7});assert(stats(c,12000,24000).rms<stats(a,12000,24000).rms*.3);
    });
    await check('Native transport and future clock changes are sample-identical across worklet, fallback and irregular blocks',async()=>{
      const state=S.defaultState(),models=await analysis.prepare(state),outputs=[];state.synth.lfo.sync='1/8T';state.synth.lfo.depth=.7;state.fx.delay=.55;
      for(const size of[128,1024,257]){const core=new DSP.Core(sr,state,models);core.start({beat:0,frame:0});core.setTransport({beat:1.5,tempo:173,playing:true,revision:1,frame:15013});core.setTransport({beat:5.1,tempo:67,playing:true,revision:2,frame:42017});outputs.push(render(core,1.4,size));}
      assert.equal(difference(outputs[0],outputs[1]).maximum,0);assert.equal(difference(outputs[0],outputs[2]).maximum,0);assert(stats(outputs[0]).rms>.0001);return{frames:outputs[0].left.length,peak:stats(outputs[0]).peak};
    });
    await check('Host clock does not start native sequencing or duplicate direct note playback',async()=>{
      const core=await factory(dryState());core.setTransport({beat:0,tempo:120,playing:true,revision:1,frame:0});const silent=render(core,.5);assert.equal(stats(silent).peak,0);assert.equal(core.playing,false);core.scheduleNote({note:60,velocity:.8,frame:core.frame,duration:.3,source:'host'});assert(stats(render(core,.4)).rms>.0001);assert.equal(core.playing,false);
    });
    await check('Future source cancellation preserves earlier PCM and unrelated source notes',async()=>{
      const state=analyticState(),models=await analysis.prepare(state),cancelled=new DSP.Core(sr,state,models),reference=new DSP.Core(sr,state,models),otherOnly=new DSP.Core(sr,state,models);
      for(const core of[cancelled,reference])for(const[note,frame,duration]of[[57,0,2.5],[60,Math.round(.6*sr),.5],[64,Math.round(1.3*sr),.5]])core.scheduleNote({note,velocity:.8,frame,duration,source:'first'});
      for(const core of[cancelled,reference,otherOnly])core.scheduleNote({note:81,velocity:.7,frame:0,duration:2.5,source:'unrelated'});cancelled.stopNotes({source:'first',frame:sr});
      const a=render(cancelled,2),b=render(reference,2),c=render(otherOnly,2);assert.equal(difference(a,b,0,sr).maximum,0);assert(difference(a,c,Math.round(1.5*sr),2*sr).rms<.00005);assert(stats(a,Math.round(1.5*sr),2*sr).rms>.001);assert(difference(a,b,Math.round(1.5*sr),2*sr).rms>.001);
    });
    await check('Panic clears voices, pending notes and tails while voice and queue work stay bounded',async()=>{
      const core=await factory(S.defaultState());let bounded=false;for(let i=0;i<20000;i++){try{core.scheduleNote({note:i%88+20,velocity:.8,frame:i<40?0:sr,duration:4,source:'flood'});}catch(error){assert.match(error.message,/queue|full/i);bounded=true;break;}}
      assert(bounded);assert(core.jobs.length<=DSP.MAX_QUEUE);render(core,.1);assert(core.getMeters().voices<=16);core.panic();const pcm=render(core,1.2);assert(stats(pcm).rms<.0001);assert.equal(pcm.meters.voices,0);assert.equal(core.jobs.length,0);return{maxVoices:DSP.MAX_VOICES,maxQueue:DSP.MAX_QUEUE};
    });
    await check('Extreme spectral, envelope and feedback settings produce finite bounded output',async()=>{
      const evidence={};for(const side of[0,1]){const state=S.defaultState();for(const key of Object.keys(S.RANGES.synth))state.synth[key]=S.RANGES.synth[key][side];state.synth.formantLock=!!side;Object.assign(state.synth.filter,{cutoff:side?20000:20,resonance:side?.85:0,envAmount:side?5:-5});Object.assign(state.synth.lfo,{rate:side?20:.02,depth:side});Object.assign(state.fx,{drive:side,chorus:side,delay:side,feedback:side?.85:0,space:side,width:side?1.5:0,volume:1});const core=await factory(state);for(let i=0;i<32;i++)core.scheduleNote({note:i%2?120:12,velocity:1,frame:0,duration:.4,source:'stress'});const pcm=render(core,.9),info=stats(pcm);assert.equal(info.nonfinite,0);assert(info.peak<=1.00001);assert(pcm.meters.voices<=16);evidence[side]=info;}
      return evidence;
    });
    await check('Native 128-frame rendering reports polyphonic CPU cost with bounded audible output',async()=>{
      const state=S.defaultState(),models=await analysis.prepare(state),evidence=[];Object.assign(state.synth.amp,{attack:.002,decay:.01,sustain:1,release:.08});state.synth.texture=.6;state.fx.space=.5;
      const warm=new DSP.Core(sr,state,models);warm.scheduleNote({note:60,velocity:.8,frame:0,duration:1,source:'warm'});render(warm,.2);
      for(const voices of[1,4,8,16]){const core=new DSP.Core(sr,state,models);for(let i=0;i<voices;i++)core.scheduleNote({note:48+i,velocity:.55,frame:0,duration:2,source:'benchmark'});const began=performance.now(),pcm=render(core,.75,128),milliseconds=performance.now()-began,info=stats(pcm);assert.equal(info.nonfinite,0);assert(info.rms>.0001&&info.peak<=1.00001);assert.equal(pcm.meters.voices,voices);evidence.push({voices,audioSeconds:.75,cpuMilliseconds:Math.round(milliseconds),cpuToRealtimeRatio:+(milliseconds/750).toFixed(3),peak:+info.peak.toFixed(4)});}return evidence;
    });
    await check('Exact imported notes use the same PCM as individually scheduled notes',async()=>{
      const state=analyticState();state.tempo=120;state.musicLabPattern={pattern:validPacket(),voiceMap:{donor:'synth'}};const imported=await factory(state);imported.start({beat:0,frame:0});const direct=await factory(analyticState());
      for(const e of validPacket().notes)direct.scheduleNote({note:e.pitch,velocity:e.velocity,frame:Math.round(e.beat*sr*.5),duration:e.duration*.5,source:'marinade-phrase'});
      assert(difference(render(imported,1),render(direct,1)).maximum<1e-6);
    });
    if(!coreOnly){
      await check('Every crafted preset restores and renders audible finite PCM',async()=>{
        assert(scope.MarinadePresets.list.length>=20);const names=new Set(),evidence=[];for(const p of scope.MarinadePresets.list){assert(!names.has(p.name));names.add(p.name);const state=S.normalize(p.state);assert.equal(S.serialize(S.parseProject(S.serialize(state))),S.serialize(state));const core=await factory(state);core.start({beat:0,frame:0});const info=stats(render(core,.5));assert.equal(info.nonfinite,0,p.name);assert(info.rms>.00008,p.name+' audible');assert(info.peak<=1.00001);evidence.push({name:p.name,rms:+info.rms.toFixed(5),peak:+info.peak.toFixed(5)});}return evidence;
      });
      await check('Offline renders use deterministic 48k WAV/native PCM and never mutate the live patch',async()=>{
        assert.equal(typeof scope.MarinadeAudio,'function');const state=analyticState(),audio=new scope.MarinadeAudio(state),before=S.serialize(audio.state),events=[{note:69,velocity:.8,startBeat:.2,durationBeats:.6,voiceId:'synth'}],options={state,events,tempo:120,lengthBeats:4,tailSeconds:0};
        const ordinary=await audio.renderNotes(options),native=await audio.renderNotes({...options,includePCM:true});assert.equal(ordinary.pcm,undefined);assert(native.pcm instanceof Float32Array);assert.equal(native.pcm.length,96000*2);assert.equal(native.sampleRate,48000);assert.equal(native.channels,2);assert.equal(native.sourceApp,'marinade');
        const bytes=Buffer.from(await native.blob.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WAVE');assert.equal(bytes.readUInt16LE(22),2);assert.equal(bytes.readUInt32LE(24),48000);assert.equal(bytes.readUInt16LE(34),16);assert.deepEqual(bytes,Buffer.from(await ordinary.blob.arrayBuffer()));
        let peak=0;for(const x of native.pcm){assert(Number.isFinite(x));peak=Math.max(peak,Math.abs(x));}assert(peak>.001);assert.equal(S.serialize(audio.state),before);assert.equal(audio.context,null);
        const abort=new AbortController();abort.abort();await assert.rejects(audio.renderWav({bars:1,signal:abort.signal}),/abort|cancel/i);const pending=new AbortController(),promise=audio.renderWav({bars:16,signal:pending.signal});setTimeout(()=>pending.abort(),1);await assert.rejects(promise,/abort|cancel/i);return{frames:native.pcm.length/2,sampleRate:48000,peak};
      });
    }
  }
  const report = {checkedAt: new Date().toISOString(), passed: results.length, failed: failures.length, results, failures};
  if (process.env.MARINADE_QA_REPORT) fs.writeFileSync(process.env.MARINADE_QA_REPORT, JSON.stringify(report, null, 2) + '\n');
  console.log('\nMARINADE: ' + results.length + ' passed, ' + failures.length + ' failed.');
  if (failures.length) process.exitCode = 1;
})().catch(error => {console.error(error); process.exitCode = 1;});
