/* Eight voices, sixteen steps. 0 = rest, 1 = hit, 2 = accent. */
(function () {
  'use strict';

  function voice(name, noise, mode, pattern, settings) {
    return Object.assign({
      name: name,
      noise: noise,
      mode: mode,
      steps: pattern.replace(/\s/g, '').split('').map(Number),
      mute: false,
      solo: false,
      level: 0.6,
      pan: 0,
      tone: 0.5,
      decay: 0.25,
      pitch: 0.5
    }, settings);
  }

  window.NOISE_PRESETS = [
    {
      name: 'Flat-top special',
      tagline: 'The griddle is keeping impeccable time.',
      bpm: 104,
      swing: 0.16,
      drive: 0.18,
      space: 0.16,
      tracks: [
        voice('SUB KICK', 'brown', 'kick', '2000 0010 2000 0010', { level: 0.88, tone: 0.28, decay: 0.42, pitch: 0.31 }),
        voice('NOISE SNARE', 'pink', 'snare', '0000 2000 0000 2001', { level: 0.68, tone: 0.54, decay: 0.28, pitch: 0.47 }),
        voice('CLOSED HAT', 'white', 'hat', '2021 2021 2021 2011', { level: 0.36, pan: -0.17, tone: 0.76, decay: 0.09, pitch: 0.66 }),
        voice('OPEN HAT', 'blue', 'hat', '0000 0010 0000 0010', { level: 0.3, pan: 0.21, tone: 0.71, decay: 0.53, pitch: 0.58 }),
        voice('RIM SHOT', 'violet', 'rim', '0010 0000 0010 0000', { level: 0.28, pan: -0.26, tone: 0.61, decay: 0.12, pitch: 0.63 }),
        voice('CLAP STACK', 'grey', 'clap', '0000 1000 0000 1000', { level: 0.33, pan: 0.11, tone: 0.57, decay: 0.32, pitch: 0.49 }),
        voice('DUST PERC', 'dust', 'perc', '0000 0001 0010 0001', { level: 0.33, pan: 0.3, tone: 0.48, decay: 0.2, pitch: 0.65 }),
        voice('TEXTURE', 'crackle', 'texture', '1000 0000 0010 0000', { level: 0.16, pan: -0.12, tone: 0.36, decay: 0.66, pitch: 0.39 })
      ]
    },
    {
      name: 'After-hours service',
      tagline: 'A quiet order from the table that never leaves.',
      bpm: 82,
      swing: 0.23,
      drive: 0.12,
      space: 0.35,
      tracks: [
        voice('DEEP KICK', 'brown', 'kick', '2000 0001 0020 0010', { level: 0.84, tone: 0.2, decay: 0.55, pitch: 0.23 }),
        voice('SOFT SNARE', 'pink', 'snare', '0000 2000 0000 2000', { level: 0.59, tone: 0.35, decay: 0.35, pitch: 0.37 }),
        voice('VELVET HAT', 'velvet', 'hat', '2010 1011 2010 1010', { level: 0.31, pan: -0.22, tone: 0.63, decay: 0.12, pitch: 0.59 }),
        voice('AIR HAT', 'grey', 'hat', '0000 0000 0010 0000', { level: 0.24, pan: 0.25, tone: 0.56, decay: 0.6, pitch: 0.48 }),
        voice('SERVICE RIM', 'digital', 'rim', '0001 0000 0000 0010', { level: 0.24, pan: -0.35, tone: 0.47, decay: 0.17, pitch: 0.56 }),
        voice('CLOTH CLAP', 'white', 'clap', '0000 1000 0000 1000', { level: 0.24, pan: 0.12, tone: 0.38, decay: 0.42, pitch: 0.41 }),
        voice('EXTRACTOR', 'metallic', 'perc', '0000 0010 0001 0000', { level: 0.22, pan: 0.39, tone: 0.34, decay: 0.39, pitch: 0.32 }),
        voice('KITCHEN RADIO', 'radio', 'texture', '1000 0000 1000 0000', { level: 0.13, pan: -0.08, tone: 0.27, decay: 0.86, pitch: 0.3 })
      ]
    },
    {
      name: 'Soft scramble',
      tagline: 'Low heat. Loose wrist. Unexpected footwork.',
      bpm: 122,
      swing: 0.11,
      drive: 0.25,
      space: 0.18,
      tracks: [
        voice('ROUND KICK', 'brown', 'kick', '2000 0010 0020 0100', { level: 0.86, tone: 0.35, decay: 0.36, pitch: 0.36 }),
        voice('BREAK SNARE', 'pink', 'snare', '0000 2001 0001 2010', { level: 0.67, tone: 0.59, decay: 0.24, pitch: 0.56 }),
        voice('VELVET HAT', 'velvet', 'hat', '2121 2021 2121 2011', { level: 0.32, pan: -0.16, tone: 0.73, decay: 0.08, pitch: 0.68 }),
        voice('WIDE HAT', 'white', 'hat', '0010 0000 0000 0010', { level: 0.27, pan: 0.24, tone: 0.66, decay: 0.44, pitch: 0.61 }),
        voice('WOODY RIM', 'dust', 'rim', '0000 0100 0010 0000', { level: 0.3, pan: -0.29, tone: 0.42, decay: 0.1, pitch: 0.44 }),
        voice('PALM CLAP', 'grey', 'clap', '0000 1000 0000 1000', { level: 0.3, pan: 0.09, tone: 0.51, decay: 0.25, pitch: 0.52 }),
        voice('SHUFFLE', 'pink', 'perc', '0100 0011 0100 0001', { level: 0.27, pan: 0.32, tone: 0.53, decay: 0.14, pitch: 0.71 }),
        voice('PREP CRUMBS', 'dust', 'texture', '1000 0000 0000 1000', { level: 0.12, pan: -0.05, tone: 0.35, decay: 0.61, pitch: 0.42 })
      ]
    },
    {
      name: 'Steam release',
      tagline: 'The pressure valve has prepared a four-on-the-floor special.',
      bpm: 116,
      swing: 0.04,
      drive: 0.1,
      space: 0.43,
      tracks: [
        voice('PULSE KICK', 'brown', 'kick', '2000 2000 2000 2000', { level: 0.83, tone: 0.32, decay: 0.38, pitch: 0.32 }),
        voice('STATIC SNARE', 'grey', 'snare', '0000 2000 0000 2000', { level: 0.57, tone: 0.6, decay: 0.32, pitch: 0.52 }),
        voice('BLUE HAT', 'blue', 'hat', '1010 1010 1010 1011', { level: 0.3, pan: -0.24, tone: 0.71, decay: 0.08, pitch: 0.7 }),
        voice('VENT HAT', 'pink', 'hat', '0020 0020 0020 0020', { level: 0.32, pan: 0.28, tone: 0.65, decay: 0.58, pitch: 0.56 }),
        voice('GLASS RIM', 'metallic', 'rim', '0000 0001 0000 0100', { level: 0.24, pan: -0.39, tone: 0.65, decay: 0.22, pitch: 0.74 }),
        voice('WHITE CLAP', 'white', 'clap', '0000 1000 0000 1000', { level: 0.36, pan: 0.08, tone: 0.59, decay: 0.35, pitch: 0.56 }),
        voice('UTENSIL PERC', 'velvet', 'perc', '0100 0010 0100 0011', { level: 0.28, pan: 0.34, tone: 0.68, decay: 0.25, pitch: 0.78 }),
        voice('PRESSURE HISS', 'violet', 'texture', '1000 0000 1000 0000', { level: 0.11, pan: -0.1, tone: 0.53, decay: 0.79, pitch: 0.6 })
      ]
    },
    {
      name: 'Ticket jam',
      tagline: 'The order printer is producing more rhythm than receipts.',
      bpm: 138,
      swing: 0.08,
      drive: 0.39,
      space: 0.12,
      tracks: [
        voice('POWER KICK', 'brown', 'kick', '2000 0020 1002 0010', { level: 0.8, tone: 0.4, decay: 0.28, pitch: 0.39 }),
        voice('BIT SNARE', 'digital', 'snare', '0000 2001 0000 2010', { level: 0.58, tone: 0.62, decay: 0.2, pitch: 0.64 }),
        voice('VIOLET HAT', 'violet', 'hat', '2110 2021 1102 2011', { level: 0.27, pan: -0.21, tone: 0.79, decay: 0.06, pitch: 0.76 }),
        voice('FLASH HAT', 'blue', 'hat', '0000 0010 0000 0001', { level: 0.25, pan: 0.28, tone: 0.76, decay: 0.36, pitch: 0.71 }),
        voice('RELAY RIM', 'metallic', 'rim', '0001 0000 0010 0100', { level: 0.31, pan: -0.34, tone: 0.7, decay: 0.13, pitch: 0.82 }),
        voice('SHORT CIRCUIT', 'crackle', 'clap', '0000 1000 0000 1001', { level: 0.25, pan: 0.08, tone: 0.56, decay: 0.22, pitch: 0.62 }),
        voice('DATA PERC', 'digital', 'perc', '0100 1001 0010 0101', { level: 0.26, pan: 0.4, tone: 0.58, decay: 0.11, pitch: 0.77 }),
        voice('WALK-IN HUM', 'radio', 'texture', '1000 0000 0010 0000', { level: 0.1, pan: -0.07, tone: 0.43, decay: 0.48, pitch: 0.47 })
      ]
    },
    {
      name: 'Last pan standing',
      tagline: 'Service is over. One pan has additional remarks.',
      bpm: 68,
      swing: 0.07,
      drive: 0.08,
      space: 0.58,
      tracks: [
        voice('COLD ROOM KICK', 'brown', 'kick', '2000 0000 0000 0010', { level: 0.82, tone: 0.19, decay: 0.59, pitch: 0.21 }),
        voice('DISTANT SNARE', 'pink', 'snare', '0000 0000 2000 0000', { level: 0.5, tone: 0.34, decay: 0.51, pitch: 0.35 }),
        voice('QUIET HAT', 'velvet', 'hat', '0010 0010 0010 0001', { level: 0.25, pan: -0.28, tone: 0.52, decay: 0.11, pitch: 0.51 }),
        voice('SOFT AIR', 'grey', 'hat', '0000 0000 0000 1000', { level: 0.22, pan: 0.31, tone: 0.39, decay: 0.7, pitch: 0.43 }),
        voice('DOOR RIM', 'dust', 'rim', '0000 0001 0000 0000', { level: 0.28, pan: -0.43, tone: 0.3, decay: 0.18, pitch: 0.29 }),
        voice('TILE CLAP', 'pink', 'clap', '0000 0000 1000 0000', { level: 0.2, pan: 0.07, tone: 0.3, decay: 0.47, pitch: 0.36 }),
        voice('HOLLOW PERC', 'metallic', 'perc', '0000 0010 0000 0010', { level: 0.21, pan: 0.38, tone: 0.27, decay: 0.49, pitch: 0.24 }),
        voice('CLOSING CRUMBS', 'crackle', 'texture', '1000 0000 0000 0000', { level: 0.15, pan: -0.09, tone: 0.23, decay: 0.95, pitch: 0.28 })
      ]
    }
  ];
}());

