import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  AudioLines,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Dices,
  Download,
  Drum,
  FolderOpen,
  Grid2X2,
  Headphones,
  Keyboard,
  Layers3,
  Library,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  Waves,
  X,
} from "lucide-react";
import {
  AudioEngine,
  PRESETS,
  buildDefaultKit,
  renderSound,
  renderPattern,
  renderNativeEvents,
  renderExactPatternEvents,
  FACTORY_KITS,
  buildFactoryKit,
  sanitizeParams,
  ensureArchitecture,
  createLayerPreview,
} from "./audio";
import type {
  SoundParams,
  VoiceType,
  SynthArchitecture,
  LayerId,
  GrainSample,
} from "./types";
import LayerLab from "./LayerLab";
import BurnerPanel from "./BurnerPanel";
import HotplateSequencer, { LANE_COLORS, type SequenceProject } from "./HotplateSequencer";
import { eventsForStep } from "./sequencing";
import { FACTORY_GROOVES } from "./grooves";
import { Knob, MiniWave, WaveformDisplay, EnvelopeDisplay } from "./Visuals";
import ExportDialog from "./ExportDialog";
import { downloadBlob } from "./export-utils";
import { useMidi } from "./useMidi";
import { importTarget, importTexture, interleaveStereo, SAMPLE_SECONDS, type SharedAudio } from "./exchange";

type Project = SequenceProject;
type SavedProject = { id: string; date: string; project: Project };
type History = { past: Project[]; present: Project; future: Project[]; gesture?: number };
type HistoryAction =
  | { type: "change"; update: (project: Project) => Project; gesture?: number }
  | { type: "undo" | "redo" | "load"; project?: Project };
