import { useEffect, useRef } from "react";
import type { GalleyFxSlots, SoundParams } from "./types";
import { normalizeVoiceFx, voiceEffects, type VoiceFxChange, type VoiceFxEditor } from "./voice-effects";

/** The shared editor lives outside React's tree and retains slider focus. */
export default function VoiceEffectsPanel({ sound, index, onChange, getMeters, onUndo, onRedo }: {
  sound: SoundParams; index: number;
  onChange: (slots: GalleyFxSlots, change: VoiceFxChange) => void; getMeters: () => unknown; onUndo: () => void; onRedo: () => void;
}) {
  const element = useRef<HTMLDivElement>(null), editor = useRef<VoiceFxEditor | null>(null);
  const latest = useRef({ sound, onChange, getMeters, onUndo, onRedo }); latest.current = { sound, onChange, getMeters, onUndo, onRedo };
  useEffect(() => {
    const api = voiceEffects(); if (!api || !element.current) return;
    let active = true;
    const instance = api.mount(element.current, {
      getSlots: () => normalizeVoiceFx(latest.current.sound.galleyFx),
      getKey: () => index,
      onUndo: () => latest.current.onUndo(), onRedo: () => latest.current.onRedo(),
      getMeters: () => latest.current.getMeters(),
      getLabel: () => `Burner ${index + 1} · ${latest.current.sound.name}`,
      onChange: (slots, change) => { if (active && change.phase !== "end") latest.current.onChange(slots, change); },
    });
    editor.current = instance;
    return () => { active = false; instance.close(); instance.destroy(); if (editor.current === instance) editor.current = null; };
  }, [index]);
  useEffect(() => { editor.current?.render(); }, [sound]);
  return <div ref={element} className="hotplate-voice-effects" data-hotplate-voice-fx={index} />;
}