/* Additive noise recipes. The original six grooves above are deliberately untouched. */
(function () {
  'use strict';
  const recipe = (id, name, family, source, description, settings) => ({
    id, name, family, source, description,
    noise: Object.assign({ level: 0.8, rate: 1, filter: 'bandpass', cutoff: 3000,
      resonance: 0.707, attack: 0.001, hold: 0, decay: 0.12,
      curve: 'exponential', drive: 0, envAmount: 0, bursts: 1, spacing: 0.0175 }, settings)
  });
  window.NOISE_RECIPES = [
    recipe('pan-scrape', 'Pan scrape', 'Friction', 'pink', 'A rough, rising brush against the pan; slow attack and a climbing filter.', { rate: 0.72, cutoff: 1750, resonance: 1.6, attack: 0.035, hold: 0.03, decay: 0.24, curve: 'linear', drive: 0.2, envAmount: -17 }),
    recipe('wire-brush', 'Wire brush', 'Friction', 'metallic', 'A tight metallic rasp, bright enough to sit between drum hits.', { rate: 0.8, filter: 'highpass', cutoff: 3900, resonance: 0.65, attack: 0.004, decay: 0.065, drive: 0.16, bursts: 2, spacing: 0.009 }),
    recipe('sandpaper', 'Sandpaper', 'Friction', 'grey', 'A dry midrange swish with an even, brushed falloff.', { rate: 0.6, cutoff: 2300, resonance: 0.85, attack: 0.014, hold: 0.025, decay: 0.17, curve: 'linear', drive: 0.28 }),
    recipe('cloth-drag', 'Cloth drag', 'Friction', 'brown', 'A soft, low scrape for ghost strokes and shuffled textures.', { level: 0.95, rate: 0.48, filter: 'lowpass', cutoff: 1650, resonance: 0.75, attack: 0.022, hold: 0.015, decay: 0.21, curve: 'linear', envAmount: 6 }),
    recipe('static-slap', 'Static slap', 'Static', 'white', 'A sharp noise backbeat with three closely spaced attacks.', { cutoff: 3400, resonance: 0.9, decay: 0.085, drive: 0.22, bursts: 3, spacing: 0.014, envAmount: 10 }),
    recipe('relay-click', 'Relay click', 'Static', 'digital', 'A clipped electrical tick with a short falling filter.', { level: 0.7, rate: 1.65, filter: 'highpass', cutoff: 2800, resonance: 1.2, decay: 0.021, drive: 0.38, envAmount: 14 }),
    recipe('fuse-fizz', 'Fuse fizz', 'Static', 'crackle', 'Uneven sparks drawn into a short fizzing tail.', { rate: 1.2, filter: 'highpass', cutoff: 1800, resonance: 0.65, attack: 0.002, hold: 0.01, decay: 0.2, drive: 0.31, bursts: 2, spacing: 0.026 }),
    recipe('bit-crust', 'Bit crust', 'Static', 'digital', 'A chunky, lower-register packet of crushed noise.', { rate: 0.4, cutoff: 920, resonance: 2.1, decay: 0.092, drive: 0.52, envAmount: 15 }),
    recipe('radio-spill', 'Radio spill', 'Interference', 'radio', 'A narrow wandering signal that slides into focus.', { level: 0.72, rate: 0.65, cutoff: 1250, resonance: 3.8, attack: 0.025, hold: 0.04, decay: 0.32, curve: 'linear', drive: 0.15, envAmount: -12 }),
    recipe('fork-feedback', 'Fork feedback', 'Interference', 'metallic', 'A resonant cutlery-ring with a falling, almost pitched edge.', { level: 0.65, rate: 0.52, cutoff: 820, resonance: 7, decay: 0.24, drive: 0.12, envAmount: 5 }),
    recipe('valve-whistle', 'Valve whistle', 'Interference', 'blue', 'A narrow steam squeal with a soft entrance.', { level: 0.64, rate: 0.85, cutoff: 5200, resonance: 9, attack: 0.02, hold: 0.016, decay: 0.18, curve: 'linear', envAmount: -7 }),
    recipe('mains-rumble', 'Mains rumble', 'Interference', 'brown', 'A dense low pulse; useful beneath dry, bright percussion.', { level: 1, rate: 0.3, filter: 'lowpass', cutoff: 210, resonance: 1.3, decay: 0.32, drive: 0.35, envAmount: 16 }),
    recipe('pepper-rattle', 'Pepper rattle', 'Percussion', 'dust', 'Four scattered grains with a deliberate short rattle.', { rate: 1.35, filter: 'highpass', cutoff: 1900, resonance: 0.8, decay: 0.035, bursts: 4, spacing: 0.019, drive: 0.09 }),
    recipe('crumb-tap', 'Crumb tap', 'Percussion', 'velvet', 'Sparse impulses gathered into a hollow contact sound.', { level: 0.95, rate: 0.73, cutoff: 1350, resonance: 4.6, decay: 0.048, drive: 0.18, envAmount: 9 }),
    recipe('foil-crimp', 'Foil crimp', 'Percussion', 'violet', 'A bright, crinkled double strike with almost no low end.', { level: 0.7, rate: 0.8, filter: 'highpass', cutoff: 4600, resonance: 0.65, decay: 0.057, drive: 0.23, bursts: 2, spacing: 0.012 }),
    recipe('vent-breath', 'Vent breath', 'Percussion', 'pink', 'A longer, airy release that leaves room for the next hit.', { level: 0.68, rate: 1.1, filter: 'highpass', cutoff: 3200, resonance: 0.7, attack: 0.014, hold: 0.018, decay: 0.38, curve: 'linear', envAmount: 5 })
  ];
  const byId = Object.fromEntries(window.NOISE_RECIPES.map(item => [item.id, item]));
  function noiseVoice(name, recipeId, mode, pattern, level, pan, changes, bodyLevel) {
    const selected = byId[recipeId];
    const track = { name, noise: selected.source, mode, steps: pattern.replace(/\s/g, '').split('').map(Number),
      mute: false, solo: false, level, pan, tone: 0.5, decay: 0.25, pitch: 0.5 };
    track.synth = window.GrainSynth.defaults(track);
    track.synth.body.level = bodyLevel || 0;
    track.synth.noise = Object.assign({}, selected.noise, changes);
    return track;
  }
  window.NOISE_PRESETS.push(
    {
      name: 'Prep surface', tagline: 'Brushes, scrapes and contact sounds. Nothing on this counter sits still.',
      bpm: 96, swing: 0.19, drive: 0.12, space: 0.18,
      tracks: [
        noiseVoice('COUNTER PULSE', 'mains-rumble', 'kick', '2000 0010 0002 0010', 0.85, 0, { decay: 0.22 }, 0.65),
        noiseVoice('PAN SCRAPE', 'pan-scrape', 'texture', '0000 2000 0000 2010', 0.56, -0.12),
        noiseVoice('WIRE BRUSH', 'wire-brush', 'hat', '2010 1021 2010 1011', 0.33, -0.22),
        noiseVoice('CLOTH DRAG', 'cloth-drag', 'texture', '0001 0000 0010 0000', 0.38, 0.23),
        noiseVoice('CRUMB TAP', 'crumb-tap', 'perc', '0010 0000 0100 0001', 0.48, -0.31),
        noiseVoice('SANDPAPER', 'sandpaper', 'texture', '0000 1000 0000 1000', 0.3, 0.13),
        noiseVoice('PEPPER RATTLE', 'pepper-rattle', 'perc', '0000 0010 0001 0010', 0.29, 0.36),
        noiseVoice('VENT BREATH', 'vent-breath', 'texture', '1000 0000 0000 1000', 0.18, -0.08)
      ]
    },
    {
      name: 'Short-order static', tagline: 'A dry electrical break. The ticket printer has swallowed the backbeat.',
      bpm: 128, swing: 0.07, drive: 0.24, space: 0.1,
      tracks: [
        noiseVoice('FUSE PULSE', 'mains-rumble', 'kick', '2000 0020 1000 0010', 0.83, 0, { cutoff: 320, decay: 0.2 }, 0.72),
        noiseVoice('STATIC SLAP', 'static-slap', 'snare', '0000 2001 0000 2010', 0.64, 0.03),
        noiseVoice('RELAY CLICK', 'relay-click', 'hat', '2120 1011 2021 1010', 0.4, -0.17),
        noiseVoice('FUSE FIZZ', 'fuse-fizz', 'texture', '0000 0010 0000 0010', 0.34, 0.2),
        noiseVoice('BIT CRUST', 'bit-crust', 'perc', '0001 0000 0010 0100', 0.42, -0.3),
        noiseVoice('WHITE FLASH', 'static-slap', 'clap', '0000 1000 0000 1000', 0.29, 0.11, { rate: 1.4, bursts: 2, decay: 0.04 }),
        noiseVoice('FOIL CRIMP', 'foil-crimp', 'perc', '0010 0100 0001 0011', 0.29, 0.33),
        noiseVoice('RADIO RESIDUE', 'radio-spill', 'texture', '1000 0000 0000 0010', 0.16, -0.06, { resonance: 1.8, decay: 0.21 })
      ]
    },
    {
      name: 'Radio misdemeanour', tagline: 'Wrong frequencies, right pockets. Somebody has tuned the extractor.',
      bpm: 114, swing: 0.11, drive: 0.16, space: 0.27,
      tracks: [
        noiseVoice('MAINS RUMBLE', 'mains-rumble', 'kick', '2000 0001 0020 0100', 0.83, 0, {}, 0.5),
        noiseVoice('SIGNAL SNAP', 'bit-crust', 'snare', '0000 2000 0001 2000', 0.61, 0.04, { cutoff: 1900, rate: 0.68, bursts: 2, spacing: 0.011 }),
        noiseVoice('CARRIER TICK', 'relay-click', 'hat', '2010 0110 2011 0010', 0.34, -0.22, { rate: 0.9, cutoff: 4900 }),
        noiseVoice('VALVE WHISTLE', 'valve-whistle', 'texture', '0000 0010 0000 0001', 0.29, 0.26),
        noiseVoice('FORK FEEDBACK', 'fork-feedback', 'perc', '0010 0000 0100 0010', 0.4, -0.29),
        noiseVoice('RADIO SPILL', 'radio-spill', 'texture', '0000 1000 0000 1000', 0.37, 0.1),
        noiseVoice('SPARK PACKET', 'fuse-fizz', 'perc', '0001 0010 0000 0101', 0.29, 0.35, { cutoff: 3500, decay: 0.08, bursts: 3 }),
        noiseVoice('LOW CARRIER', 'radio-spill', 'texture', '1000 0000 0010 0000', 0.2, -0.08, { rate: 0.32, cutoff: 480, resonance: 2.6, decay: 0.52 })
      ]
    },
    {
      name: 'Crumb counter', tagline: 'Pointillist percussion and tiny accidents. Count the pepper if you can.',
      bpm: 146, swing: 0.09, drive: 0.13, space: 0.15,
      tracks: [
        noiseVoice('DUST THUD', 'mains-rumble', 'kick', '2000 0010 0200 0001', 0.8, 0, { rate: 0.5, cutoff: 460, decay: 0.13 }, 0.6),
        noiseVoice('FOIL SLAP', 'foil-crimp', 'snare', '0000 2000 0000 2010', 0.59, 0.04, { cutoff: 2100, bursts: 3, decay: 0.065 }),
        noiseVoice('VELVET TICK', 'crumb-tap', 'hat', '2121 2010 1121 2011', 0.33, -0.21, { rate: 1.7, filter: 'highpass', cutoff: 3400, resonance: 0.8, decay: 0.019 }),
        noiseVoice('PEPPER RATTLE', 'pepper-rattle', 'perc', '0000 0010 0000 0001', 0.34, 0.27),
        noiseVoice('CRUMB TAP', 'crumb-tap', 'perc', '0010 0001 0010 0100', 0.46, -0.32),
        noiseVoice('TWO GRAINS', 'pepper-rattle', 'perc', '0001 0000 0100 0010', 0.31, 0.1, { rate: 0.62, cutoff: 1000, bursts: 2, spacing: 0.026 }),
        noiseVoice('TIN TICK', 'fork-feedback', 'perc', '0100 0010 0001 0100', 0.26, 0.37, { rate: 1.6, cutoff: 2600, resonance: 3.4, decay: 0.039 }),
        noiseVoice('SIFTED AIR', 'sandpaper', 'texture', '1000 0000 0000 1000', 0.16, -0.08, { filter: 'notch', cutoff: 3500, decay: 0.34, drive: 0.06 })
      ]
    }
  );
}());
