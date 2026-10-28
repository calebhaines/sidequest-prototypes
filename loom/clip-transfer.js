/* Render an edited GALLEY clip into a receiving instrument, before track inserts and mixing. */
(() => {
  'use strict';
  const clamp = (value, low, high, fallback = low) => Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
  const cancelled = signal => { if (signal?.aborted) throw new DOMException('Audio transfer cancelled.', 'AbortError'); };
  const pause = () => new Promise(resolve => setTimeout(resolve, 0));

  async function render(clip, decodedAsset, tempo, { signal, maxSeconds = 120, startSeconds = 0, endSeconds } = {}) {
    cancelled(signal);
    if (!clip || !decodedAsset?.left?.length) throw new Error('This clip has no audio to send.');
    const sampleRate = 48000, sourceRate = clamp(decodedAsset.sampleRate, 8000, 192000, 48000);
    const left = decodedAsset.left, right = decodedAsset.right || left, sourceDuration = left.length / sourceRate;
    const secondsPerBeat = 60 / clamp(tempo, 40, 240, 120), length = clamp(clip.length, .0001, 256, 1), seconds = length * secondsPerBeat;
    const fromSeconds=clamp(Number(startSeconds),0,seconds,0),toSeconds=endSeconds==null?seconds:clamp(Number(endSeconds),fromSeconds,seconds,seconds),selectedSeconds=toSeconds-fromSeconds;
    if(selectedSeconds<1/sampleRate)throw Error('Choose a nonempty audio region.');
    const limit = clamp(maxSeconds, .001, 120, 120);
    if (selectedSeconds > limit + 1e-9) throw new Error('This clip lasts ' + selectedSeconds.toFixed(2) + ' seconds. The destination accepts up to ' + limit + ' seconds. Shorten the clip before sending it.');
    const sourceStart = clamp(clip.sourceStart, 0, sourceDuration, 0), sourceEnd = clamp(clip.sourceEnd, sourceStart, sourceDuration, sourceDuration), span = sourceEnd - sourceStart;
    if (span <= 0) throw new Error('The selected source region is empty.');
    const playback = window.LoomClipPlayback;
    if (!playback) throw new Error('The GALLEY clip renderer is unavailable.');
    const compiled = playback.compile(clip, decodedAsset), pair = [0, 0];
    const frames = Math.max(2, Math.round(selectedSeconds * sampleRate)), pcm = new Float32Array(frames * 2);
    const start = Number(clip.start) || 0, advance = clamp(tempo, 40, 240, 120) / 60 / sampleRate;
    let beat = start + fromSeconds / secondsPerBeat;
    for (let from = 0; from < frames; from += 32768) {
      cancelled(signal);
      const end = Math.min(frames, from + 32768);
      for (let frame = from; frame < end; frame++, beat += advance) {
        playback.read(compiled, beat, secondsPerBeat, pair);
        const regionFade = fromSeconds > 0 || toSeconds < seconds ? Math.min(1, frame / sampleRate / .003, (selectedSeconds - frame / sampleRate) / .003) : 1;
        pcm[frame * 2] = pair[0] * regionFade;
        pcm[frame * 2 + 1] = pair[1] * regionFade;
      }
      if (end < frames) await pause();
    }
    cancelled(signal);
    return { pcm, sampleRate, name: typeof clip.name === 'string' ? clip.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : 'GALLEY clip' };
  }
  window.LoomClipTransfer = Object.freeze({ render });
})();
