# The mastering bench

GALLEY’s master section has a **Mastering bench** beneath its two returns and
master channel. Open it to shape the complete stereo mix. The four master insert
slots remain available for GALLEY effects; the bench follows those inserts and
the master fader. It is included in the stereo master WAV.

All eight switches start off: Enable tools, Bypass, and the six processing stages
have neutral defaults. An older project opens with the new tools off, preserving
its previous master signal path. Opening the bench does not start analysis or
turn on processing. Setting a stage on also enables the bench; the global power
switch can turn the whole bench off without erasing its settings. Bypass lets
you compare the stored processing with the unprocessed master.

## Start with a small change

Choose a house finish or turn on one stage. The five face knobs are **Input**,
**Threshold**, **Width**, **Ceiling** and **Output**. Threshold belongs to the glue
compressor, Width to the stereo stage and Ceiling to the limiter. Their controls
are inactive until the corresponding stage is switched on. Input and Output are
available when the bench is enabled.

Drag a knob vertically; hold Shift for a slower pointer adjustment. The arrow
keys move by the control’s normal step, Shift increases the keyboard step, Page
Up/Down move further, and Home/End select the range endpoints. The adjacent
number fields accept exact values. A complete drag or keyboard gesture creates
one Undo step. Open a stage’s folded panel for its full set of controls.

The six house finishes are complete starting points:

- **Clear pass** returns every stage and the global enable to their defaults.
- **Gentle glue** adds a low cut and light, slow compression.
- **Open room** adds air, some width and a centred low end with a sample-peak guard.
- **Warm service** combines broad tone, bus compression and a small amount of colour.
- **Solid foundation** focuses the bass with parallel glue and restrained width.
- **Delivery guard** uses a low cut and sample-peak limiter while leaving the
  compressor and stereo stage off.

Recipes replace the complete bench setup. Individual stage and knob changes
keep the rest of the setup. The recipe selector shows Custom settings when the
stored values no longer match a house finish. Judge these choices on the loudest
and quietest passages; no recipe measures or automatically normalizes your mix.

## Signal path and controls

The bench has 25 numeric parameters and eight switches. Its processing order is:

`Master inserts → master fader → input → low cut → tone → glue → stereo → colour → output → limiter`

1. **Clean foundation** removes low-frequency energy with a sweepable high-pass
   filter. Set it low for a full bass mix and raise it only when that removal
   serves the recording.
2. **Broad tone** combines low and high shelves with a sweepable mid bell. Shelf
   frequencies, mid frequency and mid Q provide useful control without a dense
   graphic EQ. All three gains begin at zero.
3. **Glue compressor** provides threshold, ratio, attack, release, knee, makeup,
   detector low cut, stereo link and parallel blend. Its detector low cut reduces
   the amount of deep bass driving the compression. Stereo linking changes how
   strongly the channels share gain reduction. Use Makeup to compare levels;
   it is a gain control rather than automatic loudness matching.
4. **Stereo field** adjusts the side component around the centre signal. Width
   at 100% preserves the normal image; 0% is mono. Mono below centres the low
   frequencies; set it to zero to disable that low-end narrowing. Check mono
   compatibility when widening a mix.
5. **Soft colour** blends a rounded saturation stage into the mix. Drive controls
   its excitation, and Colour blend controls how much of that processed signal
   returns. This is a musical soft-clipping model, not a calibrated replica of
   named analog equipment.
6. **Final peak guard** is a linked, zero-lookahead sample-peak limiter. Output
   gain precedes it, so Ceiling is the last processing level control. Its
   recovery controls how the attenuation releases. It adds no lookahead delay.
   A sample-peak ceiling does not guarantee that reconstructed intersample peaks
   stay under the same ceiling; leave headroom and inspect the exported file.

The stages are independent. Turning a stage off retains its adjustments. The
existing master fader, mute, insert effects and automation continue to operate.
Track and return stems exclude the complete master section. Track freezing bakes
track processing while leaving the master bench and shared returns live.

## Loudness and delivery checks

Click **Start measurement** to enable the analyzer. It measures the final stereo
master whether the processing tools are on, off or bypassed. Play the entire
passage that you intend to assess. **Pause** stops analysis and retains its last
readings for inspection. **Reset meters** clears the accumulated readings; after
changing the mix, reset and play a fresh continuous pass for a useful integrated
result.

The analysis is transient. It is not saved in the project or treated as an audio
parameter. Folding the bench, hiding the page, opening a covering dialog or
moving the bench off screen suspends analysis. A requested measurement resumes
when the bench becomes visible again. For an uninterrupted full-pass integrated
measurement, keep the bench visible. The mastering stages themselves continue
to process normally while the bench is folded.

The readouts are:

- **Momentary LUFS:** approximately 400 milliseconds of K-weighted loudness.
- **Short-term LUFS:** approximately three seconds of K-weighted loudness.
- **Integrated LUFS:** accumulated K-weighted loudness using absolute and relative
  gating. It needs a measured passage; silence or a new, incomplete window can
  display an em dash.
- **Intersample estimate:** a 4× interpolated peak estimate. This is useful for
  checking likely reconstruction overs, but is not a certified true-peak meter
  or a guarantee about a later codec or playback converter.
- **Stereo correlation:** the measured relationship between left and right,
  ranging from −1 to +1. Silence has no meaningful correlation value.
- **Peak hold:** the largest measured output sample peak since the last reset.

The face also shows compressor gain reduction, limiter gain reduction and output
sample peak. Loudness references of −14, −18 and −9 LUFS are comparison guides.
Their indicated difference does not change gain, limiter settings or exported
levels. They are not promises of a particular service’s playback normalization.

Measurement uses the final signal after the master fader and processing, so any
change to those stages can change the reading. A stem has a different routing
and level; its loudness should be assessed as a separate deliverable.

## Projects and automation

All processing settings are included in the project, Undo/Redo and recovery.
Each numeric mastering parameter is available in master automation and the global
LFO target list under `mastering:<parameter>`. Those lanes apply only to the
master bus. Switching off analysis has no sonic effect. Old eight-track projects
are extended with empty tracks nine and ten and keep their original settings.
