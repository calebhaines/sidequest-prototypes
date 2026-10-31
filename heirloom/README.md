# HEIRLOOM

Kitchen’s five-voice Prophet-5 inspired synthesizer. An original implementation
informed by Sequential’s manuals and the original SCI service documentation.

Live: https://calebhaines.github.io/sidequest-prototypes/music/heirloom/

## Play

Choose one of 40 original recipes, then use the keyboard, computer keys or
Connect MIDI. The five lamps show the five synthesis voices. A sixth simultaneous
note borrows an older voice. Z / X move the computer keyboard by an octave;
Space plays the phrase and Escape performs Panic. MIDI supports notes, velocity,
pitch bend, sustain and the modulation wheel. Velocity response defaults to zero,
as on the original instrument; enable the modern extension inside the cabinet.

Turn a knob by dragging vertically, use its arrow keys, or type a precise value
underneath. Shift gives fine dragging. Double-click or Enter restores its default.
Each gesture is one Undo. A / B compares sound snapshots while retaining the
phrase, tempo and physical modulation-wheel position. Copy moves the sound into
the other comparison slot. Save recipe writes the entire project; Open restores
it. Browser recovery is used when storage permits.

## Follow the signal

Each of five voices contains independent oscillator A and B, their mixer, a
resonant four-pole low-pass filter and an amplifier. Separate ADSR contours control
the filter and amplifier. The output is mono, duplicated into the stereo file;
add stereo effects in GALLEY.

Oscillator A combines saw and pulse. Oscillator B combines saw, triangle and pulse;
waveform switches are independent, rather than a one-wave selector. B has fine
tuning, low-frequency and keyboard switches. Sync makes B the master and resets A,
even if B’s mixer level is zero or its audible waveform switches are off.

Poly-Mod adds the filter contour and oscillator B, sending them to A frequency,
A pulse width and/or filter cutoff. The frequency path is exponential pitch-CV
modulation. Its B source precedes the mixer. The shared LFO and pink modulation
noise form Wheel Mod; choose its destinations, then raise the physical MOD wheel.
Initial Amount is a Rev4-style addition allowing movement with the wheel down.
Audio-mixer noise is white. There is one shared LFO, rather than one per voice.

Choose the Rev 1 / 2 SSM-family or Rev 3 CEM-family filter. Resonance can reach
self-oscillation. Keyboard tracking selects off, half or full. Attack, decay and
release cover approximately 1 ms to 30 seconds; the knob midpoint is around half
a second. Release begins at the contour’s current level when a key is released.

Inside the cabinet exposes vintage variation, fine calibration and modern
extensions. Classic LFO range is approximately 0.04–20 Hz; Wide selects the modern
0.022–500 Hz range. Classic glide applies to unison; Poly glide enables the modern
polyphonic alternative. Unison voice count and detune are optional conveniences.
Master tuning, physical pitch/mod wheels and release enable remain performance
controls. No quality reduction is triggered by the number of sounding voices.

## Write and share

Open The phrase to add notes. Drag empty space to draw a length, move a note to
change its start or pitch, and pull its right edge to resize it. Exact note start,
length, velocity and pitch appear below. Chords and mixed note lengths are
supported. Choose up to 64 bars; long imported phrases retain their lengths.

Samples renders the phrase, one note or a chord through the actual synthesis
engine, then downloads WAV or saves it to Kitchen’s shared sample library.
Patterns exchanges editable notes with Kitchen. GALLEY embeds the complete
instrument and can schedule notes directly or make revisable printed audio. Live
and offline paths use the same DSP and sample-frame note scheduling.

## Accuracy and sources

See [RESEARCH.md](RESEARCH.md) for primary sources, page references, original versus
modern features, numerical modeling choices and known limits. This is an original
software interpretation of the architecture. No physical unit was available for
calibration and no measured hardware null-test is claimed. Published signal flow
is better established than individual unit tolerances, control-depth conversions
and the exact nonlinear transfer curves. Those choices are disclosed rather than
presented as manufacturer specifications. No commercial emulation code, factory
ROM, sampled patches or vendor demo audio is included. Prophet and Prophet-5 are
names used to identify the reference instrument; this project is independent of
Sequential.

## Build and check

Python 3’s standard library is sufficient:

```sh
python3 build.py
```

The resulting `index.html` contains all scripts, fonts, styles and shared exchange
code. Its normal standalone operation requires no network. In a repository
checkout the build also creates `music/heirloom/HEIRLOOM-source.zip`; an extracted
source archive can use `python3 build.py --output HEIRLOOM.html --archive source.zip`.
The archive has stable timestamps and includes the complete original source and
shared dependencies. No downloaded research documents are needed to build.

From the repository root:

```sh
npm run check:heirloom
npm run check:heirloom-browser
python3 loom/build.py
npm run build
```

The checks cover project/preset invariants, synthesis and voice behavior, scheduler
and WAV timing, real browser audio paths, UI editing and GALLEY integration. Timing
measurements describe the tested browser/host and are not a minimum-device promise.
Individual WAV renders are limited to 120 seconds including their release tail;
split longer phrases into sections. At high host sample rates the deepest five-voice modulation can be expensive;
48 kHz and GALLEY Print are practical choices for dense sessions. See the measured
[processing budget](RESEARCH.md#processing-budget-measurements). The runtime has fixed five-voice synthesis,
bounded scheduling queues, demand-only
meter reports and explicit teardown for a permanently unloaded instrument.
