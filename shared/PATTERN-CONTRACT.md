# Kitchen patterns and GALLEY 1.6 contract

All existing apps and future compatible apps retain standalone offline HTML operation. GALLEY keeps exactly eight tracks and four inserts per track.

## Portable patterns

`window.MusicLabPatternSchema` exposes `VERSION:1`, `MAX_NOTES:4096`, `MAX_BEATS:256`, strict `normalize`, `parse`, `serialize`, `clone`, `fingerprint`, `durationSeconds`.

Packet: `{format:'musiclab-pattern',version:1,name,sourceApp,kind?:'notes'|'drums',tempo:20..400,swing:0..0.75,lengthBeats:0.25..256,meter:[4,4],voices:[{id:string,name,pitch?:0..127}],notes:[{id:string,pitch:0..127,beat:number,duration:number,velocity:0..1,voice:string,probability?:0..1}],seed?:uint32,tags?:string[]}`. Maximum 64 voices, 4096 notes, 1 MiB JSON. All numbers finite; note duration positive and end within pattern. IDs unique, voices referenced explicitly. Preserve probability and deterministic seed. Existing pattern defaults can supply swing; adapters should bake native swing into exported event beats and set packet swing to zero to avoid applying it twice.

## Native adapter (all apps)

Each app exposes `window.MusicLabPatternInstrument`, independently of frozen legacy facades. Shared adapter modules install it synchronously after native app scripts, before Patterns panel registration. Getters may read current native state.

- `patternExport:{scopes:[{id,label}],defaultScope}`; `exportPattern({scope}={})` returns packet (may be async).
- `patternImport:{targets:[{id,name,occupied}],voices:[{id,name,pitch?}],mode:'notes'|'drums'|'bands'|'decks',description}`; `importPattern({pattern,options:{target,voiceMap,replace},signal})` validates fully before mutation. `voiceMap` maps source string IDs to target string IDs. Existing native sequences require explicit replacement. Unsupported durations, pitch ranges, or grids must be explained or rejected; never silently discard notes. Future exact-pattern overlay storage is acceptable if complete native state/project carries it.
- `notes:{voices:[{id,name,pitch?,pitchRange?:[min,max]}],polyphonic:boolean,pitched:boolean,scheduledCancel?:boolean,pitchRange?:[min,max]}`. Declare `scheduledCancel:true` only when `cancelNotes({source,when})` honors future audio timestamps. Optional synchronous `validateNote({pitch,voice})` and `validatePattern({pattern,voiceMap})` permit pure preflight without changing the patch.
- `async prepare()`; synchronous `scheduleNote({id,pitch,velocity,voice,when,durationSeconds,source='loom'})` after preparation. `when` absolute shared AudioContext seconds. Returns a token or nothing. Native engine schedules exact event time; no asynchronous promise timer per note. Pitch supplied per event, no future global-patch mutation.
- `cancelNotes({source='loom',when}={})` clears future events and releases held notes belonging to that source only; do not close the shared context. With an absolute context timestamp `when`, retain earlier events and release/cancel that source precisely at the boundary. Other sources continue. GALLEY uses distinct source IDs for pending Live pattern revisions so changes can enter at the next bar or loop boundary without duplicate notes. `panic()` optional.
- `async renderPattern({pattern,state,tempo,tailSeconds=0,signal})` returns `{pcm:interleavedStereoFloat32Array,sampleRate,name,tempo,sourceApp}` or `{blob:WAV,sampleRate,name,...}`. Capture state before any await. Use actual native DSP, support event pitches and polyphony, cancellation and finite/budget guards; render no longer than 120 seconds per source asset. Source rendering must not mutate the editor or auto-start its sequencer.
- optional `transport({beat,tempo,when,playing,revision})` for continuous native engines. Shared scheduler handles discrete native patterns without autonomous clocks. Continuous ROTISSERIE/STEAM can follow musical seek/phase via this hook.

`window.MusicLabPatterns` provides register/open/close/library/portable JSON. Each app is registered using its existing mount and `getAdapter:()=>window.MusicLabPatternInstrument`; GALLEY exposes an adapter which receives patterns as new note clips. Hosted Patterns library is shared with the parent. Core panel does not require MIDI file support in this release.

## GALLEY note clips

Existing audio clips normalize to `type:'audio'` and preserve legacy fields. Note clips:

`{id,name,type:'notes',pattern:packet,voiceMap:{sourceId:targetId},start,length,sourceOffset:0,rate:1,loop:false,gain:1,fadeIn:0,fadeOut:0,transpose:0}`.

