# PICNIC implementation contract

PICNIC (`picnic`, `PicnicApp`) is Kitchen's six-part sampled village ensemble.
Original supplied City Folk SF2 sources remain outside the repository. Factory
PCM and faithful region metadata are bundled, lazily decoded, with bounded voices.

## Ownership

- Assets: `tools/prepare_samples.py`, `assets/*`, `SAMPLES.md`.
- Schema/composition: `schema.js`, `sequence.js`, `sequence-checks.cjs`.
- Audio: `audio-engine.js`, optional focused engine checks.
- Interface: `app.html`, `styles.css`, `app.js`.
- Root: `adapters.js`, `build.py`, `README.md`, final integration and builds.
- Integration agent: existing Kitchen/GALLEY registration, inventories and docs.
- Browser QA: `browser-checks.cjs` and `integration-checks.cjs` once runnable.

## Library (loaded before schema)

`PicnicLibrary` has `version`, `samples`, `presets`, `banks`, `defaults`, `palettes`.
`defaults` maps the six part IDs to preset IDs. `samples[id]` contains PCM16 base64
`data`, `sampleRate`, `frames`. A preset contains `id`, `name`, `originalBank`,
`bankNumber`, `program`, `category`, `aliases`, `regions`. Regions contain `sample`,
`key:[lo,hi]`, `velocity:[lo,hi]`, `root`, `tune` (cents), `gain` (linear),
`pan` (-1..1), `loop`, `loopMode` (0 off, 1 continuous, 3 until release),
`loopStart`, `loopEnd` (frames), `attack`, `decay`, `sustain`, `release` (seconds,
except linear sustain). Samples below 8000Hz are resampled in the asset pipeline.

## State and schema

`PicnicSchema` exports `PARTS`, `SCALES`, `KEYS`, `createDefault()`, `normalize`,
`parseProject`, `serializeProject`, `clone`. No DOM/audio dependencies. `parseProject`
validates atomically, supports JSON strings, raw state, and `{format:'picnic-project',
version:1,state}`; host wrappers are handled by the adapter. Unknown versions,
nonfinite values, invalid notes, missing presets, or malformed overlays reject.

State fields:

```
version:1, name, tempo:96, swing:0.08, key:0, scale:'major', hour:14,
season:'spring', weather:'clear', seed:12345,
master:{level:0.72,reverb:0.18,delay:0.10,tone:14000},
parts:[{id,name,presetId,level,pan,transpose,attack,release,cutoff,reverb,delay,mute,solo}],
banks:[{name:'A',length:32,chords:['Imaj7','vi7','ii7','V7'],tracks:{
  melody:[32 steps],chords:[32],bass:[32],drums:[32],neighbors:[32],texture:[32]
}} /* A-D, four independent banks */],
selectedBank:0,chain:false,chainOrder:[0,1,2,3],
musicLabPattern: optional {pattern:<validated exact Kitchen packet>,voiceMap:{source:partId}}
```

Six stable part IDs: `melody`, `chords`, `bass`, `drums`, `neighbors`, `texture`.
Each step: `{on,notes:[MIDI integers, max6],velocity,gate,probability,ratchet,offset}`.
Gate is 0.05..8 sixteenth-note steps; offset is -0.49..0.49 steps; ratchet 1..4.
Bank lengths 16 or32, always retain32 stored steps when shortening. Tempo40..240,
notes0..127, transpose-24..24, level0..1, pan-1..1, cutoff100..18000,
attack0..2, release0.005..5, wet sends0..1. Mute/solo respected for playing,
export and rendering. State has no sample payloads: factory IDs are portable.

`createDefault()` returns a musical complete default (sequence may compose it
after sequence load). Schema's `normalize` fills missing fields for legacy/default
creation; project parsing must reject genuinely malformed data rather than hiding it.
Schema validates exact overlays through `MusicLabPatternSchema` when present.

## Sequence/composition

`PicnicSequence.lengthBeats(state)` uses current bank, or ordered chain if enabled.
Each step is 1/16, so32steps=8beats. `events(state,{startBeat=0,lengthBeats,
realizeProbability=true}={})` returns sorted `{id,voice,pitch,startBeat,
durationBeats,velocity,probability}` in the requested range, including looping
when requested past one phrase. Swing, microtiming, ratchets and seeded probability
share the same deterministic implementation for live/offline. Exact overlay has
priority and keeps off-grid beats/durations; do not quantize received notes.

