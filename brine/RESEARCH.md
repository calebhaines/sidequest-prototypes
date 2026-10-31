# BRINE hardware research

Research date: 31 October 2026. BRINE is an original software interpretation of
Roland's Juno-60 architecture, with a Juno-106 inspired voicing option and clearly
identified software conveniences. No physical reference unit was available for
level, frequency-response, distortion or control-law calibration.

## Sources and page numbering

Printed page numbers refer to the publication. PDF numbers are one-based file
pages. The Juno-106 service scan combines some facing pages and omits some blank
pages, so its printed and PDF numbers differ. Downloaded scans and circuit images
remain in a temporary research directory. Only factual paraphrases, source links
and small reference metadata are distributed; no manufacturer artwork, factory
patch ROM, firmware, demo recordings or commercial emulator code is included.

| ID | Source | References used |
| --- | --- | --- |
| O60 | [Roland Juno-60 Owner's Manual](https://cdn.roland.com/assets/media/pdf/JUNO-60_OM.pdf) | Official Roland scan. Printed pp.12–17 / PDF14–19: oscillator, PWM, HPF, VCF, VCA, envelope and main LFO; pp.19–20 / PDF21–22: arpeggio/Hold; p.22 / PDF24: chorus. |
| S60 | [Roland Juno-60 Service Notes](https://www.synthxl.com/wp-content/uploads/2018/01/Roland-Juno-60-Service-Manual.pdf) | Original Roland publication, April10,1983; scan includes later printing/change notes. Printed/PDFp.1: control ranges; p.5: PWM/main-LFO/trigger and delay circuit; p.7: chorus LFO and waveforms; p.9: common master clock, voice DCO/IR3109/BA662/IR3R01; p.11: global HPF, patch-level VCA and stereo chorus. |
| O106 | [Roland Juno-106 Owner's Manual](https://cdn.roland.com/assets/media/pdf/JUNO-106_OM.pdf) | Official Roland scan. Printed/PDFp.18: HPF0 bass boost, HPF1 neutral; printed/PDFp.22: assignment modes and range limits; printed/PDFp.29: chorus. |
| S106 | [Roland Juno-106 Service Notes](https://www.synthxl.com/wp-content/uploads/2018/02/Roland-Juno-106-Service-Manual.pdf) | Original Roland publication, July31,1984. Printedp.1 / PDF1: ranges; pp.4–7 / PDF3–4: DCO/waveshaper and module; p.13 / PDF8: chorus control truth table; p.15 / PDF9: global HPF/level/chorus; p.18 / PDF11: test-mode assignment behavior. |
| S106B | [Alternative Juno-106 service scan](https://www.synthfool.com/docs/Roland/Juno_Series/Roland_Juno_106/Roland_Juno106_Service_Notes.pdf) | Original Roland circuit sheets in a different, large-page scan layout; supporting cross-reference only. |
| M3009 | [Panasonic MN3009 manufacturer datasheet](https://www.synfo.nl/datasheets/MN3009.pdf) | P.1:256 stages, delay0.64–12.8ms at10–200kHz; dual output arrangement and clock-component cancellation; later pages show operating curves and test circuits. |
| M3101 | [Panasonic MN3101 manufacturer datasheet](https://www.synfo.nl/datasheets/MN3101.pdf) | Two-phase BBD clock driver, used by each chorus delay path in S60/S106. |
| DCO | [Electric Druid: Roland Juno DCOs](https://electricdruid.net/roland-juno-dcos/) | Tom Wiltshire's supporting analysis of the Juno-106, first published2008 and subsequently updated. Describes the8MHz/range-divider scheme, analog ramp compensation, sub divider, PWM and free-running counter behavior. Its106-specific master-clock description must not be silently applied to60. |

`references.json` records the successful source URLs, snapshot sizes and hashes.
Public availability is not a license to redistribute these publications or their
illustrations. The hardware names identify the reference instruments; they do
not imply affiliation or endorsement by Roland or the semiconductor makers.

## Six voices and one DCO per voice

Each of six voices has a digitally timed oscillator, analog waveform generation,
a resonant low-pass filter, an amplifier and an envelope. The single oscillator's
saw, pulse and sub-octave square may sound together; these are independent
switches, rather than a mutually exclusive waveform selector. The sub is derived
from a flip-flop and stays one octave below the main timing cycle. A common noise
source is mixed into the voices.

A DCO still generates analog audio. In S106 the timing edge discharges a ramp
capacitor, while a pitch-related compensation voltage changes its charging rate
to keep the ramp near12Vpp. A comparator creates the pulse, and the divider
creates the sub. The106 service sheet gives50% duty at+6V PWM control and95%
at+0.6V. The60 schematic labels50%/95% calibration too. Actual amplitude ratios,
ramp droop, reset-edge shape and comparator behavior need unit calibration.

The timing systems differ. S106 describes an8MHz crystal master, a range divider
and programmable counters. S60p.9 instead shows an analog LC/varicap master
oscillator, a common CLK.CV input and two uPD8253 timer chips. Clock modulation
and tuning are shared across the voices. An independent random VCO pitch drift
for every note would misrepresent this architecture. BRINE's stable, common-clock
pitch model leaves analog character to waveform, pulse-width, filter, gain,
envelope and chorus variation. It does not reconstruct the proprietary firmware's
integer counter tables or reproduce every high-note quantization/range artifact.

The counters support continuous timing between count updates. BRINE preserves
oscillator/sub phase across notes; no note-on phase reset or unrelated sub
oscillator is added. Exact firmware programming sequences and phase relationships
between a particular set of physical voices remain unmeasured.

## Modulation and the shared envelope

The60 has MAN, LFO and ENV PWM sources. In MAN, the slider sets fixed pulse width;
in LFO/ENV it sets the amount of the chosen signal. The106 panel has MAN/LFO;
ENV-PWM belongs to60 and should not be described as an original106 control.

There is one main LFO. On60, its raw triangle feeds the PWM selector before the
separate LFO depth VCA; delayed/triggered depth governs pitch and VCF modulation.
Thus PWM continues moving during the pitch/filter LFO delay. The oscillator
itself need not stop or reset while its audible modulation amount is zero.

O60p.17 explicitly applies delay to both trigger modes. AUTO delay follows the
first key of a non-legato phrase. Holding additional keys does not restart that
phrase delay. MANUAL with zero delay acts while the trigger is held; with a
nonzero delay its amplitude builds while held, reaching normal depth after the
chosen time. The manual's brief AUTO description calls this a delay before the
LFO functions; the schematic supplies a depth-control circuit. A chosen smooth
fade is a reduced-order interpretation, not a measured reconstruction of every
transistor, capacitor and threshold in that circuit.

One ADSR voltage per voice feeds both VCF and VCA. VCF envelope amount is positive
with a separate positive/negative polarity switch. The VCA selects ENV or GATE.
Gate mode still uses physical analog current-control circuitry; the neighboring
12kΩ/.22µF network gives a2.64ms RC scale, supporting a short de-click/slew model
rather than a mathematically instantaneous amplitude edge. That adjacent RC
product alone is not an exact transfer function of the whole amplifier.

The60 uses analog IR3R01 envelope ICs. The106 service notes describe envelope/
control calculations in its slave CPU and DAC/multiplexer output. BRINE uses
shared RC-like digital contour equations for its voicing profiles, including
chosen normalized attack asymptotes(1.3/1.35), practical timing thresholds and
small fixed voice variation. Those values do not come from an IR3R01 electrical
measurement or a recovered106 firmware table.

The60 service sheet specifies approximately:

| Control | Original60 range |
| --- | --- |
| Attack | 1ms–3s |
| Decay | 1ms–12s |
| Release | 2ms–12s |
| Sustain / VCF key follow | 0–100% |
| Main LFO | 0.3–20Hz |
| LFO delay | 0–1.5s |
| Master tune | ±50cents |
| Arpeggio clock | 1.5–50Hz |

S106p.1 gives different limits: attack1.5ms–3s, decay/release1.5ms–12s,
LFO0.1–30Hz and delay0–3s. BRINE's106 option is a related voicing profile inside
the60-oriented instrument; controls that retain60 limits and modern additions
must not be marketed as a complete firmware/control-panel recreation of106.
The original60 has no portamento (O60p.12). Glide, velocity response, MIDI and
extended note editing are useful software additions; zero velocity response is
the classic default.

## Voice filter, feedback and global HPF

S60p.9 shows the IR3109's four OTA/buffer integrator stages with external
capacitors. Its resonance loop attenuates the filter output into a BA662,
whose controlled current feeds the first filter summing node. There is no pair
of antiparallel clipping diodes in that feedback branch; nearby D1/D2 are part
of waveform switching. A nonlinear feedback/input/headroom model around four
small-signal integrator poles is a practical reduced-order approximation. It
is not a transistor-level electrical identity for every IR3109 cell or BA662.

Resonance reaches self-oscillation. Both owner manuals warn that the physical
self-oscillating filter does not guarantee an accurately tuned keyboard scale.
Tests may verify stable software oscillation and key tracking, while leaving
real-unit tuning and resonance calibration as unmeasured quantities.

The six voice VCAs sum before a GLOBAL HPF and patch-level VCA on the chorus
board. Putting an unrelated HPF on each voice is not the documented topology.
Although its front-panel slider looks continuous, S60p.11 uses a14051 analog
switch controlled by two bits. It therefore has four hardware states. The
neutral branch and three selected capacitors(.022/.01/.0047µF) distinguish it
from the106's bass-boosting zero position. An ideal33kΩ load suggests approximate
corners220/480/1030Hz for the three60 high-pass states; switch resistance,
bleeders, device loading and component tolerances affect the real result.

O106printedp.18 explicitly identifies HPF1 as neutral and HPF0 as low-frequency
boost. Positions2/3 remove bass. The exact boost curve and cutoffs are numerical
voicing/calibration choices unless measured against the selected circuit and
unit; the60 neutral state should not acquire the106 boost.

Patch LEVEL acts through the global VCA before the chorus. O60p.16 acknowledges
that excessive level can produce distortion. The separate final volume control
is a performance level control, not a second oscillator or per-note envelope.

## The stereo chorus

S60p.11 shows two MN3009 BBDs, each with its own MN3101 two-phase clock. The delay
paths share a filtered mono input. The clocks receive opposite-polarity
modulation. Each BBD's two output taps are combined for clock-component
cancellation, then reconstructed and mixed with the dry signal. The two output
mixers use the same dry/wet polarity; their width comes from different delay
trajectories, not from simply negating the right wet signal. There is no audio
feedback/reverb loop or separate compressor/expander chip in this chorus path.

The MN3009 has256 stages. Its ideal delay is `256/(2*clockHz)` seconds. A256-slot
ring advanced at twice the oscillator clock, or an equivalent128-slot ring at
the full clock, follows that timing relationship. A moving interpolated delay
read head is a different numerical model. BRINE uses nonuniform bucket-transfer
clock events with sample/hold reconstruction; it does not claim to model every
charge-transfer transistor, parasitic capacitance or complementary-clock glitch.

S60p.7 provides unusually useful output waveform annotations:

|60 chorus setting|Annotated modulation|Period|Approximate rate|
|---|---|---|---|
|I|20Vpp, approximately triangular|2s|0.5Hz|
|II|20Vpp, approximately triangular|1.2s|0.833Hz|
|I+II|1.6Vpp, visibly rounded|1s|1Hz|

Thus the both-buttons setting is a shallower third motion. It should not be
invented as an arbitrary7Hz vibrato. These values describe the annotated circuit
outputs; the clock's nonlinear CV-to-frequency response and component variation
still determine the actual delay excursion. The modulation amplitude ratio does
not by itself establish an identical ratio of delay-time swing.

The common prefilter and EACH branch reconstruction contain two Sallen-Key
sections:22kΩ pairs with820pF/680pF, then22kΩ pairs with1800pF/270pF, using emitter
followers. Ideal unity-gain calculations give approximately9.69kHz/Q.549 and
10.38kHz/Q1.291: close to a four-pole Butterworth response around10kHz. There is
also a BBD-output clock-RC pole: the two3.3kΩ output resistors, a47kΩ bleed and
2.2nF(C10) imply about45.4kHz before the reconstruction sections. Actual transistor
gain, BBD output impedance and loading change that ideal calculation.

BRINE's clock-event reconstruction uses reduced-order continuous-time filtering
rather than an electrical transistor simulation. Nominal BBD clocks of30kHz(60)
and32kHz(106), with±25% normal clock excursion, are software calibration choices.
The service schematic's150pF timing capacitors and transistor/current-mirror
clock control do not, by themselves, publish a unique nominal frequency without
additional bias/driver characterization. These values are not claimed as factory
clock measurements; exact clock bias/depth, noise, drive and wet level require
reference-unit calibration.

The106 owner manualp.29 explicitly states that I and II cannot be used at the
same time. Its service truth table lists OFF, I and II, and the jack-board
circuit has a rate-selection control and a separate wet mute. BRINE disables
I+II in its106 UI. If a prior60 both-mode patch is switched/imported as106,
BRINE normalizes the unsupported combination to OFF as a software fallback.
That fallback must not be presented as the physical106's undocumented response
to pressing both buttons; the documented user feature is exclusive I/II.

## Arpeggio, Hold and assignment

The60 arpeggiator selects UP, DOWN or UP/DOWN over one, two or three octaves.
The notation on O60p.19 shows no duplicate endpoint in UP/DOWN: for C–E–G it
cycles C–E–G–E–C–E–G. Original hardware constrains it to the61-key keyboard range;
an extended MIDI range is a software convenience. Hold sustains up to six keys;
if more are played, the last six remain(O60p.20). Arpeggio+Hold keeps running
after the keys are released, and new keys alter the pattern.

BRINE's arpeggiator applies to live keyboard/MIDI chords. Written phrase and
GALLEY note events remain direct, preserving recorded note lengths and timing.
Tempo sync, precise digital note timing, a polyphonic piano roll and portable
project exchange are software features. Fine latch/replacement, gate length and
boundary behavior are deliberately chosen, rather than asserted as recovered
Roland firmware.

S106printedp.18 describes both rotary and non-rotary TEST-MODE assignment. It
specifically says one-key staccato stays on CH1 in non-rotary test mode, while
rotary cycles channels and a seventh key steals the first. This does not by
itself publish60's normal repeated-note algorithm. Released-voice preference,
cyclic free-voice choice, same-token ownership and cross-source MIDI behavior
are therefore documented software policies. No proprietary assignment firmware
has been copied.

## Accuracy boundary

Acceptance can verify signal routing, six-voice bounds, oscillator/sub coupling,
waveform harmonics, common LFO timing, envelope causality, filter slope and
self-oscillation, clocked delay timing, stereo behavior and exact live/offline
note scheduling. These are checks against documented architecture and analytic
references. They cannot establish indistinguishability from an unmeasured
hardware unit.

Unmeasured choices include wave amplitudes and reset shape; counter-table
quantization; analog control current/voltage conversions; envelope tapers and
stage definitions; each chip's distortion, headroom and leakage; HPF loading;
filter resonance mapping; BBD clock calibration, clock feedthrough, bandwidth,
noise distribution and gain; analog aging/tolerance statistics; idle-state
integration and browser sample-rate limits. BRINE uses original DSP and recipes
and keeps these distinctions visible rather than claiming a hardware null test.

## Current implementation choices

The active voice model uses fixed2× oversampling, band-limited event corrections
for the shared ramp/pulse/sub timing, four low-pass integrator poles with a
nonlinear feedback solve, and a short analog-style Gate-mode slew. Source
amounts, control-depth conversion and headroom use normalized software scales.
The chorus uses actual nonuniform bucket-clock events and stereo reconstruction.
No automatic voice-count quality switch is intended. These implementation facts
are numerical design choices; component-level equivalence remains unmeasured.

The chorus prefilter uses the two ideal-R/C Sallen-Key sections as bilinear
biquads at the oversampled rate. Its reconstruction uses a five-state
continuous-time transition model at each fractional bucket event: the same four
filter poles and the clock-RC pole. The clock-RC may be moved after the four
linear poles in the model because these linear time-invariant sections commute.
State-transition coefficients are cached on a256-interval grid per sample and
Hermite-interpolated, rather than recomputed with a matrix exponential at each
event. This numerical interpolation is another approximation; ideal follower
gain/loading and chosen clock bias still need physical calibration.

When a voice has decayed below the numerical amplifier floor, its filter state
is retained while its filter integration pauses. Its DCO phase, relevant pitch
modulation, raw PWM phase and the shared LFO continue advancing; the global
chorus continues to carry its state. This bounds idle voice cost and approximates
a continuously energized, silently gated analog filter. Silent filter phase
and initial-condition effects, including idle self-oscillation, are not claimed
to be physically exact. Panic is an explicit software reset that clears tails
and suppresses chorus hiss until the next note.

## Processing-budget check

An isolated Node 24.19.0 run on the two-CPU Xeon 8573C development host measured
actual 128-frame Core blocks after 1,000 warmup blocks. Values are medians of nine
250-block batches, including finite-output and stereo-peak scans. They describe
this source/runtime/host, not a minimum-device or complete-GALLEY-mix guarantee.

| Output rate | Idle | One voice + chorus | Six voices + chorus | Dense PWM/filter modulation + chorus II |
| --- | ---: | ---: | ---: | ---: |
| 48 kHz | 0.119 ms | 0.172 ms | 0.360 ms | 0.398 ms |
| 96 kHz | 0.110 ms | 0.159 ms | 0.366 ms | 0.357 ms |

The real-time 128-frame budgets are 2.667 ms and 1.333 ms respectively. The same
fixed oversampling, feedback solver, BBD transport and reconstruction run in
all cases. Idle cost includes continuing clock/phase behavior; permanent unload
disposes the Worklet rather than leaving an inaudible processor alive.

The shared white-noise mixer contribution scales with the square root of internal
sample rate relative to 96 kHz, preserving its analog passband spectral density
across host rates. This leaves 48 kHz output unchanged; a settled low-pass noise
probe measured −0.144 dB at 96 kHz relative to 48 kHz after the correction. BBD
noise is generated at its clock events and already follows its physical clock.
