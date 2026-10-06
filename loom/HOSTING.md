# MusicLabHost v1

GALLEY hosts the full, original interface and audio engine of an instrument.
Its injected bridge gives the instrument a context facade over GALLEY’s shared
AudioContext, with a destination that feeds only its assigned stereo track.
The track’s four inserts and mixer follow that destination. OfflineAudioContext
keeps its native behavior for an app’s own exports.

## Adding an app

Choose a Kitchen instrument, refresh the hosted Kitchen list, load a
same-site app URL, or upload a self-contained HTML file. Uploaded HTML travels
inside saved GALLEY projects. SIZZLE, HOTPLATE, CLATTER, REDUCE, ROTISSERIE, STEAM,
SKEWER, DICER, STOCK, ROUX, BATTER, and LEAVEN are bundled into GALLEY’s standalone download.

An ordinary Web Audio app can use `new AudioContext()` and connect nodes to
`context.destination`. The bridge supplies track routing automatically.
Without transport registration, its editor controls playback and GALLEY records
the actual output into clips. Registration adds integrated transport and state.

## Registering an instrument

Place this after your app and audio engine are initialized:

```js
if (window.MusicLabHost) {
  MusicLabHost.registerInstrument({
    async prepare() { await engine.init(); },
    async start({ tempo, when } = {}) {
      await setTempo(tempo);
      await engine.start();
    },
    stop() { engine.stop(); },
    panic() { engine.panic(); },
    async tempo(value) { await setTempo(value); },
    getState() { return completeProjectState(); },
    setState(project) { restoreCompleteProject(project); }
  });
}
```

Return a JSON-compatible object or array from `getState`, including any sample
assets needed to restore the sound. `prepare` can initialize audio without
starting a sequencer. A time-aware engine can use `when`, expressed in the shared
context’s seconds, to schedule its start. Apps can support the same registration
while retaining independent standalone behavior.

`MusicLabHost` also exposes `version` (1), `trackId`, `tempo`, `context`,
`destination`, `createAudioContext()`, `audioLibrary`, `notifyStateChange()`, and
`status(message)`. Notify state changes after meaningful edits so GALLEY can save
the current patch. Use ordinary Web Audio constructors and AudioWorklet modules;
the bridge namespaces processors to support several instances of one app.

## Lifecycle and storage

GALLEY keeps loaded editors alive when hidden. App storage is separate from the
standalone instrument’s saved project. A child’s `close` or `suspend` affects
its own bridge rather than closing the studio context. Unloading an instrument
disconnects its nodes, cancels late operations, and releases microphone tracks.
An app should still implement Stop and Panic and clean up its own timers.

The host uses same-origin frames to share real AudioNodes. These frames are an
integration boundary for instruments chosen by the user. Custom URLs stay on
the studio’s site; external app assets need their usual browser access. A
self-contained HTML app makes offline hosting straightforward.

Native pattern lengths and swing are preserved against GALLEY’s shared bar/beat
clock. Registered note adapters let the host schedule discrete notes and silence
the app’s autonomous sequencer, preventing duplicate playback. Continuous apps
can consume transport updates with exact context timestamps. Tempo-synchronized
effects use the same clock; live and exported clips use the same deterministic DSP.

## Notes, patterns, and reversible sources

An app may expose `window.MusicLabPatternInstrument` separately from its transport
registration. The optional adapter supplies `patternExport`, `exportPattern`,
`patternImport`, `importPattern`, `notes`, `prepare`, `scheduleNote`, `cancelNotes`,
and `renderPattern`. The host discovers these capabilities automatically. Use
`MusicLabHost.patternLibrary` to share the parent studio’s pattern library.

