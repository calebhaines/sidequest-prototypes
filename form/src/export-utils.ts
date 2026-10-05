import type { SoundParams } from "./types";

export type ExportSampleRate = 44100 | 48000 | 96000;
export type ExportBitDepth = 16 | 24 | 32;

export interface ExportSettings {
  sampleRate: ExportSampleRate;
  bitDepth: ExportBitDepth;
  normalize: boolean;
  trim: boolean;
}

/** Make an export-ready copy, leaving the instrument's rendered buffer untouched. */
export function prepareSamples(
  source: Float32Array,
  settings: Pick<ExportSettings, "normalize" | "trim">,
): Float32Array {
  let samples = source.slice();
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    if (!Number.isFinite(samples[i])) samples[i] = 0;
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  let start = 0;
  let end = samples.length;
  if (settings.trim) {
    if (peak === 0) return new Float32Array(1);
    // −100 dB relative to the peak preserves even very quiet attacks before normalization.
    const silence = peak * 0.00001;
    while (start < end && Math.abs(samples[start]) < silence) start++;
    while (end > start && Math.abs(samples[end - 1]) < silence) end--;
    if (start > 0 || end < samples.length) samples = samples.slice(start, end);
  }
  if (!samples.length) return new Float32Array(1);
  // Attenuate excessive peaks even when normalization is off: exported PCM must not clip.
  const scale = peak > 0 && (settings.normalize || peak > 1) ? 0.98 / peak : 1;
  if (scale !== 1) {
    for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  }
  return samples;
}

/** Normalize stereo channels together so exported panning stays intact. */
export function prepareStereo(
  source: Float32Array[],
  normalize: boolean,
): Float32Array[] {
  const channels = source.map((channel) => channel.slice());
  let peak = 0;
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index++) {
      if (!Number.isFinite(channel[index])) channel[index] = 0;
      peak = Math.max(peak, Math.abs(channel[index]));
    }
  }
  const scale = peak > 0 && (normalize || peak > 1) ? 0.98 / peak : 1;
  if (scale !== 1) {
    for (const channel of channels) {
      for (let index = 0; index < channel.length; index++)
        channel[index] *= scale;
    }
  }
  return channels;
}

export function soundName(
  sound: SoundParams | undefined,
  index: number,
): string {
  const named = sound as
    (SoundParams & { name?: string; label?: string }) | undefined;
  return named?.name?.trim() || named?.label?.trim() || `Sound ${index + 1}`;
}

export function safeFilename(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/\.+$/, "")
      .trim()
      .slice(0, 100) || "sample"
  );
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Leave enough time for browsers to acquire large downloadable files.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});

function checksum(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipFile {
  name: string;
  data: Blob | string | Uint8Array;
}

/** Standards-compliant, uncompressed ZIP: WAVs compress poorly and need no extra dependency. */
export async function createZip(files: ZipFile[]): Promise<Blob> {
  const encoder = new TextEncoder();
  const localParts: BlobPart[] = [];
  const directoryParts: BlobPart[] = [];
  let offset = 0;
  let directorySize = 0;
  const now = new Date();
  const dosTime =
    (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >>> 1);
  const dosDate =
    ((Math.max(1980, now.getFullYear()) - 1980) << 9) |
    ((now.getMonth() + 1) << 5) |
    now.getDate();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const bytes =
      typeof file.data === "string"
        ? encoder.encode(file.data)
        : file.data instanceof Blob
          ? new Uint8Array(await file.data.arrayBuffer())
          : new Uint8Array(file.data);
    const crc = checksum(bytes);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint16(10, dosTime, true);
    localView.setUint16(12, dosDate, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, bytes.length, true);
    localView.setUint32(22, bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    localParts.push(local, bytes);

    const entry = new Uint8Array(46 + name.length);
    const entryView = new DataView(entry.buffer);
    entryView.setUint32(0, 0x02014b50, true);
    entryView.setUint16(4, 20, true);
    entryView.setUint16(6, 20, true);
    entryView.setUint16(8, 0x0800, true);
    entryView.setUint16(12, dosTime, true);
    entryView.setUint16(14, dosDate, true);
    entryView.setUint32(16, crc, true);
    entryView.setUint32(20, bytes.length, true);
    entryView.setUint32(24, bytes.length, true);
    entryView.setUint16(28, name.length, true);
    entryView.setUint32(42, offset, true);
    entry.set(name, 46);
    directoryParts.push(entry);
    directorySize += entry.length;
    offset += local.length + bytes.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true);
  return new Blob([...localParts, ...directoryParts, end], {
    type: "application/zip",
  });
}
