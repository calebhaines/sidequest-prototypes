# CELLAR · five studies of an SVT-style bass head

CELLAR is a dedicated bass amplifier for GALLEY. Its reference is the Ampeg
SVT-CL: a high-powered, all-valve bass head with six 6550 output valves, Gain
and Master controls, three tone controls, five selectable mid frequencies and
the familiar Ultra Low/High switches. Five original numerical formulations
share that platform so their touch and overload can be compared with the same
controls and cabinet.

The model aims for a broad clean range, a strong low-string attack and a
gradual, level-dependent transition into overload. Its gain is not controlled
by an automatic input leveler, compressor, gate or loudness normalizer. The
reference amplifier's 300-watt rating identifies the hardware platform;
CELLAR's output remains digital audio.

These are original reduced-order circuit interpretations. They have not been
calibrated against recordings or electrical measurements of a particular
SVT-CL, output transformer, cabinet and microphone. They are not measured amp
captures, a component-complete SPICE simulation, or a licensed Ampeg product.
The component and control relationships below distinguish reference facts
from software choices.

## Start with the touch

1. Put CELLAR on a track with a clean bass recording or a clean monitored
   instrument/interface input. Avoid clipping the interface before the signal
   reaches GALLEY.
2. Load **Clean comparison**. Gain 3, Master 5, tone controls centered, Ultra
   Low/High off, no extra headroom and no speaker breakup make a common
   starting point for A–E.
3. Change only the emulation. Play the same low note gently, moderately and
   firmly; compare its attack, body, decay and recovery after a hard accent.
   The five clean recipes have the same settings apart from their model.
4. Use **Gain** to drive the preamp and **Master** to change the level reaching
   the output section. Use **Output trim** after the rig to match listening
   levels without undoing the chosen internal drive.
5. Use the **−15 dB input pad** for a hot source. **Extra headroom** is an
   explicit software extension when more clean margin is wanted; zero retains
   the reference starting point.

The five methods intentionally converge at small signal levels. They share
the basic tone and cabinet platform rather than applying arbitrary model EQ
to exaggerate A–E differences. Their nonlinear laws, stored charge and load
interaction become more apparent when the amp is pushed. A driven valve
amplifier naturally changes crest factor and compresses; keeping the clean
touch does not mean suppressing all overload behavior.

Matched comparison trim is a fixed per-model calibration. It does not follow
the envelope or turn up quiet notes. Driven models may still differ in
loudness, so finish the comparison with Output trim. Track/master compressors
or an overloaded output elsewhere can obscure the amp's dynamic response.

## The five formulations

| Study | Method and useful comparison |
| --- | --- |
| **A · Open authority** | Implicit plate-current/load-line formulation. The reference clean-to-driven transition. Compare soft and firm low notes. |
| **B · Elastic edge** | Coupling-charge and cathode-memory formulation. Compare a hard accent followed by a quiet phrase and its recovery. |
| **C · Firm grip** | Coupled nonlinear negative-feedback solve. Compare low-string definition and the firmness of held notes. |
| **D · Smooth push** | Antiderivative treatment of nonlinear stages. Compare upper-register sustain, hard low accents and harmonic decay. |
| **E · Reactive weight** | Conductance/transformer/load-state interpretation. Compare short muted notes with ringing notes and explore Speaker load. |

The six physical output valves are represented through equivalent push-pull
stage behavior, not six independently measured device models. The 6550 is a
beam-power valve; the numerical source laws are reduced descriptions of its
operating behavior rather than complete electrode/device equations. The five
methods are software studies, not a measured ranking of hardware accuracy.

## Verified SVT-CL reference controls

The manufacturer manual specifies the following nominal electrical responses:

