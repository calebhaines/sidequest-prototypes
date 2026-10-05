/* FABLE: native stereo sample voices. Live and OfflineAudioContext use this same graph. */
(function () {
'use strict';
const TAU = Math.PI * 2, SR = 48000, MAX_GRAINS = 256, MAX_TEXTURE_VOICES = 16;
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(+n) ? +n : a));
const abort = signal => { if (signal?.aborted) throw new DOMException('Audio export cancelled.', 'AbortError'); };
const randomGenerator = seed => { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; };
const frequency = note => 440 * Math.pow(2, (note - 69) / 12);
const smooth = (param, value, at, time = .012) => { if (!Number.isFinite(value)) return; param.cancelScheduledValues(at); if (at === 0) param.setValueAtTime(value, 0); else param.setTargetAtTime(value, at, time); };
const envelopeValue = (envelope, age) => {
  if (age < 0) return 0;
  const a = Math.max(.0001, +envelope.attack || 0), d = Math.max(.0001, +envelope.decay || 0), s = clamp(envelope.sustain, 0, 1);
  return age < a ? age / a : age < a + d ? 1 + (s - 1) * (age - a) / d : s;
};
function distortion(amount) {
  if (!(amount > 0)) return null;
  const curve = new Float32Array(2048), drive = 1 + clamp(amount, 0, 1) * 20, scale = Math.atan(drive);
  for (let i = 0; i < curve.length; i++) { const x = i * 2 / (curve.length - 1) - 1; curve[i] = amount > 0 ? Math.atan(x * drive) / scale : x; }
  return curve;
}
function stereoWidth(context, width) {
  const input = context.createGain(), split = context.createChannelSplitter(2), merge = context.createChannelMerger(2), gains = [];
  input.channelCount = 2; input.channelCountMode = 'explicit'; input.connect(split);
  for (let from = 0; from < 2; from++) for (let to = 0; to < 2; to++) {
    const gain = context.createGain(); split.connect(gain, from); gain.connect(merge, 0, to); gains.push(gain);
  }
  const set = (value, at = context.currentTime) => { const w = clamp(value, 0, 2); gains.forEach((gain, i) => smooth(gain.gain, i === 0 || i === 3 ? (1 + w) / 2 : (1 - w) / 2, at)); };
  set(width, 0); return { input, output: merge, set, nodes: [input, split, merge, ...gains] };
}
const impulseCache = new Map();
function impulse(context) {
  const rate = context.sampleRate;
  if (impulseCache.has(rate)) return impulseCache.get(rate);
  const n = Math.round(rate * 1.65), buffer = context.createBuffer(2, n, rate), random = randomGenerator(871233);
  for (let ch = 0; ch < 2; ch++) { const data = buffer.getChannelData(ch); let low = 0; for (let i = 0; i < n; i++) { low += .18 * (random() * 2 - 1 - low); data[i] = low * Math.pow(1 - i / n, 2.8) * .38; } }
  impulseCache.set(rate, buffer); return buffer;
}
/* Every factory recipe becomes an ordinary sampled waveform, cached once per asset. */
function generateSeed(asset) {
  const rate = clamp(asset.sampleRate || 24000, 8000, 192000), duration = clamp(asset.duration, .03, 120), frames = Math.max(2, Math.round(rate * duration));
  const left = new Float32Array(frames), right = new Float32Array(frames), random = randomGenerator(asset.seed), f = frequency(asset.root ?? 60), recipe = asset.recipe || 'bell';
  let low = 0, dust = 0, dcL = 0, dcR = 0, phase = 0, peak = 0;
  const detune = .996 + random() * .008, strike = .6 + random() * .4;
  for (let i = 0; i < frames; i++) {
    const t = i / rate, x = random() * 2 - 1; low += .11 * (x - low);
    const edge = Math.min(1, i / Math.max(1, rate * .0015), (frames - 1 - i) / Math.max(1, rate * .028));
    let l = 0, r = 0;
    if (recipe === 'bell') {
      const ratios = [1, 2.756, 5.404, 8.933, 13.34], amps = [1, .48, .23, .12, .07];
      for (let k = 0; k < ratios.length; k++) { const env = Math.exp(-t * (1.7 + k * .75) / Math.max(.4, duration / 2)); l += Math.sin(TAU * f * ratios[k] * t) * amps[k] * env; r += Math.sin(TAU * f * ratios[k] * detune * t + k * .06) * amps[k] * env; }
    } else if (recipe === 'felt') {
      for (let k = 1; k <= 9; k++) { const amp = Math.exp(-t * (2.8 + k * .72)) / (k * k); l += Math.sin(TAU * f * (k + .00015 * k * k) * t) * amp; r += Math.sin(TAU * f * (k + .0002 * k * k) * t) * amp; }
      l += low * Math.exp(-t * 90) * strike; r += low * Math.exp(-t * 84) * strike;
    } else if (recipe === 'reed') {
      const env = Math.min(1, t / .032) * Math.pow(Math.max(0, 1 - t / duration), .32);
      for (let k = 1; k <= 15; k += 2) { const a = 1 / (k * 1.2); l += Math.sin(TAU * f * k * t + .035 * Math.sin(TAU * 5.1 * t)) * a; r += Math.sin(TAU * f * k * t + .05 * Math.sin(TAU * 4.8 * t)) * a; } l = (l + low * .17) * env; r = (r + x * .035) * env;
    } else if (recipe === 'tape') {
      const wobble = .0011 * Math.sin(TAU * 1.8 * t) + .00013 * Math.sin(TAU * 29 * t), env = Math.min(1, t / .025) * Math.pow(Math.max(0, 1 - t / duration), .65);
      for (let k = 1; k <= 16; k++) { const a = .7 / (k * Math.sqrt(k)); l += Math.sin(TAU * f * k * (t + wobble)) * a; r += Math.sin(TAU * f * k * (t + wobble * .88)) * a; } l = Math.tanh(l * 1.7 + low * .06) * env; r = Math.tanh(r * 1.7 + x * .014) * env;
    } else if (recipe === 'choir') {
      const env = Math.min(1, t / .08) * Math.pow(Math.max(0, 1 - t / duration), .28);
      for (let k = 1; k <= Math.min(32, rate / (f * 2)); k++) { const hz = f * k, a = (.08 + Math.exp(-Math.pow((hz - 730) / 230, 2)) + .62 * Math.exp(-Math.pow((hz - 1210) / 310, 2)) + .25 * Math.exp(-Math.pow((hz - 2600) / 420, 2))) / Math.sqrt(k); l += Math.sin(TAU * hz * t + .08 * Math.sin(TAU * 5.4 * t)) * a; r += Math.sin(TAU * hz * detune * t + .08 * Math.sin(TAU * 5.1 * t)) * a; } l = (l + low * .08) * env; r = (r + low * .1) * env;
    } else if (recipe === 'dust') {
      if (random() < 12 / rate) dust = random() * 2 - 1; dust *= .994;
      const env = Math.pow(Math.max(0, 1 - t / duration), .45); l = (low * .52 + dust * .65 + Math.sin(TAU * f * t) * Math.exp(-t * 3) * .15) * env; r = (x * .06 + low * .42 - dust * .42 + Math.sin(TAU * f * 1.006 * t) * Math.exp(-t * 3) * .15) * env;
    } else if (recipe === 'sub') {
      const env = Math.min(1, t / .009) * Math.exp(-t * 1.7); l = Math.tanh((Math.sin(TAU * f * t) + Math.sin(TAU * f * 2 * t) * .12) * 1.3) * env; r = l;
    } else {
      if ((asset.root ?? 36) <= 36) { phase += TAU * (f + f * 3.5 * Math.exp(-t * 45)) / rate; l = Math.sin(phase) * Math.exp(-t * 7) + x * Math.exp(-t * 170) * .1; r = l; }
      else if (asset.root <= 40) { const env = Math.exp(-t * 12); l = (x - low) * env * .65 + Math.sin(TAU * f * 1.8 * t) * Math.exp(-t * 18) * .55; r = (x - low * .9) * env * .62 + Math.sin(TAU * f * 2.01 * t) * Math.exp(-t * 19) * .45; }
      else { for (const hz of [3200, 4337, 5771, 6833, 9149]) { l += Math.sign(Math.sin(TAU * hz * t)) * .065; r += Math.sign(Math.sin(TAU * hz * 1.004 * t)) * .065; } l = (l + x * .4 - low * .35) * Math.exp(-t * 19); r = (r + x * .35 - low * .3) * Math.exp(-t * 18); }
    }
    dcL += .0007 * (l - dcL); dcR += .0007 * (r - dcR); l = (l - dcL) * Math.max(0, edge); r = (r - dcR) * Math.max(0, edge);
    left[i] = Number.isFinite(l) ? l : 0; right[i] = Number.isFinite(r) ? r : 0; peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const gain = peak > 0 ? .82 / peak : 0; for (let i = 0; i < frames; i++) { left[i] *= gain; right[i] *= gain; }
  return { left, right, sampleRate: rate, duration: frames / rate };
}
class Graph {
  constructor(context, state, getAudio, { offline = false, onNote } = {}) {
    this.context = context; this.state = state; this.getAudio = getAudio; this.offline = offline; this.onNote = onNote;
    this.voices = []; this.grains = []; this.serial = 0; this.roundRobin = new Map(); this.random = randomGenerator(state.seed); this.expression = { wheel: 0, pressure: 0, bend: 0 }; this.sustain = false;
    this.buffers = new Map(); this.cacheBytes = 0; this.nodes = []; this.oscillators = [];
    const c = context, add = node => { this.nodes.push(node); return node; };
    this.input = add(c.createGain()); this.drive = add(c.createWaveShaper()); this.drive.oversample = '2x'; this.tone = add(c.createBiquadFilter()); this.tone.type = 'lowpass'; this.tone.Q.value = .5;
    this.width = stereoWidth(c, state.master.width); this.nodes.push(...this.width.nodes);
    this.mix = add(c.createGain()); this.input.connect(this.drive); this.drive.connect(this.tone); this.tone.connect(this.width.input); this.width.output.connect(this.mix);
    const split = add(c.createChannelSplitter(2)), merge = add(c.createChannelMerger(2)); this.width.output.connect(split);
    this.delayL = add(c.createDelay(17)); this.delayR = add(c.createDelay(17)); this.feedbackL = add(c.createGain()); this.feedbackR = add(c.createGain()); this.delayWet = add(c.createGain());
    split.connect(this.delayL, 0); split.connect(this.delayR, 1); this.delayL.connect(this.feedbackL); this.feedbackL.connect(this.delayR); this.delayR.connect(this.feedbackR); this.feedbackR.connect(this.delayL); this.delayL.connect(merge, 0, 0); this.delayR.connect(merge, 0, 1); merge.connect(this.delayWet); this.delayWet.connect(this.mix);
    const chorusMerge = add(c.createChannelMerger(2)); this.chorusWet = add(c.createGain());
    for (let ch = 0; ch < 2; ch++) { const delay = add(c.createDelay(.1)); delay.delayTime.value = .018 + ch * .004; const osc = c.createOscillator(), depth = add(c.createGain()); osc.frequency.value = ch ? .31 : .27; depth.gain.value = .004; osc.connect(depth); depth.connect(delay.delayTime); split.connect(delay, ch); delay.connect(chorusMerge, 0, ch); osc.start(0); this.oscillators.push(osc); }
    chorusMerge.connect(this.chorusWet); this.chorusWet.connect(this.mix);
    this.room = add(c.createConvolver()); this.room.buffer = impulse(c); this.roomWet = add(c.createGain()); this.width.output.connect(this.room); this.room.connect(this.roomWet); this.roomWet.connect(this.mix);
    this.compressor = add(c.createDynamicsCompressor()); this.compressor.threshold.value = -9; this.compressor.knee.value = 9; this.compressor.ratio.value = 12; this.compressor.attack.value = .002; this.compressor.release.value = .12;
    this.output = add(c.createGain()); this.analyser = add(c.createAnalyser()); this.analyser.fftSize = 512; this.meterData = new Float32Array(512);
    this.mix.connect(this.compressor); this.compressor.connect(this.output); this.output.connect(this.analyser); this.analyser.connect(c.destination);
    this.setState(state, 0);
  }
  setState(state, at = this.context.currentTime) {
    this.state = state; const m = state.master;
    this.drive.curve = distortion(m.drive); this.drive.oversample = m.drive > 0 ? '2x' : 'none'; this.width.set(m.width, at); smooth(this.tone.frequency, clamp(m.tone, 20, this.context.sampleRate * .47), at);
    smooth(this.output.gain, clamp(m.level, 0, 1.5), at); smooth(this.delayL.delayTime, clamp(m.delaySync * 60 / state.tempo, .01, 16.8), at); smooth(this.delayR.delayTime, clamp(m.delaySync * 60 / state.tempo * 1.008, .01, 16.8), at);
    smooth(this.feedbackL.gain, clamp(m.feedback, 0, .85), at); smooth(this.feedbackR.gain, clamp(m.feedback, 0, .85), at);
    smooth(this.delayWet.gain, clamp(m.delay, 0, 1) * .52, at); smooth(this.chorusWet.gain, clamp(m.chorus, 0, 1) * .38, at); smooth(this.roomWet.gain, clamp(m.space, 0, 1) * .55, at);
    const ids = new Set(state.assets.map(a => a.id)); for (const [key, entry] of this.buffers) if (!ids.has(entry.assetId)) { this.buffers.delete(key); this.cacheBytes -= entry.bytes; }
    for (const voice of this.voices) { const zone = state.zones.find(z => z.id === voice.zone.id); if (zone) this.updateVoice(voice, zone, at); else this.release(voice, at, .025, true); }
    const limit = clamp(m.polyphony, 8, 64); while (this.voices.filter(v => !v.stolen && v.endAt > at).length > limit) this.steal(at);
  }
  updateVoice(voice, zone, at) {
    if (voice.stolen || voice.endAt <= at) return;
    const old = voice.zone, envelope = { ...old.envelope, sustain: zone.envelope.sustain, release: zone.envelope.release }, currentEnvelope = this.env(voice, at);
    const futureRelease = voice.releaseAt !== null && voice.releaseAt > at;
    if (old.engine === 'texture' && old.stretch !== zone.stretch) {
      voice.scanPosition += Math.max(0, at - voice.scanAt) / clamp(old.stretch, .125, 8); voice.scanAt = at;
      if (old.loopMode === 'off' && Math.abs((voice.releaseAt ?? -1) - voice.naturalAt) < .002) { voice.naturalAt = at + Math.max(0, voice.sample.naturalDuration - voice.scanPosition) * zone.stretch; voice.releaseAt = voice.naturalAt; }
    }
    const updated = { ...old, envelope, filter: { ...zone.filter, envelope: { ...zone.filter.envelope } } };
    for (const key of ['enabled', 'tracking', 'level', 'pan', 'width', 'transpose', 'tune', 'stretch', 'grainSize', 'grainDensity', 'jitter', 'position']) updated[key] = zone[key];
    voice.zone = updated;
    if (!zone.enabled && old.enabled) { this.release(voice, at, .025, true); return; }
    if (old.filter.type !== zone.filter.type) voice.filter.type = zone.filter.type;
    if (old.filter.q !== zone.filter.q) smooth(voice.filter.Q, zone.filter.q, at);
    if (old.filter.drive !== zone.filter.drive) { voice.drive.curve = distortion(zone.filter.drive); voice.drive.oversample = zone.filter.drive > 0 ? '2x' : 'none'; }
    if (old.width !== zone.width) voice.width.set(zone.width, at);
    if (old.envelope.sustain !== envelope.sustain || old.envelope.release !== envelope.release || old.stretch !== zone.stretch) {
      const amp = voice.amp.gain;
      amp.cancelScheduledValues(at); amp.setValueAtTime(currentEnvelope, at);
      if (voice.releaseAt !== null && voice.releaseAt <= at) {
        voice.releaseAt = at; voice.releaseLevel = currentEnvelope; voice.endAt = at + Math.max(.005, envelope.release); amp.linearRampToValueAtTime(0, voice.endAt);
      } else {
        const attackEnd = voice.at + Math.max(.0002, envelope.attack), decayEnd = attackEnd + Math.max(.0002, envelope.decay);
        if (at < attackEnd) { amp.linearRampToValueAtTime(1, attackEnd); amp.linearRampToValueAtTime(envelope.sustain, decayEnd); }
        else if (at < decayEnd) amp.linearRampToValueAtTime(envelope.sustain, decayEnd);
        else amp.setTargetAtTime(envelope.sustain, at, .012);
        if (futureRelease) { voice.releaseLevel = envelopeValue(envelope, voice.releaseAt - voice.at); amp.setValueAtTime(voice.releaseLevel, voice.releaseAt); voice.endAt = voice.releaseAt + Math.max(.005, envelope.release); amp.linearRampToValueAtTime(0, voice.endAt); }
      }
      if (voice.releaseAt !== null) voice.sources.forEach(source => { try { source.stop(voice.endAt + .002); } catch (_) {} });
    }
    const now = Math.max(at, voice.at); [voice.level.gain, voice.panner.pan, voice.filter.frequency, ...(voice.classic ? [voice.classic.playbackRate] : [])].forEach(param => param.cancelScheduledValues(now)); voice.nextMod = Math.min(voice.nextMod, now); this.automate(voice, now);
  }
  prepared(asset, zone) {
    const audio = this.getAudio(asset), frames = audio.left.length, start = Math.min(frames - 1, Math.max(0, Math.floor(clamp(zone.start, 0, 1) * frames))), end = Math.max(start + 1, Math.min(frames, Math.ceil(clamp(zone.end, 0, 1) * frames)));
    const loopA = Math.max(start, Math.min(end - 1, Math.floor(clamp(zone.loopStart, 0, 1) * frames))), loopB = Math.max(loopA + 1, Math.min(end, Math.ceil(clamp(zone.loopEnd, 0, 1) * frames)));
    const key = `${asset.id}:${start}:${end}:${loopA}:${loopB}:${zone.reverse ? 1 : 0}:${zone.loopMode}:${zone.crossfade}`;
    const existing = this.buffers.get(key); if (existing?.asset === asset || existing && existing.pcm === asset.pcm && existing.seed === asset.seed && existing.recipe === asset.recipe && existing.asset.root === asset.root && existing.asset.duration === asset.duration && existing.asset.sampleRate === asset.sampleRate) { this.buffers.delete(key); this.buffers.set(key, existing); return existing; }
    let a = loopA - start, b = loopB - start, n = end - start;
    if (zone.reverse) { const old = a; a = n - b; b = n - old; }
    const looping = zone.loopMode !== 'off', pingpong = zone.loopMode === 'pingpong', extra = pingpong ? b - a : 0, total = n + extra;
    const buffer = this.context.createBuffer(2, total, audio.sampleRate), channels = [audio.left, audio.right];
    for (let ch = 0; ch < 2; ch++) {
      const target = buffer.getChannelData(ch), source = channels[ch];
      for (let i = 0; i < n; i++) target[i] = source[zone.reverse ? end - 1 - i : start + i];
      if (pingpong) { target.copyWithin(b + extra, b); for (let i = 0; i < extra; i++) target[b + i] = source[zone.reverse ? end - 1 - (b - 1 - i) : start + b - 1 - i]; }
    }
    if (!looping) for (let ch = 0; ch < 2; ch++) { const data = buffer.getChannelData(ch), fade = Math.min(Math.round(audio.sampleRate * .003), Math.floor(n / 8)); for (let i = 0; i < fade; i++) data[n - 1 - i] *= i / Math.max(1, fade); }
    if (pingpong) b += extra;
    const fade = looping ? Math.min(Math.round(clamp(zone.crossfade, 0, 1) * audio.sampleRate), Math.floor((b - a) * .45)) : 0;
    if (fade > 1) for (let ch = 0; ch < 2; ch++) { const data = buffer.getChannelData(ch); for (let i = 0; i < fade; i++) { const mix = .5 - .5 * Math.cos(Math.PI * i / (fade - 1)); data[b - fade + i] = data[b - fade + i] * (1 - mix) + data[a + i] * mix; } }
    const entry = { buffer, duration: total / audio.sampleRate, naturalDuration: n / audio.sampleRate, loopStart: (a + fade) / audio.sampleRate, loopEnd: b / audio.sampleRate, bytes: total * 8, assetId: asset.id, asset, pcm: asset.pcm, seed: asset.seed, recipe: asset.recipe };
    if (existing) this.cacheBytes -= existing.bytes; this.buffers.set(key, entry); this.cacheBytes += entry.bytes;
    while (this.cacheBytes > 64 * 1024 * 1024 && this.buffers.size > 1) { const oldKey = this.buffers.keys().next().value, old = this.buffers.get(oldKey); this.cacheBytes -= old.bytes; this.buffers.delete(oldKey); }
    return entry;
  }
  lfo(index, voice, time) {
    const spec = this.state.lfos[index], age = spec.retrigger ? time - voice.at : time;
    const rate = spec.sync ? this.state.tempo / 60 / Math.max(.0625, spec.division) : spec.rate, phase = age * clamp(rate, .001, 40), p = phase - Math.floor(phase);
    let value = Math.sin(TAU * p);
    if (spec.shape === 'triangle') value = 1 - 4 * Math.abs(p - .5);
    if (spec.shape === 'square') value = p < .5 ? 1 : -1;
    if (spec.shape === 'random') { const n = Math.floor(phase), seed = (voice.randomSeed ^ Math.imul(n + 1, 2654435761) ^ Math.imul(index + 1, 974933)) >>> 0; value = randomGenerator(seed)() * 2 - 1; }
    return value * clamp(spec.depth, 0, 1);
  }
  modulation(voice, time) {
    const age = time - voice.at, env = this.env(voice, time), out = { pitch: 0, cutoff: 0, pan: 0, level: 0, start: 0, position: 0 };
    for (const route of this.state.modulation) {
      if (!route || route.source === 'off' || !route.amount || !(route.target in out)) continue;
      let source = 0;
      switch (route.source) { case 'lfo1': source = this.lfo(0, voice, time); break; case 'lfo2': source = this.lfo(1, voice, time); break; case 'velocity': source = voice.velocity; break; case 'key': source = (voice.note - 60) / 48; break; case 'wheel': source = this.expression.wheel; break; case 'pressure': source = this.expression.pressure; break; case 'random': source = voice.randomValue; break; case 'envelope': source = env; break; }
      out[route.target] += clamp(route.amount, -1, 1) * source;
    }
    return out;
  }
  env(voice, time) {
    if (voice.releaseAt !== null && time >= voice.releaseAt) return voice.releaseLevel * Math.max(0, 1 - (time - voice.releaseAt) / Math.max(.005, voice.zone.envelope.release));
    return envelopeValue(voice.zone.envelope, time - voice.at);
  }
  filterEnv(voice, time) {
    if (voice.releaseAt !== null && time >= voice.releaseAt) return envelopeValue(voice.zone.filter.envelope, voice.releaseAt - voice.at) * Math.max(0, 1 - (time - voice.releaseAt) / Math.max(.005, voice.zone.filter.envelope.release));
    return envelopeValue(voice.zone.filter.envelope, time - voice.at);
  }
  ratio(voice, mod) {
    const z = voice.zone, m = this.state.master, note = (z.tracking ? voice.note - z.root : 0) + z.transpose + m.transpose + (z.tune + m.tune) / 100 + this.expression.bend * m.bendRange + mod.pitch * 12;
    return clamp(Math.pow(2, note / 12), .000001, 65536);
  }
  selectZones(note, velocity, zoneId) {
    let zones = this.state.zones.filter(z => z.enabled && (zoneId ? z.id === zoneId : note >= z.low && note <= z.high && velocity * 127 >= z.velLow - .01 && velocity * 127 <= z.velHigh + .01));
    const groups = new Map();
    zones.forEach(z => { if (z.roundRobin) { if (!groups.has(z.roundRobin)) groups.set(z.roundRobin, []); groups.get(z.roundRobin).push(z); } });
    for (const [id, choices] of groups) { const index = this.roundRobin.get(id) || 0, chosen = choices[index % choices.length]; this.roundRobin.set(id, index + 1); zones = zones.filter(z => z.roundRobin !== id || z === chosen); }
    return zones;
  }
  steal(at, textureOnly = false) {
    const candidates = this.voices.filter(v => !v.stolen && v.endAt > at && (!textureOnly || v.zone.engine === 'texture'));
    if (!candidates.length) return;
    candidates.sort((a, b) => (a.at > at ? 1 : 0) - (b.at > at ? 1 : 0) || (a.releaseAt === null ? 1 : 0) - (b.releaseAt === null ? 1 : 0) || this.env(a, at) * a.velocity - this.env(b, at) * b.velocity || a.at - b.at);
    const voice = candidates[0]; voice.stolen = true; this.release(voice, at, .008, true); if (voice.at > at) { voice.endAt = at; voice.amp.gain.cancelScheduledValues(voice.at); voice.amp.gain.setValueAtTime(0, voice.at); voice.sources.forEach(source => { try { source.stop(at); } catch (_) {} }); }
  }
  noteOn(note, velocity, at, options = {}) {
    note = Math.round(clamp(note, 0, 127)); velocity = clamp(velocity, 0, 1); if (velocity <= 0) return [];
    const ids = [], zones = this.selectZones(note, velocity, options.zoneId), assets = new Map(this.state.assets.map(a => [a.id, a]));
    for (const original of zones) {
      const asset = assets.get(original.assetId); if (!asset) continue;
      const zone = { ...original, envelope: { ...original.envelope }, filter: { ...original.filter, envelope: { ...original.filter.envelope } } };
      if (zone.choke) this.voices.filter(v => v.zone.choke === zone.choke && v.endAt > at && !ids.includes(v.id)).forEach(v => this.release(v, at, .012, true));
      if (this.voices.filter(v => !v.stolen && v.endAt > at).length >= this.state.master.polyphony) this.steal(at);
      if (zone.engine === 'texture' && this.voices.filter(v => !v.stolen && v.endAt > at && v.zone.engine === 'texture').length >= MAX_TEXTURE_VOICES) this.steal(at, true);
      const c = this.context, sample = this.prepared(asset, zone), amp = c.createGain(), level = c.createGain(), filter = c.createBiquadFilter(), drive = c.createWaveShaper(), panner = c.createStereoPanner(), width = stereoWidth(c, zone.width);
      drive.curve = distortion(zone.filter.drive); drive.oversample = zone.filter.drive > 0 ? '2x' : 'none'; filter.type = zone.filter.type; filter.Q.value = clamp(zone.filter.q, .1, 24);
      amp.connect(drive); drive.connect(filter); filter.connect(width.input); width.output.connect(level); level.connect(panner); panner.connect(this.input);
      const voice = { id: ++this.serial, note, velocity, source: options.source || 'keyboard', zone, asset, sample, at, amp, level, filter, drive, panner, width, nodes: [amp, level, filter, drive, panner, ...width.nodes], sources: [], nextGrain: at, nextMod: at, scanPosition: 0, scanAt: at, releaseAt: null, releaseLevel: 0, endAt: Infinity, naturalAt: Infinity, sustained: false, stolen: false, announcedOff: false, randomValue: this.random() * 2 - 1, randomSeed: Math.floor(this.random() * 4294967296) };
      const e = zone.envelope; amp.gain.setValueAtTime(0, at); amp.gain.linearRampToValueAtTime(1, at + Math.max(.0002, e.attack)); amp.gain.linearRampToValueAtTime(clamp(e.sustain, 0, 1), at + Math.max(.0002, e.attack) + Math.max(.0002, e.decay));
      const mod = this.modulation(voice, at), ratio = this.ratio(voice, mod), baseStart = clamp(mod.start, 0, .95) * sample.naturalDuration;
      voice.startOffset = baseStart;
      if (zone.engine !== 'texture') {
        const source = c.createBufferSource(); source.buffer = sample.buffer; source.playbackRate.setValueAtTime(ratio, at); source.loop = zone.loopMode !== 'off'; source.loopStart = sample.loopStart; source.loopEnd = sample.loopEnd; source.connect(amp); source.start(at, Math.min(baseStart, sample.duration - 1 / sample.buffer.sampleRate)); voice.sources.push(source); voice.classic = source;
        if (!source.loop) { voice.naturalAt = at + (sample.duration - baseStart) / ratio; source.onended = () => { voice.endAt = Math.min(voice.endAt, c.currentTime); }; }
      } else if (zone.loopMode === 'off') {
        voice.naturalAt = at + sample.naturalDuration * clamp(zone.stretch, .125, 8); voice.endAt = voice.naturalAt + Math.max(.005, zone.envelope.release); this.release(voice, voice.naturalAt, zone.envelope.release, true);
      }
      this.voices.push(voice); ids.push(voice.id);
      if (Number.isFinite(options.duration) && (zone.playMode !== 'oneshot' || options.source === 'preview')) this.release(voice, at + Math.max(.01, options.duration), undefined, options.source === 'preview');
      if (!this.offline) this.onNote?.({ note, velocity, on: true, zoneId: zone.id, voiceId: voice.id });
      this.automate(voice, at);
    }
    return ids;
  }
  release(voice, at, override, force = false) {
    if (!force && voice.zone.playMode === 'oneshot') return;
    at = Math.max(voice.at, at); if (voice.releaseAt !== null && voice.releaseAt <= at) return;
    const release = Math.max(.005, override ?? voice.zone.envelope.release), level = this.env(voice, at); voice.releaseAt = at; voice.releaseLevel = level; voice.endAt = Math.min(voice.endAt, at + release); voice.sustained = false;
    voice.amp.gain.cancelScheduledValues(at); voice.amp.gain.setValueAtTime(level, at); voice.amp.gain.linearRampToValueAtTime(0, at + release);
    for (const source of voice.sources) try { source.stop(at + release + .002); } catch (_) {}
  }
  noteOff(note, at, source) {
    for (const v of this.voices) if (v.note === note && (!source || v.source === source) && v.endAt > at && v.zone.playMode !== 'oneshot') { if (this.sustain) v.sustained = true; else this.release(v, at); }
  }
  setSustain(enabled, at) { this.sustain = !!enabled; if (!enabled) this.voices.filter(v => v.sustained).forEach(v => this.release(v, at)); }
  allNotesOff(at) { this.sustain = false; this.voices.forEach(v => this.release(v, at, undefined, true)); }
  automate(voice, time) {
    const mod = this.modulation(voice, time), z = voice.zone, ratio = this.ratio(voice, mod), value = Math.pow(voice.velocity, clamp(this.state.master.velocityCurve, .25, 4));
    voice.level.gain.setValueAtTime(clamp(z.level, 0, 2) * value * clamp(1 + mod.level, 0, 2) * .62, time);
    voice.panner.pan.setValueAtTime(clamp(z.pan + mod.pan, -1, 1), time);
    const octaves = z.filter.keytrack * (voice.note - 60) / 12 + z.filter.velocity * (voice.velocity - .5) * 4 + z.filter.amount * this.filterEnv(voice, time) + mod.cutoff * 4;
    const cutoff = clamp(z.filter.cutoff * Math.pow(2, octaves), 20, this.context.sampleRate * .47); voice.filter.frequency.setValueAtTime(cutoff, time);
    if (voice.classic) voice.classic.playbackRate.setValueAtTime(ratio, time);
  }
  grain(voice, at) {
    this.grains = this.grains.filter(g => g.end > at);
    if (this.grains.length >= MAX_GRAINS) return;
    const z = voice.zone, sample = voice.sample, mod = this.modulation(voice, at), ratio = this.ratio(voice, mod), size = clamp(z.grainSize, .01, .5);
    let offset = voice.startOffset + voice.scanPosition + (at - voice.scanAt) / clamp(z.stretch, .125, 8) + (z.position + mod.position * .5) * sample.naturalDuration + (this.random() * 2 - 1) * z.jitter * sample.naturalDuration;
    if (z.loopMode !== 'off') {
      const length = Math.max(1 / sample.buffer.sampleRate, sample.loopEnd - sample.loopStart);
      if (offset >= sample.loopEnd || offset < 0) offset = sample.loopStart + ((offset - sample.loopStart) % length + length) % length;
    }
    offset = Math.max(0, offset);
    if (offset >= sample.duration) return;
    const duration = Math.min(size, z.loopMode === 'off' ? (sample.duration - offset) / ratio : size, voice.endAt - at); if (duration < .003) return;
    const c = this.context, source = c.createBufferSource(), gain = c.createGain(), density = clamp(z.grainDensity, 1, Math.min(64, 16 / size)), normalization = Math.min(1, 2 / (density * size));
    source.buffer = sample.buffer; source.playbackRate.setValueAtTime(ratio, at); source.loop = z.loopMode !== 'off'; source.loopStart = sample.loopStart; source.loopEnd = sample.loopEnd; source.connect(gain); gain.connect(voice.amp);
    const curve = new Float32Array(32); for (let i = 0; i < 32; i++) curve[i] = Math.pow(Math.sin(Math.PI * i / 31), 2) * normalization;
    gain.gain.setValueCurveAtTime(curve, at, duration); source.start(at, offset, duration * ratio); source.stop(at + duration + .001);
    const grain = { source, gain, end: at + duration }; this.grains.push(grain);
    source.onended = () => { try { source.disconnect(); gain.disconnect(); } catch (_) {} };
  }
  tick(from, to) {
    for (const voice of this.voices) {
      if (voice.endAt <= from) continue;
      while (voice.nextMod < Math.min(to, voice.endAt)) { this.automate(voice, Math.max(voice.at, voice.nextMod)); voice.nextMod += .025; }
      if (voice.zone.engine === 'texture') {
        const interval = 1 / clamp(voice.zone.grainDensity, 1, Math.min(64, 16 / clamp(voice.zone.grainSize, .01, .5)));
        while (voice.nextGrain < Math.min(to, voice.endAt)) { if (voice.nextGrain >= from - .1) this.grain(voice, Math.max(voice.nextGrain, from)); voice.nextGrain += interval; }
      }
    }
    this.cleanup(from);
  }
  cleanup(at) {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const voice = this.voices[i]; if (voice.endAt > at) continue;
      if (!this.offline && !voice.announcedOff) { voice.announcedOff = true; this.onNote?.({ note: voice.note, velocity: voice.velocity, on: false, zoneId: voice.zone.id, voiceId: voice.id }); }
      voice.sources.forEach(source => { try { source.disconnect(); } catch (_) {} }); voice.nodes.forEach(node => { try { node.disconnect(); } catch (_) {} }); this.voices.splice(i, 1);
    }
    this.grains = this.grains.filter(grain => grain.end > at);
  }
  getMeters(playing) {
    let peak = 0, sum = 0; this.analyser.getFloatTimeDomainData(this.meterData); for (const n of this.meterData) { peak = Math.max(peak, Math.abs(n)); sum += n * n; }
    const at = this.context.currentTime; return { peak, rms: Math.sqrt(sum / this.meterData.length), voices: this.voices.filter(v => !v.stolen && v.at <= at && v.endAt > at).length, grains: this.grains.filter(g => g.end > at).length, playing: !!playing };
  }
  destroy() {
    this.voices.forEach(v => { if (!this.offline && !v.announcedOff) this.onNote?.({ note: v.note, velocity: v.velocity, on: false, zoneId: v.zone.id, voiceId: v.id }); v.sources.forEach(s => { try { s.stop(); s.disconnect(); } catch (_) {} }); v.nodes.forEach(n => { try { n.disconnect(); } catch (_) {} }); });
    this.grains.forEach(g => { try { g.source.stop(); g.source.disconnect(); g.gain.disconnect(); } catch (_) {} }); this.oscillators.forEach(o => { try { o.stop(); o.disconnect(); } catch (_) {} }); this.nodes.forEach(n => { try { n.disconnect(); } catch (_) {} });
    this.voices = []; this.grains = []; this.buffers.clear();
  }
}
class FableAudio {
  constructor({ getState, onNote, onStep, onMeters, onStatus } = {}) {
    this.getState = getState || (() => window.FableSchema.defaultState()); this.state = this.getState(); this.onNote = onNote; this.onStep = onStep; this.onMeters = onMeters; this.onStatus = onStatus;
    this._context = null; this.graph = null; this.pending = null; this.timer = null; this.playing = false; this.generation = 0; this.assetCache = new Map(); this.held = new Map(); this.heldOrder = 0; this.expression = { wheel: 0, pressure: 0, bend: 0 }; this.sustain = false; this.stepQueue = []; this.nextAt = 0; this.step = 0; this.arpStep = 0; this.random = randomGenerator(this.state.seed);
  }
  get context() { return this._context; }
  get isPlaying() { return this.playing; }
  getAssetAudio(asset) {
    if (!asset || !asset.id) throw new Error('This zone has no valid sample.');
    const found = this.assetCache.get(asset.id);
    if (found && (found.asset === asset || found.asset.kind === asset.kind && found.asset.pcm === asset.pcm && found.asset.seed === asset.seed && found.asset.recipe === asset.recipe && found.asset.duration === asset.duration && found.asset.root === asset.root && found.asset.sampleRate === asset.sampleRate)) return found.audio;
    const audio = asset.kind === 'seed' ? generateSeed(asset) : window.FableSchema.decodeAsset(asset);
    if (!audio || !audio.left?.length || !audio.right?.length || audio.left.length !== audio.right.length) throw new Error('Sample data is empty or malformed.');
    this.assetCache.set(asset.id, { asset, audio }); return audio;
  }
  async init() {
    if (this.pending) return this.pending;
    if (this._context?.state === 'closed') { clearInterval(this.timer); this.timer = null; this.graph?.destroy(); this.graph = null; this._context = null; }
    if (this._context) { if (this._context.state === 'suspended') await this._context.resume(); return true; }
    this.pending = (async () => {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) throw new Error('This browser does not support Web Audio.');
      const context = new AC({ latencyHint: 'interactive' }); this._context = context;
      try { this.graph = new Graph(context, this.state, asset => this.getAssetAudio(asset), { onNote: event => this.onNote?.(event) }); this.graph.expression = this.expression; await context.resume(); this.timer = setInterval(() => this.tick(), 25); return true; }
      catch (error) { try { await context.close(); } catch (_) {} this._context = null; this.graph = null; throw error; }
    })(); try { return await this.pending; } finally { this.pending = null; }
  }
  setState(state) {
    this.state = state; this.graph?.setState(state);
    const ids = new Set(state.assets.map(a => a.id)); for (const id of this.assetCache.keys()) if (!ids.has(id)) this.assetCache.delete(id);
    if (!state.performance.hold && !this.sustain) for (const [key, entry] of this.held) if (!entry.down) this.held.delete(key);
  }
  noteOn(note, velocity = .8, { zoneId, duration, when, source = 'keyboard' } = {}) {
    if (!this.graph || this._context.state === 'closed') return [];
    note = Math.round(clamp(note, 0, 127)); velocity = clamp(velocity, 0, 1); if (velocity <= 0) { this.noteOff(note, { source, when }); return []; }
    const at = Math.max(this._context.currentTime, Number.isFinite(when) ? when : this._context.currentTime);
    const heldSource = source !== 'sequence' && source !== 'arp' && source !== 'preview' && !zoneId;
    if (heldSource) this.held.set(`${source}:${note}`, { note, velocity, source, down: true, order: ++this.heldOrder });
    if (heldSource && this.playing && this.state.performance.mode === 'arp') return [];
    const ids = this.graph.noteOn(note, velocity, at, { zoneId, duration, source }); this.graph.tick(at, at + .08); return ids;
  }
  noteOff(note, { source, when } = {}) {
    if (!this.graph) return; note = Math.round(clamp(note, 0, 127)); const at = Math.max(this._context.currentTime, Number.isFinite(when) ? when : this._context.currentTime);
    for (const [key, held] of this.held) if (held.note === note && (!source || held.source === source)) { held.down = false; if (!this.sustain && !this.state.performance.hold) this.held.delete(key); }
    this.graph.noteOff(note, at, source);
  }
  allNotesOff() { this.held.clear(); this.sustain = false; this.graph?.allNotesOff(this._context.currentTime); }
  setSustain(enabled) { this.sustain = !!enabled; if (!enabled && !this.state.performance.hold) for (const [key, held] of this.held) if (!held.down) this.held.delete(key); this.graph?.setSustain(enabled, this._context.currentTime); }
  setExpression(value = {}) { for (const key of ['wheel', 'pressure', 'bend']) if (value[key] !== undefined) this.expression[key] = clamp(value[key], key === 'bend' ? -1 : 0, 1); if (this.graph) this.graph.expression = this.expression; }
  async start(when) {
    const generation = this.generation; await this.init(); if (generation !== this.generation) return false;
    if (this.playing) return true; this.playing = true; this.step = 0; this.arpStep = 0; this.random = randomGenerator(this.state.seed); this.nextAt = Math.max(this._context.currentTime + .01, Number.isFinite(when) ? when : this._context.currentTime + .02); this.stepQueue = [];
    if (this.state.performance.mode === 'arp') this.graph.voices.forEach(v => this.graph.release(v, this._context.currentTime, .03, true));
    this.tick(); return true;
  }
  stop() { this.generation++; this.playing = false; this.stepQueue = []; this.graph?.allNotesOff(this._context.currentTime); this.held.clear(); this.sustain = false; this.onStep?.(-1); }
  panic() {
    this.stop(); this.expression = { wheel: 0, pressure: 0, bend: 0 }; this.graph?.destroy();
    if (this._context && this._context.state !== 'closed') this.graph = new Graph(this._context, this.state, asset => this.getAssetAudio(asset), { onNote: event => this.onNote?.(event) });
    if (this.graph) this.graph.expression = this.expression; this.onMeters?.({ peak: 0, rms: 0, voices: 0, grains: 0, playing: false });
  }
  scheduleStep(at) {
    const state = this.state, seconds = 60 / state.tempo;
    if (state.performance.mode === 'arp') {
      const p = state.performance, held = [...this.held.values()], notes = [];
      for (let octave = 0; octave < p.octaves; octave++) for (const h of held) if (h.note + octave * 12 <= 127) notes.push({ ...h, note: h.note + octave * 12 });
      if (p.arpMode !== 'asplayed') notes.sort((a, b) => a.note - b.note); else notes.sort((a, b) => a.order - b.order || a.note - b.note);
      let chosen = [];
      if (notes.length) { const step = this.arpStep; let index = step % notes.length; if (p.arpMode === 'down') index = notes.length - 1 - index; if (p.arpMode === 'updown' && notes.length > 1) { const n = step % (notes.length * 2 - 2); index = n < notes.length ? n : notes.length * 2 - 2 - n; } if (p.arpMode === 'random') index = Math.floor(this.random() * notes.length); chosen = p.arpMode === 'chord' ? notes : [notes[index]]; }
      const interval = seconds * p.division * (1 + (this.arpStep % 2 === 0 ? 1 : -1) * state.swing * .5);
      chosen.forEach(h => this.graph.noteOn(h.note, h.velocity * p.velocity, at, { source: 'arp', duration: Math.max(.01, interval * p.gate) })); this.stepQueue.push({ at, index: this.arpStep % 16 }); this.arpStep++; this.nextAt += interval;
    } else {
      const pattern = state.patterns[state.selectedPattern], index = this.step % pattern.length, step = pattern.steps[index], interval = seconds * .25 * (1 + (this.step % 2 === 0 ? 1 : -1) * state.swing * .5);
      if (step.on && this.random() <= step.probability) for (let hit = 0; hit < step.ratchet; hit++) this.graph.noteOn(step.note, step.velocity, at + hit * interval / step.ratchet, { source: 'sequence', duration: Math.max(.008, interval / step.ratchet * step.gate) });
      this.stepQueue.push({ at, index }); this.step++; this.nextAt += interval;
    }
  }
  tick() {
    if (!this.graph || this._context.state !== 'running') return;
    const now = this._context.currentTime, until = now + .085;
    if (this.playing) { if (this.nextAt < now - .3) this.nextAt = now + .01; let guard = 0; while (this.nextAt < until && guard++ < 32) this.scheduleStep(this.nextAt); }
    this.graph.tick(now, until);
    while (this.stepQueue[0]?.at <= now + .003) { const due = this.stepQueue.shift(); this.onStep?.(due.index); }
    this.onMeters?.(this.getMeters());
  }
  getMeters() { return this.graph ? this.graph.getMeters(this.playing) : { peak: 0, rms: 0, voices: 0, grains: 0, playing: false }; }
  async render({ state = this.state, scope = 'pattern', zoneId, note, velocity = .8, bars = 1, tailSeconds = 0, signal } = {}) {
    abort(signal); const snapshot = window.FableSchema.normalize(window.FableSchema.copy(state));
    if (!['zone', 'pattern'].includes(scope)) throw new Error('Choose a sample zone or pattern to render.');
    const tail = clamp(tailSeconds, 0, 12), count = Math.round(clamp(bars, 1, 16)); let body = count * 240 / snapshot.tempo, zone = null;
    if (scope === 'zone') {
      zone = snapshot.zones.find(z => z.id === (zoneId || snapshot.selectedZone)); if (!zone) throw new Error('Choose a sample zone first.');
      const asset = snapshot.assets.find(a => a.id === zone.assetId); if (!asset) throw new Error('This zone has no sample.');
      note = Math.round(clamp(note ?? zone.root, 0, 127)); const semitones = (zone.tracking ? note - zone.root : 0) + zone.transpose + snapshot.master.transpose + (zone.tune + snapshot.master.tune) / 100;
      const natural = this.getAssetAudio(asset).duration * Math.max(.0001, zone.end - zone.start) * (zone.engine === 'texture' ? zone.stretch : 1 / Math.pow(2, semitones / 12));
      if (zone.loopMode === 'off' && natural + tail > 120) throw new Error('This render exceeds the 120 second sample limit. Shorten the sample or stretch.');
      body = zone.loopMode === 'off' ? Math.max(.1, Math.min(120 - tail, natural + (zone.playMode === 'oneshot' && zone.engine === 'classic' ? 0 : Math.min(2, zone.envelope.release)))) : Math.max(.25, 240 / snapshot.tempo + Math.min(2, zone.envelope.release));
    }
    if (body + tail > 120) throw new Error('This render exceeds the 120 second sample limit. Shorten the sample, stretch, or pattern.');
    const frames = Math.max(2, Math.ceil((body + tail) * SR)), Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error('This browser cannot render audio offline.');
    /* Decode and capture all assets before the first await. Imported samples never fall back to a factory oscillator. */
    const audios = new Map(snapshot.assets.map(asset => [asset.id, this.getAssetAudio(asset)]));
    const context = new Offline(2, frames, SR), graph = new Graph(context, snapshot, asset => audios.get(asset.id), { offline: true }), random = randomGenerator(snapshot.seed);
    let nextStep = 0, index = 0, stopped = false, aborted = false, cursor = 0;
    const onAbort = () => { aborted = true; }; signal?.addEventListener('abort', onAbort, { once: true });
    const schedule = (from, to) => {
      abort(signal); if (aborted) abort({ aborted: true });
      if (scope === 'zone' && from === 0) graph.noteOn(note, velocity, 0, { zoneId: zone.id, source: 'preview', duration: Math.max(.01, zone.loopMode === 'off' && zone.playMode === 'oneshot' && zone.engine === 'classic' ? body : body - zone.envelope.release) });
      if (scope === 'pattern') {
        const pattern = snapshot.patterns[snapshot.selectedPattern], seconds = 60 / snapshot.tempo;
        while (nextStep < Math.min(to, body) - .000001) { const step = pattern.steps[index % pattern.length], interval = seconds * .25 * (1 + (index % 2 === 0 ? 1 : -1) * snapshot.swing * .5);
          if (step.on && random() <= step.probability) for (let hit = 0; hit < step.ratchet; hit++) graph.noteOn(step.note, step.velocity, nextStep + hit * interval / step.ratchet, { source: 'sequence', duration: Math.max(.008, interval / step.ratchet * step.gate) });
          index++; nextStep += interval;
        }
      }
      if (!stopped && to >= body) { graph.allNotesOff(body); stopped = true; }
      graph.tick(from, to);
    };
    try {
      /* Scheduling in half-second windows bounds the number of native grain nodes and permits cancellation. */
      let suspendAt = Math.min(.5, (frames - 128) / SR); schedule(0, Math.min(body + tail, .5));
      let suspension = suspendAt > 0 && suspendAt < frames / SR ? context.suspend(suspendAt) : null;
      const rendered = context.startRendering(); rendered.catch(() => {});
      while (suspension) {
        await suspension; abort(signal); cursor = context.currentTime; const next = Math.min(cursor + .5, (frames - 128) / SR);
        schedule(cursor, Math.min(body + tail, cursor + .5));
        suspension = next > cursor + .002 && next < frames / SR ? context.suspend(next) : null; await context.resume();
      }
      const buffer = await rendered; abort(signal);
      const left = buffer.getChannelData(0), right = buffer.getChannelData(1), pcm = new Float32Array(frames * 2), fade = Math.min(240, Math.floor(frames / 4));
      for (let i = 0; i < frames; i++) { const edge = Math.min(1, i / fade, (frames - 1 - i) / fade); pcm[i * 2] = clamp(left[i] * edge, -1, 1); pcm[i * 2 + 1] = clamp(right[i] * edge, -1, 1); }
      abort(signal); return { pcm, sampleRate: SR, name: scope === 'zone' ? zone.name : `${snapshot.name} — ${snapshot.patterns[snapshot.selectedPattern].name}`, tempo: snapshot.tempo, sourceApp: 'fable', sourceLabel: scope === 'zone' ? 'Sample zone' : 'Pattern', scope, bars: scope === 'pattern' ? count : undefined };
    } finally { signal?.removeEventListener('abort', onAbort); graph.destroy(); if (context.state === 'suspended') context.resume().catch(() => {}); /* A cancelled suspended render is released to finish with a disconnected graph. */ }
  }
}
window.FableAudio = FableAudio;
})();
