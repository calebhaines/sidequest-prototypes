# BOARD · ten essentials in four positions

BOARD is a dedicated guitar pedalboard effect for GALLEY. Four ordered
positions can each hold one of ten pedal types. Select a position to expose
its three main knobs, use its footswitch to bypass it, and unfold the detail
controls when needed. Signal flows from position 1 to 4. A pedal's Level feeds
the next pedal; its Blend mixes its own wet and dry signal. Board input/output
trim and Board blend sit around the complete chain. Blue plate's familiar
**Level** knob represents its physical volume pot; its separate **Output
trim** is a software gain after the pedal.

Changing a type retains that position's stored settings. A complete recipe
replaces the whole board. Reordering moves the pedal's settings and its
position-specific automation/routing with it. Empty positions do no pedal
processing, so a simple recipe does not run ten hidden processors.

## The ten types

| Kitchen pedal | Main controls | Reference and useful role |
| --- | --- | --- |
| **Blue plate** | Gain, Tone, Level | Stock BOSS BD-2 topology: two discrete gain stages, fixed interstage network, four-diode shunt and passive tone, followed by the bass-boost/output stage. |
| **Green bowl** | Drive, Tone, Level | Tube Screamer-family feedback-clipping interpretation for a mid-focused drive or push into another stage. |
| **Pan rat** | Distortion, Tone, Level | RAT-family driven-amplifier/hard-clipping interpretation, followed by a darker tone range. |
| **Loose crumb** | Fuzz, Tone, Level | Original transistor-fuzz interpretation with input-level/drive interaction. |
| **Even serving** | Sustain, Level, Blend | Guitar sustain compressor, with blend and release available. It deliberately changes dynamics when selected. |
| **Talking spoon** | Position, Resonance, Blend | Resonant manual wah or input-envelope-controlled sweep. |
| **Double garnish** | Rate, Depth, Blend | Analog bucket-brigade-style short-delay modulation for chorus and width. |
| **Turning fork** | Rate, Feedback, Blend | Four- or six-stage all-pass phasing. |
| **Second helping** | Time, Feedback, Blend | Analog-style or digital repeats, with free time or tempo-synced divisions. |
| **Back room** | Decay, Tone, Blend | Original spring-style or room algorithms with pre-delay and diffusion. |

These are original numerical circuit/behavior models. The families identify
their intended reference rather than claiming that every device has been
measured or recreated transistor by transistor. BOARD has no automatic
loudness normalization. Compare drives at similar listening levels using
their Level or Board output; a louder setting can otherwise seem more
impressive simply because it is louder.

The entire board can precede SUNDAY, CELLAR or BROILER in the normal track
insert rack. For a familiar guitar chain, begin with Blue plate alone, then
add chorus/phaser or a quiet delay/reverb. A low-drive Green bowl into Blue
plate provides a different response from reversing that order. A separate
clean boost can also be approached through low Drive and increased Level;
it is not counted as an eleventh pedal type.

## Blue plate: the stock BD-2 reference

The reference is the original through-hole BOSS BD-2 Blues Driver, not a
Waza Custom mode, Keeley/Analogman modification or Machine Head Galaxie mod.
Its published operating specifications give a nominal input/output level of
−20 dBu, 1 MΩ input impedance, 1 kΩ output impedance and a 9 V supply. The
examined service schematic labels approximately +8 V audio supply and a
buffered +4 V reference after the supply circuit.

Blue plate follows the reference's actual order and frequency-dependent gain
relationships. It is not a generic distortion curve followed by a tilt EQ.
The main elements are:

1. A high-input-impedance JFET source follower and input coupling.
2. A discrete amplifier made from a JFET differential pair and PNP gain device,
   with frequency-dependent negative feedback.
3. A fixed Fender-like passive interstage network, loaded by two series
   silicon diodes in each direction shunting the signal to ground.
4. A second discrete JFET/PNP gain stage with its own feedback shelf and
   high-frequency compensation.
5. A passive tone network and loaded physical volume control.
6. The final op-amp bass-boost network, including its follower-assisted
   gyrator behavior, and output coupling/buffering.

The electronic bypass FETs and control flip-flop in the hardware service
schematic are not extra distortion stages. The model's normal GALLEY bypass
performs the switching job. The two-series diode paths after the first stage
are distinct from the Tube Screamer's feedback-diode clipping topology.

### Feedback and fixed network values

The original service sheet and the stock portions of Aion FX's Sapphire
redraw agree on these key values:

| Reference network | Values used to derive the model |
| --- | --- |
| Input coupling/reference load | 47 nF input coupling, 10 kΩ series input resistance and 1 MΩ gate/reference load |
| Gain pot | Dual-gang 250 kΩ audio taper, changing both stages' feedback |
| First feedback arm | 22 kΩ plus the variable gain resistance; 47 pF compensation |
| First ground/shelf arm | 1.5 kΩ in series with 150 nF |
| Fixed interstage network | 220 pF, 330 kΩ, 100 kΩ, 100 nF, 47 nF, 1 MΩ and 15 kΩ |
| First shunt clipping | Four 1SS133 silicon diodes, as two series diodes in each antiparallel path |
| Second input coupling | 2.2 nF into the 1 MΩ reference/input load |
| Second feedback arm | 33 kΩ plus the variable gain resistance; 100 pF compensation |
| Second ground/shelf arm | 2.2 kΩ in series with 1 µF |
| Post-stage shaping | 5.6 kΩ in parallel with 6.8 nF, followed by 5.6 nF shunt capacitance |
| Tone/volume | 10 kΩ linear Tone, 18 nF tone capacitors and 100 kΩ audio-taper physical Level |
| Final bass network | 6.8 kΩ/2.2 nF feedback, 56 nF/56 nF gyrator capacitors, 1.2 kΩ and 470 kΩ reference values |

