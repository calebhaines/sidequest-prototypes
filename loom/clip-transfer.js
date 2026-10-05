/* Render an edited LOOM clip into a receiving instrument, before track inserts and mixing. */
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
    const sourceOffset = clamp(clip.sourceOffset, 0, 120, 0), rate = clamp(clip.rate, .125, 8, 1), reverse = clip.reverse === true, loop = clip.loop === true;
    const level = clamp(clip.gain, 0, 4, 1), minimumFade = .003 / secondsPerBeat;
    const fadeIn = Math.min(length * .5, Math.max(minimumFade, clamp(clip.fadeIn, 0, 32, 0)));
    const fadeOut = Math.min(length * .5, Math.max(minimumFade, clamp(clip.fadeOut, 0, 32, 0)));
    const frames = Math.max(2, Math.round(selectedSeconds * sampleRate)), pcm = new Float32Array(frames * 2);
    const start = Number(clip.start) || 0, advance = clamp(tempo, 40, 240, 120) / 60 / sampleRate;
    let beat = start + fromSeconds / secondsPerBeat;
    for (let from = 0; from < frames; from += 32768) {
      cancelled(signal);
      const end = Math.min(frames, from + 32768);
      for (let frame = from; frame < end; frame++, beat += advance) {
        const localBeat = beat - start;
        if (localBeat >= length) continue;
        let offset = localBeat * secondsPerBeat * rate + sourceOffset;
        if (loop) offset %= span;
        else if (offset >= span) continue;
        const position = (reverse ? sourceEnd - 1 / sourceRate - offset : sourceStart + offset) * sourceRate;
        if (position < 0 || position >= left.length) continue;
        const index = Math.floor(position), fraction = position - index;
        let gain = level * Math.min(1, localBeat / fadeIn, (length - localBeat) / fadeOut);
        if(fromSeconds>0||toSeconds<seconds)gain*=Math.min(1,frame/sampleRate/.003,(selectedSeconds-frame/sampleRate)/.003);
        if (!loop) gain *= Math.min(1, offset / .003, (span - offset) / .003);
        for (let channel = 0; channel < 2; channel++) {
          const data = channel ? right : left;
          pcm[frame * 2 + channel] = ((data[index] || 0) * (1 - fraction) + (data[Math.min(index + 1, data.length - 1)] || 0) * fraction) * gain;
        }
      }
      if (end < frames) await pause();
    }
    cancelled(signal);
    return { pcm, sampleRate, name: typeof clip.name === 'string' ? clip.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 80) : 'LOOM clip' };
  }
  window.LoomClipTransfer = Object.freeze({ render });
})();
