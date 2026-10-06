/* Kitchen's shared editable-note library. Standalone, offline, and host-aware. */
(function (global) {
  'use strict';
  if (global.MusicLabPatterns) return;
  const S = global.MusicLabPatternSchema;
  if (!S) throw new Error('Load the Kitchen pattern schema before its library.');
  const MAX_PATTERNS = 128, MAX_BYTES = 16 * 1024 * 1024;
  const appNames = Object.freeze({ GRAIN: 'SIZZLE', TINE: 'CLATTER', FORM: 'HOTPLATE', MIRE: 'REDUCE', SPOOL: 'ROTISSERIE', HAZE: 'STEAM', BOWER: 'SKEWER', RAVEL: 'DICER', FABLE: 'STOCK', ROUX: 'ROUX', PROOF: 'LEAVEN', LOOM: 'GALLEY' });
  const appName = value => appNames[String(value || '').toUpperCase()] || value || 'Kitchen';
  const registrations = new Map(), memory = new Map();
  let databasePromise, persistent = true, dialog, active;
  const uid = () => global.crypto?.randomUUID?.() || 'pattern-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const abortError = () => new DOMException('Pattern exchange cancelled.', 'AbortError');
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 5h18M3 12h18M3 19h18" opacity=".3"/><path d="M4 5h5m3 0h6M7 12h6m3 0h4M4 19h4m4 0h5" stroke-width="3" stroke-linecap="round"/></svg>';
  const button = (text, action, primary) => '<button type="button" class="ml-pat-button' + (primary ? ' ml-pat-primary' : '') + '" data-action="' + action + '">' + text + '</button>';
  const hostLibrary = () => global.MusicLabHost?.patternLibrary;
  const bytes = value => new TextEncoder().encode(JSON.stringify(value)).length;
  function metadata(record) {
    return { id: record.id, createdAt: record.createdAt, name: record.name, sourceApp: record.sourceApp, tempo: record.tempo, swing: record.swing, lengthBeats: record.lengthBeats, meter: record.meter, kind: record.kind || 'notes', notes: record.notes.length, voices: record.voices.length, tags: record.tags, bytes: record.bytes };
  }
  function database() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      if (!global.indexedDB) return reject(new Error('Browser storage is unavailable.'));
      let request;
      try { request = global.indexedDB.open('musiclab-patterns-v1', 1); } catch (error) { return reject(error); }
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('patterns')) request.result.createObjectStore('patterns', { keyPath: 'id' }); };
      request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => reject(request.error || new Error('Could not open the pattern library.'));
      request.onblocked = () => reject(new Error('Close an older Kitchen tab to unlock the pattern library.'));
    }).catch(() => { persistent = false; return null; });
    return databasePromise;
  }
  async function read(method, key) {
    const db = await database();
    if (!db) return method === 'getAll' ? [...memory.values()] : memory.get(key);
    return new Promise((resolve, reject) => {
      const tx = db.transaction('patterns', 'readonly'), store = tx.objectStore('patterns'), request = key === undefined ? store[method]() : store[method](key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
  }
  async function list() {
    const host = hostLibrary(), values = host?.list ? await host.list() : (await read('getAll')).map(metadata);
    return values.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
  async function get(id) { const host = hostLibrary(); const value = host?.get ? await host.get(String(id)) : await read('get', String(id)); return value ? JSON.parse(JSON.stringify(value)) : value; }
  async function save(value) {
    const pattern = S.normalize(value), host = hostLibrary();
    if (host?.save) return host.save(pattern);
    const record = { ...pattern, id: uid(), createdAt: Date.now(), bytes: bytes(pattern) }, db = await database();
    function quota(items) {
      if (items.length >= MAX_PATTERNS || items.reduce((total, item) => total + (item.bytes || 0), 0) + record.bytes > MAX_BYTES) throw new Error('The pattern library is full (128 patterns / 16 MiB). Delete an entry or download this pattern.');
    }
    if (!db) { quota([...memory.values()]); memory.set(record.id, record); return metadata(record); }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('patterns', 'readwrite'), store = tx.objectStore('patterns'), request = store.getAll();
      let error;
      request.onsuccess = () => { try { quota(request.result); store.put(record); } catch (problem) { error = problem; tx.abort(); } };
      tx.oncomplete = () => resolve(metadata(record));
      tx.onerror = tx.onabort = () => reject(error || tx.error || new Error('Could not save this pattern. Download a portable file instead.'));
    });
  }
  async function remove(id) {
    const host = hostLibrary(); if (host?.remove) return host.remove(String(id));
    const db = await database(); if (!db) { memory.delete(String(id)); return; }
    return new Promise((resolve, reject) => { const tx = db.transaction('patterns', 'readwrite'); tx.objectStore('patterns').delete(String(id)); tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(tx.error); });
  }
  function still(token) { return active?.token === token && !active.controller.signal.aborted; }
  const query = selector => dialog.querySelector(selector);
  function message(text, error) { if (!dialog) return; const line = query('.ml-pat-status'); line.textContent = text; line.classList.toggle('ml-pat-error', Boolean(error)); }
  function storageNote() {
    const keeps = hostLibrary()?.persistent ?? persistent;
    query('.ml-pat-storage').textContent = global.location?.protocol === 'file:' ? 'Offline files may use separate libraries. Download a pattern file to move notes between them.' : keeps ? 'Saved in this browser. All Kitchen apps on this site share this library.' : 'Storage is unavailable. This library lasts until the page closes; download patterns to keep them.';
  }
  function ensureDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog'); dialog.className = 'ml-pat-dialog'; dialog.setAttribute('aria-labelledby', 'ml-pat-title');
    dialog.innerHTML = '<div class="ml-pat-shell"><header class="ml-pat-header"><div><span class="ml-pat-eyebrow">KITCHEN / EDITABLE PARTS</span><h2 id="ml-pat-title">The order book.</h2><p>Notes, timing, and touch. Filed for the next peculiar service.</p></div>' + button('×', 'close') + '</header><nav class="ml-pat-tabs" aria-label="Pattern exchange"><button type="button" data-tab="library" aria-selected="true">Library <span class="ml-pat-count">0</span></button><button type="button" data-tab="send" aria-selected="false">Send pattern</button><button type="button" data-tab="receive" aria-selected="false">Receive pattern</button></nav><main class="ml-pat-main">' +
      '<section data-panel="library"><div class="ml-pat-library-head"><input type="search" name="search" aria-label="Search note patterns" placeholder="Find a phrase, app, or tag…">' + button('Refresh', 'refresh') + '</div><div class="ml-pat-library"></div><p class="ml-pat-capacity"></p></section>' +
      '<section data-panel="send" hidden><div class="ml-pat-imported-part" hidden><p></p>' + button('Use native sequence', 'native') + '</div><div class="ml-pat-intro"><span>' + icon + '</span><div><h3>Write down the special.</h3><p>Share editable notes rather than a recording. The receiving instrument supplies the sound.</p></div></div><div class="ml-pat-fields"><label>Source<select name="scope"></select></label><label>Pattern name<input name="export-name" maxlength="160" placeholder="A name for this phrase"></label></div><p class="ml-pat-export-hint"></p><div class="ml-pat-actions">' + button('Read current pattern', 'export', true) + '</div><div class="ml-pat-exported" hidden><div class="ml-pat-preview" data-preview="exported"></div><p class="ml-pat-export-meta"></p><div class="ml-pat-actions">' + button('Save to library', 'save-exported', true) + button('↓ Pattern file', 'download-exported') + '<button type="button" class="ml-pat-button" data-action="loom-exported" hidden>Add to GALLEY</button></div></div></section>' +
      '<section data-panel="receive" hidden><label class="ml-pat-file">＋ Choose a note-pattern file<input type="file" name="file" accept=".json,.musiclab-pattern.json,application/json"></label><p class="ml-pat-receive-empty">Choose a pattern from the Library or open a portable pattern file.</p><div class="ml-pat-incoming" hidden><div class="ml-pat-preview" data-preview="incoming"></div><p class="ml-pat-incoming-meta"></p><div class="ml-pat-destination"><label>Destination<select name="target"></select></label><p class="ml-pat-import-hint"></p><div class="ml-pat-actions"><button type="button" class="ml-pat-button" data-action="prepare-target" hidden>Load instrument voices</button></div><div class="ml-pat-mapping"></div><label class="ml-pat-replace"><input name="replace" type="checkbox"> Replace the notes currently in this destination</label><div class="ml-pat-actions">' + button('Receive pattern', 'receive', true) + button('Save to library', 'save-incoming') + button('↓ Pattern file', 'download-incoming') + '<button type="button" class="ml-pat-button" data-action="loom-incoming" hidden>Add to GALLEY</button></div></div></div></section></main><footer class="ml-pat-footer"><p class="ml-pat-storage"></p><p class="ml-pat-status" role="status" aria-live="polite"></p></footer></div>';
    document.body.append(dialog);
    query('[data-action="close"]').setAttribute('aria-label', 'Close pattern exchange');
    dialog.addEventListener('click', event => {
      const tab = event.target.closest('[data-tab]'); if (tab) switchTab(tab.dataset.tab);
      const action = event.target.closest('[data-action]'); if (action && !action.disabled) act(action.dataset.action, action);
      const selected = event.target.closest('[data-pattern-id]'); if (selected) choose(selected.dataset.patternId);
      if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { if (!dialog.open) { active?.controller.abort(); active = null; } });
    dialog.addEventListener('keydown', event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); close(); } });
    query('[name="search"]').addEventListener('input', drawLibrary);
    query('[name="target"]').addEventListener('change', () => { query('[name="replace"]').checked = false; updateTarget(); });
    query('[name="scope"]').addEventListener('change', exportHint);
    query('[name="file"]').addEventListener('change', async event => {
      const file = event.target.files[0], token = active?.token; if (!file) return;
      try { if (file.size > S.MAX_BYTES) throw new Error('Choose a note-pattern file smaller than 1 MiB.'); const pattern = S.parse(await file.text()); if (still(token)) { setIncoming(pattern); message('Choose a destination and review the source voices.'); } }
      catch (error) { if (still(token)) message(error.message, true); }
      event.target.value = '';
    });
  }
  function spec() { const value = active.adapter.patternImport; return typeof value === 'function' ? value() || {} : value || {}; }
  function fillTargets(keepTarget) {
    const value = spec(), targets = typeof value.targets === 'function' ? value.targets() : value.targets;
    active.targets = Array.isArray(targets) && targets.length ? targets.slice() : [{ id: 'default', name: 'Current pattern', occupied: false }];
    query('[name="target"]').innerHTML = active.targets.map((target, index) => '<option value="' + index + '">' + escape(target.name || target.id) + (target.occupied ? ' · contains notes' : '') + '</option>').join('');
    const selected = active.targets.findIndex(item => item.id === keepTarget);
    query('[name="target"]').value = String(selected < 0 ? 0 : selected); updateTarget();
  }
  function target() { return active.targets[Number(query('[name="target"]').value)] || active.targets[0]; }
  function updateTarget() {
    if (!active) return;
    const value = spec(), destination = target(), capable = typeof active.adapter.importPattern === 'function';
    query('.ml-pat-replace').hidden = !destination?.occupied || value.mode === 'append';
    query('.ml-pat-import-hint').textContent = capable ? value.description || (value.mode === 'append' ? 'Adds an editable note clip. Existing clips remain in the arrangement.' : 'The instrument keeps its sound and receives this musical part.') : 'This instrument does not accept editable notes. Save this part and open it in GALLEY or a compatible instrument.';
    query('[data-action="receive"]').hidden = !capable;
    const voices = destination?.voices || (typeof value.voices === 'function' ? value.voices(destination?.id) : value.voices);
    active.destinationVoices = Array.isArray(voices) ? voices.slice() : [];
    const strictMapping = value.mode === 'drums' || value.requiresVoiceMap || active.incoming?.kind === 'drums';
    const needsMapping = active.incoming && active.destinationVoices.length && (strictMapping || active.destinationVoices.length > 1);
    query('[data-action="prepare-target"]').hidden = typeof active.adapter.prepareTarget !== 'function';
    query('.ml-pat-mapping').innerHTML = needsMapping ? '<h4>Match the source voices</h4><p>Choose the sound for every source lane. Pitches and timing remain editable.</p>' + active.incoming.voices.map((voice, index) => '<label><span>' + escape(voice.name) + '</span><select data-map-index="' + index + '"><option value="">Choose a destination voice…</option>' + active.destinationVoices.map((dest, destIndex) => '<option value="' + destIndex + '"' + (!strictMapping && (String(dest.id) === voice.id || destIndex === 0 && !active.destinationVoices.some(candidate => String(candidate.id) === voice.id)) ? ' selected' : '') + '>' + escape(dest.name || dest.id) + '</option>').join('') + '</select></label>').join('') : '';
  }
  function importedHint() {
    const value = active.adapter.getImportedPattern?.() || active.adapter.importedPattern;
    const area = query('.ml-pat-imported-part');
    area.hidden = !value || typeof active.adapter.clearImportedPattern !== 'function';
    if (value) area.querySelector('p').textContent = 'Received part: ' + (value.name || 'Imported pattern') + ' · ' + value.lengthBeats + ' beats. Its exact notes take precedence over the native sequence.';
  }
  function exportHint() {
    const current = active.scopes.find(scope => String(scope.id) === query('[name="scope"]').value);
    query('.ml-pat-export-hint').textContent = current?.description || active.adapter.patternExport?.description || 'Exports notes, beat timing, velocity, and source voice names. Instrument patches are kept separately.';
  }
  async function open(id) {
    const registration = registrations.get(String(id)); if (!registration) throw new Error('This app has not registered pattern exchange.');
    const adapter = await registration.getAdapter(); if (!adapter) throw new Error('This instrument is still opening. Try Patterns again in a moment.');
    close(); ensureDialog();
    active = { id: String(id), registration, adapter, token: {}, controller: new AbortController(), entries: [], incoming: null, exported: null, busy: false, targets: [] };
    dialog.style.setProperty('--ml-pat-accent', registration.accent || '#ff8d45');
    query('[name="search"]').value = ''; query('[name="export-name"]').value = ''; query('[name="replace"]').checked = false;
    query('.ml-pat-exported').hidden = true; query('.ml-pat-incoming').hidden = true; query('.ml-pat-receive-empty').hidden = false;
    dialog.querySelectorAll('[data-action]').forEach(element => { element.disabled = false; });
    const exportSpec = typeof adapter.patternExport === 'function' ? adapter.patternExport() : adapter.patternExport;
    active.scopes = exportSpec?.scopes || [{ id: 'pattern', label: 'Current pattern' }];
    query('[name="scope"]').innerHTML = active.scopes.map(scope => '<option value="' + escape(scope.id) + '">' + escape(scope.label || scope.name || scope.id) + '</option>').join('');
    query('[data-tab="send"]').disabled = typeof adapter.exportPattern !== 'function';
    dialog.querySelectorAll('[data-action^="loom-"]').forEach(element => { element.hidden = typeof global.MusicLabHost?.importPattern !== 'function'; });
    fillTargets(); exportHint(); importedHint(); message('');
    if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
    const token = active.token; switchTab('library'); if (!hostLibrary()) await database(); if (still(token)) storageNote();
  }
  function close() { active?.controller.abort(); if (dialog?.open) dialog.close(); active = null; }
  function switchTab(name) {
    if (!active) return;
    dialog.querySelectorAll('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === name)));
    dialog.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
    if (name === 'library') refresh();
  }
  async function refresh() {
    const token = active?.token; if (!token) return;
    try { const entries = await list(); if (still(token)) { active.entries = entries; drawLibrary(); storageNote(); } }
    catch (error) { if (still(token)) message(error.message, true); }
  }
  function drawLibrary() {
    if (!active) return;
    const search = query('[name="search"]').value.trim().toLowerCase(), entries = active.entries.filter(item => [item.name, item.sourceApp, appName(item.sourceApp), ...(item.tags || [])].join(' ').toLowerCase().includes(search));
    query('.ml-pat-count').textContent = active.entries.length;
    query('.ml-pat-library').innerHTML = entries.length ? entries.map(item => '<div class="ml-pat-row"><button class="ml-pat-entry" type="button" data-pattern-id="' + escape(item.id) + '"><span class="ml-pat-entry-icon">' + icon + '</span><span><strong>' + escape(item.name) + '</strong><small>' + escape(appName(item.sourceApp)) + ' · ' + item.notes + ' notes · ' + item.lengthBeats + ' beats · ' + Math.round(item.tempo) + ' BPM</small></span><b>↗</b></button><button class="ml-pat-delete" type="button" data-action="delete" data-id="' + escape(item.id) + '" aria-label="Delete ' + escape(item.name) + '">×</button></div>').join('') : '<div class="ml-pat-empty">' + icon + '<h3>' + (search ? 'No phrases by that name.' : 'No orders on the rail.') + '</h3><p>' + (search ? 'Try an instrument name or another tag.' : 'Read an instrument’s current pattern, then save it here. Other apps can borrow its notes.') + '</p></div>';
    query('.ml-pat-capacity').textContent = active.entries.length + ' / ' + MAX_PATTERNS + ' patterns · ' + (active.entries.reduce((total, item) => total + (item.bytes || 0), 0) / 1048576).toFixed(2) + ' / 16 MiB';
  }
  async function choose(id) {
    const token = active?.token; message('Opening pattern…');
    try { const value = await get(id); if (still(token)) { if (!value) throw new Error('This pattern was removed in another tab. Refresh the library.'); setIncoming(S.normalize(value)); switchTab('receive'); message('Choose a destination and review the source voices.'); } }
    catch (error) { if (still(token)) message(error.message, true); }
  }
  function summary(pattern) { return pattern.notes.length + ' notes · ' + pattern.lengthBeats + ' beats · ' + pattern.voices.length + ' source ' + (pattern.voices.length === 1 ? 'voice' : 'voices') + ' · ' + Math.round(pattern.tempo) + ' BPM'; }
  function preview(pattern, selector) {
    const area = query(selector), voices = new Map(pattern.voices.map((voice, index) => [voice.id, index]));
    const pitches = pattern.notes.map(note => note.pitch), low = pitches.length ? Math.max(0, Math.min(...pitches) - 2) : 48;
    const range = pitches.length ? Math.max(12, Math.min(127, Math.max(...pitches) + 2) - low + 1) : 24, high = low + range - 1;
    const drumLanes = pattern.kind === 'drums';
    const shown = pattern.notes;
    area.innerHTML = '<svg viewBox="0 0 640 128" preserveAspectRatio="none" role="img" aria-label="Editable note pattern: ' + escape(summary(pattern)) + '"><defs><pattern id="ml-pat-grid-' + selector.replace(/\W/g, '') + '" width="' + (640 * 4 / pattern.lengthBeats) + '" height="16" patternUnits="userSpaceOnUse"><path d="M0 0H640M0 0V128" stroke="currentColor" opacity=".1"/></pattern></defs><rect width="640" height="128" fill="url(#ml-pat-grid-' + selector.replace(/\W/g, '') + ')"/>' + shown.map(note => { const x = note.beat / pattern.lengthBeats * 640, y = drumLanes ? ((voices.get(note.voice) || 0) + .5) / Math.max(1, voices.size) * 112 : (high - note.pitch) / range * 112 + 5, width = Math.max(2, note.duration / pattern.lengthBeats * 640), phase = (voices.get(note.voice) || 0) % 4; return '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + width.toFixed(2) + '" height="' + (drumLanes ? Math.max(2, Math.min(12, 72 / Math.max(1, voices.size))) : Math.max(2, Math.min(8, 100 / range))).toFixed(2) + '" rx="1" fill="currentColor" opacity="' + (.3 + note.velocity * .65).toFixed(2) + '" class="ml-pat-note-' + phase + '"/>'; }).join('') + '</svg>';
  }
  function setIncoming(value) {
    active.incoming = S.normalize(value); query('.ml-pat-incoming').hidden = false; query('.ml-pat-receive-empty').hidden = true;
    query('.ml-pat-incoming-meta').textContent = active.incoming.name + ' · ' + summary(active.incoming);
    query('[name="replace"]').checked = false; fillTargets(); preview(active.incoming, '[data-preview="incoming"]');
  }
  function download(pattern) {
    const value = S.normalize(pattern), blob = new Blob([S.serialize(value)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = (value.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 100) || 'Kitchen pattern') + '.musiclab-pattern.json';
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function act(action, element) {
    if (!active) return;
    if (action === 'close') return close(); if (action === 'refresh') return refresh();
    const token = active.token;
    if (action === 'delete') {
      if (!element.dataset.confirmed) { element.dataset.confirmed = 'yes'; element.textContent = 'Delete?'; element.classList.add('ml-pat-delete-confirm'); return; }
      element.disabled = true;
      try { await remove(element.dataset.id); if (still(token)) { message('Pattern removed from the library. Imported copies are kept.'); await refresh(); } } catch (error) { if (still(token)) { element.disabled = false; message(error.message, true); } }
      return;
    }
    if (active.busy) return;
    active.busy = true; element.disabled = true;
    try {
      if (action === 'native') {
        await active.adapter.clearImportedPattern(); if (!still(token)) throw abortError(); importedHint(); message('Native sequence restored. The instrument patch is kept.'); global.MusicLabHost?.notifyStateChange?.();
      } else if (action === 'prepare-target') {
        if (!active.incoming) throw new Error('Choose a pattern first.');
        const selected = target()?.id; message('Loading this track’s instrument voices…');
        await active.adapter.prepareTarget({ target: selected, pattern: S.normalize(active.incoming), signal: active.controller.signal });
        if (!still(token)) throw abortError(); fillTargets(selected); message('Instrument voices loaded. Review the source-voice assignments.');
      } else if (action === 'export') {
        message('Reading editable notes…');
        const value = await active.adapter.exportPattern({ scope: query('[name="scope"]').value, signal: active.controller.signal });
        if (!still(token)) throw abortError();
        const pattern = S.normalize(value), name = query('[name="export-name"]').value.trim(); if (name) pattern.name = name;
        active.exported = S.normalize(pattern); preview(active.exported, '[data-preview="exported"]'); query('.ml-pat-exported').hidden = false; query('.ml-pat-export-meta').textContent = active.exported.name + ' · ' + summary(active.exported); message('Notes are ready to share.');
      } else if (action.startsWith('save-')) {
        const pattern = action === 'save-exported' ? active.exported : active.incoming; if (!pattern) throw new Error('Choose or read a pattern first.');
        await save(pattern); if (!still(token)) throw abortError(); message('“' + pattern.name + '” saved to the shared pattern library.'); await refresh();
      } else if (action.startsWith('download-')) {
        const pattern = action === 'download-exported' ? active.exported : active.incoming; if (!pattern) throw new Error('Choose or read a pattern first.'); download(pattern); message('Portable note pattern downloaded.');
      } else if (action.startsWith('loom-')) {
        const pattern = action === 'loom-exported' ? active.exported : active.incoming; if (!pattern) throw new Error('Choose or read a pattern first.');
        await global.MusicLabHost.importPattern(S.normalize(pattern), { signal: active.controller.signal }); if (!still(token)) throw abortError(); message('Editable note clip added to GALLEY.');
      } else if (action === 'receive') {
        if (!active.incoming) throw new Error('Choose a note pattern first.');
        const destination = target(), value = spec(), replace = query('[name="replace"]').checked;
        if (destination?.occupied && value.mode !== 'append' && !replace) throw new Error('Confirm replacement of this destination’s existing notes.');
        const voiceMap = Object.create(null);
        for (const field of dialog.querySelectorAll('[data-map-index]')) {
          if (field.value === '') throw new Error('Choose a destination voice for every source lane.');
          voiceMap[active.incoming.voices[Number(field.dataset.mapIndex)].id] = active.destinationVoices[Number(field.value)].id;
        }
        const result = await active.adapter.importPattern({ pattern: S.normalize(active.incoming), options: { target: destination?.id, voiceMap, replace, signal: active.controller.signal }, signal: active.controller.signal });
        if (!still(token)) throw abortError(); if (result === false) throw new Error('The instrument did not accept this note pattern.');
        fillTargets(); importedHint(); message('“' + active.incoming.name + '” received. The instrument supplies the sound.'); global.MusicLabHost?.notifyStateChange?.();
      }
    } catch (error) { if (error.name !== 'AbortError' && still(token)) message(error.message || 'Could not complete pattern exchange.', true); }
    finally { if (still(token)) { active.busy = false; element.disabled = false; } }
  }
  function register(options) {
    if (!options?.id || typeof options.getAdapter !== 'function') throw new TypeError('Pattern exchange registration needs id and getAdapter.');
    const id = String(options.id); registrations.set(id, options);
    function mount() {
      let launcher = document.querySelector('[data-musiclab-patterns="' + CSS.escape(id) + '"]');
      if (!launcher) {
        launcher = document.createElement('button'); launcher.type = 'button'; launcher.className = 'ml-pat-launcher'; launcher.dataset.musiclabPatterns = id; launcher.style.setProperty('--ml-pat-accent', options.accent || '#ff8d45'); launcher.innerHTML = icon + ' Patterns'; launcher.setAttribute('aria-label', 'Open shared note-pattern library');
        launcher.addEventListener('click', () => open(id).catch(error => { launcher.title = error.message; console.error(error); }));
      }
      const destination = options.mountSelector ? document.querySelector(options.mountSelector) : null;
      if (destination) { launcher.classList.remove('ml-pat-floating'); destination.append(launcher); } else { launcher.classList.add('ml-pat-floating'); document.body.append(launcher); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
    document.addEventListener('musiclab:app-ready', mount);
    return { open: () => open(id), dispose: () => { registrations.delete(id); document.querySelector('[data-musiclab-patterns="' + CSS.escape(id) + '"]')?.remove(); if (active?.id === id) close(); } };
  }
  global.addEventListener('pagehide', close);
  global.MusicLabPatterns = Object.freeze({ version: 1, MAX_PATTERNS, MAX_BYTES, register, open, close, list, get, save, remove, normalizePattern: S.normalize, patternFromJSON: S.parse, download, get persistent() { return hostLibrary()?.persistent ?? persistent; } });
})(window);
