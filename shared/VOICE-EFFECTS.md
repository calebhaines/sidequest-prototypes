# Two GALLEY effects per percussion voice

SIZZLE, CLATTER, HOTPLATE and BATTER store two serial insert slots on each voice in `galleyFx`. All fifteen effects use GALLEY's canonical catalog and DSP factories, including the complete amplifier, compressor and microphone preamp models. Each voice sums its overlapping hits into one persistent stereo chain before instrument mastering. Empty racks keep the original direct audio connection.

## State and runtime API

`KitchenVoiceEffects.normalizeSlots(value, {strict})` returns a detached two-element array. A missing field migrates to `[null, null]`. Occupied entries are `{type, params}` with a full flat parameter snapshot. Strict loading rejects unknown effects, missing controls, invalid values and extra fields. `defaults(type)`, `hasEffects(slots)` and `tailTime(slots, tempo)` support project builders and render bounds.

Call `await KitchenVoiceEffects.prepare(context)` once before using active effects. It loads one self-contained AudioWorklet module containing the exact seven GALLEY dependency factories. Empty banks may exist without preparation. A prepared live context can acquire effects later without another asynchronous graph setup.

`createBank(context, destinationOrArray, {voiceCount, tempo})` returns:

- `setVoice(index, slots)`: update one voice's two inserts. Parameter changes reuse histories; bypass and type changes reset old effect history and use a short transition.
- `connectSource(index, node)`: connect and register a native source, returning a callable detach handle (`disconnect` and `dispose` aliases). Call that handle during the hit’s existing cleanup. The initial empty route is the original direct connection with no added gain node. Adding a first effect adopts registered ringing hits through complementary 6 ms dry/wet fades.
- `input(index)`: the exact supplied destination when the rack has never been active; after first active use, its persistent stereo input remains in place even for empty/bypassed slots, so mute/solo cannot be bypassed by new or ringing hits.
- `setClock({tempo, beat, time, playing})`: anchor musical time to AudioContext time in seconds. Use the native or host transport anchor for synced movement. Future anchors take effect at their sample timestamp, not early. An unchanged tempo-only update is a no-op; a new tempo without an explicit beat preserves the current phase. Stopped clocks keep the beat fixed while free-running effects can continue.
- `setAudible(index, boolean)`: smoothly gate a voice's effect output according to mute/solo.
- `reset(index?, when=context.currentTime)`: clear histories immediately or at a future context time. A newer reset on the same voice supersedes its older queued reset, so a new audition is not cut by an earlier Stop command. Omit the index to clear all racks. Source-scoped note cancellation should fade that source's nodes without resetting unrelated audio sharing the voice.
- `getMeters(index?)`, `mode`, `latencySeconds`, and `dispose()` for analysis and lifecycle.

Each rack has independent stereo histories. Source nodes route to the returned input. Use `connectSource` for native hits so first-add edits also affect already-ringing notes. An input getter alone cannot discover unregistered native connections; callers that retain their own routing may provide their own matching crossfade. Existing active racks retain their input identity when controls change.

## Offline and fallback paths

AudioWorklet adds no fixed audio buffer delay. OfflineAudioContext uses the same processor and factory with the same scheduled native audio. Current Chromium supports Offline AudioWorklet, including deterministic impulse processing and tails. Offline exports must await preparation before scheduling the render. Preparation wraps only that OfflineAudioContext instance’s `startRendering`: immediately before its first native render, an awaited configuration module publishes the final slot settings, clock anchors and reset queue in the same WorkletGlobalScope. This avoids relying on pre-render MessagePort delivery, which can be skipped by fast offline rendering. The processor consumes that immutable snapshot at its first sample. Empty contexts publish no extra configuration module. `finalizeOffline(context)` or `bank.finalizeOffline()` is also exposed for explicit preparation; changed settings are refreshed automatically before rendering. Duplicate/closed native renders retain InvalidStateError behavior, and the wrapper preserves native `this` validation.

When live AudioWorklet is unavailable, a 256-frame ScriptProcessor fallback runs the same DSP. `latencySeconds` reports its processing block (`256 / sampleRate`); this fallback adds monitoring delay compared with Worklet. It is used only for active racks, so empty legacy voices retain their original graph and timing. An unsupported offline Worklet path reports an actionable error for wet rendering instead of silently exporting dry audio; empty legacy exports remain available.

For engines with software rendering, `createProcessor(sampleRate, slots, {tempo, beat, playing})` exposes `setSlots`, `process(left,right,clock?)`, `reset`, `getTailTime`, and `getMeters`. Calls process stereo arrays in place and preserve histories across blocks. `processBuffer(slots,{left,right,sampleRate},{tempo,beat,playing,tailSeconds})` creates a processed copy with optional zero-padding. Sum all events of a voice before applying its one processor; processing each hit separately would change shared compression and delay/reverb behaviour.

## Compact editor

`mount(element,{getSlots,onChange,getLabel,getKey?,getMeters?,onUndo?,onRedo?})` creates two slot chips and an editor opened on demand. It returns `render`, `close` and `destroy`. All effect controls, recipes, model references, bypass, reset, removal and slot order are available without adding permanent rows of controls to the instrument.

`onChange(fullSlots,{gesture,phase})` supplies a unique string per editing gesture. Remember one Undo snapshot on its first callback; `phase` is `start`, `change` or `end`. A pointer press without a value change produces no Undo callback. Discrete actions use a new token and `change`. `render()` updates the chips without rebuilding a focused editor input. Optional Undo/Redo callbacks support Ctrl/Cmd+Z while the editor is open. SCALES includes detected pitch, frequency and cents; BUTTER/SAUTÉ expose actual gain and circuit readings. Close the editor before changing the selected voice or replacing a project; `getKey` additionally guards stale editing across voice identities.

Effect patches remain with instrument project/source snapshots. Portable musical pattern packets continue to contain notes and per-step locks, not a second copy of instrument processing settings.
