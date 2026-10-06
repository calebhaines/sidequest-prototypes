(function (root) {
  'use strict';
  const SAMPLE_RATE = 22050;
  const MAX_SECONDS = 20;
  const MAX_FRAMES = SAMPLE_RATE * MAX_SECONDS;
  const catalog = [
    { id: 'vowel-choir', name: 'The Singing Stockpot', description: 'A warm, slowly opening ah–oh choir made for glowing chords.', family: 'Voice', rootNote: 57, seconds: 3.2 },
    { id: 'whisper-vowel', name: 'Hush at the Pass', description: 'Breathy ee–ah vowels with soft consonant edges.', family: 'Voice', rootNote: 60, seconds: 3.2 },
    { id: 'brass-vowel', name: 'Calling the Order', description: 'A bright, nasal vocal call that ripens into brass.', family: 'Voice', rootNote: 57, seconds: 3 },
    { id: 'glass-bell', name: 'Crystal Measuring Cup', description: 'A clear struck glass tone with a long, crooked shimmer.', family: 'Glass', rootNote: 69, seconds: 3.2 },
    { id: 'ceramic-chime', name: 'Porcelain Service', description: 'A small ceramic bell: rounded attack, uneven ringing partials.', family: 'Glass', rootNote: 64, seconds: 3 },
    { id: 'piano-wire', name: 'Piano on the Prep Bench', description: 'A struck, slightly stretched piano wire with a felt hammer.', family: 'Keys', rootNote: 57, seconds: 3.4 },
    { id: 'felt-keys', name: 'Nightshift Felt', description: 'A soft electric-piano-like tine with a low, woody body.', family: 'Keys', rootNote: 60, seconds: 3.2 },
    { id: 'bowed-glass', name: 'Wet Finger, Dry Glass', description: 'A rubbed wine-glass edge with delicate friction and drift.', family: 'Bowed', rootNote: 69, seconds: 3.4 },
    { id: 'cello-scrape', name: 'Bowed Ladle', description: 'A husky bowed string, slowly climbing out of its own scrape.', family: 'Bowed', rootNote: 45, seconds: 3.4 },
    { id: 'reed-organ', name: 'Pantry Harmonium', description: 'A narrow reed chord that breathes as the bellows open.', family: 'Wind', rootNote: 57, seconds: 3.2 },
    { id: 'breath-flute', name: 'Bottle Flute', description: 'Air over a bottle lip, rounded and gently wandering.', family: 'Wind', rootNote: 69, seconds: 3.2 },
    { id: 'copper-brass', name: 'Copper Order Bell', description: 'A brass-like swell with a buzzy lip and polished center.', family: 'Wind', rootNote: 57, seconds: 3.2 },
    { id: 'steam-hiss', name: 'Steam Valve', description: 'A pressure hiss that opens, whistles, then retreats.', family: 'Texture', rootNote: 60, seconds: 3 },
    { id: 'rain-pan', name: 'Rain in a Roasting Tray', description: 'Scattered droplets over a hollow metal tray.', family: 'Texture', rootNote: 60, seconds: 3.6 },
    { id: 'iron-chain', name: 'Hanging Pot Rack', description: 'Small metal collisions with unruly, bright tails.', family: 'Metal', rootNote: 57, seconds: 3.2 },
    { id: 'motor-hum', name: 'The Walk-in Motor', description: 'A low compressor hum with changing teeth and rattles.', family: 'Machine', rootNote: 33, seconds: 3.6 },
    { id: 'gear-rattle', name: 'Mixer After Closing', description: 'A rhythmically sputtering gear train with a resonant body.', family: 'Machine', rootNote: 45, seconds: 3.2 },
    { id: 'tin-scrape', name: 'Tin Whisk Scrape', description: 'A ridged metal scrape with a grainy, sliding spectrum.', family: 'Metal', rootNote: 60, seconds: 3 },
    { id: 'water-bubbles', name: 'A Very Small Simmer', description: 'Liquid glugs and climbing bubbles with little tuned tails.', family: 'Texture', rootNote: 60, seconds: 3.4 },
    { id: 'ice-crackle', name: 'Ice in the Sink', description: 'Fine cold crackles punctuated by tiny glassy fractures.', family: 'Texture', rootNote: 72, seconds: 3.2 },
    { id: 'wooden-knock', name: 'Chopping Board Knock', description: 'A dry, hollow wooden strike with a compact room tail.', family: 'Percussion', rootNote: 48, seconds: 2.4 },
    { id: 'brushed-snare', name: 'Brush the Baking Tray', description: 'A soft brushed rattle with a low drum-like center.', family: 'Percussion', rootNote: 48, seconds: 2.8 },
    { id: 'sub-bloom', name: 'Cellar Bloom', description: 'A deep, clean bass swell with a little heat above it.', family: 'Bass', rootNote: 33, seconds: 3.2 },
    { id: 'plucked-string', name: 'String on a Biscuit Tin', description: 'A bright plucked string ringing through a small tin body.', family: 'Strings', rootNote: 57, seconds: 3.2 }
  ];
  catalog.forEach(entry => { entry.sampleRate = SAMPLE_RATE; entry.frames = Math.round(entry.seconds * SAMPLE_RATE); Object.freeze(entry); });
  Object.freeze(catalog);
  const byId = new Map(catalog.map(item => [item.id, item]));
  const cache = new Map();
  const TAU = Math.PI * 2;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const hz = note => 440 * Math.pow(2, (note - 69) / 12);
  function hash(text) { let n = 2166136261; for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619); return n >>> 0; }
  function random(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
  function attack(t, seconds) { return 1 - Math.exp(-t / Math.max(.0002, seconds)); }
  function fade(t, duration) { return Math.min(1, t / .006, (duration - t) / .055); }
  function resonator(frequency, decay) {
    const f = clamp(frequency, 15, SAMPLE_RATE * .46);
    const r = Math.exp(-1 / (Math.max(.003, decay) * SAMPLE_RATE));
    const a = 2 * r * Math.cos(TAU * f / SAMPLE_RATE);
    const b = r * r;
    let z1 = 0, z2 = 0;
    return input => { const y = input + a * z1 - b * z2; z2 = z1; z1 = y; return y * Math.sin(TAU * f / SAMPLE_RATE); };
  }
  function bandpass(frequency, q) {
    const w = TAU * clamp(frequency, 30, SAMPLE_RATE * .43) / SAMPLE_RATE;
    const alpha = Math.sin(w) / (2 * q);
    const b0 = alpha / (1 + alpha), a1 = -2 * Math.cos(w) / (1 + alpha), a2 = (1 - alpha) / (1 + alpha);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return x => { const y = b0 * (x - x2) - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  }
  function harmonic(frequency, coefficients, detune) {
    const oscillators = coefficients.map((weight, i) => ({ phase: i * .391, increment: TAU * frequency * (i + 1) * (1 + (detune || 0) * (i + 1) * (i + 1)) / SAMPLE_RATE, weight }));
    return (speed, brightness) => { let value = 0; for (let i = 0; i < oscillators.length; i++) { const o = oscillators[i]; o.phase += o.increment * speed; if (o.phase > TAU) o.phase -= TAU * Math.floor(o.phase / TAU); value += Math.sin(o.phase) * o.weight * Math.pow(brightness == null ? 1 : brightness, i); } return value; };
  }
  function generate(entry) {
    const duration = entry.seconds, frames = Math.round(duration * SAMPLE_RATE), pcm = new Float32Array(frames);
    const rng = random(hash(entry.id)), frequency = hz(entry.rootNote);
    const id = entry.id;
    let oscillator, modes, bands, phase = 0, lowNoise = 0, previousNoise = 0, event = 0, eventAmplitude = 0;
    if (id === 'vowel-choir' || id === 'whisper-vowel' || id === 'brass-vowel') {
      oscillator = harmonic(frequency, Array.from({ length: 24 }, (_, i) => 1 / Math.pow(i + 1, 1.1)));
      bands = [500, 850, 1250, 2250, 3200].map(f => bandpass(f, 5));
    } else if (id === 'glass-bell' || id === 'ceramic-chime' || id === 'felt-keys' || id === 'piano-wire') {
      const ratios = id === 'glass-bell' ? [1, 2.01, 2.76, 4.11, 5.43, 7.28] : id === 'ceramic-chime' ? [1, 2.13, 3.08, 4.77, 6.63] : id === 'felt-keys' ? [1, 2, 3.01, 6.07, 9.1] : [1, 2.001, 3.004, 4.009, 5.016, 6.029, 7.04, 8.06, 10.1];
      modes = ratios.map((ratio, index) => ({ ratio, phase: rng() * TAU, amplitude: (index ? .65 / Math.pow(index, .95) : 1), decay: (id === 'ceramic-chime' ? .65 : id === 'felt-keys' ? 1.1 : 1.8) / (1 + index * .38) }));
      bands = [bandpass(id === 'felt-keys' ? 500 : 2200, .7)];
    } else if (['bowed-glass', 'cello-scrape', 'reed-organ', 'breath-flute', 'copper-brass', 'sub-bloom', 'plucked-string', 'motor-hum', 'gear-rattle'].includes(id)) {
      const coefficients = Array.from({ length: id === 'breath-flute' || id === 'sub-bloom' ? 7 : 22 }, (_, i) => {
        const h = i + 1;
        if (id === 'breath-flute') return 1 / Math.pow(h, 3.2);
        if (id === 'sub-bloom') return h === 1 ? 1 : .24 / (h * h);
        if (id === 'bowed-glass') return h === 1 ? 1 : .3 / Math.pow(h, 2.1);
        if (id === 'reed-organ') return (h % 2 ? 1 : .18) / Math.pow(h, 1.3);
        if (id === 'copper-brass') return 1 / Math.pow(h, 1.05);
        if (id === 'motor-hum') return (h % 3 === 0 ? .6 : 1) / Math.pow(h, 1.2);
        return 1 / Math.pow(h, 1.35);
      });
      oscillator = harmonic(frequency, coefficients, id === 'plucked-string' ? .00002 : 0);
      bands = [bandpass(id === 'cello-scrape' ? 1600 : id === 'copper-brass' ? 1500 : id === 'motor-hum' ? 250 : 950, 1.4), bandpass(3400, 2)];
      modes = [resonator(frequency * 1.91, .13), resonator(frequency * 4.12, .1)];
    } else {
      const frequencies = id === 'wooden-knock' ? [frequency, frequency * 2.31, frequency * 4.13, 2200] : id === 'water-bubbles' ? [390, 650, 1100, 1800] : id === 'rain-pan' ? [360, 743, 1290, 2310, 3920] : id === 'iron-chain' ? [730, 1237, 2351, 3579, 4931] : id === 'brushed-snare' ? [140, 237, 410, 1900] : id === 'ice-crackle' ? [1950, 3207, 4871, 6893] : [860, 1750, 3200, 4900];
      modes = frequencies.map((f, i) => resonator(f, id === 'wooden-knock' ? .06 / (i + 1) : id === 'iron-chain' ? .3 / (1 + i * .2) : .11 / (1 + i * .4)));
      bands = [bandpass(id === 'steam-hiss' ? 2800 : id === 'brushed-snare' ? 1900 : 3400, .65), bandpass(5200, 2.1)];
    }
    for (let i = 0; i < frames; i++) {
      const t = i / SAMPLE_RATE, u = t / duration, noise = rng() * 2 - 1;
      lowNoise += .05 * (noise - lowNoise);
      let value = 0;
      if (id === 'vowel-choir' || id === 'whisper-vowel' || id === 'brass-vowel') {
        const breath = id === 'whisper-vowel' ? .5 : .07;
        const vib = 1 + .0018 * Math.sin(TAU * 5.1 * t) + .0006 * Math.sin(TAU * .27 * t);
        const excitation = oscillator(vib) * .18 + noise * breath;
        const openness = .5 + .5 * Math.sin(TAU * .22 * t - .6);
        const weights = id === 'whisper-vowel' ? [.4 + openness * .7, .3, .3, 1.5 - openness, .7] : id === 'brass-vowel' ? [.45, 1.3 - openness * .3, .9, .9 + openness, .6] : [1.4 - openness, .4 + openness * 1.2, .9, .55 + openness * .9, .35];
        for (let j = 0; j < bands.length; j++) value += bands[j](excitation) * weights[j];
        value = (value * 4 + excitation * .07) * attack(t, id === 'brass-vowel' ? .045 : .12) * (.72 + .1 * Math.sin(TAU * .4 * t));
      } else if (id === 'glass-bell' || id === 'ceramic-chime' || id === 'felt-keys' || id === 'piano-wire') {
        for (const mode of modes) { mode.phase += TAU * frequency * mode.ratio / SAMPLE_RATE; value += Math.sin(mode.phase) * mode.amplitude * Math.exp(-t / mode.decay); }
        value *= attack(t, id === 'felt-keys' ? .008 : .002);
        value += bands[0](noise) * Math.exp(-t / (id === 'piano-wire' ? .025 : .008)) * (id === 'piano-wire' ? .55 : .25);
      } else if (oscillator) {
        const vibrato = 1 + (id === 'motor-hum' ? .005 : .002) * Math.sin(TAU * (id === 'cello-scrape' ? 4.8 : 5.9) * t);
        const brightness = id === 'plucked-string' ? .32 + .65 * Math.exp(-t / .65) : id === 'copper-brass' ? .45 + .5 * attack(t, .3) : 1;
        value = oscillator(vibrato, brightness);
        if (id === 'plucked-string') value = value * attack(t, .002) * Math.exp(-t / 1.2) + bands[1](noise) * .08 * Math.exp(-t / .03);
        else if (id === 'sub-bloom') value *= attack(t, .08) * Math.exp(-t / 2.4);
        else if (id === 'motor-hum' || id === 'gear-rattle') {
          const speed = id === 'motor-hum' ? 17 : 31;
          const tick = Math.sin(TAU * speed * t) > .96 ? noise * .5 : 0;
          value = value * .45 + modes[0](tick) * .38 + modes[1](tick) * .18 + bands[0](noise) * .06;
          if (id === 'gear-rattle') value *= .35 + .65 * Math.pow(.5 + .5 * Math.sin(TAU * 4.3 * t), 3);
          value *= attack(t, .05);
        } else {
          const friction = id === 'cello-scrape' ? .19 : id === 'breath-flute' ? .06 : id === 'bowed-glass' ? .07 : .035;
          value = value * .45 + bands[0](noise) * friction + bands[1](noise) * friction * .3;
          value *= attack(t, id === 'bowed-glass' ? .25 : .14) * (.8 + .08 * Math.sin(TAU * .6 * t));
        }
      } else {
        let impulse = 0;
        if (id === 'wooden-knock') impulse = i < 32 ? noise * Math.exp(-i / 9) : 0;
        else if (id === 'brushed-snare') impulse = noise * Math.exp(-t / .28) * attack(t, .004);
        else if (id === 'steam-hiss') impulse = noise * attack(t, .13) * (.3 + .7 * Math.pow(Math.sin(Math.PI * u), 2));
        else if (id === 'tin-scrape') impulse = (noise - previousNoise) * (.2 + .8 * Math.pow(.5 + .5 * Math.sin(TAU * (16 + t * 7) * t), 5)) * attack(t, .04);
        else {
          if (event <= 0) {
            const dense = id === 'ice-crackle' ? 70 : id === 'rain-pan' ? 25 : id === 'water-bubbles' ? 9 : 13;
            event = Math.max(4, Math.round(SAMPLE_RATE * (.008 + rng() * 2 / dense)));
            eventAmplitude = .3 + rng() * .7;
            impulse = eventAmplitude * (rng() > .5 ? 1 : -1);
          }
          event--;
          if (id === 'ice-crackle') impulse += noise * (rng() < .025 ? .18 : 0);
        }
        for (let j = 0; j < modes.length; j++) value += modes[j](impulse) * (j === 0 ? 1 : .65 / Math.sqrt(j));
        if (id === 'steam-hiss') { phase += TAU * (1450 + 500 * Math.sin(Math.PI * u)) / SAMPLE_RATE; value += bands[0](impulse) * .9 + Math.sin(phase) * .05 * attack(t, .4) * Math.sin(Math.PI * u); }
        if (id === 'tin-scrape') value = value * .3 + bands[0](impulse) * .7;
        if (id === 'brushed-snare') value = value * .35 + bands[0](impulse) * .8;
        if (id === 'water-bubbles') value = value * .8 + lowNoise * .05;
        previousNoise = noise;
      }
      pcm[i] = Number.isFinite(value) ? value * Math.max(0, fade(t, duration)) : 0;
    }
    // Remove DC before normalizing. Every factory result is a completed sample clip;
    // the instrument then analyzes these same PCM frames through its FFT pipeline.
    let mean = 0; for (let i = 0; i < frames; i++) mean += pcm[i]; mean /= frames;
    let peak = 0; for (let i = 0; i < frames; i++) { pcm[i] -= mean; peak = Math.max(peak, Math.abs(pcm[i])); }
    const gain = peak > 1e-9 ? .82 / peak : 1;
    for (let i = 0; i < frames; i++) pcm[i] *= gain;
    return { pcm: [pcm], sampleRate: SAMPLE_RATE, name: entry.name, rootNote: entry.rootNote };
  }
  function encodeBase64(bytes) {
    if (typeof btoa === 'function') {
      let result = '';
      for (let i = 0; i < bytes.length; i += 24576) result += btoa(String.fromCharCode.apply(null, bytes.subarray(i, i + 24576)));
      return result;
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
    throw new Error('This browser cannot encode sample data.');
  }
  function decodeBase64(text) {
    if (typeof text !== 'string' || text.length > Math.ceil(MAX_FRAMES * 2 / 3) * 4 + 4 || text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('Invalid sample data.');
    try {
      if (typeof atob === 'function') { const raw = atob(text), bytes = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i); return bytes; }
      if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
    } catch (_) { throw new Error('Invalid sample data.'); }
    throw new Error('This browser cannot decode sample data.');
  }
  function validateRef(ref) {
    if (root.MarinadeSchema && typeof root.MarinadeSchema.validateRef === 'function') return root.MarinadeSchema.validateRef(ref);
    if (!ref || typeof ref !== 'object') throw new Error('Choose a sample first.');
    if (ref.kind === 'factory') {
      if (!byId.has(ref.id)) throw new Error('Unknown pantry sound.');
      return { kind: 'factory', id: ref.id };
    }
    if (ref.kind !== 'pcm' || ref.sampleRate !== SAMPLE_RATE || ref.channels !== 1 || !Number.isInteger(ref.frames) || ref.frames < 1 || ref.frames > MAX_FRAMES) throw new Error('Invalid sample format.');
    const expected = Math.ceil(ref.frames * 2 / 3) * 4, remainder = ref.frames * 2 % 3, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    if (typeof ref.data !== 'string' || ref.data.length !== expected || (remainder === 0 ? ref.data.includes('=') : remainder === 1 ? !ref.data.endsWith('==') || (alphabet.indexOf(ref.data[expected - 3]) & 15) !== 0 : !ref.data.endsWith('=') || ref.data.endsWith('==') || (alphabet.indexOf(ref.data[expected - 2]) & 3) !== 0)) throw new Error('Invalid sample data.');
    const bytes = decodeBase64(ref.data);
    if (bytes.length !== ref.frames * 2) throw new Error('Sample size does not match its frames.');
    return { kind: 'pcm', name: String(ref.name || 'Imported ingredient').slice(0, 120), sampleRate: SAMPLE_RATE, channels: 1, frames: ref.frames, data: ref.data };
  }
  function resolve(ref) {
    ref = validateRef(ref);
    if (ref.kind === 'factory') {
      if (!cache.has(ref.id)) { const result = generate(byId.get(ref.id)); cache.set(ref.id, result); if (cache.size > 8) cache.delete(cache.keys().next().value); }
      const value = cache.get(ref.id);
      // Consumers own their arrays: trimming/editing never changes pantry originals.
      return { pcm: [new Float32Array(value.pcm[0])], sampleRate: value.sampleRate, name: value.name, rootNote: value.rootNote };
    }
    const bytes = decodeBase64(ref.data), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), pcm = new Float32Array(ref.frames);
    for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(i * 2, true) / 32768;
    return { pcm: [pcm], sampleRate: SAMPLE_RATE, name: ref.name };
  }
  function encodeAudio(audio) {
    if (!audio || !Array.isArray(audio.pcm) || audio.pcm.length < 1 || audio.pcm.length > 8 || !Number.isFinite(audio.sampleRate) || audio.sampleRate < 8000 || audio.sampleRate > 192000) throw new Error('Invalid audio ingredient.');
    const frames = audio.pcm[0] && audio.pcm[0].length;
    if (!Number.isInteger(frames) || frames < 1 || audio.pcm.some(channel => !channel || channel.length !== frames)) throw new Error('Audio channels must have matching frames.');
    if (frames / audio.sampleRate > MAX_SECONDS) throw new Error('Choose an ingredient of 20 seconds or less. Trim a longer recording before importing it.');
    const outputFrames = Math.max(1, Math.min(MAX_FRAMES, Math.round(frames * SAMPLE_RATE / audio.sampleRate)));
    const bytes = new Uint8Array(outputFrames * 2), view = new DataView(bytes.buffer);
    // A short windowed-sinc kernel suppresses aliasing when bringing high-rate
    // field recordings into the portable 22.05 kHz ingredient format.
    const ratio = audio.sampleRate / SAMPLE_RATE, cutoff = Math.min(1, SAMPLE_RATE / audio.sampleRate), radius = 12;
    for (let i = 0; i < outputFrames; i++) {
      const position = i * ratio, center = Math.floor(position);
      let value = 0, weightSum = 0;
      for (let tap = -radius + 1; tap <= radius; tap++) {
        const index = center + tap;
        if (index < 0 || index >= frames) continue;
        const distance = position - index, phase = Math.PI * distance * cutoff;
        const sinc = Math.abs(phase) < 1e-10 ? 1 : Math.sin(phase) / phase;
        const weight = sinc * (.5 + .5 * Math.cos(Math.PI * distance / radius)) * cutoff;
        let sample = 0;
        for (const channel of audio.pcm) { const next = channel[index]; if (!Number.isFinite(next)) throw new Error('Audio contains invalid samples.'); sample += next; }
        value += sample / audio.pcm.length * weight;
        weightSum += weight;
      }
      value = clamp(weightSum ? value / weightSum : 0, -1, 1);
      view.setInt16(i * 2, Math.round(value < 0 ? value * 32768 : value * 32767), true);
    }
    return { kind: 'pcm', name: String(audio.name || 'Imported ingredient').slice(0, 120), sampleRate: SAMPLE_RATE, channels: 1, frames: outputFrames, data: encodeBase64(bytes) };
  }
  root.MarinadeSources = Object.freeze({ catalog, SAMPLE_RATE, MAX_SECONDS, MAX_FRAMES, resolve, encodeAudio, validateRef, getFrameCount: ref => ref && ref.kind === 'factory' && byId.has(ref.id) ? byId.get(ref.id).frames : ref && ref.frames, clearCache: () => cache.clear() });
})(typeof window !== 'undefined' ? window : globalThis);
