import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Dices, Play, RotateCcw, Redo2, SkipBack, Square, Trash2, Undo2, Volume2, VolumeX } from "lucide-react";
import type { SoundParams } from "./types";
import { createStepDetails, normalizeStepDetail, normalizeStepDetails, type StepDetail } from "./sequencing";
import { Knob } from "./Visuals";
import { chainLength, resizePattern, selectPatternBank, syncPatternState, type PatternBank, type PatternChain } from "./pattern-chain";
import type { SoundLocks } from "./sound-locks";

export const LANE_COLORS = ["#f58d52", "#e4c17c", "#d5949b", "#a9c2b2", "#9bb5d0", "#c4a8d2", "#d3b685", "#b5c684"];
export type SequenceProject = { name: string; sounds: SoundParams[]; steps: boolean[][]; muted: boolean[]; bpm: number; swing: number; stepDetails?: StepDetail[][]; selectedBank?: number; patternBanks?: PatternBank[]; chain?: PatternChain; grooveId?: string; musicLabPattern?: { pattern: unknown; voiceMap: Record<string, string> } };

function ChainRepeats({ value, index, onChange }: { value: number; index: number; onChange: (value: number) => boolean }) {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false), cancelled = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(String(value)); }, [value]);
  return <input data-chain-repeats aria-label={`Chain entry ${index + 1} repeats`} type="number" min={1} max={16} value={draft}
    onFocus={() => { focused.current = true; }} onChange={e => { const text = e.target.value; setDraft(text); const next = Number(text); if (text && Number.isInteger(next) && next >= 1 && next <= 16 && next !== value && !onChange(next)) setDraft(String(value)); }}
    onBlur={() => { focused.current = false; const next = cancelled.current ? value : Math.max(1, Math.min(16, Math.round(Number(draft) || value))); cancelled.current = false; setDraft(String(next)); if (next !== value && !onChange(next)) setDraft(String(value)); }}
    onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { cancelled.current = true; e.currentTarget.blur(); } }} />;
}