`compose(state,{allBanks=false,seed=state.seed,density=0.65}={})` returns a new
musical state using chosen key/scale/chord progression, hour/season/weather and
selected factory palette. Produce original, editable music, never quote game tunes.
Gentle maj7/6/9 harmony, call/response melodies, melodic bass, brushed/percussive
rhythms and optional neighbor chirps. Leave room and dynamic contrast. All banks
should be useful and distinct. Export `noteName(midi)` and chord helpers if useful.
Editing native sequence clears overlay; editing sound/mix preserves it.

## Audio API

`new PicnicAudioEngine({getState,onStep,onStatus})`; `init()` async prepares current
parts and shared context (uses hosted `AudioContext` facade automatically),
`update(state)` async updates mix and prepares changed presets, `play({when,beat=0})`,
`stop()`, `panic()`, `setTempo(value)` preserving phase, getters `context`,
`isPlaying`, `activeVoices`, `maxVoices` (cap32), and `dispose()`.

`scheduleNote({id,voice,pitch,velocity,when,durationSeconds,source})` is synchronous
after `init/update`; `cancelNotes({source,when})` honors only requested source at
the exact shared timestamp. Native scheduling tags its own source. Stop cancels
native notes; Panic clears all. Solo/mute and stereo track routing must work.

Use authentic key/velocity regions, roots, tune, pan, loops and amplitude ADSR.
LoopMode3 stops looping on release; mode1 continues until envelope ends. Shared
delay/reverb sends, per-part tone/pan/levels/envelope controls, soft master limit.
Real-time and offline use the same graph. Lazy buffers and one bounded voice pool
avoid a large standing CPU cost.

`renderNotes({state,events,tempo,lengthBeats,tailSeconds=0,signal})` returns
`{pcm:Float32Array(interleaved stereo),sampleRate}` via an isolated native offline
context; never mutate editor or live graph. Honor abort and max120seconds. Events
have sequence shape above. `exportAudio` lives on App and wraps this as needed.

## App API and UI

`window.PicnicApp` exposes `engine`, `getState`, `getProject` (project wrapper),
`loadState` async, `prepare`, `play`, `stop`, `panic`, `isPlaying` method,
`setTempo`, `exportAudio`, `audioExport`, optional `audioImport/importAudio` only
if implemented. Shared sample export can rely on pattern/phrase scope. WAV and
stereo PCM exports must contain actual audible samples, use root/shared helper
or own WAV encoder. Export supports `{scope:'pattern',bars,tailSeconds,signal}`.
Load/save complete portable project; Undo/Redo, local recovery, user-visible errors,
keyboard audition and a playable piano. A-D16/32step patterns use16 visible cells
with page1-16/17-32. Provide six rows with selected part and selected-step inspector,
preset search/filter/audition, mixer, chords, tempo/swing/key and composition.

Visual direction: warm cream, leaf green, sky blue, persimmon, tactile paper,
postage stamps, original illustrated village/river/street map, subtle clock/hour
and seasonal sky; distinct Animal Crossing character within Kitchen. Use original
SVG/CSS artwork, no external fonts/network assets or official game logos. Light
theme, roomy readable controls, responsive phone layout, reduced-motion handling.
Topbar `.masthead-actions` hosts Kitchen Samples/Patterns buttons. Main section
anchors `#picnic-score`, `#picnic-sound`, `#picnic-mixer`; hosted fix preserves them.

DOM and source must allow source archives to rebuild standalone offline. Root
build order: asset manifest, sample data, schema, sequence, audio engine, app,
adapters, then shared exchange. `musiclab:app-ready` event `{app:'picnic'}` after
App exposed. Adapters install after app and provide host and exact pattern API.

## Testing

Meaningful checks: schema atomic rejection and exact state roundtrip; 16/32 and
chain events including finalstep/offset/chords/ratchets/solo; authentic sample
selection/loops, audible bounded stereo offline output and deterministic live
event parity; source-specific future cancellation; voice ceiling; actual project
save/open and imported exact packet retention through sound edits; shared samples
and patterns; GALLEY discrete Live notes vs native scheduler exclusivity, portable
snapshot/reopen, 390px and desktop interaction without overflow. Browser CPU
measurement with6parts/32voices should report measured headroom, not guesses.
