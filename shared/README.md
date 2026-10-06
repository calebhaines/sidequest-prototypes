# Kitchen audio and pattern exchange

`music-audio-exchange.js` and its scoped stylesheet provide the **Samples** dialog used by the instruments and GALLEY. Apps render samples into a shared browser library, receive selections into named destinations, or move audio through WAV files and portable Kitchen packets. A companion **Patterns** dialog shares editable musical parts. Both modules have no network requests, external dependencies, or cloud storage.

## Using the dialog

1. Open **Samples → Send audio**, choose an export source, and render it.
2. Choose **Save to library**. Open another Kitchen app in the same browser and origin, then select that sound from **Samples → Library**.
3. Adjust selection start/end, preview the audio, and choose a receiving destination. Existing destination audio requires explicit replacement confirmation.

The library shows names, source apps, duration, tempo, and waveform thumbnails. Search also matches stored tags. Deleting a library entry does not remove audio already imported into an app or project.

**Portable packet** downloads preserve sample metadata and work between separate offline HTML files or browsers. **WAV** downloads work with other audio software; WAV export does not embed Kitchen metadata.

## Current destinations

All native import methods receive interleaved stereo PCM. Each destination performs its own conversion or analysis.

| App | Maximum selected duration | Destinations | Result |
| --- | ---: | --- | --- |
| STOCK | 120 seconds | New sample zone or existing string zone ID | Stereo multisample instrument, up to 64 key/velocity zones |
| HOTPLATE | 2 seconds | 8 voices × 3 layers; string IDs such as `"0:a"` | Mono granular texture at 22,050 Hz; enables the selected layer and its granular sample engine |
| REDUCE | 10 seconds | 4 sources; numeric IDs `0`–`3` | Mono source sample for the resonator network |
| ROTISSERIE | 30 seconds | 4 decks; numeric IDs `0`–`3` | Stereo tape-deck source |
| DICER | 20 seconds | One sample; numeric ID `0` | Stereo source for slicing |
| STEAM | 20 seconds | Spectral score; string ID `"score"` | Editable score produced by spectral analysis, rather than direct sample playback |
| BATTER | 120 seconds | A/B sources in 12 drum lanes; A uses the canonical lane ID, B adds `:b` | Stereo acoustic drum sampler with blendable velocity/alternate layers |
| GALLEY | 120 seconds | 8 tracks; string track IDs | Appends an audio clip at the playhead; existing clips remain available |

SIZZLE, CLATTER, SKEWER, ROUX, and LEAVEN export audio. They do not advertise sample-import destinations. All thirteen apps can use the library and file exchange. Selection length must satisfy both the shared limit and the receiving app's limit; the dialog does not silently shorten it. STEAM retains both incoming channels for analysis, including energy in anti-phase stereo material.

## Storage and limits

The persistent library uses IndexedDB database `musiclab-audio-v1`, version `1`, with a `samples` object store keyed by `id`. It is shared by apps on the same origin, within the same browser profile. It is separate from individual app projects and GALLEY sessions.

- Maximum **32 samples** in the library.
- Maximum **64 MiB** (`67,108,864` bytes) of stored Float32 PCM across the library. This measures decoded audio, not downloaded WAV/packet size or IndexedDB overhead.
- Maximum **120 seconds** per saved sample or portable packet, subject to the PCM byte limit.
- Mono or stereo audio with an integer sample rate from **8,000 to 192,000 Hz** and finite samples.

Quota checking and persistent writes use one transaction so simultaneous tabs cannot bypass the library limit. Samples are not evicted automatically. A full library or failed persistent write produces an error; download a packet or delete an entry before trying again.

If IndexedDB cannot be opened, the module uses an in-memory library and displays a notice that it will disappear when the page closes. Download a packet to retain the sound. The `persistent` getter reports whether the module has fallen back after its first storage attempt.

Browsers may isolate or deny storage for `file:` pages. Offline HTML files therefore display a reminder to use portable packets when transferring sounds between files. Private browser sessions and clearing site data can also remove stored samples. Hosted instruments delegate to `MusicLabHost.audioLibrary` so GALLEY's per-instrument storage isolation does not create separate sample libraries.

Audio-file decoding accepts files up to 128 MiB. The decoded preview can be longer than a saved selection (up to 900 seconds), but still must fit the 64 MiB decoded-audio limit. Browser support determines available audio codecs. Decoding uses a temporary AudioContext, which is closed afterwards; its decoded sample rate may differ from the file's original sample rate.