Start/length/fades are arrangement beats; sourceOffset is pattern beats. Rate changes musical time, transpose changes pitch. Loop repeats the pattern. Notes use the current track instrument patch and the clip's explicit voice map; incompatible instruments require mapping before playback. Note clips need no asset. Undo, copy, trim, move, portable projects, timeline drawing and piano roll must preserve these fields. Strict parsing rejects corrupt patterns/maps/sources; normalize cannot silently drop note clips. Total note and source metadata budget is bounded by project/snapshot limits.

## Shared clock and host

`audio.getTransport()` returns `{beat,contextTime,tempo,playing,revision,loopEnabled,loopStart,loopEnd,endBeat,countInBeatsRemaining,anchorBeat,anchorTime}`. `audio.subscribeTransport(fn)` returns unsubscribe. Worklet and fallback report context-time anchors; command changes issue new revisions. Future schedules cancel on seek/stop/panic/loop discontinuities and tempo changes.

Host methods: `getPatternAdapter(trackId)`, `exportPattern(trackId,options)`, `importPattern(trackId,pattern,options)`, `scheduleNote(trackId,event)`, `cancelNotes(trackId,options)`, `renderPattern(trackId,request)`. They await readiness where appropriate and use independent lifecycle guards, never the transport command counter for concurrent notes. `capabilities().notes/patternImport/patternExport` are truthful.

`new LoomNotePlayback({audio,host,getState,onStatus})` has `prepare/start/stop/panic/setState/dispose`. Root passes `ensureInstrument` callback if needed to prepare frames. It schedules note clips and externalized Live patterns against the shared clock with bounded lookahead. Held notes on seeks use remaining duration; clipping and loop tails cancel predictably.

## Reversible rendering

Audio clip `origin`:

`{format:'loom-render-source',version:1,instrument:descriptorWithSnapshot,pattern:packet,voiceMap:{},tempo:number,tailSeconds:number,sourceClip:originalNoteClip,renderedAt:number}`.

Descriptor includes ID/name and native snapshot, plus HTML/URL for a future app. A printed source always travels inside portable projects, with required sample assets inside its native snapshot. Count origin snapshots in the 96 MiB snapshot budget. `sourceClip` is a note clip without origin; prevent recursive origins. Rendering does not bake GALLEY track effects; inserts/mixer continue processing the result.

Root uses `LoomNoteRenderer` (agent exposes exact constructor/functions promptly) to create isolated, muted native render frames. `prepareNotes(state,assets,options)` returns cloned `{state,assets}` with transient audio versions of note clips for the existing DSP. Render unique pattern+snapshot keys once and reuse loopable source assets; total decoded transient budget 64 MiB. Reject an individual source pattern over 120 seconds with a clear split-pattern instruction; long clip arrangements can loop bounded patterns. Live note playback remains independent of this render-source limit.

`print` returns `{asset,audio,origin}` for root to commit atomically with one Undo. `update` keeps arrangement start/length/source geometry/gain/fades/track effects and changes only source audio and origin patch/pattern revision, subject to validation. `Edit source` opens the stored patch plus the recovered note clip/piano roll; the user explicitly updates audio. Canceled or stale renders commit nothing.

## Piano roll integration

HTML IDs: `createNoteClipButton`, `editNotesButton`, `printNoteClipButton`, `editSourceButton`, `updateAudioButton`, `pianoRollEditor`. Module controller accepts `{element,getState,getClip,remember,onChange,status,onAudition}`. `getClip()` returns `{trackIndex,clip}` or null. Controller exposes `render/open/close/tick` and optional selection APIs. Root owns app.js hooks and all builds. Schema/UI agent owns schema.js, piano-roll.js/css, app.html and checks.cjs.


## Monophonic bass adapter

ROUX uses `pattern-bass.js`, source app `ROUX`, and one target voice `bass` with MIDI pitch range 12–108. It declares `polyphonic:false`, `pitched:true`, and `scheduledCancel:true`. Imported notes are stored intact in the native `musicLabPattern` overlay. Simultaneous audible onsets are rejected before import/render; overlapping consecutive notes are valid monophonic legato, with the latest onset taking the voice. Patch `synth.legato` and `synth.glide` govern this overlap behavior. Native recipe slides are represented by overlap durations and accents by velocity, without extending portable packet version 1. Probability traversal uses beat/ID ordering and xorshift32 with `pattern.seed ?? 1`, including after native packet swing is applied once. The default native recipe export uses `compileRecipe(state,{cycles:4})`; the explicit `turn` scope exports one circuit. Four circuits fit the 256-beat packet budget even at the longest native traversal. Native recipe export resolves seeded probability and bakes native swing, so exported notes have probability 1 and packet swing 0.
