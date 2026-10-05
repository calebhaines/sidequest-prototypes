import { useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Download,
  FileAudio,
  LoaderCircle,
  Package,
  X,
} from "lucide-react";
import { encodeWav, renderPattern, renderSound } from "./audio";
import type { SoundParams } from "./types";
import {
  createZip,
  downloadBlob,
  prepareSamples,
  prepareStereo,
  safeFilename,
  soundName,
  type ExportBitDepth,
  type ExportSampleRate,
  type ExportSettings,
} from "./export-utils";

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  sounds: SoundParams[];
  selectedIndex: number;
  steps: boolean[][];
  bpm: number;
  swing?: number;
  muted: boolean[];
  initialMode?: ExportMode;
  onNotify: (message: string) => void;
}

export type ExportMode = "sample" | "kit" | "pattern";

export default function ExportDialog({
  open,
  onClose,
  sounds,
  selectedIndex,
  steps,
  bpm,
  swing = 0,
  muted,
  initialMode = "sample",
  onNotify,
}: ExportDialogProps) {
  const [mode, setMode] = useState<ExportMode>("sample");
  const [settings, setSettings] = useState<ExportSettings>({
    sampleRate: 44100,
    bitDepth: 24,
    normalize: true,
    trim: true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onClose, busy });
  callbacks.current = { onClose, busy };
  const selected = sounds[selectedIndex];
  const activeHits = steps.reduce(
    (total, row, index) =>
      total + (muted[index] ? 0 : row.filter(Boolean).length),
    0,
  );
  const stepCount = Math.max(1, ...steps.map((row) => row.length));
  const sampleDuration = useMemo(
    () => (open && selected ? renderSound(selected, 44100).length / 44100 : 0),
    [open, selected],
  );

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    setError("");
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !callbacks.current.busy)
        callbacks.current.onClose();
      if (event.key !== "Tab") return;
      const focusable = dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), select:not(:disabled), input:not(:disabled), [tabindex="0"]',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !dialog.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  async function exportAudio() {
    if (busy || !sounds.length) return;
    setBusy(true);
    setError("");
    try {
      // Let the dialog show its rendering state before doing offline synthesis.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 20));
      if (mode === "kit") {
        const entries = sounds.map((sound, index) => {
          const filename = `${String(index + 1).padStart(2, "0")} ${safeFilename(soundName(sound, index))}.wav`;
          const samples = prepareSamples(
            renderSound(sound, settings.sampleRate),
            settings,
          );
          return { filename, samples, sound };
        });
        const manifest = {
          application: "FORM Percussion Lab",
          version: 1,
          sampleRate: settings.sampleRate,
          bitDepth: settings.bitDepth,
          channels: 1,
          normalized: settings.normalize,
          silenceTrimmed: settings.trim,
          bpm,
          swing,
          steps,
          muted,
          sounds: entries.map(({ filename, samples, sound }) => ({
            filename,
            duration: samples.length / settings.sampleRate,
            parameters: sound,
          })),
        };
        const zip = await createZip([
          ...entries.map(({ filename, samples }) => ({
            name: filename,
            data: encodeWav(samples, settings.sampleRate, settings.bitDepth),
          })),
          { name: "form-kit.json", data: JSON.stringify(manifest, null, 2) },
          {
            name: "README.txt",
            data: `FORM Percussion Lab\n\n${sounds.length} mono percussion samples\n${settings.sampleRate} Hz / ${settings.bitDepth}-bit WAV\n\nDrag the WAV files into your sampler or drum machine.\nform-kit.json contains the sound parameters and sequencer pattern.\n`,
          },
        ]);
        downloadBlob(zip, "FORM percussion kit.zip");
        onNotify(`${sounds.length} samples exported as a kit`);
      } else {
        const samples =
          mode === "sample"
            ? prepareSamples(
                renderSound(selected, settings.sampleRate),
                settings,
              )
            : prepareStereo(
                renderPattern(
                  sounds.map((params, index) => ({
                    params,
                    steps: steps[index] || [],
                    muted: muted[index],
                    velocities: (steps[index] || []).map((_, step) =>
                      step % 4 === 0 ? 1 : 0.86,
                    ),
                  })),
                  bpm,
                  {
                    sampleRate: settings.sampleRate,
                    swing: swing / 100,
                    tail: true,
                  },
                ),
                settings.normalize,
              );
        const filename =
          mode === "sample"
            ? `${safeFilename(soundName(selected, selectedIndex))}.wav`
            : `FORM pattern ${Math.round(bpm)} BPM.wav`;
        downloadBlob(
          encodeWav(samples, settings.sampleRate, settings.bitDepth),
          filename,
        );
        onNotify(
          mode === "sample"
            ? `${soundName(selected, selectedIndex)} exported`
            : "Pattern exported with full decay tails",
        );
      }
      onClose();
    } catch (cause) {
      console.error("Audio export failed", cause);
      setError(
        "The export could not be created. Try a lower sample rate or export one sound.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="modal export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        aria-describedby="export-description"
        ref={dialog}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">CORK THE CLATTER</span>
            <h2 className="modal-title" id="export-title">
              Export your sounds
            </h2>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Close export dialog"
            onClick={onClose}
            disabled={busy}
            ref={closeButton}
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="export-description" id="export-description">
            Sampler-ready WAV files, rendered right here in your browser.
          </p>
          <div
            className="export-types"
            role="group"
            aria-label="What to export"
          >
            {[
              {
                value: "sample" as const,
                title: "One sound",
                description: soundName(selected, selectedIndex),
                Icon: FileAudio,
              },
              {
                value: "kit" as const,
                title: "Full kit",
                description: `${sounds.length} WAV files + presets`,
                Icon: Package,
              },
              {
                value: "pattern" as const,
                title: "Pattern",
                description: `${stepCount} steps · ${bpm} BPM`,
                Icon: AudioLines,
              },
            ].map(({ value, title, description, Icon }) => (
              <button
                className={`export-type${mode === value ? " active" : ""}`}
                type="button"
                key={value}
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                disabled={busy}
              >
                <Icon size={22} strokeWidth={1.6} />
                <strong>{title}</strong>
                <span>{description}</span>
                {mode === value && (
                  <Check className="export-type-check" size={14} />
                )}
              </button>
            ))}
          </div>

          <div className="export-settings">
            <label className="export-field">
              <span className="field-label">Sample rate</span>
              <select
                className="select-input"
                value={settings.sampleRate}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    sampleRate: Number(event.target.value) as ExportSampleRate,
                  })
                }
                disabled={busy}
              >
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48 kHz</option>
                <option value={96000}>96 kHz</option>
              </select>
            </label>
            <div className="export-field">
              <span className="field-label" id="bit-depth-label">
                Bit depth
              </span>
              <div
                className="segmented"
                role="group"
                aria-labelledby="bit-depth-label"
              >
                {([16, 24, 32] as const).map((depth) => (
                  <button
                    type="button"
                    key={depth}
                    className={settings.bitDepth === depth ? "active" : ""}
                    aria-pressed={settings.bitDepth === depth}
                    onClick={() =>
                      setSettings({
                        ...settings,
                        bitDepth: depth as ExportBitDepth,
                      })
                    }
                    disabled={busy}
                  >
                    {depth}-bit
                  </button>
                ))}
              </div>
            </div>
          </div>

          <label className="export-option">
            <span>
              <strong>Normalize volume</strong>
              <small>Set each file to a consistent peak level.</small>
            </span>
            <input
              className="toggle"
              type="checkbox"
              checked={settings.normalize}
              onChange={(event) =>
                setSettings({ ...settings, normalize: event.target.checked })
              }
              disabled={busy}
            />
          </label>
          <label
            className={`export-option${mode === "pattern" ? " disabled" : ""}`}
          >
            <span>
              <strong>Trim silence</strong>
              <small>
                {mode === "pattern"
                  ? "Patterns preserve timing and complete decay tails."
                  : "Remove silent space around each sample."}
              </small>
            </span>
            <input
              className="toggle"
              type="checkbox"
              checked={mode !== "pattern" && settings.trim}
              onChange={(event) =>
                setSettings({ ...settings, trim: event.target.checked })
              }
              disabled={busy || mode === "pattern"}
            />
          </label>
          <div className="export-meta">
            <FileAudio size={15} />
            <span>
              {mode === "kit" ? "ZIP archive" : "WAV audio"} ·{" "}
              {mode === "pattern" ? "Stereo" : "Mono"} ·{" "}
              {settings.sampleRate.toLocaleString()} Hz · {settings.bitDepth}
              -bit
              {mode === "pattern"
                ? ` · ${activeHits} hits`
                : mode === "sample"
                  ? ` · ${sampleDuration.toFixed(2)} s before trim`
                  : ""}
            </span>
          </div>
          {mode === "pattern" && activeHits === 0 && (
            <p className="export-warning">
              Your pattern has no active hits. Add a few steps to hear something
              in the export.
            </p>
          )}
          {error && (
            <p className="export-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="ghost-button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={exportAudio}
            disabled={
              busy || !selected || (mode === "pattern" && activeHits === 0)
            }
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <Download size={17} />
            )}
            {busy
              ? "Rendering…"
              : mode === "kit"
                ? "Download kit"
                : "Download WAV"}
          </button>
        </div>
      </div>
    </div>
  );
}
