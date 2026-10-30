# PRESERVE · tape machines

PRESERVE adds tape colour to an individual track, either return, or the master.
It also appears in the two GALLEY inserts on each percussion voice. All audio
processing runs locally; no impulse responses, recordings or online services
are required.

## Start here

Choose **Fresh stock** for a steady studio machine, **Fifteen-IPS glue** for
firmer peak rounding, or **Cassette lunch** for a smaller, moving sound. A recipe
loads the complete setup. Changing the machine, speed or stock preserves the
other knobs.

The five face knobs cover the common decisions:

- **Drive** records hotter into the tape stage.
- **Warmth** changes magnetic softening and compression.
- **Wear** adds oxide age and high-frequency loss. It works independently of
  wow and flutter; turning it does not secretly enable transport delay.
- **Output** sets the final wet level.
- **Blend** combines the original tone and tape colour. At zero, the original
  signal passes through exactly.

Drive compensation starts on. It removes the nominal extra Drive gain, so a
hotter tape recording is easier to compare against the original. It does not
measure or match perceived loudness. Input and Output remain deliberate gain
controls.

## Four machine characters

| Machine | Useful character |
| --- | --- |
| Studio two-track | Open reel-machine response, generous headroom and restrained magnetic memory; a starting point for mix and drum buses. |
| Valve reel | Softer recording electronics, asymmetric harmonics and a slower recovery; rounded bass, voices and exposed instruments. |
| Quarter-track home | Lower overload headroom and a more intimate domestic-reel bandwidth. |
| Compact cassette | Earlier overload, a softer high end and stronger head loss; start at 1⅞ ips for a familiar cassette character. |

The machines are reduced-order musical interpretations of tape and recording
electronics. They are not measured copies of particular recorders. Machine,
speed and stock are independent, so unusual combinations are available as
sound-design choices.

## Speed, stock and calibration

The five tape speeds are **30, 15, 7½, 3¾ and 1⅞ inches per second**. Speed changes
the head response, low-frequency bump and available high-frequency bandwidth;
it does not change the song tempo or transpose the recording. Higher speeds
generally sound more open; lower speeds bring more low-frequency colour and
head loss.

**Classic oxide**, **High-output stock** and **Low-noise stock** change the tape
stage's overload and spectral character. They are broad tape-stock families.
They do not silently turn on an added noise generator.

Open **Calibration & head response** for Input trim, Bias, Record calibration,
Head bump, Low trim, High trim and Drive compensation. Positive calibration
sets a hotter overload reference; its nominal level change is compensated so
it shapes colour rather than adding a second linear gain knob. Bias moves
between under- and over-bias character. Head bump adjusts the speed-dependent
low-frequency rise. The playback trims provide additional finishing tone.

## Motion, age and noise

Open **Transport & dropouts** for separate Wow depth/rate, Flutter depth/rate
and Dropouts. Depth is an actual percentage of speed deviation. Wow is slow
wander; flutter is faster modulation. Dropouts are smoothed occasional losses,
rather than hard cuts.

Wow and flutter both start at zero, with no added transport delay. When either
is enabled, the original-tone reference and tape-colour signal follow the same
moving read head before blending. Motion therefore moves the whole blend
while keeping its internal colour blend coherent; at Blend zero or Bypass the
untouched signal passes through. Parallel sends with motion can add an
intentional moving double against the direct track.

Open **Noise & stereo alignment** for Tape hiss, Head alignment, Channel
crosstalk and Transport link. Hiss follows the signal and fades with it. Link
at 100% keeps the channels' transport motion together; lower settings loosen
the image. Head alignment adds opposite channel character, while crosstalk
introduces a small leak between channels. Hiss, dropouts, alignment error and
crosstalk start at zero.

## Readings and automation

Input, Record in and Output display measured audio levels. Record in is the
driven recording-stage level before magnetic softening. Softening reports the
stage's measured compression; Transport reports the active read-head delay.
Meters show no invented motion when the rack is idle or bypassed.

All numeric controls can be automated using GALLEY's normal lanes and SERVICE
mapping. The machine, speed, stock and compensation choices are saved with the
effect. Knob gestures, numeric edits, recipes, Reset, replacement and removal
participate in Undo. Projects retain all four insert slots on each owner.

## Source and verification

The effect is self-contained in `tape-catalog.js`, `tape-dsp.js`, the GALLEY
effect routing, and the tape panel in `app.js`/`tape.css`. The same DSP factory
runs in live AudioWorklet processing, fallback processing, offline WAV renders
and the shared percussion racks. `npm run check:tape` exercises portable
projects, signal processing and integration; `npm run check:tape-browser`
exercises the actual browser implementation.

The nonlinear recording path uses four-times oversampling, with record emphasis
and inverse reproduction around a stateful magnetic softening stage. The head
response and transport remain causal. Signal checks cover harmonic generation,
folded harmonics under hard drive, machine/stock/speed response, independent
stereo, smoothed control changes, finite tails and exact settled dry output.
Blend-zero and Bypass transitions use a short fade to the original signal;
re-enabling cannot replay stale tape history.
