/* Kitchen native Web Audio compatibility. Dependency code is bundled at build
   time; graph processing is pulled by the DAW and never uses wall-clock audio. */
'use strict';
globalThis.global = globalThis.global || globalThis;
const WAE = require('web-audio-engine');
const FFT = require('fft.js');
const Fflate = require('fflate');
const Convolver = require('web-audio-engine/lib/impl/ConvolverNode');
const Compressor = require('web-audio-engine/lib/impl/DynamicsCompressorNode');
const AudioParamUtils = require('web-audio-engine/lib/utils/AudioParamUtils');
const Biquad = require('web-audio-engine/lib/impl/BiquadFilterNode');
const BiquadCoeffs = require('biquad-coeffs-webaudio');
const AudioParamImpl = require('web-audio-engine/lib/impl/AudioParam');
const Delay = require('web-audio-engine/lib/impl/DelayNode');
const ConstantSource = require('web-audio-engine/lib/impl/ConstantSourceNode');
const AudioContextImpl = require('web-audio-engine/lib/impl/AudioContext');

const QUANTUM = 128;
const scope = typeof window === 'object' ? window : globalThis;
// Flooring seconds directly can put an exact quantum boundary in the previous quantum
// (e.g. 3456 / 48000 * 48000 is 3455.9999999999995). That past task never runs,
// dropping the hit and retaining its source graph. Retain WAE's future-quantum
// activation rules, but never enqueue a new source behind the current quantum.
AudioContextImpl.prototype.sched = function (time, task) {
  const frame = Math.max(this.currentSampleFrame, Math.floor(time * this.sampleRate / this.blockSize) * this.blockSize) | 0;
  if (!this._sched[frame]) this._sched[frame] = [task];
  else this._sched[frame].push(task);
};
// WAE's ConstantSource fills every quantum indefinitely, ignoring its scheduled
// stop and never sending `ended`. CLATTER uses the original source's ended event
// to retire each resonator graph, so stopped voices otherwise accumulate forever.
// Match the browser's sample boundaries and dispatch completion after graph pull.
ConstantSource.prototype.dspInit = function () { this._done = false; };
ConstantSource.prototype.stop = function (when) {
  if (this._done) return;
  // A later stop() replaces an earlier scheduled stop until the source ends.
  // Keep WAE's numeric conversion and clamp to the started source's clock.
  this._stopTime = Math.max(this.context.currentTime, this._startTime, +when || 0);
  this._stopFrame = Math.round(this._stopTime * this.sampleRate);
};
ConstantSource.prototype.dspProcess = function () {
  const output = this.outputs[0].bus.getMutableData()[0], first = this.context.currentSampleFrame;
  output.fill(0);
  if (this._done) return;
  const begin = Math.max(0, Math.min(this.blockSize, this._startFrame - first));
  const end = Math.max(0, Math.min(this.blockSize, this._stopFrame - first));
  if (begin < end) {
    if (this._offset.hasSampleAccurateValues()) {
      const values = this._offset.getSampleAccurateValues();
      for (let i = begin; i < end; i++) output[i] = values[i];
    } else output.fill(this._offset.getValue(), begin, end);
  }
  if (this._stopFrame <= first + this.blockSize) {
    this._done = true;
    this.context.addPostProcess(() => {
      this.outputs[0].bus.zeros();
      this.outputs[0].disable();
      this.dispatchEvent({ type: 'ended' });
    });
  }
};
// WAE's original scheduler consumes a future zero-length setValue event before
// reaching its start, pulling a following release ramp into the sustain gap.
// Walk the same canonical event table, explicitly holding gaps and respecting
// each event's absolute sample range. No new sample/timeline array is allocated.
AudioParamImpl.prototype.dspValuesForTimeRange = function (output) {
  const start = this.context.currentSampleFrame, end = start + this.blockSize, timeline = this._timeline;
  let index = Math.max(0, this._currentEventIndex), at = start, value = this._value;
  while (at < end) {
    const event = timeline[index];
    if (!event) { output.fill(value, at - start); break; }
    if (at < event.startFrame) { const until = Math.min(end, event.startFrame); output.fill(value, at - start, until - start); at = until; continue; }
    if (event.endFrame <= at) {
      if (event.type === 'setValueAtTime' || event.type === 'linearRampToValueAtTime' || event.type === 'exponentialRampToValueAtTime') value = event.endValue;
      else if (event.type === 'setValueCurveAtTime') value = event.args[0][event.args[0].length - 1];
      index++; continue;
    }
    const until = Math.min(end, event.endFrame), count = until - at, range = event.endFrame - event.startFrame;
    if (event.type === 'setValueAtTime') { value = event.startValue; output.fill(value, at - start, until - start); }
    else if (event.type === 'linearRampToValueAtTime') {
      const slope = (event.endValue - event.startValue) / range;
      for (let i = 0; i < count; i++) output[at - start + i] = event.startValue + (at + i - event.startFrame) * slope;
      value = event.startValue + (until - event.startFrame) * slope;
    } else if (event.type === 'exponentialRampToValueAtTime') {
      const ratio = event.endValue / event.startValue, growth = Math.pow(ratio, 1 / range);
      value = event.startValue * Math.pow(ratio, (at - event.startFrame) / range);
      for (let i = 0; i < count; i++) { output[at - start + i] = value; value *= growth; }
    } else if (event.type === 'setTargetAtTime') {
      value = AudioParamUtils.computeValueAtTime(timeline, at / this.sampleRate, this._userValue);
      const coefficient = event.args[2] > 0 ? Math.exp(-1 / (this.sampleRate * event.args[2])) : 0, target = event.args[0];
      for (let i = 0; i < count; i++) { output[at - start + i] = value; value = target + coefficient * (value - target); }
    } else if (event.type === 'setValueCurveAtTime') {
      const curve = event.args[0];
      for (let i = 0; i < count; i++) { const position = (at + i - event.startFrame) / range * (curve.length - 1), lo = Math.min(curve.length - 1, Math.floor(position)); output[at - start + i] = curve[lo] + (position - lo) * (curve[Math.min(curve.length - 1, lo + 1)] - curve[lo]); }
      value = until === event.endFrame ? curve[curve.length - 1] : output[until - start - 1];
    }
    at = until;
  }
  this._value = value; this._currentEventIndex = index; this._remainSamples = 0; this._quantumStartFrame = end; this._hasSampleAccurateValues = true;
};
// Float32 ring indices in WAE can round a fractional read at the wrap to
// buffer.length, returning undefined/NaN. Accurate automation also omits the
// positive wrap. Keep the original preallocated delay kernels and interpolate
// with bounded double-precision indices instead.
Delay.prototype.dspProcess1 = Delay.prototype.dspProcess2 = Delay.prototype.dspProcessN = function () {
  const input = this.inputs[0].bus.getChannelData(), output = this.outputs[0].bus.getMutableData();
  const accurate = this._delayTime.hasSampleAccurateValues(), values = accurate ? this._delayTime.getSampleAccurateValues() : null, fixed = this._delayTime.getValue();
  for (let channel = 0; channel < output.length; channel++) {
    const kernel = this._kernels[channel], buffer = kernel._delayBuffer, length = buffer.length, write = kernel._virtualDelayIndex;
    buffer.set(input[channel] || input[0], write);
    for (let i = 0; i < this.blockSize; i++) {
      const seconds = Math.max(0, Math.min(kernel._maxDelayTime, values ? values[i] : fixed));
      let index = (write + i - seconds * this.sampleRate) % length; if (index < 0) index += length; if (index >= length) index = 0;
      const lo = Math.floor(index), hi = (lo + 1) % length, fraction = index - lo;
      output[channel][i] = buffer[lo] + fraction * (buffer[hi] - buffer[lo]);
    }
    kernel._virtualDelayIndex = (write + this.blockSize) % length;
  }
};
// Browser frequency parameters are clamped to Nyquist. WAE omits that bound,
// which otherwise makes unedited PICNIC patches unstable at lower DAW rates.
Biquad.prototype.dspUpdateCoefficients = function () {
  const frequency = Math.max(0, Math.min(this.sampleRate / 2, this._frequency.getSampleAccurateValues()[0]));
  const detune = this._detune.getSampleAccurateValues()[0], Q = this._Q.getSampleAccurateValues()[0], gain = this._gain.getSampleAccurateValues()[0];
  if (frequency === this._prevFrequency && detune === this._prevDetune && Q === this._prevQ && gain === this._prevGain) return false;
  this._coefficients = BiquadCoeffs[this._type](Math.max(0, Math.min(.5, frequency / this.sampleRate * Math.pow(2, detune / 1200))), Q, gain);
  this._prevFrequency = frequency; this._prevDetune = detune; this._prevQ = Q; this._prevGain = gain; return true;
};
if (!WAE.api.AudioParam.prototype.cancelAndHoldAtTime) WAE.api.AudioParam.prototype.cancelAndHoldAtTime = function (time) {
  const value = AudioParamUtils.computeValueAtTime(this._impl.getTimeline(), time, this._impl._userValue);
  this.cancelScheduledValues(time); this.setValueAtTime(value, time); return this;
};

