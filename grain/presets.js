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
