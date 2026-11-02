# CITRUS · the circuit behind the squeeze

CITRUS is a monophonic, circuit-informed interpretation of the Roland TB-303.
The original seven face controls remain easy to reach: Tune, Cutoff, Resonance,
Envelope, Decay, Accent and Volume, plus the saw/square switch. Calibration folds
contain a slide-time trim, filter input trim, deterministic drift and quality.

The implementation is original JavaScript. It is not a recording of a particular
unit, a transistor-by-transistor SPICE simulation, or a measured replica. The
model preserves several defining circuit relationships instead of applying a
normal synthesizer's velocity and portamento to a generic filter.

## Four coupled poles

The filter is a **four-pole diode ladder**, with transistors connected as diodes.
The often repeated description of a three-pole, 18 dB/octave filter is incorrect.
The stages load one another; their poles are not four identical independent RC
stages. The bottom capacitor has half the value of the other three.

Tim Stinchcombe derives the normalized, small-signal ladder transfer as

```
H(s) = -1 / (s^4 + 6.727 s^3 + 14.142 s^2 + 9.514 s + 1)
```

CITRUS represents that core as an equivalent four-node RC network with capacitor
ratios `1 : 1 : 1 : 0.5`. Its linear differential equations are

```
v1' = w (input - 2 v1 + v2)
v2' = w (v1 - 2 v2 + v3)
v3' = w (v2 - 2 v3 + v4)
v4' = 2 w (v3 - v4)
```

Its denominator, `0.5 (s/w)^4 + 4 (s/w)^3 + 10 (s/w)^2 + 8 (s/w) + 1`,
normalizes to the same coefficients. The equivalent state ordering is a model,
not a drawing of physical PCB node positions. Tests compare the implemented
filter's small-signal response with this independent transfer function.

Branch currents use a bounded, monotonic approximation of the differential
`tan h` response. A trapezoidal implicit solve closes the nonlinear resonant
feedback loop, rather than inserting a full audio-sample feedback delay. A small
four-node Newton solve performs at most three iterations in High and two in Eco.
Its algebraic elimination allocates nothing per sample.

The idealized coupled core's oscillation threshold is a feedback factor of 17,
not the factor of four associated with a buffered Moog ladder. The stock range
approaches that threshold. Coupling high-pass states in the feedback path reduce
low-frequency resonance and add memory. Input and output coupling are also
modeled. They are a reduced-order treatment of the real circuit's additional
poles and zeroes, not the complete ten-pole transfer derived by Stinchcombe.
There is no automatic resonance-dependent gain compensation or loudness control.

The displayed Cutoff is calibrated around resonant frequency. Its 30–8000 Hz
range deliberately reaches beyond the original unmodulated control range.
The actual cutoff can move further under envelopes, within the available sample
rate. The stock instrument does not track filter cutoff with note pitch; CITRUS
does not silently add keyboard tracking.

## The two envelopes and the accent circuit

The **main envelope** drives the filter. Decay controls its exponential time
scale on ordinary notes; accent switches to a fixed short 0.2-second time scale.
The **volume envelope** has its own long 3.5-second decay. Incoming tied slides
retrigger neither envelope. The model uses representative time scales from
published circuit descriptions, rather than implying exact measurements of every
hardware unit's envelope curve.

Even minimum Envelope retains a small filter sweep, as on the stock instrument.
Accent also adds a separate VCA control path. Its attack smoothing follows the
published `47 kΩ × 33 nF` network, a 1.551 ms RC time constant. A diode-charged,
leaking capacitor models the accent sweep's charge memory. Repeated accents can
build on charge left by the preceding note. Resonance changes both resonant
feedback and the balance between a direct accent strike and a rounded capacitor
sweep, reflecting the original dual-section resonance pot.

The VCA's ordinary-note contour includes a representative 4 ms onset delay and
3 ms attack. Unaccented note-off holds the normal control level for 8 ms, followed
by an 8 ms linear release. The accent path and capacitor tail remain separate;
the complete accent is not cut off by that ordinary-note release multiplier.
Velocity provides extra performance-level control; it does not replace these
accent circuits. No noise or random pitch instability is added by default.

## Slide belongs to the preceding step

An outgoing Slide on a step keeps the gate open into the following note. Pitch
starts moving at the following note boundary. CITRUS's sequencer translates that
into an incoming tied note for the DSP. The DSP preserves oscillator phase,
filter histories and both envelopes and approaches the new pitch exponentially
in control-voltage/semitone space, with the stock 22 ms RC time constant. It does
not interpolate Hertz linearly or make the time depend on tempo. A stale note-off
ID cannot close the next note in a tied sequence.

Calibration's Slide time changes this RC time constant. The original reference
is `100 kΩ × 0.22 µF = 22 ms`; the often quoted roughly 60 ms audible slide is not
the same thing as a 60 ms time constant.

## Oscillator, quality and rendering

A phase-continuous saw and square oscillator use PolyBLEP edge correction.
The square does not use an invented pitch-dependent duty-cycle curve. Analog
coupling, nonlinear branch currents and the VCA shape the resulting waveforms.
Saw/square changes and manual controls smooth without resetting the voice.

High runs the nonlinear voice at four times the output rate, followed by two
31-tap half-band FIR decimation stages. Eco uses twice the output rate and one
stage. Most half-band taps are zero. Oscillator, envelope and filter processing
allocate no arrays in their audio loops. The FIR's small group delay is part of
the audio path; scheduling itself is sample-clock based.

The independent aliasing stress check uses a 7.8 kHz oscillator beyond the usual
bass register. High reduces combined folded energy at two specified aliases by
at least 6 dB relative to Eco. This is a repeatable stress comparison, not a claim
that all possible settings are alias-free. Both qualities use the same circuit
relationships. Native playback, hosted notes and offline audio use this same DSP.

Default Drift is zero. Turning it up adds only deterministic, slowly varying
pitch drift of at most two cents. It remains repeatable in rendered audio.
Panic clears note, envelope, filter and decimator histories and returns exact
silence. After natural release and its quiet tails settle, the voice sleeps.

## Technical references

- [Tim Stinchcombe: Diode Ladder Filters](https://www.timstinchcombe.co.uk/index.php?pge=diode)
  — coupled poles, half-value capacitor, core transfer and the 18/24 dB question.
- [Stinchcombe: A Comprehensive TB-303 Diode Ladder Filter Model](https://www.timstinchcombe.co.uk/index.php?pge=diode2)
  — coupling capacitors, additional poles/zeroes and low-frequency behavior.
- [Robin Whittle: Investigating Some Unique Aspects of the TB-303's Sound](https://www.firstpr.com.au/rwi/dfish/303-unique.html)
  — two envelopes, accent routing, dual resonance pot and capacitor-charge memory.
- [Whittle: Devil Fish Manual](https://www.firstpr.com.au/rwi/dfish/Devil-Fish-Manual.pdf)
  — stock instrument comparisons, onset/release contours, lack of keyboard filter
  tracking and the 22 ms slide RC network. Devil Fish extensions are distinguished
  from the stock behavior in the text; CITRUS is not advertised as a Devil Fish.
- [Roland TB-303 Service Notes](https://archive.org/download/synthmanual-roland-tb-303-service-notes/rolandtb-303servicenotes.pdf)
  — original circuit and service reference.
