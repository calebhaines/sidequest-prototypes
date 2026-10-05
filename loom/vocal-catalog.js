/* GLAZE · a vocal finishing station. All processing is local. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const switcher = (key, value) => select(key, 'Stage', value, [['on', 'On'], ['off', 'Off']]);
  const rhythmic = [['1/32', '1/32 note'], ['1/16', '1/16 note'], ['1/8', '1/8 note'], ['1/8.', 'Dotted eighth'], ['1/4', 'Quarter note'], ['1/4.', 'Dotted quarter'], ['1/2', 'Half note'], ['1', 'One bar'], ['2', 'Two bars']];
  const params = [
    switcher('clean', 'on'), range('input', 'Input trim', -18, 24, .1, 0, 'dB'), range('highpass', 'Low cut', 20, 400, 1, 75, 'Hz'), range('gate', 'Gate threshold', -90, -12, 1, -70, 'dB'), range('gateRange', 'Gate reduction', 0, 60, .1, 45, 'dB'), range('gateRelease', 'Gate release', 20, 1000, 1, 180, 'ms'),
    switcher('deess', 'on'), range('deessFreq', 'Sibilance frequency', 2500, 11000, 1, 6500, 'Hz'), range('deessThreshold', 'De-ess threshold', -60, -3, .1, -24, 'dB'), range('deessAmount', 'De-ess strength', 0, 1, .01, .45, '%'),
    switcher('compressor', 'on'), range('threshold', 'Threshold', -48, 0, .1, -18, 'dB'), range('ratio', 'Ratio', 1, 20, .1, 3, ':1'), range('attack', 'Attack', .2, 80, .1, 5, 'ms'), range('release', 'Release', 20, 1200, 1, 120, 'ms'), range('makeup', 'Makeup gain', 0, 18, .1, 2, 'dB'),
    switcher('eq', 'on'), range('body', 'Body', -15, 15, .1, 0, 'dB'), range('bodyFreq', 'Body frequency', 100, 600, 1, 220, 'Hz'), range('mud', 'Low-middle', -15, 15, .1, -1, 'dB'), range('mudFreq', 'Low-middle frequency', 180, 1200, 1, 420, 'Hz'), range('presence', 'Presence', -15, 15, .1, 1, 'dB'), range('presenceFreq', 'Presence frequency', 1200, 7000, 1, 3200, 'Hz'), range('air', 'Air', -15, 15, .1, 1.5, 'dB'),
    select('saturation', 'Colour', 'off', [['off', 'Off'], ['warm', 'Warm glaze'], ['edge', 'Hard caramel'], ['fold', 'Folded sugar']]), range('drive', 'Drive', 0, 30, .1, 3, 'dB'), range('satMix', 'Colour blend', 0, 1, .01, .25, '%'),
    select('pitch', 'Pitch mode', 'off', [['off', 'Off'], ['shift', 'Transpose'], ['correct', 'Scale correction']]), range('semitones', 'Transpose', -24, 24, 1, 0, 'st'), range('fine', 'Fine tune', -100, 100, 1, 0, 'cent'), select('key', 'Root note', 'C', ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].map(note => [note, note])), select('scale', 'Scale', 'chromatic', [['chromatic', 'Chromatic'], ['major', 'Major'], ['minor', 'Minor'], ['pentatonic', 'Pentatonic'], ['harmonic-minor', 'Harmonic minor']]), range('speed', 'Correction strength', 0, 1, .01, .65, '%'), range('pitchWindow', 'Pitch window', 20, 100, 1, 50, 'ms'), range('pitchMix', 'Pitch blend', 0, 1, .01, 1, '%'),
    switcher('harmony', 'off'), range('harmonyA', 'Harmony A interval', -24, 24, 1, 7, 'st'), range('harmonyB', 'Harmony B interval', -24, 24, 1, 12, 'st'), range('harmonyMix', 'Harmony blend', 0, 1, .01, .3, '%'), range('harmonyWidth', 'Harmony width', 0, 1, .01, .7, '%'),
    switcher('doubler', 'off'), range('doubleAmount', 'Double blend', 0, 1, .01, .3, '%'), range('doubleSpread', 'Double width', 0, 1, .01, .8, '%'), range('doubleTime', 'Double time', 8, 45, 1, 18, 'ms'), range('doubleDetune', 'Double drift', 0, 25, .1, 7, 'cent'),
    select('vowel', 'Vowel shape', 'off', [['off', 'Off'], ['ah', 'Ah'], ['eh', 'Eh'], ['ee', 'Ee'], ['oh', 'Oh'], ['oo', 'Oo']]), range('formant', 'Vowel shift', -12, 12, .1, 0, 'st'), range('vowelMix', 'Vowel blend', 0, 1, .01, .5, '%'),
    select('robot', 'Robot mode', 'off', [['off', 'Off'], ['ring', 'Ring modulation'], ['vocoder', 'Twelve-band vocoder']]), select('carrier', 'Vocoder carrier', 'saw', [['saw', 'Saw'], ['square', 'Square'], ['pulse', 'Narrow pulse']]), range('carrierNote', 'Carrier MIDI note', 24, 84, 1, 45, ''), select('carrierChord', 'Carrier chord', 'single', [['single', 'Single note'], ['fifth', 'Root + fifth'], ['minor', 'Minor triad'], ['major', 'Major triad']]), range('robotMix', 'Robot blend', 0, 1, .01, .65, '%'), range('robotFreq', 'Ring frequency', 20, 2000, 1, 120, 'Hz'),
    switcher('chop', 'off'), select('chopDivision', 'Chop cycle', '1/16', rhythmic), range('chopDepth', 'Chop depth', 0, 1, .01, 1, '%'), range('chopDuty', 'Open length', .05, .95, .01, .5, '%'), range('chopSmooth', 'Chop smoothing', .2, 40, .1, 3, 'ms'),
    switcher('delay', 'off'), select('delayClock', 'Delay clock', 'sync', [['sync', 'Follow session tempo'], ['free', 'Milliseconds']]), select('delayDivision', 'Delay division', '1/8.', rhythmic.filter(item => item[0] !== '2')), range('delayTime', 'Delay time', 20, 2000, 1, 375, 'ms'), range('delayFeedback', 'Feedback', 0, .88, .01, .35, '%'), range('delayTone', 'Repeat tone', 500, 14000, 1, 5500, 'Hz'), range('delayWidth', 'Repeat width', 0, 1, .01, .85, '%'), range('delayMix', 'Delay blend', 0, 1, .01, .15, '%'), range('delayDuck', 'Delay ducking', 0, 1, .01, .5, '%'),
    switcher('reverb', 'off'), range('reverbSize', 'Room size', 0, 1, .01, .45, '%'), range('reverbDecay', 'Decay', .2, 10, .1, 2.4, 's'), range('predelay', 'Pre-delay', 0, 150, 1, 18, 'ms'), range('reverbTone', 'Reverb tone', 800, 14000, 1, 6500, 'Hz'), range('reverbWidth', 'Reverb width', 0, 1, .01, .8, '%'), range('reverbMix', 'Reverb blend', 0, 1, .01, .18, '%'), range('reverbDuck', 'Reverb ducking', 0, 1, .01, .5, '%'),
    switcher('guard', 'on'), range('ceiling', 'Peak ceiling', -12, 0, .1, -.5, 'dB'), range('output', 'Output trim', -24, 12, .1, 0, 'dB')
  ];
  const guides = {
    clean: {
      use: 'Use low cut for microphone rumble or boomy plosives, and the gate for noise between phrases. Keep the threshold low enough to retain quiet words and breaths.',
      controls: [
        ['Input trim', 'Sets the level entering the processed path, including how strongly later effects react. It still works with Cleanup off; global Bypass or 0% Dry / wet leaves the original signal unchanged.'],
        ['Low cut', 'Removes frequencies below its cutoff. Raise it to reduce rumble; lower it if the voice loses body.'],
        ['Gate threshold & reduction', 'Threshold is the quiet level below which the gate turns the voice down. Reduction is the maximum amount it can turn down, rather than a second threshold.'],
        ['Gate release', 'Controls how gradually the gate closes as a phrase fades. Longer releases retain word endings; shorter releases suppress gaps more quickly. The gate does not separate noise from a word while both are sounding.']
      ]
    },
    deess: {
      use: 'Use this when S, SH, and similar consonants are much brighter than the rest of the voice. Too much reduction can make speech sound lispy.',
      controls: [
        ['Sibilance frequency', 'Chooses the high-frequency region to detect and soften. Listen for the harsh area rather than treating this as a pitch control.'],
        ['De-ess threshold', 'Sets how loud that high-frequency energy must become before reduction starts. A lower threshold catches more sounds.'],
        ['De-ess strength', 'Sets the amount of high-shelf reduction when triggered. The lower part of the voice stays present; the whole signal is not simply turned down.']
      ]
    },
    compressor: {
      use: 'Use compression to bring loud and quiet phrases closer together, keep a lead vocal steady, or make an aggressive delivery feel more controlled.',
      controls: [
        ['Threshold & ratio', 'Threshold decides when loud phrases are reduced. Ratio sets how strongly they are reduced: a higher ratio gives firmer control.'],
        ['Attack & release', 'Attack controls how quickly reduction begins; a slower attack preserves more initial consonant punch. Release controls how quickly the level recovers after a loud phrase.'],
        ['Makeup gain', 'Raises the compressed signal afterwards. Match its loudness to the bypassed sound so you can judge the compression fairly.']
      ]
    },
    eq: {
      use: 'Use EQ to fit a voice into the mix: cut excess boxiness, restore warmth, bring words forward, or soften a bright microphone.',
      controls: [
        ['Body & Body frequency', 'A bell-shaped band for low-middle warmth. Body sets the boost or cut; its frequency chooses the centre of that band.'],
        ['Low-middle & Low-middle frequency', 'Another bell band for boxy or muddy tones. Negative gain can clear space without removing all the bass.'],
        ['Presence & Presence frequency', 'A bell band for upper-middle articulation. A small boost can clarify words; a cut can soften a nasal or biting sound.'],
        ['Air', 'A high shelf fixed at 8.5 kHz. Positive gain adds top-end brightness; negative gain darkens it. For sharp consonants that occur only occasionally, try De-ess first.']
      ]
    },
    saturation: {
      use: 'Use a little saturation for density and texture, or push the drive for a deliberately distorted vocal. Compare levels when judging the result.',
      controls: [
        ['Warm glaze', 'Rounded, symmetrical soft clipping adds harmonics and gentle density. A useful starting point for subtle warmth.'],
        ['Hard caramel', 'Asymmetrical clipping treats the two sides of the waveform differently, giving a more pointed, gritty character.'],
        ['Folded sugar', 'Wavefolding folds strong waveform peaks back on themselves. Higher drive creates dense, buzzy, sometimes metallic tones.'],
        ['Drive & Colour blend', 'Drive pushes the signal harder into the chosen distortion. Colour blend mixes that result with the signal entering this stage.']
      ]
    },
    pitch: {
      use: 'Use Transpose for octave or character changes. Use Scale correction on one clear sung line for subtle tuning or a deliberate hard-tuned effect.',
      controls: [
        ['Transpose & Fine tune', 'Move the voice up or down in semitones and cents while preserving its duration. These offsets also apply after scale correction. The grain shifter can audibly change the voice’s texture.'],
        ['Scale correction · Root note & Scale', 'Detects one pitch at a time and pulls it towards the nearest allowed note. Choose the song’s root and scale; Chromatic allows every semitone. It is intended for a single pitched voice, not chords or several singers together.'],
        ['Correction strength', 'Higher values pull farther and more quickly towards the allowed note. Lower values leave more of the original pitch movement.'],
        ['Pitch window & Pitch blend', 'Window sets the grain-shifting window shared with Harmony. Shorter windows generally respond faster; longer windows can sound smoother. Pitch blend mixes the shifted voice with the signal entering this stage.'],
        ['Live timing', 'Pitch and harmony use delayed copies: the nominal wet window is about 4 ms to the chosen window plus 4 ms. Scale correction also needs roughly 60–80 ms to track a new note. Keep Pitch and Harmony off for the quickest direct response.']
      ]
    },
    harmony: {
      use: 'Use these extra voices for octave reinforcement, parallel fifths, a synthetic choir, or unusual intervals around a lead.',
      controls: [
        ['Harmony A & B intervals', 'Set each copy’s fixed distance from the voice entering the pitch stage. +12 is an octave up; −12 is an octave down; +7 is a fifth. The copies use the source before the main Transpose or Scale correction.'],
        ['Harmony blend & width', 'Blend sets the added voices’ level. Width spreads the two copies left and right. These are fixed intervals; they do not choose chords or adapt their intervals to the selected key and scale.'],
        ['Shared pitch window', 'Harmony uses the Pitch window even when the main Pitch mode is off. Shorter windows favour live response; longer windows favour smoother shifts. The delayed harmony copies leave the direct voice available.']
      ]
    },
    doubler: {
      use: 'Use a light double to widen a lead, or more for a chorus-like texture. It creates copies of this take rather than replacing a separately recorded performance.',
      controls: [
        ['Double blend & width', 'Blend sets the amount of two short delayed copies. Width spreads their differences across the stereo image.'],
        ['Double time & drift', 'Time sets their short delay. Drift adds slow, opposing delay motion, creating small pitch variations. More drift sounds less like a stable unison and more like a chorus.']
      ]
    },
    vowel: {
      use: 'Use vowel shaping for nasal, hollow, talking-filter, or creature-like colours on a voice or another sound.',
      controls: [
        ['Vowel shape', 'Ah, Eh, Ee, Oh, and Oo select three resonant filter peaks that suggest different vowel colours. They do not analyse or reconstruct a real mouth.'],
        ['Vowel shift', 'Moves those filter peaks together: upward generally sounds brighter or smaller; downward sounds darker or larger. This changes filter colour rather than transparently preserving formants during pitch shifting.'],
        ['Vowel blend', 'Mixes the resonant-filter result with the signal entering this stage. Start low to keep the words recognisable.']
      ]
    },
    robot: {
      use: 'Use Ring modulation for tremulous or metallic voices, and Vocoder for speech-shaped synth notes or chords.',
      controls: [
        ['Ring modulation · Ring frequency', 'Multiplies the voice by a sine wave, creating new sum and difference frequencies. Low rates sound tremulous; higher rates sound metallic or deliberately out of tune. Ring frequency sets that sine wave’s rate.'],
        ['Twelve-band vocoder', 'Measures the voice’s energy in twelve frequency bands and uses it to shape an internal synthesizer. The singer supplies articulation; the synthesizer supplies the pitched carrier.'],
        ['Carrier, MIDI note & chord', 'Choose Saw, Square, or Narrow pulse for the synth tone. The carrier note sets its pitch; Single, Fifth, Minor, or Major chooses its note combination. These controls apply to Vocoder, not Ring modulation.'],
        ['Robot blend', 'Mixes the chosen robot sound with the incoming voice. Some original voice can help keep consonants and words clear.']
      ]
    },
    chop: {
      use: 'Use rhythmic chopping to turn a held word into a pulse, create stuttering phrases, or make a vocal move with a busy drum pattern.',
      controls: [
        ['Chop cycle', 'Sets the repeating musical subdivision. It follows GALLEY’s tempo and follows the arrangement’s beat while the transport plays.'],
        ['Chop depth & Open length', 'Depth decides how far the quiet part of the cycle turns down. Open length is the fraction of each cycle that lets the voice through.'],
        ['Chop smoothing', 'Softens the transitions between open and closed. Short values give sharp cuts; longer values give rounded pulses.']
      ]
    },
    delay: {
      use: 'Use short repeats for a slapback or added thickness, tempo repeats for rhythmic answers, and higher feedback for long echo trails.',
      controls: [
        ['Delay clock, division & time', 'Follow session tempo uses a musical division, including dotted values. Milliseconds uses Delay time directly. Changing the time can bend the repeats as the delay moves.'],
        ['Feedback & Repeat tone', 'Feedback sends echoes back into the delay: more gives longer trails. Repeat tone rolls off high frequencies as they circulate, making later repeats darker.'],
        ['Repeat width & Delay blend', 'Width sends feedback between the left and right channels for a ping-pong feel. Delay blend sets the returned echoes’ level while keeping the current voice present.'],
        ['Delay ducking', 'Turns the returned echoes down while the processed voice is active, then lets them rise into the gaps. Increase it when repeats obscure new words.']
      ]
    },
    reverb: {
      use: 'Use a short, quiet tail to place a vocal in a room, or longer, louder settings for halls, washes, and distant voices.',
      controls: [
        ['Room size & Decay', 'Size changes the spacing of the simulated reflections. Decay sets how long their tail lasts. They shape the room separately.'],
        ['Pre-delay & Reverb tone', 'Pre-delay waits before the room reflections begin, helping the lead stay distinct. Tone darkens the high-frequency content of the tail.'],
        ['Reverb width & blend', 'Width spreads the room across stereo. Blend sets the room’s added level; the direct voice remains present.'],
        ['Reverb ducking', 'Lowers the room return while the processed voice is active and lets it recover between phrases, keeping a long tail out of the way of the words.']
      ]
    },
    output: {
      use: 'Use Output trim to match levels, the peak guard to cap excessive processed peaks, and Dry / wet to mix the complete strip with the original sound.',
      controls: [
        ['Output trim', 'Sets the processed path’s level after its effects, before the peak guard. It still works when Peak guard is off.'],
        ['Peak ceiling', 'The guard hard-caps processed samples at this level without a lookahead buffer. Repeated heavy clipping can distort; lower Output trim if the guard is working too hard.'],
        ['Dry / wet', 'Mixes the complete processed path with the original input after the guard. 0% is original audio; 100% is processed audio. A louder dry signal can exceed the processed peak ceiling in the final blend. Global Bypass skips the whole strip.']
      ]
    }
  };
  const group = (id, label, shortLabel, enableKey, description, keys, basicKeys) => ({ id, label, shortLabel, enableKey, description, keys, basicKeys, help: guides[id] });
  scope.LoomVocalCatalog = {
    id: 'glaze', name: 'GLAZE', subtitle: 'A finishing station for every voice in the room.', color: '#d4a0bd', accent: '#ffdccd', visual: 'glaze', panel: 'vocal',
    description: 'Clean, contain, tune, thicken, distort, chop, and send a voice into a room it has no business occupying. One insert. Every stage has its own switch.',
    params, defaults: Object.assign(Object.fromEntries(params.map(p => [p.key, p.default])), { mix: 1, bypass: false }),
    groups: [
      group('clean', '01 · Prep & cleanup', 'Cleanup', 'clean', 'Low cut removes bass rumble. The gate reduces quiet input between phrases; input trim sets the level feeding the processed strip.', ['input', 'highpass', 'gate', 'gateRange', 'gateRelease'], ['input', 'highpass', 'gate']),
      group('deess', '02 · Tame the hiss', 'De-ess', 'deess', 'De-essing softens harsh S and SH sounds only when high-frequency energy crosses the threshold, preserving the lower part of the voice.', ['deessFreq', 'deessThreshold', 'deessAmount'], ['deessAmount']),
      group('compressor', '03 · Hold the voice', 'Dynamics', 'compressor', 'Compression turns louder phrases down so the performance stays more even. Threshold and ratio set the amount of control.', ['threshold', 'ratio', 'attack', 'release', 'makeup'], ['threshold', 'ratio']),
      group('eq', '04 · Tone & air', 'Tone', 'eq', 'EQ boosts or cuts warmth, boxiness, clarity, and top-end brightness. Shape the voice to sit more clearly in the mix.', ['body', 'bodyFreq', 'mud', 'mudFreq', 'presence', 'presenceFreq', 'air'], ['body', 'presence', 'air']),
      group('saturation', '05 · Caramelisation', 'Colour', 'saturation', 'Saturation adds harmonics and distortion: rounded Warm glaze, gritty Hard caramel, or buzzy Folded sugar. Drive sets the intensity.', ['drive', 'satMix'], ['drive', 'satMix']),
      group('pitch', '06 · Tune & transpose', 'Pitch', 'pitch', 'Transpose shifts pitch; Scale correction pulls one sung voice towards notes in a chosen scale. Both use a pitch window that adds delay.', ['semitones', 'fine', 'key', 'scale', 'speed', 'pitchWindow', 'pitchMix'], ['semitones', 'key', 'scale', 'speed', 'pitchWindow']),
      group('harmony', '07 · Extra mouths', 'Harmony', 'harmony', 'Harmony adds two pitch-shifted copies at fixed intervals from the incoming voice. Blend and width turn them into subtle support or a synthetic choir.', ['harmonyA', 'harmonyB', 'harmonyMix', 'harmonyWidth'], ['harmonyA', 'harmonyB', 'harmonyMix']),
      group('doubler', '08 · Double service', 'Double', 'doubler', 'Doubling adds two short, slowly drifting copies to thicken and widen a voice without another recorded take.', ['doubleAmount', 'doubleSpread', 'doubleTime', 'doubleDetune'], ['doubleAmount', 'doubleSpread']),
      group('vowel', '09 · Shape the mouth', 'Vowel', 'vowel', 'Three resonant filter peaks suggest Ah, Eh, Ee, Oh, or Oo colours. Vowel shift moves the peaks without changing the note being sung.', ['formant', 'vowelMix'], ['formant', 'vowelMix']),
      group('robot', '10 · Kitchen intercom', 'Robot', 'robot', 'Ring modulation makes tremulous or metallic tones. The twelve-band Vocoder lets the voice’s articulation shape an internal synth note or chord.', ['carrier', 'carrierNote', 'carrierChord', 'robotMix', 'robotFreq'], ['carrierNote', 'robotFreq', 'robotMix']),
      group('chop', '11 · Cut the phrase', 'Chop', 'chop', 'Chopping repeatedly opens and closes the voice in time with the tempo. Depth sets the cuts; smoothing rounds their edges.', ['chopDivision', 'chopDepth', 'chopDuty', 'chopSmooth'], ['chopDivision', 'chopDepth']),
      group('delay', '12 · Repeat the order', 'Delay', 'delay', 'Delay adds stereo echoes. Feedback extends the trail, and ducking lowers repeats during new words so they rise into the gaps.', ['delayClock', 'delayDivision', 'delayTime', 'delayFeedback', 'delayTone', 'delayWidth', 'delayMix', 'delayDuck'], ['delayClock', 'delayDivision', 'delayTime', 'delayFeedback', 'delayMix']),
      group('reverb', '13 · Room for dessert', 'Reverb', 'reverb', 'Reverb adds simulated room reflections and a fading tail. Decay sets its length; ducking keeps the room behind the words.', ['reverbSize', 'reverbDecay', 'predelay', 'reverbTone', 'reverbWidth', 'reverbMix', 'reverbDuck'], ['reverbDecay', 'reverbMix']),
      group('output', '14 · Plate & pass', 'Peak guard', 'guard', 'Output trim sets the processed level; the peak guard caps its peaks. Dry / wet blends the complete strip with the original input.', ['ceiling', 'output', 'mix'], ['output', 'mix'])
    ],
    presets: [
      { id: 'first-service', name: 'First service · clean lead', description: 'A practical lead strip: low cut, light de-essing, even phrases, and a breath of air. Pitch processing stays off.', params: {} },
      { id: 'close-quarters', name: 'Close quarters · intimate', description: 'Firm, close vocals with a soft room tucked underneath.', params: { highpass: 95, threshold: -22, ratio: 4, attack: 8, makeup: 3, mud: -2.5, air: 2, reverb: 'on', reverbDecay: .8, reverbMix: .07, predelay: 9, reverbDuck: .7 } },
      { id: 'spoken-menu', name: 'Spoken menu · narration', description: 'Controlled speech with a little presence. No doubling, pitch window, or long ambience.', params: { highpass: 100, deessAmount: .6, threshold: -24, ratio: 4.5, attack: 3, release: 160, makeup: 3, presence: 2.5, air: 0, gate: -58, gateRange: 16, gateRelease: 240 } },
      { id: 'silver-service', name: 'Silver service · polished', description: 'Bright lead vocals, a discreet double, and ducked rhythmic repeats.', params: { highpass: 90, deessAmount: .6, threshold: -21, ratio: 4, makeup: 3, presence: 2, air: 3, doubler: 'on', doubleAmount: .12, doubleDetune: 4, delay: 'on', delayMix: .1, delayFeedback: .28, reverb: 'on', reverbDecay: 1.8, reverbMix: .12 } },
      { id: 'room-temperature', name: 'Room temperature · natural', description: 'A gentle finishing pass with a small room. The singer stays in front.', params: { highpass: 60, gate: -80, ratio: 2, attack: 18, threshold: -20, makeup: 1, mud: 0, presence: .5, air: 1, reverb: 'on', reverbDecay: 1.2, reverbSize: .25, reverbMix: .1 } },
      { id: 'locked-glaze', name: 'Set glaze · hard tuning', description: 'Strong A-minor correction, a wide double, and tight repeats. Designed for a single sung line; pitch processing adds delay.', params: { pitch: 'correct', key: 'A', scale: 'minor', speed: 1, pitchWindow: 40, threshold: -24, ratio: 5, makeup: 3, doubler: 'on', doubleAmount: .2, delay: 'on', delayDivision: '1/8', delayMix: .12, reverb: 'on', reverbMix: .1 } },
      { id: 'upper-shelf', name: 'Upper shelf · octave choir', description: 'A fifth and an octave gather around the original voice. Fixed intervals, no choir required.', params: { harmony: 'on', harmonyA: 7, harmonyB: 12, harmonyMix: .4, harmonyWidth: 1, doubler: 'on', doubleAmount: .15, reverb: 'on', reverbDecay: 3.8, reverbMix: .24, reverbDuck: .65 } },
      { id: 'heavy-syrup', name: 'Heavy syrup · low creature', description: 'An octave-down voice, dark resonant vowels, and a little burnt edge.', params: { pitch: 'shift', semitones: -12, pitchWindow: 70, vowel: 'oh', formant: -4, vowelMix: .3, saturation: 'warm', drive: 8, satMix: .35, air: -4, reverb: 'on', reverbDecay: 2.8, reverbTone: 2500, reverbMix: .14, output: -3 } },
      { id: 'sugar-glass', name: 'Sugar glass · bright creature', description: 'A lifted voice with narrow vowel colour and short, glassy repeats.', params: { pitch: 'shift', semitones: 7, pitchWindow: 35, vowel: 'ee', formant: 4, vowelMix: .35, doubler: 'on', doubleAmount: .3, doubleDetune: 12, delay: 'on', delayDivision: '1/16', delayFeedback: .4, delayMix: .18, output: -2 } },
      { id: 'burnt-caramel', name: 'Burnt caramel · grit', description: 'A forward, compressed voice with a hard edge. The blend keeps some human underneath.', params: { threshold: -26, ratio: 6, makeup: 4, saturation: 'edge', drive: 16, satMix: .55, presence: 3, air: -2, delay: 'on', delayClock: 'free', delayTime: 95, delayFeedback: .13, delayMix: .12, output: -5 } },
      { id: 'intercom-choir', name: 'Intercom choir · vocoder', description: 'An A-minor synth chord borrows the singer’s articulation. Choose a carrier note in the full pantry.', params: { robot: 'vocoder', carrier: 'saw', carrierNote: 45, carrierChord: 'minor', robotMix: 1, eq: 'off', reverb: 'on', reverbDecay: 2.6, reverbMix: .18, delay: 'on', delayDivision: '1/8', delayMix: .13, output: -3 } },
      { id: 'broken-ticket', name: 'Broken ticket · chopped', description: 'Fast rhythmic cuts, narrow ring modulation, and repeats that refuse to read the order once.', params: { robot: 'ring', robotFreq: 180, robotMix: .4, chop: 'on', chopDivision: '1/32', chopDepth: .9, chopDuty: .35, chopSmooth: .8, delay: 'on', delayDivision: '1/8.', delayFeedback: .58, delayMix: .28, saturation: 'fold', drive: 7, satMix: .18, output: -3 } },
      { id: 'cold-storage', name: 'Cold storage · endless hall', description: 'A voice at the end of a long corridor. Ducked ambience keeps new phrases visible.', params: { doubler: 'on', doubleAmount: .28, doubleSpread: 1, reverb: 'on', reverbSize: .9, reverbDecay: 8, predelay: 65, reverbMix: .48, reverbDuck: .8, delay: 'on', delayDivision: '1/2', delayFeedback: .64, delayMix: .24, delayDuck: .75, output: -3 } },
      { id: 'staff-radio', name: 'Staff radio · narrow & odd', description: 'A thin, nasal voice with a ring of machinery and a very small room.', params: { highpass: 280, body: -12, mud: 4, mudFreq: 900, presence: 4, air: -12, vowel: 'eh', formant: 2, vowelMix: .5, saturation: 'warm', drive: 12, satMix: .45, robot: 'ring', robotFreq: 35, robotMix: .15, reverb: 'on', reverbDecay: .4, reverbMix: .08, output: -4 } }
    ]
  };
  for (const g of scope.LoomVocalCatalog.groups) g.optional = !['clean', 'deess', 'compressor', 'eq', 'output'].includes(g.id);
  scope.LoomVocalCatalog.groups.find(g => g.id === 'clean').alwaysKeys = ['input'];
  scope.LoomVocalCatalog.groups.find(g => g.id === 'output').alwaysKeys = ['output', 'mix'];
})(typeof window === 'undefined' ? globalThis : window);
