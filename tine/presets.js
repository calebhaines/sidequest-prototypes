/* Eight original kits. Every sound is an exciter driving a modeled resonator. */
(function () {
  'use strict';

  function voice(name, model, pattern, settings) {
    const steps = pattern.replace(/\s/g, '').split('').map(Number);
    if (steps.length !== 16 || steps.some((step) => !Number.isInteger(step) || step < 0 || step > 2)) throw new Error('Invalid TINE preset pattern.');
    return window.TineModel.normalizeTrack(Object.assign(window.TineModel.defaults(model), settings, { name, model, steps }));
  }

  window.TINE_PRESETS = [
    {
      name: 'Soft machinery',
      tagline: 'Felt, wire, wood, and skin. Eight small objects finding a pulse.',
      bpm: 108, swing: 0.12, drive: 0.1, space: 0.22,
      tracks: [
        voice('FELT KICK', 'membrane', '2000 0010 2000 0010', { pitchHz: 52, decay: 0.53, level: 0.76, tone: 0.21, pitchEnv: 15, pitchTime: 0.04, variation: 0.02 }),
        voice('SNARE SKIN', 'drumhead', '0000 2000 0000 2001', { pitchHz: 183, decay: 0.36, damping: 0.63, tone: 0.59, mallet: 0.7, hardness: 0.72, noise: 0.68, noiseDecay: 0.12, noiseCutoff: 7600, direct: 0.37, level: 0.57, pitchEnv: 4, pitchTime: 0.025 }),
        voice('BRUSH HAT', 'plate', '2021 2021 2021 2011', { pitchHz: 1460, decay: 0.14, tone: 0.78, stiffness: 0.82, damping: 0.88, mallet: 0.26, hardness: 0.94, noise: 0.76, noiseDecay: 0.028, direct: 0.18, noiseCutoff: 14300, level: 0.27, pan: -0.18 }),
        voice('OPEN METAL', 'plate', '0000 0010 0000 0010', { pitchHz: 1080, decay: 0.65, tone: 0.72, damping: 0.39, mallet: 0.38, noise: 0.52, noiseColor: 'pink', noiseDecay: 0.068, direct: 0.15, level: 0.25, pan: 0.22 }),
        voice('TIMBER RIM', 'beam', '0010 0000 0010 0000', { pitchHz: 660, decay: 0.17, tone: 0.62, stiffness: 0.08, damping: 0.76, position: 0.31, noise: 0.04, direct: 0.08, level: 0.31, pan: -0.28 }),
        voice('FELT KEY', 'marimba', '0000 0001 0010 0001', { pitchHz: 329.628, decay: 0.57, hardness: 0.28, strikeTime: 0.0028, damping: 0.43, noise: 0.025, level: 0.37, pan: 0.3 }),
        voice('WIRE PLUCK', 'string', '0001 0000 0000 0100', { pitchHz: 164.814, decay: 0.62, stiffness: 0.08, position: 0.22, tone: 0.48, damping: 0.41, noise: 0.065, direct: 0.09, level: 0.3, pan: -0.36 }),
        voice('HOLLOW TOM', 'drumhead', '0000 0000 0100 0001', { pitchHz: 110, decay: 0.63, tone: 0.35, damping: 0.43, noise: 0.09, noiseColor: 'brown', noiseDecay: 0.033, direct: 0.09, pitchEnv: 7, pitchTime: 0.065, level: 0.38, pan: 0.15 })
      ]
    },
    {
      name: 'Amber courtyard',
      tagline: 'Sun-warmed wood, low hand drums, and a loose afternoon pocket.',
      bpm: 94, swing: 0.22, drive: 0.07, space: 0.3,
      tracks: [
        voice('PALM BASS', 'membrane', '2000 0001 0020 0010', { pitchHz: 58.27, decay: 0.64, tone: 0.29, position: 0.24, hardness: 0.27, strikeTime: 0.005, pitchEnv: 8, pitchTime: 0.06, noise: 0.07, level: 0.7 }),
        voice('HAND DRUM', 'drumhead', '0000 2000 0000 2001', { pitchHz: 174.614, decay: 0.44, tone: 0.53, position: 0.56, hardness: 0.44, strikeTime: 0.0035, noise: 0.25, noiseColor: 'pink', noiseDecay: 0.042, direct: 0.18, pitchEnv: 2, variation: 0.13, level: 0.57 }),
        voice('SEED SHAKER', 'plate', '2010 1011 2010 1010', { pitchHz: 1220, decay: 0.1, tone: 0.64, stiffness: 0.5, damping: 0.96, mallet: 0.08, hardness: 0.72, noise: 0.78, noiseColor: 'velvet', noiseAttack: 0.002, noiseDecay: 0.048, noiseCutoff: 9500, direct: 0.4, variation: 0.18, level: 0.27, pan: -0.22 }),
        voice('BRASS DISH', 'plate', '0000 0000 0010 0000', { pitchHz: 610, decay: 1.05, stiffness: 0.35, damping: 0.28, hardness: 0.55, strikeTime: 0.002, noise: 0.11, noiseColor: 'pink', direct: 0.06, level: 0.23, pan: 0.28 }),
        voice('WOODBLOCK', 'beam', '0001 0000 0000 0010', { pitchHz: 750, decay: 0.19, tone: 0.51, stiffness: 0.04, damping: 0.8, position: 0.18, hardness: 0.63, noise: 0.025, direct: 0.035, level: 0.32, pan: -0.34 }),
        voice('AMBER KEY', 'marimba', '0010 0000 0100 0001', { pitchHz: 349.228, decay: 0.95, tone: 0.38, hardness: 0.21, strikeTime: 0.0035, damping: 0.29, noise: 0.02, level: 0.44, pan: 0.25 }),
        voice('LOW STRING', 'string', '1000 0000 0010 0000', { pitchHz: 146.832, decay: 1.15, tone: 0.38, stiffness: 0.04, damping: 0.44, position: 0.17, hardness: 0.34, strikeTime: 0.004, noise: 0.025, direct: 0.03, pitchEnv: -0.4, pitchTime: 0.024, level: 0.34, pan: -0.12 }),
        voice('FINGER TOM', 'drumhead', '0000 0100 0000 0001', { pitchHz: 220, decay: 0.3, tone: 0.48, position: 0.7, hardness: 0.58, noise: 0.1, noiseColor: 'brown', noiseDecay: 0.02, direct: 0.06, pitchEnv: 3, variation: 0.16, level: 0.35, pan: 0.36 })
      ]
    },
    {
      name: 'Tension study',
      tagline: 'Prepared metal, taut wires, and a precisely crooked rhythm.',
      bpm: 128, swing: 0.07, drive: 0.23, space: 0.16,
      tracks: [
        voice('RUBBER KICK', 'membrane', '2000 0020 1002 0010', { pitchHz: 47, decay: 0.34, stiffness: 0.19, tone: 0.34, damping: 0.5, position: 0.11, hardness: 0.62, strikeTime: 0.0013, pitchEnv: 20, pitchTime: 0.03, direct: 0.23, level: 0.73 }),
        voice('STEEL SNARE', 'drumhead', '0000 2001 0000 2010', { pitchHz: 236, decay: 0.24, tone: 0.69, stiffness: 0.54, damping: 0.73, hardness: 0.88, strikeTime: 0.0007, noise: 0.76, noiseColor: 'white', noiseDecay: 0.085, noiseCutoff: 10300, direct: 0.32, pitchEnv: 7, pitchTime: 0.011, level: 0.53 }),
        voice('THIN WASHER', 'plate', '2110 2021 1102 2011', { pitchHz: 1720, decay: 0.09, tone: 0.9, stiffness: 0.91, damping: 0.94, mallet: 0.45, hardness: 1, strikeTime: 0.0003, noise: 0.46, noiseColor: 'blue', noiseDecay: 0.022, direct: 0.17, level: 0.25, pan: -0.2 }),
        voice('METAL BREATH', 'plate', '0000 0010 0000 0001', { pitchHz: 820, decay: 0.42, tone: 0.78, stiffness: 0.87, damping: 0.41, mallet: 0.26, noise: 0.66, noiseColor: 'velvet', noiseAttack: 0.008, noiseDecay: 0.12, direct: 0.13, level: 0.23, pan: 0.27 }),
        voice('PREPARED BAR', 'beam', '0001 0000 0010 0100', { pitchHz: 420, decay: 0.23, tone: 0.73, stiffness: 0.82, damping: 0.69, position: 0.62, hardness: 0.97, strikeTime: 0.0005, noise: 0.1, noiseColor: 'crackle', noiseDecay: 0.018, direct: 0.1, pitchEnv: -5, pitchTime: 0.025, level: 0.35, pan: -0.34 }),
        voice('NEEDLE STRING', 'string', '0100 1001 0010 0101', { pitchHz: 440, decay: 0.19, tone: 0.8, stiffness: 0.69, damping: 0.8, position: 0.09, hardness: 0.88, strikeTime: 0.0006, noise: 0.05, direct: 0.08, pitchEnv: -2, pitchTime: 0.012, variation: 0.11, level: 0.25, pan: 0.34 }),
        voice('BENT KEY', 'marimba', '0000 0001 0100 0000', { pitchHz: 293.665, decay: 0.35, tone: 0.59, stiffness: 0.35, damping: 0.62, hardness: 0.58, strikeTime: 0.0014, noise: 0.055, direct: 0.05, pitchEnv: 12, pitchTime: 0.037, level: 0.3, pan: -0.09 }),
        voice('BOLT RATTLE', 'plate', '1000 0000 0010 0000', { pitchHz: 270, decay: 0.61, tone: 0.54, stiffness: 0.97, damping: 0.54, mallet: 0.31, noise: 0.68, noiseColor: 'crackle', noiseAttack: 0.001, noiseDecay: 0.14, noiseCutoff: 5800, direct: 0.29, variation: 0.2, level: 0.21, pan: 0.09 })
      ]
    },
    {
      name: 'Glasshouse pulse',
      tagline: 'A steady floor beneath clear keys and floating silver.',
      bpm: 122, swing: 0.03, drive: 0.08, space: 0.4,
      tracks: [
        voice('ROUND KICK', 'membrane', '2000 2000 2000 2000', { pitchHz: 55, decay: 0.46, tone: 0.27, damping: 0.44, pitchEnv: 12, pitchTime: 0.037, noise: 0.04, direct: 0.11, level: 0.74 }),
        voice('PAPER SNARE', 'drumhead', '0000 2000 0000 2000', { pitchHz: 220, decay: 0.28, tone: 0.48, stiffness: 0.07, damping: 0.76, noise: 0.72, noiseColor: 'pink', noiseDecay: 0.17, noiseCutoff: 6200, direct: 0.39, pitchEnv: 1.5, level: 0.53 }),
        voice('SILVER TICK', 'plate', '1010 1010 1010 1011', { pitchHz: 1380, decay: 0.105, tone: 0.8, damping: 0.9, hardness: 0.88, noise: 0.31, noiseColor: 'blue', noiseDecay: 0.015, direct: 0.07, level: 0.27, pan: -0.23 }),
        voice('FLOATING HAT', 'plate', '0020 0020 0020 0020', { pitchHz: 960, decay: 0.77, tone: 0.68, stiffness: 0.57, damping: 0.31, mallet: 0.43, noise: 0.41, noiseColor: 'pink', noiseDecay: 0.07, direct: 0.1, level: 0.26, pan: 0.26 }),
        voice('GLASS BLOCK', 'beam', '0000 0001 0000 0100', { pitchHz: 880, decay: 0.32, tone: 0.61, stiffness: 0.43, damping: 0.43, hardness: 0.71, strikeTime: 0.001, noise: 0.025, direct: 0.03, level: 0.27, pan: -0.39 }),
        voice('CLEAR KEY', 'marimba', '0100 0010 0100 0011', { pitchHz: 440, decay: 0.84, tone: 0.52, stiffness: 0.05, damping: 0.29, hardness: 0.42, strikeTime: 0.0024, noise: 0.018, direct: 0.018, level: 0.37, pan: 0.32 }),
        voice('OCTAVE WIRE', 'string', '1000 0000 0010 0000', { pitchHz: 220, decay: 1.08, tone: 0.43, stiffness: 0.045, damping: 0.34, position: 0.26, hardness: 0.38, noise: 0.025, direct: 0.035, level: 0.3, pan: -0.1 }),
        voice('SINGING DISH', 'plate', '1000 0000 0000 1000', { pitchHz: 440, decay: 1.65, tone: 0.46, stiffness: 0.25, damping: 0.19, mallet: 0.55, hardness: 0.44, strikeTime: 0.0035, noise: 0.055, noiseColor: 'pink', direct: 0.025, level: 0.21, pan: 0.08 })
      ]
    },
    {
      name: 'Night on the low tide',
      tagline: 'Slow pressure, worn brushes, and long resonances in the dark.',
      bpm: 82, swing: 0.2, drive: 0.12, space: 0.44,
      tracks: [
        voice('DEEP MEMBRANE', 'membrane', '2000 0001 0020 0010', { pitchHz: 43.65, decay: 0.85, tone: 0.17, damping: 0.51, hardness: 0.2, strikeTime: 0.006, pitchEnv: 9, pitchTime: 0.07, noise: 0.028, direct: 0.07, level: 0.74 }),
        voice('WORN SNARE', 'drumhead', '0000 2000 0000 2000', { pitchHz: 146.832, decay: 0.52, tone: 0.38, damping: 0.62, hardness: 0.38, noise: 0.62, noiseColor: 'pink', noiseAttack: 0.002, noiseDecay: 0.2, noiseCutoff: 4700, direct: 0.29, pitchEnv: 2, level: 0.55 }),
        voice('QUIET BRUSH', 'plate', '2010 1011 2010 1010', { pitchHz: 970, decay: 0.15, tone: 0.56, stiffness: 0.44, damping: 0.92, mallet: 0.12, hardness: 0.59, noise: 0.68, noiseColor: 'velvet', noiseAttack: 0.0035, noiseDecay: 0.058, noiseCutoff: 8000, direct: 0.27, variation: 0.12, level: 0.25, pan: -0.24 }),
        voice('DARK METAL', 'plate', '0000 0000 0010 0000', { pitchHz: 640, decay: 1.02, tone: 0.47, stiffness: 0.58, damping: 0.4, hardness: 0.48, noise: 0.23, noiseColor: 'pink', noiseAttack: 0.018, noiseDecay: 0.11, noiseCutoff: 6200, direct: 0.06, level: 0.22, pan: 0.29 }),
        voice('DOOR KNOCK', 'beam', '0001 0000 0000 0010', { pitchHz: 330, decay: 0.23, tone: 0.32, stiffness: 0.03, damping: 0.82, position: 0.4, hardness: 0.37, strikeTime: 0.004, noise: 0.055, noiseColor: 'brown', direct: 0.05, level: 0.31, pan: -0.36 }),
        voice('LOW FELT KEY', 'marimba', '0000 0010 0001 0000', { pitchHz: 174.614, decay: 1.32, tone: 0.29, stiffness: 0.02, damping: 0.41, hardness: 0.13, strikeTime: 0.0045, noise: 0.01, direct: 0.01, level: 0.4, pan: 0.22 }),
        voice('BASS STRING', 'string', '1000 0000 1000 0000', { pitchHz: 73.416, decay: 1.58, tone: 0.26, stiffness: 0.02, damping: 0.5, position: 0.21, hardness: 0.25, strikeTime: 0.007, noise: 0.018, noiseColor: 'brown', direct: 0.035, pitchEnv: -0.6, pitchTime: 0.07, level: 0.36, pan: -0.08 }),
        voice('DISTANT TOM', 'drumhead', '0000 0000 0000 0001', { pitchHz: 110, decay: 0.84, tone: 0.28, damping: 0.4, position: 0.62, hardness: 0.3, strikeTime: 0.0045, noise: 0.06, noiseColor: 'brown', direct: 0.04, pitchEnv: 4, pitchTime: 0.095, level: 0.33, pan: 0.38 })
      ]
    },
    {
      name: 'Objects in motion',
      tagline: 'Fast hands on a table of found percussion. Bright, busy, alive.',
      bpm: 140, swing: 0.1, drive: 0.16, space: 0.19,
      tracks: [
        voice('TAUT KICK', 'membrane', '2000 0010 0020 0100', { pitchHz: 58.27, decay: 0.31, tone: 0.35, damping: 0.62, hardness: 0.58, strikeTime: 0.0017, pitchEnv: 17, pitchTime: 0.025, direct: 0.17, level: 0.75 }),
        voice('QUICK SNARE', 'drumhead', '0000 2001 0001 2010', { pitchHz: 196, decay: 0.21, tone: 0.63, damping: 0.8, hardness: 0.79, strikeTime: 0.0009, noise: 0.66, noiseColor: 'white', noiseDecay: 0.08, noiseCutoff: 9200, direct: 0.32, pitchEnv: 4, pitchTime: 0.016, level: 0.56 }),
        voice('RATTLE HAT', 'plate', '2121 2021 2121 2011', { pitchHz: 1570, decay: 0.085, tone: 0.86, damping: 0.97, mallet: 0.29, hardness: 0.95, noise: 0.58, noiseColor: 'crackle', noiseDecay: 0.024, noiseCutoff: 13200, direct: 0.24, variation: 0.17, level: 0.24, pan: -0.16 }),
        voice('CUP CYMBAL', 'plate', '0010 0000 0000 0010', { pitchHz: 840, decay: 0.42, tone: 0.73, stiffness: 0.75, damping: 0.59, hardness: 0.76, noise: 0.22, noiseColor: 'blue', noiseDecay: 0.045, direct: 0.075, level: 0.24, pan: 0.27 }),
        voice('TABLE BLOCK', 'beam', '0100 0011 0100 0001', { pitchHz: 587.33, decay: 0.12, tone: 0.6, stiffness: 0.1, damping: 0.89, position: 0.34, hardness: 0.73, noise: 0.035, direct: 0.045, variation: 0.1, level: 0.32, pan: -0.3 }),
        voice('BRIGHT KEY', 'marimba', '0001 0000 0010 0001', { pitchHz: 391.995, decay: 0.39, tone: 0.57, stiffness: 0.07, damping: 0.53, hardness: 0.51, strikeTime: 0.0022, noise: 0.025, direct: 0.02, level: 0.34, pan: 0.3 }),
        voice('ELASTIC WIRE', 'string', '0000 0100 0000 1000', { pitchHz: 195.998, decay: 0.35, tone: 0.56, stiffness: 0.2, damping: 0.66, position: 0.13, hardness: 0.64, strikeTime: 0.0012, noise: 0.055, direct: 0.07, pitchEnv: -7, pitchTime: 0.035, variation: 0.12, level: 0.3, pan: -0.09 }),
        voice('SMALL TOM', 'drumhead', '0000 0000 0100 0011', { pitchHz: 261.626, decay: 0.26, tone: 0.54, damping: 0.63, position: 0.61, hardness: 0.62, noise: 0.09, noiseColor: 'pink', noiseDecay: 0.02, direct: 0.07, pitchEnv: 6, pitchTime: 0.025, variation: 0.16, level: 0.35, pan: 0.38 })
      ]
    },
    {
      name: 'Porcelain orbit',
      tagline: 'Ceramic chimes, felted bronze, and hollow wood turning around a quiet pulse.',
      bpm: 112, swing: 0.09, drive: 0.06, space: 0.35,
      tracks: [
        voice('FELT PULSE', 'membrane', '2000 0010 2000 0010', { pitchHz: 49, decay: 0.48, tone: 0.23, damping: 0.45, hardness: 0.49, strikeTime: 0.0022, strikeMaterial: 'felt', pitchEnv: 13, pitchTime: 0.04, noise: 0.035, direct: 0.1, level: 0.74 }),
        voice('NYLON SKIN', 'drumhead', '0000 2001 0000 2010', { pitchHz: 207.652, decay: 0.3, tone: 0.53, damping: 0.7, hardness: 0.59, strikeTime: 0.0012, strikeMaterial: 'nylon', contactTexture: 0.18, noise: 0.54, noiseColor: 'pink', noiseDecay: 0.1, direct: 0.29, pitchEnv: 3, level: 0.52 }),
        voice('PORCELAIN TICK', 'bell', '1010 1011 1010 1001', { pitchHz: 1174.659, decay: 0.15, tone: 0.78, damping: 0.81, position: 0.62, hardness: 0.77, strikeTime: 0.0005, strikeMaterial: 'ceramic', contactTexture: 0.18, mallet: 0.6, noise: 0.015, direct: 0.09, level: 0.27, pan: -0.23 }),
        voice('BRONZE ORBIT', 'bell', '0000 0010 0000 0010', { pitchHz: 587.33, decay: 1.16, tone: 0.55, damping: 0.24, hardness: 0.66, strikeTime: 0.001, strikeMaterial: 'metal', contactTexture: 0.08, noise: 0.01, direct: 0.025, level: 0.28, pan: 0.25 }),
        voice('WOODEN AIR', 'tube', '0010 0001 0010 0000', { pitchHz: 293.665, decay: 0.32, tone: 0.47, damping: 0.63, hardness: 0.61, strikeTime: 0.0016, strikeMaterial: 'wood', contactTexture: 0.16, rebound: 0.24, reboundTime: 0.034, noise: 0.045, direct: 0.08, level: 0.35, pan: -0.33 }),
        voice('FELT HALO', 'bowl', '1000 0000 0010 0000', { pitchHz: 293.665, decay: 1.75, tone: 0.42, damping: 0.22, hardness: 0.38, strikeTime: 0.0018, strikeMaterial: 'felt', contactTexture: 0.04, noise: 0.01, direct: 0.01, level: 0.35, pan: 0.32 }),
        voice('RUBBER KEY', 'marimba', '0001 0000 0100 0001', { pitchHz: 440, decay: 0.44, tone: 0.4, hardness: 0.62, strikeTime: 0.0015, strikeMaterial: 'rubber', contactTexture: 0.04, rebound: 0.18, reboundTime: 0.026, noise: 0.015, direct: 0.025, level: 0.32, pan: -0.08 }),
        voice('GLAZED RIM', 'bowl', '0000 0000 0100 0001', { pitchHz: 146.832, decay: 0.76, tone: 0.62, damping: 0.49, position: 0.68, hardness: 0.7, strikeTime: 0.001, strikeMaterial: 'ceramic', contactTexture: 0.13, noise: 0.035, noiseColor: 'white', direct: 0.04, pitchEnv: 1.5, level: 0.29, pan: 0.1 })
      ]
    },
    {
      name: 'Hollow rituals',
      tagline: 'Springy sticks, breathing tubes, and slow shells in a room of moving shadows.',
      bpm: 96, swing: 0.2, drive: 0.09, space: 0.3,
      tracks: [
        voice('ELASTIC FLOOR', 'membrane', '2000 0001 0020 0010', { pitchHz: 46.249, decay: 0.62, tone: 0.27, damping: 0.4, hardness: 0.51, strikeTime: 0.0028, strikeMaterial: 'rubber', contactTexture: 0.03, pitchEnv: 10, pitchTime: 0.052, noise: 0.035, direct: 0.12, level: 0.75 }),
        voice('STICK & SKIN', 'drumhead', '0000 2000 0000 2001', { pitchHz: 164.814, decay: 0.34, tone: 0.48, damping: 0.64, position: 0.56, hardness: 0.56, strikeTime: 0.0017, strikeMaterial: 'wood', contactTexture: 0.24, rebound: 0.17, reboundTime: 0.038, noise: 0.38, noiseColor: 'pink', noiseDecay: 0.074, direct: 0.24, pitchEnv: 2, variation: 0.12, level: 0.52 }),
        voice('BRITTLE BEADS', 'bell', '2010 1011 2010 1010', { pitchHz: 1318.51, decay: 0.105, tone: 0.72, damping: 0.9, hardness: 0.69, strikeTime: 0.0005, strikeMaterial: 'ceramic', contactTexture: 0.32, rebound: 0.33, reboundTime: 0.008, mallet: 0.42, noise: 0.025, direct: 0.13, variation: 0.15, level: 0.25, pan: -0.24 }),
        voice('HOLLOW BREATH', 'tube', '0010 0000 0010 0001', { pitchHz: 329.628, decay: 0.53, tone: 0.39, damping: 0.42, position: 0.18, hardness: 0.5, strikeTime: 0.0018, strikeMaterial: 'nylon', contactTexture: 0.12, noise: 0.1, noiseColor: 'pink', noiseDecay: 0.046, direct: 0.08, variation: 0.08, level: 0.35, pan: 0.27 }),
        voice('BAMBOO BOUNCE', 'tube', '0001 0000 0000 0010', { pitchHz: 493.883, decay: 0.2, tone: 0.59, damping: 0.71, hardness: 0.72, strikeTime: 0.0012, strikeMaterial: 'wood', contactTexture: 0.2, rebound: 0.59, reboundTime: 0.047, noise: 0.025, direct: 0.105, level: 0.32, pan: -0.35 }),
        voice('LOW SINGING SHELL', 'bowl', '1000 0000 0010 0000', { pitchHz: 164.814, decay: 2.1, tone: 0.36, damping: 0.17, hardness: 0.33, strikeTime: 0.0028, strikeMaterial: 'felt', contactTexture: 0.07, noise: 0.018, direct: 0.012, variation: 0.025, level: 0.35, pan: 0.21 }),
        voice('IRON ANSWER', 'bell', '0000 0001 0000 0100', { pitchHz: 659.255, decay: 0.82, tone: 0.66, damping: 0.37, position: 0.74, hardness: 0.73, strikeTime: 0.0007, strikeMaterial: 'metal', contactTexture: 0.11, rebound: 0.13, reboundTime: 0.021, noise: 0.015, direct: 0.035, level: 0.26, pan: -0.1 }),
        voice('RUBBER CUP', 'bowl', '0000 0100 0000 0001', { pitchHz: 246.942, decay: 0.45, tone: 0.46, damping: 0.68, hardness: 0.64, strikeTime: 0.0016, strikeMaterial: 'rubber', contactTexture: 0.05, rebound: 0.39, reboundTime: 0.032, noise: 0.035, direct: 0.05, pitchEnv: 4, pitchTime: 0.026, variation: 0.1, level: 0.32, pan: 0.37 })
      ]
    }
  ];
}());
