/* GALLEY · the recordings drawer. Nothing runs until the drawer is opened. */
(function (scope) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const size = bytes => bytes >= 1048576 ? (bytes / 1048576).toFixed(1) + ' MiB' : bytes >= 1024 ? (bytes / 1024).toFixed(1) + ' KiB' : Math.round(bytes) + ' B';
  const duration = seconds => { const value = Math.max(0, Number(seconds) || 0); return Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0') + (value < 10 ? '.' + Math.floor(value % 1 * 10) : ''); };
  function create(options) {
    const { getState, getGeneration = () => 0, getAsset = () => null, onDelete, onStatus = () => {}, isBusy = () => false } = options;
    const S = scope.LoomSchema, M = scope.LoomRecordings;
    let dialog, rows = [], checked = new Set(), selected = null, review = null, context = null, previewToken = 0, playingId = null, previousFocus = null, deleting = false, destroyed = false;
    const previewNodes = new Set();
    const $ = id => dialog?.querySelector('#' + id);
    function say(message) { if ($('recordingsMessage')) $('recordingsMessage').textContent = message; }
    function makeDialog() {
      if (dialog) return;
      dialog = document.createElement('dialog'); dialog.id = 'recordingsDialog'; dialog.className = 'recordings-dialog'; dialog.setAttribute('aria-labelledby', 'recordingsTitle');
      dialog.innerHTML = `<div class="dialog-top"><div><span class="eyebrow">THE RECORDINGS DRAWER / PROJECT AUDIO</span><h2 id="recordingsTitle">Keep the good takes.</h2></div><button id="closeRecordings" class="close-button" aria-label="Close recordings browser">×</button></div>
        <div id="recordingsBrowse"><div class="recordings-storage" id="recordingsStorage"></div><p class="recordings-intro">Recordings, imports and frozen audio stored in this project. Deleting a used recording also removes every clip that uses it. Instrument-internal sample libraries stay in their instrument editors.</p>
        <div class="recordings-tools"><label class="recordings-search">FIND A TAKE<input id="recordingsSearch" type="search" placeholder="Name or track…" autocomplete="off"></label><label>SHOW<select id="recordingsFilter"><option value="all">All project audio</option><option value="unused">Unused audio</option><option value="used">In use</option><option value="freeze">Frozen prints</option></select></label><label>SORT<select id="recordingsSort"><option value="size">Largest first</option><option value="name">Name</option><option value="duration">Longest first</option></select></label></div>
        <div class="recordings-workspace"><div class="recordings-inventory"><div class="recordings-list-heading"><label><input id="recordingsSelectVisible" type="checkbox"> Select shown</label><output id="recordingsCount"></output></div><ul id="recordingsList" class="recordings-list" aria-label="Project recordings"></ul><p id="recordingsEmpty" class="recordings-empty" hidden></p></div>
        <aside class="recordings-preview" id="recordingsPreview" aria-labelledby="recordingsPreviewName"><span class="eyebrow">LISTEN / CHECK BEFORE CLEARING</span><h3 id="recordingsPreviewName">Choose a recording.</h3><div class="recordings-wave"><canvas id="recordingsWaveform" width="720" height="160" aria-label="Selected recording waveform"></canvas><span id="recordingsProgress" aria-hidden="true"></span></div><p id="recordingsPreviewMeta" class="recordings-preview-meta"></p><div class="recordings-preview-actions"><button id="recordingsPlay" disabled>▶ Preview</button><button id="recordingsStop" disabled>Stop</button><button id="recordingsDownload" disabled>Download WAV ↗</button></div><div id="recordingsUses" class="recordings-uses"></div><p id="recordingsPreviewHint" class="recordings-preview-hint"></p></aside></div>
        <div class="recordings-bottom"><span id="recordingsSelection">Nothing selected</span><div><button id="recordingsDeleteUnused">Clear unused…</button><button id="recordingsDeleteSelected" class="recordings-danger" disabled>Delete selected…</button></div></div></div>
        <section id="recordingsDeleteReview" class="recordings-delete-review" aria-labelledby="recordingsDeleteTitle" hidden><span class="eyebrow">MAKE ROOM / PERMANENT REMOVAL</span><h3 id="recordingsDeleteTitle">Review the selected audio.</h3><div id="recordingsDeleteSummary"></div><p class="recordings-delete-warning">Playback will stop. This permanently removes the selected audio from the current project and clears Undo and Redo. Existing downloaded project files keep their original recordings. Save the project again to keep the smaller file.</p><div class="recordings-review-actions"><button id="recordingsCancelDelete">Keep recordings</button><button id="recordingsConfirmDelete" class="recordings-danger">Permanently delete</button></div></section><p id="recordingsMessage" class="recordings-message" role="status" aria-live="polite"></p>`;
      document.body.append(dialog);
      $('closeRecordings').addEventListener('click', close);
      dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
      dialog.addEventListener('close', () => { stopPreview(); review = null; if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true }); });
      for (const id of ['recordingsSearch', 'recordingsFilter', 'recordingsSort']) $(id).addEventListener(id === 'recordingsSearch' ? 'input' : 'change', renderList);
      $('recordingsList').addEventListener('click', event => { const button = event.target.closest('[data-recording-select]'); if (button) choose(button.dataset.recordingSelect); });
      $('recordingsList').addEventListener('change', event => { const checkbox = event.target.closest('[data-recording-check]'); if (!checkbox) return; checkbox.checked ? checked.add(checkbox.dataset.recordingCheck) : checked.delete(checkbox.dataset.recordingCheck); selectionState(); });
      $('recordingsSelectVisible').addEventListener('change', event => { for (const row of filtered()) event.target.checked ? checked.add(row.id) : checked.delete(row.id); renderList(); });
      $('recordingsPlay').addEventListener('click', preview);
      $('recordingsStop').addEventListener('click', () => { stopPreview(); say('Preview stopped.'); });
      $('recordingsDownload').addEventListener('click', download);
      $('recordingsDeleteSelected').addEventListener('click', () => beginDelete([...checked]));
      $('recordingsDeleteUnused').addEventListener('click', () => beginDelete(rows.filter(row => row.unused).map(row => row.id)));
      $('recordingsCancelDelete').addEventListener('click', cancelDelete);
      $('recordingsConfirmDelete').addEventListener('click', confirmDelete);
    }
    function filtered() {
      const query = $('recordingsSearch').value.trim().toLocaleLowerCase(), filter = $('recordingsFilter').value, sort = $('recordingsSort').value;
      return rows.filter(row => (!query || [row.name, ...row.uses.map(use => use.trackName)].join(' ').toLocaleLowerCase().includes(query)) && (filter === 'all' || filter === 'unused' && row.unused || filter === 'used' && !row.unused || filter === 'freeze' && row.kind === 'freeze')).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : (sort === 'duration' ? b.duration - a.duration : b.encodedBytes - a.encodedBytes) || a.name.localeCompare(b.name));
    }
    function selectionState() {
      const shown = filtered(), count = shown.filter(row => checked.has(row.id)).length, total = rows.filter(row => checked.has(row.id));
      $('recordingsSelectVisible').checked = shown.length > 0 && count === shown.length; $('recordingsSelectVisible').indeterminate = count > 0 && count < shown.length; $('recordingsSelectVisible').disabled = !shown.length;
      $('recordingsSelection').textContent = total.length ? total.length + ' selected · ' + size(total.reduce((sum, row) => sum + row.encodedBytes, 0)) + ' stored audio' : 'Nothing selected';
      $('recordingsDeleteSelected').disabled = !total.length || deleting || !!isBusy(); $('recordingsDeleteUnused').disabled = !rows.some(row => row.unused) || deleting || !!isBusy();
    }
    function renderList() {
      if (!dialog) return;
      const shown = filtered();
      $('recordingsList').innerHTML = shown.map(row => `<li data-recording-id="${esc(row.id)}" class="${row.id === selected ? 'is-selected' : ''}"><label class="recordings-check"><input type="checkbox" data-recording-check="${esc(row.id)}" aria-label="Select ${esc(row.name)}" ${checked.has(row.id) ? 'checked' : ''}></label><button data-recording-select="${esc(row.id)}" aria-pressed="${row.id === selected}"><span class="recordings-row-copy"><strong>${esc(row.name)}</strong><small>${row.kind === 'freeze' ? row.unused ? 'UNUSED FROZEN AUDIO' : 'FROZEN TRACK' : row.unused ? 'UNUSED RECORDING' : row.useCount + (row.useCount === 1 ? ' CLIP' : ' CLIPS')} · ${duration(row.duration)}</small></span><span class="recordings-row-size">${size(row.encodedBytes)}<small>in project</small></span></button></li>`).join('');
      $('recordingsCount').textContent = shown.length + ' / ' + rows.length; $('recordingsEmpty').hidden = !!shown.length; $('recordingsEmpty').textContent = rows.length ? 'No recordings match this view.' : 'No recorded, imported or frozen audio is stored in this project yet.'; selectionState();
    }
    function storage() {
      const state = getState(), value = M.storage(state), sourceBytes = state.assets.reduce((sum, asset) => sum + asset.frames * asset.channels * 2, 0), frozenBytes = (state.freezeAssets || []).reduce((sum, asset) => sum + asset.frames * asset.channels * 4, 0);
      $('recordingsStorage').innerHTML = `<div><span>Stored audio</span><strong>${size(value.savedEncodedBytes)}</strong><small>in the next saved project${value.savedEncodedBytes < value.encodedBytes ? ' · ' + size(value.encodedBytes - value.savedEncodedBytes) + ' unused' : ''}</small></div><div><span>Recordings / imports</span><strong>${size(sourceBytes)}</strong><small>${size(S.audioCapacity(state).sourceAvailableBytes)} available · ${size(S.LIMITS.totalPcmBytes)} shared PCM</small></div><div><span>Frozen prints</span><strong>${size(frozenBytes)}</strong><small>Float32 audio · ${size(S.LIMITS.freezePcmBytes)} budget</small></div><div><span>Project file limit</span><strong>${size(S.LIMITS.projectBytes)}</strong><small>audio + instruments + settings</small></div>`;
    }
    function rawAsset(row, part = 0) {
      const state = getState(), id = row.kind === 'audio' ? row.assetId : row.chunks?.[part]?.main || row.assetId;
      return (row.kind === 'audio' ? state.assets : state.freezeAssets || []).find(asset => asset.id === id);
    }
    function decoded(raw, kind) { return getAsset(raw.id) || S.decodeAssets(kind === 'audio' ? [raw] : [], kind === 'audio' ? [] : [raw])[raw.id]; }
    function paintWave(audio) {
      const canvas = $('recordingsWaveform'), painter = canvas.getContext('2d'); if (!painter) return;
      const width = canvas.width, height = canvas.height; painter.clearRect(0, 0, width, height); painter.strokeStyle = '#6f7366'; painter.lineWidth = 1; painter.beginPath(); painter.moveTo(0, height / 2); painter.lineTo(width, height / 2); painter.stroke();
      if (!audio?.left?.length) { painter.fillStyle = '#a8ac97'; painter.font = '17px monospace'; painter.textAlign = 'center'; painter.fillText('SELECT A TAKE / PRESS PREVIEW', width / 2, height / 2 - 15); return; }
      painter.strokeStyle = '#d6bb89'; painter.lineWidth = 3; painter.beginPath();
      const count = 180, samples = audio.left.length;
      for (let bin = 0; bin < count; bin++) { const start = Math.floor(bin * samples / count), end = Math.max(start + 1, Math.floor((bin + 1) * samples / count)), step = Math.max(1, Math.floor((end - start) / 100)); let peak = 0; for (let i = start; i < end; i += step) peak = Math.max(peak, Math.abs(audio.left[i]), Math.abs(audio.right?.[i] || 0)); const extent = Math.max(1, Math.min(1, peak) * (height / 2 - 11)), x = (bin + .5) * width / count; painter.moveTo(x, height / 2 - extent); painter.lineTo(x, height / 2 + extent); }
      painter.stroke();
    }
    function choose(id) {
      if (id !== selected) stopPreview(); selected = rows.some(row => row.id === id) ? id : null; renderList(); renderPreview();
    }
    function renderPreview() {
      const row = rows.find(row => row.id === selected);
      $('recordingsPreviewName').textContent = row?.name || 'Choose a recording.'; $('recordingsPlay').disabled = !row; $('recordingsStop').disabled = !playingId; $('recordingsDownload').disabled = !row || row.kind !== 'audio';
      if (!row) { $('recordingsPreviewMeta').textContent = ''; $('recordingsUses').textContent = ''; $('recordingsPreviewHint').textContent = ''; paintWave(null); return; }
      $('recordingsPreviewMeta').textContent = duration(row.duration) + ' · ' + (row.sampleRate / 1000).toFixed(row.sampleRate % 1000 ? 1 : 0) + ' kHz · ' + (row.channels === 1 ? 'Mono' : 'Stereo') + ' · ' + size(row.encodedBytes) + ' stored';
      const tracks = [...new Set(row.uses.map(use => use.trackName))];
      $('recordingsUses').innerHTML = row.kind === 'freeze' ? `<strong>${row.unused ? 'Unused frozen audio' : 'Baked audio for ' + esc(tracks[0] || getState().tracks.find(track => track.id === row.trackId)?.name || 'a track')}</strong><p>${row.chunkCount || row.chunks?.length || 1} stored chunks${row.unused ? '. No track uses this audio. Normal Save already omits it; clearing it also frees this session’s loaded audio.' : '. Removing this print unfreezes the track and keeps its original clips.'}</p>` : row.unused ? '<strong>Unused recording</strong><p>No arrangement clips use this audio. Normal Save already omits it. Clearing it also frees this session’s loaded audio without changing the arrangement.</p>' : `<strong>Used by ${row.useCount} ${row.useCount === 1 ? 'clip' : 'clips'}</strong><p>${tracks.map(esc).join(' · ')}</p><p>Deleting the recording removes all of these clips, including copies on other tracks.</p>`;
      $('recordingsPreviewHint').textContent = row.kind === 'freeze' ? 'Preview plays the main frozen track, including its tail. Send feeds count toward storage. Use GALLEY’s WAV export to keep a complete rendered track.' : 'Preview plays the complete original take before clip trims, mixer settings or effects. Download a WAV before deleting anything you want to keep.';
      const raw = rawAsset(row), audio = raw && getAsset(raw.id); paintWave(audio || null);
    }
    function stopPreview() {
      ++previewToken; for (const entry of previewNodes) { entry.node.onended = null; try { entry.node.stop(); } catch (_) {} entry.node.disconnect(); } previewNodes.clear(); playingId = null;
      if (context) { const old = context; context = null; old.close().catch(() => {}); }
      if ($('recordingsProgress')) { $('recordingsProgress').style.transition = 'none'; $('recordingsProgress').style.transform = 'scaleX(0)'; $('recordingsStop').disabled = true; $('recordingsPlay').textContent = '▶ Preview'; }
    }
    async function preview() {
      const row = rows.find(row => row.id === selected); if (!row) return; stopPreview(); const token = previewToken, generation = getGeneration(), startingState = getState(); playingId = row.id; $('recordingsStop').disabled = false; $('recordingsPlay').textContent = 'Restart';
      try {
        const AudioContext = scope.AudioContext || scope.webkitAudioContext; if (!AudioContext) throw Error('Audio preview is unavailable in this browser.'); context = new AudioContext(); await context.resume();
        if (token !== previewToken || generation !== getGeneration() || !dialog.open) { if (token === previewToken) stopPreview(); return; }
        const parts = row.kind === 'audio' ? [null] : row.chunks?.length ? row.chunks : [null];
        let part = 0, nextTime = context.currentTime + .015;
        function showPart(entry) { if (!entry) return; paintWave({ left: entry.buffer.getChannelData(0), right: entry.buffer.getChannelData(1) }); say('Previewing ' + row.name + (parts.length > 1 ? ' · chunk ' + (entry.part + 1) + ' / ' + parts.length : '') + '.'); }
        function playPart() {
          if (token !== previewToken || generation !== getGeneration() || getState() !== startingState || !dialog.open) { if (token === previewToken) stopPreview(); return; }
          if (part >= parts.length) return;
          const raw = rawAsset(row, part), silent = row.kind === 'freeze' && !parts[part]?.main; if (!raw && !silent) throw Error('This recording is no longer in the project.');
          const audio = raw ? decoded(raw, row.kind) : null, frames = audio ? Math.min(audio.left.length, audio.right.length) : parts[part].frames, sampleRate = audio?.sampleRate || row.sampleRate, buffer = context.createBuffer(2, frames, sampleRate); if (audio) { buffer.copyToChannel(audio.left.subarray(0, frames), 0); buffer.copyToChannel(audio.right.subarray(0, frames), 1); }
          const node = context.createBufferSource(), entry = { node, buffer, part: part++ }; node.buffer = buffer; node.connect(context.destination); previewNodes.add(entry); node.onended = () => { if (token !== previewToken) return; node.disconnect(); previewNodes.delete(entry); showPart(previewNodes.values().next().value); try { playPart(); } catch (error) { stopPreview(); say(error.message); return; } if (!previewNodes.size) { stopPreview(); say('Preview finished.'); } }; node.start(nextTime); nextTime += frames / sampleRate;
          if (entry.part === 0) showPart(entry);
        }
        // Keep only the current chunk and one scheduled successor. Their exact
        // sample-time boundary avoids event-loop gaps without joining the take.
        playPart(); if (parts.length > 1) playPart();
        const progress = $('recordingsProgress'); progress.style.transition = 'none'; progress.style.transform = 'scaleX(0)'; void progress.offsetWidth; progress.style.transition = 'transform ' + row.duration + 's linear'; progress.style.transform = 'scaleX(1)';
      } catch (error) { if (token === previewToken) { stopPreview(); say(error.message); } }
    }
    function download() {
      const row = rows.find(row => row.id === selected); if (!row || row.kind !== 'audio') return;
      try {
        const raw = rawAsset(row); if (!raw) throw Error('This recording is no longer in the project.');
        const binary = atob(raw.pcm), bytes = new Uint8Array(binary.length), header = new ArrayBuffer(44), view = new DataView(header); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
        text(0, 'RIFF'); view.setUint32(4, 36 + bytes.length, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, raw.channels, true); view.setUint32(24, raw.sampleRate, true); view.setUint32(28, raw.sampleRate * raw.channels * 2, true); view.setUint16(32, raw.channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes.length, true);
        const url = URL.createObjectURL(new Blob([header, bytes], { type: 'audio/wav' })), anchor = document.createElement('a'); anchor.href = url; anchor.download = row.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100) + '.wav'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); say('Original recording downloaded as a WAV.');
      } catch (error) { say(error.message); }
    }
    const planKey = plan => JSON.stringify([plan.ids, plan.removedSourceIds, plan.removedFreezeIds, plan.clips, plan.unfreezeIds, plan.encodedBytes, plan.savedEncodedBytes]);
    function beginDelete(ids) {
      if (deleting || isBusy()) { say('Finish recording, rendering or saving before deleting project audio.'); return; }
      if (!ids.length) { say('Choose at least one recording.'); return; }
      try { stopPreview(); const plan = M.planDelete(getState(), ids); review = { plan, key: planKey(plan), generation: getGeneration() }; renderReview(); $('recordingsCancelDelete').focus(); } catch (error) { say(error.message); }
    }
    function renderReview() {
      const { plan } = review, chosen = rows.filter(row => plan.ids.includes(row.id)); $('recordingsBrowse').hidden = true; $('recordingsDeleteReview').hidden = false;
      $('recordingsDeleteSummary').innerHTML = `<div class="recordings-delete-size"><strong>${size(plan.savedEncodedBytes)}</strong><span>of audio removed from the next saved project</span></div>${plan.encodedBytes > plan.savedEncodedBytes ? '<p>' + size(plan.encodedBytes - plan.savedEncodedBytes) + ' of additional unused audio will be cleared from this session. Normal Save already omits that unused audio.</p>' : ''}<ul class="recordings-review-list">${chosen.map(row => `<li><strong>${esc(row.name)}</strong><span>${row.kind === 'freeze' ? row.unused ? 'Remove unused frozen audio' : 'Release frozen print' : row.unused ? 'Remove unused recording' : 'Delete recording and its clips'}</span></li>`).join('')}</ul><p>${plan.clipCount ? '<strong>' + plan.clipCount + ' arrangement ' + (plan.clipCount === 1 ? 'clip' : 'clips') + ' will be removed.</strong>' : 'No arrangement clips will be removed.'}</p><p>${plan.unfreezeIds.length ? '<strong>' + plan.unfreezeIds.length + ' ' + (plan.unfreezeIds.length === 1 ? 'track' : 'tracks') + ' will be unfrozen.</strong> Original clips and effect settings remain available except for the recordings being deleted.' : 'No frozen tracks need to be released.'}</p>${plan.tracks.length ? '<p class="recordings-review-tracks">Affected tracks: ' + plan.tracks.map(track => esc(track.name)).join(' · ') + '</p>' : ''}`;
      $('recordingsConfirmDelete').textContent = chosen.length && chosen.every(row => row.kind === 'freeze') ? 'Permanently release audio' : 'Permanently delete'; say('Review the affected clips and tracks before deleting.');
    }
    function cancelDelete() { if (deleting) return; review = null; $('recordingsBrowse').hidden = false; $('recordingsDeleteReview').hidden = true; say('Nothing was deleted.'); $('recordingsDeleteSelected').focus(); }
    async function confirmDelete() {
      if (!review || deleting) return; if (isBusy()) { say('Finish recording, rendering or saving before deleting project audio.'); return; }
      try {
        const fresh = M.planDelete(getState(), review.plan.ids);
        if (review.generation !== getGeneration() || planKey(fresh) !== review.key) { review = { plan: fresh, key: planKey(fresh), generation: getGeneration() }; rows = M.list(getState()); renderReview(); say('The project changed. Check the updated list, then confirm again.'); return; }
        deleting = true; $('recordingsConfirmDelete').disabled = true; $('recordingsCancelDelete').disabled = true; $('closeRecordings').disabled = true; stopPreview(); await onDelete([...fresh.ids], { generation: review.generation, plan: fresh });
        review = null; checked.clear(); selected = null; $('recordingsBrowse').hidden = false; $('recordingsDeleteReview').hidden = true; refresh(); const message = fresh.savedEncodedBytes ? size(fresh.savedEncodedBytes) + ' of audio removed from the next saved project. Save again to keep the smaller file.' : 'Unused audio cleared from this session. Normal Save already omits these recordings.'; say(message); onStatus(message); $('recordingsSearch').focus();
      } catch (error) { say(error.message); }
      finally { deleting = false; $('recordingsConfirmDelete').disabled = false; $('recordingsCancelDelete').disabled = false; $('closeRecordings').disabled = false; selectionState(); }
    }
    function refresh() {
      if (!dialog?.open || destroyed) return; rows = M.list(getState()); const ids = new Set(rows.map(row => row.id)); checked = new Set([...checked].filter(id => ids.has(id))); if (selected && !ids.has(selected)) { stopPreview(); selected = null; } if (!selected && rows.length) selected = rows[0].id; storage(); renderList(); renderPreview();
    }
    function open() { if (destroyed) return; makeDialog(); if (dialog.open) { refresh(); return; } previousFocus = document.activeElement; review = null; $('recordingsBrowse').hidden = false; $('recordingsDeleteReview').hidden = true; dialog.showModal(); refresh(); say('Preview a take, or select audio to review its removal.'); $('recordingsSearch').focus(); }
    function close() { if (deleting) return; stopPreview(); if (dialog?.open) dialog.close(); }
    function destroy() { if (destroyed) return; stopPreview(); dialog?.remove(); dialog = null; rows = []; checked.clear(); review = null; destroyed = true; }
    return { open, close, refresh, destroy, get element() { return dialog; } };
  }
  scope.LoomRecordingsUI = Object.freeze({ create });
})(typeof window === 'undefined' ? globalThis : window);
