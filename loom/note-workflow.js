/* Editable musical parts and source-aware printing, within GALLEY's eight tracks. */
(() => {
  'use strict';
  const S = window.LoomSchema, P = window.MusicLabPatternSchema;
  const copy = value => S.copy(value);
  const sourceInstrument = sourceApp => {
    const id = typeof sourceApp === 'string' ? sourceApp.trim().toLowerCase() : '';
    return S.BUILT_INS.includes(id) ? id : 'fable';
  };
  const abortError = () => new DOMException('Source rendering canceled.', 'AbortError');
  const clipSignature = clip => {
    const value = copy(clip), snapshot = value.origin?.instrument?.snapshot;
    if (snapshot?.state != null) delete snapshot.storage;
    return JSON.stringify(value);
  };
  class LoomNoteWorkflow {
    constructor(options) {
      Object.assign(this, options);
      this.sourceEdit = null; this.operation = 0; this.controller = null;
      const actions = document.querySelector('.selection-toolbar > div');
      if (actions && !document.getElementById('restoreNotesButton')) {
        const button = document.createElement('button'); button.id = 'restoreNotesButton'; button.textContent = 'Restore notes'; button.hidden = true; actions.append(button);
      }
      if (actions && !document.getElementById('cancelNoteRenderButton')) {
        const button = document.createElement('button'); button.id = 'cancelNoteRenderButton'; button.textContent = 'Cancel source render'; button.hidden = true; actions.append(button);
      }
      if (actions && !document.getElementById('sourcePatternButton')) {
        const button = document.createElement('button'); button.id = 'sourcePatternButton'; button.textContent = 'Use instrument pattern'; button.title = 'Replace source notes with the instrument’s current sequence. Undo restores the previous part.'; button.hidden = true; actions.append(button);
      }
      for (const [id, action] of [['createNoteClipButton', () => this.create()], ['editNotesButton', () => this.editNotes()], ['printNoteClipButton', () => this.print()], ['editSourceButton', () => this.editSource()], ['updateAudioButton', () => this.update()], ['restoreNotesButton', () => this.restoreNotes()], ['cancelNoteRenderButton', () => this.cancel()], ['sourcePatternButton', () => this.adoptInstrumentPattern()]]) {
        document.getElementById(id)?.addEventListener('click', () => Promise.resolve().then(action).catch(error => this.status(error.name === 'AbortError' ? 'Source rendering canceled.' : error.message)));
      }
    }
    location() { return this.getLocation(); }
    voices(trackId) { return this.host.getPatternAdapter?.(trackId)?.notes?.voices || []; }
    render() {
      const location = this.location(), clip = location?.clip, notes = clip?.type === 'notes', source = !!clip?.origin;
      if (this.sourceEdit && (!source || this.sourceEdit.id !== clip.id)) {
        const draft = this.sourceEdit, generation = this.getGeneration(); this.sourceEdit = null;
        this.host.snapshot(draft.trackId).then(snapshot => { if (generation === this.getGeneration()) { this.captureSnapshot(draft.trackId, snapshot, draft.id); } }).catch(error => this.status(error.message));
      }
      for (const [id, visible] of [['editNotesButton', notes], ['printNoteClipButton', notes], ['editSourceButton', source], ['updateAudioButton', source], ['restoreNotesButton', source]]) {
        const button = document.getElementById(id); if (button) { button.hidden = !visible; button.disabled = !!this.controller; }
      }
      const cancel = document.getElementById('cancelNoteRenderButton'); if (cancel) cancel.hidden = !this.controller;
      const sourcePattern = document.getElementById('sourcePatternButton'); if (sourcePattern) { sourcePattern.hidden = !(source && this.sourceEdit?.id === clip.id); sourcePattern.disabled = !!this.controller; }
      for (const [action, visible] of [['notes', notes], ['print', notes], ['source', source], ['update', source]]) for (const button of document.querySelectorAll('[data-clip-action="' + action + '"]')) button.hidden = !visible;
      this.piano?.render();
    }
    getEditableClip() {
      const location = this.location(); if (!location) return null;
      if (location.clip.type === 'notes') return { trackIndex: this.getState().tracks.indexOf(location.track), clip: location.clip };
      if (this.sourceEdit?.id === location.clip.id && location.clip.origin) {
        const origin = location.clip.origin;
        this.sourceEdit.clip.pattern = origin.pattern; this.sourceEdit.clip.voiceMap = origin.voiceMap;
        return { trackIndex: this.getState().tracks.indexOf(location.track), clip: this.sourceEdit.clip };
      }
      return null;
    }
    pianoChanged() {
      const location = this.location(); if (this.sourceEdit?.id === location?.clip.id && location.clip.origin) {
        const origin = location.clip.origin; origin.pattern = P.normalize(this.sourceEdit.clip.pattern); origin.voiceMap = copy(this.sourceEdit.clip.voiceMap || {});
        origin.sourceClip = S.noteClip({ ...copy(this.sourceEdit.clip), id: origin.sourceClip.id, name: origin.sourceClip.name, pattern: copy(origin.pattern), voiceMap: copy(origin.voiceMap) }, 256, true);
      }
      this.changed({ arrangement: true, inspector: true, notes: true });
    }
    captureSnapshot(trackId, snapshot, sourceId = this.sourceEdit?.id) {
      const track = this.getState().tracks.find(track => track.id === trackId), clip = track?.clips.find(clip => clip.id === sourceId);
      if (snapshot && clip?.origin && track.instrument?.id === snapshot.app) {
        clip.origin.instrument = { ...copy(track.instrument), snapshot: copy(snapshot) };
      }
    }
    async prepareTarget({ target, pattern, signal } = {}) {
      if (signal?.aborted) throw abortError();
      const current = this.getState(), t = current.tracks.find(track => track.id === String(target || current.tracks[current.selectedTrack].id));
      if (!t) throw Error('Choose one of the eight tracks.');
      if (!t.instrument) {
        const id = sourceInstrument(pattern?.sourceApp), candidate = copy(current);
        candidate.tracks[current.tracks.indexOf(t)].instrument = { id, name: S.INSTRUMENT_NAMES[id] || id.toUpperCase() };
        this.commit(S.normalize(candidate), { trackIndex: current.tracks.indexOf(t) });
      }
      const actual = this.getState().tracks.find(track => track.id === t.id); await this.ensureInstrument(actual);
      if (signal?.aborted) throw abortError();
      await this.host.command(actual.id, 'prepare'); return this.patternImport;
    }
    get patternImport() {
      const current = this.getState();
      return { mode: 'notes', description: 'Append an editable note clip. Load destination voices to map drum parts.', targets: current.tracks.map(t => ({ id: t.id, name: t.name + ' · new note clip', occupied: false, voices: copy(this.voices(t.id)) })), voices: copy(this.voices(current.tracks[current.selectedTrack].id)) };
    }
    async importPattern({ pattern, options = {}, signal } = {}) {
      const packet = P.normalize(pattern); if (signal?.aborted || options.signal?.aborted) throw abortError();
      const current = this.getState(), candidate = copy(current), index = candidate.tracks.findIndex(t => t.id === String(options.target || current.tracks[current.selectedTrack].id));
      if (index < 0) throw Error('Choose one of the eight tracks.'); const t = candidate.tracks[index];
      if (t.clips.length >= 128) throw Error('This track has reached its 128-clip limit.');
      if (!t.instrument) { const id = sourceInstrument(packet.sourceApp); t.instrument = { id, name: S.INSTRUMENT_NAMES[id] || id.toUpperCase() }; }
      const start = Math.max(0, Math.min(candidate.lengthBars * 4 - .25, this.snap(this.engine.getMeters().beat || 0))), id = S.uid('notes');
      const clip = { id, name: packet.name, type: 'notes', pattern: packet, voiceMap: S.voiceMap(options.voiceMap || {}, packet), start, length: Math.min(packet.lengthBeats, candidate.lengthBars * 4 - start), sourceOffset: 0, rate: 1, loop: false, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 };
      t.clips.push(clip); const normalized = S.normalize(candidate);
      if (signal?.aborted || options.signal?.aborted) throw abortError(); this.commit(normalized, { selected: id, trackIndex: index }); this.piano?.open();
      this.status('Pattern received as an editable note clip. Map destination voices in the piano roll when needed.');
      this.ensureInstrument(this.getState().tracks[index]).then(() => this.render()).catch(error => this.status(error.message)); return { trackId: t.id, clipId: id };
    }
    async create() {
      const current = this.getState(), target = current.tracks[current.selectedTrack].id, generation = this.getGeneration();
      await this.prepareTarget({ target });
      if (generation !== this.getGeneration()) throw abortError();
      const available = this.voices(target), adapter = this.host.getPatternAdapter(target), pitched = adapter?.notes?.pitched !== false && (!adapter?.patternImport?.mode || adapter.patternImport.mode === 'notes');
      const chosen = pitched || available.length > 32 ? available.slice(0, 1) : available.slice(0, 64);
      const initialVoices = chosen.length ? chosen.map(v => ({ id: v.id, name: v.name, pitch: v.pitch ?? 60 })) : [{ id: 'main', name: 'Notes', pitch: 60 }];
      const packet = P.normalize({ format: 'musiclab-pattern', version: 1, name: 'Untested special', sourceApp: 'loom', kind: pitched ? 'notes' : 'drums', tempo: this.getState().tempo, swing: 0, lengthBeats: 16, meter: [4, 4], voices: initialVoices, notes: [], seed: 170519 });
      return this.importPattern({ pattern: packet, options: { target, voiceMap: Object.fromEntries(initialVoices.map(voice => [voice.id, voice.id])) } });
    }
    async editNotes() {
      const location = this.location(); if (location?.clip.type !== 'notes') return;
      await this.ensureInstrument(location.track); this.sourceEdit = null; this.piano?.open(); this.render();
    }
    async exportPattern({ scope = 'clip' } = {}) {
      const location = this.location(); if (scope === 'clip') {
        const pattern = location?.clip.type === 'notes' ? location.clip.pattern : location?.clip.origin?.pattern;
        if (!pattern) throw Error('Select a note clip or a printed clip with a source.'); return P.normalize(copy(pattern));
      }
      const t = this.getState().tracks[this.getState().selectedTrack]; if (!t.instrument) throw Error('Choose an instrument on the selected track.'); await this.ensureInstrument(t); return this.host.exportPattern(t.id);
    }
    cancel() { ++this.operation; this.controller?.abort(); this.controller = null; this.render(); }
    async _render(update) {
      if (this.controller) throw Error('Finish or cancel the current source render.');
      const location = this.location(); if (!location || (update ? !location.clip.origin : location.clip.type !== 'notes')) return;
      const generation = this.getGeneration(), operation = ++this.operation, controller = new AbortController(); this.controller = controller; this.render();
      const originalId = location.clip.id, originalTrackId = location.track.id;
      try {
        let instrument;
        if (!update || this.sourceEdit?.id === originalId) {
          await this.ensureInstrument(location.track); const snapshot = await this.host.snapshot(originalTrackId);
          if (generation !== this.getGeneration() || operation !== this.operation || controller.signal.aborted) throw abortError();
          instrument = { ...copy(location.track.instrument), ...(snapshot ? { snapshot } : {}) };
          if (update) this.captureSnapshot(originalTrackId, snapshot, originalId);
        }
        const current = this.getState(), t = current.tracks.find(t => t.id === originalTrackId), c = t?.clips.find(c => c.id === originalId);
        if (!c || generation !== this.getGeneration() || controller.signal.aborted) throw abortError();
        const signature = clipSignature(c), request = { instrument, signal: controller.signal, onProgress: progress => this.status('Rendering source · ' + Math.round(progress * 100) + '%') };
        const result = await this.renderer[update ? 'update' : 'print'](copy(current), originalTrackId, originalId, request);
        const latest = this.getState(), actualTrack = latest.tracks.find(t => t.id === originalTrackId), actual = actualTrack?.clips.find(c => c.id === originalId);
        if (!actual || signature !== clipSignature(actual) || generation !== this.getGeneration() || operation !== this.operation || controller.signal.aborted) throw abortError();
        const candidate = copy(latest), target = candidate.tracks.find(t => t.id === originalTrackId), position = target.clips.findIndex(c => c.id === originalId);
        candidate.assets.push(result.asset);
        if (update) target.clips[position] = { ...copy(actual), assetId: result.asset.id, origin: result.origin };
        else target.clips[position] = { ...result.clip, id: originalId, name: actual.name, origin: result.origin, type: 'audio', assetId: result.asset.id };
        const normalized = S.normalize(S.pruneAssets(candidate)); this.commit(normalized, { selected: originalId, trackIndex: latest.tracks.indexOf(actualTrack) }); this.sourceEdit = null;
        this.piano?.close(); this.status(update ? 'Source audio updated. Arrangement, clip edits, and track effects are preserved.' : 'Notes printed to audio. Edit source or Restore notes to revise the part.');
        return { trackId: originalTrackId, clipId: originalId, assetId: result.asset.id };
      } finally { if (this.controller === controller) this.controller = null; this.render(); }
    }
    print() { return this._render(false); }
    update() { return this._render(true); }
    async editSource() {
      const location = this.location(); if (!location?.clip.origin) return; const generation = this.getGeneration(), { clip, track } = location, origin = copy(clip.origin);
      if (this.engine.getMeters().playing) await this.pause();
      await this.ensureInstrument(track, { open: true, replace: true, descriptor: copy(origin.instrument) });
      const current = this.location(); if (generation !== this.getGeneration() || current?.clip.id !== clip.id || current.track.id !== track.id) return;
      this.sourceEdit = { id: clip.id, trackId: track.id, clip: { ...copy(origin.sourceClip), id: 'source-' + clip.id, name: clip.name + ' · source', pattern: current.clip.origin.pattern, voiceMap: current.clip.origin.voiceMap } };
      const destinations = new Set(this.voices(track.id).map(voice => voice.id)), voiceMap = copy(origin.voiceMap);
      for (const voice of origin.pattern.voices) if (!voiceMap[voice.id] && destinations.has(voice.id)) voiceMap[voice.id] = voice.id;
      await this.host.importPattern(track.id, origin.pattern, { voiceMap, replace: true });
      if (generation !== this.getGeneration() || this.location()?.clip.id !== clip.id) return;
      this.piano?.open();
      this.status('Source patch opened. Edit notes below, or Use instrument pattern after editing its sequencer. Update audio prints the revision.'); this.render();
    }
    async adoptInstrumentPattern() {
      const location = this.location(), generation = this.getGeneration();
      if (!location?.clip.origin || this.sourceEdit?.id !== location.clip.id || this.controller) return;
      const packet = P.normalize(await this.host.exportPattern(location.track.id));
      if (generation !== this.getGeneration() || this.location()?.clip.id !== location.clip.id || this.sourceEdit?.id !== location.clip.id) throw abortError();
      const destinations = new Set(this.voices(location.track.id).map(voice => voice.id));
      const voiceMap = Object.fromEntries(packet.voices.map(voice => { const target = destinations.has(voice.id) ? voice.id : this.sourceEdit.clip.voiceMap?.[voice.id]; if (!destinations.has(target)) throw Error('Map this instrument pattern through the Patterns panel first.'); return [voice.id, target]; }));
      this.remember(); this.sourceEdit.clip.pattern = packet; this.sourceEdit.clip.voiceMap = voiceMap;
      this.sourceEdit.clip.sourceOffset = Math.min(this.sourceEdit.clip.sourceOffset, packet.lengthBeats);
      this.pianoChanged(); this.piano?.open(); this.status('Current instrument pattern copied into the source. Update audio prints it; Undo restores the previous notes.');
    }
    async restoreNotes() {
      const location = this.location(); if (!location?.clip.origin) return;
      const current = this.getState(), candidate = copy(current), index = current.tracks.indexOf(location.track), audio = location.clip, origin = audio.origin;
      candidate.tracks[index].clips[candidate.tracks[index].clips.findIndex(c => c.id === audio.id)] = { ...copy(origin.sourceClip), id: audio.id, name: audio.name, pattern: copy(origin.pattern), voiceMap: copy(origin.voiceMap), start: audio.start, length: audio.length };
      candidate.tracks[index].instrument = copy(origin.instrument);
      await this.commit(S.normalize(S.pruneAssets(candidate)), { selected: audio.id, trackIndex: index, instruments: true }); this.sourceEdit = null;
      await this.ensureInstrument(this.getState().tracks[index]); this.piano?.open();
      this.status('Original notes and patch restored. The arrangement and track effects remain in place.');
    }
    dispose() { this.cancel(); this.renderer.dispose(); }
  }
  window.LoomNoteWorkflow = LoomNoteWorkflow;
})();
