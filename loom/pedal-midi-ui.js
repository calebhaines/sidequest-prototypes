/* FERMENT · keep a single played line as portable notes. */
(function (scope) {
  'use strict';
  function create(options) {
    const { element, engine, getOwnerId, getSlot, getGeneration = () => 0, onStatus = () => {}, onPlacePattern, getTargets = () => [] } = options;
    if (!element || !engine) throw Error('FERMENT capture needs its panel and audio engine.');
    let disposed = false, busy = false, operation = 0, generation = getGeneration(), message = '', messageKey = '', downloadUrl = null;
    const settings = { trimLeading: false, snap: 0 };
    const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const take = () => engine.getPedalMidiTake?.() || null;
    const key = value => value ? [value.token, !!value.capturing, value.reason || ''].join(':') : '';
    const $ = id => element.querySelector('#' + id);
    const text = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    element.innerHTML = '<details id="fermentMidiPanel" class="ferment-midi"><summary><span><strong>Capture MIDI</strong><small>Keep your guitar or bass line as notes</small></span><span class="fm-summary" id="fermentMidiSummary">Ready</span></summary><div class="fm-body"><p class="fm-intro">Play single notes in <strong>Pitch Tracking</strong> mode. Capture uses input pitch, before Sound register. Chords and pitch bends are not transcribed.</p><div class="fm-capture-row"><div class="fm-actions"><button type="button" id="fermentMidiStart">Start capture</button><button type="button" id="fermentMidiStop">Stop</button><button type="button" id="fermentMidiClear" class="fm-quiet">Clear</button></div><div class="fm-readings"><span><output id="fermentMidiCount">0</output> notes</span><span><output id="fermentMidiDuration">0.0</output> s</span></div></div><p class="fm-status" id="fermentMidiStatus" role="status" aria-live="polite"></p><div class="fm-export-options"><label><input type="checkbox" id="fermentMidiTrim"> Trim leading silence</label><label>Quantize <select id="fermentMidiSnap" aria-label="Captured note quantization"><option value="0">Off · original timing</option><option value="0.25">1/16 notes</option><option value="0.5">1/8 notes</option></select></label></div><div class="fm-exports"><button type="button" id="fermentMidiSave">Save MIDI</button><button type="button" id="fermentMidiPattern">Save Kitchen pattern</button>' + (onPlacePattern ? '<button type="button" id="fermentMidiPlace">Place as notes</button>' : '') + '</div><p class="fm-note" id="fermentMidiOrigin"></p></div></details>';
    if (onPlacePattern) $('fermentMidiPlace').insertAdjacentHTML('beforebegin', '<label class="fm-target">Place on <select id="fermentMidiTarget" aria-label="Captured notes destination"></select></label>');
    function targets() { const select=$('fermentMidiTarget'); if(!select)return; const prior=select.value, choices=getTargets(); const html=choices.map(item=>'<option value="'+escape(item.id)+'">'+escape(item.name)+'</option>').join(''); if(select.innerHTML!==html){select.innerHTML=html;select.value=choices.some(item=>item.id===prior)?prior:(choices.find(item=>item.selected)||choices[0])?.id||'';} }
    function notify(value) { message = value; messageKey = key(take()); if (!disposed) text($('fermentMidiStatus'), value); onStatus(value); }
    function paint() {
      if (disposed) return;
      if (generation !== getGeneration()) { generation = getGeneration(); operation++; busy = false; message = messageKey = ''; }
      targets();
      const value = take(), capturing = !!value?.capturing, count = value?.notes?.length || 0, seconds = value?.sampleRate > 0 ? Math.max(0, value.frames || 0) / value.sampleRate : 0;
      text($('fermentMidiCount'), String(count)); text($('fermentMidiDuration'), seconds.toFixed(1));
      text($('fermentMidiSummary'), capturing ? '● Capturing · ' + count : count ? count + (count === 1 ? ' note ready' : ' notes ready') : 'Ready');
      $('fermentMidiPanel').classList.toggle('fm-is-capturing', capturing);
      $('fermentMidiStart').disabled = busy || capturing;
      $('fermentMidiStop').disabled = busy || !capturing;
      $('fermentMidiClear').disabled = busy || capturing || !value;
      for (const id of ['fermentMidiSave', 'fermentMidiPattern', 'fermentMidiPlace']) if ($(id)) $(id).disabled = busy || capturing || !count;
      const defaultMessage = capturing ? 'Listening for single notes. Stop when your phrase is complete.' : count ? 'Take ready. Timing stays as played unless you quantize.' : value ? 'No notes captured. Try a clean line in Pitch Tracking mode.' : 'Start capture, then play a single-note line.';
      text($('fermentMidiStatus'), message && messageKey === key(value) ? message : defaultMessage);
      const owner = value?.ownerId, slot = value?.slot;
      const origin = owner === 'master' ? 'master' : /^bus-[12]$/.test(owner || '') ? 'bus ' + owner.slice(4) : /^return-[12]$/.test(owner || '') ? 'return ' + (owner === 'return-1' ? 'A' : 'B') : owner?.replace(/^track-/, 'track ');
      text($('fermentMidiOrigin'), (origin ? 'From ' + origin + (Number.isInteger(slot) ? ' · insert ' + (slot + 1) : '') + '. ' : '') + 'Kept across editors. Save or place this take to keep it in a file or project.');
    }
    function render() { if (disposed) return; $('fermentMidiTrim').checked = settings.trimLeading; $('fermentMidiSnap').value = String(settings.snap); paint(); }
    async function run(callback) {
      if (busy || disposed) return;
      const current = ++operation, currentGeneration = getGeneration(); busy = true; paint();
      try { await callback(() => !disposed && current === operation && currentGeneration === getGeneration()); }
      catch (error) { if (!disposed && current === operation && currentGeneration === getGeneration()) notify(error.message || 'Capture action failed.'); }
      finally { if (!disposed && current === operation) { busy = false; paint(); } }
    }
    function captured() {
      const value = take();
      if (!value || value.capturing || !value.notes?.length) throw Error('Stop a take containing notes before exporting.');
      if (!scope.LoomPedalMidi) throw Error('The note export helpers have not loaded.');
      return value;
    }
    function download(blob, extension) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = downloadUrl; link.download = 'ferment-input-take.' + extension;
      document.body.append(link); link.click(); link.remove();
    }
    async function click(event) {
      const button = event.target.closest('button'); if (!button || button.disabled) return;
      event.stopPropagation();
      await run(async active => {
        if (button.id === 'fermentMidiStart') {
          await engine.startPedalMidi(getOwnerId(), getSlot());
          if (active()) notify('Capturing input notes. Play a single-note line, then Stop.');
        } else if (button.id === 'fermentMidiStop') {
          await engine.stopPedalMidi('stopped');
          if (active()) notify(take()?.notes?.length ? 'Take ready to save or place.' : 'No notes captured. Choose Pitch Tracking and try a clean line.');
        } else if (button.id === 'fermentMidiClear') {
          engine.clearPedalMidiTake(); if (active()) notify('Capture cleared.');
        } else {
          const value = captured(), opts = { ...settings, name: 'FERMENT input take' };
          if (button.id === 'fermentMidiSave') {
            download(new Blob([scope.LoomPedalMidi.toMidi(value, opts)], { type: 'application/octet-stream' }), 'mid'); notify('MIDI file prepared.');
          } else if (button.id === 'fermentMidiPattern') {
            download(new Blob([JSON.stringify(scope.LoomPedalMidi.toPattern(value, opts), null, 2)], { type: 'application/json' }), 'musiclab-pattern.json'); notify('Kitchen pattern prepared.');
          } else if (button.id === 'fermentMidiPlace' && onPlacePattern) {
            await onPlacePattern(scope.LoomPedalMidi.toPattern(value, opts), { ownerId: value.ownerId, slot: value.slot, token: value.token, targetId: $('fermentMidiTarget')?.value });
            if (active()) notify('Captured pattern placed as editable notes.');
          }
        }
      });
    }
    function change(event) {
      if (event.target.id === 'fermentMidiTrim') settings.trimLeading = event.target.checked;
      if (event.target.id === 'fermentMidiSnap') settings.snap = [0, .25, .5].includes(Number(event.target.value)) ? Number(event.target.value) : 0;
      event.stopPropagation();
    }
    element.addEventListener('click', click); element.addEventListener('change', change);
    const unsubscribe = engine.subscribePedalMidi?.(() => paint());
    render();
    return { render, paint, dispose() { if (disposed) return; disposed = true; operation++; unsubscribe?.(); element.removeEventListener('click', click); element.removeEventListener('change', change); if (downloadUrl) URL.revokeObjectURL(downloadUrl); element.innerHTML = ''; } };
  }
  scope.LoomPedalMidiUI = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
