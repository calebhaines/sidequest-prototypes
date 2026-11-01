/* GALLEY · the mastering bench. Controls are saved; analysis is opt-in. */
(function (scope) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value)));
  const definitions = [
    ['input', 'Input', -18, 18, .1, 'dB', null],
    ['lowCut', 'Low cut', 15, 180, 1, 'Hz', 'cleanup', true],
    ['lowGain', 'Low shelf', -9, 9, .1, 'dB', 'eq'], ['lowFreq', 'Low frequency', 30, 400, 1, 'Hz', 'eq', true],
    ['midGain', 'Mid bell', -9, 9, .1, 'dB', 'eq'], ['midFreq', 'Mid frequency', 200, 6000, 1, 'Hz', 'eq', true], ['midQ', 'Mid width · Q', .25, 4, .01, '', 'eq'],
    ['highGain', 'High shelf', -9, 9, .1, 'dB', 'eq'], ['highFreq', 'High frequency', 2000, 18000, 10, 'Hz', 'eq', true],
    ['threshold', 'Threshold', -48, 0, .1, 'dB', 'glue'], ['ratio', 'Ratio', 1, 10, .1, ':1', 'glue'], ['attack', 'Attack', .1, 100, .1, 'ms', 'glue', true], ['release', 'Release', 20, 2000, 1, 'ms', 'glue', true], ['knee', 'Soft knee', 0, 18, .1, 'dB', 'glue'], ['makeup', 'Makeup', -12, 12, .1, 'dB', 'glue'], ['sidechain', 'Detector low cut', 20, 300, 1, 'Hz', 'glue', true], ['link', 'Stereo link', 0, 1, .01, '%', 'glue'], ['compMix', 'Parallel blend', 0, 1, .01, '%', 'glue'],
    ['width', 'Width', 0, 2, .01, '%', 'stereo'], ['monoBass', 'Mono below', 0, 400, 1, 'Hz', 'stereo'],
    ['drive', 'Drive', 0, 18, .1, 'dB', 'color'], ['colorMix', 'Colour blend', 0, 1, .01, '%', 'color'],
    ['ceiling', 'Ceiling', -12, 0, .1, 'dB', 'limiter'], ['limiterRelease', 'Recovery', 10, 1000, 1, 'ms', 'limiter', true],
    ['output', 'Output', -18, 12, .1, 'dB', null]
  ].map(([key, label, min, max, step, unit, stage, log = false]) => ({ key, label, min, max, step, unit, stage, log }));
  const byKey = new Map(definitions.map(definition => [definition.key, definition]));
  const stages = [
    { id: 'cleanup', title: 'Clean foundation', short: 'Low cut', note: 'Remove very low energy before the tone and dynamics stages.', keys: ['lowCut'] },
    { id: 'eq', title: 'Broad tone', short: 'Tone', note: 'Low and high shelves shape the edges; one sweepable mid bell makes space or brings the centre forward.', keys: ['lowGain', 'lowFreq', 'midGain', 'midFreq', 'midQ', 'highGain', 'highFreq'] },
    { id: 'glue', title: 'Glue compressor', short: 'Glue', note: 'A soft-knee compressor with parallel blend, adjustable stereo linking and a filtered detector. Match level with Makeup when comparing.', keys: ['threshold', 'ratio', 'attack', 'release', 'knee', 'makeup', 'sidechain', 'link', 'compMix'] },
    { id: 'stereo', title: 'Stereo field', short: 'Stereo', note: 'Width adjusts the side signal. Mono below narrows the low end; set it to zero to leave the bass split unchanged.', keys: ['width', 'monoBass'] },
    { id: 'color', title: 'Soft colour', short: 'Colour', note: 'Blend a gently rounded saturation stage into the signal. Drive and blend interact; check the final peak and listen at a matched level.', keys: ['drive', 'colorMix'] },
    { id: 'limiter', title: 'Final peak guard', short: 'Limiter', note: 'A linked zero-lookahead limiter catches output sample peaks. Ceiling sets its final sample level; check the estimated intersample meter before delivery.', keys: ['ceiling', 'limiterRelease'] }
  ];
  const face = ['input', 'threshold', 'width', 'ceiling', 'output'];
  let masteringDSP;
  const normalized = value => (masteringDSP ||= scope.createLoomMasteringDSP()).normalize(value);
  const recipes = [
    { id: 'clear-pass', name: 'Clear pass', description: 'All tools off. The master fader and four insert slots keep their existing jobs.', params: {} },
    { id: 'gentle-glue', name: 'Gentle glue', description: 'A slow, light squeeze with a clean low cut. Set the threshold for a little movement, rather than a constant reduction.', params: { enabled: true, cleanup: true, lowCut: 25, glue: true, threshold: -18, ratio: 1.5, attack: 30, release: 250, knee: 6 } },
    { id: 'open-room', name: 'Open room', description: 'A little air and width, a centred low end, and a final sample-peak guard.', params: { enabled: true, cleanup: true, lowCut: 25, eq: true, lowGain: -.8, highGain: 1, highFreq: 9000, stereo: true, width: 1.12, monoBass: 100, limiter: true, ceiling: -1 } },
    { id: 'warm-service', name: 'Warm service', description: 'Rounded colour, gentle bus compression and a small low shelf. Check gain reduction on the loudest section.', params: { enabled: true, cleanup: true, lowCut: 25, eq: true, lowGain: .8, highGain: -.7, glue: true, threshold: -20, ratio: 2, attack: 40, release: 350, makeup: 1, color: true, drive: 4, colorMix: .18, limiter: true, ceiling: -1, output: 1 } },
    { id: 'solid-foundation', name: 'Solid foundation', description: 'A focused low end and parallel glue, with restrained width and final peak control.', params: { enabled: true, cleanup: true, lowCut: 25, eq: true, lowGain: 1, lowFreq: 80, midGain: -.5, midFreq: 320, glue: true, threshold: -20, ratio: 2, attack: 35, release: 220, compMix: .8, stereo: true, width: .95, monoBass: 140, limiter: true, ceiling: -1, output: 1 } },
    { id: 'delivery-guard', name: 'Delivery guard', description: 'A clean low cut and final sample-peak ceiling, with the dynamics and stereo image left alone.', params: { enabled: true, cleanup: true, lowCut: 20, limiter: true, ceiling: -1.5, limiterRelease: 150 } }
  ];
  function display(definition, value) {
    if (!Number.isFinite(value)) return '—';
    if (definition.unit === '%') return Math.round(value * 100) + '%';
    if (definition.unit === 'Hz') return value === 0 && definition.key === 'monoBass' ? 'Off' : value >= 1000 ? (value / 1000).toFixed(value % 1000 ? 1 : 0) + ' kHz' : Math.round(value) + ' Hz';
    if (definition.unit === ':1') return value.toFixed(1) + ':1';
    if (definition.unit === 'dB') return (value > 0 ? '+' : '') + value.toFixed(1) + ' dB';
    if (definition.unit === 'ms') return value.toFixed(value < 10 ? 1 : 0) + ' ms';
    return value.toFixed(2);
  }
  const numberScale = definition => definition.unit === '%' ? 100 : 1;
  const progress = (definition, value) => definition.log ? Math.log(value / definition.min) / Math.log(definition.max / definition.min) : (value - definition.min) / (definition.max - definition.min);
  function create(options) {
    const { element, getState, getMeters = () => ({}), onChange = () => {}, onStatus = () => {}, onAnalysis = () => {}, onResetMeters = () => {}, getGeneration = () => 0 } = options;
    if (!element) throw Error('The mastering bench needs a container.');
    let disposed = false, gesture = null, keyboard = null, rangeGesture = null, observer = null, visible = true, externalVisible = true, requestedAnalysis = false, activeAnalysis = false, measured = false, lastAnalysis = {}, generation = getGeneration();
    const defaults = normalized({}), completeRecipes = recipes.map(recipe => ({ ...recipe, params: normalized(recipe.params) }));
    const $ = id => element.querySelector('#' + id), params = () => getState().master?.mastering || defaults;
    const exact = definition => `<div class="mastering-exact"><input type="number" data-mastering-number="${definition.key}" aria-label="${escape(definition.label)} exact value" min="${definition.min * numberScale(definition)}" max="${definition.max * numberScale(definition)}" step="${definition.step * numberScale(definition)}"><span>${definition.unit === '%' ? '%' : escape(definition.unit)}</span></div>`;
    const control = (key, rotary = false) => {
      const d = byKey.get(key);
      return rotary ? `<div class="mastering-control mastering-knob-control" data-mastering-control="${key}"><label id="mastering-label-${key}">${escape(d.label)}</label><button type="button" class="mastering-knob" role="slider" data-mastering-knob="${key}" aria-labelledby="mastering-label-${key}" aria-valuemin="${d.min}" aria-valuemax="${d.max}" aria-valuenow="0"><svg viewBox="0 0 88 88" aria-hidden="true"><path class="mastering-dial-ring" d="M17 67a35 35 0 1 1 54 0"/><circle class="mastering-dial-shadow" cx="44" cy="47" r="27"/><circle class="mastering-dial-cap" cx="44" cy="44" r="27"/><circle class="mastering-dial-inner" cx="44" cy="44" r="22"/><path class="mastering-dial-pointer" d="M44 43V25"/></svg></button>${exact(d)}</div>` : `<div class="mastering-control" data-mastering-control="${key}"><label for="mastering-${key}"><span>${escape(d.label)}</span><output data-mastering-value="${key}"></output></label><div class="mastering-value-row"><input id="mastering-${key}" type="range" data-mastering-param="${key}" min="${d.log ? 0 : d.min}" max="${d.log ? 1 : d.max}" step="${d.log ? .001 : d.step}" aria-label="${escape(d.label)}">${exact(d)}</div></div>`;
    };
    element.innerHTML = `<details class="mastering-bench" id="masteringBench"><summary><span><span class="eyebrow">MASTER / THE FINAL PASS</span><strong>Mastering bench</strong></span><span id="masteringSummary">All tools off</span><span class="mastering-open-mark" aria-hidden="true">+</span></summary><div class="mastering-body"><div class="mastering-toolbar"><label><span class="eyebrow">HOUSE FINISHES</span><select id="masteringPreset" aria-label="Mastering recipe"><option value="">Custom settings</option>${recipes.map(recipe => `<option value="${recipe.id}">${escape(recipe.name)}</option>`).join('')}</select></label><p id="masteringRecipeNote"></p><div class="mastering-actions"><button id="masteringPower" aria-pressed="false">Enable tools</button><button id="masteringBypass" aria-pressed="false">Bypass</button><button id="masteringReset">Reset tools</button></div></div><div class="mastering-face"><div class="mastering-face-heading"><div><span class="mastering-brand">The final pass</span><span>MASTER FINISHING / LEVEL · TONE · DYNAMICS</span></div><span id="masteringSignalStatus" class="mastering-signal-status">Tools off</span></div><div class="mastering-stage-strip">${stages.map(stage => `<button type="button" data-mastering-stage="${stage.id}" aria-pressed="false"><i aria-hidden="true"></i>${stage.short}</button>`).join('')}</div><div class="mastering-face-knobs">${face.map(key => control(key, true)).join('')}</div><p class="mastering-face-note" id="masteringFaceNote">Switch on a stage to shape the master. The four master insert slots remain available.</p><div class="mastering-quick-meters">${[['compressionDb', 'Glue reduction'], ['limiterReductionDb', 'Peak reduction'], ['samplePeakDb', 'Output sample peak']].map(([key, label]) => `<div><span>${label}</span><output data-mastering-meter="${key}">—</output><i><b data-mastering-meter-bar="${key}"></b></i></div>`).join('')}</div></div><div class="mastering-folds">${stages.map(stage => `<details data-mastering-fold="${stage.id}"><summary><span><strong>${stage.title}</strong><small>${stage.note}</small></span><span aria-hidden="true">+</span></summary><div class="mastering-fold-body"><label class="mastering-stage-switch"><input type="checkbox" data-mastering-stage-checkbox="${stage.id}"> ${stage.title} on</label><div class="mastering-deep-controls">${stage.keys.map(key => control(key)).join('')}</div></div></details>`).join('')}</div><section class="mastering-analysis" aria-labelledby="masteringAnalysisTitle"><div class="mastering-analysis-heading"><div><span class="eyebrow">MEASURE / LISTEN / CHECK</span><h3 id="masteringAnalysisTitle">Loudness &amp; delivery</h3></div><div class="mastering-analysis-buttons"><button id="masteringAnalysisStart">Start measurement</button><button id="masteringAnalysisPause" disabled>Pause</button><button id="masteringAnalysisReset">Reset meters</button></div></div><p id="masteringAnalysisStatus">Measurement is off. Start it when you want to check the finished mix.</p><div class="mastering-analysis-meters">${[['momentaryLufs', 'Momentary', 'LUFS · 400 ms'], ['shortTermLufs', 'Short term', 'LUFS · 3 seconds'], ['integratedLufs', 'Integrated', 'LUFS · gated'], ['truePeakDb', 'Intersample estimate', 'dB · 4× interpolated estimate'], ['correlation', 'Stereo correlation', '−1 to +1'], ['samplePeakHoldDb', 'Peak hold', 'dBFS · reset to clear']].map(([key, label, unit]) => `<div><span>${label}</span><output data-mastering-meter="${key}">—</output><small>${unit}</small></div>`).join('')}</div><div class="mastering-reference"><label for="masteringTarget">LOUDNESS REFERENCE<select id="masteringTarget"><option value="-14">−14 LUFS · balanced</option><option value="-18">−18 LUFS · dynamic</option><option value="-9">−9 LUFS · dense</option></select></label><output id="masteringTargetReadout">Measure a passage to compare its integrated level.</output></div><p class="mastering-analysis-note">References are listening guides, not automatic normalization. The intersample readout is a 4× interpolated peak estimate. The zero-lookahead limiter controls sample peaks; leave delivery headroom and check the rendered file. Measurement pauses when this bench is folded, hidden or off screen.</p></section><p class="mastering-route-note">MASTER INSERTS → MASTER FADER → INPUT → CLEANUP → TONE → GLUE → STEREO → COLOUR → OUTPUT → PEAK GUARD. Stereo master WAVs include this bench; individual track and return stems retain their own processing.</p></div></details>`;
    function valueFor(key) { return params()[key]; }
    function emit(patch, meta) {
      if (disposed) return;
      try { onChange(patch, meta); } catch (error) { onStatus(error.message); }
      render();
    }
    function changed(key, value, active) {
      if (!Number.isFinite(value)) return;
      const d = byKey.get(key), next = Math.round(clamp(value, d.min, d.max) / d.step) * d.step;
      if (Math.abs(next - valueFor(key)) < d.step * .001) return;
      const first = !active?.remembered; if (active) active.remembered = true;
      emit({ [key]: Number(next.toFixed(6)) }, { key, first, phase: active ? 'input' : 'single' });
    }
    function endGesture(active) { if (active?.remembered) onChange({}, { key: active.key, first: false, phase: 'end' }); }
    function gestureValid(active) { return active && active.generation === getGeneration(); }
    function disabled(d, p) { return !p.enabled || !!(d.stage && !p[d.stage]); }
    function updateAnalysis() {
      const next = requestedAnalysis && $('masteringBench').open && visible && externalVisible && !document.hidden && !disposed;
      if (next !== activeAnalysis) { activeAnalysis = next; onAnalysis(next); }
      $('masteringAnalysisStart').disabled = requestedAnalysis;
      $('masteringAnalysisPause').disabled = !requestedAnalysis;
      $('masteringAnalysisStatus').textContent = activeAnalysis ? 'Measuring the final stereo master. Play the complete passage for a useful integrated reading.' : requestedAnalysis ? 'Measurement paused while the bench is hidden. It will resume when the bench is visible.' : measured ? 'Measurement is paused. The last readings are retained for inspection.' : 'Measurement is off. Start it when you want to check the finished mix.';
    }
    function render() {
      if (disposed) return;
      const nextGeneration = getGeneration(), force = nextGeneration !== generation;
      if (force) {
        if (gesture) { gesture.element.classList.remove('is-adjusting'); if (gesture.element.hasPointerCapture?.(gesture.pointer)) gesture.element.releasePointerCapture(gesture.pointer); }
        gesture = keyboard = rangeGesture = null; generation = nextGeneration; requestedAnalysis = false; measured = false; lastAnalysis = {}; updateAnalysis();
      }
      const p = params(), recipe = completeRecipes.find(recipe => Object.entries(recipe.params).every(([key, value]) => p[key] === value));
      if (force || document.activeElement !== $('masteringPreset')) $('masteringPreset').value = recipe?.id || '';
      $('masteringRecipeNote').textContent = recipe?.description || 'Custom finish. Keep the changes deliberate, compare levels and listen through the whole passage.';
      $('masteringPower').setAttribute('aria-pressed', String(p.enabled)); $('masteringPower').textContent = p.enabled ? 'Tools on' : 'Enable tools';
      $('masteringBypass').setAttribute('aria-pressed', String(p.bypass)); $('masteringBypass').disabled = !p.enabled;
      const active = stages.filter(stage => p[stage.id]);
      $('masteringSummary').textContent = !p.enabled ? 'All tools off' : p.bypass ? 'Bypassed' : active.length ? active.length + ' stages on' : 'Input / output only';
      $('masteringSignalStatus').textContent = !p.enabled ? 'Tools off' : p.bypass ? 'Bypassed' : 'Tools active';
      element.classList.toggle('mastering-is-bypassed', p.bypass || !p.enabled);
      $('masteringFaceNote').textContent = !p.enabled ? 'Enable the tools or switch on a stage. Stored adjustments stay ready; the four master inserts remain available.' : p.bypass ? 'Tools are bypassed. Your settings are retained for comparison.' : 'Five performance controls above; open a stage below for its full adjustment range.';
      for (const stage of stages) {
        const button = element.querySelector('[data-mastering-stage="' + stage.id + '"]'), checkbox = element.querySelector('[data-mastering-stage-checkbox="' + stage.id + '"]');
        button.setAttribute('aria-pressed', String(p[stage.id])); checkbox.checked = p[stage.id];
      }
      for (const d of definitions) {
        const value = p[d.key], off = disabled(d, p), knob = element.querySelector('[data-mastering-knob="' + d.key + '"]'), range = element.querySelector('[data-mastering-param="' + d.key + '"]');
        if (knob) { knob.disabled = off; knob.setAttribute('aria-valuenow', value); knob.setAttribute('aria-valuetext', display(d, value)); knob.querySelector('.mastering-dial-pointer').style.transform = 'rotate(' + (-135 + Math.max(0, Math.min(1, progress(d, value))) * 270) + 'deg)'; }
        if (range) { range.disabled = off; if (force || document.activeElement !== range) range.value = d.log ? progress(d, value) : value; range.setAttribute('aria-valuetext', display(d, value)); }
        for (const number of element.querySelectorAll('[data-mastering-number="' + d.key + '"]')) { number.disabled = off; if (force || document.activeElement !== number) number.value = Number((value * numberScale(d)).toFixed(4)); }
        for (const output of element.querySelectorAll('[data-mastering-value="' + d.key + '"]')) output.textContent = display(d, value);
        for (const control of element.querySelectorAll('[data-mastering-control="' + d.key + '"]')) control.classList.toggle('mastering-control-off', off);
      }
      updateAnalysis();
    }
    function paint(readings = getMeters()) {
      if (disposed || !$('masteringBench').open || !visible || !externalVisible || document.hidden) return;
      const incoming = readings?.mastering || readings || {}, p = params();
      if (incoming.analysisEnabled) { lastAnalysis = { ...incoming }; measured = true; }
      const meters = { ...lastAnalysis, ...incoming };
      if (!incoming.analysisEnabled && measured) for (const key of ['lufsMomentary', 'lufsShortTerm', 'lufsIntegrated', 'truePeakDb', 'samplePeakHoldDb', 'correlation']) meters[key] = lastAnalysis[key];
      const aliases = { compressionDb: ['compressionDb', 'compressorReductionDb', 'gainReductionDb'], limiterReductionDb: ['limiterReductionDb', 'limitingDb'], samplePeakDb: ['samplePeakDb', 'outputPeakDb'], truePeakDb: ['truePeakDb', 'estimatedTruePeakDb'], momentaryLufs: ['lufsMomentary', 'momentaryLufs'], shortTermLufs: ['lufsShortTerm', 'shortTermLufs'], integratedLufs: ['lufsIntegrated', 'integratedLufs'], correlation: ['correlation'], samplePeakHoldDb: ['samplePeakHoldDb'] };
      for (const [key, keys] of Object.entries(aliases)) {
        const value = keys.map(name => meters[name]).find(Number.isFinite), analysisOnly = !['compressionDb', 'limiterReductionDb', 'samplePeakDb'].includes(key), available = Number.isFinite(value) && (!analysisOnly || measured || incoming.analysisEnabled);
        let text = '—';
        if (available) text = key === 'correlation' ? (value > 0 ? '+' : '') + value.toFixed(2) : value <= -119 ? '−∞' : value.toFixed(1);
        for (const output of element.querySelectorAll('[data-mastering-meter="' + key + '"]')) if (output.textContent !== text) output.textContent = text;
        const bar = element.querySelector('[data-mastering-meter-bar="' + key + '"]');
        if (bar) bar.style.transform = 'scaleX(' + (available ? key === 'samplePeakDb' ? Math.max(0, Math.min(1, (value + 60) / 60)) : Math.max(0, Math.min(1, value / 12)) : 0) + ')';
      }
      const integrated = meters.lufsIntegrated ?? meters.integratedLufs, target = Number($('masteringTarget').value);
      $('masteringTargetReadout').textContent = Number.isFinite(integrated) && integrated > -119 && measured ? (target - integrated >= 0 ? '+' : '') + (target - integrated).toFixed(1) + ' dB from the selected reference · guide only' : 'Measure a passage to compare its integrated level.';
      $('masteringSignalStatus').textContent = !p.enabled ? activeAnalysis ? 'Metering dry master' : 'Tools off' : p.bypass ? 'Bypassed' : Number.isFinite(meters.samplePeakDb) && meters.samplePeakDb > -90 ? 'Signal present' : 'Tools active';
    }
    function toggle(stage, enabled) { emit({ [stage]: enabled, ...(enabled ? { enabled: true } : {}) }, { key: stage, first: true, phase: 'single' }); }
    function pointerDown(event) {
      const knob = event.target.closest('[data-mastering-knob]'); if (!knob || knob.disabled || event.button !== 0) return;
      const key = knob.dataset.masteringKnob; event.preventDefault();
      gesture = { key, pointer: event.pointerId, y: event.clientY, value: valueFor(key), remembered: false, generation: getGeneration(), element: knob };
      knob.setPointerCapture?.(event.pointerId); knob.classList.add('is-adjusting'); knob.focus({ preventScroll: true });
    }
    function pointerMove(event) {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      if (!gestureValid(gesture)) return pointerEnd(event);
      const d = byKey.get(gesture.key), delta = (gesture.y - event.clientY) / (event.shiftKey ? 1600 : 220), value = d.log ? gesture.value * Math.pow(d.max / d.min, delta) : gesture.value + delta * (d.max - d.min);
      changed(gesture.key, value, gesture);
    }
    function pointerEnd(event) {
      if (!gesture || event.pointerId !== gesture.pointer) return;
      const active = gesture; gesture = null; active.element.classList.remove('is-adjusting'); if (active.element.hasPointerCapture?.(active.pointer)) active.element.releasePointerCapture(active.pointer); if (gestureValid(active)) endGesture(active);
    }
    function keyDown(event) {
      const knob = event.target.closest('[data-mastering-knob]'); if (!knob || knob.disabled || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); const key = knob.dataset.masteringKnob, d = byKey.get(key);
      if (!gestureValid(keyboard) || keyboard.key !== key) { endGesture(keyboard); keyboard = { key, remembered: false, generation: getGeneration() }; }
      let value = valueFor(key), step = d.step * (event.shiftKey ? 10 : 1);
      if (event.key.startsWith('Page')) step *= 10;
      value = event.key === 'Home' ? d.min : event.key === 'End' ? d.max : value + (['ArrowUp', 'ArrowRight', 'PageUp'].includes(event.key) ? step : -step);
      changed(key, value, keyboard);
    }
    const handlers = {
      pointerdown: event => { pointerDown(event); const range = event.target.closest('[data-mastering-param]'); if (range && !range.disabled) rangeGesture = { key: range.dataset.masteringParam, remembered: false, generation: getGeneration() }; event.stopPropagation(); },
      pointermove: pointerMove,
      pointerup: event => { pointerEnd(event); if (rangeGesture) { endGesture(rangeGesture); rangeGesture = null; } },
      pointercancel: event => { pointerEnd(event); if (rangeGesture) { endGesture(rangeGesture); rangeGesture = null; } },
      keydown: event => { keyDown(event); const range = event.target.closest('[data-mastering-param]'); if (range && !range.disabled && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(event.key) && !rangeGesture) rangeGesture = { key: range.dataset.masteringParam, remembered: false, generation: getGeneration() }; event.stopPropagation(); },
      keyup: event => { if (keyboard) { endGesture(keyboard); keyboard = null; } if (rangeGesture) { endGesture(rangeGesture); rangeGesture = null; } event.stopPropagation(); },
      focusout: () => { if (keyboard) { endGesture(keyboard); keyboard = null; } if (rangeGesture) { endGesture(rangeGesture); rangeGesture = null; } render(); },
      input: event => { const range = event.target.closest('[data-mastering-param]'); if (range) { if (rangeGesture && !gestureValid(rangeGesture)) { rangeGesture = null; render(); return; } const d = byKey.get(range.dataset.masteringParam), value = d.log ? d.min * Math.pow(d.max / d.min, Number(range.value)) : Number(range.value); changed(d.key, value, rangeGesture); } event.stopPropagation(); },
      change: event => { const number = event.target.closest('[data-mastering-number]'), checkbox = event.target.closest('[data-mastering-stage-checkbox]'); if (number && number.value !== '') { const d = byKey.get(number.dataset.masteringNumber); changed(d.key, Number(number.value) / numberScale(d)); number.value = Number((valueFor(d.key) * numberScale(d)).toFixed(4)); } if (checkbox) toggle(checkbox.dataset.masteringStageCheckbox, checkbox.checked); if (event.target.id === 'masteringPreset') { const recipe = recipes.find(recipe => recipe.id === event.target.value); if (recipe) emit(normalized(recipe.params), { key: null, first: true, phase: 'single' }); } if (event.target.id === 'masteringTarget') paint(); event.stopPropagation(); },
      click: event => { const stage = event.target.closest('[data-mastering-stage]'); if (stage) toggle(stage.dataset.masteringStage, !params()[stage.dataset.masteringStage]); if (event.target.id === 'masteringPower') emit({ enabled: !params().enabled }, { key: 'enabled', first: true, phase: 'single' }); if (event.target.id === 'masteringBypass') emit({ bypass: !params().bypass }, { key: 'bypass', first: true, phase: 'single' }); if (event.target.id === 'masteringReset') emit(normalized({}), { key: null, first: true, phase: 'single' }); if (event.target.id === 'masteringAnalysisStart') { requestedAnalysis = true; updateAnalysis(); paint(); } if (event.target.id === 'masteringAnalysisPause') { requestedAnalysis = false; updateAnalysis(); paint(); } if (event.target.id === 'masteringAnalysisReset') { measured = false; lastAnalysis = {}; onResetMeters(); paint({}); updateAnalysis(); } event.stopPropagation(); },
      toggle: event => { if (event.target.id === 'masteringBench') { if (!event.target.open) { endGesture(keyboard); keyboard = null; } updateAnalysis(); if (event.target.open) paint(); } }
    };
    for (const [event, handler] of Object.entries(handlers)) element.addEventListener(event, handler, event === 'toggle');
    const visibilityChange = () => updateAnalysis(); document.addEventListener('visibilitychange', visibilityChange);
    if (typeof IntersectionObserver === 'function') { observer = new IntersectionObserver(entries => { const next = entries.some(entry => entry.isIntersecting && entry.intersectionRatio > 0); if (next !== visible) { visible = next; updateAnalysis(); } }); observer.observe(element); }
    render();
    return { render, paint, setVisible(value) { const next = !!value; if (next !== externalVisible) { externalVisible = next; updateAnalysis(); } }, dispose() { if (disposed) return; disposed = true; requestedAnalysis = false; if (activeAnalysis) { activeAnalysis = false; onAnalysis(false); } observer?.disconnect(); document.removeEventListener('visibilitychange', visibilityChange); for (const [event, handler] of Object.entries(handlers)) element.removeEventListener(event, handler, event === 'toggle'); element.innerHTML = ''; }, get element() { return element; } };
  }
  scope.LoomMasteringUI = Object.freeze({ create, definitions, recipes, stages });
})(typeof window === 'undefined' ? globalThis : window);
