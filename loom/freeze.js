/* Reversible track renders. Source clips, patches and processing stay editable after thawing. */
(function (global) {
  'use strict';
  const S = global.LoomSchema, copy = value => S.copy(value);
  const canceled = () => new DOMException('Track freeze canceled.', 'AbortError');
  const snapshotKey = snapshot => {
    const value = copy(snapshot);
    if (value?.state != null) delete value.storage;
    return JSON.stringify(value);
  };
  const descriptorKey = descriptor => { const value = copy(descriptor); if (value) delete value.snapshot; return JSON.stringify(value); };
  class LoomTrackFreeze {
    constructor(options = {}) {
      Object.assign(this, options);
      this.noteRenderer ||= options.renderer;
      if (typeof this.getState !== 'function' || !this.engine || !this.noteRenderer || typeof this.commit !== 'function') throw TypeError('Provide the project, audio engine, note renderer and commit callback.');
      this.getAssets ||= () => this.engine.assets || {};
      this.getGeneration ||= () => 0;
      this.status ||= () => {};
      this.onChange ||= () => {};
      this.operation = 0; this.controller = null; this.disposed = false;
      this.state = { busy: false, trackId: null, stage: '', progress: 0 };
    }
    getStatus() { return { ...this.state }; }
    _notify(stage, progress = this.state.progress) {
      this.state = { ...this.state, stage, progress: Math.max(0, Math.min(1, Number(progress) || 0)) };
      this.onChange(this.getStatus());
    }
    _check(operation, generation, signal) {
      if (this.disposed || signal.aborted || operation !== this.operation || generation !== this.getGeneration()) throw canceled();
    }
    cancel() {
      if (!this.controller || this.controller.signal.aborted) return false;
      ++this.operation; this.controller.abort(); this._notify('Canceling'); return true;
    }
    async _capture(track, signal) {
      const descriptor = copy(track.instrument), written = track.clips.some(clip => clip.type === 'notes'), live = track.instrumentLive === true;
      if (!descriptor || (!written && !live && !this.host?.records?.has(track.id))) return { descriptor, record: null };
      if (!this.host) throw Error('This instrument cannot be captured for freezing.');
      if (this.ensureInstrument && !await this.ensureInstrument(track)) throw Error('The instrument on ' + track.name + ' could not open.');
      if (signal.aborted) throw canceled();
      const record = this.host.records?.get(track.id); if (record?.ready) await record.ready;
      if (signal.aborted) throw canceled();
      const snapshot = await this.host.snapshot(track.id);
      if (snapshot) descriptor.snapshot = copy(snapshot);
      if ((written || live) && !descriptor.snapshot) throw Error('Save this instrument’s current patch before freezing it.');
      let pattern = null, loop = true;
      if (live) {
        const adapter = this.host.getPatternAdapter(track.id);
        if (!!adapter?.transport && ['bands', 'decks'].includes(adapter?.patternImport?.mode) && !adapter?.importedPattern) throw Error('Turn off Live and print this instrument’s performance to audio before freezing this track.');
        if (!adapter?.exportPattern || !adapter?.scheduleNote) throw Error('Print this instrument’s live performance to audio before freezing this track.');
        pattern = await this.host.exportPattern(track.id, { signal }); loop = adapter.nativeSequenceLoop !== false;
      }
      return { descriptor, record, snapshot, pattern, loop };
    }
    async freeze(trackId, options = {}) {
      if (this.disposed) throw Error('Track freezing has been disposed.');
      if (this.controller) throw Error('Finish or cancel the current track freeze.');
      if (this.canFreeze?.(trackId) === false) throw Error('Finish the current operation before freezing a track.');
      const initial = this.getState(), original = initial.tracks.find(track => track.id === trackId);
      if (!original) throw Error('Choose one of the eight tracks.');
      if (original.freeze) return copy(original.freeze);
      if (this.engine.isRecording) throw Error('Finish recording before freezing a track.');
      const source = copy(initial), sourceTrack = source.tracks.find(track => track.id === trackId);
      const sourceDescriptor = descriptorKey(sourceTrack.instrument), initialFingerprint = S.freezeFingerprint(source, trackId);
      const generation = this.getGeneration(), operation = ++this.operation, controller = new AbortController(), signal = controller.signal;
      const externalAbort = () => controller.abort();
      if (options.signal?.aborted) throw canceled();
      options.signal?.addEventListener('abort', externalAbort, { once: true });
      this.controller = controller; this.state = { busy: true, trackId, stage: 'Preparing', progress: 0 }; this._notify('Preparing', 0);
      try {
        await this.pause?.(); this._check(operation, generation, signal);
        await this.engine.init?.(); this._check(operation, generation, signal);
        if (initialFingerprint !== S.freezeFingerprint(this.getState(), trackId)) throw Error('The track changed while preparing its freeze. Try again.');
        this._notify('Capturing instrument', .02);
        const actual = this.getState().tracks.find(track => track.id === trackId), captured = await this._capture(actual, signal);
        this._check(operation, generation, signal);
        if (captured.descriptor) sourceTrack.instrument = copy(captured.descriptor);
        const fingerprint = S.freezeFingerprint(source, trackId), renderState = copy(source), renderTrack = renderState.tracks.find(track => track.id === trackId);
        if (captured.pattern) renderTrack.clips.push(S.noteClip({ id: S.uid('freeze-notes'), name: 'Instrument pattern', type: 'notes', pattern: captured.pattern, voiceMap: {}, start: 0, length: source.lengthBars * 4, sourceOffset: 0, rate: 1, loop: captured.loop, gain: 1, fadeIn: 0, fadeOut: 0, transpose: 0 }, source.lengthBars * 4));
        const sampleRate = Math.round(this.engine.context?.sampleRate || 48000), existing = (source.freezeAssets || []).reduce((sum, asset) => sum + asset.frames * asset.channels * 4, 0), maxBytes = S.LIMITS.freezePcmBytes - existing;
        if (maxBytes <= 0) throw Error('The frozen audio cache is full. Unfreeze another track first.');
        this._notify('Rendering instrument', .04);
        // Render one finite native performance so overlapping clips share voices
        // and releases continue after their note gates. Ordinary exports keep
        // their existing source windows and loop preparation.
        const prepared = await this.noteRenderer.prepareNotes(renderState, this.getAssets(), { trackId, signal, tailSeconds: 8, preserveTails: true, onProgress: progress => this._notify('Rendering instrument', .04 + progress * .26) });
        this._check(operation, generation, signal);
        const assets = [], chunks = []; let bytes = 0;
        this._notify('Baking effects and automation', .3);
        const result = await this.engine.renderFreezeTrack(prepared.state, prepared.assets, {
          trackId, sampleRate, tailSeconds: 8, chunkSeconds: S.LIMITS.freezeChunkSeconds, maxBytes, signal,
          onProgress: progress => this._notify('Baking effects and automation', .3 + progress * .65),
          onChunk: chunk => {
            this._check(operation, generation, signal);
            const descriptor = { startFrame: chunk.startFrame, frames: chunk.frames, main: null, sendA: null, sendB: null };
            for (const plane of ['main', 'sendA', 'sendB']) if (chunk.planes?.[plane]) {
              const audio = chunk.planes[plane]; bytes += audio.left.length * 8;
              if (bytes > maxBytes) throw Error('This freeze exceeds the available audio cache. Unfreeze another track or shorten the arrangement.');
              if (assets.length + (source.freezeAssets?.length || 0) >= S.LIMITS.freezeAssets) throw Error('The project has too many frozen audio chunks. Unfreeze another track.');
              const asset = S.encodeFreezeAsset({ ...audio, sampleRate, id: S.uid('freeze'), name: sourceTrack.name + ' · ' + plane });
              assets.push(asset); descriptor[plane] = asset.id;
            }
            chunks.push(descriptor);
          }
        });
        this._check(operation, generation, signal); this._notify('Saving frozen audio', .96);
        if (captured.record) {
          if (this.host.records?.get(trackId) !== captured.record) throw Error('The instrument changed while freezing. Try again.');
          const latestSnapshot = await this.host.snapshot(trackId); this._check(operation, generation, signal);
          if (snapshotKey(latestSnapshot) !== snapshotKey(captured.snapshot)) throw Error('The instrument patch changed while freezing. Try again.');
        }
        const latest = this.getState(), latestTrack = latest.tracks.find(track => track.id === trackId);
        if (!latestTrack || latestTrack.freeze || descriptorKey(latestTrack.instrument) !== sourceDescriptor) throw Error('The track changed while freezing. Try again.');
        const candidate = copy(latest), target = candidate.tracks.find(track => track.id === trackId);
        if (captured.descriptor) target.instrument = copy(captured.descriptor);
        if (S.freezeFingerprint(candidate, trackId) !== fingerprint) throw Error('The track or its automation changed while freezing. Try again.');
        target.freeze = { version: 1, sampleRate: result.sampleRate, tempo: source.tempo, lengthBeats: source.lengthBars * 4, bodyFrames: result.bodyFrames, totalFrames: result.totalFrames, tailFrames: result.tailFrames, fingerprint, chunks };
        candidate.freezeAssets = [...(candidate.freezeAssets || []), ...assets];
        const normalized = S.normalize(S.pruneAssets(candidate));
        if (!normalized.tracks.find(track => track.id === trackId)?.freeze || !S.freezeValid(normalized, trackId)) throw Error('The frozen audio could not be validated. The original track is unchanged.');
        S.serializeProject(normalized); this._check(operation, generation, signal);
        this.commit(normalized, { instruments: true, capturedInstrument: captured.descriptor ? { trackId, descriptor: copy(captured.descriptor) } : null });
        if (this.releaseInstrument) this.releaseInstrument(trackId); else this.host?.unload?.(trackId);
        this.status(sourceTrack.name + ' frozen. Its effects and automation are baked in; Unfreeze restores the original track.');
        return copy(target.freeze);
      } finally {
        options.signal?.removeEventListener('abort', externalAbort);
        if (this.controller === controller) { this.controller = null; this.state = { busy: false, trackId: null, stage: '', progress: 0 }; this._notify('', 0); }
      }
    }
    unfreeze(trackId) {
      if (this.disposed) throw Error('Track freezing has been disposed.');
      if (this.controller) throw Error('Finish or cancel the current track freeze.');
      const current = this.getState(), track = current.tracks.find(track => track.id === trackId);
      if (!track?.freeze) return false;
      const candidate = copy(current); delete candidate.tracks.find(track => track.id === trackId).freeze;
      this.commit(S.normalize(S.pruneAssets(candidate)), { instruments: true });
      this.status(track.name + ' unfrozen. Original effects, automation and clips are restored.'); return true;
    }
    unfreezeAll() {
      if (this.disposed) throw Error('Track freezing has been disposed.');
      if (this.controller) throw Error('Finish or cancel the current track freeze.');
      const candidate = copy(this.getState()); if (!candidate.tracks.some(track => track.freeze)) return false;
      for (const track of candidate.tracks) delete track.freeze;
      this.commit(S.normalize(S.pruneAssets(candidate)), { instruments: true }); this.status('All tracks unfrozen.'); return true;
    }
    dispose() { this.disposed = true; this.cancel(); }
  }
  global.LoomTrackFreeze = LoomTrackFreeze;
})(window);
