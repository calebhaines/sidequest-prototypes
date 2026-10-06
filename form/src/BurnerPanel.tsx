import { ArrowDownToLine, ChevronDown, Dices, Library, Play } from "lucide-react";
import type { SoundParams } from "./types";
import { getBurnerControls, setBurnerControl } from "./burner-controls";
import { Knob } from "./Visuals";

const GUIDES = [
  ["Pitch", "Tune the complete voice."],
  ["Length", "Stretch the recipe's envelopes together."],
  ["Body", "The weight of layer A."],
  ["Snap", "The attack and character of layer B."],
  ["Air", "Layer C's texture, or the noise ingredient."],
  ["Heat", "Saturation after the layers meet."],
] as const;

export default function BurnerPanel({ sound, index, typeLabel, accent, onChange, onAudition, onLibrary, onVariation, onExport, deepOpen, onToggleDeep }: {
  sound: SoundParams; index: number; typeLabel: string; accent: string;
  onChange: (sound: SoundParams) => void; onAudition: () => void; onLibrary: () => void;
  onVariation: () => void; onExport: () => void; deepOpen: boolean; onToggleDeep: () => void;
}) {
  const values = getBurnerControls(sound);
  return <section className="burner-panel hotplate-sound-panel panel" style={{ "--voice-accent": accent } as React.CSSProperties} aria-label="Selected burner sound controls">
    <div className="burner-heading">
      <div><span className="eyebrow">BURNER {String(index + 1).padStart(2, "0")} / {typeLabel.toUpperCase()}</span>
        <input className="sound-name-input" aria-label="Sound name" value={sound.name} onChange={e => onChange({ ...sound, name: e.target.value.slice(0, 48) })} />
        <p>Six ingredients. One very particular knock.</p></div>
      <div className="burner-actions">
        <button className="outline-button" onClick={onAudition}><Play size={14} />Audition sound</button>
        <button className="outline-button" onClick={onLibrary}><Library size={14} />Sound recipes</button>
        <button className="outline-button" onClick={onVariation}><Dices size={14} />Variation</button>
        <button className="outline-button" onClick={onExport}><ArrowDownToLine size={14} />Export sound</button>
      </div>
    </div>
    <div className="burner-controls">
      <Knob label="Pitch" value={values.pitch} min={20} max={12000} step={1} unit="Hz" log onChange={v => onChange(setBurnerControl(sound, "pitch", v))} />
      <Knob label="Length" value={values.length} min={5} max={3000} step={1} unit="ms" log onChange={v => onChange(setBurnerControl(sound, "length", v))} />
      {(["body", "snap", "air", "heat"] as const).map(key => <Knob key={key} label={key[0].toUpperCase() + key.slice(1)} value={values[key] * 100} min={0} max={100} step={1} unit="%" onChange={v => onChange(setBurnerControl(sound, key, v / 100))} />)}
      <Knob label="Level" value={sound.mix.volume * 100} min={0} max={100} step={1} unit="%" onChange={v => onChange({ ...sound, mix: { ...sound.mix, volume: v / 100 } })} />
      <Knob label="Pan" value={sound.mix.pan * 100} min={-100} max={100} step={1} format={v => v === 0 ? "C" : `${Math.round(Math.abs(v))}${v < 0 ? "L" : "R"}`} onChange={v => onChange({ ...sound, mix: { ...sound.mix, pan: v / 100 } })} />
    </div>
    <div className="burner-control-guide">{GUIDES.map(([name, description]) => <span key={name}><strong>{name}</strong> {description}</span>)}</div>
    <button className={`deep-recipe-toggle ${deepOpen ? "is-open" : ""}`} aria-expanded={deepOpen} aria-controls="hotplate-deep-recipe" onClick={onToggleDeep}><ChevronDown size={16} />{deepOpen ? "Close recipe" : "Open recipe"}<span>Three layers · five engines · modulation · effects</span></button>
  </section>;
}