| Control/reference | Manufacturer specification |
| --- | --- |
| Input choices | Normal input and fixed −15 dB input |
| Bass | +12/−12 dB at 40 Hz; center nominally flat |
| Midrange | +10/−20 dB at the selected frequency; center nominally flat |
| Mid frequency positions 1–5 | 220 Hz, 450 Hz, 800 Hz, 1.6 kHz, 3 kHz |
| Treble | +15/−20 dB at 4 kHz; center nominally flat |
| Ultra Low | +2 dB at 40 Hz with a −10 dB cut at 500 Hz |
| Ultra High | +9 dB at 8 kHz |
| Valve complement | Preamp: 2 × 12AX7; driver: 1 × 12AX7 and 2 × 12AU7; output: 6 × 6550 |
| Rated output | At least 300 W RMS continuous at less than 3% THD, into 2 or 4 ohms, with 0.4 V RMS input under the manufacturer's test conditions |
| Maximum gain/band edges | 67 dB at 1 kHz, tone controls centered; −3 dB at 40 Hz and 15 kHz |

CELLAR uses those control frequencies and response relationships as reference
targets. The manual's numbers do not specify every component value, knob
taper, load condition or gain setting required for a measured reconstruction.
The software's 0–10 knob mapping and digital input calibration remain explicit
modeling choices; the hardware voltage and power specifications are not a
claim that a particular dBFS sample is an exact measured SVT operating point.

Ultra Low is a coupled low lift/mid scoop, rather than a sub-bass boost alone.
The five-position selector moves the Midrange control's center; it does not
select five complete amp models. A–E is the separate emulation comparison.

## Verified front-end topology

The SVT-CL audio service drawing, page 2, identifies the front preamp as
drawing 075519-11, revision 1, originally issued 17 November 1993. Its order
is first 12AX7 gain stage, Ultra Low/Gain, second 12AX7 gain stage, passive
James Bass/Treble network, third 12AX7 gain stage with selectable-mid
feedback, Master, then the remaining 12AX7 half as a cathode follower. Gain
therefore drives the second gain stage before the Bass/Treble controls. The
third stage provides recovery after the passive network.

The actual coupled tone network has these connected branches. S is the
signal after the second stage's 100 nF plate coupling capacitor; BW and TW
are the Bass and Treble wipers. Both pots are 1 MΩ audio taper.

| Connected branch | Service-drawing parts |
| --- | --- |
| S to Bass upper terminal | R48, 220 kΩ |
| Bass upper terminal to BW | Upper pot arm in parallel with C20, 1 nF |
| BW to Bass lower terminal | Lower pot arm in parallel with C21, 10 nF |
| Bass lower terminal to ground | R37, 22 kΩ |
| BW to TW | R30, 100 kΩ |
| TW to ground | R32, 100 kΩ |
| S to Treble upper terminal | C23, 470 pF |
| Treble lower terminal to ground | C27, 4.7 nF |
| TW to third-stage grid | C16, 100 nF |

TW is both the Treble wiper and the output node. The tone controls therefore
load each other; their reference is not two unrelated active shelves. The
following 470 kΩ grid return connects to the junction of the third stage's
1.5 kΩ/2.2 kΩ cathode resistors, rather than directly to ground. A constant
source/load approximation is a reduction of that active interaction.

CELLAR solves the coupled passive graph as a nine-node, six-capacitor TPT
state-space network. Its plate source is reduced to 38 kΩ and the following
grid return to 470 kΩ to ground. With `p` running from zero to one, its
representative Bass law is `p^(log(0.2)/log(0.5))` and Treble law is
`p^(log(0.1)/log(0.5))`. These give 20% and 10% electrical travel at the
respective knob midpoints. They are fixed modeling choices calibrated
against the nominal response, not measured manufacturer pot curves. A fixed
20× recovery restores the passive network's nominal level; it never follows
the input envelope. Source impedance, cathode bootstrapping, component
tolerances and actual pot law affect the result. In this reduced loading
condition the network's Bass span is close to the nominal ±12 dB, while
Treble spans approximately −12/+17 dB at 4 kHz. The actual coupled network
is retained rather than adding unrelated EQ to force every manual endpoint.

The physical Mid circuit places a 50 kΩ linear pot between a cathode-derived
signal and a divided plate-derived signal. Its wiper feeds an 800 mH tapped
inductor with switched series capacitances. The sheet does not specify all
tap inductances or winding losses. CELLAR's manual-frequency resonant
equivalent is consequently not a component-complete reproduction of the
physical coil and feedback path.

