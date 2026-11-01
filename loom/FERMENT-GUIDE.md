# FERMENT

A guitar and bass synth pedal for GALLEY. Play a string, shape two oscillators
and a sub, then send them through a resonant analog-style filter. A second sound
engine shapes the input waveform directly for chord textures and envelope-filter
sounds. FERMENT is an audio effect; it does not need a MIDI pickup or a written
note clip.

## Start playing

1. Add **FERMENT** to an instrument track. Use a recorded guitar/bass clip, or
   monitor an interface input through the track using GALLEY's existing audio
   controls. A clean instrument input or DI is a useful starting point.
2. Choose **Input instrument**: Guitar focus, Bass focus, or Auto for the full
   supported range. This describes the signal entering the pedal.
3. Choose **Synth register** independently: As played, Bass (one octave below),
   or Guitar (one octave above). A guitar can therefore drive a bass voice, and a
   bass can drive an upper-register synth lead.
4. Start with **House culture**, **Root cellar**, **Guitar grows roots**, or
   **Bass climbs**. Play one note at a time in Tracking synth.
5. Set Cutoff, Resonance, Envelope, Synth level and Blend at the front. Open the
   folded sections when you need a particular oscillator, envelope or filter.

The default Blend leaves 20% of the original stereo input alongside the effect.
That retains a clear pick attack while the synth identifies the note. For a
fully synthesized sound, raise Blend to 100%; for a parallel layer, lower it.

## Two sound engines

**Tracking synth** estimates one fundamental at a time. That pitch drives two
oscillators and a sub oscillator. Saw, pulse, triangle and sine waves, independent
registers, detuning, pulse width and slow drift provide the source tone. This mode
is intended for single-note bass and guitar lines. Muting unused strings helps;
strong harmonics, fret noise, slides, very short notes and overlapping notes can
all affect the estimate.

**Chord texture** feeds the input itself through a nonlinear waveform shaper and
the selected resonant filter. It can react to chords and percussive attacks
without waiting for one detected fundamental. The drive can add intermodulation,
as a fuzz does. This is an input-derived texture, rather than an independent
synth voice for each string. Synth register and oscillator/pitch controls are
inactive in this mode; their values remain stored for returning to Tracking
synth. The filter, envelopes, filtered input component and filter LFO remain
available.

For Tracking synth, a clean signal before distortion, chorus, delay and reverb
usually provides the clearest detector input. Place other effects after FERMENT
when you want the synth to share that processing. Chord texture is also useful
on drums, pads and more complex audio, where a monophonic detector is less useful.

## The five controls

| Control | What it changes |
| --- | --- |
| Cutoff | The filter's starting cutoff, before note height, the envelope and LFO modulation. |
| Resonance | Feedback emphasis around the filter response. Each circuit has its own character. |
| Envelope | Signed filter movement in semitones. Positive values raise cutoff; negative values lower it as the envelope rises. |
| Synth level | The oscillator or shaped-input level inside the effect, before its final output trim. |
| Blend | The processed signal in parallel with the untouched stereo input. |

The synthesized register is separate from input selection. Use As played for an
already-low bass when an extra octave down would extend below the useful range
of your monitors. The Sub control can add another lower component inside the
oscillator mix.

## Oscillators and tuning

Tracking synth provides two analog-style oscillators. Saw and pulse transitions
use bandlimiting to reduce the aliasing of naive digital edges. The waveform
models are efficient virtual-analog interpretations, with deterministic drift
rather than recordings of particular hardware.

Oscillator 1 octave sets its register; Oscillator 2 interval and detune place the
second voice relative to the tracked pitch. UI octave steps are whole octaves,
while fractional automation can move continuously between them. Pulse width
changes pulse-wave duty cycle. Sub adds a lower voice. Slow Analog drift adds
small, changing differences without adding a hidden hiss generator.

These controls do not retune individual notes inside a chord. They are disabled
in Chord texture, along with Glide, Tracking stability, Pitch to cutoff, pulse
width modulation and pitch modulation.

## Analog filter bench

| Circuit | Character and response selection |
| --- | --- |
| Ladder | Nonlinear four-stage feedback character. Low-pass is the four-stage response; band-pass and high-pass combine stage outputs. |
| OTA | A distinct four-stage, transconductance-inspired cascade with its own saturation and resonance behavior. Alternate responses also combine stage outputs. |
| State variable | A two-pole multimode circuit with direct low-pass, band-pass and high-pass outputs. |

The filters are reduced-order circuit interpretations, not component-exact
replicas of a named commercial pedal or synthesizer. The three circuits are
intended to sound different at comparable settings. Resonance and drive interact,
so the same knob positions need not produce the same level or tone in each one.

**Filter drive** changes excitation and nonlinear color. **Pitch to cutoff**
raises or lowers the filter along with the accepted note. High-pass and band-pass
settings can reduce the fundamental deliberately; low-pass is a useful first
choice for a solid bass output. Input-related filter modulation is controlled by
the front Envelope knob.

## Input, tracking and latency

Input sensitivity adjusts the detector/envelope response to the incoming level.
Gate threshold should sit above idle noise and below the quiet notes you intend
to play. Tracking stability balances a steady accepted pitch against the response
to a new note. Glide adds an intentional transition between accepted notes.

The tracker is causal: it can only use audio already played. Lower notes need a
longer observation than high notes. A 31 Hz bass note has a period of roughly
32 milliseconds; an 82 Hz guitar note has a period of roughly 12 milliseconds.
Identifying the fundamental reliably can require several such periods, especially
with a weak fundamental or a strong second harmonic. Input range selection and
stability settings affect that tradeoff.

The nominal search limits are 27–1600 Hz in Auto, 50–1600 Hz in Guitar focus, and
27–660 Hz in Bass focus. These include a five-string bass low B and normal guitar
lead ranges. Choose Auto for an extended instrument that crosses a focus boundary.