`scheduleNote` is synchronous after preparation and receives an absolute shared
AudioContext `when`, pitch, velocity, voice ID, duration in seconds, and source ID.
Cancel only notes belonging to the requested source. Honor a supplied cancellation
`when` at that context timestamp and declare `notes.scheduledCancel: true` to enable
precise bar changes. Other adapters switch at the boundary through the safe fallback.
`renderPattern` snapshots
native state before awaiting and renders the instrument’s actual synthesis to
stereo PCM or WAV. It runs in an isolated editor, preserving the user’s live patch
and studio context. Apps without a native renderer may still be played and recorded.

GALLEY keeps complete instrument snapshots with printed clips, including sample
assets. Track inserts are applied after source synthesis and remain editable.
Patterns and source metadata are strictly validated when opening projects.
See [PATTERN-CONTRACT.md](../shared/PATTERN-CONTRACT.md) for packet fields,
timestamp rules, cancellation, voice mappings, and the complete optional API.

## Receiving audio from the arrangement

STOCK, HOTPLATE, REDUCE, ROTISSERIE, DICER, and STEAM accept edited clips directly from GALLEY.
The transfer renders the chosen start/end region of the selected clip, including
trim, source offset, playback rate, reverse, looping, clip gain, and fades. Track
volume, pan, automation, and insert effects remain on the arrangement.

Choose a receiving track and native destination. Occupied audio or synthesis
layers require an explicit replacement choice. STOCK accepts 120 seconds into
a new zone (`target: 'new'`) or an existing zone ID, with up to 64 zones and a
64 MiB decoded audio budget. Its native target list includes occupied zones and
their sample names. HOTPLATE accepts 2 seconds, REDUCE 10, ROTISSERIE 30, DICER 20, and
STEAM 20. HOTPLATE and REDUCE process mono audio; STEAM analyzes
the original stereo energy into its score. Preserve both input channels and let
the receiver handle conversion. Imports preserve unrelated app state and Undo.
Long regions must be trimmed explicitly rather than silently truncated.

Future instruments can add these optional adapter fields:

```js
MusicLabHost.registerInstrument({
  // Existing transport and state methods…
  audioImport: {
    maxSeconds: 30,
    decks: 1,
    targets: [{ id: 0, name: 'Sample', occupied: false, assetName: '' }]
  },
  async importAudio({ pcm, sampleRate, name, tempo, signal, options }) {
    // pcm: interleaved stereo Float32Array; sampleRate: samples/second.
    // options.target (also options.deck) retains the declared number/string ID.
    // signal is also available at options.signal. Check it before mutation.
    // options.replace must
    // explicitly allow replacement of an occupied destination.
    // Validate before editing, retain unrelated state, and include received
    // audio in getState() so a saved GALLEY project restores it.
    await installAudio(pcm, sampleRate, name, options);
    MusicLabHost.notifyStateChange();
  }
});
```

The host exposes `importAudio(trackId, audio, options)` and
`capabilities(trackId).audioImport`. Make `audioImport` a getter if destination
names or occupancy change. Importing copies the caller's PCM, requires a ready
active instrument, and does not start its sequencer. Imported sample state is
isolated from the app's standalone browser project.

## Exporting and sharing samples

Adapters may expose `audioExport` and `exportAudio({scope, bars, tailSeconds,
signal})`. Return `{pcm, sampleRate, name, tempo, sourceApp}` with interleaved
stereo Float32 PCM, or `{blob, name, tempo, sourceApp}` containing a WAV.
`audioExport.scopes` lists `{id, label, usesBars}`; set `usesBars: false` for hits,
raw sources, or slices. Include `defaultBars` and `maxBars`, and snapshot state
before asynchronous rendering. Stop canceled renders before publishing results.

`MusicLabHost.audioLibrary` exposes async `list()`, `get(id)`, `save(audio)`, and
`remove(id)` plus `persistent`. It delegates to the studio library rather than
isolated child project storage. Library audio uses planar PCM internally; native
import/export contracts use interleaved stereo. Bundling the shared Samples module
handles that conversion and supplies the complete interface. See
[shared/README.md](../shared/README.md) in the repository for the common contract.
