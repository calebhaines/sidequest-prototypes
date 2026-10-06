import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  AudioLines,
  CircleDot,
  Cpu,
  Layers3,
  Link2,
  Plus,
  Power,
  SlidersHorizontal,
  Upload,
  Waves,
  X,
} from "lucide-react";
import { ensureArchitecture, ENGINE_LABELS, sampleWavetable } from "./audio";
import type {
  GrainSample,
  LayerId,
  ModRoute,
  SoundParams,
  SynthArchitecture,
  SynthEngine,
  SynthLayer,
} from "./types";
import { EnvelopeDisplay, Knob } from "./Visuals";
import "./layer-lab.css";

type LayerLabProps = {
  sound: SoundParams;
  onChange: (architecture: SynthArchitecture) => void;
  onNotify: (message: string) => void;
  onAudition?: () => void;
  onAuditionLayer?: (layerId: LayerId) => void;
  onImportSample?: (layerId: LayerId, sample: GrainSample) => void;
};

const ENGINES: SynthEngine[] = [
  "percussion",
  "subtractive",
  "fm",
  "wavetable",
  "granular",
];
const LETTERS = ["A", "B", "C"];
const ENGINE_COPY: Record<SynthEngine, string> = {
  percussion:
    "A familiar drum foundation. Shape its oscillator, pitch and noise in the Global shaping tab.",
  subtractive:
    "Blend two oscillators, then carve out a punchy body with a resonant filter and a fast filter envelope.",
  fm: "Four sine operators, four algorithms. Turn simple tones into bells, skins, metallic strikes and impossible drums.",
  wavetable:
    "Move through a bank of waveforms. Animate the table and bend its phase for bright, evolving percussion.",
  granular:
    "Scatter tiny, enveloped fragments of a texture or your own recording into a new percussive material.",
};
const MOD_SOURCES: { value: ModRoute["source"]; label: string }[] = [
  { value: "lfo1", label: "LFO 1" },
  { value: "lfo2", label: "LFO 2" },
  { value: "pitchEnv", label: "Pitch envelope" },
  { value: "ampEnv", label: "Amp envelope" },
  { value: "random", label: "Random per hit" },
];
const TARGETS = [
  ["pitch", "Pitch"],
  ["cutoff", "Filter cutoff"],
  ["fmIndex", "FM index"],
  ["wtPosition", "Table position"],
  ["grainPosition", "Grain position"],
  ["grainDensity", "Grain density"],
  ["level", "Level"],
] as const;
function supportsDestination(engine: SynthEngine, destination: string) {
  return (
    destination === "pitch" ||
    destination === "level" ||
    (destination === "cutoff" && engine === "subtractive") ||
    (destination === "fmIndex" && engine === "fm") ||
    (destination === "wtPosition" && engine === "wavetable") ||
    ((destination === "grainPosition" || destination === "grainDensity") &&
      engine === "granular")
  );
}
function inactiveRouteReason(route: ModRoute, architecture: SynthArchitecture) {
  if (route.target === "master.drive") {
    if (!architecture.layers.some((item) => item.enabled && item.level > 0))
      return "Enable a layer and raise its level to hear this route.";
  } else {
    const [id, destination] = route.target.split(".");
    const target = architecture.layers.find((item) => item.id === id);
    if (!target) return "Choose a destination to hear this route.";
    if (!supportsDestination(target.engine, destination)) {
      const name = TARGETS.find(([suffix]) => suffix === destination)?.[1];
      return `Layer ${id.toUpperCase()} uses ${ENGINE_LABELS[target.engine]}, which does not use ${name?.toLowerCase() ?? "this control"}. Choose another destination or engine.`;
    }
    if (!target.enabled)
      return `Layer ${id.toUpperCase()} is switched off. Enable it to hear this route.`;
    if (target.level === 0)
      return `Layer ${id.toUpperCase()} level is zero. Raise its level to hear this route.`;
  }
  if (route.amount === 0)
    return "Raise the route amount to hear this connection.";
  if (route.source === "lfo1" || route.source === "lfo2") {
    const index = route.source === "lfo1" ? 0 : 1;
    if (architecture.lfos[index].depth === 0)
      return `LFO ${index + 1} depth is zero. Raise it to hear this route.`;
  }
  return undefined;
}
const percent = (value: number) => `${Math.round(value * 100)}%`;
const signedPercent = (value: number) =>
  `${value > 0 ? "+" : ""}${Math.round(value * 100)}%`;
