import { useEffect, useMemo, useState } from "react";
import { Copy, Dices, Play, RotateCcw, Redo2, SkipBack, Square, Trash2, Undo2, Volume2, VolumeX } from "lucide-react";
import type { SoundParams } from "./types";
import { createStepDetails, normalizeStepDetail, normalizeStepDetails, type StepDetail } from "./sequencing";
import { Knob } from "./Visuals";

export const LANE_COLORS = ["#f58d52", "#e4c17c", "#d5949b", "#a9c2b2", "#9bb5d0", "#c4a8d2", "#d3b685", "#b5c684"];
export type SequenceProject = { name: string; sounds: SoundParams[]; steps: boolean[][]; muted: boolean[]; bpm: number; swing: number; stepDetails?: StepDetail[][]; grooveId?: string; musicLabPattern?: { pattern: unknown; voiceMap: Record<string, string> } };

export default function HotplateSequencer({ project, selected, solo, playing, currentStep, fill, onSelect, onAudition, onChange, onNativeChange, onPlay, onStop, onRestart, onSolo, onFill, onUndo, canUndo, onRedo, canRedo, volume, onVolume, onExport, onNotice }: {
  project: SequenceProject; selected: number; solo: number | null; playing: boolean; currentStep: number; fill: boolean;
  onSelect: (index: number) => void; onAudition: (index: number) => void;
  onChange: (update: (p: SequenceProject) => SequenceProject) => void; onNativeChange: (update: (p: SequenceProject) => SequenceProject) => void;
  onPlay: () => void; onStop: () => void; onRestart: () => void; onSolo: (voice: number | null) => void; onFill: (value: boolean) => void;
  onUndo: () => void; canUndo: boolean; onRedo: () => void; canRedo: boolean; volume: number; onVolume: (value: number) => void; onExport: () => void; onNotice: (message: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [detailsMode, setDetailsMode] = useState(false);
  const [inspector, setInspector] = useState<{ voice: number; step: number } | null>(null);
  const [pulses, setPulses] = useState(4);
  const [rotation, setRotation] = useState(0);
  const length = project.steps[0].length;
  const details = useMemo(() => normalizeStepDetails(project.steps, project.stepDetails), [project.steps, project.stepDetails]);
  const start = page * 16;
  useEffect(() => { if (project.grooveId && project.grooveId !== "custom") setPage(0); }, [project.grooveId]);
  useEffect(() => { if (start >= length) setPage(0); if (inspector && inspector.step >= length) setInspector(null); }, [length, start, inspector]);
  useEffect(() => { const release = () => onFill(false); window.addEventListener("blur", release); return () => { window.removeEventListener("blur", release); onFill(false); }; }, [onFill]);
  const edited = (update: (p: SequenceProject) => SequenceProject) => onNativeChange(p => ({ ...update(p), grooveId: "custom" }));
  function toggle(voice: number, step: number) {
    onSelect(voice);
    edited(p => ({ ...p, steps: p.steps.map((row, index) => index === voice ? row.map((value, s) => s === step ? !value : value) : row) }));
  }
  function editDetail(patch: Partial<StepDetail>) {
    if (!inspector) return;
    edited(p => ({ ...p, stepDetails: normalizeStepDetails(p.steps, p.stepDetails).map((row, voice) => voice === inspector.voice ? row.map((detail, step) => step === inspector.step ? normalizeStepDetail({ ...detail, ...patch }, step) : detail) : row) }));
  }
  function shift(direction: number) {
    edited(p => {
      const d = normalizeStepDetails(p.steps, p.stepDetails);
      const rotate = <T,>(row: T[]) => row.map((_, i) => row[(i - direction + row.length) % row.length]);
      return { ...p, steps: p.steps.map((row, i) => i === selected ? rotate(row) : row), stepDetails: d.map((row, i) => i === selected ? rotate(row) : row) };
    });
  }
  function density() {
    edited(p => {
      const d = normalizeStepDetails(p.steps, p.stepDetails);
      const count = Math.min(pulses, 16);
      return { ...p, steps: p.steps.map((row, voice) => voice !== selected ? row : row.map((hit, step) => step < start || step >= start + 16 ? hit : (((step - start - rotation + 16) % 16) * count) % 16 < count)), stepDetails: d };
    });
    onNotice(`${pulses} evenly spaced hits on burner ${selected + 1}, bar ${page ? "B" : "A"}. Undo is standing by.`);
  }
  function vary() {
    edited(p => {
      const candidates = p.steps[selected].map((_, step) => step).filter(step => step >= start && step < start + 16 && step % 4 !== 0);
      let hash = (selected + 1) * 2654435761;
      for (const hit of p.steps[selected]) hash = Math.imul(hash ^ (hit ? 1 : 0), 16777619) >>> 0;
      const aIndex = hash % candidates.length;
      const bIndex = (aIndex + 1 + ((hash >>> 8) % (candidates.length - 1))) % candidates.length;
      const a = candidates[aIndex], b = candidates[bIndex];
      return { ...p, steps: p.steps.map((row, voice) => voice === selected ? row.map((hit, step) => step === a || step === b ? !hit : hit) : row) };
    });
    onNotice(`Burner ${selected + 1} rhythm varied. Undo restores the previous order.`);
  }
  const selectedDetail = inspector ? details[inspector.voice]?.[inspector.step] : undefined;
  return <section className="hotplate-sequencer sequencer panel" aria-label="HOTPLATE step sequencer">
    <div className="sequencer-header">
      <div className="sequencer-title"><div><span className="eyebrow">THE ORDER / {length} STEPS</span><h2>Sequence the service<span>.</span></h2><p>Eight burners. Set the rhythm; keep it moving.</p></div></div>
      <div className="hotplate-transport transport">
        <button className={`transport-play ${playing ? "is-playing" : ""}`} onClick={onPlay} aria-label={playing ? project.musicLabPattern ? "Stop shared sequencer" : "Pause sequencer" : "Play sequencer"}><Play size={18} fill="currentColor" /><span>{playing ? project.musicLabPattern ? "Stop" : "Pause" : "Play"}</span></button>
        <button className="outline-button transport-stop" onClick={onStop} aria-label="Stop sequencer"><Square size={14} />Stop</button>
        <button className="icon-button" onClick={onRestart} aria-label="Restart sequencer from beginning" title="Restart from step one"><SkipBack size={17} /></button>
        <label className="bpm-control"><input aria-label="Tempo BPM" type="number" min={40} max={240} value={project.bpm} onChange={e => onChange(p => ({ ...p, bpm: Math.max(40, Math.min(240, Number(e.target.value) || 40)) }))} /><span>BPM</span></label>
        <label className="swing-control"><span>SWING</span><input aria-label="Swing" type="range" min={0} max={60} value={project.swing} onChange={e => onChange(p => ({ ...p, swing: Number(e.target.value) }))} /><strong>{project.swing}%</strong></label>
        <label className="hp-master-volume"><Volume2 size={14} /><input aria-label="Master playback volume" type="range" min={0} max={1} step={.01} value={volume} onChange={e => onVolume(Number(e.target.value))} /><strong>{Math.round(volume * 100)}%</strong></label>
        <button className={`outline-button hp-fill ${fill ? "is-held" : ""}`} aria-label="Hold fill" aria-pressed={fill} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); onFill(true); }} onPointerUp={() => onFill(false)} onPointerCancel={() => onFill(false)} onLostPointerCapture={() => onFill(false)} onKeyDown={e => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); onFill(true); } }} onKeyUp={e => { if (e.code === "Space" || e.key === "Enter") { e.preventDefault(); onFill(false); } }} onBlur={() => onFill(false)} disabled={!!project.musicLabPattern} title={project.musicLabPattern ? "Use the native grid to perform fills." : "Hold to repeat active hits in the final four steps."}>Hold fill</button>
      </div>
    </div>
    {project.musicLabPattern && <div className="hp-overlay-notice" role="status"><strong>Shared pattern is playing.</strong><span>Its exact notes remain intact. Editing this native grid restores the native rhythm; Undo returns the shared pattern.</span><button className="outline-button" onClick={() => { onNativeChange(p => p); onNotice("Native grid restored. Undo returns the exact shared pattern."); }}>Use native grid</button></div>}
    <div className="sequencer-tools hotplate-pattern-tools">
      <div className="hp-bank-tabs" role="group" aria-label="Pattern bar"><button className={page === 0 ? "active" : ""} aria-pressed={page === 0} onClick={() => setPage(0)}>Bar A <span>1–16</span></button><button className={page === 1 ? "active" : ""} aria-pressed={page === 1} disabled={length === 16} onClick={() => setPage(1)}>Bar B <span>17–32</span></button></div>
      <div className="step-count-switch" role="group" aria-label="Pattern length">{[16, 32].map(n => <button key={n} className={length === n ? "active" : ""} aria-pressed={length === n} onClick={() => { if (n === length) return; onStop(); edited(p => { const d = normalizeStepDetails(p.steps, p.stepDetails); return { ...p, steps: p.steps.map(row => Array.from({ length: n }, (_, i) => row[i % row.length])), stepDetails: d.map(row => Array.from({ length: n }, (_, i) => ({ ...row[i % row.length] }))) }; }); onNotice(n === 16 ? "Using bar A. Bar B is kept in Undo." : "Two bars ready. Bar A has been copied to B."); }}>{n} steps</button>)}</div>
      <button className={`outline-button hp-details-toggle ${detailsMode ? "active" : ""}`} aria-pressed={detailsMode} onClick={() => setDetailsMode(value => !value)}>{detailsMode ? "Details mode" : "Edit step details"}</button>
      <button className="outline-button" disabled={!canUndo} onClick={onUndo}><Undo2 size={14} />Undo</button>
      <button className="outline-button" disabled={!canRedo} onClick={onRedo}><Redo2 size={14} />Redo</button>
      <button className="text-button" onClick={() => { edited(p => ({ ...p, steps: p.steps.map(row => row.map(() => false)), stepDetails: createStepDetails(p.steps) })); onNotice("Pattern cleared. Undo brings it straight back."); }}><Trash2 size={14} />Clear pattern</button>
    </div>
    <div className="sequence-scroll"><div className="sequence-grid">
      <div className="sequence-ruler"><span className="track-ruler-label">BURNER</span><div className="ruler-steps">{Array.from({ length: 16 }, (_, i) => <span key={i} className={i % 4 === 0 ? "beat-mark" : ""}>{String(start + i + 1).padStart(2, "0")}</span>)}</div></div>
      {project.sounds.map((voice, index) => <div className={`sequence-row ${selected === index ? "selected" : ""} ${project.muted[index] || solo !== null && solo !== index ? "muted" : ""}`} key={index} style={{ "--voice-accent": LANE_COLORS[index] } as React.CSSProperties}>
        <div className="sequence-track"><button className="track-play" aria-label={`Select and audition burner ${index + 1} ${voice.name}`} onClick={() => { onSelect(index); onAudition(index); }}><span className={`track-color color-${index}`} /><span>{voice.name}</span></button>
          <button className={`track-mute ${project.muted[index] ? "active" : ""}`} aria-label={`${project.muted[index] ? "Unmute" : "Mute"} ${voice.name}`} aria-pressed={project.muted[index]} onClick={() => onChange(p => ({ ...p, muted: p.muted.map((value, i) => i === index ? !value : value) }))}>{project.muted[index] ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
          <button className={`track-solo ${solo === index ? "active" : ""}`} aria-label={`Solo ${voice.name}`} aria-pressed={solo === index} onClick={() => onSolo(solo === index ? null : index)}>S</button></div>
        <div className="sequence-steps">{voice && project.steps[index].slice(start, start + 16).map((active, local) => { const step = start + local, detail = details[index][step]; return <button key={step} className={`sequence-step ${Math.floor(local / 4) % 2 === 0 ? "beat-group" : ""} ${active ? "on" : ""} ${currentStep === step ? "playhead" : ""} ${local % 4 === 0 ? "beat-start" : ""} ${inspector?.voice === index && inspector.step === step ? "detail-selected" : ""}`} style={{ "--hit-velocity": detail.velocity } as React.CSSProperties} aria-label={`${voice.name} step ${step + 1}`} aria-pressed={active} data-voice={index} data-step={step} title={`${voice.name} · step ${step + 1} · ${Math.round(detail.velocity * 100)}% velocity · ${Math.round(detail.probability * 100)}% probability · ${detail.ratchet} hit${detail.ratchet > 1 ? "s" : ""}. ${detailsMode ? "Tap to edit details." : "Tap to toggle; Shift-click for details."}`} onClick={e => { if (detailsMode || e.shiftKey) { onSelect(index); setInspector({ voice: index, step }); } else toggle(index, step); }} onContextMenu={e => { e.preventDefault(); onSelect(index); setInspector({ voice: index, step }); }}><span />{active && detail.ratchet > 1 && <i className="hp-ratchet-mark">{detail.ratchet}</i>}{active && detail.probability < 1 && <i className="hp-probability-mark" aria-hidden="true">·</i>}</button>; })}</div>
      </div>)}
    </div></div>
    <p className="hp-scroll-hint">Swipe the steps to reach the rest of the bar. →</p>
    <div className="hp-lane-tools"><span>Burner {String(selected + 1).padStart(2, "0")}</span><button className="text-button" aria-label="Shift selected burner left" onClick={() => shift(-1)}>← Shift</button><button className="text-button" aria-label="Shift selected burner right" onClick={() => shift(1)}>Shift →</button><button className="text-button" onClick={vary}><Dices size={13} />Vary rhythm</button><button className="text-button" onClick={() => { edited(p => ({ ...p, steps: p.steps.map((row, voice) => voice === selected ? row.map(() => false) : row) })); onNotice(`Burner ${selected + 1} cleared. Undo restores it.`); }}><Trash2 size={13} />Clear burner</button><button className="text-button" disabled={length !== 32} onClick={() => { edited(p => { const d = normalizeStepDetails(p.steps, p.stepDetails); return { ...p, steps: p.steps.map(row => [...row.slice(0, 16), ...row.slice(0, 16)]), stepDetails: d.map(row => [...row.slice(0, 16), ...row.slice(0, 16).map(detail => ({ ...detail }))]) }; }); onNotice("Bar A duplicated to B. Undo restores the previous B."); }}><Copy size={13} />A → B</button></div>
    <details className="hp-density-tool"><summary>Evenly spaced rhythm / selected burner</summary><div><label>Hits <input aria-label="Density hits" type="range" min={0} max={16} value={pulses} onChange={e => setPulses(Number(e.target.value))} /><strong>{pulses}</strong></label><label>Rotation <input aria-label="Density rotation" type="range" min={0} max={15} value={rotation} onChange={e => setRotation(Number(e.target.value))} /><strong>{rotation}</strong></label><button className="outline-button" onClick={density}>Apply density to bar {page ? "B" : "A"}</button></div></details>
    {inspector && selectedDetail && <div className="hp-step-inspector" aria-label="Step detail editor"><div className="hp-inspector-heading"><div><span className="eyebrow">BURNER {String(inspector.voice + 1).padStart(2, "0")} / STEP {String(inspector.step + 1).padStart(2, "0")}</span><h3>{project.sounds[inspector.voice].name}</h3></div><button className={`outline-button ${project.steps[inspector.voice][inspector.step] ? "active" : ""}`} aria-pressed={project.steps[inspector.voice][inspector.step]} onClick={() => toggle(inspector.voice, inspector.step)}>{project.steps[inspector.voice][inspector.step] ? "Step on" : "Enable step"}</button><button className="text-button" onClick={() => editDetail(normalizeStepDetail(undefined, inspector.step))}><RotateCcw size={13} />Reset step</button><button className="text-button" onClick={() => setInspector(null)}>Close details</button></div>
      <div className="hp-step-controls"><Knob label="Step velocity" value={selectedDetail.velocity * 100} min={0} max={100} step={1} unit="%" onChange={v => editDetail({ velocity: v / 100 })} /><Knob label="Step probability" value={selectedDetail.probability * 100} min={0} max={100} step={1} unit="%" onChange={v => editDetail({ probability: v / 100 })} /><Knob label="Step repeats" value={selectedDetail.ratchet} min={1} max={4} step={1} onChange={v => editDetail({ ratchet: v as StepDetail["ratchet"] })} /><Knob label="Step timing" value={selectedDetail.timing * 100} min={-45} max={45} step={1} unit="%" format={v => `${v > 0 ? "+" : ""}${Math.round(v)}`} onChange={v => editDetail({ timing: v / 100 })} /><Knob label="Step pitch" value={selectedDetail.pitch} min={-24} max={24} step={1} unit="st" onChange={v => editDetail({ pitch: v })} /></div><p>Timing is a fraction of a sixteenth note. Chance varies by loop; repeat hits share one chance decision. Pitch applies only to this hit.</p></div>}
    <div className="sequencer-footer"><span>{detailsMode ? "Details mode: tap a step to edit its ingredients." : "Tap steps to toggle. Shift-click or right-click opens details."}</span><button className="text-button" onClick={onExport}>Export groove →</button></div>
  </section>;
}