class NativeScriptProcessor extends WAE.impl.AudioNode {
  constructor(context) {
    super(context, {}, { inputs: [2], outputs: [2], channelCount: 2, channelCountMode: 'explicit' });
    this.handler = null;
    const input = this.inputs[0].bus, output = this.outputs[0].bus;
    this.event = { playbackTime: 0, inputBuffer: { numberOfChannels: 2, length: QUANTUM, sampleRate: context.sampleRate, getChannelData: index => input.getChannelData()[index] }, outputBuffer: { numberOfChannels: 2, length: QUANTUM, sampleRate: context.sampleRate, getChannelData: index => output.getMutableData()[index] } };
  }
  dspProcess() {
    this.outputs[0].bus.getMutableData().forEach(channel => channel.fill(0));
    this.event.playbackTime = this.context.currentTime;
    this.handler?.(this.event);
  }
  getTailTime() { return Infinity; }
}

// web-audio-engine 0.13.4 leaves these two nodes as pass-through placeholders.
// Supply real DSP rather than silently omitting the instruments' room/limiter.
class UniformConvolver {
  constructor(impulse, block) {
    this.block = block; this.size = block * 2; this.fft = new FFT(this.size);
    this.count = Math.max(1, Math.ceil(impulse.length / block)); this.index = 0;
    this.history = Array.from({ length: this.count }, () => new Float64Array(this.size * 2));
    this.kernel = []; this.input = new Float64Array(this.size);
    this.sum = new Float64Array(this.size * 2); this.time = new Float64Array(this.size * 2);
    this.overlap = new Float64Array(block); this.output = new Float32Array(block);
    for (let partition = 0; partition < this.count; partition++) {
      this.input.fill(0); this.input.set(impulse.subarray(partition * block, (partition + 1) * block));
      const spectrum = new Float64Array(this.size * 2);
      this.fft.realTransform(spectrum, this.input); this.fft.completeSpectrum(spectrum); this.kernel.push(spectrum);
    }
  }
  process(input) {
    this.input.fill(0); this.input.set(input);
    const current = this.history[this.index]; this.fft.realTransform(current, this.input); this.fft.completeSpectrum(current);
    this.sum.fill(0);
    for (let partition = 0; partition < this.count; partition++) {
      const x = this.history[(this.index - partition + this.count) % this.count], h = this.kernel[partition];
      for (let bin = 0; bin < this.sum.length; bin += 2) {
        this.sum[bin] += x[bin] * h[bin] - x[bin + 1] * h[bin + 1];
        this.sum[bin + 1] += x[bin] * h[bin + 1] + x[bin + 1] * h[bin];
      }
    }
    this.fft.inverseTransform(this.time, this.sum);
    for (let i = 0; i < this.block; i++) { this.output[i] = this.time[i * 2] + this.overlap[i]; this.overlap[i] = this.time[(i + this.block) * 2]; }
    this.index = (this.index + 1) % this.count; return this.output;
  }
  reset() { this.index = 0; this.overlap.fill(0); this.history.forEach(value => value.fill(0)); }
}

