# HEIRLOOM hardware research

Research date: 31 October 2026. This document separates published Prophet-5
behavior from HEIRLOOM's software modeling choices. It is a design reference,
not a claim that the software has been measured against, endorsed by, or is an
electrically exact replica of a particular Sequential instrument.

The reference architecture is the original five-voice Prophet-5, with the
Rev 1/2 and Rev 3 filter families distinguished. Some performance conveniences
come from the modern Rev 4. They should be described as extensions rather than
silently attributed to the 1978–1982 hardware.

## Primary and supporting sources

PDF page numbers below are one-based file page numbers; printed page numbers
refer to the numbering visible on the document. Original scans were downloaded
to a temporary research directory, not included in the repository or downloads.
`references.json` records their URLs and checksums.

| ID | Source | Publication / useful references |
| --- | --- | --- |
| O3 | [SCI Prophet-5 Operation Manual, CM1000D, Rev 3.3](https://www.synthxl.com/wp-content/uploads/2018/05/sequential-circuits-prophet-5-owner-manual.pdf) | Stanley Jungleib, February 1982. Printed iii / PDF 4: architecture and white versus pink noise. Printed 1-4 / PDF 10: allocation. Printed 2-7–2-9 / PDF 18–20: filter, envelopes, release, glide and modulation. |
| T3 | [SCI Prophet-5 Technical Manual, TM1000D.2, Revs 3.0/3.1/3.2](https://www.synthxl.com/wp-content/uploads/2018/05/Prophet-5-Rev-3x-Service-Manual.pdf) | Stanley Jungleib, second edition, October 1981. Theory, original schematics and calibration procedures. The text references a manufacturer IC appendix; separate chip scans below avoid relying on appendix completeness in this hosted scan. Hosted scan has Wine Country Productions cover material. |
| T2 | [SCI Prophet-5 Rev 2 service manual](https://www.synthxl.com/wp-content/uploads/2018/05/Prophet-5-Rev-2-Service-Manual.pdf) | Original SSM-era circuit and service documentation. |
| T1 | [SCI Prophet-5 Rev 1 service manual](https://www.synthxl.com/wp-content/uploads/2018/05/Sequential-Prophet-5-Rev-1-Service-Manual.pdf) | Earliest circuit documentation; useful for distinguishing original SSM-era design from the modern reissue. |
| R4 | [Sequential Prophet-5 User's Guide 1.3](https://sequential.com/wp-content/uploads/2021/02/Prophet-5-Users-Guide-1.3.pdf) | Official Sequential guide. Printed pp. 17–19: oscillators; 24–30: filters and envelopes; 31–35: LFO, Wheel-Mod and Poly-Mod; 36–45: vintage and performance controls. |
| R4S | [Sequential Prophet-5 product specifications](https://sequential.com/product/prophet-5/) | Official hardware/revision description, control destinations, five voices, modern performance additions and mono audio output. Retrieved 31 October 2026. |
| R4M | [Sequential Prophet-5 MIDI Implementation 1.4](https://sequential.com/wp-content/uploads/2021/03/Prophet-5-MIDI-Implementation-1.4.pdf) | Official MIDI behavior and parameter encoding. MIDI encodings do not themselves establish volts, filter frequencies or acoustic modulation depths. |
| R4A | [Sequential Prophet-5/10 OS 2.0 Addendum](https://sequential.com/wp-content/uploads/2021/09/Prophet-OS-2.0-Addendum.pdf) | Stack/split requires a ten-voice instrument or an expanded Prophet-5; it is not five additional voices in an unexpanded five-voice instrument. |
| C3340 | [Curtis CEM3340/3345 VCO datasheet scan](https://electricdruid.net/wp-content/uploads/2020/02/CEM33403345-VCO.pdf) | Original Curtis Electromusic Specialties manufacturer document. PDF p. 1 distinguishes exponential frequency control at pin 15 from linear FM at pin 13. |
| C3310 / C3320 | [Curtis manufacturer datasheet archive](https://www.synthfool.com/docs/Other_Misc/CEM_chips.zip) | Original CEM3310 envelope pages 1–4 and CEM3320 filter pages 1–6, in named archive subdirectories. CEM3310 pp. 2–3 gives attack thresholds and RC envelope equations; CEM3320 pp. 1–3 describes current-gain cells. |
| S2020 | [SSM2020 manufacturer page 1](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2020.gif), [page 2](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2020d.gif) | Dual VCA with separate linear and antilog control facilities. Chip identity alone cannot establish which control law a complete instrument uses. |
| S2030 | [SSM2030 manufacturer page 1](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2030.gif), [page 2](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2030d.gif) | Original SSM oscillator architecture, connection and specification pages; hosted scan. |
| S2040 | [SSM2040 manufacturer page 1](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2040.gif), [page 2](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2040d2.gif), [page 3](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2040d3.gif), [page 4](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2040d4.gif) | Four voltage-input transconductance sections with buffers; application figure 9 shows a resonant four-pole low-pass configuration. |
| S2050 | [SSM2050 manufacturer page 1](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2050.gif), [page 2](https://www.synthfool.com/docs/Other_Misc/SSM_Chips/ssm2050d.gif) | Original SSM envelope chip. Page 2 explicitly identifies nominal exponential attack, decay and release approaches. |
| D3340 | [Electric Druid: CEM3340 VCO designs](https://electricdruid.net/cem3340-vco-voltage-controlled-oscillator-designs/#Sequential_Prophet_5_Rev3) | Tom Wiltshire's circuit analysis and annotated redraw of the Prophet-5 Rev 3 oscillator. Secondary explanation; original T3 schematics remain the primary reference. |
| PK3 | [Pink-noise synthesis notes and Paul Kellet’s refined filter](https://www.firstpr.com.au/dsp/pink-noise/) | Robin Whittle’s collection of music-dsp contributions. Credits Paul Kellet for the published refined/pk3 coefficients; this is a numerical noise-coloring reference, not a Prophet circuit. |
| SSI | [Sound Semiconductor SSI2140 datasheet](https://www.soundsemiconductor.com/downloads/ssi2140datasheet.pdf) | Manufacturer's modern Rossum filter document. Printed pp. 3–4: relation to SSM2040 and input range; later application sections explain four-pole feedback and resonance compensation. |

## Signal path and control facts

### Five voices, not a single paraphonic filter

There are five independently gated voices. Each has two VCOs, an audio mixer,
a resonant four-pole low-pass filter, a filter ADSR and an amplifier ADSR/VCA.
The front panel programs the five voices alike, while notes and voice-to-voice
component differences remain independent. The hardware output is mono. A
stereo voice-spread control is therefore a software enhancement, if offered.

O3 printed iii distinguishes white audio noise from the pink noise used by the
global Wheel-Mod system. It also explicitly identifies one global LFO. Oscillator
B in low-frequency mode instead gives one modulation oscillator per voice.
T3 Figure 2-4, printed p. 2-6 / PDF 19, confirms that the white source U427
MM5837 and its single U430 CA3280 level-control VCA feed all voice filters.
It is one shared white-noise bus, not five independent noise generators. A
separate U375 MM5837 provides the common pink Wheel-Mod source.

### Oscillators and sync

R4 pp. 17–19 specifies:

- Oscillator A has independent sawtooth and pulse switches.
- Oscillator B has independent sawtooth, triangle and pulse switches.
- Multiple waveform switches can be on simultaneously. This is not a mutually
  exclusive waveform menu.
- Normal coarse frequency adjustment covers four octaves in semitone steps.
- Oscillator B has an upward-only fine adjustment of nearly one semitone.
  There is no corresponding original front-panel A fine knob.
- B's keyboard switch disconnects its pitch from keyboard/MIDI note number;
  coarse frequency then covers nine octaves. Other modulation can still change B.
- B's low-frequency mode retains its frequency, fine, waveform and pulse-width
  controls. O3 p. 2-5 / PDF 16 gives approximately 0.4–30 Hz. T3 p. 2-8 / PDF
  21 describes a −7.5 V offset and an expanded coarse-control voltage span;
  therefore the circuit is not simply a fixed divisor of an unchanged tuning
  control. A direct software mapping across the documented approximate LF range
  is still an approximation to the complete circuit.
- Pulse width is square at the center. O3 p. 2-4 / PDF 15 gives approximately
  1–99% duty cycle; extreme settings can degenerate to DC and become inaudible.
  This supports numerical endpoint bounds, but not arbitrary claims about
  matching the exact pulse-comparator threshold of a physical unit.
- O3 p. 2-4 explicitly says simultaneous A waveforms are mixed at full level.
  Automatically averaging by the number of enabled waves changes the original
  level/drive relationship. Absolute digital amplitude calibration is separate.
- Hard sync means **B is master and A is slave**: each B cycle restarts A.
  The Rev 3 circuit derives sync from B's ramp, independently of whether B is
  audible in the mixer.

R4 p. 42 gives global Master Tune as approximately one semitone sharp or flat.
An A fine control, wider tuning ranges or a different displayed center offset
must be labeled as software/calibration extensions.

### Poly-Mod is per voice

The source amounts are Filter Envelope and Oscillator B. Both can feed any
combination of three destination switches: A frequency, A pulse width and filter
cutoff. There are no original Poly-Mod destinations for B frequency, B pulse
width or amplifier gain. B modulation follows the selected B waveform; it is
not merely the numeric B frequency setting (R4 pp. 34–35).

The Rev 3 oscillator circuit routes Poly-Mod into the exponential frequency
control node. T3 p. 2-8 / PDF 21 identifies the 1 V/octave oscillator scale and
the local Poly-Mod contribution to the oscillator CV-sum input. The annotated
D3340 redraw shows the Poly-Mod branch through
301 kΩ to CEM3340 pin 15, shared with the oscillator's pitch-control inputs;
the separate linear-FM pin 13 is biased elsewhere. C3340 p. 1 identifies the
two input functions. Thus A pitch modulation should be modeled in pitch-CV /
exponential-frequency terms, rather than assuming a linear-Hz FM law or using
linear-FM Bessel sideband amplitudes as a hardware acceptance criterion.

T3 p. 2-8 also specifies the waveform polarity: the CEM3340 outputs are
positive-going, but B's triangle and the main LFO triangle are deliberately
level-shifted around ground for symmetrical vibrato. B saw/pulse modulation
should therefore not be replaced unconditionally with an AC-centered audio
waveform. B's Poly-Mod tap precedes its audio-mixer level.

The owner guides describe attenuating source amount knobs, without negative
depth/invert controls. They do **not** publish an exact maximum in cents,
octaves, volts, Hz or pulse-width percentage. A positive normalized depth and
its chosen software scale must therefore remain an explicit approximation.

### Main LFO and Wheel-Mod

The LFO has combinable sawtooth, triangle and square switches. R4 p. 31 states
that triangle is bipolar, whereas sawtooth and square are positive-only.
Do not silently center all three waveforms around zero.

Wheel-Mod Source Mix blends LFO at one endpoint and pink noise at the other.
Its five independent destinations are A frequency, B frequency, A pulse width,
B pulse width and filter cutoff. The wheel controls the amount. R4 adds an
Initial Amount control for continuous modulation; increasing the wheel can
intensify it. The original Rev 3.3 panel and O3 p. 2-9 have no Initial Amount
knob; the physical wheel controls the modulation depth. R4 pp. 32–33 and 38
establish the modern control's behavior, but do not specify an exact summing,
clamping or maximum law. HEIRLOOM's bounded initial-plus-wheel behavior is a
software choice, not a recovered manufacturer formula.

| Behavior | Original Rev 3.3 reference | Modern Rev 4 reference |
| --- | --- | --- |
| Main LFO range | Approximately 0.04–20 Hz, O3 p. 2-9 | 0.022–500 Hz, R4 p. 32 |
| Glide | Unison only, O3 p. 2-9 | Also polyphonic, per voice, R4 p. 39 |
| Velocity / pressure | No original keyboard velocity/aftertouch controls | Switchable velocity influence on filter/amplifier; channel pressure to cutoff/LFO amount |
| Unison | All five voices on one lowest-priority note | Selectable one–five voices, detune and chord memory |

### Filters and envelopes

Both revision families are four-pole, 24 dB/octave low-pass filters capable of
self-oscillation. The original Rev 1/2 family uses SSM2040; Rev 3 uses CEM3320.
Rev 4's selectable Rev 1/2 character uses the modern SSI2140, not an original
SSM2040 IC. SSI documents four exponentially controlled transconductance cells
and buffers, with additional modern temperature compensation and resonance-VCA
features. Those additions must not be attributed wholesale to the old SSM2040.

The modern filter keyboard controls provide off, half and full tracking (R4
p. 24). That guide does not establish a fourth additive 1.5× mode when two
switches are on. The original Rev 3.3 owner manual describes a single
keyboard-tracking switch. An implementation should use clearly defined tracking
states rather than inventing an undocumented combination.

The chip-level difference is also meaningful: S2040 p. 1 shows four
voltage-input transconductance cells with buffers. C3320 pp. 1–3 describes
current-input/current-output variable-gain cells with buffers and an on-chip
resonance-control element; it specifically identifies predominantly second-
harmonic distortion. A common ideal four-pole response does not by itself
capture these different nonlinearities. Neither family is accurately described
as a literal Moog transistor ladder.

O3 p. 2-8 gives approximately **1 ms–30 s** for attack, decay and release,
with a panel setting of 5 producing roughly 0.5 s. The sustain control is a
level, not a duration. The quoted physical times are approximate hardware
ranges, not enough data to reconstruct every potentiometer taper or capacitor.
If a key is released during attack or decay, release starts from the current
envelope level. The amplifier ADSR follows the same control semantics.

R4 p. 25 says the Rev 1/2 filter-envelope response is relatively flat/nearly
linear, whereas Rev 3 is more curved. This is a qualitative revision distinction,
not a measured transfer curve for every stage. Do not interpret it as proof
that every original SSM decay/release segment is a mathematically linear ramp.
S2050 p. 2 in fact describes all three moving stages as nominal exponential
approaches to attack asymptote, sustain and ground. C3310 pp. 2–3 likewise gives
RC-exponential equations, with typical 6.5 V attack asymptote and 5 V peak.
Software curvature differences should therefore be disclosed as approximations
of family character, rather than asserted as exact original stage equations.

Classic **Release** is not the same operation as a modern sustain/hold pedal:
when enabled it uses both programmed release settings; when disabled it uses
a short release. The original footswitch enables the programmed release while
held, with the panel Release switch off (O3 pp. 1-4, 2-9; R4 p. 43). Rev 4 can
choose contemporary Hold behavior as an alternative.

### Amplifier gain control

The original Rev 3 final voice VCA is **CA3280**, not CEM3360. T3 printed
p. 2-9 / PDF 22 states that its VCAs use the RCA dual operational
transconductance amplifier, with output current equal to input voltage times
transconductance. The final VCA U477 uses its input-linearizing diodes; its
bias current is controlled by a 2N4250 PNP voltage-to-current converter.
Figure 2-4, printed p. 2-6 / PDF 19, routes U412 AMP ENV OUT through Q410 to
U477. Detail B shows a buffered control voltage applied through an emitter
resistor with a grounded base, rather than an exponential base-voltage input.
This supports an approximately linear envelope-to-gain relationship after
bias-current scaling; it does not justify adding an arbitrary multi-octave
exponential gain curve. Exact bias offsets, diode-current compensation, leakage
and audio saturation remain modeling details, not measured calibration.

S2020 identifies separate linear and exponential control inputs for the SSM
family’s dual VCA. Its name alone does not establish the law selected in a
particular Rev 1/2 circuit; no exact Rev 1/2 amplifier-gain calibration is
asserted here.

### Allocation and unison

O3 p. 1-4 explicitly specifies reuse of the same voice for repeated strikes of
the same key. When more than five keys are held, the earliest-used voice is
stolen first; this is not free-running round-robin assignment for repeated notes.
R4 p. 45 confirms this behavior. HEIRLOOM first reuses the same key’s voice,
then prefers a gate-off/releasing voice before stealing a held one. Earliest-used
is the tie-breaker within those groups; the manuals do not publish release-tail
tie-breakers or the proprietary allocation firmware. Sustained notes remain gated.

Original unison stacks all five voices on the lowest held note and is legato:
envelopes are not retriggered for a new overlapping key until all keys have
been released. Rev 4 adds low/last-note priority and retrigger alternatives,
selectable voice count and detune. Its unison detune display is 0–8, but no
exact cent spacing is specified (R4 pp. 40–45). Chord memory is a separate
modern performance option; a five-note chord still consumes five voices.

## What remains a software approximation

Published schematics and chip datasheets constrain architecture and control
relationships; they do not establish a unique digital model or a measured
reference unit. In particular, document these choices wherever implemented:

- Oscillator amplitude normalization when several waves are summed, pulse-edge
  corrections, hard-sync edge treatment, oversampling and numerical limits.
- Physical cutoff range, nonlinear resonance mapping, drive/headroom, bass loss
  or compensation, and the precise differences between the two filter profiles.
- Poly-Mod depth conversion, wheel/initial-amount summation, and LF-mode scaling.
- Envelope timing/curve interpolation between the approximate manual examples,
  retrigger details at a nonzero level, and glide's exact time/rate law.
- Voice detune/drift distribution and its time dependence. Rev 4's Vintage knob
  runs from stable 4 toward more variable 1; no statistical distribution is
  published (R4 pp. 36–37).
- Allocation when independently sourced MIDI/host notes overlap on one pitch,
  click suppression on stealing, and browser sample-rate limitations.
- Optional stereo spread, A fine calibration, extended LFO range, poly glide,
  velocity/pressure, sequencer, effects and other Kitchen conveniences.

Acceptance tests can check the documented signal routing, oscillator harmonic
structure, sync direction, exponential pitch relationship, filter slope,
self-oscillation, envelope causality and five-voice bounds. Without hardware
measurements they must not assert that a particular distortion spectrum,
component tolerance, response curve or patch sounds indistinguishable from a
particular real Prophet-5.

### Current HEIRLOOM numerical model

The implementation in `dsp.js` uses five synthesis voices and fixed **4×**
oversampling. Oscillators use causal BLEP/BLAMP-style event corrections for
natural waveform edges and B-to-A resets. Selected audio waves add at full
level; modulation uses bipolar triangles and positive-going saw/pulse sources.
A common white-noise stream enters all voice mixers, and a separate common
pink stream enters Wheel Mod. Oscillator phase advances while a voice is idle.
These are original numerical implementations of the documented signal flow,
not extracted hardware firmware.

Both filter profiles currently share a nonlinear four-pole topology-preserving
integrator cascade with two feedback-solver Newton iterations. They differ in
headroom, drive and resonance mapping. The SSM-inspired cells are symmetric;
the CEM-inspired cells add a chosen normalized **0.035** bias with baseline
subtraction, introducing even harmonics in the direction described by its
datasheet. This is a bounded, reduced-order digital approximation, not a
component-by-component model of either IC, and that bias is not a recovered
hardware operating-point measurement. No measured cutoff, Q, distortion
spectrum or level-response calibration is claimed. The amplifier uses linear
normalized envelope gain consistent with the Rev 3 CA3280 control-current
path; applying that same gain law to the SSM-inspired profile is an explicit
approximation, rather than a verified Rev 1/2 circuit reconstruction.

The envelope stages use finite-sample RC-like approaches. The CEM-inspired
attack uses a normalized asymptote of **1.3**, matching the typical published
6.5 V / 5 V ratio. The SSM-inspired filter attack uses a softer, chosen **2.2**
asymptote as a qualitative revision-family difference; it is not a measured
SSM2050 parameter. Decay/release reduce the remaining distance by a factor of
**1000** over the nominal control duration, with small endpoint thresholds.
Thus displayed seconds describe a practical timing convention rather than a
unique hardware crossing-time definition. Release-disabled uses a short
approximately **4 ms** envelope.

The software makes its depth and safety choices explicit: Poly-Mod source
amounts each map to up to **four octaves** of pitch/filter CV, regular filter
envelope amount to **eight octaves**, and Wheel Mod to **one octave** of pitch
or **two octaves** of cutoff modulation. Initial Amount and wheel depth sum
then clamp to 0–1. Those numbers are implementation scales, not recovered
manufacturer voltage specifications. A/B coarse control is 0–48 semitones
with neutral 24; the B LF mode instead maps the control to approximately
0.4–30 Hz before optional keyboard tracking.

Numerical protection limits each oscillator increment to **0.4 internal
cycles/sample** and filter cutoff to the smaller of **24 kHz** and **0.45×**
the output sample rate. An eighth-order output low-pass decimator and a
**5 Hz** DC blocker bound out-of-band and DC content. Controls that otherwise
produce abrupt level/depth jumps use approximately **4 ms** smoothing, and
voice stealing uses a short approximately **3 ms** correction. Vintage uses
chosen seeded calibration offsets and slowly varying drift, not statistics
measured from real units. These safeguards and approximations may affect
extreme modulation and timing and should not be described as physical facts.

The pink-noise coloring coefficients follow Paul Kellet’s published refined
filter, with HEIRLOOM’s sample-rate adjustment and seeded noise generator.
See PK3 for contributor attribution; the referenced web page is not reproduced.

## Reuse and attribution boundaries

HEIRLOOM should contain original DSP and original presets. Public availability
of a manual, schematic or manufacturer datasheet is not a redistribution
license for its pages, artwork or software. Do not package the downloaded PDFs,
manufacturer logos, panel photographs, copyrighted ROM/firmware, SysEx factory
banks, commercial plug-in code or extracted samples. References here are links
and factual paraphrases; third-party rights remain with their owners.

Use HEIRLOOM/Kitchen branding. Prophet-5, Sequential and IC names identify the
historical references, not affiliation, endorsement or a certification of
electrical/sonic equivalence.

### Idle processing boundary

Oscillator phases, the shared LFO, independent noise streams and drift continue
to advance while no notes sound. Idle oscillator phases use their cached key,
tuning, calibration, drift and bend rates, with sync; per-voice Wheel-Mod and
Poly-Mod frequency routing is integrated only while the amplifier is active.
Consequently a modulated idle oscillator’s retrigger phase is an approximation. Once a voice’s amplifier envelope falls below
the numerical silence floor, its filter state is retained but its integration
pauses until the voice is reused. Active and releasing voices always use the
full oversampled path. This bounds idle CPU cost; it approximates the continuously
energized analog filter, including its idle self-oscillation phase. It must not
be described as continuous simulation of every silent physical circuit.

### Processing-budget measurements

An isolated Node 24.19.0 run on the two-CPU Xeon 8573C development host measured
these median costs for actual 128-frame Core blocks, after warmup. Nine batches
of 250 blocks included finite-output/peak scans. These are informational source
benchmarks, not a promise about a particular browser, device or whole GALLEY mix.

| Output rate | Idle | One voice | Five voices | Five voices, deep Poly-Mod / sync |
| --- | ---: | ---: | ---: | ---: |
| 48 kHz | 0.039 ms | 0.270 ms | 1.086 ms | 1.403 ms |
| 96 kHz | 0.044 ms | 0.257 ms | 1.067 ms | 1.333 ms |

The corresponding real-time block budgets are 2.667 ms at 48 kHz and 1.333 ms
at 96 kHz. The dense 96 kHz case approached that entire budget before a host’s
other processing. Standalone audio uses 48 kHz; in GALLEY, 48 kHz and printing
finished parts are practical choices when combining several busy instruments
and effects. The instrument does not reduce oversampling or solver quality
automatically.

The performance pass kept ordinary/deep-modulation stereo fixtures bit-identical
to its first working sound model at 48/96 kHz. Self-oscillation’s most sensitive
comparison differed by at most 3.73e-9 sample amplitude, with relative RMS error
below −163 dB. This comparison verifies the optimization against its software
baseline; it is not a hardware-accuracy measurement.
