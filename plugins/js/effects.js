/* Kitchen native-plugin effect adapter.
 *
 * DSP is the unchanged GALLEY factory code loaded before this file. No browser,
 * WebAudio graph or editor is required. State is { params: { ... } }; actual
 * typed parameter values are accepted by setParameter. The separate normalized
 * helpers map native VST values in [0,1] using linear numeric ranges, stepped
 * enum indices and a 0.5 boolean threshold. process() modifies two independent
 * Float32 channel views in place. A clock belongs to the audio thread, not the UI.
 */
(function (scope) {
  'use strict';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const copy = value => JSON.parse(JSON.stringify(value));
  const plain = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const INSERT_IDS = Object.freeze(['prism', 'velvet', 'cinder', 'undertow', 'parallax', 'vestige', 'halo', 'tremor', 'broiler', 'glaze', 'scales', 'strainer', 'swirl', 'crumble', 'saute', 'preserve', 'tinpan', 'ferment', 'sunday', 'cellar', 'board', 'cupboard']);
  const ids = Object.freeze(INSERT_IDS.concat(['track-eq', 'mastering']));
  const categories = {
    prism: 'Fx|EQ', velvet: 'Fx|Dynamics', cinder: 'Fx|Distortion', undertow: 'Fx|Modulation',
    parallax: 'Fx|Delay', vestige: 'Fx|Reverb', halo: 'Fx|Pitch Shift', tremor: 'Fx|Modulation',
    broiler: 'Fx|Distortion|Guitar', glaze: 'Fx|Tools', scales: 'Fx|Tools', strainer: 'Fx|Filter',
    swirl: 'Fx|Modulation', crumble: 'Fx|Distortion', saute: 'Fx|Distortion', preserve: 'Fx|Distortion',
    tinpan: 'Fx|Distortion', ferment: 'Fx|Pitch Shift|Guitar', sunday: 'Fx|Distortion|Guitar',
    cellar: 'Fx|Distortion|Guitar', board: 'Fx|Distortion|Guitar', cupboard: 'Fx|Reverb',
    'track-eq': 'Fx|EQ', mastering: 'Fx|Mastering'
  };
  let effectFactory, eqFactory, masteringFactory, definitionCache;
  function effects() {
    if (!effectFactory) {
      if (typeof scope.createLoomEffectsDSP !== 'function') throw Error('Load GALLEY effect DSP sources before the native effect adapter.');
      effectFactory = scope.createLoomEffectsDSP();
    }
    return effectFactory;
  }
  function eq() {
    if (!eqFactory) {
      if (typeof scope.createLoomTrackEQDSP !== 'function') throw Error('Load GALLEY channel EQ DSP before creating CHANNEL EQ.');
      eqFactory = scope.createLoomTrackEQDSP();
    }
    return eqFactory;
  }
  function mastering() {
    if (!masteringFactory) {
      if (typeof scope.createLoomMasteringDSP !== 'function') throw Error('Load GALLEY mastering DSP before creating MASTERING.');
      masteringFactory = scope.createLoomMasteringDSP();
    }
    return masteringFactory;
  }
  function parameter(descriptor, defaultValue) {
    const result = {
      path: 'params.' + descriptor.key, key: descriptor.key, label: descriptor.label || descriptor.key,
      type: descriptor.type || 'range', default: defaultValue, unit: descriptor.unit || '',
      normalization: 'linear'
    };
    if (result.type === 'select') {
      result.options = descriptor.options.map(option => ({ value: option.value, label: option.label }));
      result.min = 0; result.max = Math.max(0, result.options.length - 1); result.step = 1;
    } else if (result.type === 'boolean') {
      result.min = 0; result.max = 1; result.step = 1;
    } else {
      result.min = descriptor.min; result.max = descriptor.max; result.step = descriptor.step || 0;
      if (descriptor.scale) result.displayScale = descriptor.scale;
    }
    result.normalizedDefault = toNormalized(result, defaultValue);
    return result;
  }
  function toNormalized(descriptor, value) {
    if (descriptor.type === 'boolean') return value === true || value === 1 ? 1 : 0;
    if (descriptor.type === 'select') {
      const index = descriptor.options.findIndex(option => option.value === value);
      return descriptor.max ? Math.max(0, index) / descriptor.max : 0;
    }
    return finite(value) && descriptor.max > descriptor.min ? clamp((value - descriptor.min) / (descriptor.max - descriptor.min), 0, 1) : 0;
  }
  function fromNormalized(descriptor, value) {
    if (!finite(value)) throw TypeError('A normalized plugin parameter must be finite.');
    const normalized = clamp(value, 0, 1);
    if (descriptor.type === 'boolean') return normalized >= .5;
    if (descriptor.type === 'select') return descriptor.options[Math.round(normalized * descriptor.max)].value;
    return descriptor.min + normalized * (descriptor.max - descriptor.min);
  }
  function definitionsInternal() {
    if (definitionCache) return definitionCache;
    if (!Array.isArray(scope.LoomEffectsCatalog)) throw Error('Load GALLEY effect catalogs before reading native effect definitions.');
    const catalog = new Map(scope.LoomEffectsCatalog.map(item => [item.id, item]));
    const result = INSERT_IDS.map(id => {
      const item = catalog.get(id);
      if (!item) throw Error('Missing GALLEY effect catalog: ' + id);
      const parameters = item.params.map(descriptor => parameter(descriptor, item.defaults[descriptor.key]));
      parameters.push(parameter({ key: 'bypass', label: 'Bypass', type: 'boolean' }, item.defaults.bypass === true));
      return {
        id, name: item.name, kind: 'effect', category: 'insert', vst3Category: categories[id],
        description: item.description || '', subtitle: item.subtitle || '', color: item.color, accent: item.accent,
        panel: item.panel || null, parameters, defaults: { params: copy(item.defaults) },
        webDefinition: copy(item),
        groups: copy(item.groups || []), presets: copy(item.presets || []),
        acceptsMidi: false, producesMidi: id === 'ferment'
      };
    });
    const eqSpec = eq().specifications;
    const eqLabels = { low: 'Low', lowMid: 'Low mid', highMid: 'High mid', high: 'High', lowMidFreq: 'Low mid sweep', highMidFreq: 'High mid sweep' };
    const eqDefaults = Object.fromEntries(Object.entries(eqSpec).map(([key, rule]) => [key, rule[2]])); eqDefaults.bypass = false;
    result.push({ id: 'track-eq', name: 'CHANNEL EQ', kind: 'effect', category: 'utility', vst3Category: categories['track-eq'],
      description: 'GALLEY channel EQ: four gains and two sweepable mid bands.', color: '#cdd5a4',
      parameters: Object.entries(eqSpec).map(([key, rule]) => parameter({ key, label: eqLabels[key], min: rule[0], max: rule[1], step: key.endsWith('Freq') ? 1 : .1, unit: key.endsWith('Freq') ? 'Hz' : 'dB' }, rule[2])).concat([parameter({ key: 'bypass', label: 'Bypass', type: 'boolean' }, false)]),
      defaults: { params: eqDefaults }, acceptsMidi: false, producesMidi: false });
    const masterSpec = mastering().specifications, masterDefaults = mastering().normalize({});
    const words = key => key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase());
    result.push({ id: 'mastering', name: 'MASTERING', kind: 'effect', category: 'utility', vst3Category: categories.mastering,
      description: 'GALLEY mastering bench: cleanup, EQ, glue, stereo field, colour and peak guard.', color: '#d5c78c',
      parameters: Object.entries(masterSpec).map(([key, rule]) => parameter(typeof rule[0] === 'boolean' ? { key, label: words(key), type: 'boolean' } : { key, label: words(key), min: rule[0], max: rule[1], step: /Freq|Cut|sidechain/.test(key) ? 1 : .01 }, masterDefaults[key])),
      defaults: { params: masterDefaults }, acceptsMidi: false, producesMidi: false });
    definitionCache = result;
    return result;
  }
  function definition(id) {
    const result = definitionsInternal().find(item => item.id === id);
    if (!result) throw Error('Unknown Kitchen effect plugin: ' + id);
    return result;
  }
  function descriptorFor(id, path) {
    if (typeof path !== 'string') throw TypeError('A plugin parameter needs a path.');
    const fullPath = path.startsWith('params.') ? path : 'params.' + path;
    const result = definition(id).parameters.find(item => item.path === fullPath);
    if (!result) throw Error('Unknown parameter for ' + id + ': ' + path);
    return result;
  }
  function stateValues(state) {
    if (state == null) return {};
    if (!plain(state)) throw TypeError('Effect state must be an object containing params.');
    const params = own(state, 'params') ? state.params : state;
    if (!plain(params)) throw TypeError('Effect params must be an object.');
    return params;
  }
  function actualValue(descriptor, value) {
    if (descriptor.type === 'boolean') {
      if (typeof value === 'boolean') return value;
      if (value === 0 || value === 1) return value === 1;
      throw TypeError(descriptor.label + ' must be a boolean.');
    }
    if (descriptor.type === 'select') {
      if (descriptor.options.some(option => option.value === value)) return value;
      if (Number.isInteger(value) && value >= 0 && value < descriptor.options.length) return descriptor.options[value].value;
      throw RangeError('Unknown ' + descriptor.label + ' option.');
    }
    if (!finite(value)) throw TypeError(descriptor.label + ' must be finite.');
    return clamp(value, descriptor.min, descriptor.max);
  }
  function create(id, sampleRate, state) {
    const def = definition(id);
    if (!finite(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw RangeError('Kitchen effects support sample rates from 8 to 192 kHz.');
    let params;
    function normalize(values) {
      const merged = Object.assign({}, def.defaults.params, stateValues(values));
      if (id === 'track-eq') {
        const normalized = {};
        for (const descriptor of def.parameters) normalized[descriptor.key] = actualValue(descriptor, merged[descriptor.key]);
        return normalized;
      }
      return id === 'mastering' ? mastering().normalize(merged) : effects().normalize(id, merged);
    }
    params = normalize(state);
    const processor = id === 'track-eq' ? new (eq().TrackEQ)(sampleRate, params) : id === 'mastering' ? mastering().create(sampleRate, params) : effects().create(id, sampleRate, params);
    const clock = { sampleRate, tempo: 120, beat: 0, playing: false, frame: 0, samplePosition: 0, revision: 0, timeSigNumerator: 4, timeSigDenominator: 4 };
    const numericClockKeys = ['tempo', 'beat', 'frame', 'samplePosition', 'revision', 'timeSigNumerator', 'timeSigDenominator', 'loopStart', 'loopEnd'];
    function transport(next) {
      if (next == null) return;
      if (!plain(next)) throw TypeError('Plugin transport must be a clock object.');
      if (own(next, 'sampleRate') && next.sampleRate !== sampleRate) throw Error('Recreate the plugin processor when its sample rate changes.');
      for (const key of numericClockKeys) if (own(next, key) && !finite(next[key])) throw TypeError('Invalid plugin clock ' + key + '.');
      if (own(next, 'tempo') && next.tempo <= 0) throw RangeError('DAW tempo must be positive.');
      for (const key of numericClockKeys) if (own(next, key)) clock[key] = next[key];
      if (own(next, 'playing')) clock.playing = next.playing === true || next.playing === 1;
      if (own(next, 'looping')) clock.looping = next.looping === true || next.looping === 1;
    }
    function setState(next) {
      const normalized = normalize(next);
      processor.setParams(normalized); params = normalized;
    }
    function setParameter(path, value) {
      const descriptor = descriptorFor(id, path), patch = { [descriptor.key]: actualValue(descriptor, value) };
      // Preserve the canonical partial-update behavior, including effect memory,
      // bypass fades and model transitions. Do not reconstruct the processor.
      processor.setParams(patch);
      params = normalize({ params: Object.assign({}, params, patch) });
    }
    const api = {
      getState() { return { params: Object.assign({}, params) }; },
      setState, setParameter,
      setNormalizedParameter(path, value) { const descriptor = descriptorFor(id, path); setParameter(descriptor.path, fromNormalized(descriptor, value)); },
      reset() { processor.reset(); }, transport,
      process(left, right, nextClock) {
        if (Object.prototype.toString.call(left) !== '[object Float32Array]' || Object.prototype.toString.call(right) !== '[object Float32Array]' || left.length !== right.length) throw TypeError('Kitchen effects need equal-length Float32 stereo channels.');
        if (left.buffer === right.buffer && left.byteOffset < right.byteOffset + right.byteLength && right.byteOffset < left.byteOffset + left.byteLength) throw Error('Kitchen effect channels must not alias.');
        transport(nextClock);
        if (id !== 'track-eq' || !params.bypass) processor.process(left, right, clock);
        clock.frame += left.length;
        if (clock.playing) { clock.beat += left.length / sampleRate * clock.tempo / 60; clock.samplePosition += left.length; }
      },
      getTailSeconds() {
        const value = id === 'track-eq' ? params.bypass ? 0 : .1 : processor.getTailTime(clock);
        return finite(value) ? Math.max(0, value) : 0;
      },
      getMeters() { return typeof processor.getMeters === 'function' ? processor.getMeters() : {}; },
      // Wet-path pitch/tape delays remain artistic processing, as in GALLEY.
      // They must not be advertised as a fixed full-plugin compensation delay.
      getLatencySamples() { return 0; }
    };
    if (id === 'ferment') {
      api.startMidiCapture = options => processor.startMidiCapture(options);
      api.stopMidiCapture = reason => processor.stopMidiCapture(reason);
      // Canonical capture returns {events:[{pitch,startFrame,endFrame,velocity}],
      // frames,sampleRate,tempo,...}; it is a note-capture batch, not live MIDI.
      api.drainMidiEvents = () => processor.drainMidiEvents();
    }
    return api;
  }
  scope.KitchenEffectPlugins = Object.freeze({
    ids, definitions: () => copy(definitionsInternal()), create,
    parameterToNormalized(id, path, value) { return toNormalized(descriptorFor(id, path), value); },
    parameterFromNormalized(id, path, value) { return fromNormalized(descriptorFor(id, path), value); }
  });
})(typeof window === 'undefined' ? globalThis : window);
