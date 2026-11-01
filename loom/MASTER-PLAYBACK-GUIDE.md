# Master playback · speed and pitch

**Speed & pitch** in the master area changes playback of the finished stereo
arrangement. **Speed** runs from **25% to 200%**; **Pitch** runs from **−24 to
+24 semitones**. The original clips, notes, tempo and effect settings remain
editable. **Reset** returns to 100% speed, zero transpose and pitch preservation.

The neutral setting uses GALLEY’s normal live audio path. It does not prepare a
second mix, start a stretch worker or add time-stretch processing to playback.

## Listen at another speed or pitch

1. Set Speed or Pitch. Leave **Preserve pitch when changing speed** checked to
   change timing without the ordinary tape-speed tuning change.
2. Press **Play**. GALLEY first prepares the normal Float32 stereo master,
   including notes, frozen tracks, effects, sends, mastering and their existing
   automation, then transforms that mix in a background worker.
3. Listen to the prepared result. Repeated playback can reuse that result while
   the audio settings and arrangement remain the same.
4. A settings change or sound edit pauses playback and invalidates the prepared
   result. Press Play again to prepare the updated arrangement. **Cancel
   preparation** discards pending work; it does not delete your clips or audio.

For example, 50% Speed with zero Pitch and pitch preservation plays the mix for
about twice as long at its original tuning. At 100% Speed, +12 semitones raises
the finished mix one octave without doubling its playback speed. Moderate
changes generally preserve attacks and texture better than the range extremes.

The bar grid and BPM remain the arrangement’s editing reference. Speed changes
how quickly the prepared sound and its playback position move through that
arrangement; it does not rewrite every note or move automation points. Seek,
pause/resume, Stop and looping refer to the prepared passage, so resetting the
controls restores the normal transport rather than changing your source clips.

With the arrangement loop enabled, preparation uses that loop range. It renders
and discards one nominal preroll cycle before caching the next cycle, without
an extra release tail. The loop must be at least a quarter beat long. With
looping off, preparation covers the full arrangement
from its beginning plus an eight-second nominal release tail. That tail is
transformed along with the mix.

## Pitch preservation and tape behavior

With **Preserve pitch when changing speed** checked, Speed and Pitch are
independent controls. Unchecking it enables tape-style speed/pitch coupling:
a slower speed also lowers tuning and a faster speed raises it. Pitch remains
an additional transpose control. This is a playback treatment of the full mix;
it does not retune each instrument before its effects.

The displayed net pitch is the Pitch setting plus `12 × log2(speed)` semitones
in tape mode. For example, 50% Speed contributes −12 semitones; a +12 Pitch
offset balances that tuning change while retaining the slower playback.

The controls are prepared playback settings, not drawn-automation or global-LFO
destinations. Existing track, return, master and LFO automation is rendered at
the normal arrangement speed before the whole result is transformed. Delays,
reverbs and other time-dependent effects therefore follow that prepared mix.

## Editing and live playing

Altered playback is a prepared stereo performance. **Reset first** to record,
monitor a microphone/interface input, audition an instrument or open SERVICE.
Those operations need the normal live routing and sample clock. Preparing the
arrangement does not add a second live instrument performance over the cache.

Native sequenced instrument patterns can be included when their host adapters
can export them as scheduled notes. Continuous or freely played bands/decks
that cannot export a repeatable pattern must first be recorded or printed to
ordinary audio. Their existing recorded clips can then be transformed with the
rest of the mix.

A sound edit invalidates the prepared result so that playback cannot continue
with an outdated mix. Project replacement, cancellation and new preparation
also discard stale work. Preparation takes time; the controls do not promise an
instant live change to a mix that has not yet been rendered.

## Exports, freezing and projects

A **stereo master mix export** includes the master playback settings. Individual
track and return stems keep their original timing and pitch, following their
existing export routing. This lets you keep nominal stems while auditioning a
finished mix at a different speed or key.

Track freezing remains nominal: its stored audio captures the original track
processing and automation. Changing master Speed or Pitch does not invalidate
that freeze. The frozen audio joins the rest of the nominal master before the
global transform, and Reset restores normal playback without unfreezing.

Projects and Undo retain Speed, Pitch and Preserve pitch along with the original
arrangement. Prepared stereo buffers are working data, not a replacement for
those sources. A newly opened project may need to prepare its altered playback
again. Older projects inherit 100%, zero transpose and pitch preservation.

## Memory, quality and timing

Preparation holds stereo Float32 audio and a transformed playback buffer; slow
speeds produce more output frames. Nominal capture is bounded at 128 MiB. The
transform's owned-copy budget is 384 MiB for two input copies plus its output;
preview's larger check allows 512 MiB for two input and two output copies before
creating its AudioBuffer. These are working-audio limits, separate from the
portable project file limit and the audio already loaded by the session.

If a passage exceeds a preparation limit, choose a **shorter arrangement loop**
or increase Speed. The pass is rejected rather than silently shortened. Available
memory and preparation time still depend on the browser and device.

Time stretching and repitching are signal processing, not recovery of an
original performance. Large changes, sharp drum transients, dense stereo mixes
and long reverberation can produce smearing, phase-like texture or other audible
artifacts. Compare the result at a matched listening level and use smaller
changes when transparency matters. Speed and Pitch do not replace recording
alignment, and prepared playback is not a low-latency monitoring mode.

The transform does not normalize or limit its result. It follows the nominal
mastering chain, so a limiter ceiling there does not guarantee the same peaks
after stretching or repitching. Check the prepared master and leave headroom;
lower the master level and prepare again if necessary. The 16-bit WAV export
clips samples that exceed full scale.

## Processor and source

The worker reuses the vendored **Signalsmith Stretch 1.3.2** processor already
used by MORSEL. It is MIT licensed, copyright Geraint Luff / Signalsmith Audio
Ltd. The official release’s embedded WebAssembly and license travel with the
offline app; no commercial service or runtime model download is required.

- [Official package 1.3.2](https://www.npmjs.com/package/signalsmith-stretch/v/1.3.2)
- [Official release archive](https://registry.npmjs.org/signalsmith-stretch/-/signalsmith-stretch-1.3.2.tgz)
- [Matching upstream source](https://github.com/Signalsmith-Audio/signalsmith-stretch/tree/222093b4cc13ddb4d07c826bc3c1559326091731)
- [Vendored provenance](../morsel/vendor/signalsmith/README.md) and
  [MIT license](../morsel/vendor/signalsmith/LICENSE.txt)

The source archive retains the processor attribution and corresponding vendored
materials. Its quality and limitations are those of the actual processing path,
not a claim that every mix remains artifact-free at every setting.
