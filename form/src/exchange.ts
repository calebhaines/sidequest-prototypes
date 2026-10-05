import type { GrainSample } from "./types";

/** The shared Music Lab boundary: finite, interleaved stereo PCM. */
export interface SharedAudio {
  pcm: Float32Array;
  sampleRate: number;
  name?: string;
  signal?: AbortSignal;
  options?: {
    target?: string;
    deck?: number;
    layer?: string;
    replace?: boolean;
  };
}

export const SAMPLE_SECONDS = 2;
export const SAMPLE_RATE = 22050;

export function importTarget(options: SharedAudio["options"], selected: number) {
  let voice = options?.deck ?? selected;
  let layer = options?.layer ?? "c";
  if (options?.target !== undefined) {
    const match = /^([0-7]):([abc])$/.exec(options.target);
    if (!match) throw new Error("Choose a FORM voice and layer A, B, or C.");
    voice = Number(match[1]);
    layer = match[2];
  }
  if (!Number.isInteger(voice) || voice < 0 || voice > 7 || !["a", "b", "c"].includes(layer))
    throw new Error("Choose a FORM voice and layer A, B, or C.");
  return { voice, layer: layer as "a" | "b" | "c", id: `${voice}:${layer}` };
}

export async function importTexture(input: SharedAudio): Promise<GrainSample> {
  input.signal?.throwIfAborted();
  const { pcm, sampleRate } = input;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 ||
      Object.prototype.toString.call(pcm) !== "[object Float32Array]" || pcm.length < 4 || pcm.length % 2)
    throw new Error("Provide valid interleaved stereo audio.");
  const sourceFrames = pcm.length / 2;
  if (sourceFrames / sampleRate > SAMPLE_SECONDS)
    throw new Error("FORM granular textures accept up to two seconds. Trim the sample before sending it.");
  for (const value of pcm)
    if (!Number.isFinite(value)) throw new Error("The incoming audio contains invalid samples.");
  const audioWindow = window as typeof window & { webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Offline = audioWindow.OfflineAudioContext ?? audioWindow.webkitOfflineAudioContext;
  if (!Offline) throw new Error("This browser does not support offline audio conversion.");
  const frames = Math.max(1, Math.floor(sourceFrames * SAMPLE_RATE / sampleRate));
  const context = new Offline(1, frames, SAMPLE_RATE);
  const buffer = context.createBuffer(2, sourceFrames, sampleRate);
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  for (let frame = 0; frame < sourceFrames; frame++) {
    left[frame] = Math.max(-1, Math.min(1, pcm[frame * 2]));
    right[frame] = Math.max(-1, Math.min(1, pcm[frame * 2 + 1]));
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  // Explicit mono speaker downmix averages left and right before resampling.
  const mono = context.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = "explicit";
  mono.channelInterpretation = "speakers";
  source.connect(mono).connect(context.destination);
  source.start();
  const rendered = (await context.startRendering()).getChannelData(0);
  input.signal?.throwIfAborted();
  return {
    name: String(input.name ?? "Shared texture").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 120) || "Shared texture",
    sampleRate: SAMPLE_RATE,
    data: Array.from(rendered, value => Number(Math.max(-1, Math.min(1, value)).toFixed(5))),
  };
}

export function interleaveStereo(left: Float32Array, right: Float32Array): Float32Array {
  const pcm = new Float32Array(left.length * 2);
  for (let frame = 0; frame < left.length; frame++) {
    pcm[frame * 2] = left[frame];
    pcm[frame * 2 + 1] = right[frame];
  }
  return pcm;
}
