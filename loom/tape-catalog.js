/* PRESERVE · tape colour, kept on the shelf. No external assets. */
(function (scope) {
  'use strict';
  const range = (key, label, min, max, step, value, unit = '') => ({ key, label, type: 'range', min, max, step, default: value, unit });
  const amount = (key, label, value) => ({ ...range(key, label, 0, 1, .01, value), display: 'percent' });
  const select = (key, label, value, options) => ({ key, label, type: 'select', default: value, options: options.map(([value, label]) => ({ value, label })) });
  const models = [
    { id: 'studio', name: 'Studio two-track', inspiration: 'Precision two-track mastering and multitrack reel machines', description: 'A firm, open reel-machine character with generous headroom, restrained magnetic memory and a focused head bump. Start here for mix-bus colour and smooth drum peaks.' },
    { id: 'valve', name: 'Valve reel', inspiration: 'Early valve recording electronics and open-reel machines', description: 'A softer recording amplifier, more asymmetric harmonics and a slower magnetic recovery. Useful for rounding vocals, bass and an exposed instrument without adding artificial room sound.' },
    { id: 'home', name: 'Quarter-track home', inspiration: 'Domestic quarter-track open-reel recorders', description: 'A narrower, more intimate reel character with less overload headroom and stronger low-frequency colour. Speed, tape stock and transport motion remain independent controls.' },
    { id: 'cassette', name: 'Compact cassette', inspiration: 'Compact-cassette record and playback decks', description: 'A compact, softer-bandwidth character with earlier overload and more head loss. Choose 1⅞ ips for a familiar cassette starting point, then add wear or motion to taste.' }
  ];
  const params = [
    select('model', 'Tape machine', 'studio', models.map(model => [model.id, model.name])),
    select('speed', 'Tape speed', '15', [['15', '15 ips · balanced'], ['30', '30 ips · open'], ['7.5', '7½ ips · warm'], ['3.75', '3¾ ips · domestic'], ['1.875', '1⅞ ips · cassette']]),
    select('formula', 'Tape stock', 'oxide', [['oxide', 'Classic oxide'], ['high-output', 'High-output stock'], ['low-noise', 'Low-noise stock']]),
    range('drive', 'Drive', 0, 24, .1, 4, 'dB'), amount('warmth', 'Warmth', .45), amount('wear', 'Wear', 0), range('output', 'Output', -24, 12, .1, 0, 'dB'),
    range('input', 'Input trim', -18, 18, .1, 0, 'dB'), range('bias', 'Bias · under / over', -1, 1, .01, 0), range('calibration', 'Record calibration', -6, 6, .1, 0, 'dB'), amount('headBump', 'Head bump', .3), range('lowTrim', 'Low trim', -6, 6, .1, 0, 'dB'), range('highTrim', 'High trim', -6, 6, .1, 0, 'dB'),
    select('autoGain', 'Drive compensation', 'on', [['on', 'On · trim Drive gain'], ['off', 'Off · keep Drive gain']]),
    range('wow', 'Wow depth', 0, 1.5, .01, 0, '%'), range('wowRate', 'Wow rate', .1, 2, .01, .4, 'Hz'), range('flutter', 'Flutter depth', 0, .5, .001, 0, '%'), range('flutterRate', 'Flutter rate', 2, 15, .1, 6, 'Hz'), amount('dropouts', 'Dropouts', 0),
    amount('noise', 'Tape hiss', 0), range('azimuth', 'Head alignment', -1, 1, .01, 0), range('crosstalk', 'Channel crosstalk', 0, .1, .001, 0), amount('stereoLink', 'Transport link', 1)
  ];
  const defaults = Object.assign(Object.fromEntries(params.map(param => [param.key, param.default])), { mix: 1, bypass: false });
  const recipe = (id, name, description, patch = {}) => ({ id, name, description, params: { ...defaults, ...patch } });
  scope.LoomTapeCatalog = [{
    id: 'preserve', name: 'PRESERVE', subtitle: 'Keep the good parts. Let the edges soften.', color: '#cfa56b', accent: '#f2dfad', visual: 'tape', panel: 'tape', mixLabel: 'Blend',
    description: 'Four tape-machine characters, five speeds and three tape stocks. Magnetic softening, recording-electronics colour, head response and optional transport motion share one tape path. Start with the five face knobs; open the folded panels for calibration, wow, flutter, dropouts, hiss and stereo alignment. These are reduced-order musical models, not measured replicas of specific hardware.',
    params, defaults, models,
    groups: [
      { id: 'main', section: 'main', label: 'Tape machine', help: 'Machine, speed and stock changes preserve the knobs. A house recipe replaces the complete setup. Drive records hotter; Warmth shapes magnetic softening; Wear ages the oxide without secretly enabling wow or flutter.', keys: ['model', 'speed', 'formula', 'drive', 'warmth', 'wear', 'output', 'mix'] },
      { id: 'calibration', section: 'advanced', label: 'Calibration & head response', help: 'Input trim sets the incoming level. Calibration changes the tape overload reference; Bias shifts under- and over-bias character. Head bump adds the speed-dependent low-frequency lift. Low and High trim finish the playback tone. Drive compensation removes nominal Drive gain; it is not automatic loudness matching.', keys: ['input', 'bias', 'calibration', 'headBump', 'lowTrim', 'highTrim', 'autoGain'] },
      { id: 'transport', section: 'advanced', label: 'Transport & dropouts', help: 'Wow is slow speed wander; Flutter is faster motion. Depth is a percentage of playback speed. Zero depth keeps timing unchanged. With motion enabled, the whole blend follows the moving tape head, keeping its internal colour blend coherent. Dropouts add smoothed, occasional oxide losses.', keys: ['wow', 'wowRate', 'flutter', 'flutterRate', 'dropouts'] },
      { id: 'stereo', section: 'advanced', label: 'Noise & stereo alignment', help: 'Hiss follows the signal and fades with it. Head alignment adds opposite channel character; Crosstalk leaks a little audio between channels. Transport link at 100% keeps left and right motion together; lower values loosen the stereo image. Noise, alignment error and crosstalk begin at zero.', keys: ['noise', 'azimuth', 'crosstalk', 'stereoLink'] }
    ],
    meters: [{ key: 'inputDb', label: 'Input', unit: 'dB' }, { key: 'tapeDb', label: 'Record in', unit: 'dB' }, { key: 'outputDb', label: 'Output', unit: 'dB' }, { key: 'compressionDb', label: 'Softening', unit: 'dB' }, { key: 'transportMs', label: 'Transport', unit: 'ms' }],
    presets: [
      recipe('fresh-stock', 'Fresh stock', 'A balanced studio reel: subtle warmth, nominal Drive compensation, and a clean, steady transport.'),
      recipe('thirty-polish', 'Thirty-IPS polish', 'Open high-speed studio tape with light magnetic colour for a full mix or delicate acoustic part.', { speed: '30', formula: 'low-noise', drive: 2, warmth: .25, headBump: .15 }),
      recipe('fifteen-glue', 'Fifteen-IPS glue', 'High-output reel stock with firmer peak rounding and a little low-frequency body. Transport remains steady.', { formula: 'high-output', drive: 8, warmth: .65, headBump: .4 }),
      recipe('valve-bloom', 'Valve bloom', 'A warm valve reel at 7½ ips: broad low colour, rounded edges and a gently over-biased top.', { model: 'valve', speed: '7.5', drive: 7, warmth: .75, headBump: .55, bias: .15, highTrim: -.7 }),
      recipe('quarter-home', 'Quarter-track home', 'A domestic reel with light age and a small amount of linked transport wander. No added hiss.', { model: 'home', speed: '3.75', drive: 5, warmth: .55, wear: .25, wow: .18, flutter: .035 }),
      recipe('cassette-lunch', 'Cassette lunch', 'Soft compact tape, modest hiss and gently moving playback. A quick route to a home-recorded colour.', { model: 'cassette', speed: '1.875', formula: 'low-noise', drive: 6, warmth: .65, wear: .45, wow: .32, flutter: .08, noise: .12, highTrim: -.5 }),
      recipe('worn-field', 'Worn field reel', 'A weathered location reel with audible wander, occasional dropouts and loose stereo transport. An intentional texture.', { model: 'home', speed: '7.5', drive: 8, warmth: .7, wear: .8, wow: .65, flutter: .14, noise: .2, dropouts: .35, azimuth: .25, stereoLink: .65 }),
      recipe('parallel-drums', 'Parallel drum glue', 'Hot studio tape blended behind the original transients. No transport wobble, hiss or dropout layer.', { formula: 'high-output', drive: 12, warmth: .8, headBump: .45, mix: .65 })
    ]
  }];
})(typeof window === 'undefined' ? globalThis : window);