## Registering a future app

Load or embed the shared CSS and JavaScript, then register a lazy adapter lookup:

```js
MusicLabExchange.register({
  id: 'future',
  name: 'FUTURE',
  accent: '#a8e4c0',
  mountSelector: '.toolbar-actions',
  getAdapter: () => window.FutureApp,
});
```

`mountSelector` chooses where the Samples button lives. A missing mount uses a floating button. Apps with delayed UI rendering can dispatch `document.dispatchEvent(new CustomEvent('musiclab:app-ready', { bubbles: true }))` after the facade and toolbar exist; the launcher then moves into the toolbar. `getAdapter` may return a promise. Its result is read whenever the dialog opens, so registration can precede facade initialization.

The registration returns `{ open, dispose }`. `MusicLabExchange.open('future')` also opens it programmatically. Keep one stable app ID and an adapter that exposes the capabilities it actually supports.

```js
window.FutureApp = {
  audioExport: {
    scopes: [
      { id: 'pattern', label: 'Current pattern' },
      { id: 'hit', label: 'Selected hit', usesBars: false },
    ],
    defaultBars: 1,
    maxBars: 16,
  },

  async exportAudio({ scope, bars, tailSeconds, signal }) {
    signal?.throwIfAborted();
    const rendered = await renderCurrentSound({ scope, bars, tailSeconds });
    signal?.throwIfAborted();
    return {
      pcm: rendered.interleavedStereo, // Float32Array: L0, R0, L1, R1, …
      channels: 2,
      sampleRate: rendered.sampleRate,
      name: 'Future phrase',
      sourceApp: 'FUTURE',
      tempo: currentTempo,
      bars,
      tags: ['phrase'],
    };
  },

  get audioImport() {
    return {
      maxSeconds: 20,
      channels: 2,
      description: 'Load audio into a sample voice.',
      targets: voices.map((voice, index) => ({
        id: index,
        name: `Voice ${index + 1}`,
        occupied: Boolean(voice.sample),
        assetName: voice.sample?.name || '',
      })),
    };
  },

  async importAudio({ pcm, sampleRate, name, options = {}, signal }) {
    const cancellation = signal || options.signal;
    cancellation?.throwIfAborted();
    const target = voices.find((_, index) => index === options.target);
    if (!target) throw new Error('Choose a valid voice.');
    if (target.sample && !options.replace) throw new Error('Confirm replacement.');
    validateAudio(pcm, sampleRate); // Validate channel count, values, and app limits.
    const prepared = await prepareSample(pcm, sampleRate, name);
    cancellation?.throwIfAborted();
    // Recheck replacement after async work if another edit could change the target.
    if (target.sample && !options.replace) throw new Error('Confirm replacement.');
    commitSample(target, prepared);
    return { name, target: options.target };
  },
};
```

The rendering/conversion functions in this example belong to the new app. The shared module supplies the dialog and exchange boundary; it does not implement synthesis.

### Export contract

`exportAudio({ scope, bars, tailSeconds, signal })` may return:

- A PCM object as above, using interleaved `Float32Array` or planar `pcm: [left, right]` / `pcm: [mono]`.
- `{ blob: wavBlob, name, sourceApp, tempo, bars }`.
- A WAV `Blob` directly, with generic metadata.

Interleaved PCM defaults to two channels unless `channels` or `channelCount` explicitly says `1`. `audioExport.scopes` lists stable scope IDs and readable labels. Set `usesBars: false` for sources whose duration is intrinsic, such as a single hit or complete deck loop; the dialog hides bar count for those scopes. `maxBars` bounds the input, up to the shared UI maximum of 16. Export-only apps omit `importAudio` and `audioImport`.

Rendering should use a snapshot, preserve the live patch/transport, and honor cancellation before returning. The dialog discards a render that finishes after it closes. It does not automatically publish rendered audio; the user chooses Save or Download.

### Import contract

`importAudio` receives a finite interleaved stereo `Float32Array`, even for a mono sample engine. Mono library samples are duplicated into left/right. The receiving app owns downmixing, resampling, and destination-specific processing. Cross-window typed arrays should be validated using `Object.prototype.toString.call(pcm) === '[object Float32Array]'`, rather than relying on realm-specific `instanceof`.

The payload includes `sampleRate`, `name`, available sample metadata, and:

```js
{
  signal: abortSignal,
  options: {
    target: targetId,
    deck: targetId,
    replace: false,
    signal: abortSignal,
  },
}
```

The same signal is passed at both levels to support existing facades. Check it before and after async conversion, before changing state. Revalidate limits and replacement inside the facade as well as in the UI.

`audioImport` can be a property getter or a function returning current capabilities. Its `targets` array, or a function returning that array, contains `{ id, name, occupied, assetName }`. **IDs retain their original number or string type** when passed to the native facade. Numeric `0` and string `"0:a"` are distinct destination contracts; do not coerce arbitrary string IDs into deck numbers. The legacy `decks` field may provide an array or a numeric deck count, but explicit named targets are preferred.

For spectral or other analysis destinations, advertise `mode: 'analysis'` and a clear `description`; the action becomes **Analyze selection**. `channels: 1` describes the destination's mono engine and its UI notice, and does not cause the exchange module to premix input channels.

For GALLEY hosting, expose import/export on the existing registered instrument adapter too. See [`loom/HOSTING.md`](../loom/HOSTING.md) for the separate transport, state, and audio-routing contract.

## Public library and conversion helpers

`window.MusicLabExchange` exposes:

| Method | Result |
| --- | --- |
| `save(audio)` | Promise resolving to new saved metadata, including generated ID, timestamp, and peak waveform |
| `list()` | Promise resolving to metadata, newest first; excludes PCM |
| `get(id)` | Promise resolving to the stored record, including planar PCM, or `undefined` |
| `remove(id)` | Promise removing the library entry |
| `normalizeAudio(audio)` | Validated normalized object with planar Float32 PCM and calculated frames/duration/bytes |
| `normalizeExport(result)` | Promise normalizing a PCM or WAV-Blob render result |
| `decodeFile(file)` | Promise decoding a browser-supported audio file or packet |
| `packetFromAudio(audio)` | Version 1 packet object |
| `audioFromPacket(objectOrJSON)` | Validated normalized audio object |
| `encodeWav(audio)` | PCM16 WAV Blob |
| `register(options)`, `open(id)`, `close()` | Dialog registration and lifecycle |
| `stopPreview()` | Promise stopping preview audio and closing a preview-owned context |

`version`, `MAX_BYTES`, `MAX_SAMPLES`, `MAX_SECONDS`, and `persistent` are also exposed. Stored metadata includes `id`, `createdAt` (Unix milliseconds), `name`, `sourceApp`, `tempo`, `bars`, `tags`, `sampleRate`, `frames`, `channels`, `duration`, `bytes`, and a 48-bin `waveform` peak summary. Tempo and bar count are provenance; importing does not automatically time-stretch audio to a destination tempo.

In a host, the module delegates library operations to `MusicLabHost.audioLibrary.{list,get,save,remove}`. Its `persistent` property controls the storage notice. GALLEY's bridge forwards these operations to the parent module's common library while leaving instrument-specific project storage isolated.

## Portable packet version 1

Packets use the filename suffix `.musiclab-audio.json`. This minimal valid example encodes one silent stereo frame:

```json
{
  "format": "musiclab-audio",
  "version": 1,
  "name": "Silent frame",
  "sourceApp": "FUTURE",
  "tempo": 120,
  "bars": null,
  "tags": [],
  "sampleRate": 8000,
  "channels": 2,
  "frames": 1,
  "encoding": "pcm16le",
  "data": "AAAAAA=="
}
```

`data` is base64 of signed 16-bit little-endian PCM, interleaved frame first and channel second. Its decoded length must equal `frames × channels × 2`; frame count is per channel. Mono uses `channels: 1`. `tempo` and `bars` can be positive numbers or `null`, and tags are short strings.

The encoder clamps samples to `[-1, 1]`, scales negative values by 32,768 and nonnegative values by 32,767, then rounds. The decoder uses the matching divisor for each sign. Packet and WAV export quantize Float32 audio to PCM16; the local library preserves Float32 PCM. Validation rejects unsupported versions/encodings, mismatched lengths, invalid rates/channel counts, and packets exceeding duration or decoded PCM limits.

Packets contain rendered audio and provenance, not app patches, sequencer state, MIDI notes, or GALLEY project data. App-specific project files remain separate.

## Building standalone downloads

`bundle_audio_exchange.py` embeds the shared module and CSS into Python-built standalone apps and supplies shared source files for archives. Add future apps to its `APPS` mapping with facade name, accent, and toolbar selector. `bundle_audio_exchange.mjs` provides the equivalent embedding helper for HOTPLATE's Node build.