const TYPES: VoiceType[] = [
  "kick",
  "snare",
  "clap",
  "hat",
  "tom",
  "rim",
  "perc",
  "shaker",
];
const TYPE_LABELS = [
  "Kick",
  "Snare",
  "Clap",
  "Hi-hat",
  "Tom",
  "Rimshot",
  "Percussion",
  "Shaker",
];
const PAD_KEYS = ["A", "S", "D", "F", "G", "H", "J", "K"];
const STORAGE = "form-studio-v2";
function migrateSound(params: SoundParams): SoundParams {
  const safe = sanitizeParams(params);
  return { ...safe, architecture: ensureArchitecture(safe) };
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function readStorage<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function defaultSteps(length = FACTORY_GROOVES[0].length): boolean[][] {
  return FACTORY_GROOVES[0].steps.map(row => Array.from({ length }, (_, i) => row[i % row.length]));
}
function validSound(input: unknown): input is SoundParams {
  if (!input || typeof input !== "object") return false;
  const s = input as SoundParams;
  return (
    typeof s.name === "string" &&
    s.name.length <= 48 &&
    TYPES.includes(s.type) &&
    Number.isFinite(s.seed) &&
    !!s.tone &&
    [
      "frequency",
      "pitchDecay",
      "pitchAmount",
      "attack",
      "decay",
      "release",
    ].every((k) => Number.isFinite(s.tone[k as keyof typeof s.tone])) &&
    ["sine", "triangle", "square", "sawtooth"].includes(s.tone.waveform) &&
    !!s.noise &&
    ["level", "filter", "decay"].every((k) =>
      Number.isFinite(s.noise[k as keyof typeof s.noise]),
    ) &&
    ["white", "pink", "brown"].includes(s.noise.color) &&
    !!s.effects &&
    ["drive", "bitDepth", "sampleRate", "reverb", "delay"].every((k) =>
      Number.isFinite(s.effects[k as keyof typeof s.effects]),
    ) &&
    !!s.mix &&
    Number.isFinite(s.mix.volume) &&
    Number.isFinite(s.mix.pan)
  );
}
function validProject(input: unknown): input is Project {
  if (!input || typeof input !== "object") return false;
  const p = input as Project;
  if (p.musicLabPattern !== undefined) {
    try {
      const overlay = p.musicLabPattern;
      const schema = (window as typeof window & { MusicLabPatternSchema?: { normalize: (value: unknown) => { voices: { id: string }[] } } }).MusicLabPatternSchema;
      if (!schema || !overlay || !overlay.voiceMap || typeof overlay.voiceMap !== "object" || Array.isArray(overlay.voiceMap)) return false;
      if (schema.normalize(overlay.pattern).voices.some(voice => !/^voice-[0-7]$/.test(overlay.voiceMap[voice.id]))) return false;
    } catch { return false; }
  }
  return (
    typeof p.name === "string" &&
    p.name.length <= 120 &&
    Number.isFinite(p.bpm) &&
    p.bpm >= 40 &&
    p.bpm <= 240 &&
    Number.isFinite(p.swing) &&
    p.swing >= 0 &&
    p.swing <= 60 &&
    Array.isArray(p.sounds) &&
    p.sounds.length === 8 &&
    p.sounds.every(validSound) &&
    Array.isArray(p.steps) &&
    p.steps.length === 8 &&
    p.steps.every(
      (row) =>
        Array.isArray(row) &&
        [16, 32].includes(row.length) &&
        row.length === p.steps[0].length &&
        row.every((v) => typeof v === "boolean"),
    ) &&
    (p.stepDetails === undefined || (Array.isArray(p.stepDetails) && p.stepDetails.length === 8 && p.stepDetails.every((row, voice) => Array.isArray(row) && row.length === p.steps[voice].length && row.every(detail => !!detail && typeof detail === "object" && Number.isFinite(detail.velocity) && detail.velocity >= 0 && detail.velocity <= 1 && Number.isFinite(detail.probability) && detail.probability >= 0 && detail.probability <= 1 && Number.isInteger(detail.ratchet) && detail.ratchet >= 1 && detail.ratchet <= 4 && Number.isFinite(detail.timing) && detail.timing >= -.45 && detail.timing <= .45 && Number.isInteger(detail.pitch) && detail.pitch >= -24 && detail.pitch <= 24)))) &&
    (p.grooveId === undefined || typeof p.grooveId === "string" && p.grooveId.length <= 80) &&
    Array.isArray(p.muted) &&
    p.muted.length === 8 &&
    p.muted.every((v) => typeof v === "boolean")
  );
}
function customId(params: SoundParams) {
  let hash = 2166136261;
  for (const char of JSON.stringify(params))
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return `custom-${(hash >>> 0).toString(36)}`;
}
function safeCustomPresets(): SoundParams[] {
  const data = readStorage<unknown>("form-custom-presets", []);
  return Array.isArray(data)
    ? data.filter(validSound).map(migrateSound).slice(0, 200)
    : [];
}
function safeSavedProjects(): SavedProject[] {
  const data = readStorage<unknown>("form-projects", []);
  return Array.isArray(data)
    ? data
        .filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.date === "string" &&
            validProject(p.project),
        )
        .slice(0, 30)
        .map((p) => ({
          ...p,
          project: {
            ...p.project,
            sounds: p.project.sounds.map(migrateSound),
          },
        }))
    : [];
}
function initialProject(): Project {
  const saved = readStorage<Project | null>(
    STORAGE,
    readStorage<Project | null>("form-studio-v1", null),
  );
  return saved && validProject(saved)
    ? { ...saved, sounds: saved.sounds.map(migrateSound) }
    : {
        name: "Opening service",
        sounds: buildDefaultKit().map(migrateSound),
        steps: defaultSteps(),
        stepDetails: clone(FACTORY_GROOVES[0].stepDetails),
        grooveId: FACTORY_GROOVES[0].id,
        muted: Array(8).fill(false),
        bpm: FACTORY_GROOVES[0].tempo,
        swing: FACTORY_GROOVES[0].swing,
      };
}
type PatternAudioOptions = { sampleRate: number; repetitions?: number; tail?: boolean; tailSeconds?: number };
function renderProjectPattern(p: Project, solo: number | null, options: PatternAudioOptions): { channels: Float32Array[]; bars: number } {
  const sampleRate = options.sampleRate, repetitions = options.repetitions ?? 1;
  let channels: Float32Array[], bars = repetitions * p.steps[0].length / 16;
  if (p.musicLabPattern) {
    const imported = (window as typeof window & { MusicLabPatternInstrument?: { getImportedPatternEvents?: (options: { state: unknown; tempo: number; repetitions: number }) => { events: Parameters<typeof renderExactPatternEvents>[1]; durationSeconds: number; lengthBeats: number } } }).MusicLabPatternInstrument;
    if (!imported?.getImportedPatternEvents) throw new Error("The shared pattern renderer is not ready. Try again after the Kitchen libraries finish loading.");
    const source = imported.getImportedPatternEvents({ state: { ...p, solo }, tempo: p.bpm, repetitions });
    let tailSeconds = options.tailSeconds ?? 0;
    if (options.tailSeconds === undefined && options.tail) {
      const durations = new Map<number, number>();
      let finalFrame = Math.ceil(source.durationSeconds * sampleRate);
      for (const event of source.events) {
        if (event.velocity <= 0) continue;
        let frames = durations.get(event.voice);
        if (frames === undefined) {
          frames = renderSound(p.sounds[event.voice], sampleRate).length;
          durations.set(event.voice, frames);
        }
        const rate = 2 ** (Math.max(-48, Math.min(48, event.pitch ?? 0)) / 12);
        finalFrame = Math.max(finalFrame, Math.round(event.at * sampleRate) + Math.ceil(frames / rate));
      }
      tailSeconds = Math.max(0, finalFrame / sampleRate - source.durationSeconds);
      if (tailSeconds > 15) throw new Error(`These down-pitched notes need ${tailSeconds.toFixed(1)} seconds of decay after the pattern. Full-tail export supports up to 15 seconds. Raise their pitch, or choose a shorter effect tail in the Samples panel.`);
    }
    channels = renderExactPatternEvents(p.sounds, source.events, { sampleRate, durationSeconds: source.durationSeconds, tailSeconds, master: 1 });
    bars = source.lengthBeats * repetitions / 4;
  } else {
    channels = renderPattern(p.sounds.map((params, index) => ({ params, steps: p.steps[index], muted: p.muted[index] || (solo !== null && solo !== index), velocities: p.steps[index].map((_, step) => step % 4 === 0 ? 1 : .86), stepDetails: p.stepDetails?.[index] })), p.bpm, { sampleRate, swing: p.swing / 100, bars: repetitions, tail: options.tail === true || (options.tailSeconds ?? 0) > 0 });
    if (options.tailSeconds !== undefined) {
      const frames = Math.ceil(p.steps[0].length * repetitions * 60 / p.bpm / 4 * sampleRate) + Math.round(options.tailSeconds * sampleRate);
      channels = channels.map(channel => { if (channel.length === frames) return channel; const fitted = new Float32Array(frames); fitted.set(channel.subarray(0, frames)); return fitted; });
    }
  }
  return { channels, bars };
}
function reducer(state: History, action: HistoryAction): History {
  if (action.type === "undo") {
    const previous = state.past.at(-1);
    return previous
      ? {
          past: state.past.slice(0, -1),
          present: previous,
          future: [state.present, ...state.future],
        }
      : state;
  }
  if (action.type === "redo") {
    const next = state.future[0];
    return next
      ? {
          past: [...state.past, state.present],
          present: next,
          future: state.future.slice(1),
        }
      : state;
  }
  if (action.type === "load")
    return { past: [], present: action.project!, future: [] };
  if (action.type === "change")
    return {
      past: action.gesture !== undefined && action.gesture === state.gesture ? state.past : [...state.past.slice(-49), state.present],
      present: action.update(state.present),
      future: [],
      gesture: action.gesture,
    };
  return state;
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
  className = "",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const autofocus = ref.current?.querySelector<HTMLInputElement>(
      'input:not([type="hidden"])',
    );
    if (autofocus) autofocus.focus();
    else ref.current?.focus();
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const nodes = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),input,select,a[href],[tabindex="0"]',
        );
        if (!nodes?.length) return;
        const first = nodes[0],
          last = nodes[nodes.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = oldOverflow;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">KITCHEN / HOTPLATE</span>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close dialog"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [history, dispatch] = useReducer(reducer, undefined, () => ({
    past: [],
    present: initialProject(),
    future: [],
  }));
  const project = history.present;
  const [selected, setSelected] = useState(0);
  const [editorTab, setEditorTab] = useState<
    "engines" | "synthesis" | "effects" | "mix"
  >("engines");
  const [deepOpen, setDeepOpen] = useState(false);
  const [recipeTempo, setRecipeTempo] = useState(true);
  const [fill, setFill] = useState(false);
  const [transportRevision, setTransportRevision] = useState(0);
  const resumePosition = useRef({ step: 0, cycle: 0 });
  const transportRequest = useRef(0);
  const [scope, setScope] = useState<"waveform" | "spectrum">("waveform");
  const [zoom, setZoom] = useState(1);
  const [playingPad, setPlayingPad] = useState(-1);
  const [activeBurners, setActiveBurners] = useState<number[]>([]);
  const [burnerPulses, setBurnerPulses] = useState<number[]>(Array(8).fill(0));
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [modal, setModal] = useState<
    "library" | "projects" | "help" | "savePreset" | null
  >(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<"sample" | "kit" | "pattern">(
    "sample",
  );
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => {
    const data = readStorage<unknown>("form-favorites", [
      FACTORY_KITS[0].presetIds[0],
      FACTORY_KITS[0].presetIds[1],
    ]);
    return Array.isArray(data) ? data.filter((v) => typeof v === "string") : [];
  });
  const [customPresets, setCustomPresets] =
    useState<SoundParams[]>(safeCustomPresets);
  const [presetName, setPresetName] = useState("");
  const [savedProjects, setSavedProjects] =
    useState<SavedProject[]>(safeSavedProjects);
  const [toast, setToast] = useState("");
  const [saved, setSaved] = useState<"saved" | "saving" | "unavailable">(
    "saved",
  );
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [autoAudition, setAutoAudition] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [solo, setSolo] = useState<number | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const latest = useRef({ project, masterVolume, solo, selected, isPlaying, fill });
  latest.current = { project, masterVolume, solo, selected, isPlaying, fill };
  const padTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const sound = project.sounds[selected];
  const hasPercussion = sound.architecture?.layers.some(
    (layer) => layer.enabled && layer.engine === "percussion",
  );
  const soundSignature = useMemo(() => JSON.stringify(sound), [sound]);
  const dspSignature = useMemo(
    () => JSON.stringify({ ...sound, name: "" }),
    [sound],
  );
  const samples = useMemo(() => renderSound(sound, 44100), [dspSignature]);
  const peak = useMemo(
    () => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0),
    [samples],
  );
  const rangeGesture = useRef<{ active?: number; next: number }>({ next: 0 });
  const change = useCallback(
    (update: (p: Project) => Project) => dispatch({ type: "change", update, gesture: rangeGesture.current.active }),
    [],
  );
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 3400);
  }, []);
  const nativeChange = useCallback((update: (p: Project) => Project) => {
    if (latest.current.project.musicLabPattern) {
      transportRequest.current++;
      setIsPlaying(false);
      resumePosition.current = { step: 0, cycle: 0 };
      notify("Native grid restored. Undo returns the exact shared pattern.");
    }
    change(p => { const next = { ...update(p) }; delete next.musicLabPattern; return next; });
  }, [change, notify]);
  const stopTransport = useCallback(() => {
    transportRequest.current++; latest.current.isPlaying = false;
    setIsPlaying(false); setFill(false); setCurrentStep(-1); setActiveBurners([]);
    resumePosition.current = { step: 0, cycle: 0 };
    engineRef.current?.stopAll();
    (window as typeof window & { MusicLabPatternInstrument?: { stopPattern: () => void } }).MusicLabPatternInstrument?.stopPattern();
  }, []);
  const restartTransport = useCallback(() => {
    transportRequest.current++;
    engineRef.current?.stopAll();
    (window as typeof window & { MusicLabPatternInstrument?: { stopPattern: () => void } }).MusicLabPatternInstrument?.stopPattern();
    resumePosition.current = { step: 0, cycle: 0 }; setCurrentStep(-1); setIsPlaying(true); setTransportRevision(value => value + 1);
  }, []);
  const replaceSelectedSound = useCallback((replacement: SoundParams) => {
    change(p => ({ ...p, sounds: p.sounds.map((voice, index) => index === selected ? replacement : voice) }));
  }, [selected, change]);
  useEffect(() => {
    const finish = () => { rangeGesture.current.active = undefined; };
    window.addEventListener("pointerup", finish); window.addEventListener("pointercancel", finish); window.addEventListener("blur", finish);
    return () => { window.removeEventListener("pointerup", finish); window.removeEventListener("pointercancel", finish); window.removeEventListener("blur", finish); };
  }, []);
  const closeModal = useCallback(() => setModal(null), []);
  const engine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AudioEngine();
      engineRef.current.setMasterVolume(0.72 * latest.current.masterVolume);
    }
    return engineRef.current;
  }, []);
  useEffect(() => {
    engineRef.current?.setMasterVolume(0.72 * masterVolume);
  }, [masterVolume]);
  const audition = useCallback(
    (index: number, params?: SoundParams, velocity = 1) => {
      try {
        const { project: p } = latest.current;
        const voice = clone(params || p.sounds[index]);
        const audio = engine();
        Promise.resolve(audio.resume())
          .then(() => audio.play(voice, velocity))
          .catch(() =>
            notify("Audio could not start. Try your browser’s sound settings."),
          );
        setPlayingPad(index);
        setBurnerPulses(pulses => pulses.map((pulse, voice) => voice === index ? pulse + 1 : pulse));
        if (padTimeout.current) clearTimeout(padTimeout.current);
        padTimeout.current = setTimeout(
          () => setPlayingPad(-1),
          Math.min(900, voice.tone.decay + voice.tone.release + 120),
        );
      } catch {
        notify("This browser could not start the audio engine.");
      }
    },
    [engine, notify],
  );
  const midiPad = useCallback(
    (index: number, velocity: number) => {
      setSelected(index);
      audition(index, undefined, velocity);
    },
    [audition],
  );
  const auditionLayer = useCallback(
    (id: LayerId) => {
      const current = latest.current.project.sounds[selected];
      audition(selected, createLayerPreview(current, id));
    },
    [selected, audition],
  );
  const midi = useMidi(midiPad, notify);
  const updateSound = useCallback(
    (
      group: "tone" | "noise" | "effects" | "mix",
      key: string,
      value: number | string,
    ) => {
      change((p) => ({
        ...p,
        sounds: p.sounds.map((s, i) =>
          i === selected ? { ...s, [group]: { ...s[group], [key]: value } } : s,
        ),
      }));
    },
    [selected, change],
  );
  const updateArchitecture = useCallback(
    (architecture: SynthArchitecture) => {
      change((p) => ({
        ...p,
        sounds: p.sounds.map((s, i) =>
          i === selected ? { ...s, architecture } : s,
        ),
      }));
    },
    [selected, change],
  );
  const importGrainSample = useCallback(
    (layerId: LayerId, sample: GrainSample) => {
      change((p) => ({
        ...p,
        sounds: p.sounds.map((s, i) => {
          if (i !== selected) return s;
          const architecture = ensureArchitecture(s);
          return {
            ...s,
            architecture: {
              ...architecture,
              layers: architecture.layers.map((layer) =>
                layer.id === layerId
                  ? {
                      ...layer,
                      enabled: true,
                      engine: "granular",
                      granular: {
                        ...layer.granular,
                        source: "sample",
                        position: 0.25,
                        sample,
                      },
                    }
                  : layer,
              ),
            },
          };
        }),
      }));
    },
    [selected, change],
  );
  useEffect(() => {
    setSaved("saving");
    const timeout = setTimeout(() => {
      const ok = store(STORAGE, project);
      setSaved(ok ? "saved" : "unavailable");
    }, 500);
    return () => clearTimeout(timeout);
  }, [project]);
  useEffect(() => {
    store("form-favorites", favorites);
  }, [favorites]);
  useEffect(() => {
    store("form-custom-presets", customPresets);
  }, [customPresets]);
  useEffect(() => {
    store("form-projects", savedProjects);
  }, [savedProjects]);
  useEffect(() => {
    if (autoAudition) {
      const timeout = setTimeout(() => audition(selected), 160);
      return () => clearTimeout(timeout);
    }
  }, [sound, autoAudition, audition, selected]);
  useEffect(
    () => () => {
      engineRef.current?.close();
      if (padTimeout.current) clearTimeout(padTimeout.current);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
    },
    [],
  );
  useEffect(() => {
    if (!isPlaying) return;
    const audio = engine();
    let cancelled = false,
      timer: ReturnType<typeof setInterval> | undefined;
    let nextStep = resumePosition.current.step % latest.current.project.steps[0].length,
      cycle = resumePosition.current.cycle,
      nextTime = 0;
    const indicators = new Set<ReturnType<typeof setTimeout>>();
    const activityVersion = Array(8).fill(0);
    const activityTimers = new Set<ReturnType<typeof setTimeout>>();
    let activityEnabled = true;
    const clearActivity = () => { activityEnabled = false; for (let voice = 0; voice < 8; voice++) activityVersion[voice]++; for (const timer of activityTimers) { clearTimeout(timer); indicators.delete(timer); } activityTimers.clear(); setActiveBurners([]); };
    const resumeActivity = () => { activityEnabled = true; };
    window.addEventListener("blur", clearActivity); window.addEventListener("focus", resumeActivity);
    Promise.resolve(audio.preload(latest.current.project.sounds))
      .then(() => {
        if (cancelled) return;
        const patternInstrument = (window as typeof window & { MusicLabPatternInstrument?: { startPattern: () => void; stopPattern: () => void } }).MusicLabPatternInstrument;
        if (latest.current.project.musicLabPattern && patternInstrument) { patternInstrument.startPattern(); return; }
        const advance = Math.max(0, ...(latest.current.project.stepDetails?.flat().map(detail => -detail.timing) ?? [0])) * 60 / latest.current.project.bpm / 4;
        nextTime = audio.now() + Math.max(.05, advance + .04);
        const schedule = () => {
          const { project: p, solo: soloIndex } = latest.current;
          const stepTime = 60 / p.bpm / 4;
          const maxAdvance = Math.max(0, ...(p.stepDetails?.flat().map(detail => -detail.timing) ?? [0])) * stepTime;
          const lookahead = Math.max(.12, maxAdvance + .06);
          // Schedule early steps before their nominal boundary; skip only genuinely missed notes.
          while (nextTime - maxAdvance < audio.now() - .12) {
            nextTime += stepTime;
            nextStep = (nextStep + 1) % p.steps[0].length;
            if (nextStep === 0) cycle++;
          }
          let scheduled = 0;
          while (nextTime < audio.now() + lookahead && scheduled++ < 16) {
            const step = nextStep, at = nextTime, eventCycle = cycle;
            const events = eventsForStep(p.steps, p.stepDetails, step, cycle, p.bpm, p.swing, 0x48504c54, latest.current.fill);
            const activityGroups = new Map<number, number[]>();
            for (const event of events) {
              if (!p.muted[event.voice] && (soloIndex === null || soloIndex === event.voice)) {
                const activityAt = Math.round((at + event.offset) * 100000) / 100000;
                const group = activityGroups.get(activityAt) ?? []; if (!group.includes(event.voice)) group.push(event.voice); activityGroups.set(activityAt, group);
                audio.play(p.sounds[event.voice], event.velocity, at + event.offset, event.pitch).catch(() => { setIsPlaying(false); notify("Playback paused because audio became unavailable."); });
              }
            }
            for (const [activityAt, voices] of activityGroups) {
              const onset = setTimeout(() => {
                indicators.delete(onset); activityTimers.delete(onset); if (cancelled || !activityEnabled || document.hidden) return;
                const versions = voices.map(voice => ++activityVersion[voice]);
                setActiveBurners(active => [...new Set([...active, ...voices])]);
                setBurnerPulses(pulses => pulses.map((pulse, voice) => voices.includes(voice) ? pulse + 1 : pulse));
                const off = setTimeout(() => {
                  indicators.delete(off); activityTimers.delete(off);
                  if (!cancelled) setActiveBurners(active => active.filter(voice => { const index = voices.indexOf(voice); return index < 0 || activityVersion[voice] !== versions[index]; }));
                }, 100);
                indicators.add(off); activityTimers.add(off);
              }, Math.max(0, (activityAt - audio.now()) * 1000));
              indicators.add(onset); activityTimers.add(onset);
            }
            const indicator = setTimeout(() => {
              if (!cancelled) {
                setCurrentStep(step);
                const following = (step + 1) % p.steps[0].length;
                resumePosition.current = { step: following, cycle: eventCycle + (following === 0 ? 1 : 0) };
              }
              indicators.delete(indicator);
            }, Math.max(0, (at - audio.now()) * 1000));
            indicators.add(indicator);
            nextTime += stepTime;
            nextStep = (nextStep + 1) % p.steps[0].length;
            if (nextStep === 0) cycle++;
          }
        };
        schedule();
        timer = setInterval(schedule, 25);
      })
      .catch(() => {
        setIsPlaying(false);
        notify("Audio is unavailable in this browser.");
      });
    return () => {
      cancelled = true;
      window.removeEventListener("blur", clearActivity); window.removeEventListener("focus", resumeActivity);
      if (timer) clearInterval(timer);
      indicators.forEach(clearTimeout);
      (window as typeof window & { MusicLabPatternInstrument?: { stopPattern: () => void } }).MusicLabPatternInstrument?.stopPattern();
      audio.stopAll();
      setActiveBurners([]);
    };
  }, [isPlaying, transportRevision, engine, notify]);
  const randomize = useCallback(
    (subtle = false) => {
      const index = selected;
      change((p) => {
        const current = p.sounds[index];
        const voicePresets = PRESETS.filter(
          (preset) => preset.type === current.type && !preset.archive,
        );
        const hybridPresets = voicePresets.filter((p) => p.params.architecture);
        const candidates = hybridPresets.length ? hybridPresets : voicePresets;
        const next = migrateSound(
          clone(
            subtle
              ? current
              : candidates[Math.floor(Math.random() * candidates.length)]
                  ?.params || current,
          ),
        );
        const vary = (v: number, min: number, max: number, amount = 0.3) =>
          Math.max(
            min,
            Math.min(max, v * (1 + (Math.random() - 0.5) * amount)),
          );
        next.tone.frequency = Math.round(
          vary(next.tone.frequency, 20, 12000, subtle ? 0.18 : 0.8),
        );
        next.tone.decay = Math.round(
          vary(next.tone.decay, 10, 2000, subtle ? 0.3 : 1),
        );
        next.tone.pitchAmount = Math.round(
          vary(next.tone.pitchAmount, -48, 72, 0.6),
        );
        next.noise.level = Math.max(
          0,
          Math.min(
            1,
            next.noise.level + (Math.random() - 0.5) * (subtle ? 0.12 : 0.4),
          ),
        );
        next.effects.drive = Math.max(
          0,
          Math.min(1, next.effects.drive + (Math.random() - 0.5) * 0.3),
        );
        next.seed = Math.floor(Math.random() * 1000000);
        if (next.architecture) {
          next.architecture.layers = next.architecture.layers.map((layer) =>
            !layer.enabled
              ? layer
              : {
                  ...layer,
                  tune: Math.max(
                    -48,
                    Math.min(
                      48,
                      layer.tune + (Math.random() - 0.5) * (subtle ? 1.5 : 5),
                    ),
                  ),
                  envelope: {
                    ...layer.envelope,
                    decay: Math.round(
                      vary(layer.envelope.decay, 5, 3000, subtle ? 0.2 : 0.7),
                    ),
                  },
                  subtractive: {
                    ...layer.subtractive,
                    cutoff: Math.round(
                      vary(
                        layer.subtractive.cutoff,
                        40,
                        20000,
                        subtle ? 0.3 : 1,
                      ),
                    ),
                  },
                  fm: {
                    ...layer.fm,
                    index: vary(layer.fm.index, 0, 24, subtle ? 0.2 : 0.8),
                  },
                  wavetable: {
                    ...layer.wavetable,
                    position: Math.max(
                      0,
                      Math.min(
                        1,
                        layer.wavetable.position +
                          (Math.random() - 0.5) * (subtle ? 0.08 : 0.3),
                      ),
                    ),
                  },
                  granular: {
                    ...layer.granular,
                    density: vary(
                      layer.granular.density,
                      1,
                      120,
                      subtle ? 0.2 : 0.7,
                    ),
                    position: Math.max(
                      0,
                      Math.min(
                        1,
                        layer.granular.position + (Math.random() - 0.5) * 0.1,
                      ),
                    ),
                  },
                },
          );
        }
        if (!subtle)
          next.name =
            [
              "Off-menu",
              "Scalded",
              "After-hours",
              "House",
              "Second-helping",
              "Undercounter",
              "Overdone",
            ][Math.floor(Math.random() * 7)] +
            " " +
            TYPE_LABELS[TYPES.indexOf(current.type)];
        return {
          ...p,
          sounds: p.sounds.map((s, i) => (i === index ? next : s)),
        };
      });
      notify(
        subtle
          ? "Variation created. The recipe has taken a small liberty."
          : "New sound created. Chef declines to identify the ingredient.",
      );
    },
    [selected, change, notify],
  );
  const randomRef = useRef(randomize);
  randomRef.current = randomize;
  const interactionRef = useRef({ selected, modal, exportOpen });
  interactionRef.current = { selected, modal, exportOpen };
  useEffect(() => {
    const key = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) && !(target.tagName === "INPUT" && (target as HTMLInputElement).type === "range" && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z")) ||
        target.isContentEditable ||
        interactionRef.current.modal ||
        interactionRef.current.exportOpen
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch({ type: event.shiftKey ? "redo" : "undo" });
        return;
      }
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.code === "Space" && ["BUTTON", "A", "SUMMARY"].includes(target.tagName))
      )
        return;
      if (event.repeat) return;
      const index = PAD_KEYS.indexOf(event.key.toUpperCase());
      if (index !== -1) {
        event.preventDefault();
        setSelected(index);
        audition(index);
      } else if (event.code === "Space") {
        event.preventDefault();
        setIsPlaying((p) => !p);
      } else if (event.key === "Enter" && !["BUTTON", "A", "SUMMARY"].includes(target.tagName))
        audition(interactionRef.current.selected);
      else if (event.key.toLowerCase() === "r")
        randomRef.current(event.shiftKey);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [audition]);
  const loadPreset = (params: SoundParams) => {
    const migrated = migrateSound(params);
    change((p) => ({
      ...p,
      sounds: p.sounds.map((s, i) => (i === selected ? migrated : s)),
    }));
    audition(selected, migrated);
    setModal(null);
    notify(`${params.name} loaded on pad ${selected + 1}.`);
  };
  const toggleFavorite = (id: string) =>
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  const allPresets = useMemo(
    () => [
      ...PRESETS.map((p) => ({ ...p, params: migrateSound(p.params) })),
      ...customPresets.map((params) => ({
        id: customId(params),
        name: params.name,
        category: "My sounds",
        type: params.type,
        params,
      })),
    ],
    [customPresets],
  );
  const presetSignatures = useMemo(
    () => new Map(allPresets.map((p) => [JSON.stringify(p.params), p])),
    [allPresets],
  );
  const currentPreset = presetSignatures.get(soundSignature);
  const currentFavoriteId = currentPreset?.id || customId(sound);
  const favoriteCurrent = () => {
    if (
      !currentPreset &&
      !customPresets.some((p) => customId(p) === currentFavoriteId)
    ) {
      setCustomPresets((p) => [...p, clone(sound)].slice(-200));
      notify("Your sound was saved and added to favorites.");
    }
    toggleFavorite(currentFavoriteId);
  };
  const visiblePresets = allPresets.filter(
    (p) =>
      ((libraryFilter === "all" && !("archive" in p && p.archive)) ||
        (libraryFilter === "archive" && "archive" in p && p.archive === true) ||
        (libraryFilter === "favorites" && favorites.includes(p.id)) ||
        (libraryFilter === "custom" && p.id.startsWith("custom-")) ||
        (libraryFilter === p.type && !("archive" in p && p.archive)) ||
        (libraryFilter.startsWith("engine:") &&
          p.params.architecture?.layers.some(
            (layer) => layer.enabled && layer.engine === libraryFilter.slice(7),
          )) ||
        (libraryFilter === "hybrid" &&
          (p.params.architecture?.layers.filter((layer) => layer.enabled)
            .length || 0) > 1)) &&
      `${p.name} ${p.type} ${p.category} ${
        p.params.architecture?.layers
          .filter((layer) => layer.enabled)
          .map((layer) => layer.engine)
          .join(" ") || ""
      }`
        .toLowerCase()
        .includes(librarySearch.toLowerCase()),
  );
  const openLibrary = (filter = "all") => {
    setLibraryFilter(filter);
    setLibrarySearch("");
    setModal("library");
  };
  const saveProject = () => {
    const snapshot: SavedProject = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      project: clone(project),
    };
    const next = [snapshot, ...savedProjects].slice(0, 30);
    setSavedProjects(next);
    notify(
      store("form-projects", next)
        ? "Session saved to your projects in this browser."
        : "Browser storage is unavailable. Download your project to keep it.",
    );
  };
  const downloadProject = () => {
    downloadBlob(
      new Blob(
        [JSON.stringify({ app: "FORM", version: 2, project }, null, 2)],
        { type: "application/json" },
      ),
      `${project.name.replace(/[^a-z0-9-]/gi, "-")}.form.json`,
    );
    notify("Project downloaded. All sounds and steps included.");
    setMoreOpen(false);
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 25000000) throw new Error();
      const data = JSON.parse(await file.text());
      const imported = data?.project || data;
      if (!validProject(imported)) throw new Error();
      stopTransport();
      dispatch({
        type: "load",
        project: { ...imported, sounds: imported.sounds.map(migrateSound) },
      });
      setSelected(0);
      setSolo(null);
      notify("Project imported. Welcome back.");
      setModal(null);
    } catch {
      notify("That file isn’t a valid HOTPLATE project. Choose a .form.json file.");
    }
    if (importRef.current) importRef.current.value = "";
  };
  const kitSignatures = useMemo(() => new Map(FACTORY_KITS.map(kit => [JSON.stringify(buildFactoryKit(kit.id).map(migrateSound)), kit.id])), []);
  const kitId = kitSignatures.get(JSON.stringify(project.sounds)) ?? "custom";
  const activeGroove = FACTORY_GROOVES.find(groove => groove.id === project.grooveId);
  const loadGroove = (id: string) => {
    const groove = FACTORY_GROOVES.find(item => item.id === id); if (!groove) return;
    stopTransport();
    nativeChange(p => ({ ...p, steps: clone(groove.steps), stepDetails: clone(groove.stepDetails), grooveId: groove.id, ...(recipeTempo ? { bpm: groove.tempo, swing: groove.swing } : {}) }));
    notify(`${groove.name} rhythm loaded. Your sounds are unchanged; Undo restores the previous order.`);
  };
  const loadKit = (id: string) => {
    const kit = FACTORY_KITS.find(item => item.id === id); if (!kit) return;
    change(p => ({ ...p, sounds: buildFactoryKit(id).map(migrateSound) }));
    notify(`${kit.name} kit loaded. Your rhythm is unchanged; Undo restores the previous sounds.`);
  };
  const db = peak ? (20 * Math.log10(peak)).toFixed(1) : "-∞";

  useEffect(() => {
    const stop = () => {
      transportRequest.current++;
      latest.current.isPlaying = false;
      setIsPlaying(false);
      setCurrentStep(-1);
      engineRef.current?.stopAll();
      (window as typeof window & { MusicLabPatternInstrument?: { stopPattern: () => void } }).MusicLabPatternInstrument?.stopPattern();
      setActiveBurners([]);
      resumePosition.current = { step: 0, cycle: 0 };
      setFill(false);
    };
    const targets = () => latest.current.project.sounds.flatMap((voice, index) =>
      (voice.architecture ?? ensureArchitecture(voice)).layers.map(layer => ({
        id: `${index}:${layer.id}`,
        name: `Voice ${index + 1} · ${voice.name} / layer ${layer.id.toUpperCase()}`,
        voice: index,
        layer: layer.id,
        occupied: layer.enabled || !!layer.granular.sample,
        assetName: layer.granular.sample?.name || (layer.enabled ? `${layer.engine} layer` : ""),
      })),
    );
    const commit = (next: Project, load = false) => {
      latest.current.project = next;
      if (load) dispatch({ type: "load", project: next });
      else change(() => next);
    };
    const importAudio = async (input: SharedAudio) => {
      if (!input || typeof input !== "object") throw new Error("Provide audio to import into HOTPLATE.");
      const target = importTarget(input.options, latest.current.selected);
      const checkReplacement = () => {
        const current = targets().find(item => item.id === target.id)!;
        if (current.occupied && input.options?.replace !== true)
          throw new Error(`Confirm replacing ${current.name} before sending audio.`);
      };
      checkReplacement();
      const sample = await importTexture(input);
      // Another edit or import may have finished while conversion was rendering.
      checkReplacement();
      const p = latest.current.project;
      const next = {
        ...p,
        sounds: p.sounds.map((voice, index) => {
          if (index !== target.voice) return voice;
          const architecture = voice.architecture ?? ensureArchitecture(voice);
          return { ...voice, architecture: { ...architecture, layers: architecture.layers.map(layer =>
            layer.id !== target.layer ? layer : {
              ...layer,
              enabled: true,
              engine: "granular" as const,
              granular: { ...layer.granular, source: "sample" as const, position: 0.25, sample },
            },
          ) } };
        }),
      };
      commit(next);
      setSelected(target.voice);
      latest.current.selected = target.voice;
      setEditorTab("engines");
      setDeepOpen(true);
      notify(`${sample.name} loaded into voice ${target.voice + 1}, layer ${target.layer.toUpperCase()} · mono at 22.05 kHz.`);
      document.dispatchEvent(new CustomEvent("musiclab:state-change", { bubbles: true, detail: { app: "form", target: target.id } }));
      return { app: "form", target: target.id, name: sample.name, sampleRate: sample.sampleRate, duration: sample.data.length / sample.sampleRate };
    };
    const exportAudio = (options: { scope?: "voice" | "pattern"; mode?: "voice" | "pattern"; voice?: number; sampleRate?: number; bars?: number; tail?: boolean; tailSeconds?: number; signal?: AbortSignal } = {}) => {
      options.signal?.throwIfAborted();
      const scope = options.scope ?? options.mode ?? "voice";
      if (!["voice", "pattern"].includes(scope)) throw new Error("Choose a HOTPLATE voice or pattern export.");
      const p = latest.current.project;
      const sampleRate = options.sampleRate ?? 44100;
      if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000)
        throw new Error("Choose an export sample rate between 8 and 96 kHz.");
      if (options.tailSeconds !== undefined && (!Number.isFinite(options.tailSeconds) || options.tailSeconds < 0 || options.tailSeconds > 10))
        throw new Error("Choose an effect tail between zero and ten seconds.");
      const voiceIndex = options.voice ?? latest.current.selected;
      if (!Number.isInteger(voiceIndex) || voiceIndex < 0 || voiceIndex > 7) throw new Error("Choose a HOTPLATE voice from 1 to 8.");
      let left: Float32Array, right: Float32Array, name: string;
      let bars = 0;
      if (scope === "pattern") {
        const repetitions = options.bars ?? 1;
        if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 4) throw new Error("Export one to four repetitions of the HOTPLATE pattern.");
        const rendered = renderProjectPattern(p, latest.current.solo, { sampleRate, repetitions, tail: options.tail, tailSeconds: options.tailSeconds });
        [left, right] = rendered.channels; bars = rendered.bars;
        name = `${p.name} · HOTPLATE pattern`;
      } else {
        const voice = p.sounds[voiceIndex];
        const mono = renderSound(voice, sampleRate);
        const pan = Math.max(-1, Math.min(1, voice.mix.pan));
        const leftGain = Math.cos((pan + 1) * Math.PI / 4), rightGain = Math.sin((pan + 1) * Math.PI / 4);
        left = Float32Array.from(mono, value => value * leftGain);
        right = Float32Array.from(mono, value => value * rightGain);
        name = `${voice.name} · HOTPLATE`;
      }
      options.signal?.throwIfAborted();
      return { pcm: interleaveStereo(left, right), sampleRate, name, tempo: p.bpm, bpm: p.bpm, bars, sourceApp: "form", sourceLabel: scope === "pattern" ? "Current pattern" : `Voice ${voiceIndex + 1}`, channels: 2, duration: left.length / sampleRate };
    };
    const api = Object.freeze({
      version: 1,
      getState: () => clone(latest.current.project),
      getPatternState: () => {
        const p = latest.current.project;
        return { name: p.name, bpm: p.bpm, swing: p.swing, muted: p.muted, solo: latest.current.solo, seed: 0x48504c54, steps: p.steps, stepDetails: p.stepDetails, musicLabPattern: p.musicLabPattern, sounds: p.sounds.map(voice => ({ name: voice.name })) };
      },
      getProject: () => clone(latest.current.project),
      get engine() { return engineRef.current; },
      isPlaying: () => latest.current.isPlaying,
      prepare: () => engine().preload(latest.current.project.sounds),
      play: async () => {
        const epoch = ++transportRequest.current;
        await engine().preload(latest.current.project.sounds);
        if (epoch !== transportRequest.current) return;
        latest.current.isPlaying = true;
        setIsPlaying(true);
      },
      stop,
      panic: stop,
      setTempo: (value: number) => {
        if (!Number.isFinite(Number(value))) throw new Error("Provide a valid HOTPLATE tempo.");
        commit({ ...latest.current.project, bpm: Math.max(40, Math.min(240, Number(value))) });
      },
      loadState: (value: unknown) => {
        const p = (value as { project?: unknown })?.project || value;
        if (!validProject(p)) throw new Error("Invalid HOTPLATE project.");
        stop();
        commit({ ...clone(p), sounds: p.sounds.map(migrateSound) }, true);
        latest.current.selected = 0;
        latest.current.solo = null;
        setSelected(0);
        setSolo(null);
      },
      scheduleNativeNote: (voice: number, when: number, options: { velocity?: number; pitch?: number; source?: string } = {}) => {
        const sound = latest.current.project.sounds[voice];
        if (!sound || !Number.isFinite(when)) throw new Error("Choose a valid HOTPLATE voice and audio timestamp.");
        return engine().schedulePrepared(sound, options.velocity ?? 1, when, options.pitch ?? 0, options.source ?? "native");
      },
      renderNativeEvents: (events: Parameters<typeof renderNativeEvents>[1], options: Parameters<typeof renderNativeEvents>[2]) =>
        renderNativeEvents(latest.current.project.sounds, events, options),
      renderNativeSnapshotEvents: (snapshot: Project, events: Parameters<typeof renderNativeEvents>[1], options: Parameters<typeof renderNativeEvents>[2]) =>
        renderNativeEvents(snapshot.sounds, events, options),
      applyMusicLabPattern: (overlay?: Project["musicLabPattern"]) => {
        const next = { ...latest.current.project };
        if (overlay) next.musicLabPattern = clone(overlay); else delete next.musicLabPattern;
        if (!validProject(next)) throw new Error("Invalid shared pattern or HOTPLATE voice mapping.");
        stop(); commit(next); notify(overlay ? "Shared pattern received. Press Play to hear it." : "Native sequence restored.");
      },
      applyPattern: (steps: boolean[][], bpm?: number) => {
        const p = latest.current.project;
        const next = { ...p, steps: clone(steps), stepDetails: undefined, grooveId: "custom", bpm: bpm ?? p.bpm };
        delete next.musicLabPattern;
        if (!validProject(next)) throw new Error("This pattern cannot fit the HOTPLATE step grid.");
        stop(); commit(next); notify("Pattern received. Service has acquired a suspicious groove.");
      },
      importAudio,
      exportAudio,
      listImportTargets: targets,
      get audioImport() { return { maxSeconds: SAMPLE_SECONDS, decks: 8, targets: targets(), channels: 1, sampleRate: 22050 }; },
      get audioExport() { return { scopes: [{ id: "voice", label: "Selected voice" }, { id: "pattern", label: "Current pattern" }], defaultScope: "voice", defaultBars: 1, maxBars: 4 }; },
    });
    const scope = window as typeof window & { FormApp?: typeof api };
    scope.FormApp = api;
    document.dispatchEvent(new CustomEvent("musiclab:app-ready", { bubbles: true, detail: { app: "form" } }));
    return () => { if (scope.FormApp === api) delete scope.FormApp; };
  }, [change, engine, notify]);

  return (
    <div className="app-shell hotplate-3 hotplate-shell" onPointerDownCapture={e => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type === "range") rangeGesture.current.active = ++rangeGesture.current.next;
    }} onKeyDownCapture={e => {
      const target = e.target as HTMLInputElement;
      if (target.tagName === "INPUT" && target.type === "range" && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key) && rangeGesture.current.active === undefined) rangeGesture.current.active = ++rangeGesture.current.next;
    }} onKeyUpCapture={() => { rangeGesture.current.active = undefined; }} onBlurCapture={() => { rangeGesture.current.active = undefined; }}>
      <header className="topbar hotplate-topbar">
        <button
          className="brand"
          onClick={() => {
            setModal("help");
          }}
          aria-label="HOTPLATE operating instructions"
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span className="brand-word hotplate-wordmark">
            HOTPLATE<span className="brand-period">.</span>
          </span>
          <span className="brand-label">EIGHT-BURNER GROOVEBOX</span>
        </button>
        <div className="session-path">
          <span>Studio</span>
          <span className="path-divider">/</span>
          <input
            value={project.name}
            aria-label="Session name"
            onChange={(e) =>
              change((p) => ({ ...p, name: e.target.value.slice(0, 120) }))
            }
          />
        </div>
        <div className="topbar-actions">
          <span className="save-state">
            <span
              className={`status-dot ${saved === "saved" ? "" : "pending"}`}
            />
            {saved === "saved"
              ? "All changes saved"
              : saved === "saving"
                ? "Saving locally…"
                : "Local storage unavailable"}
          </span>
          <button
            className={`midi-button ${midi.connected ? "connected" : ""}`}
            disabled={!midi.supported}
            onClick={() =>
              midi.connected ? midi.disconnect() : midi.connect()
            }
            title={
              midi.connected
                ? `Disconnect ${midi.deviceName}`
                : midi.supported
                  ? "Connect a MIDI controller"
                  : "Web MIDI requires a supported browser and HTTPS"
            }
          >
            <span className="status-dot" />
            MIDI
          </button>
          <button
            className="icon-button help-button"
            onClick={() => setModal("help")}
            aria-label="Help and keyboard shortcuts"
          >
            <CircleHelp size={18} />
          </button>
          <button className="outline-button save-project" onClick={saveProject}>
            <Save size={15} />
            Save project
          </button>
          <div className="dropdown-anchor">
            <button
              className="icon-button"
              onClick={() => setMoreOpen((p) => !p)}
              aria-label="Project options"
            >
              <MoreHorizontal size={19} />
            </button>
            {moreOpen && (
              <>
                <div
                  className="dismiss-dropdown"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="dropdown-menu">
                  <button onClick={() => { setModal("projects"); setMoreOpen(false); }}>
                    <FolderOpen size={15} />
                    Open saved projects
                  </button>
                  <button onClick={downloadProject}>
                    <Download size={15} />
                    Download project
                  </button>
                  <button
                    onClick={() => {
                      importRef.current?.click();
                      setMoreOpen(false);
                    }}
                  >
                    <Upload size={15} />
                    Import project
                  </button>

                </div>
              </>
            )}
          </div>
        </div>
        <input
          type="file"
          ref={importRef}
          accept=".json,.form.json"
          hidden
          onChange={(e) => importProject(e.target.files?.[0])}
        />
      </header>

      <main className="workspace hotplate-workbench">
        <section className="hotplate-intro"><div><span className="eyebrow">KITCHEN / EIGHT-BURNER ELECTRONIC DRUM MACHINE</span><h1>Eight burners. One groove.</h1></div><span className="hotplate-intro-note">SMALL ORDERS.<br />UNREASONABLE GROOVES.</span></section>
        <section className="hotplate-recipebar" aria-label="Factory sound kits and rhythms">
          <div className="hotplate-recipe-group"><label htmlFor="hotplate-kit">Sound kit</label><select id="hotplate-kit" aria-label="Sound kit" value={kitId} onChange={e => loadKit(e.target.value)}><option value="custom" disabled>Custom sound kit</option>{FACTORY_KITS.map(kit => <option key={kit.id} value={kit.id}>{kit.name}</option>)}</select><p className="hotplate-recipe-note">{FACTORY_KITS.find(kit => kit.id === kitId)?.description ?? "Your own ingredients. Chef declines to interfere."} Changes sounds only.</p></div>
          <div className="hotplate-recipe-group"><label htmlFor="hotplate-groove">Rhythm recipe</label><select id="hotplate-groove" aria-label="Rhythm recipe" value={activeGroove?.id ?? "custom"} onChange={e => loadGroove(e.target.value)}><option value="custom" disabled>Custom rhythm</option>{FACTORY_GROOVES.map(groove => <option key={groove.id} value={groove.id}>{groove.name} · {groove.tempo} BPM</option>)}</select><p className="hotplate-recipe-note">{activeGroove?.description ?? "Your own order. Chef is taking notes."} Changes rhythm only.</p><label className="hp-recipe-tempo"><input type="checkbox" checked={recipeTempo} onChange={e => setRecipeTempo(e.target.checked)} />Use recipe tempo and swing</label></div>
        </section>
        <HotplateSequencer project={project} selected={selected} solo={solo} playing={isPlaying} currentStep={currentStep} fill={fill} onSelect={setSelected} onAudition={audition} onChange={change} onNativeChange={nativeChange} onPlay={() => setIsPlaying(value => !value)} onStop={stopTransport} onRestart={restartTransport} onSolo={setSolo} onFill={setFill} onUndo={() => dispatch({ type: "undo" })} canUndo={!!history.past.length} onRedo={() => dispatch({ type: "redo" })} canRedo={!!history.future.length} volume={masterVolume} onVolume={setMasterVolume} onExport={() => { setExportMode("pattern"); setExportOpen(true); }} onNotice={notify} />

        <section className="pad-bank hotplate-pad-deck" aria-label="Drum pads">
          {project.sounds.map((pad, i) => (
            <button
              key={i}
              className={`drum-pad hotplate-burner ${selected === i ? "selected is-selected" : ""} ${playingPad === i || activeBurners.includes(i) ? "triggered is-triggered" : ""}`}
              style={{ "--burner-accent": LANE_COLORS[i] } as React.CSSProperties}
              onClick={() => {
                setSelected(i);
                audition(i);
              }}
              aria-label={`Play ${pad.name}, keyboard ${PAD_KEYS[i]}`}
              aria-pressed={selected === i}
            >
              <span className="pad-top">
                <span className="pad-index">0{i + 1}</span>
                <kbd>{PAD_KEYS[i]}</kbd>
              </span>
              <span className="burner-ring" key={burnerPulses[i]} aria-hidden="true"><i /><i /><i /></span>
              <span className="pad-name">{pad.name}</span>
              <span className="pad-bottom">
                <span>
                  {TYPE_LABELS[TYPES.indexOf(pad.type)].toUpperCase()}
                </span>
                <span className="pad-light" />
              </span>
            </button>
          ))}
        </section>

        <BurnerPanel sound={sound} index={selected} typeLabel={TYPE_LABELS[TYPES.indexOf(sound.type)]} accent={LANE_COLORS[selected]} onChange={replaceSelectedSound} onAudition={() => audition(selected)} onLibrary={() => openLibrary(sound.type)} onVariation={() => randomize(true)} onExport={() => { setExportMode("sample"); setExportOpen(true); }} deepOpen={deepOpen} onToggleDeep={() => setDeepOpen(value => !value)} />
        {deepOpen && <section className="sound-editor hotplate-deep-recipe panel" id="hotplate-deep-recipe">
          <div className="editor-header">
            <div className="voice-heading">
              <span className="engine-icon">
                <Waves size={18} />
              </span>
              <div>
                <input
                  className="sound-name-input"
                  aria-label="Sound name"
                  value={sound.name}
                  onChange={(e) =>
                    change((p) => ({
                      ...p,
                      sounds: p.sounds.map((s, i) =>
                        i === selected
                          ? { ...s, name: e.target.value.slice(0, 48) }
                          : s,
                      ),
                    }))
                  }
                />
                <span className="engine-label">
                  {sound.architecture?.layers.filter((layer) => layer.enabled)
                    .length || 1}{" "}
                  SYNTH LAYERS <span>·</span> PAD 0{selected + 1}
                </span>
              </div>
              <button
                className={`favorite-button ${favorites.includes(currentFavoriteId) ? "is-favorite" : ""}`}
                onClick={favoriteCurrent}
                aria-label="Favorite current sound"
              >
                <Star size={16} />
              </button>
            </div>
            <div className="editor-header-right">
              <button
                className="subtle-button preset-load"
                onClick={() => openLibrary(sound.type)}
              >
                Load preset
                <ChevronDown size={13} />
              </button>
              <button
                className="icon-button"
                title="Save your sound as a preset"
                aria-label="Save sound as preset"
                onClick={() => {
                  setPresetName(sound.name);
                  setModal("savePreset");
                }}
              >
                <Plus size={16} />
              </button>
              <span className="vertical-divider" />
              <button
                className="icon-button"
                aria-label="Undo"
                disabled={!history.past.length}
                onClick={() => dispatch({ type: "undo" })}
              >
                <Undo2 size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Redo"
                disabled={!history.future.length}
                onClick={() => dispatch({ type: "redo" })}
              >
                <Redo2 size={16} />
              </button>
            </div>
          </div>
          <div className="waveform-area">
            <div className="scope-toolbar">
              <div className="scope-tabs">
                <button
                  className={scope === "waveform" ? "active" : ""}
                  onClick={() => setScope("waveform")}
                >
                  Waveform
                </button>
                <button
                  className={scope === "spectrum" ? "active" : ""}
                  onClick={() => setScope("spectrum")}
                >
                  Spectrum
                </button>
              </div>
              <div className="waveform-badges">
                <span>44.1 kHz</span>
                <span>MONO</span>
                <button
                  title="Zoom waveform"
                  onClick={() => setZoom((z) => (z === 4 ? 1 : z * 2))}
                >
                  {zoom}× <Search size={10} />
                </button>
              </div>
            </div>
            <div className="waveform-canvas">
              <WaveformDisplay
                samples={samples}
                mode={scope}
                zoom={zoom}
                playing={playingPad === selected}
              />
              <button
                className="audition-button"
                onClick={() => audition(selected)}
                aria-label="Audition sound"
              >
                <Play size={17} fill="currentColor" />
              </button>
            </div>
            <div className="waveform-footer">
              <span>
                <span className="live-dot" />
                {(samples.length / 44100).toFixed(3)} s
                <span className="waveform-footer-divider">/</span>Peak {db} dB
              </span>
              <div>
                <button
                  className={`auto-preview ${autoAudition ? "active" : ""}`}
                  onClick={() => setAutoAudition((p) => !p)}
                >
                  <span className={`mini-toggle ${autoAudition ? "on" : ""}`} />
                  Auto-preview
                </button>
                <span className="preview-tip">
                  Press <kbd>{PAD_KEYS[selected]}</kbd> to play
                </span>
              </div>
            </div>
          </div>
          <div className="parameter-tabs">
            <div>
              <button
                className={editorTab === "engines" ? "active" : ""}
                onClick={() => setEditorTab("engines")}
              >
                <Layers3 size={13} />
                Sound engines
                <span className="effect-count">3</span>
              </button>
              <button
                className={editorTab === "synthesis" ? "active" : ""}
                onClick={() => setEditorTab("synthesis")}
              >
                <SlidersHorizontal size={13} />
                Global shaping
              </button>
              <button
                className={editorTab === "effects" ? "active" : ""}
                onClick={() => setEditorTab("effects")}
              >
                <Sparkles size={13} />
                Effects<span className="effect-count">5</span>
              </button>
              <button
                className={editorTab === "mix" ? "active" : ""}
                onClick={() => setEditorTab("mix")}
              >
                <Volume2 size={13} />
                Mix
              </button>
            </div>
            <button
              className="variation-button"
              onClick={() => randomize(true)}
            >
              <Dices size={13} />
              Make a variation
            </button>
          </div>
          {editorTab === "engines" && (
            <LayerLab
              sound={sound}
              onChange={updateArchitecture}
              onNotify={notify}
              onAudition={() => audition(selected)}
              onAuditionLayer={auditionLayer}
              onImportSample={importGrainSample}
            />
          )}
          {editorTab === "synthesis" && (
            <div className="parameter-grid">
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">01</span>
                  <h3>Tone</h3>
                  <span className="parameter-caption">TUNE THE BURNER</span>
                </div>
                <div className="knob-row">
                  <Knob
                    label="Pitch"
                    value={sound.tone.frequency}
                    min={20}
                    max={12000}
                    step={1}
                    unit="Hz"
                    log
                    onChange={(v) => updateSound("tone", "frequency", v)}
                  />
                  <Knob
                    label="Pitch sweep"
                    value={sound.tone.pitchAmount}
                    min={-48}
                    max={72}
                    step={1}
                    unit="st"
                    onChange={(v) => updateSound("tone", "pitchAmount", v)}
                  />
                  <Knob
                    label="Sweep time"
                    value={sound.tone.pitchDecay}
                    min={1}
                    max={1500}
                    step={1}
                    unit="ms"
                    onChange={(v) => updateSound("tone", "pitchDecay", v)}
                  />
                </div>
                {hasPercussion ? (
                  <div className="wave-shape-row">
                    <span className="field-label">WAVE</span>
                    <div className="wave-buttons">
                      {(
                        ["sine", "triangle", "square", "sawtooth"] as const
                      ).map((wave) => (
                        <button
                          key={wave}
                          className={
                            sound.tone.waveform === wave ? "active" : ""
                          }
                          onClick={() => updateSound("tone", "waveform", wave)}
                          title={wave}
                          aria-label={`${wave} waveform`}
                        >
                          <svg viewBox="0 0 34 16" width="28" height="14">
                            <path
                              d={
                                wave === "sine"
                                  ? "M1 8 C5 -3 12 -3 17 8 S29 19 33 8"
                                  : wave === "triangle"
                                    ? "M1 8 L9 1 L25 15 L33 8"
                                    : wave === "square"
                                      ? "M1 13 L1 3 L17 3 L17 13 L33 13 L33 3"
                                      : "M1 13 L15 2 L15 14 L32 2"
                              }
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            />
                          </svg>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="global-pitch-note">
                    Master tuning and pitch sweep feed all tonal layers.
                  </p>
                )}
              </div>
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">02</span>
                  <h3>Mod envelope</h3>
                  <span className="parameter-caption">AMP ENV SOURCE</span>
                </div>
                <div className="knob-row">
                  <Knob
                    label="Attack"
                    value={sound.tone.attack}
                    min={0}
                    max={1000}
                    step={0.1}
                    unit="ms"
                    onChange={(v) => updateSound("tone", "attack", v)}
                  />
                  <Knob
                    label="Decay"
                    value={sound.tone.decay}
                    min={5}
                    max={3000}
                    step={1}
                    unit="ms"
                    log
                    onChange={(v) => updateSound("tone", "decay", v)}
                  />
                  <Knob
                    label="Release"
                    value={sound.tone.release}
                    min={0}
                    max={1500}
                    step={1}
                    unit="ms"
                    log
                    onChange={(v) => updateSound("tone", "release", v)}
                  />
                </div>
                <div className="envelope-preview">
                  <EnvelopeDisplay
                    attack={sound.tone.attack}
                    decay={sound.tone.decay}
                    release={sound.tone.release}
                  />
                  <span>MODULATION SOURCE</span>
                </div>
              </div>
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">03</span>
                  <h3>Noise</h3>
                  <span className="parameter-caption">SIZZLE TO TASTE</span>
                </div>
                <div className="knob-row">
                  <Knob
                    label="Amount"
                    value={sound.noise.level}
                    min={0}
                    max={1}
                    step={0.01}
                    unit="%"
                    format={(v) => String(Math.round(v * 100))}
                    onChange={(v) => updateSound("noise", "level", v)}
                  />
                  <Knob
                    label="Filter"
                    value={sound.noise.filter}
                    min={80}
                    max={20000}
                    step={10}
                    unit="Hz"
                    log
                    format={(v) =>
                      v >= 1000
                        ? `${(v / 1000).toFixed(1)}k`
                        : String(Math.round(v))
                    }
                    onChange={(v) => updateSound("noise", "filter", v)}
                  />
                  <Knob
                    label="Decay"
                    value={sound.noise.decay}
                    min={5}
                    max={3000}
                    step={1}
                    unit="ms"
                    log
                    onChange={(v) => updateSound("noise", "decay", v)}
                  />
                </div>
                <div className="noise-color-row">
                  <span className="field-label">COLOR</span>
                  <div className="color-buttons">
                    {(["white", "pink", "brown"] as const).map((color) => (
                      <button
                        key={color}
                        className={sound.noise.color === color ? "active" : ""}
                        onClick={() => updateSound("noise", "color", color)}
                      >
                        <span className={`noise-dot ${color}`} />
                        {color[0].toUpperCase() + color.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {editorTab === "effects" && (
            <div className="parameter-grid effects-grid">
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">01</span>
                  <h3>Saturation</h3>
                  <span className="parameter-caption">TOAST THE TONE</span>
                </div>
                <div className="effect-feature">
                  <Knob
                    label="Drive"
                    value={sound.effects.drive}
                    min={0}
                    max={1}
                    step={0.01}
                    unit="%"
                    format={(v) => String(Math.round(v * 100))}
                    onChange={(v) => updateSound("effects", "drive", v)}
                  />
                  <div>
                    <span className="effect-illustration">
                      <svg viewBox="0 0 160 55">
                        <path
                          d="M1 49 C55 49 46 5 90 5 L159 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M1 49 L159 5"
                          fill="none"
                          stroke="#ccc"
                          strokeDasharray="3 3"
                        />
                      </svg>
                    </span>
                    <p>Warmth, weight, and a little bite.</p>
                  </div>
                </div>
                <button
                  className="text-button effect-reset"
                  onClick={() => updateSound("effects", "drive", 0)}
                >
                  Reset saturation <RotateCcw size={12} />
                </button>
              </div>
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">02</span>
                  <h3>Bitcrusher</h3>
                  <span className="parameter-caption">DICE THE RESOLUTION</span>
                </div>
                <div className="knob-row two-knobs">
                  <Knob
                    label="Bit depth"
                    value={sound.effects.bitDepth}
                    min={4}
                    max={16}
                    step={1}
                    unit="bit"
                    onChange={(v) => updateSound("effects", "bitDepth", v)}
                  />
                  <Knob
                    label="Sample rate"
                    value={sound.effects.sampleRate}
                    min={4000}
                    max={48000}
                    step={100}
                    unit="Hz"
                    format={(v) => `${(v / 1000).toFixed(1)}k`}
                    onChange={(v) => updateSound("effects", "sampleRate", v)}
                  />
                </div>
                <p className="parameter-note">
                  Lower the resolution. Chef likes a rough chop.
                </p>
              </div>
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">03</span>
                  <h3>Space</h3>
                  <span className="parameter-caption">THE EMPTY DINING ROOM</span>
                </div>
                <div className="knob-row two-knobs">
                  <Knob
                    label="Reverb"
                    value={sound.effects.reverb}
                    min={0}
                    max={1}
                    step={0.01}
                    unit="%"
                    format={(v) => String(Math.round(v * 100))}
                    onChange={(v) => updateSound("effects", "reverb", v)}
                  />
                  <Knob
                    label="Delay"
                    value={sound.effects.delay}
                    min={0}
                    max={1}
                    step={0.01}
                    unit="%"
                    format={(v) => String(Math.round(v * 100))}
                    onChange={(v) => updateSound("effects", "delay", v)}
                  />
                </div>
                <p className="parameter-note">
                  Tails are included in your sample export.
                </p>
              </div>
            </div>
          )}
          {editorTab === "mix" && (
            <div className="parameter-grid mix-grid">
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">01</span>
                  <h3>Output</h3>
                  <span className="parameter-caption">PORTION CONTROL</span>
                </div>
                <div className="knob-row two-knobs">
                  <Knob
                    label="Level"
                    value={sound.mix.volume}
                    min={0}
                    max={1}
                    step={0.01}
                    unit="%"
                    format={(v) => String(Math.round(v * 100))}
                    onChange={(v) => updateSound("mix", "volume", v)}
                  />
                  <Knob
                    label="Pan"
                    value={sound.mix.pan}
                    min={-1}
                    max={1}
                    step={0.01}
                    format={(v) =>
                      v === 0
                        ? "C"
                        : `${Math.round(Math.abs(v) * 100)}${v < 0 ? "L" : "R"}`
                    }
                    onChange={(v) => updateSound("mix", "pan", v)}
                  />
                </div>
                <p className="parameter-note">
                  Pan affects playback. Sample files are mono.
                </p>
              </div>
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">02</span>
                  <h3>Engine</h3>
                  <span className="parameter-caption">CHOOSE THE UTENSIL</span>
                </div>
                <label className="field-label engine-select-label">
                  VOICE MODEL
                  <select
                    className="select-input"
                    value={sound.type}
                    onChange={(e) =>
                      change((p) => ({
                        ...p,
                        sounds: p.sounds.map((s, i) =>
                          i === selected
                            ? { ...s, type: e.target.value as VoiceType }
                            : s,
                        ),
                      }))
                    }
                  >
                    {TYPES.map((t, i) => (
                      <option key={t} value={t}>
                        {TYPE_LABELS[i]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="seed-field">
                  <label className="field-label">NOISE SEED</label>
                  <input
                    aria-label="Noise seed"
                    type="number"
                    min="0"
                    max="1000000"
                    value={sound.seed}
                    onChange={(e) =>
                      change((p) => ({
                        ...p,
                        sounds: p.sounds.map((s, i) =>
                          i === selected
                            ? {
                                ...s,
                                seed: Math.max(
                                  0,
                                  Math.min(1000000, Number(e.target.value)),
                                ),
                              }
                            : s,
                        ),
                      }))
                    }
                  />
                  <button
                    className="icon-button"
                    aria-label="New noise seed"
                    onClick={() =>
                      change((p) => ({
                        ...p,
                        sounds: p.sounds.map((s, i) =>
                          i === selected
                            ? {
                                ...s,
                                seed: Math.floor(Math.random() * 1000000),
                              }
                            : s,
                        ),
                      }))
                    }
                  >
                    <Dices size={16} />
                  </button>
                </div>
              </div>
              <div className="parameter-section">
                <div className="parameter-heading">
                  <span className="parameter-number">03</span>
                  <h3>Keep the recipe</h3>
                  <span className="parameter-caption">LABEL BEFORE SERVICE</span>
                </div>
                <div className="sound-actions">
                  <button
                    className="outline-button"
                    onClick={() => {
                      setPresetName(sound.name);
                      setModal("savePreset");
                    }}
                  >
                    <Plus size={15} />
                    Save to my collection
                  </button>
                  <button
                    className="outline-button"
                    onClick={() => {
                      const next = (selected + 1) % 8;
                      change((p) => ({
                        ...p,
                        sounds: p.sounds.map((s, i) =>
                          i === next
                            ? { ...clone(sound), name: `${sound.name} copy` }
                            : s,
                        ),
                      }));
                      setSelected(next);
                      notify(`Sound copied to pad ${next + 1}.`);
                    }}
                  >
                    <Copy size={15} />
                    Duplicate to next pad
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      const original = buildDefaultKit()[selected];
                      loadPreset(original);
                    }}
                  >
                    Reset this pad <RotateCcw size={12} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>}

        <footer className="workspace-footer">
          <span>
            EIGHT BURNERS. SERVICE IS ASKEW.<span className="footer-dot">✳</span> HOTPLATE
            / KITCHEN
          </span>
          <div>
            <button onClick={() => setModal("help")}>
              <Keyboard size={13} />
              Shortcuts
            </button>
          </div>
        </footer>
      </main>

      {toast && (
        <div className="toast" role="status">
          <span className="toast-icon">
            <Check size={14} />
          </span>
          {toast}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <ExportDialog
        initialMode={exportMode}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        sounds={project.sounds}
        selectedIndex={selected}
        steps={project.steps}
        stepDetails={project.stepDetails}
        musicLabPattern={project.musicLabPattern}
        renderPatternAudio={sampleRate => renderProjectPattern(project, solo, { sampleRate, tail: true }).channels}
        bpm={project.bpm}
        swing={project.swing}
        muted={project.muted.map((m, i) => m || (solo !== null && solo !== i))}
        onNotify={notify}
      />

      {modal === "library" && (
        <Modal
          title="The prep shelf is well stocked."
          subtitle="Presets, portioned and labelled. Choose a sound to load."
          onClose={closeModal}
          className="library-modal"
        >
          <div className="library-toolbar">
            <div className="search-field">
              <Search size={16} />
              <input
                autoFocus
                aria-label="Search presets"
                placeholder="Search sounds, textures, engines…"
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
              />
            </div>
            <span className="library-result-count">
              {visiblePresets.length} SOUNDS
            </span>
          </div>
          <div className="library-filters">
            {[
              ["all", "All sounds"],
              ["favorites", "Favorites"],
              ["custom", "My collection"],
              ["hybrid", "Layered recipes"],
              ["archive", "Legacy sounds"],
              ["engine:subtractive", "Subtractive"],
              ["engine:fm", "FM"],
              ["engine:wavetable", "Wavetable"],
              ["engine:granular", "Granular"],
              ...TYPES.map((type, i) => [type, TYPE_LABELS[i]]),
            ].map(([value, label]) => (
              <button
                key={value}
                className={libraryFilter === value ? "active" : ""}
                onClick={() => setLibraryFilter(value)}
              >
                {value === "favorites" && <Star size={12} />}
                {label}
              </button>
            ))}
          </div>
          <div className="preset-grid">
            {visiblePresets.map((p) => (
              <div className="preset-card" key={p.id}>
                <div className="preset-card-top">
                  <span className="eyebrow">{p.type.toUpperCase()}</span>
                  <button
                    className={`favorite-button ${favorites.includes(p.id) ? "is-favorite" : ""}`}
                    aria-label={`Favorite ${p.name}`}
                    onClick={() => toggleFavorite(p.id)}
                  >
                    <Star size={15} />
                  </button>
                </div>
                <button
                  className="preset-wave-preview"
                  aria-label={`Preview ${p.name}`}
                  onClick={() => audition(selected, p.params)}
                >
                  <MiniWave type={p.type} />
                  <span>
                    <Play size={13} fill="currentColor" />
                  </span>
                </button>
                <h3>{p.name}</h3>
                <p>{p.category}</p>
                <button
                  className="preset-use"
                  onClick={() => loadPreset(p.params)}
                >
                  Use sound
                  <ArrowRight size={13} />
                </button>
                {p.id.startsWith("custom-") && (
                  <button
                    className="preset-delete"
                    aria-label={`Delete ${p.name}`}
                    onClick={() => {
                      setCustomPresets((prev) =>
                        prev.filter((sound) => customId(sound) !== p.id),
                      );
                      setFavorites((prev) => prev.filter((id) => id !== p.id));
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {visiblePresets.length === 0 && (
              <div className="empty-state">
                <Waves size={32} />
                <h3>Nothing on the prep shelf.</h3>
                <p>
                  {libraryFilter === "custom"
                    ? "Save a sound from the instrument to start your own collection."
                    : "Try a different search, or star some sounds to keep them here."}
                </p>
                <button className="outline-button" onClick={closeModal}>
                  Back to HOTPLATE
                  <ArrowRight size={14} />
                </button>
              </div>
            )}
          </div>
          <div className="modal-footer">
            <span>
              <Headphones size={14} />
              Click a waveform to audition. Use a sound to load pad{" "}
              {selected + 1}.
            </span>
            <button className="ghost-button" onClick={closeModal}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {modal === "savePreset" && (
        <Modal
          title="Save the house recipe."
          subtitle="Save this sound to your collection in this browser."
          onClose={closeModal}
          className="small-modal"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!presetName.trim()) return;
              setCustomPresets((p) => {
                const next = { ...clone(sound), name: presetName.trim() };
                return [
                  ...p.filter((s) => customId(s) !== customId(next)),
                  next,
                ].slice(-200);
              });
              notify("Sound saved to your collection.");
              setModal(null);
            }}
          >
            <div className="modal-body">
              <label className="field-label">
                SOUND NAME
                <input
                  className="text-input"
                  autoFocus
                  required
                  maxLength={48}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                />
              </label>
              <div className="save-preview">
                <MiniWave type={sound.type} />
                <span>{sound.type.toUpperCase()} ENGINE</span>
              </div>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="ghost-button"
                onClick={closeModal}
              >
                Cancel
              </button>
              <button type="submit" className="primary-button">
                <Plus size={15} />
                Save sound
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "projects" && (
        <Modal
          title="Projects on the ticket rail."
          subtitle="Sessions saved in this browser. Download a project to take it anywhere."
          onClose={closeModal}
        >
          <div className="project-modal-actions">
            <button className="primary-button" onClick={saveProject}>
              <Save size={15} />
              Save current session
            </button>
            <button
              className="outline-button"
              onClick={() => importRef.current?.click()}
            >
              <Upload size={15} />
              Import project
            </button>
            <button className="outline-button" onClick={downloadProject}>
              <Download size={15} />
              Download current
            </button>
          </div>
          <div className="project-list">
            {savedProjects.length === 0 ? (
              <div className="empty-state">
                <FolderOpen size={32} />
                <h3>No orders on the rail.</h3>
                <p>
                  Save your current session to keep a snapshot of every sound
                  and step.
                </p>
              </div>
            ) : (
              savedProjects.map((p) => (
                <div className="saved-project" key={p.id}>
                  <span className="engine-icon">
                    <FolderOpen size={18} />
                  </span>
                  <div>
                    <h3>{p.project.name}</h3>
                    <p>
                      {p.project.bpm} BPM · {p.project.steps[0].length} steps ·{" "}
                      {new Date(p.date).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => {
                      stopTransport();
                      dispatch({ type: "load", project: clone(p.project) });
                      setSolo(null);
                      setModal(null);
                      notify("Session opened.");
                    }}
                  >
                    Open
                    <ArrowUpRight size={13} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete saved ${p.project.name}`}
                    onClick={() =>
                      setSavedProjects((prev) =>
                        prev.filter((x) => x.id !== p.id),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="modal-footer">
            <span>
              Local saves stay in this browser. Project downloads are portable.
            </span>
            <button className="ghost-button" onClick={closeModal}>
              Done
            </button>
          </div>
        </Modal>
      )}
      {modal === "help" && (
        <Modal
          title="HOTPLATE operating instructions."
          subtitle="Chef left a note. It is mostly helpful."
          onClose={closeModal}
          className="help-modal"
        >
          <div className="modal-body">
            <div className="help-intro">
              <span className="engine-icon">
                <Drum size={22} />
              </span>
              <p>
                Pick a rhythm recipe and press Play. Tap the sixteen steps to change the order; Bar B holds the second half of a two-bar rhythm. Select a burner and season it with Pitch, Length, Body, Snap, Air, and Heat. Open recipe for its three synthesis layers, modulation, and effects. Sound kits change sounds; rhythm recipes change notes. Undo brings either back.
              </p>
            </div>
            <div className="shortcut-list">
              {[
                ["A S D F G H J K", "Select and play the eight pads"],
                ["SPACE", "Play or pause the sequencer"],
                ["SHIFT + CLICK", "Open velocity, chance, repeats, timing, and pitch for a step"],
                ["R", "Discover a new sound"],
                ["SHIFT + R", "Make a subtle variation"],
                ["⌘ / CTRL + Z", "Undo your last change"],
                ["SHIFT + ⌘ / CTRL + Z", "Redo your last change"],
                ["↑ / ↓", "Adjust a focused knob"],
                ["ESC", "Close a dialog"],
              ].map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <kbd>{key}</kbd>
                </div>
              ))}
            </div>
            <div className="help-note">
              <Headphones size={17} />
              <p>
                Audio starts with your first click or key press. Headphones help
                you hear every detail. Changes save automatically in this
                browser.
              </p>
            </div>
            <div className="help-note">
              <AudioLines size={17} />
              <p>
                Use Audition layer in Sound engines to hear the layer you are
                editing on its own. The waveform play button plays the full
                sound, where quieter layers can be harder to hear.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="text-button" onClick={downloadProject}>
              Download project
              <Download size={14} />
            </button>
            <button className="primary-button" onClick={closeModal}>
              Back to HOTPLATE
              <ArrowRight size={14} />
            </button>
          </div>
        </Modal>
      )}

    </div>
  );
}
