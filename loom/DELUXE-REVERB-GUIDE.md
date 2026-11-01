# SUNDAY · five Deluxe Reverb studies

SUNDAY is a dedicated guitar amp effect for GALLEY, built around the Fender
Deluxe Reverb AB763 platform. It contains five original amp formulations so you
can compare their touch and breakup with one shared set of controls. They are
five interpretations of the same amp, rather than five saved EQ settings.
BROILER remains unchanged.

The target is the familiar fixed-bias, two-6V6, approximately 22-watt combo:
a passive Fender tone stack, a 12AT7 long-tail phase inverter, tube rectification,
spring reverb, optical amplitude tremolo and an open-back single 12-inch speaker.
The software uses original reduced-order models; it is not a collection of
measured amplifier captures, a licensed Fender implementation or a calibrated
component-by-component SPICE simulation. Without matching measurements from a
particular amplifier, speaker and microphone, a perfect match cannot be claimed.

## Make a fair comparison

1. Insert **SUNDAY** on the track containing a clean guitar recording, or monitor
   a clean instrument/interface input through that track. A high-impedance guitar
   input is a useful starting point.
2. Load **Clean comparison**. It sets the same dry clean starting point for all
   five formulations: Volume 3, Reverb and Intensity 0, Speaker breakup 0,
   Matched comparison trim and High quality.
3. Change **A–E**. This changes the emulation while retaining the other amp
   controls. The five named clean recipes provide the same comparison settings
   with a particular emulation selected; loading a recipe replaces the complete
   setup.
4. Play the same passage gently, moderately and firmly. Let a hard chord decay,
   then follow it with a quieter single note. Compare the attack, chord body,
   low-string definition and recovery, rather than choosing only by loudness.
5. For the main A–E audition, use the same healthy DI passage and move the shared
   **Volume** to about **5–6**. Compare light picking with firm chord attacks and
   the edge of breakup. Reduce **Output trim** to keep a comparable listening
   level. Output trim is a software listening control; the original amp does
   not have a master-volume control.

The five formulations intentionally converge in the fully clean region: they
share the same circuit platform and tone network. A very quiet passage at low
Volume may therefore sound almost identical. Their different nonlinear laws,
state and recovery become more apparent around the driven edge; the models do
not add artificial clean EQ differences just to make A–E sound farther apart.

**Matched** applies a fixed clean-level trim for each formulation. It does not
follow the input envelope or turn up quiet notes. **Raw** leaves each model at
its own level. Driven tones can still differ in loudness, so finish a comparison
with Output trim. Start with other compression, limiting and level-changing
processing bypassed if you want to hear only the amp’s response.

## The five formulations

| Study | Method and comparison focus |
| --- | --- |
| **A · Open clean** | An implicit triode load-line and push-pull output study. Start here for the reference clean-to-driven transition. Compare light and firm chord attacks. |
| **B · Elastic edge** | A stateful grid-charge and cathode-memory formulation. Compare recovery after a strong chord, followed by a soft note. |
| **C · Firm response** | A nonlinear output-pair calculation with the global negative-feedback interaction solved inside the loop. Compare low-string definition and chord stability when pushed. |
| **D · Smooth breakup** | An antiderivative anti-aliasing formulation of the nonlinear stages. Compare upper notes, double-stops and the grain of their decay. |
| **E · Reactive feel** | A conductance-based formulation with stronger dynamic transformer/speaker-load coupling. Compare a low chord followed by a short high note at the driven edge. |

The cabinet and microphone platform is shared so that an emulation change does
not silently substitute another speaker. The source laws and state treatment
are the intentional differences. The same knob positions need not give identical
harmonics or overload recovery. The displayed method notes describe the software
approach; they do not establish a measured ranking against real hardware.

## The amp face

**Volume** changes the amp’s gain and operating level. Low settings leave more
clean room; higher settings deliberately bring the preamp and output stages
closer to overload. **Bass** and **Treble** interact through a passive network,
so they do not behave like two independent digital shelves.

**Reverb**, **Speed** and **Intensity** are active on the **Vibrato** channel.
The original Fender name “vibrato” refers here to optical-style amplitude
*tremolo*, not a pitch-shifting effect. Speed changes its rate; Intensity sets
its depth. The Normal channel retains those settings but does not apply them.
The Vibrato channel’s extra dry recovery stage remains part of its character
even with Reverb at zero.

The hardware has no Mid knob. **Mid resistor** in the Circuit bench is a virtual
modification: its center setting, 5, represents the stock 6.8 kΩ ground leg.
Changing it explores departures from the original fixed-mid circuit.

## Keep the touch

There is no automatic input leveling or a general-purpose compressor in the
amp path. The aim is to retain quiet-to-loud picking through the clean region,
then let nonlinear valve behavior, supply movement and speaker response appear
as the circuit is driven. A real Deluxe Reverb also compresses and distorts
when pushed; preserving dynamics does not mean eliminating that behavior at
all Volume settings.

- **Input trim** calibrates the incoming recording or interface level. It
  changes how strongly the entire virtual amp is driven.
- **Input 2** has a fixed −6 dB sensitivity pad. It leaves more room for hot
  pickups or an already amplified recording. The software pad cannot change the
  physical input impedance of your interface or the pickup loading before it.
- **Extra headroom** moves the virtual overload margin. Zero is the stock
  starting point; positive values are a deliberate software departure that
  provides more room for peaks.
- **Output trim** changes listening level after the amp. Use it to avoid
  overloading the rest of GALLEY while retaining the selected amp Volume.
- **Speaker breakup** starts at zero. Raise it when you want an intentionally
  harder-worked cone rather than adding another compression source by default.

