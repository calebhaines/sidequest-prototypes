# GALLEY · Four LFOs

Open **Automation** and select **LFO 1–4**. The four oscillators belong to the
whole project, so switching the selected track does not change their assignments.
All four start off in existing and new projects. Each supports up to 16
destinations; free rates span 0.01–40 Hz and synced cycles span 1/64 note to 32
bars, with triplet, dotted and custom lengths.

1. Turn an LFO on and choose a waveform.
2. Use **Sync** for a musical period, or **Free** for a rate in Hz.
3. Add a destination, choose its owner and parameter, and adjust its amount.
4. Add more destinations to move several controls from the same oscillator.

Every numeric parameter available to GALLEY automation can be a destination:
track level, pan, both sends, the four channel EQ gains, numeric insert controls,
return level/pan and inserts, and master level and inserts. Instrument controls
inside their own native editors are separate from GALLEY's automation targets.

The other LFOs—and the same LFO—also appear as destinations. Rate, synced period,
depth, offset, phase, symmetry and smoothing can be modulated. For example, route
LFO 1 to a filter cutoff and LFO 2 to LFO 1's depth for a sweep that gradually
appears and disappears. A single oscillator can also pan a track while moving
another track's send in the opposite direction.

## Amount and the original setting

Modulation is added to the manual control or the value read from an enabled
automation lane. The original knob and automation points stay editable and are
never overwritten by the LFO. A negative destination amount reverses movement.
Amounts are fractions of the destination's control range; logarithmic controls
move in logarithmic space. Several LFOs targeting the same parameter add together,
then clamp to its valid range.

**Depth** scales the waveform. **Offset** moves its centre. **Phase** shifts it
within a cycle, **Symmetry** changes the balance of the rising and falling
portions, and **Smoothing** softens sharp corners and random steps. The final LFO
signal stays between −1 and +1.

## Waves and timing

Sine, triangle, falling saw, rising ramp, square, sample-and-hold and smooth random
cover regular sweeps, pulses and repeatable variation. Random waves are seeded,
so the same project produces the same render rather than a fresh random take.

The oscillators run on the audio engine's clock, with the same modulation path
for browser playback and WAV export. Transport phase starts from the seek
position; the loop retrigger option restarts a cycle at the loop boundary.
Paused transport holds phase and cross-modulation settings while the output
smoothing settles. Smoothing can make the first moment after a change settle
gradually.

Cross-modulation and feedback are evaluated together with the preceding control
tick's outputs, once every 32 audio samples. This makes circular assignments
bounded and independent of track order. They are control-rate LFOs, not an
audio-rate FM synthesizer.

## Projects and effect order

The four LFOs and all their destinations are included in Save/Open, browser
recovery and Undo/Redo. Moving an insert earlier or later carries its LFO routes
with it. Removing or replacing an insert removes its routes, so a newly added
effect cannot accidentally inherit the old effect's movement.

SERVICE Drop also closes LFO modulation of the dropped track’s level and
pre-fader sends. Creating an arrangement from a captured performance retains
those gates, so modulation cannot reopen a dropped channel in its WAV export.
