import type { GalleyFxSlots } from "./types";

export type VoiceFxChange = { gesture?: string | number; phase?: string };
export interface VoiceFxProcessor {
  setSlots(slots: GalleyFxSlots): void;
  process(left: Float32Array, right: Float32Array, clock?: { tempo: number; beat: number; playing: boolean }): void;
  reset(): void;
  getTailTime(tempo?: number): number;
  getMeters(): unknown;
}
export interface VoiceFxBank {
  setVoice(index: number, slots: GalleyFxSlots): void;
  input(index: number): AudioNode;
  connectSource(index: number, node: AudioNode): () => void;
  setClock(clock: { tempo?: number; beat?: number; time?: number; playing?: boolean }): void;
  setAudible(index: number, audible: boolean): void;
  reset(index?: number, when?: number): void;
  dispose(): void;
  getMeters(index?: number): unknown;
}
export interface VoiceFxEditor {
  render(): void;
  close(): void;
  destroy(): void;
}
export interface VoiceEffectsApi {
  normalizeSlots(value: unknown, options?: { strict?: boolean }): GalleyFxSlots;
  hasEffects(slots: GalleyFxSlots): boolean;
  createProcessor(sampleRate: number, slots: GalleyFxSlots, clock?: { tempo: number; beat: number; playing: boolean }): VoiceFxProcessor;
  prepare(context: BaseAudioContext): Promise<unknown>;
  createBank(context: AudioContext, destination: AudioNode, options: { voiceCount: number; tempo: number }): VoiceFxBank;
  mount(element: HTMLElement, options: { getSlots: () => GalleyFxSlots; onChange: (slots: GalleyFxSlots, change: VoiceFxChange) => void; getLabel: () => string; getKey?: () => number | string; getMeters?: () => unknown; onUndo?: () => void; onRedo?: () => void }): VoiceFxEditor;
}
export function voiceEffects(required = false): VoiceEffectsApi | undefined {
  const api = (globalThis as typeof globalThis & { KitchenVoiceEffects?: VoiceEffectsApi }).KitchenVoiceEffects;
  if (!api && required) throw new Error("GALLEY voice effects have not loaded. Reload the complete HOTPLATE page.");
  return api;
}
/** Empty older patches can still be rendered by the standalone synthesis module. */
export function normalizeVoiceFx(value: unknown): GalleyFxSlots {
  if (value === undefined) return [null, null];
  const api = voiceEffects();
  if (api) return api.normalizeSlots(value, { strict: true });
  if (Array.isArray(value) && value.length === 2 && value.every(slot => slot === null)) return [null, null];
  throw new Error("GALLEY voice effects have not loaded or contain invalid settings.");
}
export function validVoiceFx(value: unknown): boolean {
  try { normalizeVoiceFx(value); return true; } catch { return false; }
}
export function hasVoiceFx(value: GalleyFxSlots | undefined): boolean {
  return !!value?.some(slot => slot !== null && slot.params.bypass !== true);
}
export function drySignature(value: object): string {
  return JSON.stringify({ ...value, galleyFx: undefined });
}
export function voiceFxTail(slots: GalleyFxSlots | undefined, tempo = 120, sampleRate = 48000): number {
  if (!hasVoiceFx(slots)) return 0;
  return Math.max(0, Math.min(15, voiceEffects(true)!.createProcessor(sampleRate, normalizeVoiceFx(slots), { tempo, beat: 0, playing: true }).getTailTime(tempo)));
}
/** A complete voice stem is processed once, so overlapping strikes share history. */
export function processVoiceFx(slots: GalleyFxSlots | undefined, left: Float32Array, right: Float32Array, sampleRate: number, tempo = 120): void {
  if (!hasVoiceFx(slots)) return;
  const processor = voiceEffects(true)!.createProcessor(sampleRate, normalizeVoiceFx(slots), { tempo, beat: 0, playing: true });
  for (let at = 0; at < left.length; at += 128) processor.process(left.subarray(at, at + 128), right.subarray(at, at + 128), { tempo, beat: at / sampleRate * tempo / 60, playing: true });
}
/** Hosted printing yields between DSP batches so cancellation remains responsive. */
export async function processVoiceFxAsync(slots: GalleyFxSlots | undefined, left: Float32Array, right: Float32Array, sampleRate: number, tempo = 120, signal?: AbortSignal): Promise<void> {
  if (!hasVoiceFx(slots)) return;
  const processor = voiceEffects(true)!.createProcessor(sampleRate, normalizeVoiceFx(slots), { tempo, beat: 0, playing: true });
  for (let at = 0; at < left.length; at += 128) {
    signal?.throwIfAborted();
    processor.process(left.subarray(at, at + 128), right.subarray(at, at + 128), { tempo, beat: at / sampleRate * tempo / 60, playing: true });
    if (at % 16384 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
}
