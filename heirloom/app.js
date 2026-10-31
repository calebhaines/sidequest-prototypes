/* HEIRLOOM · a familiar front panel, with the housekeeping kept out of sight. */
(function (scope) {
  'use strict';
  const S = scope.HeirloomSchema, $ = id => document.getElementById(id), copy = S.copy;
  const controls = S.CONTROLS, listeners = new Set(), history = [], future = [], inputs = new Map(), pointerKeys = new Map(), midiQueues = new Map(), midiInputs = new Map();
  const text = (element, value) => { value = String(value); if (element && element.textContent !== value) element.textContent = value; };
  const attr = (element, name, value) => { value = String(value); if (element && element.getAttribute(name) !== value) element.setAttribute(name, value); };
  const prop = (element, name, value) => { value = name === 'value' ? String(value) : value; if (element && element[name] !== value) element[name] = value; };
  const style = (element, name, value) => { if (element && element.style[name] !== value) element.style[name] = value; };
  const toggleClass = (element, name, value) => { if (element && element.classList.contains(name) !== Boolean(value)) element.classList.toggle(name, Boolean(value)); };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const uid = prefix => prefix + '-' + sessionId + '-' + (++serial).toString(36);
  const storageKey = 'heirloom-project-v1';
  const hints = {
    sync:'Restart oscillator A from oscillator B. B is the sync master.',
    bLow:'Low-frequency oscillator B; approximately 0.4–30 Hz in its classic range.',
    bKeyboard:'Follow played pitch. Switch off for freely tuned oscillator B.',
    polyB:'Oscillator B is tapped before its mixer level, so it can modulate silently.',
    polyEnv:'The filter envelope also drives these Poly-mod destinations.',
    initialAmount:'Later-generation convenience: a continuous modulation baseline. The physical wheel adds depth.',
    polyGlide:'Optional later-generation polyphonic glide. The original glide operates in Unison.',
    velocityAmount:'Optional velocity response. Zero keeps the original keyboard’s fixed loudness behavior.',
    lfoRange:'Classic range follows the original instrument. Extended range follows later revisions.',
    vintage:'Voice-to-voice variation and drift; character without physical maintenance.'
  };
  let state, serial = 0, importGeneration = 0, inputGeneration = 0, saveTimer = 0, meterTimer = 0, sendTimer = 0;
  let drag = null, keyGesture = null, noteDrag = null, selectedNote = null, noteMetrics = null, noteNodes = new Map(), exportPatternLength = null;
  let activeCompare = 'A', comparisons, meterSnapshot = null, visible = true, recoveryAvailable = true, exportController = null, midiAccess = null, sustain = false;
  const textGestures = new WeakMap();
  try { const saved = localStorage.getItem(storageKey); state = saved ? S.parseProject(saved) : S.defaultState(); } catch (_) { state = S.defaultState(); recoveryAvailable = false; }
  state = S.normalize(state);
  const engine = new scope.HeirloomAudio(state);
  const sound = patch => Object.fromEntries(Object.entries(copy(patch)).filter(([key]) => key !== 'modWheel'));
  comparisons = { A:{name:state.name,synth:sound(state.synth)}, B:{name:state.name,synth:sound(state.synth)} };
  const descriptor = key => S.control ? S.control(key, state.synth) : S.controls[key];
  const position = (key, value) => S.position ? S.position(key, value, state.synth) : (value-descriptor(key).min)/(descriptor(key).max-descriptor(key).min);
  const valueAt = (key, value) => S.valueAt ? S.valueAt(key, value, state.synth) : descriptor(key).min + value*(descriptor(key).max-descriptor(key).min);
  const scaleFor = d => d.type === 'range' && !d.unit && d.min >= 0 && d.max <= 1 ? 100 : 1;
  const tidy = value => Number(Number(value).toFixed(5));
  function status(message) { text($('status'), message); }
  function snapshot() { return {state:copy(state),comparisons:copy(comparisons),side:activeCompare}; }
  function remember(before = snapshot()) { history.push(before); if (history.length > 40) history.shift(); future.length = 0; renderHistory(); }
  function renderHistory() { prop($('undoButton'),'disabled',!history.length); prop($('redoButton'),'disabled',!future.length); }
  function saveLocal() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(storageKey,S.serialize(state)); recoveryAvailable = true; prop($('storageNotice'),'hidden',true); } catch (_) { recoveryAvailable = false; text($('storageNotice'),'Browser recovery is unavailable. Save a recipe to keep this sound and phrase.'); prop($('storageNotice'),'hidden',false); } },1000); }
  function notify() { saveLocal(); for (const fn of listeners) { try { fn({pattern:state.pattern,tempo:state.tempo}); } catch (_) {} } }
  function updateCompare() { comparisons[activeCompare] = {name:state.name,synth:sound(state.synth)}; }
  function sendSound() { state.synth = engine.setSynth ? engine.setSynth(state.synth) : (engine.setState(state),state.synth); updateCompare(); notify(); }
  function sendPattern() { state.pattern = {...state.pattern,tempo:state.tempo}; engine.setState(state); notify(); }
  function queuePattern() { if (sendTimer) return; sendTimer = setTimeout(() => { sendTimer = 0; sendPattern(); },20); }
  function finishPending() { if (sendTimer) { clearTimeout(sendTimer); sendTimer = 0; sendPattern(); } finishKnob(); keyGesture = null; noteDrag = null; }
  function restore(entry) { releaseInputs(); engine.panic(); state = S.normalize(entry.state); comparisons = copy(entry.comparisons); activeCompare = entry.side; selectedNote = null; engine.setState(state); renderAll(); notify(); }
  function undo() { if (!history.length) return; finishPending(); const old = history.pop(); future.push(snapshot()); restore(old); renderHistory(); status('Previous edit restored.'); }
  function redo() { if (!future.length) return; finishPending(); const next = future.pop(); history.push(snapshot()); restore(next); renderHistory(); status('Edit reapplied.'); }
  function loadState(value) {
    const next = typeof value === 'string' || value?.format ? S.parseProject(value) : S.normalize(value);
    finishPending(); remember(); ++importGeneration; releaseInputs(); engine.panic(); state = next; selectedNote = null; exportPatternLength = null; sustain = false;
    comparisons = {A:{name:state.name,synth:sound(state.synth)},B:{name:state.name,synth:sound(state.synth)}}; activeCompare = 'A';
    engine.setState(state); engine.setModWheel(state.synth.modWheel || 0); renderAll(); notify(); status('Loaded '+state.name+'.'); return copy(state);
  }
  function setParam(key, value, gesture) {
    const d = descriptor(key); if (!d) return false;
    if (d.type === 'range') { value = Number(value); if (!Number.isFinite(value)) { paintControl(key); return false; } value = tidy(clamp(Math.round(value/d.step)*d.step,d.min,d.max)); }
    else if (d.type === 'toggle') value = Boolean(value);
    else { const item = d.options.find(option => String(option.value) === String(value)); if (!item) return false; value = item.value; }
    if (state.synth[key] === value) { paintControl(key); return false; }
    if (!gesture?.remembered) { remember(); if (gesture) gesture.remembered = true; }
    state.synth[key] = value;
    if (key === 'lfoRange') state.synth = S.normalizeSynth(state.synth);
    sendSound();
    if (key === 'lfoRange') paintControls(); else paintControl(key);
    if(key==='bKeyboard'||key==='bLow')paintControl('bTune');
    drawEnvelopes(); prop($('presetSelect'),'value',''); text($('presetDescription'),'Your adjustments. The family recipe is in good hands.');
    return true;
  }
  function knobMarkup(d) {
    const value = state.synth[d.key], scale = scaleFor(d), offset = d.displayOffset || 0, unit = scale === 100 ? '%' : d.unit || '', label = d.label;
    return `<div class="knob-control" data-control="${d.key}"><label class="knob-label" id="label-${d.key}" for="param-${d.key}">${esc(label)}</label><button type="button" class="knob" role="slider" data-knob="${d.key}" aria-label="${esc(label)}" aria-orientation="vertical" aria-valuemin="${d.min}" aria-valuemax="${d.max}" aria-valuenow="${value}" aria-valuetext="${esc(S.format(d.key,value,state.synth))}" title="${esc((hints[d.key]||label)+'. Drag up/down; Shift for fine. Double-click to reset.')}"><svg viewBox="0 0 64 64" aria-hidden="true"><path class="knob-ring" d="M14.32 49.68A25 25 0 1 1 49.68 49.68"/><path class="knob-arc" data-knob-arc d="M14.32 49.68"/><circle class="knob-shadow" cx="32" cy="34" r="19"/><circle class="knob-cap" cx="32" cy="32" r="18"/><circle class="knob-inner" cx="32" cy="32" r="14.5"/><path class="knob-needle" data-knob-needle d="M32 30V18"/></svg></button><div class="knob-number-row"><input id="param-${d.key}" class="knob-number" type="number" data-param="${d.key}" data-scale="${scale}" data-offset="${offset}" min="${d.min*scale+offset}" max="${d.max*scale+offset}" step="${d.step*scale}" value="${tidy(value*scale+offset)}" aria-label="${esc(label)} exact value${unit?' in '+esc(unit):''}"><span data-param-unit>${esc(unit)}</span></div></div>`;
  }
  function waveIcon(key) {
    const shape = /triangle/i.test(key) ? 'M1 11 9 2 25 14 33 5' : /saw/i.test(key) ? 'm1 14 10-12v12L22 2v12L33 2v12' : /pulse|square/i.test(key) ? 'M1 13V3H16V13H32V3' : '';
    return shape ? `<svg class="wave-icon" viewBox="0 0 34 16" aria-hidden="true"><path d="${shape}"/></svg>` : '';
  }
  function toggleMarkup(d) { return `<button type="button" class="toggle" data-toggle="${d.key}" aria-label="${esc(d.label)}" aria-pressed="${Boolean(state.synth[d.key])}" title="${esc(hints[d.key]||d.label)}"><span class="toggle-track" aria-hidden="true"></span><span class="toggle-label">${waveIcon(d.key)}<span>${esc(d.label)}</span></span></button>`; }
  function selectMarkup(d) { return `<label class="select-control"><span>${esc(d.label)}</span><select id="param-${d.key}" data-param="${d.key}" aria-label="${esc(d.label)}" title="${esc(hints[d.key]||d.label)}">${d.options.map(option=>`<option value="${esc(option.value)}" ${option.value===state.synth[d.key]?'selected':''}>${esc(option.label)}</option>`).join('')}</select></label>`; }
  function controlContainer(d) {
    if (d.key === 'volume') return 'outputControls';
    const section = d.section, numeric = d.type === 'range';
    if (section === 'oscA') return numeric?'oscAControls':'oscASwitches';
    if (section === 'oscB') return numeric?'oscBControls':'oscBSwitches';
    if (section === 'mixer') return 'mixerControls';
    if (section === 'filter') return numeric?'filterControls':'filterSwitches';
    if (section === 'filterEnv') return 'filterEnvControls';
    if (section === 'ampEnv') return 'ampEnvControls';
    if (section === 'polyMod') return numeric?'polySourceControls':'polyDestControls';
    if (section === 'lfo') return numeric?'lfoControls':'lfoSwitches';
    if (section === 'wheel') return numeric?'wheelControls':'wheelDestControls';
    if (section === 'performance') return numeric?'performanceControls':'performanceSwitches';
    return 'calibrationControls';
  }
  function buildControls() {
    const groups = new Map();
    for (const original of controls) {
      if (original.key === 'modWheel') { attr($('modWheel'),'data-param','modWheel'); attr($('modWheel'),'data-scale','1'); continue; }
      const d = descriptor(original.key), id = controlContainer(d); if (!groups.has(id)) groups.set(id,[]);
      groups.get(id).push(d.type === 'range' ? knobMarkup(d) : d.type === 'toggle' ? toggleMarkup(d) : selectMarkup(d));
    }
    for (const [id,markup] of groups) { $(id).innerHTML = markup.join(''); if ($(id).classList.contains('knob-grid') && markup.length === 1) $(id).classList.add('one'); }
    paintControls();
  }
  function paintControl(key, force = false) {
    const d = descriptor(key), value = state.synth[key]; if (!d) return;
    const input = document.querySelector('[data-param="'+key+'"]');
    if (d.type === 'range') {
      const scale = Number(input?.dataset.scale)||1, offset = d.displayOffset || 0, unit=scale===100?'%':d.unit||'';
      if (input) { attr(input,'data-offset',offset);attr(input,'min',d.min*scale+offset);attr(input,'max',d.max*scale+offset);attr(input,'step',d.step*scale);attr(input,'aria-label',d.label+' exact value'+(unit?' in '+unit:''));text(input.parentElement.querySelector('[data-param-unit]'),unit);if(force || document.activeElement !== input) prop(input,'value',tidy(value*scale+offset)); }
      const button = document.querySelector('[data-knob="'+key+'"]'); if (!button) return;
      const normalized = clamp(position(key,value),0,1), angle = -135+270*normalized, radians=angle*Math.PI/180;
      attr(button,'aria-valuemin',d.min);attr(button,'aria-valuemax',d.max);attr(button,'aria-valuenow',value);attr(button,'aria-valuetext',S.format(key,value,state.synth));
      attr(button.querySelector('[data-knob-needle]'),'transform','rotate('+angle+' 32 32)');
      attr(button.querySelector('[data-knob-arc]'),'d',`M14.322 49.678A25 25 0 ${normalized>.666667?1:0} 1 ${(32+25*Math.sin(radians)).toFixed(3)} ${(32-25*Math.cos(radians)).toFixed(3)}`);
    } else if (d.type === 'toggle') attr(document.querySelector('[data-toggle="'+key+'"]'),'aria-pressed',Boolean(value));
    else if (input && (force || document.activeElement !== input)) prop(input,'value',value);
  }
  function paintControls() { for (const d of controls) paintControl(d.key); drawEnvelopes(); }
  function drawEnvelopes() {
    for (const prefix of ['filter','amp']) { const attack=state.synth[prefix+'Attack'],decay=state.synth[prefix+'Decay'],sustainValue=state.synth[prefix+'Sustain'],releaseValue=state.synth[prefix+'Release'];
      if (![attack,decay,sustainValue,releaseValue].every(Number.isFinite)) continue;
      const a=10+position(prefix+'Attack',attack)*31,d=a+12+position(prefix+'Decay',decay)*25,r=146-position(prefix+'Release',releaseValue)*22,y=28-sustainValue*25;
      attr($(prefix==='filter'?'filterEnvelope':'ampEnvelope').querySelector('path'),'d',`M2 28L${a.toFixed(2)} 3L${d.toFixed(2)} ${y.toFixed(2)}H${Math.max(d+8,r).toFixed(2)}L158 28`);
    }
  }
  function renderPresets() {
    const recipes=scope.HeirloomPresets||[],categories=[...new Set(recipes.map(p=>p.category||'House recipes'))];
    $('presetSelect').innerHTML='<option value="">Your recipe</option>'+categories.map(category=>`<optgroup label="${esc(category)}">${recipes.filter(p=>(p.category||'House recipes')===category).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</optgroup>`).join('');
  }
  function renderCompare() { for (const button of document.querySelectorAll('[data-compare]')) attr(button,'aria-pressed',button.dataset.compare===activeCompare); text($('copyCompareButton'),activeCompare+' → '+(activeCompare==='A'?'B':'A')); }
  function chooseCompare(side) {
    if (!['A','B'].includes(side) || side===activeCompare) return; finishPending(); remember(); updateCompare(); const next=comparisons[side],wheel=state.synth.modWheel;
    activeCompare=side;state.name=next.name;state.synth=S.normalizeSynth({...copy(next.synth),modWheel:wheel});sendSound();prop($('projectName'),'value',state.name);paintControls();renderCompare();prop($('presetSelect'),'value','');status('Compare '+side+'. Your phrase and wheel position are retained.');
  }
  function applyPreset(preset) {
    finishPending();remember();const wheel=state.synth.modWheel;state.name=preset.name;state.synth=S.normalizeSynth({...copy(preset.synth),modWheel:wheel});sendSound();paintControls();prop($('projectName'),'value',state.name);prop($('presetSelect'),'value',preset.id);text($('presetDescription'),preset.description||preset.category||'Factory recipe');status(preset.name+' loaded. Your phrase and wheel position are retained.');
  }
  function beginKnob(event) {
    const button=event.target.closest('[data-knob]');if(!button||event.button!==0)return;event.preventDefault();finishKnob();button.focus({preventScroll:true});
    drag={button,key:button.dataset.knob,pointer:event.pointerId,lastY:event.clientY,position:position(button.dataset.knob,state.synth[button.dataset.knob]),remembered:false};button.classList.add('is-adjusting');try{button.setPointerCapture(event.pointerId);}catch(_){}
  }
  function finishKnob(event) { if (!drag || event && event.pointerId!==drag.pointer) return; const old=drag;drag=null;old.button.classList.remove('is-adjusting');try{if(old.button.hasPointerCapture(old.pointer))old.button.releasePointerCapture(old.pointer);}catch(_){}paintControl(old.key); }
  document.addEventListener('pointerdown',beginKnob);
  document.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointer)return;event.preventDefault();const delta=drag.lastY-event.clientY;drag.lastY=event.clientY;drag.position=clamp(drag.position+delta*(event.shiftKey?.0012:.006),0,1);setParam(drag.key,valueAt(drag.key,drag.position),drag);});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,finishKnob);
  document.addEventListener('dblclick',event=>{const button=event.target.closest('[data-knob]');if(!button)return;event.preventDefault();setParam(button.dataset.knob,descriptor(button.dataset.knob).default);});
  document.addEventListener('keydown',event=>{const button=event.target.closest('[data-knob]');if(!button||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','PageUp','PageDown','Home','End','Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();const key=button.dataset.knob,d=descriptor(key),coarse=event.shiftKey||event.key.startsWith('Page'),direction=['ArrowUp','ArrowRight','PageUp'].includes(event.key)?1:-1;
    if(!keyGesture||keyGesture.button!==button)keyGesture={button,remembered:false};
    const value=event.key==='Home'?d.min:event.key==='End'?d.max:['Enter',' '].includes(event.key)?d.default:state.synth[key]+direction*d.step*(coarse?10:1);setParam(key,value,keyGesture);
  });
  document.addEventListener('keyup',event=>{if(event.target.closest('[data-knob]'))keyGesture=null;});
  document.addEventListener('focusout',event=>{if(event.target.closest('[data-knob]'))keyGesture=null;const key=event.target.dataset.param;if(key)queueMicrotask(()=>paintControl(key));textGestures.delete(event.target);});
  document.addEventListener('change',event=>{const input=event.target,key=input.dataset.param;if(!key||key==='modWheel')return;setParam(key,input.tagName==='SELECT'?input.value:(input.valueAsNumber-(Number(input.dataset.offset)||0))/(Number(input.dataset.scale)||1));paintControl(key,true);});
  document.addEventListener('click',event=>{const button=event.target.closest('[data-toggle]');if(button)setParam(button.dataset.toggle,!state.synth[button.dataset.toggle]);const compare=event.target.closest('[data-compare]');if(compare)chooseCompare(compare.dataset.compare);});

  function keyboardBase() { return clamp((state.view.keyboardOctave+1)*12,12,103); }
  function renderKeyboard() {
    const base=keyboardBase(),white=[],black=[],keyNames=['A','W','S','E','D','F','T','G','Y','H','U','J','K','O','L','P',';','\'','[',']','\\'];let whites=0;
    for(let offset=0;offset<=24;offset++){const pitch=base+offset,isBlack=[1,3,6,8,10].includes(pitch%12),label=S.noteName(pitch);if(isBlack){black.push({pitch,index:whites,label,code:keyNames[offset]||''});}else{white.push({pitch,label,code:keyNames[offset]||'',index:whites});whites++;}}
    $('keyboard').innerHTML=white.map(k=>`<button type="button" class="key" data-note="${k.pitch}" aria-label="Play ${k.label}" title="${k.label}${k.code?' / '+k.code:''}"><span>${k.pitch%12===0?esc(k.label):esc(k.code)}</span></button>`).join('')+black.map(k=>`<button type="button" class="key black" data-note="${k.pitch}" style="left:${k.index/whites*100-1.9}%" aria-label="Play ${k.label}" title="${k.label}${k.code?' / '+k.code:''}"><span>${esc(k.code)}</span></button>`).join('');
    text($('keyboardOctave'),S.noteName(base)+'—'+S.noteName(base+24));prop($('keyboardDown'),'disabled',state.view.keyboardOctave<=0);prop($('keyboardUp'),'disabled',state.view.keyboardOctave>=7);paintKeys();
  }
  function paintKeys() { if(!visible||document.hidden)return;const held=new Set([...inputs.values()].map(record=>record.pitch)),sounding=new Set((meterSnapshot?.voiceStates||[]).filter(v=>v.active).map(v=>v.pitch));for(const key of $('keyboard').querySelectorAll('[data-note]')){const pitch=Number(key.dataset.note);toggleClass(key,'held',held.has(pitch));toggleClass(key,'sounding',sounding.has(pitch));attr(key,'aria-pressed',held.has(pitch));} }
  async function beginInput(key,pitch,velocity,source='keyboard',channel=0) {
    if(inputs.has(key))return;
    if(inputs.size>=512){const records=[...inputs.values()],old=records.find(record=>record.source===source&&record.channel===channel)||records.find(record=>record.source===source)||records[0];if(old)endInput(old.key);}
    const record={key,pitch,source,channel,id:uid('key'),queueKey:source.startsWith('midi:')?source+':'+channel+':'+pitch:null,started:false};inputs.set(key,record);paintKeys();
    try{await engine.init();if(inputs.get(key)!==record)return;engine.noteOn({id:record.id,pitch,velocity,source,channel});record.started=true;startMeters();}catch(error){if(inputs.get(key)===record)endInput(key);paintKeys();status(error.message||'Audio could not start.');}
  }
  function endInput(key) {const record=inputs.get(key);if(!record)return;inputs.delete(key);if(record.queueKey){const queue=midiQueues.get(record.queueKey),index=queue?.indexOf(key)??-1;if(index>=0)queue.splice(index,1);if(!queue?.length)midiQueues.delete(record.queueKey);}if(record.started)engine.noteOff(record.id,{source:record.source,channel:record.channel});paintKeys();startMeters();}
  function releaseInputs(includeMIDI=true) {++inputGeneration;for(const[key,record]of [...inputs])if(includeMIDI||!record.source.startsWith('midi:'))endInput(key);pointerKeys.clear();if(includeMIDI)midiQueues.clear();engine.setSustain(false);sustain=false;attr($('sustainButton'),'aria-pressed',false);setBend(0);}
  function keyVelocity() {return clamp(Number($('keyVelocity').value)||.85,.05,1);}
  $('keyboard').addEventListener('pointerdown',event=>{const key=event.target.closest('[data-note]');if(!key||event.button!==0)return;event.preventDefault();const id='pointer:'+event.pointerId;pointerKeys.set(event.pointerId,id);try{$('keyboard').setPointerCapture(event.pointerId);}catch(_){}beginInput(id,Number(key.dataset.note),keyVelocity());});
  $('keyboard').addEventListener('pointermove',event=>{const id=pointerKeys.get(event.pointerId);if(!id)return;const key=document.elementFromPoint(event.clientX,event.clientY)?.closest('#keyboard [data-note]');if(!key||Number(key.dataset.note)===inputs.get(id)?.pitch)return;endInput(id);beginInput(id,Number(key.dataset.note),keyVelocity());});
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('keyboard').addEventListener(name,event=>{const id=pointerKeys.get(event.pointerId);if(id){endInput(id);pointerKeys.delete(event.pointerId);}});
  function changeOctave(delta) {const next=clamp(state.view.keyboardOctave+delta,0,7);if(next===state.view.keyboardOctave)return;releaseInputs(false);state.view.keyboardOctave=next;renderKeyboard();if($('patternDetails').open)drawPattern();notify();}
  $('keyboardDown').addEventListener('click',()=>changeOctave(-1));$('keyboardUp').addEventListener('click',()=>changeOctave(1));$('keyVelocity').addEventListener('input',()=>text($('keyVelocityValue'),Math.round(keyVelocity()*100)+'%'));
  function setBend(value) {value=clamp(Number(value)||0,-1,1);prop($('pitchBend'),'value',value);engine.setPitchBend(value);startMeters();}
  function setWheel(value) {value=clamp(Number(value)||0,0,1);state.synth.modWheel=value;if(engine.setSynth)engine.setSynth({modWheel:value});else engine.setState(state);engine.setModWheel(value);if(document.activeElement!==$('modWheel'))prop($('modWheel'),'value',value);notify();startMeters();}
  $('pitchBend').addEventListener('input',event=>setBend(event.target.value));for(const name of ['pointerup','pointercancel','blur'])$('pitchBend').addEventListener(name,()=>setBend(0));
  $('modWheel').addEventListener('input',event=>setWheel(event.target.value));$('sustainButton').addEventListener('click',()=>{sustain=!sustain;engine.setSustain(sustain);attr($('sustainButton'),'aria-pressed',sustain);startMeters();});
  function connectMIDIInput(input) {if(midiInputs.has(input.id))return;midiInputs.set(input.id,input);input.onmidimessage=event=>midiMessage(input,event.data);}
  function releaseMIDINotes(input,channel,immediate=false) {const source='midi:'+input.id;for(const[key,record]of [...inputs])if(record.source===source&&record.channel===channel)endInput(key);for(const key of [...midiQueues.keys()])if(key.startsWith(source+':'+channel+':'))midiQueues.delete(key);engine.setSustain(false,{source,channel});engine.cancelNotes({source,channel,immediate});startMeters();}
  function disconnectMIDIInput(input) {const source='midi:'+input.id;for(let channel=0;channel<16;channel++){releaseMIDINotes(input,channel,true);engine.setPitchBend(0,{source,channel});}if(midiInputs.has(input.id))midiInputs.get(input.id).onmidimessage=null;midiInputs.delete(input.id);paintMIDIStatus();}
  function paintMIDIStatus() {const count=midiInputs.size;text($('midiStatus'),count?'MIDI / '+[...midiInputs.values()].map(input=>input.name||'Keyboard').join(' · '):'COMPUTER KEYS / TOUCH READY');text($('midiButton'),midiAccess?'MIDI connected':'Connect MIDI');}
  function midiMessage(input,data) {if(!data?.length)return;const command=data[0]&0xf0,channel=data[0]&15,pitch=data[1],value=data[2]||0,source='midi:'+input.id,queueKey=source+':'+channel+':'+pitch;
    if(command===0x90&&value>0){let queue=midiQueues.get(queueKey)||[];while(queue.length>=16)endInput(queue.shift());if(!midiQueues.has(queueKey))midiQueues.set(queueKey,queue);const key=uid(queueKey);queue.push(key);beginInput(key,pitch,value/127,source,channel);}
    else if(command===0x80||command===0x90){const queue=midiQueues.get(queueKey);if(queue?.length)endInput(queue.shift());if(!queue?.length)midiQueues.delete(queueKey);}
    else if(command===0xb0&&pitch===64){engine.setSustain(value>=64,{source,channel});startMeters();}
    else if(command===0xb0&&pitch===1)setWheel(value/127);
    else if(command===0xe0){const bend=((data[1]||0)+((data[2]||0)<<7)-8192)/8192;prop($('pitchBend'),'value',clamp(bend,-1,1));engine.setPitchBend(clamp(bend,-1,1),{source,channel});startMeters();}
    else if(command===0xb0&&(pitch===120||pitch===123))releaseMIDINotes(input,channel,pitch===120);
  }
  $('midiButton').addEventListener('click',async()=>{if(!navigator.requestMIDIAccess){status('MIDI is unavailable in this browser. The on-screen and computer keyboards still work.');return;}try{midiAccess=await navigator.requestMIDIAccess({sysex:false});for(const input of midiAccess.inputs.values())if(input.state!=='disconnected')connectMIDIInput(input);midiAccess.onstatechange=event=>{const port=event.port;if(port?.type&&port.type!=='input')return;if(port?.state==='disconnected')disconnectMIDIInput(port);else if(port)connectMIDIInput(port);paintMIDIStatus();};paintMIDIStatus();status(midiInputs.size?'MIDI connected. Play a few keys.':'MIDI is ready. Connect a keyboard to continue.');}catch(error){status(error.name==='NotAllowedError'?'MIDI access was not granted. You can still play the on-screen keyboard.':error.message);}});

  function patternLimits() {return state.pattern.lengthBeats;}
  function snapBeat(value) {const snap=state.view.snap;return tidy(Math.round(value/snap)*snap);}
  function patternGeometry() {const notes=state.pattern.notes,base=keyboardBase(),pitches=notes.map(note=>note.pitch),low=clamp(Math.floor(Math.min(base,...pitches)/12)*12,0,116),high=clamp(Math.ceil((Math.max(base+24,...pitches)+1)/12)*12-1,11,127),left=43,row=17,beatWidth=44,width=Math.max($('patternScroll').clientWidth||600,left+patternLimits()*beatWidth+12);return{low,high,left,row,top:22,beatWidth:(width-left-12)/patternLimits(),width,height:22+(high-low+1)*row};}
  function noteBox(note) {const m=noteMetrics;return{x:m.left+note.beat*m.beatWidth,y:m.top+(m.high-note.pitch)*m.row+1,width:Math.max(3,note.duration*m.beatWidth),height:m.row-2};}
  function noteMarkup(note) {const b=noteBox(note),selected=note.id===selectedNote;return `<g data-note-group="${esc(note.id)}"><rect class="piano-note ${selected?'selected':''}" data-note-id="${esc(note.id)}" x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" role="button" tabindex="0" aria-label="${S.noteName(note.pitch)}, beat ${tidy(note.beat+1)}, length ${tidy(note.duration)} beats"/><text class="piano-note-label" x="${b.x+4}" y="${b.y+10}">${b.width>23?esc(S.noteName(note.pitch)):''}</text><rect class="note-resize" data-resize-note="${esc(note.id)}" x="${b.x+Math.max(0,b.width-7)}" y="${b.y+2}" width="${Math.min(7,b.width)}" height="${Math.max(4,b.height-4)}"/></g>`;}
  function drawPattern() {if(!$('patternDetails').open)return;const svg=$('patternRoll'),scroll=$('patternScroll'),focusedNote=document.activeElement?.getAttribute('data-note-id'),oldScroll=scroll.scrollTop,m=noteMetrics=patternGeometry(),rows=[],grid=[];
    for(let pitch=m.high;pitch>=m.low;pitch--){const y=m.top+(m.high-pitch)*m.row;rows.push(`<rect class="piano-row ${[1,3,6,8,10].includes(pitch%12)?'black-row':''}" x="0" y="${y}" width="${m.width}" height="${m.row}"/><path class="piano-line" d="M0 ${y+m.row}H${m.width}"/>`);if(pitch%12===0)rows.push(`<text class="piano-label" x="6" y="${y+12}">${esc(S.noteName(pitch))}</text>`);}
    const unit=state.view.snap>=.5?.5:.25;for(let beat=0;beat<=patternLimits()+.0001;beat+=unit){const x=m.left+beat*m.beatWidth,bar=Math.abs(beat/4-Math.round(beat/4))<.0001;grid.push(`<path class="${bar?'piano-bar':'piano-line'}" d="M${x} 0V${m.height}"/>`);if(bar&&beat<patternLimits())grid.push(`<text class="piano-label" x="${x+5}" y="13">${Math.floor(beat/4)+1}</text>`);}
    attr(svg,'width',m.width);attr(svg,'height',m.height);attr(svg,'viewBox',`0 0 ${m.width} ${m.height}`);svg.innerHTML=rows.join('')+grid.join('')+state.pattern.notes.map(noteMarkup).join('')+'<line id="phrasePlayhead" class="piano-playhead" x1="0" x2="0" y1="0" y2="'+m.height+'"/>';
    noteNodes=new Map([...svg.querySelectorAll('[data-note-group]')].map(group=>[group.dataset.noteGroup,group]));scroll.scrollTop=oldScroll;renderNoteInspector();paintPhrasePlayhead();if(focusedNote)noteNodes.get(focusedNote)?.querySelector('[data-note-id]')?.focus({preventScroll:true});
  }
  function paintNote(note) {const group=noteNodes.get(note.id);if(!group)return;const b=noteBox(note),rect=group.querySelector('[data-note-id]'),label=group.querySelector('text'),handle=group.querySelector('[data-resize-note]');attr(rect,'x',b.x);attr(rect,'y',b.y);attr(rect,'width',b.width);attr(rect,'aria-label',`${S.noteName(note.pitch)}, beat ${tidy(note.beat+1)}, length ${tidy(note.duration)} beats`);attr(label,'x',b.x+4);attr(label,'y',b.y+10);text(label,b.width>23?S.noteName(note.pitch):'');attr(handle,'x',b.x+Math.max(0,b.width-7));attr(handle,'y',b.y+2);attr(handle,'width',Math.min(7,b.width));}
  function renderPatternSummary() {const beats=patternLimits(),bars=tidy(beats/4);text($('phraseSummary'),`${bars} BAR${bars===1?'':'S'} · ${state.pattern.notes.length} NOTES · VARIABLE LENGTH`);const select=$('patternBars');let option=[...select.options].find(option=>Number(option.value)===bars);if(!option){option=document.createElement('option');option.value=bars;option.textContent=bars;select.append(option);}prop(select,'value',bars);prop($('patternSnap'),'value',state.view.snap);if(exportPatternLength!==beats){exportPatternLength=beats;prop($('exportBars'),'value',Math.min(64,Math.max(1,Math.ceil(bars))));}}
  function selectNote(id) {selectedNote=id;for(const group of noteNodes.values())toggleClass(group.querySelector('[data-note-id]'),'selected',group.dataset.noteGroup===id);renderNoteInspector();}
  function renderNoteInspector(force=false) {const note=state.pattern.notes.find(note=>note.id===selectedNote);for(const id of ['notePitch','noteBeat','noteDuration','noteVelocity','deleteNoteButton','duplicateNoteButton'])prop($(id),'disabled',!note);text($('selectedNoteLabel'),note?S.noteName(note.pitch)+' / EXACT NOTE SETTINGS':'CLICK TO ADD / DRAG TO MOVE / PULL THE RIGHT EDGE TO RESIZE');if(!note)return;for(const[id,value]of[['notePitch',note.pitch],['noteBeat',tidy(note.beat+1)],['noteDuration',tidy(note.duration)],['noteVelocity',Math.round(note.velocity*100)]])if(force||document.activeElement!==$(id))prop($(id),'value',value);attr($('noteBeat'),'max',patternLimits()+1);attr($('noteDuration'),'max',patternLimits()-note.beat);}
  function coordinates(event) {const m=noteMetrics,box=$('patternRoll').getBoundingClientRect();return{beat:(event.clientX-box.left-m.left)/m.beatWidth,pitch:clamp(m.high-Math.floor((event.clientY-box.top-m.top)/m.row),m.low,m.high)};}
  function audition(pitch,velocity=.8) {const generation=inputGeneration;engine.init().then(()=>{if(generation!==inputGeneration)return;engine.scheduleNote({id:uid('preview'),pitch,velocity,when:engine.context.currentTime+.01,durationSeconds:.18,source:'preview'});startMeters();}).catch(error=>status(error.message));}
  $('patternRoll').addEventListener('focusin',event=>{const note=event.target.closest('[data-note-id]');if(note)selectNote(note.dataset.noteId);});
  $('patternRoll').addEventListener('keydown',event=>{const target=event.target.closest('[data-note-id]');if(!target||!['Enter',' '].includes(event.key))return;event.preventDefault();event.stopPropagation();const note=state.pattern.notes.find(note=>note.id===target.dataset.noteId);if(note&&!event.repeat){selectNote(note.id);audition(note.pitch,note.velocity);}});
  $('patternRoll').addEventListener('pointerdown',event=>{if(event.button!==0||!noteMetrics)return;event.preventDefault();$('patternRoll').focus({preventScroll:true});const point=coordinates(event),handle=event.target.closest('[data-resize-note]'),body=event.target.closest('[data-note-id]'),id=handle?.dataset.resizeNote||body?.dataset.noteId;let note=state.pattern.notes.find(note=>note.id===id),created=false;
    if(!note){if(point.beat<0||point.beat>=patternLimits()||state.pattern.notes.length>=S.LIMITS.notes)return;remember();note={id:uid('note'),voice:'synth',pitch:point.pitch,beat:clamp(snapBeat(point.beat),0,patternLimits()-.015625),duration:Math.min(1,patternLimits()-clamp(snapBeat(point.beat),0,patternLimits()-.015625)),velocity:.8,probability:1};state.pattern.notes.push(note);created=true;selectedNote=note.id;drawPattern();sendPattern();}
    selectNote(note.id);noteDrag={pointer:event.pointerId,id:note.id,type:created?'draw':handle?'resize':'move',start:point,original:copy(note),remembered:created};try{$('patternRoll').setPointerCapture(event.pointerId);}catch(_){}audition(note.pitch,note.velocity);
  });
  $('patternRoll').addEventListener('pointermove',event=>{if(!noteDrag||event.pointerId!==noteDrag.pointer)return;event.preventDefault();const note=state.pattern.notes.find(note=>note.id===noteDrag.id);if(!note)return;const p=coordinates(event),o=noteDrag.original;let beat=note.beat,pitch=note.pitch,duration=note.duration;
    if(noteDrag.type==='resize'||noteDrag.type==='draw')duration=clamp(snapBeat(p.beat-o.beat),.015625,patternLimits()-o.beat);
    else{beat=clamp(snapBeat(o.beat+p.beat-noteDrag.start.beat),0,patternLimits()-o.duration);pitch=clamp(o.pitch+p.pitch-noteDrag.start.pitch,0,127);}
    if(beat===note.beat&&pitch===note.pitch&&duration===note.duration)return;if(!noteDrag.remembered){remember();noteDrag.remembered=true;}Object.assign(note,{beat,pitch,duration});paintNote(note);renderNoteInspector();queuePattern();
  });
  function finishNote(event){if(!noteDrag||event&&event.pointerId!==noteDrag.pointer)return;const pointer=noteDrag.pointer;noteDrag=null;try{if($('patternRoll').hasPointerCapture(pointer))$('patternRoll').releasePointerCapture(pointer);}catch(_){}if(sendTimer){clearTimeout(sendTimer);sendTimer=0;sendPattern();}state.pattern.notes.sort((a,b)=>a.beat-b.beat||a.pitch-b.pitch);renderPatternSummary();drawPattern();}
  for(const name of ['pointerup','pointercancel','lostpointercapture'])$('patternRoll').addEventListener(name,finishNote);
  function removeNote(){if(!selectedNote)return;remember();state.pattern.notes=state.pattern.notes.filter(note=>note.id!==selectedNote);selectedNote=null;sendPattern();renderPatternSummary();drawPattern();}
  function duplicateNote(){const old=state.pattern.notes.find(note=>note.id===selectedNote);if(!old||state.pattern.notes.length>=S.LIMITS.notes)return;remember();const note={...copy(old),id:uid('note'),beat:Math.min(patternLimits()-old.duration,old.beat+old.duration)};state.pattern.notes.push(note);selectedNote=note.id;sendPattern();renderPatternSummary();drawPattern();}
  $('deleteNoteButton').addEventListener('click',removeNote);$('duplicateNoteButton').addEventListener('click',duplicateNote);
  for(const id of ['notePitch','noteBeat','noteDuration','noteVelocity'])$(id).addEventListener('change',event=>{const note=state.pattern.notes.find(note=>note.id===selectedNote),value=event.target.valueAsNumber;if(!note||!Number.isFinite(value)){renderNoteInspector(true);return;}remember();if(id==='notePitch')note.pitch=Math.round(clamp(value,0,127));if(id==='noteBeat')note.beat=clamp(value-1,0,patternLimits()-note.duration);if(id==='noteDuration')note.duration=clamp(value,.015625,patternLimits()-note.beat);if(id==='noteVelocity')note.velocity=clamp(value/100,.01,1);sendPattern();drawPattern();renderNoteInspector(true);});
  $('patternDetails').addEventListener('toggle',()=>{state.view.patternOpen=$('patternDetails').open;if(state.view.patternOpen)drawPattern();notify();});
  $('patternBars').addEventListener('change',()=>{const length=clamp(Number($('patternBars').value)*4,.25,S.LIMITS.maxPatternBeats);remember();state.pattern.lengthBeats=length;state.pattern.notes=state.pattern.notes.filter(note=>note.beat<length).map(note=>({...note,duration:Math.min(note.duration,length-note.beat)}));selectedNote=null;sendPattern();renderPatternSummary();drawPattern();status('Phrase length updated. Undo restores any trimmed notes.');});
  $('patternSnap').addEventListener('change',()=>{state.view.snap=clamp(Number($('patternSnap').value),.0625,4);notify();drawPattern();});
  $('clearPatternButton').addEventListener('click',()=>{if(!state.pattern.notes.length)return;remember();state.pattern.notes=[];selectedNote=null;sendPattern();renderPatternSummary();drawPattern();});

  function paintPhrasePlayhead(){if(!$('patternDetails').open||!noteMetrics)return;const beat=((meterSnapshot?.beat||0)%patternLimits()+patternLimits())%patternLimits(),line=$('phrasePlayhead');if(line){const x=noteMetrics.left+beat*noteMetrics.beatWidth;attr(line,'x1',x);attr(line,'x2',x);}}
  function updateMeters(){if(!visible||document.hidden)return;meterSnapshot=engine.getMeters();const voices=meterSnapshot.voiceStates||[];for(let i=0;i<5;i++){const lamp=document.querySelector('[data-voice="'+i+'"]'),voice=voices[i];toggleClass(lamp,'active',Boolean(voice?.active));attr(lamp,'title','Voice '+(i+1)+(voice?.active?' / '+S.noteName(voice.pitch):' / resting'));}text($('voiceCount'),Math.min(5,meterSnapshot.voices||0)+' / 5');const rms=Math.max(0,Number(meterSnapshot.rms)||0),db=rms>1e-5?20*Math.log10(rms):-100;style($('outputLevel'),'transform','scaleX('+clamp((db+60)/60,0,1)+')');text($('outputReading'),db<=-90?'−∞ dB':db.toFixed(1)+' dB');toggleClass($('audioLamp'),'active',engine.mode!=='idle');text($('audioStatus'),engine.isPlaying?'PHRASE IN SERVICE':inputs.size?'PLAYED BY HAND':engine.mode==='idle'?'READY FOR SERVICE':'AUDIO READY');const beat=((meterSnapshot.beat||0)%patternLimits()+patternLimits())%patternLimits();text($('position'),String(Math.floor(beat/4)+1).padStart(2,'0')+' : '+String(Math.floor(beat%4)+1).padStart(2,'0'));attr($('playButton'),'aria-pressed',Boolean(engine.isPlaying));text($('playLabel'),engine.isPlaying?'Playing phrase':'Play phrase');paintKeys();paintPhrasePlayhead();if(!engine.isPlaying&&!inputs.size&&!(meterSnapshot.voices>0)){clearInterval(meterTimer);meterTimer=0;}}
  function startMeters(){if(!visible||document.hidden)return;if(!meterTimer)meterTimer=setInterval(updateMeters,125);updateMeters();}
  async function play(options={}) {finishPending();if(options.tempo!==undefined)setTempo(options.tempo,false);await engine.start(options);startMeters();status('The phrase is in service. Play the keyboard alongside it.');return true;}
  function stop(){engine.stop();startMeters();status('Phrase stopped. Held notes remain yours.');}
  function panic(){finishPending();releaseInputs();engine.panic();meterSnapshot=null;setWheel(state.synth.modWheel||0);startMeters();status('All voices released. The recipe is unchanged.');}
  function setTempo(value,capture=true){value=clamp(Number(value)||108,30,240);if(state.tempo===value)return;if(capture)remember();state.tempo=value;state.pattern.tempo=value;engine.setState(state);prop($('tempo'),'value',value);notify();}
  $('playButton').addEventListener('click',()=>engine.isPlaying?stop():play().catch(error=>status(error.message)));$('stopButton').addEventListener('click',stop);$('panicButton').addEventListener('click',panic);$('tempo').addEventListener('change',event=>setTempo(event.target.value));
  $('copyCompareButton').addEventListener('click',()=>{remember();updateCompare();const target=activeCompare==='A'?'B':'A';comparisons[target]=copy(comparisons[activeCompare]);status('Sound '+activeCompare+' copied to '+target+'. Your phrase is retained.');notify();});
  $('presetSelect').addEventListener('change',()=>{const preset=(scope.HeirloomPresets||[]).find(preset=>preset.id===$('presetSelect').value);if(preset)applyPreset(preset);});
  $('projectName').addEventListener('input',event=>{if(!textGestures.has(event.target)){remember();textGestures.set(event.target,true);}state.name=event.target.value.slice(0,80);updateCompare();notify();});
  $('undoButton').addEventListener('click',undo);$('redoButton').addEventListener('click',redo);
  function fileName(){return(state.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'heirloom');}
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('saveButton').addEventListener('click',()=>{finishPending();download(new Blob([S.serialize(state)],{type:'application/json'}),fileName()+'.heirloom.json');status('Recipe and phrase saved.');});$('openButton').addEventListener('click',()=>$('projectFile').click());
  $('projectFile').addEventListener('change',async()=>{const file=$('projectFile').files[0];$('projectFile').value='';if(!file)return;const token=++importGeneration;try{if(file.size>S.LIMITS.projectBytes)throw Error('Choose a HEIRLOOM project smaller than 2 MiB.');const raw=await file.text();if(token!==importGeneration)return;loadState(S.parseProject(raw));}catch(error){status(error.message);}});
  async function exportAudio(options={}) {const scopeId=options.scope||'pattern',held=[...new Set([...inputs.values()].map(record=>record.pitch))],firstBeat=Math.min(...state.pattern.notes.map(note=>note.beat)),chord=held.length?held:state.pattern.notes.filter(note=>Math.abs(note.beat-firstBeat)<1e-6).map(note=>note.pitch);return engine.renderWav({...options,state:copy(state),scope:scopeId,pitch:options.pitch??keyboardBase()+12,pitches:options.pitches||(scopeId==='chord'?chord:undefined)});}
  $('exportBars').addEventListener('change',()=>prop($('exportBars'),'value',clamp(Number($('exportBars').value)||Math.ceil(patternLimits()/4),1,64)));
  $('wavButton').addEventListener('click',async()=>{if(exportController)return;exportController=new AbortController();prop($('wavButton'),'disabled',true);prop($('cancelExportButton'),'hidden',false);status('Printing the actual instrument…');try{const result=await exportAudio({scope:$('exportScope').value,bars:clamp(Number($('exportBars').value)||4,1,64),signal:exportController.signal});download(result.blob,fileName()+'.wav');status('WAV printed. The recipe is unchanged.');}catch(error){status(error.name==='AbortError'?'Render canceled.':error.message);}finally{exportController=null;prop($('wavButton'),'disabled',false);prop($('cancelExportButton'),'hidden',true);}});$('cancelExportButton').addEventListener('click',()=>exportController?.abort());
  $('helpButton').addEventListener('click',()=>$('helpDialog').showModal());$('closeHelpButton').addEventListener('click',()=>$('helpDialog').close());
  const keyCodes=['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon','Quote','BracketLeft','BracketRight','Backslash'];
  document.addEventListener('keydown',event=>{const editable=event.target.closest('input,textarea,select,[contenteditable=true]');if((event.ctrlKey||event.metaKey)&&event.code==='KeyZ'&&!editable){event.preventDefault();event.shiftKey?redo():undo();return;}if(event.code==='Escape'&&!$('helpDialog').open){event.preventDefault();panic();return;}if(editable||$('helpDialog').open||event.altKey||event.ctrlKey||event.metaKey)return;if(event.code==='Space'&&!event.target.closest('button')){event.preventDefault();if(!event.repeat)(engine.isPlaying?stop():play().catch(error=>status(error.message)));return;}if(event.repeat)return;if(event.code==='KeyZ'||event.code==='KeyX'){event.preventDefault();changeOctave(event.code==='KeyZ'?-1:1);return;}
    if($('patternDetails').open&&selectedNote&&['Delete','Backspace'].includes(event.key)){event.preventDefault();removeNote();return;}
    if($('patternDetails').open&&selectedNote&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&event.target.closest('#patternRoll')){event.preventDefault();const note=state.pattern.notes.find(note=>note.id===selectedNote);if(!note)return;remember();if(event.key==='ArrowUp'||event.key==='ArrowDown')note.pitch=clamp(note.pitch+(event.key==='ArrowUp'?1:-1)*(event.shiftKey?12:1),0,127);else note.beat=clamp(note.beat+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?1:state.view.snap),0,patternLimits()-note.duration);sendPattern();drawPattern();return;}
    const offset=keyCodes.indexOf(event.code);if(offset>=0){event.preventDefault();beginInput('computer:'+event.code,keyboardBase()+offset,keyVelocity(),'computer');}
  });
  document.addEventListener('keyup',event=>{if(keyCodes.includes(event.code))endInput('computer:'+event.code);});
  window.addEventListener('blur',()=>{finishKnob();keyGesture=null;finishNote();releaseInputs(false);});
  let visibilityObserver=null,resizeObserver=null;
  function syncVisibility(){const active=visible&&!document.hidden;if(!active){clearInterval(meterTimer);meterTimer=0;}else if(engine.mode!=='idle')startMeters();}
  document.addEventListener('visibilitychange',syncVisibility);
  if(typeof IntersectionObserver==='function'){visibilityObserver=new IntersectionObserver(entries=>{visible=entries[entries.length-1].isIntersecting;syncVisibility();});visibilityObserver.observe(document.querySelector('.instrument-shell'));}
  if(typeof ResizeObserver==='function'){resizeObserver=new ResizeObserver(()=>{if($('patternDetails').open&&!noteDrag)drawPattern();});resizeObserver.observe($('patternScroll'));}else window.addEventListener('resize',()=>{if($('patternDetails').open&&!noteDrag)drawPattern();});
  function renderAll(){prop($('projectName'),'value',state.name);prop($('tempo'),'value',state.tempo);paintControls();renderKeyboard();renderCompare();renderHistory();prop($('patternDetails'),'open',state.view.patternOpen);renderPatternSummary();if(state.view.patternOpen)drawPattern();attr($('sustainButton'),'aria-pressed',sustain);if(!recoveryAvailable){text($('storageNotice'),'Browser recovery is unavailable. Save a recipe to keep your work.');prop($('storageNotice'),'hidden',false);}}
  scope.HeirloomApp=Object.freeze({getState:()=>copy(state),getProject:()=>JSON.parse(S.serialize(state)),loadState,loadProject:loadState,setState:loadState,applyState:loadState,get state(){return copy(state);},engine,prepare:()=>engine.init(),play,start:play,stop,panic,setTempo,isPlaying:()=>Boolean(engine.isPlaying),exportAudio,get audioExport(){return{scopes:[{id:'pattern',label:'Current phrase'},{id:'note',label:'Single note'},{id:'chord',label:'Held chord / first phrase chord'}],defaultScope:'pattern',defaultBars:Math.min(64,Math.max(1,Math.ceil(patternLimits()/4))),maxBars:64,maxTailSeconds:30,defaultTailSeconds:scope.HeirloomAudio.autoTail(state),sampleRate:48000,channels:2,format:'wav'};},onStateChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}});
  window.addEventListener('pagehide',()=>{exportController?.abort();clearTimeout(saveTimer);clearTimeout(sendTimer);clearInterval(meterTimer);visibilityObserver?.disconnect();resizeObserver?.disconnect();releaseInputs();for(const input of midiInputs.values())input.onmidimessage=null;if(midiAccess)midiAccess.onstatechange=null;engine.dispose?.();});
  renderPresets();buildControls();renderAll();scope.HeirloomAppReady=true;document.dispatchEvent(new CustomEvent('musiclab:app-ready',{detail:{app:'heirloom'},bubbles:true}));
})(window);