The examined CL driver drawing uses a 12AX7 gain stage followed by a
split-load/cathodyne phase inverter, then 12AU7 gain/follower drivers into
the two three-valve output banks. Global speaker-transformer feedback
returns to the first driver's cathode network. This is not a Fender-style
long-tailed-pair driver. The numerical output/feedback studies retain those
functional relationships without claiming to solve every driver component.

## Circuit and cabinet bench

Supply voltage, output bias, supply movement, negative feedback and transformer
response expose modeled operating relationships. Begin at their stock values
when comparing A–E. Extra headroom and those deep controls intentionally allow
departures from the reference settings.

All five studies share an original sealed **8 × 10** cabinet/microphone
interpretation. Speaker load concerns the amplifier/load interaction. Speaker
breakup starts at zero; raise it deliberately when a driven cone is wanted.
Mic position, distance and Air change the virtual recording perspective.

**DI** removes the built-in cabinet and microphone path for an external
cabinet processor. The amplifier's modeled load interaction remains present.
The built-in cabinet is an original network, not a measured impulse response
from a particular branded enclosure. Stereo uses independent wet paths; Mono
folds the input into one bass rig.

High uses four-times nonlinear processing and Economy uses two-times
processing. Quality is chosen explicitly; the model does not silently reduce
quality according to CPU load. Input/output peaks, RMS and crest readings
describe the actual processed audio. Power margin and supply movement are
internal model observations rather than hardware calibration measurements.

## Research sources and variant boundaries

- [Ampeg SVT-CL owner's manual](https://ampeg.com/pdf/SVTCL_OM.pdf), examined
  for the actual valve complement, control responses, input pad, gain/output
  specifications and signal-flow description.
- [Ampeg Classic heads](https://ampeg.com/products/classic/svtcl/), examined
  for the current SVT-CL product identity, 300-watt platform and five-way mid
  selector.
- [SVT-CL audio service schematic](https://www.thetubestore.com/lib/thetubestore/schematics/Ampeg/SVT-Classic-Audio-Schematic.pdf),
  a five-page manufacturer service scan hosted by The Tube Store. Page 2 is
  the actual CL front preamp used to verify Gain position, coupled James
  network and selectable-mid feedback. The part values above come from
  this drawing, rather than from a different SVT-family preamp.
- [SVT-CL output/driver service binder](https://www.bustedgear.com/images/schematics/Ampeg_SVT-CL.pdf),
  inspected for the shared six-6550 output board, CL driver, cathodyne phase
  inverter, transformer feedback and supply/bias structure. This binder
  alone does not contain the front preamp page.
- [EL34 World's Ampeg schematic index](https://el34world.com/charts/Schematics/files/Ampeg/Ampeg_schematics.htm),
  examined to distinguish original SVT, SVT-2 Pro, SVT-200T and CL-related
  service drawings. Several archive filenames group those models together;
  a grouped filename alone does not identify a circuit as an SVT-CL.
- [Ampeg SVT-2 Pro 6550 output-board drawing](https://el34world.com/charts/Schematics/files/Ampeg/Ampeg_SVT-2PRO%20_%20IIPRO%20_%20SVT-CL_2.pdf),
  inspected as a **related** high-powered six-6550 push-pull reference, not
  relabeled as a complete SVT-CL schematic. Its marked voltages and board
  revision are specific to that drawing.

The legacy two-channel SVT preamp drawing with 12DW7/6C4 valves is not the
SVT-CL preamp. Early 6146-output SVTs, later 6550 SVTs, SVT-2 Pro graphic-EQ
models and solid-state SVT-200T circuits are not interchangeable references.
CELLAR's nominal controls and identity follow the verified CL manual and
actual CL front-end drawing; its nonlinear devices, source/load reductions,
mid equivalent, transformer and cabinet remain original reduced-order
models. Manufacturer names identify research references and imply
no affiliation. No manufacturer manuals, artwork or commercial emulator code
are distributed with the model.
