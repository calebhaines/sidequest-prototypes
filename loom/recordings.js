/* GALLEY · inspect stored audio and remove it without leaving stale references. */
(function (global) {
  'use strict';
  const S = global.LoomSchema;
  const planes = ['main', 'sendA', 'sendB'];
  const unique = values => [...new Set(values)];
  function project(state) {
    if (!state || !Array.isArray(state.tracks) || !Array.isArray(state.assets)) throw Error('Open a GALLEY project before browsing recordings.');
    return state;
  }
  const encodedBytes = asset => typeof asset?.pcm === 'string' ? asset.pcm.length : 0;
  const pcmBytes = (asset, frozen = false) => asset.frames * asset.channels * (frozen ? 4 : 2);
  const chunkIds = track => unique((track.freeze?.chunks || []).flatMap(chunk => planes.map(plane => chunk[plane])).filter(id => typeof id === 'string'));
  function sourceUses(state) {
    const result = new Map();
    for (const track of state.tracks) for (const clip of track.clips || []) if (clip.type !== 'notes' && typeof clip.assetId === 'string') {
      if (!result.has(clip.assetId)) result.set(clip.assetId, []);
      result.get(clip.assetId).push({ trackId: track.id, trackName: track.name, clipId: clip.id, clipName: clip.name });
    }
    return result;
  }
  function list(state) {
    project(state);
    const uses = sourceUses(state), frozen = new Map((state.freezeAssets || []).map(asset => [asset.id, asset])), referenced = new Set();
    const result = state.assets.map(asset => {
      const references = uses.get(asset.id) || [];
      return { id: 'audio:' + asset.id, kind: 'audio', assetId: asset.id, name: asset.name, duration: asset.frames / asset.sampleRate, sampleRate: asset.sampleRate, channels: asset.channels, frames: asset.frames, pcmBytes: pcmBytes(asset), decodedBytes: asset.frames * 8, encodedBytes: encodedBytes(asset), savedEncodedBytes: references.length ? encodedBytes(asset) : 0, uses: references, useCount: references.length, unused: !references.length };
    });
    for (const track of state.tracks) if (track.freeze) {
      const ids = chunkIds(track), assets = ids.map(id => frozen.get(id)).filter(Boolean), f = track.freeze;
      ids.forEach(id => referenced.add(id));
      result.push({ id: 'freeze:' + track.id, kind: 'freeze', trackId: track.id, name: track.name + ' · frozen render', duration: f.totalFrames / f.sampleRate, sampleRate: f.sampleRate, channels: 2, frames: f.totalFrames, pcmBytes: assets.reduce((sum, asset) => sum + pcmBytes(asset, true), 0), decodedBytes: assets.reduce((sum, asset) => sum + pcmBytes(asset, true), 0), encodedBytes: assets.reduce((sum, asset) => sum + encodedBytes(asset), 0), savedEncodedBytes: assets.reduce((sum, asset) => sum + encodedBytes(asset), 0), uses: [{ trackId: track.id, trackName: track.name, clipId: null, clipName: 'Frozen playback' }], useCount: 1, unused: false, chunkCount: f.chunks.length, chunks: f.chunks.map(chunk => ({ ...chunk })), planes: planes.filter(plane => f.chunks.some(chunk => typeof chunk[plane] === 'string')) });
    }
    // A supplied project may contain valid, unreferenced cached audio. It must
    // remain visible and deletable even though the normal Save path prunes it.
    for (const asset of frozen.values()) if (!referenced.has(asset.id)) result.push({ id: 'freeze-unused:' + asset.id, kind: 'freeze', trackId: null, assetId: asset.id, name: asset.name + ' · unused frozen audio', duration: asset.frames / asset.sampleRate, sampleRate: asset.sampleRate, channels: asset.channels, frames: asset.frames, pcmBytes: pcmBytes(asset, true), decodedBytes: pcmBytes(asset, true), encodedBytes: encodedBytes(asset), savedEncodedBytes: 0, uses: [], useCount: 0, unused: true, chunkCount: 1, chunks: [{ startFrame: 0, frames: asset.frames, main: asset.id, sendA: null, sendB: null }], planes: ['main'] });
    return result;
  }
  function storage(state) {
    project(state);
    const sourceBytes = state.assets.reduce((sum, asset) => sum + encodedBytes(asset), 0), freezeBytes = (state.freezeAssets || []).reduce((sum, asset) => sum + encodedBytes(asset), 0), used = sourceUses(state), referenced = new Set(state.tracks.flatMap(chunkIds));
    const savedEncodedBytes = state.assets.filter(asset => used.has(asset.id)).reduce((sum, asset) => sum + encodedBytes(asset), 0) + (state.freezeAssets || []).filter(asset => referenced.has(asset.id)).reduce((sum, asset) => sum + encodedBytes(asset), 0);
    return { sourceBytes, freezeBytes, encodedBytes: sourceBytes + freezeBytes, savedEncodedBytes, pcmBytes: state.assets.reduce((sum, asset) => sum + pcmBytes(asset), 0) + (state.freezeAssets || []).reduce((sum, asset) => sum + pcmBytes(asset, true), 0), decodedBytes: state.assets.reduce((sum, asset) => sum + asset.frames * 8, 0) + (state.freezeAssets || []).reduce((sum, asset) => sum + pcmBytes(asset, true), 0), sourceCount: state.assets.length, frozenTrackCount: state.tracks.filter(track => track.freeze).length, freezeAssetCount: (state.freezeAssets || []).length };
  }
  function planDelete(state, selection) {
    project(state);
    if (!Array.isArray(selection) && !(selection instanceof Set)) throw Error('Choose recordings from the project browser.');
    const ids = unique([...selection]), rows = new Map(list(state).map(row => [row.id, row]));
    if (ids.some(id => typeof id !== 'string' || !rows.has(id))) throw Error('A selected recording is no longer in this project. Refresh the recordings browser.');
    const selected = ids.map(id => rows.get(id)), sourceIds = selected.filter(row => row.kind === 'audio').map(row => row.assetId), sourceSet = new Set(sourceIds);
    const clips = state.tracks.flatMap(track => (track.clips || []).filter(clip => clip.type !== 'notes' && sourceSet.has(clip.assetId)).map(clip => ({ trackId: track.id, trackName: track.name, clipId: clip.id, clipName: clip.name, assetId: clip.assetId })));
    const affected = new Set(clips.map(clip => clip.trackId)), unfreeze = new Set(selected.filter(row => row.kind === 'freeze' && row.trackId).map(row => row.trackId));
    for (const track of state.tracks) if (affected.has(track.id) && track.freeze) unfreeze.add(track.id);
    const candidates = new Set(selected.filter(row => row.kind === 'freeze' && !row.trackId).map(row => row.assetId));
    for (const track of state.tracks) if (unfreeze.has(track.id)) chunkIds(track).forEach(id => candidates.add(id));
    // Render chunks can legally be shared by compatible freeze records. Only
    // release bytes after the final remaining track reference is removed.
    const retained = new Set(state.tracks.filter(track => track.freeze && !unfreeze.has(track.id)).flatMap(chunkIds));
    const removedFreezeIds = (state.freezeAssets || []).filter(asset => candidates.has(asset.id) && !retained.has(asset.id)).map(asset => asset.id), frozenSet = new Set(removedFreezeIds);
    const removedSources = state.assets.filter(asset => sourceSet.has(asset.id)), removedFrozen = (state.freezeAssets || []).filter(asset => frozenSet.has(asset.id)), used = sourceUses(state), referenced = new Set(state.tracks.flatMap(chunkIds));
    const trackIds = new Set([...affected, ...unfreeze]);
    return { ids, sourceIds, unfreezeIds: state.tracks.filter(track => unfreeze.has(track.id)).map(track => track.id), clipCount: clips.length, clips, tracks: state.tracks.filter(track => trackIds.has(track.id)).map(track => ({ id: track.id, name: track.name })), removedSourceIds: removedSources.map(asset => asset.id), removedFreezeIds, pcmBytes: removedSources.reduce((sum, asset) => sum + pcmBytes(asset), 0) + removedFrozen.reduce((sum, asset) => sum + pcmBytes(asset, true), 0), encodedBytes: [...removedSources, ...removedFrozen].reduce((sum, asset) => sum + encodedBytes(asset), 0), savedEncodedBytes: removedSources.filter(asset => used.has(asset.id)).reduce((sum, asset) => sum + encodedBytes(asset), 0) + removedFrozen.filter(asset => referenced.has(asset.id)).reduce((sum, asset) => sum + encodedBytes(asset), 0) };
  }
  function remove(state, selection) {
    const plan = planDelete(state, selection), sourceIds = new Set(plan.removedSourceIds), freezeIds = new Set(plan.removedFreezeIds), unfreeze = new Set(plan.unfreezeIds), next = S.copy(state);
    next.assets = next.assets.filter(asset => !sourceIds.has(asset.id));
    for (const track of next.tracks) {
      track.clips = track.clips.filter(clip => clip.type === 'notes' || !sourceIds.has(clip.assetId));
      if (unfreeze.has(track.id)) delete track.freeze;
    }
    if (next.freezeAssets) {
      next.freezeAssets = next.freezeAssets.filter(asset => !freezeIds.has(asset.id));
      if (!next.freezeAssets.length) delete next.freezeAssets;
    }
    // Do not prune unrelated unused recordings here: deleting one selection
    // must not silently delete another item that remains in the browser.
    return { state: S.normalize(next), plan };
  }
  global.LoomRecordings = Object.freeze({ list, storage, planDelete, remove });
})(window);
