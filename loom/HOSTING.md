# MusicLabHost v1

LOOM hosts the full, original interface and audio engine of an instrument.
Its injected bridge gives the instrument a context facade over LOOM’s shared
AudioContext, with a destination that feeds only its assigned stereo track.
The track’s four inserts and mixer follow that destination. OfflineAudioContext
keeps its native behavior for an app’s own exports.

## Adding an app

Choose a Music Lab instrument, refresh the hosted Music Lab list, load a
same-site app URL, or upload a self-contained HTML file. Uploaded HTML travels
inside saved LOOM projects. Existing GRAIN, FORM, TINE, MIRE, SPOOL, HAZE,
BOWER, and RAVEL are bundled into LOOM’s standalone download.

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
`destination`, `createAudioContext()`, `notifyStateChange()`, and
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

SPOOL and RAVEL accept edited clips directly from LOOM. The transfer renders
only the selected clip, including trim, source offset, playback rate, reverse,
loop repetitions, clip gain and fades. It preserves the clip's full duration,
including silence after a non-looping source ends. Track volume, pan, automation
and insert effects are not baked into the received sample.

Choose the receiving track and, for SPOOL, deck A–D. Replacing an occupied
sample requires an explicit replacement choice. SPOOL keeps its other decks,
source instrument, mixer and effects. RAVEL keeps its patterns and effects;
its new sample receives sixteen even slices. Each app's Undo restores the
previous sample. SPOOL accepts at most 30 seconds and RAVEL 20 seconds; longer
clips must be shortened rather than silently truncated.

Future instruments can add these optional adapter fields:

```js
MusicLabHost.registerInstrument({
  // Existing transport and state methods…
  audioImport: {
    maxSeconds: 30,
    decks: 1,
    targets: [{ id: 0, name: 'Sample', occupied: false, assetName: '' }]
  },
  async importAudio({ pcm, sampleRate, name, options }) {
    // pcm: interleaved stereo Float32Array; sampleRate: samples/second.
    // options.deck identifies the chosen destination; options.replace must
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