The tracking readout reports frequency, confidence and an estimated acquisition
window from the active detector period and stability settings. It is not a
measurement of complete round-trip latency or a promise of zero-latency pitch
recognition. That timing is separate from the
audio interface/browser buffer latency shown in GALLEY's Audio settings. Free
oscillator pitch follows an accepted estimate; the original dry path does not
wait for it. Chord texture does not need pitch acquisition.

A commercial pedal may use another synthesis method or specialized processing to
offer different latency or polyphonic behavior. FERMENT's two modes have the
explicit behavior above; it does not claim to reproduce those proprietary engines.

## Touch and envelopes

Follow input level responds to picking strength and the decay of the string.
Triggered ADSR provides a controlled attack, decay, sustain and release.
**Legato** keeps a connected phrase together; **Each detected note** retriggers
on accepted note changes or a sufficiently clear new pick transient, including a
repeated pitch. Soft rearticulation is not guaranteed to produce a new trigger.
Playing dynamics controls how much input strength
changes the synthesized level. Attack and release also let you smooth the way a
voice enters and leaves.

The same envelope supplies the signed cutoff movement. For an acid-like bass,
start with a short ADSR, low sustain, positive Envelope and the OTA or Ladder
filter. For a swell, choose a slower attack and a longer release. These are
performed audio effects, so the detector and gate still determine when a note is
accepted and released.

## Motion and output

The LFO has sine and triangle shapes, a free rate, and tempo-synced cycles. Depth
is its common amount. The destination controls set signed filter movement,
pulse-width movement and pitch vibrato. Filter motion works in both engines;
pulse-width and pitch motion belong to the tracked oscillators.

**Filtered input** adds an input component before the effect filter. In Chord
texture it blends the shaped signal toward a cleaner filtered input. This keeps
some of the instrument character inside the processing chain. **Blend** is a
separate parallel original signal outside that chain. **Width** spreads the
synthesized components; **Output** trims the processed result.

## Recipes

FERMENT includes 24 complete recipes. A recipe replaces the complete effect
setup; changing an engine or filter manually keeps the other settings. Four
recipes use Chord texture, while the others include bass fundamentals, guitar to
bass, bass to lead, pulse-width motion, fifths, plucked envelopes and slow swells.
The selected recipe becomes Custom settings when its values no longer match.

The source mode, instrument focus and register are part of each recipe. If a
recipe is quieter or slower to speak than expected, check those selectors and the
input gate before changing the oscillator mix.

## GALLEY integration

FERMENT can occupy any track, return or master insert. For predictable Tracking
synth behavior, use a track carrying one instrument line; a return or master may
contain multiple simultaneous sources. Chord texture is useful when processing a
more complex sum.

Numeric controls support drawn automation and global LFO routes. Projects and
Undo retain the complete settings. WAV renders and reversible track freezing use
the same causal synthesis and filter processing. Freeze prints a fresh continuous
pass from the arrangement beginning, including its automation and tracking
history; a live seek can naturally have a different detector history.

Bypass and zero Blend settle to the exact dry path, then suspend the tracker,
oscillators and filter processing. A newly bypassed instance starts dry. Silent
processing can idle after the voice and filter release. Controls and engine
changes use short transitions to avoid hard parameter-switch discontinuities.
The effect adds no FFT convolution or external sample assets.

## References and modeling scope

The following public references informed the operating choices and terminology.
FERMENT's code and recipes are original; these links do not establish a measured
match to a particular commercial pedal.

- [Electro-Harmonix Bass Mono Synth](https://www.ehx.com/products/bass-mono-synth/)
  and [owner's manual](https://www.ehx.com/wp-content/uploads/2021/01/bass-mono-synth-manual.pdf):
  practical single-note performance, input sensitivity and separate synthesized
  and original signal levels.
- [BOSS SYB-5](https://www.boss.info/global/products/syb-5/): bass synthesis based
  on saw, square and pulse waves, with envelope and LFO filter movement.
- [BOSS SY-1](https://www.boss.info/global/products/sy-1/): a useful comparison for
  a guitar/bass focus switch, simple front controls and a separate approach to
  polyphonic guitar synthesis. Its published latency/polyphony claims are for
  that product; they are not FERMENT measurements.
- [de Cheveigné and Kawahara, YIN (2002)](https://doi.org/10.1121/1.1458024):
  time-domain fundamental estimation and the distinction between periodicity,
  harmonics and octave errors. FERMENT's actual detector implementation and
  performance are specified by its source and checks.
- [Texas Instruments LM13700 datasheet](https://www.ti.com/lit/ds/symlink/lm13700.pdf):
  manufacturer descriptions of transconductance, linearizing diodes and
  voltage-controlled low-pass, high-pass and state-variable filter applications
  (section 8.3.4). This informs the circuit-family terminology rather than a
  component-value claim.
- [Robert Moog, US3475623A](https://patents.google.com/patent/US3475623A/en):
  the original transistor-ladder filter patent, describing four controlled
  transistor/capacitor sections and high-pass/low-pass applications. FERMENT uses
  a numerical, reduced-order interpretation rather than reproducing that circuit
  component by component.
- [Martin Finke, PolyBLEP oscillator tutorial](https://www.martin-finke.de/articles/audio-plugins-018-polyblep-oscillator/):
  bandlimited correction around waveform discontinuities, rather than a naive
  sampled saw or pulse edge.

The filter names describe topology-inspired behavior. They do not imply use of
measured impulse responses, original transistor matching, a proprietary hardware
DSP algorithm, or a calibrated SPICE model. Confidence and acquisition readouts,
the software checks and the audible output provide the practical limits of this
implementation.