class PartitionedConvolver {
  constructor(impulse) {
    // A short fine partition plus a coarse tail keeps long rooms bounded at
    // roughly O(IR partitions * FFT bins), without a whole-IR sample loop.
    this.head = new UniformConvolver(impulse.subarray(0, 2048), QUANTUM);
    this.tail = impulse.length > 2048 ? new UniformConvolver(impulse.subarray(2048), 2048) : null;
    this.tailInput = new Float32Array(2048); this.tailReady = new Float32Array(2048); this.offset = 0;
    this.output = new Float32Array(QUANTUM);
  }
  process(input) {
    this.output.set(this.head.process(input));
    if (this.tail) {
      for (let i = 0; i < QUANTUM; i++) this.output[i] += this.tailReady[this.offset + i];
      this.tailInput.set(input, this.offset); this.offset += QUANTUM;
      if (this.offset === 2048) { this.tailReady.set(this.tail.process(this.tailInput)); this.offset = 0; }
    }
    return this.output;
  }
  reset() { this.head.reset(); this.tail?.reset(); this.tailInput.fill(0); this.tailReady.fill(0); this.offset = 0; }
}

function normalization(data, enabled) {
  if (!enabled) return 1;
  let power = 0;
  for (const channel of data.channelData) for (let i = 0; i < channel.length; i++) power += channel[i] * channel[i];
  const rms = Math.max(.000125, Math.sqrt(power / Math.max(1, data.channelData.length * data.length)));
  return .00125 / rms * 44100 / data.sampleRate * (data.channelData.length === 4 ? .5 : 1);
}
function installConvolution(node) {
  if (node._kitchenNativeConvolver !== undefined && typeof scope.KitchenNativeDestroyConvolver === 'function') scope.KitchenNativeDestroyConvolver(node._kitchenNativeConvolver);
  node._kitchenNativeConvolver = undefined; node._kitchenConvolvers = null;
  const data = node._audioData;
  if (!data) return;
  const scale = normalization(data, node._normalize), ir = data.channelData.map(channel => Float32Array.from(channel, value => value * scale));
  node.outputs[0].setNumberOfChannels(ir.length > 1 ? 2 : Math.max(1, node.inputs[0].getNumberOfChannels()));
  if (ir.length <= 2 && typeof scope.KitchenNativeCreateConvolver === 'function') {
    const id = scope.KitchenNativeCreateConvolver(ir[0], ir[1] || ir[0], data.sampleRate);
    if (!Number.isInteger(id) || id < 0) throw Error('The native room convolution could not be prepared.');
    node._kitchenNativeConvolver = id;
  } else node._kitchenConvolvers = (ir.length === 1 ? [ir[0], ir[0]] : ir).map(channel => new PartitionedConvolver(channel));
}
const originalSetBuffer = Convolver.prototype.setBuffer;
Convolver.prototype.setBuffer = function (value) {
  if (value == null) { this._buffer = this._audioData = null; installConvolution(this); return; }
  originalSetBuffer.call(this, value); installConvolution(this);
};
Convolver.prototype.setNormalize = function (value) { this._normalize = !!value; if (this._audioData) installConvolution(this); };
Convolver.prototype.channelDidUpdate = function (count) { this.outputs[0].setNumberOfChannels(this._audioData?.channelData.length > 1 ? 2 : Math.min(2, count)); };
Convolver.prototype.getTailTime = function () { return this._audioData ? this._audioData.length / this._audioData.sampleRate : 0; };
Convolver.prototype.dspProcess = function () {
  const output = this.outputs[0].bus.getMutableData(), input = this.inputs[0].bus.getChannelData(), left = input[0], right = input[1] || left;
  output.forEach(channel => channel.fill(0));
  if (this._kitchenNativeConvolver !== undefined) {
    scope.KitchenNativeProcessConvolver(this._kitchenNativeConvolver, left, right, output[0], output[1] || output[0], QUANTUM); return;
  }
  const banks = this._kitchenConvolvers;
  if (!banks) return;
  const l = banks[0].process(left);
  output[0].set(l);
  if (banks.length === 2) { const r = banks[1].process(right); if (output[1]) output[1].set(r); }
  else {
    output[0].set(l); const lr = banks[1].process(left), rl = banks[2].process(right), rr = banks[3].process(right);
    for (let i = 0; i < QUANTUM; i++) { output[0][i] += rl[i]; output[1][i] = lr[i] + rr[i]; }
  }
};