const frequency = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`;

function EngineIcon({
  engine,
  size = 18,
}: {
  engine: SynthEngine;
  size?: number;
}) {
  const Icon =
    engine === "fm"
      ? Cpu
      : engine === "granular"
        ? CircleDot
        : engine === "wavetable"
          ? Waves
          : engine === "subtractive"
            ? SlidersHorizontal
            : AudioLines;
  return <Icon size={size} strokeWidth={1.6} aria-hidden="true" />;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`ll-field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function SampleWave({
  data,
  position,
  reverse,
}: {
  data: number[];
  position: number;
  reverse: boolean;
}) {
  const path = useMemo(() => {
    const points: string[] = [];
    const count = Math.min(240, data.length);
    for (let bin = 0; bin < count; bin++) {
      let peak = 0;
      const first = Math.floor((bin * data.length) / count);
      const end = Math.max(
        first + 1,
        Math.floor(((bin + 1) * data.length) / count),
      );
      for (let n = first; n < end; n++)
        peak = Math.max(peak, Math.abs(data[n] || 0));
      const x = (bin / Math.max(1, count - 1)) * 500;
      points.push(
        `M${x.toFixed(1)} ${(26 - Math.min(1, peak) * 23).toFixed(1)}V${(26 + Math.min(1, peak) * 23).toFixed(1)}`,
      );
    }
    return points.join(" ");
  }, [data]);
  return (
    <svg
      className="ll-sample-wave"
      viewBox="0 0 500 52"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Imported sample waveform, grain position ${percent(position)}${reverse ? ", reversed" : ""}`}
    >
      <path d="M0 26H500" className="ll-visual-grid" />
      <path
        d={path}
        className="ll-sample-peaks"
        transform={reverse ? "translate(500,0) scale(-1,1)" : undefined}
      />
      <line
        x1={position * 500}
        x2={position * 500}
        y1="0"
        y2="52"
        className="ll-position-line"
      />
    </svg>
  );
}

function FmDiagram({
  algorithm,
}: {
  algorithm: SynthLayer["fm"]["algorithm"];
}) {
  const patterns = {
    cascade: [
      "4 → 3 → 2 → 1",
      "One long modulation chain. Deep, complex harmonics.",
    ],
    parallel: [
      "2 + 3 + 4 → 1",
      "Three modulators feed one carrier. Tunable metallic layers.",
    ],
    feedback: [
      "4 ↻ → 3 → 2 → 1",
      "A feedback loop adds grit before the operators cascade.",
    ],
    stack: [
      "2 → 1  +  4 → 3",
      "Two independent FM pairs. Balance body and bright overtones.",
    ],
  };
  const [graph, caption] = patterns[algorithm];
  return (
    <div className="ll-fm-graph">
      <div aria-label={`FM algorithm: ${graph}`}>
        <span>{graph}</span>
        <ArrowRight size={14} />
        <span className="ll-output-label">OUT</span>
      </div>
      <p>{caption}</p>
    </div>
  );
}

function WavetablePreview({
  layer,
  frequency,
}: {
  layer: SynthLayer;
  frequency: number;
}) {
  const { table, position, warp } = layer.wavetable;
  const path = useMemo(() => {
    const points: string[] = [];
    for (let index = 0; index <= 260; index++) {
      const value = sampleWavetable(
        table,
        index / 260,
        position,
        warp,
        frequency * Math.pow(2, layer.tune / 12),
      );
      points.push(
        `${index === 0 ? "M" : "L"}${index * 2} ${(29 - value * 23).toFixed(2)}`,
      );
    }
    return points.join(" ");
  }, [table, position, warp, frequency, layer.tune]);
  return (
    <div className="ll-table-preview">
      <svg
        viewBox="0 0 520 58"
        preserveAspectRatio="none"
        role="img"
        aria-label={`${table} wavetable waveform at ${percent(position)} position`}
      >
        <path
          d="M0 29H520M130 0V58M260 0V58M390 0V58"
          className="ll-visual-grid"
        />
        <path d={path} className="ll-table-wave" />
      </svg>
      <span>ONE CYCLE · ACTUAL WAVETABLE</span>
    </div>
  );
}

export default function LayerLab({
  sound,
  onChange,
  onNotify,
  onAudition,
  onAuditionLayer,
  onImportSample,
}: LayerLabProps) {
  const architecture = useMemo(() => ensureArchitecture(sound), [sound]);
  const latestArchitecture = useRef(architecture);
  latestArchitecture.current = architecture;
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState<"engine" | "modulation">("engine");
  const [importing, setImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const layer = architecture.layers[selected];
  const interaction = architecture.interaction;
  const activeLfoRoutes = architecture.lfos.map((_, index) =>
    architecture.routes.some(
      (route) =>
        route.source === `lfo${index + 1}` &&
        !inactiveRouteReason(route, architecture),
    ),
  );

  function setLayer(index: number, patch: Partial<SynthLayer>) {
    onChange({
      ...architecture,
      layers: architecture.layers.map((item, n) =>
        n === index ? { ...item, ...patch } : item,
      ),
    });
  }
  function changeLayer(patch: Partial<SynthLayer>) {
    setLayer(selected, patch);
  }
  function engineParam<
    K extends "subtractive" | "fm" | "wavetable" | "granular" | "envelope",
  >(group: K, patch: Partial<SynthLayer[K]>) {
    changeLayer({ [group]: { ...layer[group], ...patch } });
  }
  function setInteraction(patch: Partial<SynthArchitecture["interaction"]>) {
    const next = { ...interaction, ...patch };
    if (next.source === next.target) {
      if (patch.source !== undefined)
        next.target = ((next.source + 1) % 3) as 0 | 1 | 2;
      else next.source = ((next.target + 1) % 3) as 0 | 1 | 2;
    }
    onChange({ ...architecture, interaction: next });
  }
  function editRoute(id: string, patch: Partial<ModRoute>) {
    onChange({
      ...architecture,
      routes: architecture.routes.map((route) =>
        route.id === id ? { ...route, ...patch } : route,
      ),
    });
  }
  function addRoute() {
    if (architecture.routes.length >= 8) return;
    onChange({
      ...architecture,
      routes: [
        ...architecture.routes,
        {
          id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          source: "lfo1",
          target:
            `${layer.id}.${layer.engine === "wavetable" ? "wtPosition" : layer.engine === "fm" ? "fmIndex" : layer.engine === "granular" ? "grainPosition" : "pitch"}` as ModRoute["target"],
          amount: 0.25,
        },
      ],
    });
  }
  async function importSample(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      onNotify("Choose an audio file smaller than 10 MB.");
      return;
    }
    const targetIndex = selected;
    const targetId = layer.id;
    setImporting(true);
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      if (!buffer.length) throw new Error("Empty audio");
      const sampleRate = 22050;
      const frames = Math.min(
        44100,
        Math.max(1, Math.floor(buffer.duration * sampleRate)),
      );
      const resampler = new OfflineAudioContext(1, frames, sampleRate);
      const source = resampler.createBufferSource();
      source.buffer = buffer;
      source.connect(resampler.destination);
      source.start(0, 0, Math.min(buffer.duration, 2));
      const mono = (await resampler.startRendering()).getChannelData(0);
      const data: number[] = [];
      for (let n = 0; n < frames; n++) {
        data.push(Number(Math.max(-1, Math.min(1, mono[n])).toFixed(5)));
      }
      const sample = { name: file.name, sampleRate, data };
      // Keep the layer that initiated the import, even if another layer is selected meanwhile.
      if (onImportSample) onImportSample(targetId, sample);
      else {
        const current = latestArchitecture.current;
        const importedLayer = current.layers[targetIndex];
        onChange({
          ...current,
          layers: current.layers.map((item) =>
            item.id === targetId
              ? {
                  ...item,
                  engine: "granular",
                  enabled: true,
                  granular: {
                    ...importedLayer.granular,
                    source: "sample",
                    position: 0.25,
                    sample,
                  },
                }
              : item,
          ),
        });
      }
      onNotify(
        `${file.name} loaded${buffer.duration > 2 ? " · cropped to first 2 seconds" : ""} · mono at 22.05 kHz. Your audio stays in this browser.`,
      );
    } catch {
      onNotify(
        "This audio file could not be decoded. Try a WAV, MP3 or OGG file supported by your browser.",
      );
    } finally {
      await context?.close().catch(() => undefined);
      setImporting(false);
    }
  }

  const signalMessage =
    interaction.type === "none"
      ? "Blend the layers freely, or connect two engines to make them influence each other."
      : interaction.type === "fm"
        ? `Layer ${LETTERS[interaction.source]} bends the oscillator pitch of layer ${LETTERS[interaction.target]} at audio rate.`
        : interaction.type === "ring"
          ? `Multiply layers ${LETTERS[interaction.source]} and ${LETTERS[interaction.target]} for metallic sum-and-difference tones.`
          : `Layer ${LETTERS[interaction.source]} shapes the amplitude of layer ${LETTERS[interaction.target]} at audio rate.`;

  return (
    <section className="layer-lab" aria-label="Modular synthesis controls">
      <div className="ll-header">
        <div>
          <div className="ll-eyebrow">
            <Layers3 size={13} /> THREE-LAYER SYNTHESIS
          </div>
          <h2>Three ingredients. One voice.</h2>
          <p>Build the body, snap, and air. Each layer can take a different utensil.</p>
        </div>
        <span className="ll-engine-count">
          <span />
          {architecture.layers.filter((item) => item.enabled).length} layers
          active
        </span>
      </div>

      <div className="ll-layer-grid" role="group" aria-label="Sound layers">
        {architecture.layers.map((item, index) => (
          <div
            key={item.id}
            className={`ll-layer-card${selected === index ? " is-selected" : ""}${item.enabled ? "" : " is-muted"}`}
          >
            <button
              type="button"
              className="ll-layer-select"
              onClick={() => setSelected(index)}
              aria-pressed={selected === index}
              aria-label={`Edit layer ${LETTERS[index]} ${ENGINE_LABELS[item.engine]}`}
            >
              <span className="ll-layer-letter">{LETTERS[index]}</span>
              <span className="ll-layer-name">
                <span>LAYER {LETTERS[index]}</span>
                <strong>{ENGINE_LABELS[item.engine]}</strong>
              </span>
              <EngineIcon engine={item.engine} />
            </button>
            <div className="ll-layer-mixer">
              <button
                type="button"
                className={`ll-power${item.enabled ? " is-on" : ""}`}
                onClick={() => setLayer(index, { enabled: !item.enabled })}
                aria-pressed={item.enabled}
                aria-label={`${item.enabled ? "Disable" : "Enable"} layer ${LETTERS[index]}`}
                title={`${item.enabled ? "Disable" : "Enable"} layer ${LETTERS[index]}`}
              >
                <Power size={13} />
              </button>
              <label className="ll-level">
                <span className="sr-only">Layer {LETTERS[index]} level</span>
                <input
                  type="range"
                  aria-label={`Layer ${LETTERS[index]} level`}
                  min="0"
                  max="1"
                  step="0.01"
                  value={item.level}
                  onChange={(event) =>
                    setLayer(index, {
                      level: Number(event.currentTarget.value),
                    })
                  }
                />
                <span>{percent(item.level)}</span>
              </label>
            </div>
          </div>
        ))}
      </div>

      <div
        className={`ll-interaction${interaction.type !== "none" ? " is-connected" : ""}`}
      >
        <div className="ll-interaction-label">
          <Link2 size={15} />
          <strong>Connect layers</strong>
          <span>Audio-rate interaction</span>
        </div>
        <div className="ll-interaction-controls">
          <Field label="Source">
            <select
              aria-label="Interaction source layer"
              value={interaction.source}
              onChange={(event) =>
                setInteraction({
                  source: Number(event.currentTarget.value) as 0 | 1 | 2,
                })
              }
            >
              {LETTERS.map((letter, index) => (
                <option value={index} key={letter}>
                  Layer {letter}
                </option>
              ))}
            </select>
          </Field>
          <ArrowRight className="ll-routing-arrow" size={16} />
          <Field label="Interaction">
            <select
              aria-label="Layer interaction type"
              value={interaction.type}
              onChange={(event) =>
                setInteraction({
                  type: event.currentTarget.value as typeof interaction.type,
                })
              }
            >
              <option value="none">Independent</option>
              <option value="fm">Frequency modulation</option>
              <option value="ring">Ring modulation</option>
              <option value="am">Amplitude modulation</option>
            </select>
          </Field>
          <ArrowRight className="ll-routing-arrow" size={16} />
          <Field label="Target">
            <select
              aria-label="Interaction target layer"
              value={interaction.target}
              onChange={(event) =>
                setInteraction({
                  target: Number(event.currentTarget.value) as 0 | 1 | 2,
                })
              }
            >
              {LETTERS.map((letter, index) => (
                <option value={index} key={letter}>
                  Layer {letter}
                </option>
              ))}
            </select>
          </Field>
          <label className="ll-depth">
            <span>
              Depth <b>{percent(interaction.amount)}</b>
            </span>
            <input
              type="range"
              aria-label="Layer interaction depth"
              min="0"
              max="1"
              step="0.01"
              value={interaction.amount}
              disabled={interaction.type === "none"}
              onChange={(event) =>
                setInteraction({ amount: Number(event.currentTarget.value) })
              }
            />
          </label>
        </div>
        <p>
          {signalMessage}
          {interaction.type !== "none" &&
            (!architecture.layers[interaction.source].enabled ||
              !architecture.layers[interaction.target].enabled) && (
              <span className="ll-route-hint">
                {" "}
                Enable both connected layers to hear the interaction.
              </span>
            )}
        </p>
      </div>

      <div
        className="ll-tabs"
        role="tablist"
        aria-label="Synthesis editor views"
      >
        <button
          type="button"
          id="ll-engine-tab"
          role="tab"
          aria-controls="ll-engine-panel"
          aria-selected={tab === "engine"}
          onClick={() => setTab("engine")}
        >
          <SlidersHorizontal size={14} />
          Engine controls
        </button>
        <button
          type="button"
          id="ll-modulation-tab"
          role="tab"
          aria-controls="ll-modulation-panel"
          aria-selected={tab === "modulation"}
          onClick={() => setTab("modulation")}
        >
          <Activity size={14} />
          Modulation<span>{architecture.routes.length}</span>
        </button>
        <span className="ll-tab-note">
          {tab === "engine"
            ? `EDITING LAYER ${LETTERS[selected]}`
            : "MOVEMENT & EXPERIMENTS"}
        </span>
      </div>

      {tab === "engine" ? (
        <div
          className="ll-editor"
          id="ll-engine-panel"
          role="tabpanel"
          aria-labelledby="ll-engine-tab"
        >
          <div className="ll-editor-header">
            <div className="ll-editor-engine">
              <span className="ll-layer-letter">{LETTERS[selected]}</span>
              <Field label={`Layer ${LETTERS[selected]} engine`}>
                <select
                  aria-label={`Layer ${LETTERS[selected]} synthesis engine`}
                  value={layer.engine}
                  onChange={(event) =>
                    changeLayer({
                      engine: event.currentTarget.value as SynthEngine,
                      enabled: true,
                    })
                  }
                >
                  {ENGINES.map((engine) => (
                    <option key={engine} value={engine}>
                      {ENGINE_LABELS[engine]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p>{ENGINE_COPY[layer.engine]}</p>
          </div>
          {onAuditionLayer && (
            <div className="ll-layer-preview">
              <button
                type="button"
                className="ll-audition-layer"
                onClick={() => onAuditionLayer(layer.id)}
              >
                <AudioLines size={16} />
                Audition layer {LETTERS[selected]}
              </button>
              <span>Hear this layer on its own.</span>
            </div>
          )}
          {!layer.enabled ? (
            <p className="ll-disabled-note" role="status">
              Layer {LETTERS[selected]} is switched off.{" "}
              <button
                type="button"
                onClick={() => changeLayer({ enabled: true })}
              >
                Enable layer
              </button>{" "}
              to hear it in the mix. You can still edit and audition it here.
            </p>
          ) : layer.level === 0 ? (
            <p className="ll-disabled-note" role="status">
              Layer {LETTERS[selected]} level is zero. Raise its level above to
              hear it in the mix. Audition layer lets you hear it on its own.
            </p>
          ) : null}

          {layer.engine === "percussion" && (
            <div className="ll-percussion-info">
              <AudioLines size={30} strokeWidth={1} />
              <div>
                <strong>Your original percussion engine, now a layer.</strong>
                <p>
                  Use the Global shaping tab for its body, pitch sweep and
                  noise. Add an FM, wavetable or granular layer for a different
                  material.
                </p>
              </div>
            </div>
          )}

          {layer.engine === "subtractive" && (
            <>
              <div className="ll-inline-fields">
                <Field label="Oscillator 1">
                  <select
                    aria-label="Subtractive oscillator 1 waveform"
                    value={layer.subtractive.waveform}
                    onChange={(event) =>
                      engineParam("subtractive", {
                        waveform: event.currentTarget
                          .value as typeof layer.subtractive.waveform,
                      })
                    }
                  >
                    {["sine", "triangle", "sawtooth", "square"].map((wave) => (
                      <option value={wave} key={wave}>
                        {wave === "sawtooth"
                          ? "Sawtooth"
                          : wave[0].toUpperCase() + wave.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
                <span className="ll-field-plus">+</span>
                <Field label="Oscillator 2">
                  <select
                    aria-label="Subtractive oscillator 2 waveform"
                    value={layer.subtractive.waveform2}
                    onChange={(event) =>
                      engineParam("subtractive", {
                        waveform2: event.currentTarget
                          .value as typeof layer.subtractive.waveform2,
                      })
                    }
                  >
                    {["sine", "triangle", "sawtooth", "square"].map((wave) => (
                      <option value={wave} key={wave}>
                        {wave === "sawtooth"
                          ? "Sawtooth"
                          : wave[0].toUpperCase() + wave.slice(1)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Filter">
                  <select
                    aria-label="Subtractive filter type"
                    value={layer.subtractive.filterType}
                    onChange={(event) =>
                      engineParam("subtractive", {
                        filterType: event.currentTarget
                          .value as typeof layer.subtractive.filterType,
                      })
                    }
                  >
                    <option value="lowpass">Low-pass</option>
                    <option value="highpass">High-pass</option>
                    <option value="bandpass">Band-pass</option>
                  </select>
                </Field>
              </div>
              <div className="ll-knobs ll-knobs-five">
                <Knob
                  label="Osc. blend"
                  value={layer.subtractive.blend}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  onChange={(blend) => engineParam("subtractive", { blend })}
                />
                <Knob
                  label="Detune"
                  value={layer.subtractive.detune}
                  min={-100}
                  max={100}
                  step={1}
                  unit="ct"
                  onChange={(detune) => engineParam("subtractive", { detune })}
                />
                <Knob
                  label="Cutoff"
                  value={layer.subtractive.cutoff}
                  min={20}
                  max={20000}
                  step={1}
                  log
                  unit="Hz"
                  format={frequency}
                  accent
                  onChange={(cutoff) => engineParam("subtractive", { cutoff })}
                />
                <Knob
                  label="Resonance"
                  value={layer.subtractive.resonance}
                  min={0}
                  max={0.98}
                  step={0.01}
                  format={percent}
                  onChange={(resonance) =>
                    engineParam("subtractive", { resonance })
                  }
                />
                <Knob
                  label="Filter envelope"
                  value={layer.subtractive.filterEnvelope}
                  min={-1}
                  max={1}
                  step={0.01}
                  format={signedPercent}
                  onChange={(filterEnvelope) =>
                    engineParam("subtractive", { filterEnvelope })
                  }
                />
              </div>
              {(layer.subtractive.blend === 0 ||
                layer.subtractive.blend === 1) && (
                <p className="ll-control-note">
                  {layer.subtractive.blend === 0
                    ? "Oscillator 2 is silent at this blend. Increase Osc. blend to hear its waveform and detune."
                    : "Oscillator 1 is silent at this blend. Reduce Osc. blend to hear its waveform."}
                </p>
              )}
            </>
          )}

          {layer.engine === "fm" && (
            <>
              <div className="ll-fm-top">
                <Field label="Operator algorithm">
                  <select
                    aria-label="FM operator algorithm"
                    value={layer.fm.algorithm}
                    onChange={(event) =>
                      engineParam("fm", {
                        algorithm: event.currentTarget
                          .value as typeof layer.fm.algorithm,
                      })
                    }
                  >
                    <option value="cascade">Cascade · 4 → 3 → 2 → 1</option>
                    <option value="parallel">Parallel · 2 + 3 + 4 → 1</option>
                    <option value="feedback">Feedback · looping cascade</option>
                    <option value="stack">Stack · two FM pairs</option>
                  </select>
                </Field>
                <FmDiagram algorithm={layer.fm.algorithm} />
              </div>
              <div className="ll-operators">
                {layer.fm.ratios.map((ratio, operator) => (
                  <div
                    key={operator}
                    className={`ll-operator${operator === 0 || (layer.fm.algorithm === "stack" && operator === 2) ? " is-carrier" : ""}`}
                  >
                    <div>
                      <span>OP {operator + 1}</span>
                      <small>
                        {operator === 0 ||
                        (layer.fm.algorithm === "stack" && operator === 2)
                          ? "CARRIER"
                          : "MODULATOR"}
                      </small>
                    </div>
                    <Field label="Frequency ratio">
                      <input
                        type="number"
                        aria-label={`FM operator ${operator + 1} frequency ratio`}
                        min="0.125"
                        max="16"
                        step="0.001"
                        value={ratio}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (!Number.isFinite(value)) return;
                          const ratios = [
                            ...layer.fm.ratios,
                          ] as typeof layer.fm.ratios;
                          ratios[operator] = Math.max(
                            0.125,
                            Math.min(16, value),
                          );
                          engineParam("fm", { ratios });
                        }}
                      />
                    </Field>
                    <Field label="Operator decay · ms">
                      <input
                        type="number"
                        aria-label={`FM operator ${operator + 1} decay`}
                        min="1"
                        max="3000"
                        step="0.1"
                        value={layer.fm.decays[operator]}
                        onChange={(event) => {
                          const value = Number(event.currentTarget.value);
                          if (!Number.isFinite(value)) return;
                          const decays = [
                            ...layer.fm.decays,
                          ] as typeof layer.fm.decays;
                          decays[operator] = Math.max(1, Math.min(3000, value));
                          engineParam("fm", { decays });
                        }}
                      />
                    </Field>
                    <label className="ll-operator-level">
                      <span>
                        Level <b>{percent(layer.fm.levels[operator])}</b>
                      </span>
                      <input
                        type="range"
                        aria-label={`FM operator ${operator + 1} level`}
                        min="0"
                        max="1"
                        step="0.01"
                        value={layer.fm.levels[operator]}
                        onChange={(event) => {
                          const levels = [
                            ...layer.fm.levels,
                          ] as typeof layer.fm.levels;
                          levels[operator] = Number(event.currentTarget.value);
                          engineParam("fm", { levels });
                        }}
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="ll-knobs ll-knobs-three">
                <Knob
                  label="FM index"
                  value={layer.fm.index}
                  min={0}
                  max={24}
                  step={0.1}
                  accent
                  onChange={(index) => engineParam("fm", { index })}
                />
                <Knob
                  label="Index decay"
                  value={layer.fm.indexDecay}
                  min={5}
                  max={3000}
                  step={1}
                  log
                  unit="ms"
                  onChange={(indexDecay) => engineParam("fm", { indexDecay })}
                />
                <Knob
                  label="Feedback"
                  value={layer.fm.feedback}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  onChange={(feedback) => engineParam("fm", { feedback })}
                />
              </div>
              {layer.fm.index === 0 &&
                !architecture.routes.some(
                  (route) =>
                    route.target === `${layer.id}.fmIndex` &&
                    !inactiveRouteReason(route, architecture),
                ) && (
                  <p className="ll-control-note">
                    Index is zero. Only{" "}
                    {layer.fm.algorithm === "stack"
                      ? "operators 1 and 3 are heard"
                      : "operator 1 is heard"}
                    . Raise FM index to hear the other operators shape the tone.
                  </p>
                )}
            </>
          )}

          {layer.engine === "wavetable" && (
            <>
              <div className="ll-table-picker">
                <Field label="Wavetable bank">
                  <select
                    aria-label="Wavetable bank"
                    value={layer.wavetable.table}
                    onChange={(event) =>
                      engineParam("wavetable", {
                        table: event.currentTarget
                          .value as typeof layer.wavetable.table,
                      })
                    }
                  >
                    <option value="basic">Basic · classic waveforms</option>
                    <option value="fold">Fold · harmonic folds</option>
                    <option value="vowel">Vowel · vocal formants</option>
                    <option value="metal">Metal · bright partials</option>
                  </select>
                </Field>
                <WavetablePreview
                  layer={layer}
                  frequency={sound.tone.frequency}
                />
              </div>
              <div className="ll-knobs ll-knobs-four">
                <Knob
                  label="Table position"
                  value={layer.wavetable.position}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  accent
                  onChange={(position) =>
                    engineParam("wavetable", { position })
                  }
                />
                <Knob
                  label="Scan depth"
                  value={layer.wavetable.scan}
                  min={-1}
                  max={1}
                  step={0.01}
                  format={signedPercent}
                  onChange={(scan) => engineParam("wavetable", { scan })}
                />
                <Knob
                  label="Scan rate"
                  value={layer.wavetable.scanRate}
                  min={0}
                  max={20}
                  step={0.1}
                  unit="Hz"
                  onChange={(scanRate) =>
                    engineParam("wavetable", { scanRate })
                  }
                />
                <Knob
                  label="Phase warp"
                  value={layer.wavetable.warp}
                  min={-1}
                  max={1}
                  step={0.01}
                  format={signedPercent}
                  onChange={(warp) => engineParam("wavetable", { warp })}
                />
              </div>
              {layer.wavetable.scan === 0 ? (
                <p className="ll-control-note">
                  Scan depth is zero. Increase it to hear changes to Scan rate.
                </p>
              ) : layer.wavetable.scanRate === 0 ? (
                <p className="ll-control-note">
                  At 0 Hz, scanning makes one gradual sweep after each hit.
                  Raise Scan rate for repeating motion.
                </p>
              ) : null}
            </>
          )}

          {layer.engine === "granular" && (
            <>
              <div className="ll-grain-source">
                <div className="ll-inline-fields">
                  <Field label="Grain source">
                    <select
                      aria-label="Granular source"
                      value={layer.granular.source}
                      onChange={(event) =>
                        engineParam("granular", {
                          source: event.currentTarget
                            .value as typeof layer.granular.source,
                        })
                      }
                    >
                      <option value="internal">Built-in texture</option>
                      <option value="sample" disabled={!layer.granular.sample}>
                        Imported recording
                        {!layer.granular.sample ? " · import first" : ""}
                      </option>
                    </select>
                  </Field>
                  {layer.granular.source === "internal" && (
                    <Field label="Material">
                      <select
                        aria-label="Granular texture material"
                        value={layer.granular.texture}
                        onChange={(event) =>
                          engineParam("granular", {
                            texture: event.currentTarget
                              .value as typeof layer.granular.texture,
                          })
                        }
                      >
                        <option value="metal">Metal</option>
                        <option value="wood">Wood</option>
                        <option value="noise">Noise</option>
                        <option value="vocal">Vocal</option>
                      </select>
                    </Field>
                  )}
                  <button
                    type="button"
                    className="ll-import-button"
                    onClick={() => fileInput.current?.click()}
                    disabled={importing}
                  >
                    <Upload size={14} />
                    {importing
                      ? "Decoding audio…"
                      : layer.granular.sample
                        ? "Replace sample"
                        : "Import audio"}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="audio/*,.wav,.mp3,.ogg,.flac,.aiff,.aif,.m4a"
                    className="ll-file-input"
                    aria-label="Import granular audio sample"
                    onChange={importSample}
                  />
                </div>
                {layer.granular.sample && layer.granular.source === "sample" ? (
                  <div className="ll-imported-sample">
                    <div>
                      <strong title={layer.granular.sample.name}>
                        {layer.granular.sample.name}
                      </strong>
                      <span>
                        {(
                          layer.granular.sample.data.length /
                          layer.granular.sample.sampleRate
                        ).toFixed(2)}
                        s · mono ·{" "}
                        {(layer.granular.sample.sampleRate / 1000).toFixed(2)}{" "}
                        kHz
                      </span>
                    </div>
                    <SampleWave
                      data={layer.granular.sample.data}
                      position={layer.granular.position}
                      reverse={layer.granular.reverse}
                    />
                  </div>
                ) : (
                  <p className="ll-source-note">
                    Bring a field recording, a drum hit or your own voice. First
                    2 seconds · mono at 22.05 kHz · 10 MB maximum. Audio travels
                    with your project.
                  </p>
                )}
              </div>
              <div className="ll-knobs ll-knobs-six">
                <Knob
                  label="Position"
                  value={layer.granular.position}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  accent
                  onChange={(position) => engineParam("granular", { position })}
                />
                <Knob
                  label="Grain size"
                  value={layer.granular.size}
                  min={5}
                  max={250}
                  step={1}
                  log
                  unit="ms"
                  onChange={(size) => engineParam("granular", { size })}
                />
                <Knob
                  label="Density"
                  value={layer.granular.density}
                  min={1}
                  max={180}
                  step={1}
                  unit="Hz"
                  onChange={(density) => engineParam("granular", { density })}
                />
                <Knob
                  label="Position spray"
                  value={layer.granular.spray}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  onChange={(spray) => engineParam("granular", { spray })}
                />
                <Knob
                  label="Time jitter"
                  value={layer.granular.jitter}
                  min={0}
                  max={1}
                  step={0.01}
                  format={percent}
                  onChange={(jitter) => engineParam("granular", { jitter })}
                />
                <Knob
                  label="Grain pitch"
                  value={layer.granular.pitch}
                  min={-24}
                  max={24}
                  step={1}
                  unit="st"
                  onChange={(pitch) => engineParam("granular", { pitch })}
                />
              </div>
              <label className="ll-reverse">
                <input
                  type="checkbox"
                  checked={layer.granular.reverse}
                  onChange={(event) =>
                    engineParam("granular", {
                      reverse: event.currentTarget.checked,
                    })
                  }
                />
                <span>Reverse grains</span>
                <small>Turn the texture inside out.</small>
              </label>
            </>
          )}

          <div className="ll-envelope">
            <div className="ll-envelope-title">
              <div>
                <span>LAYER {LETTERS[selected]} SHAPE</span>
                <strong>Pitch & amplitude</strong>
              </div>
              <EnvelopeDisplay
                attack={layer.envelope.attack}
                decay={layer.envelope.decay}
                release={layer.envelope.release}
              />
            </div>
            <div className="ll-knobs ll-knobs-five">
              <Knob
                label="Layer tune"
                value={layer.tune}
                min={-48}
                max={48}
                step={1}
                unit="st"
                onChange={(tune) => changeLayer({ tune })}
              />
              <Knob
                label="Attack"
                value={layer.envelope.attack}
                min={0}
                max={1000}
                step={0.1}
                unit="ms"
                onChange={(attack) => engineParam("envelope", { attack })}
              />
              <Knob
                label="Decay"
                value={layer.envelope.decay}
                min={5}
                max={3000}
                step={1}
                log
                unit="ms"
                accent
                onChange={(decay) => engineParam("envelope", { decay })}
              />
              <Knob
                label="Release"
                value={layer.envelope.release}
                min={0}
                max={1500}
                step={1}
                unit="ms"
                onChange={(release) => engineParam("envelope", { release })}
              />
              <Knob
                label="Curve"
                value={layer.envelope.curve}
                min={0.25}
                max={4}
                step={0.05}
                format={(value) => `${value.toFixed(2)}×`}
                onChange={(curve) => engineParam("envelope", { curve })}
              />
            </div>
          </div>
          {onAudition && (
            <button type="button" className="ll-audition" onClick={onAudition}>
              <AudioLines size={15} />
              Audition sound<span>All active layers</span>
            </button>
          )}
        </div>
      ) : (
        <div
          className="ll-modulation"
          id="ll-modulation-panel"
          role="tabpanel"
          aria-labelledby="ll-modulation-tab"
        >
          <div className="ll-mod-intro">
            <strong>Stir occasionally. Or continuously.</strong>
            <p>
              Route an LFO, envelope or per-hit random value into any layer.
              Positive and negative amounts push in opposite directions.
            </p>
          </div>
          <div className="ll-lfo-grid">
            {architecture.lfos.map((lfo, index) => (
              <div className="ll-lfo-card" key={index}>
                <div className="ll-lfo-heading">
                  <span>
                    <Activity size={15} />
                    LFO {index + 1}
                  </span>
                  <Field label="Shape">
                    <select
                      aria-label={`LFO ${index + 1} shape`}
                      value={lfo.shape}
                      onChange={(event) => {
                        const lfos = [
                          ...architecture.lfos,
                        ] as SynthArchitecture["lfos"];
                        lfos[index] = {
                          ...lfo,
                          shape: event.currentTarget.value as typeof lfo.shape,
                        };
                        onChange({ ...architecture, lfos });
                      }}
                    >
                      <option value="sine">Sine</option>
                      <option value="triangle">Triangle</option>
                      <option value="square">Square</option>
                      <option value="sample-hold">Sample & hold</option>
                    </select>
                  </Field>
                </div>
                <p
                  className={`ll-lfo-status${activeLfoRoutes[index] ? " is-connected" : ""}`}
                >
                  <span>
                    {lfo.depth === 0
                      ? "Depth zero"
                      : activeLfoRoutes[index]
                        ? "Connected"
                        : "Unconnected"}
                  </span>
                  {lfo.depth === 0
                    ? "Raise Depth to hear this LFO."
                    : activeLfoRoutes[index]
                      ? "Changes reach the sound through your routes below."
                      : "Add an active route below to hear these controls."}
                </p>
                <div className="ll-knobs ll-knobs-three">
                  <Knob
                    label={`LFO ${index + 1} rate`}
                    value={lfo.rate}
                    min={0.05}
                    max={40}
                    step={0.05}
                    log
                    unit="Hz"
                    onChange={(rate) => {
                      const lfos = [
                        ...architecture.lfos,
                      ] as SynthArchitecture["lfos"];
                      lfos[index] = { ...lfo, rate };
                      onChange({ ...architecture, lfos });
                    }}
                  />
                  <Knob
                    label={`LFO ${index + 1} depth`}
                    value={lfo.depth}
                    min={0}
                    max={1}
                    step={0.01}
                    format={percent}
                    onChange={(depth) => {
                      const lfos = [
                        ...architecture.lfos,
                      ] as SynthArchitecture["lfos"];
                      lfos[index] = { ...lfo, depth };
                      onChange({ ...architecture, lfos });
                    }}
                  />
                  <Knob
                    label={`LFO ${index + 1} phase`}
                    value={lfo.phase}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(value) => `${Math.round(value * 360)}°`}
                    onChange={(phase) => {
                      const lfos = [
                        ...architecture.lfos,
                      ] as SynthArchitecture["lfos"];
                      lfos[index] = { ...lfo, phase };
                      onChange({ ...architecture, lfos });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="ll-matrix-heading">
            <div>
              <strong>Modulation matrix</strong>
              <span>{architecture.routes.length} / 8 connections</span>
            </div>
            <button
              type="button"
              className="ll-add-route"
              onClick={addRoute}
              disabled={architecture.routes.length >= 8}
            >
              <Plus size={14} />
              Add route
            </button>
          </div>
          <div className="ll-matrix">
            {architecture.routes.length === 0 ? (
              <div className="ll-empty-matrix">
                <Link2 size={22} strokeWidth={1.3} />
                <strong>Set the motion in the kitchen.</strong>
                <p>
                  Try LFO 1 → table position for motion, or random → pitch for a
                  different shade on every hit.
                </p>
                <button
                  type="button"
                  className="ll-add-route"
                  onClick={addRoute}
                >
                  <Plus size={14} />
                  Add your first route
                </button>
              </div>
            ) : (
              architecture.routes.map((route, index) => {
                const inactiveReason = inactiveRouteReason(route, architecture);
                return (
                  <div
                    className={`ll-route${inactiveReason ? " is-inactive" : ""}`}
                    key={route.id}
                  >
                    <span className="ll-route-number">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <Field label="Source">
                      <select
                        aria-label={`Modulation route ${index + 1} source`}
                        value={route.source}
                        onChange={(event) =>
                          editRoute(route.id, {
                            source: event.currentTarget
                              .value as ModRoute["source"],
                          })
                        }
                      >
                        {MOD_SOURCES.map((source) => (
                          <option key={source.value} value={source.value}>
                            {source.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <ArrowRight size={14} className="ll-route-arrow" />
                    <Field label="Destination">
                      <select
                        aria-label={`Modulation route ${index + 1} destination`}
                        value={route.target}
                        onChange={(event) =>
                          editRoute(route.id, {
                            target: event.currentTarget
                              .value as ModRoute["target"],
                          })
                        }
                      >
                        {architecture.layers.map((item) => (
                          <optgroup
                            label={`Layer ${item.id.toUpperCase()} · ${ENGINE_LABELS[item.engine]}`}
                            key={item.id}
                          >
                            {TARGETS.map(([suffix, name]) => {
                              const target = `${item.id}.${suffix}`;
                              const supported = supportsDestination(
                                item.engine,
                                suffix,
                              );
                              if (!supported && route.target !== target)
                                return null;
                              return (
                                <option key={suffix} value={target}>
                                  {item.id.toUpperCase()} · {name}
                                  {!supported
                                    ? ` · inactive for ${ENGINE_LABELS[item.engine]}`
                                    : ""}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))}
                        <optgroup label="Master">
                          <option value="master.drive">Master · Drive</option>
                        </optgroup>
                      </select>
                    </Field>
                    <label className="ll-route-amount">
                      <span>
                        Amount <b>{signedPercent(route.amount)}</b>
                      </span>
                      <input
                        type="range"
                        aria-label={`Modulation route ${index + 1} amount`}
                        min="-1"
                        max="1"
                        step="0.01"
                        value={route.amount}
                        onChange={(event) =>
                          editRoute(route.id, {
                            amount: Number(event.currentTarget.value),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="ll-remove-route"
                      aria-label={`Remove modulation route ${index + 1}`}
                      title="Remove route"
                      onClick={() =>
                        onChange({
                          ...architecture,
                          routes: architecture.routes.filter(
                            (item) => item.id !== route.id,
                          ),
                        })
                      }
                    >
                      <X size={15} />
                    </button>
                    {inactiveReason && (
                      <p className="ll-route-status">
                        <span>Inactive</span> {inactiveReason}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
          <p className="ll-mod-footnote">
            LFOs restart with each hit. Pitch and amp envelopes follow the main
            instrument. Inactive routes keep their settings until you choose a
            matching engine or destination.
          </p>
        </div>
      )}
    </section>
  );
}