export default function HotplateSequencer({ project, selected, solo, playing, currentStep, playback, fill, onSelect, onAudition, onChange, onNativeChange, onPlay, onStop, onRestart, onSolo, onFill, onUndo, canUndo, onRedo, canRedo, volume, onVolume, onExport, onNotice }: {
  project: SequenceProject; selected: number; solo: number | null; playing: boolean; currentStep: number; fill: boolean;
  playback: { bank: number; entry: number; repeat: number } | null;
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
  const touchEdit = useRef<{ timer?: ReturnType<typeof setTimeout>; held: boolean; x: number; y: number }>({ held: false, x: 0, y: 0 });
  useEffect(() => () => clearTimeout(touchEdit.current.timer), []);
  const chain = project.chain ?? { enabled: false, loop: true, entries: [] };
  const bank = project.selectedBank ?? 0;
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
    onNotice(`${pulses} evenly spaced hits on burner ${selected + 1}, steps ${page ? "17–32" : "1–16"}. Undo is standing by.`);
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
  function changeChain(next: PatternChain) {
    if (next.entries.length > 32) { onNotice("A chain can hold up to 32 pattern entries."); return false; }
    if (chainLength(project, next.entries) > 256) { onNotice("Keep the complete chain within 256 beats. Reduce repeats or use shorter patterns."); return false; }
    edited(p => ({ ...p, chain: next })); return true;
  }
  function editLock(key: keyof SoundLocks, value?: number) {
    const locks = { ...selectedDetail?.locks };
    if (value === undefined) delete locks[key]; else locks[key] = value;
    editDetail({ locks });
  }
  const lockControls = selectedDetail && inspector ? [
    { key: "cutoff" as const, label: "Cutoff", value: 20000, min: 20, max: 20000, step: 1, unit: "Hz", log: true },
    { key: "resonance" as const, label: "Resonance", value: Math.SQRT1_2, min: .1, max: 20, step: .01, unit: "Q", log: true },
    { key: "decay" as const, label: "Decay", value: project.sounds[inspector.voice].tone.decay / 1000, min: .005, max: 3, step: .005, unit: "s", log: true },
    { key: "drive" as const, label: "Heat", value: project.sounds[inspector.voice].effects.drive, min: 0, max: 1, step: .01, unit: "", log: false },
    { key: "pan" as const, label: "Pan", value: project.sounds[inspector.voice].mix.pan, min: -1, max: 1, step: .01, unit: "", log: false },
  ] : [];
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
      <div className="hp-pattern-banks" role="group" aria-label="Pattern banks"><span>Pattern</span>{[0, 1, 2, 3].map(index => <button key={index} data-bank={index} aria-label={`Pattern ${"ABCD"[index]}`} aria-pressed={bank === index} className={bank === index ? "active" : ""} onClick={() => { if (bank !== index) edited(p => selectPatternBank(p, index)); }}>{"ABCD"[index]}</button>)}<button className="icon-button" data-copy-bank data-bank-copy aria-label={`Copy pattern ${"ABCD"[bank]} to ${"ABCD"[(bank + 1) % 4]}`} title={`Copy ${"ABCD"[bank]} to ${"ABCD"[(bank + 1) % 4]}; Undo restores the destination.`} onClick={() => { const saved = syncPatternState(project), banks = [...saved.patternBanks]; banks[(bank + 1) % 4] = JSON.parse(JSON.stringify(banks[bank])); const next = { ...saved, patternBanks: banks }; if (chainLength(next) > 256) { onNotice("This copy would make the chain exceed 256 beats. Reduce repeats first."); return; } edited(() => next); onNotice(`Pattern ${"ABCD"[bank]} copied to ${"ABCD"[(bank + 1) % 4]}. Undo restores the destination.`); }}><Copy size={13} /></button></div>
      <details className="hp-chain-editor"><summary title={chain.entries.map(entry => `${"ABCD"[entry.bank]} ×${entry.repeats}`).join(" → ")}>Chain <span>{chain.enabled ? chain.entries.map(entry => `${"ABCD"[entry.bank]}${entry.repeats > 1 ? "×" + entry.repeats : ""}`).join(" → ") : "off"}</span>{playing && playback && chain.enabled && <b>{"ABCD"[playback.bank]} · {playback.repeat + 1}/{chain.entries[playback.entry]?.repeats ?? 1}</b>}</summary><div className="hp-chain-content"><div className="hp-chain-settings"><label><input data-chain-enabled type="checkbox" checked={chain.enabled} onChange={e => changeChain({ ...chain, enabled: e.target.checked, entries: chain.entries.length ? chain.entries : [{ bank, repeats: 1 }] })} />Play chain</label><label>At the end<select data-chain-loop value={chain.loop ? "loop" : "once"} onChange={e => changeChain({ ...chain, loop: e.target.value === "loop" })}><option value="loop">Loop chain</option><option value="once">Play once</option></select></label><span>{chainLength(project)} beats</span><button className="text-button" data-chain-clear disabled={!chain.entries.length} onClick={() => changeChain({ enabled: false, loop: chain.loop, entries: [] })}>Clear chain</button></div><p>Entries play complete patterns. Edits enter at the next pattern boundary; the audio clock keeps running.</p><ol>{chain.entries.map((entry, index) => <li key={index} data-chain-entry={index} aria-current={playing && chain.enabled && playback?.entry === index ? "step" : undefined}><span className="hp-chain-index">{index + 1}</span><label>Pattern<select data-chain-bank aria-label={`Chain entry ${index + 1} pattern`} value={entry.bank} onChange={e => changeChain({ ...chain, entries: chain.entries.map((value, i) => i === index ? { ...value, bank: Number(e.target.value) } : value) })}>{[0, 1, 2, 3].map(value => <option key={value} value={value}>{"ABCD"[value]}</option>)}</select></label><label>Repeats<ChainRepeats value={entry.repeats} index={index} onChange={repeats => changeChain({ ...chain, entries: chain.entries.map((value, i) => i === index ? { ...value, repeats } : value) })} /></label><div className="hp-chain-entry-actions"><button data-chain-action="up" data-chain-index={index} aria-label={`Move chain entry ${index + 1} up`} disabled={index === 0} onClick={() => { const entries = [...chain.entries]; [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]]; changeChain({ ...chain, entries }); }}>↑</button><button data-chain-action="down" data-chain-index={index} aria-label={`Move chain entry ${index + 1} down`} disabled={index === chain.entries.length - 1} onClick={() => { const entries = [...chain.entries]; [entries[index + 1], entries[index]] = [entries[index], entries[index + 1]]; changeChain({ ...chain, entries }); }}>↓</button><button data-chain-action="duplicate" data-chain-index={index} aria-label={`Duplicate chain entry ${index + 1}`} onClick={() => changeChain({ ...chain, entries: [...chain.entries.slice(0, index + 1), { ...entry }, ...chain.entries.slice(index + 1)] })}><Copy size={12} /></button><button data-chain-action="remove" data-chain-index={index} aria-label={`Remove chain entry ${index + 1}`} onClick={() => { const entries = chain.entries.filter((_, i) => i !== index); changeChain({ ...chain, entries, enabled: entries.length ? chain.enabled : false }); }}><Trash2 size={12} /></button></div></li>)}</ol><button className="outline-button" data-chain-add onClick={() => changeChain({ ...chain, entries: [...chain.entries, { bank, repeats: 1 }] })}><span>+ Add pattern {"ABCD"[bank]}</span></button></div></details>
      <div className="hp-bank-tabs" role="group" aria-label="Pattern bar"><button className={page === 0 ? "active" : ""} aria-pressed={page === 0} onClick={() => setPage(0)}>Steps 1–16</button><button className={page === 1 ? "active" : ""} aria-pressed={page === 1} disabled={length === 16} onClick={() => setPage(1)}>Steps 17–32</button></div>
      <div className="step-count-switch" role="group" aria-label="Pattern length">{[16, 32].map(n => <button key={n} className={length === n ? "active" : ""} aria-pressed={length === n} onClick={() => { if (n === length) return; const next = resizePattern(project, n as 16 | 32); if (chainLength(next) > 256) { onNotice("This length would make the chain exceed 256 beats. Reduce repeats first."); return; } edited(p => resizePattern(p, n as 16 | 32)); onNotice(n === 16 ? "Using steps 1–16. Steps 17–32 stay saved in this pattern." : "Steps 17–32 restored. Empty steps stay empty."); }}>{n} steps</button>)}</div>
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
        <div className="sequence-steps">{voice && project.steps[index].slice(start, start + 16).map((active, local) => { const step = start + local, detail = details[index][step]; return <button key={step} className={`sequence-step ${Math.floor(local / 4) % 2 === 0 ? "beat-group" : ""} ${active ? "on" : ""} ${currentStep === step && (!playback || playback.bank === bank) ? "playhead" : ""} ${detail.locks && Object.keys(detail.locks).length ? "sound-locked" : ""} ${local % 4 === 0 ? "beat-start" : ""} ${inspector?.voice === index && inspector.step === step ? "detail-selected" : ""}`} style={{ "--hit-velocity": detail.velocity } as React.CSSProperties} aria-label={`${voice.name} step ${step + 1}`} aria-pressed={active} data-voice={index} data-step={step} title={`${voice.name} · step ${step + 1} · ${Math.round(detail.velocity * 100)}% velocity · ${Math.round(detail.probability * 100)}% probability · ${detail.ratchet} hit${detail.ratchet > 1 ? "s" : ""}. ${detailsMode ? "Tap to edit details." : "Tap to toggle; Shift-click for details."}`} onClick={e => { if (touchEdit.current.held) { touchEdit.current.held = false; return; } if (detailsMode || e.shiftKey) { onSelect(index); setInspector({ voice: index, step }); } else toggle(index, step); }} onPointerDown={e => { if (e.pointerType !== "touch") return; touchEdit.current.held = false; touchEdit.current.x = e.clientX; touchEdit.current.y = e.clientY; touchEdit.current.timer = setTimeout(() => { touchEdit.current.held = true; onSelect(index); setInspector({ voice: index, step }); }, 450); }} onPointerMove={e => { if (Math.abs(e.clientX - touchEdit.current.x) + Math.abs(e.clientY - touchEdit.current.y) > 10) clearTimeout(touchEdit.current.timer); }} onPointerUp={() => clearTimeout(touchEdit.current.timer)} onPointerCancel={() => clearTimeout(touchEdit.current.timer)} onPointerLeave={() => clearTimeout(touchEdit.current.timer)} onContextMenu={e => { e.preventDefault(); onSelect(index); setInspector({ voice: index, step }); }}><span />{active && detail.ratchet > 1 && <i className="hp-ratchet-mark">{detail.ratchet}</i>}{active && detail.probability < 1 && <i className="hp-probability-mark" aria-hidden="true">·</i>}</button>; })}</div>
      </div>)}
    </div></div>
    <p className="hp-scroll-hint">Swipe the steps to reach the rest of the bar. →</p>
    <div className="hp-lane-tools"><span>Burner {String(selected + 1).padStart(2, "0")}</span><button className="text-button" aria-label="Shift selected burner left" onClick={() => shift(-1)}>← Shift</button><button className="text-button" aria-label="Shift selected burner right" onClick={() => shift(1)}>Shift →</button><button className="text-button" onClick={vary}><Dices size={13} />Vary rhythm</button><button className="text-button" onClick={() => { edited(p => ({ ...p, steps: p.steps.map((row, voice) => voice === selected ? row.map(() => false) : row), stepDetails: normalizeStepDetails(p.steps, p.stepDetails).map((row, voice) => voice === selected ? row.map((_, step) => normalizeStepDetail(undefined, step)) : row) })); onNotice(`Burner ${selected + 1} cleared. Undo restores it.`); }}><Trash2 size={13} />Clear burner</button><button className="text-button" disabled={length !== 32} onClick={() => { edited(p => { const d = normalizeStepDetails(p.steps, p.stepDetails); return { ...p, steps: p.steps.map(row => [...row.slice(0, 16), ...row.slice(0, 16)]), stepDetails: d.map(row => [...row.slice(0, 16), ...row.slice(0, 16).map(detail => ({ ...detail }))]) }; }); onNotice("Steps 1–16 copied to 17–32. Undo restores the previous second half."); }}><Copy size={13} />1–16 → 17–32</button></div>
    <details className="hp-density-tool"><summary>Evenly spaced rhythm / selected burner</summary><div><label>Hits <input aria-label="Density hits" type="range" min={0} max={16} value={pulses} onChange={e => setPulses(Number(e.target.value))} /><strong>{pulses}</strong></label><label>Rotation <input aria-label="Density rotation" type="range" min={0} max={15} value={rotation} onChange={e => setRotation(Number(e.target.value))} /><strong>{rotation}</strong></label><button className="outline-button" onClick={density}>Apply to steps {page ? "17–32" : "1–16"}</button></div></details>
    {inspector && selectedDetail && <div className="hp-step-inspector" aria-label="Step detail editor"><div className="hp-inspector-heading"><div><span className="eyebrow">PATTERN {"ABCD"[bank]} / BURNER {String(inspector.voice + 1).padStart(2, "0")} / STEP {String(inspector.step + 1).padStart(2, "0")}</span><h3>{project.sounds[inspector.voice].name}</h3></div><button className={`outline-button ${project.steps[inspector.voice][inspector.step] ? "active" : ""}`} aria-pressed={project.steps[inspector.voice][inspector.step]} onClick={() => toggle(inspector.voice, inspector.step)}>{project.steps[inspector.voice][inspector.step] ? "Step on" : "Enable step"}</button><button className="text-button" onClick={() => editDetail({ ...normalizeStepDetail(undefined, inspector.step), locks: {} })}><RotateCcw size={13} />Reset step</button><button className="text-button" onClick={() => setInspector(null)}>Close details</button></div>
      <div className="hp-step-controls"><Knob label="Step velocity" value={selectedDetail.velocity * 100} min={0} max={100} step={1} unit="%" onChange={v => editDetail({ velocity: v / 100 })} /><Knob label="Step probability" value={selectedDetail.probability * 100} min={0} max={100} step={1} unit="%" onChange={v => editDetail({ probability: v / 100 })} /><Knob label="Step repeats" value={selectedDetail.ratchet} min={1} max={4} step={1} onChange={v => editDetail({ ratchet: v as StepDetail["ratchet"] })} /><Knob label="Step timing" value={selectedDetail.timing * 100} min={-45} max={45} step={1} unit="%" format={v => `${v > 0 ? "+" : ""}${Math.round(v)}`} onChange={v => editDetail({ timing: v / 100 })} /><Knob label="Step pitch" value={selectedDetail.pitch} min={-24} max={24} step={1} unit="st" onChange={v => editDetail({ pitch: v })} /></div><p>Timing is a fraction of a sixteenth note. Chance varies by loop; repeat hits share one chance decision. Pitch applies only to this hit.</p><div className="hp-step-lock-heading"><span>Sound for this step</span><button className="text-button" data-clear-step-locks disabled={!selectedDetail.locks || !Object.keys(selectedDetail.locks).length} onClick={() => editDetail({ locks: {} })}>Inherit all sound controls</button></div><div className="hp-step-sound-locks">{lockControls.map(control => <div key={control.key} className={`hp-step-sound-lock ${selectedDetail.locks?.[control.key] === undefined ? "inherited" : "overridden"}`}><label className="hp-lock-enable"><input type="checkbox" data-lock-enable={control.key} checked={selectedDetail.locks?.[control.key] !== undefined} onChange={e => editLock(control.key, e.target.checked ? control.value : undefined)} />Override {control.label.toLowerCase()}</label><Knob label={`Step ${control.label.toLowerCase()}`} lockKey={control.key} disabled={selectedDetail.locks?.[control.key] === undefined} value={selectedDetail.locks?.[control.key] ?? control.value} min={control.min} max={control.max} step={control.step} unit={control.key === "cutoff" ? "" : control.unit} log={control.log} format={control.key === "cutoff" ? value => value >= 1000 ? `${(value / 1000).toFixed(2)} kHz` : `${Math.round(value)} Hz` : undefined} onChange={value => editLock(control.key, value)} /><span className="hp-lock-state">{selectedDetail.locks?.[control.key] === undefined ? "Inherits saved sound" : "This strike only"}</span></div>)}</div><p>Cutoff adds a low-pass after the pitched sound, across every synthesis layer. Inherit removes that override; the saved burner and following hits stay unchanged.</p></div>}
    <div className="sequencer-footer"><span>{detailsMode ? "Details mode: tap a step to edit its ingredients." : "Tap steps to toggle. Shift-click or right-click opens details."}</span><button className="text-button" onClick={onExport}>Export groove →</button></div>
  </section>;
}
