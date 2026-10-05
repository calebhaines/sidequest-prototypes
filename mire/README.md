# MIRE

A standalone browser instrument for interconnected delays and resonators.

Live: https://calebhaines.github.io/sidequest-prototypes/music/mire/

Open `index.html` in a modern browser and press Play. The page contains its code,
typefaces and artwork; playback, projects and WAV exports need no connection.
Microphone input is optional and depends on browser permissions and support for
the current page origin. Importing an audio file works without microphone access.

## Playing

- Four source lanes feed a 16-step pattern into four processing nodes. Audition
  sources with the trigger buttons or keys 1–4. Space starts/stops the pattern.
- Each node offers tape echo, string, diffuser, singing bowl, spring or cloud.
  Time sets its echo length; Pitch tunes pitched models; Tone, Decay, Resonance,
  Drift, Pan and Level shape the return. Synced delay times follow tempo.
- The routing matrix sends from rows into columns. Diagonal cells are self
  feedback. Circulation sets the overall return amount; Damping darkens it.
- Two LFOs and the assignable XY pad move node or garden parameters.
  Performing a Time destination on the XY pad switches that node to manual time.
- Freeze holds the captured contents of the four nodes and blocks new input.
  Stop lets the remaining sound decay. Panic stops transport and microphone
  input, clears the garden and releases Freeze.
- Import a sample into the selected lane (first ten seconds, mixed to mono).
  Its original speed is C4. Save project includes all four possible sample assets.
- Shared audio can be received directly on any source lane, with confirmation
  before replacing a sample and Undo to restore it. Cross-app imports reject
  samples longer than ten seconds; trim them in the sample library first.
  Stereo is mixed to mono, while routing, node settings and source patterns stay
  intact. Shared samples are included in saved projects.
- Record output captures the live stereo performance, up to three minutes.
  Export WAV renders a fresh performance of the current patch with a chosen tail;
  it does not copy the live delay buffers or include microphone input. A frozen
  export first feeds one bar into the network, then captures the held texture.
  Offline renders are 48 kHz, 16-bit stereo WAVs, with up to sixteen bars and a
  thirty-second tail. Live recordings use the audio context's sample rate.

## Audio exchange

`window.MireApp.importAudio({pcm, sampleRate, name, options})` accepts copied
interleaved stereo `Float32Array` audio at 8–192 kHz, up to ten seconds. Set
`options.deck` or `options.target` (0–3) to select a source and
`options.replace: true` only after
confirming replacement. The dynamic `audioImport` capability describes the four
targets and their current samples. Imports are downmixed to mono, resampled to
at most 96 kHz, DC-corrected and given a short edge fade. They do not require
starting audio or microphone permission.

`window.MireApp.exportAudio({scope: 'pattern', bars: 1, tailSeconds: 0, signal})`
renders the current patch and returns `{blob, name, sampleRate, channels,
duration, tempo, bars, sourceApp, sourceLabel}`. The
`blob` is a 48 kHz, 16-bit stereo WAV; 1–16 bars and a 0–30-second tail are
supported. Rendering follows the same frozen-network behavior as Export WAV
and excludes microphone input. No live playback buffers are changed.
The `audioExport` capability describes this pattern scope. An optional
`AbortSignal` cancels a render between processing chunks, including frozen-network
warmup, without changing the live patch.

## Source and build

`app.html` and `styles.css` define the interface. `app.js` handles editing,
projects and performance. `schema.js` defines bounded parameters and the portable
project format; `presets.js` contains eight complete patches.

`audio-engine.js` uses one DSP implementation in an AudioWorklet, a
ScriptProcessor fallback, and the offline renderer. The network uses interpolated
delays, smoothly changing parameters, bounded routing, DC removal and a stereo
output limiter. `MireDSP` is exposed for deterministic audio verification.

Run `python3 mire/build.py` from the repository root. This embeds all assets into
`mire/index.html` and packages editable source in `music/mire/MIRE-source.zip`.
Run `npm run build` to copy the app and archive into `public/music/` and
`docs/music/`. GitHub Pages publishes `docs/`.

For an extracted source archive, run `python3 build.py` in its directory. The
standalone HTML is written beside the source; the source archive is only refreshed
when the build runs inside this repository.

The bundled Noto Sans and Noto Serif font subsets are copyright Google and
licensed under the SIL Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.