const db = value => 20 * Math.log10(Math.max(1e-20, value));
const amp = value => Math.pow(10, value / 20);
function compressionCurve(value, threshold, knee, ratio) {
  const x = db(value), lower = threshold - knee * .5, upper = threshold + knee * .5;
  let y = x;
  if (knee > 0 && x > lower && x < upper) y = x + (1 / ratio - 1) * (x - lower) * (x - lower) / (2 * knee);
  else if (x >= upper) y = threshold + (x - threshold) / ratio;
  return amp(y - x);
}
Compressor.prototype.getTailTime = function () { return .006; };
Compressor.prototype.getReduction = function () { return this._kitchenReduction || 0; };
Compressor.prototype.dspProcess = function () {
  const input = this.inputs[0].bus.getChannelData(), output = this.outputs[0].bus.getMutableData();
  const l = input[0], r = input[1] || l, rate = this.context.sampleRate;
  const state = this._kitchenCompressor ||= { left: new Float32Array(Math.max(1, Math.round(rate * .006))), right: new Float32Array(Math.max(1, Math.round(rate * .006))), at: 0, gain: 1 };
  const threshold = this._threshold.getValue(), knee = Math.max(0, this._knee.getValue()), ratio = Math.max(1, this._ratio.getValue());
  const attack = Math.max(.00002, this._attack.getValue()), release = Math.max(.001, this._release.getValue());
  const attackCoef = Math.exp(-1 / (rate * attack)), releaseCoef = Math.exp(-1 / (rate * release));
  const makeup = Math.pow(1 / Math.max(.00001, compressionCurve(1, threshold, knee, ratio)), .6);
  for (let i = 0; i < this.context.blockSize; i++) {
    const desired = compressionCurve(Math.max(Math.abs(l[i]), Math.abs(r[i])), threshold, knee, ratio), coefficient = desired < state.gain ? attackCoef : releaseCoef;
    state.gain = desired + coefficient * (state.gain - desired);
    output[0][i] = state.left[state.at] * state.gain * makeup; if (output[1]) output[1][i] = state.right[state.at] * state.gain * makeup;
    state.left[state.at] = l[i]; state.right[state.at] = r[i]; state.at = (state.at + 1) % state.left.length;
  }
  this._kitchenReduction = db(state.gain);
};