For the two gain stages the reference small-signal relationship is
`A(s) = 1 + Zfeedback(s) / Zground(s)`. The 250 kΩ gain resistance belongs in
the feedback arm, rather than being substituted for the ground arm. Both
feedback arms and both shelf capacitors matter to the gain-versus-frequency
relationship. Their high-frequency compensation also changes the driven
character as Gain increases.

The fixed interstage network, loaded diode node and passive tone/volume
network are solved as connected networks, retaining their interacting loads.
The final ideal-follower gyrator has approximately
`L = 1.2 kΩ × 470 kΩ × 56 nF = 31.584 H`; its series 56 nF capacitance gives
an ideal resonance near 120 Hz. Finite transistor follower gain adds damping,
so that ideal relationship is a model reference, not a measured hardware
resonance/boost guarantee. The physical Level pot is ahead of the final
bass-boost stage, so its loading and drive into that stage are retained.
Output trim remains a separate post-pedal software control.

Physical Level spans the pot's full range, including mute at zero. Its
representative audio law is `(81^p − 1) / 80`, where `p` runs from zero to
one. The midpoint is therefore 10% of the electrical resistance range. This
is a representative 10% audio taper, not a measured calibration of an
individual BOSS knob or potentiometer. The dual Gain control also uses an
explicit software audio-taper approximation.

### Original circuit versus the useful redraw

Aion's Sapphire is a valuable readable redraw and component-value cross-check,
but it is a modified true-bypass implementation. It adds a Bass control and
describes a separate Galaxie component substitution. The stock reference
corresponds to the original 6.8 kΩ bass-feedback value, with that added control
at its stock end. Its suggested 500 kΩ dual-gang replacement plus parallel
510 kΩ resistors is a sourcing workaround that changes the taper. Blue plate
uses the original 250 kΩ control relationship; the workaround and Galaxie
parts are not silently substituted into the stock recipe.

The redraw also uses modern replacement devices and different bypass/input
pulldown/output-coupling choices. Its 1N914 diode substitution is a component
cross-check, not evidence that all 1N914 and 1SS133 devices have identical
current/voltage curves. The original BOSS scan remains the stock reference.

### Accuracy boundaries and touch

The software uses connected passive-network equations and implicit diode
behavior, with a reduced-order nonlinear description of the discrete gain
amplifiers. The original single-ended PNP gain stage and finite JFET tail do
not imply a perfectly symmetric amplifier. The model uses the sheet's
approximately 8 V supply/4 V reference and nominal asymmetric output swing
of +3.8/−4 V inside its implicit amplifier solve. The 0.2 V PNP saturation
allowance is a representative modeling assumption, not a measured stock-pedal
voltage. Finite gain, bandwidth, rail and device-bias approximations remain
software choices; JFET pinch-off/current spread, transistor operating points
and every device capacitance have not been measured. The follower-assisted
bass network also uses an explicit reduced-order follower assumption. Input
and output buffers are represented by their functional isolation and
coupling behavior, rather than independent nonlinear transistor solves.

No original pedal was measured alongside the software. A physically perfect
BD-2 match therefore cannot be claimed. The circuit relationships and
reference facts above make the intended target inspectable, while tests can
verify network equations, bounds, dynamic response, rendering consistency
and numerical stability. Those tests are different from hardware calibration.

At low Gain, compare light and firm picking and roll down the guitar's volume.
At higher Gain, the original circuit can produce a deliberately ragged decay;
the model does not automatically gate, compress or normalize that decay to
make it tidier. Check other track/master effects if input dynamics are being
reduced elsewhere. A software input control cannot repair clipping that has
already happened in the physical interface.

## Timing, quality and keeping a board

Delay's Sync mode uses GALLEY tempo and the chosen musical division. Free
mode keeps the stored Time in milliseconds. The other modulation controls
retain their separate rates. High/Economy select explicit nonlinear
processing quality; quality does not change according to CPU load. Pedal
type, order, power, stored settings and numeric automation belong to the
normal GALLEY project and rendering path.

The analog chorus, fuzz, phaser, compressor, delay and reverb families are
original musical interpretations rather than licensed hardware algorithms
or measured impulse responses. Physical guitar pickup loading, a fuzz's
electrical connection to the guitar volume pot, component tolerances and a
real cabinet/microphone can all affect a hardware comparison.

## Sources actually examined

- [BOSS BD-2 original service schematic](https://www.synthxl.com/wp-content/uploads/2019/06/Boss-bd-2-schematics.pdf),
  the manufacturer MT/VR-board drawing hosted by SynthXL. Used to verify
  JFET/discrete amplifier topology, diode positions, stock values, supply
  rails and bypass circuitry.
- [BOSS BD-2 owner's manual](https://www.synthxl.com/wp-content/uploads/2019/06/Boss-BD-2-owner-manual.pdf),
  used for the operating controls, guitar-volume response, nominal levels,
  impedances and 9 V supply.
- [Aion FX Sapphire build document](https://aionfx.com/app/files/docs/sapphire_documentation.pdf),
  version 1.0.1 (2024), used as a readable
  stock-circuit/component cross-check. Its Bass, true-bypass, replacement-pot
  and Galaxie changes are distinguished above.

Only original software and factual circuit descriptions are distributed.
Manufacturer names identify the comparison targets and imply no affiliation;
manufacturer manuals, scanned schematic artwork and commercial emulator code
are not bundled with BOARD.
