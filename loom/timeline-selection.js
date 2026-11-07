/* GALLEY timeline moves share one snapped offset and commit atomically. */
(function (scope) {
  'use strict';
  const CLIP_LIMIT = 128, EPSILON = 1e-10;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function requestedIds(ids) {
    if (ids == null) return { ids: [], valid: true };
    const values = typeof ids === 'string' ? [ids] : Array.isArray(ids) || ids instanceof Set ? Array.from(ids) : null;
    if (!values || values.some(id => typeof id !== 'string' || !id)) return { ids: [], valid: false };
    return { ids: Array.from(new Set(values)), valid: true };
  }

  // Missing identifiers are omitted here so a view can prune stale selection.
  // Planning a move is stricter and rejects any missing or ambiguous identifier.
  function entries(state, ids) {
    const wanted = new Set(requestedIds(ids).ids), found = [];
    for (const [trackIndex, track] of (state?.tracks || []).entries()) {
      for (const [clipIndex, clip] of (track.clips || []).entries()) {
        if (wanted.has(clip.id)) found.push({ clip, track, trackIndex, clipIndex });
      }
    }
    return found;
  }

  function rejected(state, reason) {
    return { ok: false, changed: false, state, moves: [], deltaBeats: 0, deltaTracks: 0, reason };
  }

  function planMove(state, ids, options = {}) {
    if (!state || !Array.isArray(state.tracks) || !state.tracks.length || !finite(state.lengthBars) || state.lengthBars <= 0) return rejected(state, 'Choose a valid arrangement before moving clips.');
    const selection = requestedIds(ids);
    if (!selection.valid) return rejected(state, 'Choose valid clips to move.');
    const chosen = entries(state, selection.ids);
    if (chosen.length !== selection.ids.length || new Set(chosen.map(item => item.clip.id)).size !== chosen.length) return rejected(state, 'A selected clip is no longer in the arrangement. Select the clips again.');
    if (!chosen.length) return { ok: true, changed: false, state, moves: [], deltaBeats: 0, deltaTracks: 0 };
    const anchor = options.anchorId === undefined ? chosen[0] : chosen.find(item => item.clip.id === options.anchorId);
    if (!anchor) return rejected(state, 'Choose a selected clip as the movement anchor.');
    const requestedBeatDelta = options.deltaBeats === undefined ? 0 : options.deltaBeats;
    const requestedTrackDelta = options.deltaTracks === undefined ? 0 : options.deltaTracks;
    const step = options.snap === undefined ? state.view?.snap ?? 0 : options.snap;
    if (!finite(requestedBeatDelta) || !Number.isInteger(requestedTrackDelta) || !finite(step) || step < 0) return rejected(state, 'Choose a finite clip movement and a valid snap setting.');
    const totalBeats = state.lengthBars * 4;
    if (chosen.some(({ clip }) => !finite(clip.start) || !finite(clip.length) || clip.start < 0 || clip.length <= 0 || clip.start + clip.length > totalBeats + 1e-6)) return rejected(state, 'A selected clip has invalid timing.');

    let deltaBeats = 0;
    // A purely vertical move must not quantize an off-grid clip's time.
    if (requestedBeatDelta !== 0) {
      // Keyboard nudges add their exact step even when the anchor is off-grid.
      if (options.quantize === false) deltaBeats = requestedBeatDelta;
      else {
        const wantedStart = anchor.clip.start + requestedBeatDelta;
        const snappedStart = step > 0 ? Math.round(wantedStart / step) * step : Math.round(wantedStart * 1000) / 1000;
        deltaBeats = snappedStart - anchor.clip.start;
      }
    }
    const earliest = Math.min(...chosen.map(item => item.clip.start));
    const latest = Math.max(...chosen.map(item => item.clip.start + item.clip.length));
    deltaBeats = clamp(deltaBeats, -earliest, Math.max(0, totalBeats - latest));
    if (Math.abs(deltaBeats) < EPSILON) deltaBeats = 0;
    const firstTrack = Math.min(...chosen.map(item => item.trackIndex)), lastTrack = Math.max(...chosen.map(item => item.trackIndex));
    const deltaTracks = clamp(requestedTrackDelta, -firstTrack, state.tracks.length - 1 - lastTrack);
    const moves = chosen.map(({ clip, trackIndex }) => ({ id: clip.id, fromTrack: trackIndex, toTrack: trackIndex + deltaTracks, originalStart: clip.start, start: clip.start + deltaBeats, length: clip.length, clip }));
    const changed = deltaBeats !== 0 || deltaTracks !== 0;
    if (!changed) return { ok: true, changed: false, state, moves, deltaBeats, deltaTracks };

    // Check the entire source/destination set before creating a new state.
    for (const move of moves) {
      const source = state.tracks[move.fromTrack], target = state.tracks[move.toTrack];
      if (source.freeze) return rejected(state, 'Unfreeze ' + (source.name || 'this track') + ' before moving its clips.');
      if (target.freeze) return rejected(state, 'Unfreeze ' + (target.name || 'the destination track') + ' before moving clips there.');
    }
    const counts = state.tracks.map(track => (track.clips || []).length);
    for (const move of moves) if (move.fromTrack !== move.toTrack) { counts[move.fromTrack]--; counts[move.toTrack]++; }
    const overfull = counts.findIndex(count => count > CLIP_LIMIT);
    if (overfull >= 0) return rejected(state, (state.tracks[overfull].name || 'The destination track') + ' has reached its ' + CLIP_LIMIT + '-clip limit.');
    return { ok: true, changed: true, state, moves, deltaBeats, deltaTracks };
  }

  function move(state, ids, options = {}) {
    const plan = planMove(state, ids, options);
    if (!plan.ok || !plan.changed) return plan;
    const moving = new Map(plan.moves.map(item => [item.id, item])), affected = new Set();
    for (const item of plan.moves) { affected.add(item.fromTrack); affected.add(item.toTrack); }
    const movedClip = item => item.start === item.originalStart ? item.clip : { ...item.clip, start: item.start };
    const tracks = state.tracks.map((track, index) => {
      if (!affected.has(index)) return track;
      const clips = [];
      for (const clip of track.clips) {
        const item = moving.get(clip.id);
        if (!item) clips.push(clip);
        else if (item.toTrack === index) clips.push(movedClip(item));
      }
      for (const item of plan.moves) if (item.fromTrack !== index && item.toTrack === index) clips.push(movedClip(item));
      return { ...track, clips };
    });
    return { ...plan, state: { ...state, tracks } };
  }

  scope.LoomTimelineSelection = Object.freeze({ entries, planMove, move });
})(typeof window === 'undefined' ? globalThis : window);