function createContext(sampleRate) {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw RangeError('Unsupported native sample rate.');
  const context = new WAE.RenderingAudioContext({ sampleRate, blockSize: QUANTUM, numberOfChannels: 2 });
  context._impl.changeState('running');
  const makeCompressor = context.createDynamicsCompressor.bind(context);
  context.createDynamicsCompressor = () => {
    const node = makeCompressor(), length = Math.max(1, Math.round(sampleRate * .006));
    node._impl._kitchenCompressor = { left: new Float32Array(length), right: new Float32Array(length), at: 0, gain: 1 };
    return node;
  };
  context.createScriptProcessor = () => {
    const node = new WAE.api.AudioNode(context), impl = new NativeScriptProcessor(context._impl); node._impl = impl;
    Object.defineProperty(node, 'onaudioprocess', { get: () => impl.handler, set: value => { impl.handler = value; } });
    Object.defineProperty(node, 'bufferSize', { value: QUANTUM }); return node;
  };
  context.resume = () => { context._impl.changeState('running'); return Promise.resolve(); };
  context.suspend = () => { context._impl.changeState('suspended'); return Promise.resolve(); };
  context.close = () => { context._impl.changeState('closed'); return Promise.resolve(); };
  context.baseLatency = QUANTUM / sampleRate; context.outputLatency = 0;
  return context;
}
function createPull(context) {
  const ring = [new Float32Array(QUANTUM), new Float32Array(QUANTUM)]; let at = 0;
  return {
    process(left, right) {
      if (left.length !== right.length) throw RangeError('Provide equal stereo output buffers.');
      for (let i = 0; i < left.length; i++) {
        left[i] = ring[0][at]; right[i] = ring[1][at];
        if (++at === QUANTUM) { context._impl.process(ring, 0); at = 0; }
      }
    },
    // Keep quantum phase aligned to the monotonic native clock after a seek.
    reset() { ring.forEach(channel => channel.fill(0)); },
    getLatencySamples() { return QUANTUM; }
  };
}
function installContextFactory(sampleRate) {
  function Context() { return createContext(sampleRate); }
  scope.AudioContext = scope.webkitAudioContext = Context;
  scope.OfflineAudioContext = scope.webkitOfflineAudioContext = WAE.OfflineAudioContext;
  return Context;
}
// Only explicitly managed persistent controls use this helper. Keep a bounded
// checkpoint of completed smoothing history; arbitrary envelopes, curves and
// future automation retain their original event tables without modification.
function setTargetAtCurrentTime(param, value, timeConstant) {
  const impl = param._impl, now = impl.context.currentTime, timeline = impl._timeline;
  if (timeline.length >= 64 && timeline.every(event => event.time <= now
    && (event.type === 'setValueAtTime' || event.type === 'setTargetAtTime'))) {
    const held = AudioParamUtils.computeValueAtTime(timeline, now, impl._userValue);
    param.cancelScheduledValues(0);
    param.setValueAtTime(held, now);
  }
  return param.setTargetAtTime(value, now, timeConstant);
}
scope.KitchenWebAudioEngine = WAE;
scope.KitchenWebAudio = Object.freeze({ createContext, createPull, installContextFactory, setTargetAtCurrentTime, latencySamples: QUANTUM, normalization, PartitionedConvolver });
scope.KitchenNativeCompression = Fflate;
module.exports = { WAE, Fflate, createContext, createPull, installContextFactory, setTargetAtCurrentTime, normalization, PartitionedConvolver };