The published HTML embeds the module and styles so Samples works without an adjacent JavaScript/CSS file or a server. Include these sources and the relevant helper in app source archives to keep extracted projects rebuildable.

## Shared editable patterns

**Patterns** is a second shared library alongside Samples. It moves notes, beat positions, lengths, velocity, probability, and named source voices between instruments without flattening a part into audio.

1. Open **Patterns → Send pattern**, choose a source, and select **Read current pattern**.
2. **Save to library**, or download a `.musiclab-pattern.json` file for another browser or an offline HTML file.
3. In another instrument, open **Patterns → Library**, select the part, and review the receiving destination. Drum lanes require an explicit source-to-destination voice assignment. Replacing a destination that already contains notes requires the replacement checkbox.
4. In GALLEY, select a track and use **Load instrument voices** if the instrument is not loaded. **Receive pattern** adds an editable note clip. Existing arrangement clips remain in place.

Some native sequencers have a fixed grid or monophonic editor. Their pattern adapter retains the exact received part as a portable `musicLabPattern` overlay rather than silently shortening notes, dropping polyphony, or quantizing beat positions. This overlay travels with the native app project. **Use native sequence** restores the instrument's own sequence while retaining its sound. Editing the native sequence can also return the app to that sequence, as explained by the receiving adapter.

The panel previews the part as a note diagram. Sharing a pattern preserves the musical part; the receiving instrument supplies its own sound. Sample assets and patches belong in native instrument projects or GALLEY projects, rather than ordinary note-pattern packets.

### Pattern storage and limits

The local database is **`musiclab-patterns-v1`**, version `1`, with a `patterns` object store. It holds up to **128 patterns / 16 MiB** and is shared on the same origin and browser profile. Quota checking and writes share one transaction so simultaneous tabs cannot exceed the limit. Saving never evicts another part.

A portable pattern supports **4,096 notes, 64 source voices, and 256 quarter-note beats**. Each packet must fit within **1 MiB** of UTF-8 JSON. Tempo is 20–400 BPM. Notes use MIDI pitches 0–127, finite nonnegative beat positions, positive lengths fitting inside the pattern, velocity and probability 0–1, and explicit source voice IDs. IDs must be unique, and every referenced voice must exist. An optional unsigned 32-bit seed preserves deterministic probability choices.

If IndexedDB is denied, the library explicitly falls back to memory. Download note-pattern files before closing the page. Offline files may have isolated storage; portable pattern files work between them. A hosted instrument delegates to `MusicLabHost.patternLibrary.{list,get,save,remove}`, so GALLEY's isolated instrument storage does not create separate note libraries.

### Portable note format and adapter

```js
const part = {
  format: 'musiclab-pattern', version: 1,
  name: 'A borrowed turn', sourceApp: 'FUTURE', kind: 'notes',
  tempo: 120, swing: 0, lengthBeats: 4, meter: [4, 4],
  voices: [{ id: 'keys', name: 'Keys' }],
  notes: [{ id: 'n1', pitch: 60, beat: 0, duration: 1,
    velocity: 0.8, voice: 'keys', probability: 1 }],
  tags: [], seed: 17,
};
```

`kind` may be `"notes"` or `"drums"`; omitting it defaults to `"notes"`. Native adapters bake their swing into note positions and export `swing: 0` to avoid applying it twice. `MusicLabPatternSchema.normalize`, `parse`, `serialize`, `clone`, `fingerprint`, and `durationSeconds` validate and copy portable parts. File serialization uses compact JSON so a large valid part remains within its own import limit.

Register a future app alongside its Samples registration:

```js
MusicLabPatterns.register({
  id: 'future', name: 'FUTURE', accent: '#a8e4c0',
  mountSelector: '.toolbar-actions',
  getAdapter: () => window.MusicLabPatternInstrument,
});
```

The adapter exposes `patternExport.scopes`, `exportPattern({scope,signal})`, dynamic `patternImport.targets` and `.voices`, and `importPattern({pattern,options:{target,voiceMap,replace},signal})`. Target and destination voice IDs retain their native types. `voiceMap` maps source string IDs to destination IDs. The native facade repeats validation and replacement checks before committing, including after asynchronous preparation.

