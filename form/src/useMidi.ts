import { useCallback, useEffect, useRef, useState } from "react";

// Structural types keep Web MIDI optional in browsers and TypeScript's DOM library.
type MidiMessage = { data?: Uint8Array | null };
type MidiInput = {
  id: string;
  name?: string | null;
  state: string;
  addEventListener: (
    type: "midimessage",
    listener: (event: MidiMessage) => void,
  ) => void;
  removeEventListener: (
    type: "midimessage",
    listener: (event: MidiMessage) => void,
  ) => void;
};
type MidiAccess = {
  inputs: { values: () => IterableIterator<MidiInput> };
  addEventListener: (type: "statechange", listener: () => void) => void;
  removeEventListener: (type: "statechange", listener: () => void) => void;
};
type MidiNavigator = Navigator & {
  requestMIDIAccess?: (options: { sysex: boolean }) => Promise<MidiAccess>;
};

const DRUM_NOTES: Readonly<Record<number, number>> = {
  36: 0,
  38: 1,
  39: 2,
  42: 3,
  44: 3,
  46: 3,
  45: 4,
  47: 4,
  48: 4,
  50: 4,
  37: 5,
  56: 6,
  60: 6,
  61: 6,
  69: 7,
  70: 7,
};

export function useMidi(
  onPad: (index: number, velocity: number) => void,
  onNotify: (message: string) => void,
): {
  supported: boolean;
  connected: boolean;
  deviceName: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  error: string;
} {
  const supported =
    typeof navigator !== "undefined" &&
    globalThis.isSecureContext === true &&
    typeof (navigator as MidiNavigator).requestMIDIAccess === "function";
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const callbacks = useRef({ onPad, onNotify });
  callbacks.current = { onPad, onNotify };
  const accessRef = useRef<MidiAccess | null>(null);
  const inputsRef = useRef(new Map<string, MidiInput>());
  const stateListenerRef = useRef<(() => void) | null>(null);
  const pendingRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);

  const messageListener = useCallback((event: MidiMessage) => {
    const data = event.data;
    if (!data || data.length < 3 || (data[0] & 0xf0) !== 0x90 || data[2] === 0)
      return;
    const note = data[1];
    const pad =
      DRUM_NOTES[note] ?? (note >= 36 && note <= 43 ? note - 36 : undefined);
    if (pad !== undefined) callbacks.current.onPad(pad, data[2] / 127);
  }, []);

  const detach = useCallback(() => {
    if (accessRef.current && stateListenerRef.current) {
      accessRef.current.removeEventListener(
        "statechange",
        stateListenerRef.current,
      );
    }
    for (const input of inputsRef.current.values()) {
      input.removeEventListener("midimessage", messageListener);
    }
    inputsRef.current.clear();
    accessRef.current = null;
    stateListenerRef.current = null;
  }, [messageListener]);

  const syncInputs = useCallback(() => {
    const access = accessRef.current;
    if (!access || !mountedRef.current) return;
    const active = new Map<string, MidiInput>();
    for (const input of access.inputs.values()) {
      if (input.state === "connected") active.set(input.id, input);
    }
    for (const [id, input] of inputsRef.current) {
      if (active.get(id) !== input)
        input.removeEventListener("midimessage", messageListener);
    }
    for (const [id, input] of active) {
      if (inputsRef.current.get(id) !== input)
        input.addEventListener("midimessage", messageListener);
    }
    inputsRef.current = active;
    const names = [
      ...new Set(
        [...active.values()].map(
          (input) => input.name?.trim() || "MIDI controller",
        ),
      ),
    ];
    setConnected(active.size > 0);
    setDeviceName(names.join(", "));
  }, [messageListener]);

  const disconnect = useCallback(() => {
    generationRef.current += 1;
    pendingRef.current = null;
    detach();
    if (mountedRef.current) {
      setConnected(false);
      setDeviceName("");
      setError("");
      callbacks.current.onNotify("MIDI disconnected.");
    }
  }, [detach]);

  const connect = useCallback((): Promise<void> => {
    if (pendingRef.current) return pendingRef.current;
    if (!supported) {
      const message =
        typeof navigator !== "undefined" && !globalThis.isSecureContext
          ? "MIDI needs a secure connection. Open this app over HTTPS or localhost."
          : "Web MIDI is unavailable in this browser. Try Chrome or Edge.";
      setError(message);
      callbacks.current.onNotify(message);
      return Promise.resolve();
    }
    if (accessRef.current) {
      syncInputs();
      callbacks.current.onNotify(
        inputsRef.current.size
          ? "MIDI controller connected. Play your drum pads or keys."
          : "MIDI enabled. Connect a MIDI controller to begin.",
      );
      return Promise.resolve();
    }
    setError("");
    const generation = ++generationRef.current;
    // Permission is requested only from this explicit connect action, without SysEx access.
    const pending = (async () => {
      try {
        const midiNavigator = navigator as MidiNavigator;
        const access = await midiNavigator.requestMIDIAccess!({ sysex: false });
        if (!mountedRef.current || generation !== generationRef.current) return;
        accessRef.current = access;
        const stateListener = () => {
          const previous = [...inputsRef.current.keys()].sort().join("|");
          syncInputs();
          const next = [...inputsRef.current.keys()].sort().join("|");
          if (next !== previous) {
            callbacks.current.onNotify(
              inputsRef.current.size
                ? "MIDI controller connected."
                : "MIDI controller unplugged. Connect a controller to resume.",
            );
          }
        };
        stateListenerRef.current = stateListener;
        access.addEventListener("statechange", stateListener);
        syncInputs();
        callbacks.current.onNotify(
          inputsRef.current.size
            ? "MIDI controller connected. Play your drum pads or keys."
            : "MIDI enabled. Connect a MIDI controller to begin.",
        );
      } catch (cause) {
        if (!mountedRef.current || generation !== generationRef.current) return;
        detach();
        const name =
          cause && typeof cause === "object" && "name" in cause
            ? cause.name
            : "";
        const message =
          name === "NotAllowedError" || name === "SecurityError"
            ? "MIDI access was blocked. Allow MIDI in your browser’s site settings and try again."
            : "MIDI could not connect. Check your controller and try again.";
        setConnected(false);
        setDeviceName("");
        setError(message);
        callbacks.current.onNotify(message);
      }
    })();
    pendingRef.current = pending;
    void pending.then(() => {
      if (pendingRef.current === pending) pendingRef.current = null;
    });
    return pending;
  }, [detach, supported, syncInputs]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      pendingRef.current = null;
      detach();
    };
  }, [detach]);

  return { supported, connected, deviceName, connect, disconnect, error };
}

export default useMidi;
