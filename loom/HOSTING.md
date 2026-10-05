# MusicLabHost v1

LOOM hosts the full, original interface and audio engine of an instrument.
Its injected bridge gives the instrument a context facade over LOOM’s shared
AudioContext, with a destination that feeds only its assigned stereo track.
The track’s four inserts and mixer follow that destination. OfflineAudioContext
keeps its native behavior for an app’s own exports.

## Adding an app

Choose a Music Lab instrument, refresh the hosted Music Lab list, load a
same-site app URL, or upload a self-contained HTML file. Uploaded HTML travels
inside saved LOOM projects. GRAIN, FORM, TINE, MIRE, SPOOL, HAZE,
BOWER, RAVEL, and FABLE are bundled into LOOM’s standalone download.

An ordinary Web Audio app can use `new AudioContext()` and connect nodes to
`context.destination`. The bridge supplies track routing automatically.
Without transport registration, its editor controls playback and LOOM records
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
`status(message)`. Notify state changes after meaningful edits so LOOM can save
the current patch. Use ordinary Web Audio constructors and AudioWorklet modules;
the bridge namespaces processors to support several instances of one app.

## Lifecycle and storage

LOOM keeps loaded editors alive when hidden. App storage is separate from the
standalone instrument’s saved project. A child’s `close` or `suspend` affects
its own bridge rather than closing the studio context. Unloading an instrument
disconnects its nodes, cancels late operations, and releases microphone tracks.
An app should still implement Stop and Panic and clean up its own timers.

The host uses same-origin frames to share real AudioNodes. These frames are an
integration boundary for instruments chosen by the user. Custom URLs stay on
the studio’s site; external app assets need their usual browser access. A
self-contained HTML app makes offline hosting straightforward.

Native app clocks may have their own pattern lengths and swing. Record parts
into LOOM clips to place and edit them precisely on the arrangement clock.
Tempo-synchronized effects use LOOM’s clock; exported clips and inserts use the
same deterministic DSP as arrangement playback.

## Receiving audio from the arrangement

FABLE, FORM, MIRE, SPOOL, RAVEL, and HAZE accept edited clips directly from LOOM.
The transfer renders the chosen start/end region of the selected clip, including
trim, source offset, playback rate, reverse, looping, clip gain, and fades. Track
volume, pan, automation, and insert effects remain on the arrangement.

Choose a receiving track and native destination. Occupied audio or synthesis
layers require an explicit replacement choice. FABLE accepts 120 seconds into
a new zone (`target: 'new'`) or an existing zone ID, with up to 64 zones and a
64 MiB decoded audio budget. Its native target list includes occupied zones and
their sample names. FORM accepts 2 seconds, MIRE 10, SPOOL 30, RAVEL 20, and
HAZE 20. FORM and MIRE process mono audio; HAZE analyzes
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
    // audio in getState() so a saved LOOM project restores it.
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