Optional `prepareTarget({target,pattern,signal})` loads a GALLEY track's instrument and makes its voices available for mapping. Optional `getImportedPattern()` and `clearImportedPattern()` enable the **Use native sequence** controls. The low-level `notes`, `prepare`, `scheduleNote`, `cancelNotes`, `renderPattern`, and `transport` APIs support GALLEY's shared clock and reversible rendering; their exact contract is in [PATTERN-CONTRACT.md](PATTERN-CONTRACT.md).

`window.MusicLabPatterns` exposes `register`, `open`, `close`, `list`, `get`, `save`, `remove`, `download`, `normalizePattern`, `patternFromJSON`, and `persistent`. `list()` returns metadata including note and voice counts. `get(id)` returns a copied full pattern record; normalizing it removes library-only fields such as `id`, `createdAt`, and `bytes`.

### Standalone build order

The Python and Node embedding helpers include both exchange dialogs and all adapter modules. **`pattern-schema.js` is inserted at the start of `<head>`**, before native app schemas restore exact-note overlays. The pitched/drum/bass adapter modules run after the native app scripts, followed by the pattern dialog and lazy registration. All CSS, JavaScript, contract documentation, and tests are included in source ZIPs. No adjacent files, server, or network connection is needed to use a published standalone HTML file.

Run `node shared/pattern-checks.cjs` to verify portable-note boundaries, complete 4,096-note round trips, fallback-library quotas, and host delegation.

## Kitchen presentation and compatibility

`kilter-kitchen.css` supplies the shared dark steel, enamel, orange, yellow and typography tokens. The Roboto Condensed variable font is embedded as WOFF2; its full SIL Open Font License is included in the stylesheet and `KILTER-FONTS-LICENSE.txt`. Every standalone HTML therefore keeps its typography without network access. Native app CSS may use `--kk-heading`, `--kk-ui`, `--kk-mono`, and the `--kk-*` color tokens without altering its own signal controls or layout.

Display names change; native app IDs, JavaScript facades, `musiclab-*` packet formats, IndexedDB databases, URLs and project storage keys remain stable. The mapping is GRAIN → SIZZLE, TINE → CLATTER, FORM → HOTPLATE, MIRE → REDUCE, SPOOL → ROTISSERIE, HAZE → STEAM, BOWER → SKEWER, RAVEL → DICER, FABLE → STOCK, ROUX → ROUX, BATTER → BATTER, PROOF → LEAVEN, and LOOM → GALLEY. Builder registrations include the unchanged `sourceApp` provenance as well as the display `name`. Shared library rows display the kitchen names for earlier packets while preserving their stored data.


### ROUX bass parts

ROUX is deliberately monophonic: one fundamental, one resonant body, and one note onset at a time. Its recipe compiles scale-relative movement, traversal, independent accent and slide rings, rests, and holds into concrete notes. The default export carries four recipe turns (32 beats at the default length and rate), letting the independent accent and slide rings move across the phrase. A one-turn scope is also available. Export bakes the current deterministic probability and swing into those notes. Imported off-grid notes retain their complete portable packet in `musicLabPattern`, including durations, probabilities, seed, and voice mapping. Native project files retain that overlay.

Map every source lane to the `bass` voice. ROUX accepts MIDI notes 12–108 and rejects simultaneous audible onsets, with an explanation, before changing the project. Successive overlapping notes provide legato and glide when enabled in the sound patch; turning legato off retriggers them. Chords are better assigned to a polyphonic instrument. Portable patterns carry overlap durations and velocity rather than ROUX-specific slide or accent controls; the receiving patch determines their tone.

Recipe edits return to the circular sequence; synthesis, master, tempo, and name edits preserve the received part. **Use native sequence** also restores the recipe. ROUX exports actual bass audio to Samples, WAV, or GALLEY and uses the same native engine for scheduled note clips and reversible printing. It does not advertise sample-import destinations.

### LEAVEN arpeggiated and direct-note parts

LEAVEN uses native app ID `proof` and one pitched voice, `synth`. Its Patterns export realizes the current chord progression, traversal, swing, folds, ties, ratchets and seeded probability into concrete notes. Received parts are preserved as exact notes in `musicLabPattern` rather than arpeggiated again. Map source voices to `synth`; the polyphonic engine accepts chords. Synthesis edits preserve received notes, and **Use native arp** returns to the internal recipe. Live notes, WAV exports and GALLEY prints use the same five-model engine. LEAVEN contributes audio to Samples and receives editable notes through Patterns; it does not advertise a sample-import destination.
