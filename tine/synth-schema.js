/* TINE uses physical units throughout its voice editor and synthesis engine. */
(function () {
  'use strict';

  const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const descriptor = (key, label, min, max, log, unit, hint) => Object.freeze({ id: key, key, label, min, max, log, unit, hint });

  const models = Object.freeze([
    Object.freeze({ id: 'string', name: 'String', description: 'A stretched string. Harmonic plucks become bright, wiry percussion as stiffness rises.', material: 'Tensioned wire', color: '#c9b597' }),
    Object.freeze({ id: 'beam', name: 'Beam', description: 'A struck bar with bending modes. Dry wooden knocks, hollow blocks, and ringing metal.', material: 'Struck bar', color: '#b5a27d' }),
    Object.freeze({ id: 'marimba', name: 'Marimba', description: 'A tuned wooden bar. Soft mallets reveal rounded fundamentals and bell-like overtones.', material: 'Tuned wood', color: '#a7b892' }),
    Object.freeze({ id: 'drumhead', name: 'Drumhead', description: 'A circular head under tension. Responsive toms, snares, and hand-drum tones.', material: 'Taut skin', color: '#c4a196' }),
    Object.freeze({ id: 'membrane', name: 'Membrane', description: 'A flexible resonating surface. Deep kicks, rubbery impacts, and bending low percussion.', material: 'Flexible surface', color: '#d0b095' }),
    Object.freeze({ id: 'plate', name: 'Plate', description: 'A dense sheet of resonant metal. Shimmering cymbals, gongs, and bright inharmonic impacts.', material: 'Metal sheet', color: '#99afb6' })
  ]);
  const noiseColors = Object.freeze([
    Object.freeze({ id: 'white', name: 'White', description: 'Even broadband energy for snare wires and crisp strikes.' }),
    Object.freeze({ id: 'pink', name: 'Pink', description: 'A softer, balanced texture for brushes and natural friction.' }),
    Object.freeze({ id: 'brown', name: 'Brown', description: 'Low, warm energy for felt, skin, and deep impacts.' }),
    Object.freeze({ id: 'blue', name: 'Blue', description: 'Bright upper-frequency energy for sizzling metal.' }),
    Object.freeze({ id: 'velvet', name: 'Velvet', description: 'Sparse, evenly spaced random impulses for grainy brushes.' }),
    Object.freeze({ id: 'crackle', name: 'Crackle', description: 'Irregular impulses for rattles, grit, and brittle surfaces.' })
  ]);
  const groups = Object.freeze({
    resonance: Object.freeze([
      descriptor('pitchHz', 'Pitch', 20, 2000, true, 'Hz', 'The lowest resonant mode. Higher modes follow the selected material.'),
      descriptor('decay', 'Decay', 0.04, 4, true, 's', 'T60: the time for the lowest mode to fall by 60 dB. Damping shortens the upper modes.'),
      descriptor('tone', 'Brightness', 0, 1, false, '%', 'Balance low and high resonant modes without changing the material.'),
      descriptor('stiffness', 'Stiffness', 0, 1, false, '%', 'Spread the upper resonances away from their natural ratios. More stiffness produces metallic or prepared tones.'),
      descriptor('damping', 'Damping', 0, 1, false, '%', 'How quickly high-frequency resonances lose energy. Low values ring; high values sound dry.'),
      descriptor('position', 'Strike position', 0.02, 0.98, false, '%', 'Move the impact point across the resonator. Each position excites a different balance of modes.')
    ]),
    exciter: Object.freeze([
      descriptor('mallet', 'Mallet', 0, 1, false, '%', 'Strength of the short physical strike that excites the resonator.'),
      descriptor('hardness', 'Hardness', 0, 1, false, '%', 'Soft felt emphasizes the fundamental; hard contact excites upper modes.'),
      descriptor('strikeTime', 'Contact time', 0.0003, 0.03, true, 's', 'Duration of the mallet contact. Short contact is sharp; longer contact softens the impact.'),
      descriptor('noise', 'Noise', 0, 1, false, '%', 'Amount of filtered noise exciting the resonator: brushes, wires, friction, or a rattle.'),
      descriptor('noiseAttack', 'Noise attack', 0.0005, 0.3, true, 's', 'Time for the noise exciter to rise to its peak.'),
      descriptor('noiseDecay', 'Noise decay', 0.005, 1, true, 's', 'Time for the noise excitation to fade after its attack.'),
      descriptor('noiseCutoff', 'Noise cutoff', 100, 16000, true, 'Hz', 'Low-pass cutoff shaping the noise before it reaches the resonator.'),
      descriptor('direct', 'Direct exciter', 0, 1, false, '%', 'Mix a little of the raw contact and noise into the output for extra attack and snare texture.')
    ]),
    motion: Object.freeze([
      descriptor('pitchEnv', 'Pitch bend', -24, 24, false, 'st', 'Pitch offset at the start of each strike. It settles to the voice pitch over the bend time.'),
      descriptor('pitchTime', 'Bend time', 0.002, 0.5, true, 's', 'How quickly the strike settles from its pitch bend to the fundamental.'),
      descriptor('variation', 'Variation', 0, 1, false, '%', 'Introduce small per-strike changes in tuning and contact position for a lively, organic feel.'),
      descriptor('velocityTone', 'Accent color', 0, 1, false, '%', 'How strongly accented steps excite the bright upper modes. Accents always play louder.'),
      descriptor('level', 'Level', 0, 1, false, '%', 'Voice level after the resonator and direct exciter are mixed.'),
      descriptor('pan', 'Pan', -1, 1, false, 'pan', 'Place the voice in the stereo field.')
    ])
  });
  const numeric = Object.freeze(Object.values(groups).flat());
  const modelIds = models.map((model) => model.id);
  const colorIds = noiseColors.map((color) => color.id);
  const trackKeys = ['name', 'model', 'noiseColor', 'mute', 'solo', 'steps', ...numeric.map((parameter) => parameter.key)];

  const common = Object.freeze({
    name: 'NEW VOICE', pitchHz: 220, decay: 0.55, tone: 0.5, stiffness: 0.1,
    damping: 0.35, position: 0.23, mallet: 0.8, hardness: 0.5, strikeTime: 0.002,
    noise: 0.1, noiseColor: 'pink', noiseAttack: 0.0005, noiseDecay: 0.035,
    noiseCutoff: 6000, direct: 0.1, pitchEnv: 0, pitchTime: 0.035,
    variation: 0.035, velocityTone: 0.3, level: 0.5, pan: 0, mute: false, solo: false
  });
  const voicing = Object.freeze({
    string: Object.freeze({ name: 'WIRE PLUCK', pitchHz: 220, decay: 1.25, tone: 0.52, stiffness: 0.12, damping: 0.22, position: 0.19, mallet: 0.76, hardness: 0.44, strikeTime: 0.0025, noise: 0.1, noiseDecay: 0.026, noiseCutoff: 4200, direct: 0.12, pitchTime: 0.022, variation: 0.025, velocityTone: 0.28, level: 0.5 }),
    beam: Object.freeze({ name: 'TIMBER BEAM', pitchHz: 520, decay: 0.42, tone: 0.54, stiffness: 0.18, damping: 0.52, position: 0.28, mallet: 0.88, hardness: 0.62, strikeTime: 0.0015, noise: 0.08, noiseDecay: 0.02, direct: 0.08, level: 0.48 }),
    marimba: Object.freeze({ name: 'FELT MARIMBA', pitchHz: 261.626, decay: 0.95, tone: 0.42, stiffness: 0.025, damping: 0.3, mallet: 0.95, hardness: 0.22, strikeTime: 0.0035, noise: 0.035, noiseColor: 'brown', noiseAttack: 0.0008, noiseDecay: 0.028, noiseCutoff: 2400, direct: 0.035, level: 0.48 }),
    drumhead: Object.freeze({ name: 'TAUT DRUMHEAD', pitchHz: 190, decay: 0.58, tone: 0.57, stiffness: 0.11, damping: 0.38, position: 0.38, mallet: 0.72, hardness: 0.57, strikeTime: 0.0015, noise: 0.38, noiseColor: 'white', noiseDecay: 0.09, noiseCutoff: 7200, direct: 0.22, pitchEnv: 3, level: 0.58 }),
    membrane: Object.freeze({ name: 'FELT KICK', pitchHz: 52, decay: 0.55, tone: 0.24, stiffness: 0.045, damping: 0.3, position: 0.15, mallet: 0.92, hardness: 0.36, strikeTime: 0.003, noise: 0.055, noiseColor: 'brown', noiseDecay: 0.026, noiseCutoff: 1800, direct: 0.16, pitchEnv: 14, level: 0.7 }),
    plate: Object.freeze({ name: 'BRUSHED PLATE', pitchHz: 620, decay: 0.8, tone: 0.7, stiffness: 0.68, damping: 0.18, position: 0.41, mallet: 0.72, hardness: 0.8, strikeTime: 0.0008, noise: 0.45, noiseColor: 'blue', noiseDecay: 0.045, noiseCutoff: 14000, direct: 0.2, variation: 0.05, level: 0.34 })
  });

  function defaults(model) {
    const id = modelIds.includes(model) ? model : 'membrane';
    return Object.assign({}, common, voicing[id], { model: id, steps: Array(16).fill(0) });
  }

  function normalizeTrack(track) {
    const input = isRecord(track) ? track : {};
    const result = defaults(input.model);
    if (typeof input.name === 'string') {
      const name = input.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 32);
      if (name) result.name = name;
    }
    for (const parameter of numeric) {
      if (typeof input[parameter.key] === 'number' && Number.isFinite(input[parameter.key])) {
        result[parameter.key] = clamp(input[parameter.key], parameter.min, parameter.max);
      }
    }
    if (colorIds.includes(input.noiseColor)) result.noiseColor = input.noiseColor;
    for (const key of ['mute', 'solo']) if (typeof input[key] === 'boolean') result[key] = input[key];
    if (Array.isArray(input.steps)) {
      result.steps = Array.from({ length: 16 }, (_, index) => {
        const value = input.steps[index];
        return typeof value === 'number' && Number.isFinite(value) ? clamp(Math.round(value), 0, 2) : 0;
      });
    }
    return result;
  }

  const exactKeys = (object, keys) => isRecord(object) && Object.keys(object).length === keys.length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(object, key));
  const validSteps = (steps) => Array.isArray(steps) && steps.length === 16
    && Array.from(steps).every((step) => Number.isInteger(step) && step >= 0 && step <= 2);

  function validateTrack(track) {
    return exactKeys(track, trackKeys) && typeof track.name === 'string' && track.name.trim().length > 0
      && track.name.length <= 32 && !/[\u0000-\u001f\u007f]/.test(track.name)
      && modelIds.includes(track.model) && colorIds.includes(track.noiseColor)
      && typeof track.mute === 'boolean' && typeof track.solo === 'boolean' && validSteps(track.steps)
      && numeric.every((parameter) => finite(track[parameter.key], parameter.min, parameter.max));
  }

  function validateProject(project) {
    if (!exactKeys(project, ['app', 'version', 'state', 'banks', 'bank', 'selected']) || project.app !== 'TINE' || project.version !== 1) return false;
    const state = project.state;
    if (!exactKeys(state, ['name', 'bpm', 'swing', 'drive', 'space', 'master', 'tracks'])) return false;
    if (typeof state.name !== 'string' || !state.name.trim() || state.name.length > 80 || /[\u0000-\u001f\u007f]/.test(state.name)) return false;
    if (!finite(state.bpm, 40, 240) || !finite(state.swing, 0, 0.6) || !['drive', 'space', 'master'].every((key) => finite(state[key], 0, 1))) return false;
    if (!Array.isArray(state.tracks) || state.tracks.length !== 8 || !Array.from(state.tracks).every(validateTrack)) return false;
    if (!Array.isArray(project.banks) || project.banks.length !== 4 || !Array.from(project.banks).every((bank) => Array.isArray(bank) && bank.length === 8 && Array.from(bank).every(validSteps))) return false;
    return Number.isInteger(project.bank) && project.bank >= 0 && project.bank <= 3
      && Number.isInteger(project.selected) && project.selected >= 0 && project.selected <= 7;
  }

  function format(parameter, value) {
    const control = typeof parameter === 'string' ? numeric.find((entry) => entry.key === parameter) : parameter;
    if (!control || typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const readable = (number, digits) => String(Number(number.toFixed(digits)));
    switch (control.unit) {
      case 'Hz': return value >= 1000 ? readable(value / 1000, 2) + ' kHz' : readable(value, value < 100 ? 1 : 0) + ' Hz';
      case 's': return value < 1 ? readable(value * 1000, value < 0.01 ? 1 : 0) + ' ms' : readable(value, 2) + ' s';
      case '%': return Math.round(value * 100) + '%';
      case 'st': return (value > 0 ? '+' : '') + readable(value, 1) + ' st';
      case 'pan': return Math.abs(value) < 0.005 ? 'Center' : Math.round(Math.abs(value) * 100) + (value < 0 ? ' L' : ' R');
      default: return readable(value, 2);
    }
  }

  window.TineModel = Object.freeze({ models, noiseColors, groups, defaults, normalizeTrack, validateTrack, validateProject, format });
}());
