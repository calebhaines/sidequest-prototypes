# BRINE

Kitchen’s six-voice Juno-inspired synthesizer. Stable DCO pitch, an analog-style
OTA filter and a stereo bucket-brigade chorus, implemented in original DSP.
The Juno-60 is the main reference; a 106 family option changes the documented
HPF/PWM/envelope behavior. See [hardware research and modeling limits](RESEARCH.md).

Live: https://calebhaines.github.io/sidequest-prototypes/music/brine/

## Play and shape

Choose one of 40 original recipes, then play the keyboard, computer keys or MIDI.
BRINE has six synthesis voices. More than six simultaneous notes borrow an older
voice. The DCO is intentionally pitch-stable: analog variation comes from the
waveform, filter, envelope, gain and chorus circuits rather than independent VCO
drift. Z / X change keyboard octave; Escape performs Panic.

Drag a slider or use its arrow keys. Shift gives fine adjustment; exact values
can be typed below each slider. Double-click or Enter restores its default.
A complete gesture is one Undo. Save/Open retains the entire sound and written
phrase. A / B compares sound snapshots while retaining the phrase, tempo,
physical LFO lever and keyboard-arpeggiator settings. Browser recovery is used
when local storage is available.

Saw and pulse switches combine; the switchable sub oscillator is divided one
octave below the DCO. The PWM source selects Manual, LFO or Envelope on the 60
family. The 106 family provides Manual and LFO. Sub and noise levels mix into the
voice’s resonant 24 dB/octave low-pass filter.

There is one ADSR envelope per voice. It controls the filter through its positive
or negative polarity and amount, and controls the VCA in Envelope mode. Gate mode
uses a short amplitude gate while leaving the ADSR available for filter movement.
The shared main LFO has rate, delay and Auto/Manual triggering. The physical
LFO lever and momentary trigger are separate from the stored modulation amount.

In both voicing families, the HPF has four positions, despite the slider shape. The HPF follows
the six summed VCAs and precedes the chorus. Position 0 is flat in the 60 family;
the 106 family adds bass emphasis at 0 and is flat at 1.

Chorus I and II offer their distinct clocked stereo movement; the 60 family also
provides the shallower I+II setting. The two wet
paths use opposite clock modulation and mix with the dry signal. Inside the jar
exposes analog variation, BBD noise, input drive and stereo width, plus clearly
optional velocity response and glide. Noise can be set to zero for clean renders.

## Keyboard arpeggiator and written phrases

The Keyboard arpeggiator plays held computer, touch or MIDI notes in Up, Down or
Up/Down order, across one to three octaves. Its free rate covers approximately
1.5–50 notes per second. Hold keeps the keyboard part sounding after key release;
turn Hold off or use Panic to clear it. The original Juno-60 has no portamento;
BRINE’s glide is a labeled modern convenience.

The written phrase is an independent, exact note sequence. It and incoming GALLEY
piano-roll notes bypass the Keyboard arpeggiator. This keeps editable notes and
prints at the times and lengths shown. Open The phrase to draw chords or notes,
move them, resize the right edge, and type exact start, length, pitch or velocity.
Up to 64 bars and 4,096 notes are supported.

Samples renders the written phrase, one note or a chord through the actual DSP.
The note/chord scopes follow Keyboard arpeggiator settings; the phrase scope
renders the written notes directly. Download WAV or save audio to Kitchen’s shared
sample library. Patterns exchanges the exact written notes with other instruments
and GALLEY. The studio embeds the full instrument for offline use and supports
native notes and revisable printed audio at 48 kHz, independently of parent rate.

Direct WAV exports choose a natural release/chorus tail when omitted; the Samples
panel exposes it explicitly, including zero. Each render is limited to 120 seconds
including its tail. Long, slow 64-bar phrases may need shorter sections. Live
playback and offline exports share the same synthesis and sample-frame scheduler.

## Accuracy and resources

[RESEARCH.md](RESEARCH.md) cites original owner/service manuals, circuit references
and component information, and separates established hardware facts from numerical
approximations. No physical unit was available for calibration. This is an original
software model, with no claim of measured equivalence to an individual Juno.
No commercial emulation code, factory ROM, patch banks, sampled presets, manual
scans or manufacturer artwork is included. Juno and Roland identify the reference
instruments; BRINE is an independent Kitchen project.

Synthesis has six fixed voices, bounded queues and held-note/controller maps,
demand-only meters and explicit Worklet disposal when permanently unloaded.
Standalone audio requests 48 kHz; GALLEY keeps its selected parent sample rate.
No automatic voice-dependent quality reduction is used. CPU and spectral checks
describe their tested host and assumptions, rather than a minimum-device promise.

## Build and verify

Python 3’s standard library is sufficient:

```sh
python3 build.py
```

The complete offline `index.html` embeds scripts, styles, fonts and exchange code.
In the repository the build also writes `music/brine/BRINE-source.zip`. An extracted
source archive can rebuild with:

```sh
python3 build.py --output BRINE.html --archive source.zip
```

From the repository root:

```sh
npm run check:brine
npm run check:brine-browser
python3 brine/build.py
python3 loom/build.py
npm run build
```

Acceptance covers analytic tuning/harmonics/filter response, stereo chorus behavior,
voice allocation, controller ownership, sample scheduling, WAV parity, the actual
serialized Worklet and fallback, UI/MIDI, mobile layouts and GALLEY integration.
Source archives use stable timestamps and include the shared dependencies.
