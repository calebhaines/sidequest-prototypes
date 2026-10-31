# Reversible track freeze

Select an instrument track and choose **Freeze track** in its track controls.
GALLEY stops playback, prepares any written notes and native pattern privately,
and renders the whole arrangement from its beginning. Progress and Cancel remain
available. When rendering finishes, the frozen badge also provides a quick way
to unfreeze. **Unfreeze all** restores every frozen track together.

Freeze includes all five insert effects, the four-band track EQ, clip processing,
level, pan and both send amounts, together with their drawn automation and global
LFO contributions. Original clips, notes, source patches, effect settings and
automation stay in the project. Unfreezing restores those editable settings;
Undo/Redo can also restore the freeze operation.

The cached audio uses stereo Float32 samples without peak normalization or
16-bit quantization. Main output and both send feeds are stored separately. The
shared return effects and master remain live, so you can keep mixing those buses.
Pre-fader and post-fader send routing is preserved. Track mute and solo remain
live too.

## What saves processing

A frozen track streams its cached main and send audio. GALLEY removes its insert
processors and EQ, skips its source mixing and track automation evaluation, and
unloads the instrument iframe and its audio nodes. Its saved effect slots remain
visible for reference. Unfreezing recreates processing and loads the instrument
when needed. The global modulation graph remains available to other tracks,
returns, the master and other LFOs. Shared bus effects and the browser audio
output still use CPU. This feature reduces processing at the cost of memory and
larger project files; the amount saved depends on the track.

## Editing a frozen project

Frozen track sound controls, clip editing and instrument editing are read-only.
Unfreeze before changing them. Other tracks and shared buses remain editable.
Tempo, arrangement length and global LFO editing require unfreezing all tracks
because these can alter the audio already printed. Loop location and playhead
position can change: playback reads the corresponding part of the cached pass.
SERVICE uses its own scene transport; unfreeze tracks before opening it. Convert
a captured SERVICE take to an arrangement first if you want to freeze that take.

Freeze captures one continuous pass from beat zero, including up to eight seconds
of the track's final effect tail. Repeating a loop repeats that baked pass;
free-running or random modulation and feedback do not generate a new variation
on every repetition. Seeking recalls the baked effect history at that position.
Stopping manually silences cached future material with a short fade; shared
return tails continue. Very long or self-oscillating insert tails can outlive the
finite cached tail. The last six milliseconds of the cached tail fade to silence
to avoid a click if sound remains at the boundary. Unfreeze for a different
evolving performance.

## Instruments and recording

Written note clips and supported live patterns are compiled into one continuous
native performance for that track. Clip offsets, playback rate, swing, repeated
notes, gate lengths, velocity, transposition and voice mapping feed the same
instrument render. Release tails continue past individual clip edges; the first
pass has no folded tail from a previous loop. The original clips stay intact.
Native performance preparation is bounded to 4,096 notes and 120 seconds including
the eight-second source tail. Record or print longer native parts to audio before
freezing them; audio-only arrangements can use the full arrangement length.
Unsupported continuous or custom instruments must first be recorded into an
audio clip. Stop recording and disable input monitoring before freezing that
track. A failed or cancelled freeze leaves the original track intact.

## Saving and audio devices

Use **Save project** to keep frozen audio and all originals together. Loading a
portable project restores the frozen state without rerendering its effects.
Large frozen projects exceed browser autosave capacity; GALLEY asks you to use
Save project instead of repeatedly encoding a large backup.

Freeze uses the current audio device's sample rate. GALLEY requests the cached
rate when reopening the project, and changing to a different rate requires
unfreezing first. Frozen exports use that rate as well. This avoids changing the
sound by running the original effect algorithms at a different rate.

The separate temporary-audio budget is 192 MiB of decoded Float32 audio; the
ordinary sample budget remains 64 MiB and portable project files remain bounded
at 256 MiB. Audio is stored in chunks, with silent send feeds omitted. Long dense
arrangements with both sends can reach these limits. Freezing reports a clear
error before committing incomplete audio; unfreeze unused tracks or shorten the
arrangement to make room. Original recorded and sampled audio is retained for
unfreezing.

## Verification

Run `npm run check:freeze` for schema, routing, automation, LFO, transaction and
processor-removal checks, and `npm run check:freeze-browser` for the real browser
workflow. Existing audio regression checks protect the sound of unfrozen tracks.

The extended source matrix (`node loom/freeze-checks.cjs --matrix`) covers
79 effect/model combinations. It compares complete stereo output and verifies
that frozen tracks create and call no insert or EQ processors. Tests also cover
cross-modulating LFOs, pre/post sends, long chunked renders, live Undo, malformed
projects and native-rate WAV/stem exports.