Input/output peak and crest readings describe the actual signal through the
selected insert. A crest factor is the peak-to-RMS difference; it is a level
observation, not a direct measurement of circuit accuracy or a promised number
of decibels of “preserved dynamics.” Power margin and supply movement are
estimates from the model’s internal state. Reverb, tremolo, tone shaping and the
source’s stereo relationship can also change the measured crest.

If the amp feels less responsive than expected, start with Clean comparison,
use Input 1 or Input 2 to suit the source, leave Speaker breakup at zero, and
check the track and master meters. A compressor or overloaded limiter elsewhere
in the project can still reduce the dynamics heard at the speakers.

## Circuit and cabinet bench

**Bright capacitor: Stock** follows the selected channel. The AB763 Vibrato
channel has a 47 pF bypass across its Volume control; the Normal channel does
not. Its contribution depends on Volume, becoming less significant as the
Volume control approaches full. The software Off/On choices expose a virtual
modification of that stock behavior.

**Supply voltage**, **Output bias**, **Supply sag** and **Negative feedback**
explore operating-point and response changes. Their stock settings provide a
common comparison point. Supply sag is associated with driven circuit demand
and recovery, rather than an input-envelope gain normalizer.

**Open-back 1 × 12** supplies the original cabinet/speaker interpretation.
**Mic position**, **Mic distance** and **Air** change the recording perspective.
**Speaker load** affects the amplifier’s feedback/load response in all five
formulations, including **DI · external cabinet**. Study E has the stronger
dynamic reactive coupling. DI removes the built-in cabinet/microphone path;
it does not remove the amp’s virtual load interaction. Follow DI with another
cabinet processor when that is the desired chain. The cabinet is not a measured
Jensen impulse response.

**Mono** folds the wet input into one combo. **Stereo** runs separate amp paths
for the two input channels. **Blend** mixes the processed sound with the original
signal. **High** uses 4× nonlinear processing; **Economy** uses 2×. Their overload
and high-frequency details can differ, while both retain the same controls.

## GALLEY integration

SUNDAY can occupy a track, return or master insert. For live playing, select a
clean interface input and enable GALLEY’s existing monitoring on the intended
track. Recorded microphone/interface takes remain editable source audio so the
amp can be changed later. Numeric controls support drawn automation and global
LFO targets. Projects, Undo, WAV export and reversible track freezing retain the
chosen model and complete settings.

Use another GALLEY effect before or after SUNDAY for a pedal or studio chain.
Keep the input clean while comparing the five formulations, then add the rest
of the chain deliberately. Existing BROILER projects and its pedalboard retain
their previous processing.

## Sources and what was verified

These references informed the circuit topology and operating choices. The code,
cabinet interpretation and recipes are original; the references are not a
measurement or endorsement of SUNDAY.

- [Fender ’65 Deluxe Reverb product specifications](https://www.fender.com/products/65-deluxe-reverb):
  22 watts, two channels/four inputs, one 12-inch Jensen C12K speaker, 6V6 power
  valves, 12AX7/12AT7 small-signal valves and a 5AR4 rectifier.
- [Fender owner’s manual, revision C](https://www.fmicassets.com/Damroot/Original/10001/021740_gamp_manual_all_revC.pdf),
  English front-panel notes and specifications: Input 2 is −6 dB; reverb and
  tremolo affect the Vibrato channel; the original controls have no Mid or
  Master Volume knob. Input 1 is specified as 1 MΩ and Input 2 as 136 kΩ.
- [Original Fender Deluxe Reverb AB763 schematic, mirrored by Schematic Heaven](https://schematicheaven.net/fenderamps/deluxe_reverb_ab763_schem.pdf):
  visually checked for the 100 kΩ slope resistor, 250 pF treble cap, 0.1 µF bass
  cap, 0.047 µF mid cap, fixed 6.8 kΩ mid leg, 250 kΩ Treble/Bass controls,
  1 MΩ Volume control and Vibrato-channel 47 pF bright cap. The drawing also
  shows the 12AT7 phase inverter, fixed-bias 6V6GT pair, GZ34 rectifier and
  820 Ω/47 Ω negative-feedback network. Supply voltages are nominal schematic
  annotations, not a calibration for every vintage or reissue amplifier.
- [Rob Robinette’s AB763 model comparison](https://robrobinette.com/AB763_Model_Differences.htm)
  and [AB763 circuit modifications](https://robrobinette.com/AB763_Modifications.htm):
  annotated signal paths, the additional reverb-channel recovery stage, fixed
  mid/bright-cap behavior, negative feedback and model-family distinctions.
- [Valve Wizard’s AC-coupled long-tail-pair discussion](https://www.valvewizard.co.uk/acltp.html):
  differential phase-inverter operation, balance and the role of a 12AT7-style
  driver before the output pair.

The schematic’s tone network is interactive: the Treble pot’s lower terminal
joins the bass-cap/top-of-bass node; the Bass rheostat then reaches the fixed-mid
ground leg. It is not a stack of unrelated gain knobs. No external commercial
amp captures, impulse responses or proprietary DSP models are bundled.

## CPU and larger sessions

High uses fourfold nonlinear processing; Economy uses twofold processing. The
five formulations have different costs, with the iterative load-line method
usually heavier. The dynamics controls and fixed comparison trim work in both
quality modes. Bypassed, zero-Blend and fully silent instances suspend the amp
work after their short transitions/tails.

Use the CPU inspector to judge a particular session on your device. Many active
amp instances can exceed a real-time audio budget; ten simultaneous instances
did so on the limited native test runner. Economy and reversible track freezing
are available for larger arrangements. Benchmark numbers are machine-specific
and do not guarantee browser performance.
