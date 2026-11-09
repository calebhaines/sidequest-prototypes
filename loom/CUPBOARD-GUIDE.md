# CUPBOARD · cabinet, body and microphone stage

CUPBOARD provides twenty original cabinet/body impulse responses and up to four
independent microphone interpretations. Start with one microphone; select another
mic channel and turn it on when you want to blend a second perspective. Everything
is embedded in GALLEY and works offline.

## Start here

1. Add **CUPBOARD** after your amplifier or pedal chain. When an amp already
   includes a cabinet, select its **DI / external cabinet** option to let
   CUPBOARD provide the cabinet stage.
2. Choose a cabinet, unusual speaker or resonant body. Changing the model keeps
   your microphone arrangement; a complete recipe replaces the whole setup.
3. Select a microphone channel. Choose its microphone type and drag its marker.
4. Use **Top** view for position across the source and distance in front of it.
   Use **Face** view for position across and above the source. The selected
   microphone’s knobs and exact values provide the same three coordinates.
5. Set its bearing, level and pan. Turn on another mic to blend perspectives,
   or Solo one while finding its position.

The stage markers support keyboard positioning. Exact number fields and the
knobs remain available when precise positions or touch-friendly edits are easier.
Only the selected microphone’s detailed controls are shown.

## Twenty sources

| Family | Models |
| --- | --- |
| Guitar and bass cabinets | Open one-twelve; Small tweed ten; British two-twelve; British four-twelve; Modern four-twelve; Ported four-ten; Sealed eight-ten; Deep one-fifteen |
| Unusual speakers | Rotary enclosure at a fixed orientation; Table radio; Public address; Folded horn; Charged panel; Submerged driver |
| Resonant bodies | Guitar soundbox; Violin body; Cello body; Piano soundboard; Bronze mixing bowl; Wooden crate |

These are original generated responses with distinct resonances, bandwidths and
reflection structures. They are useful both as cabinet stages and as creative
coloration for drums, voices and synthesizers. The body models add the response
of a resonator to the source you feed them.

## Microphones and position

Ten families cover 57-, 421- and RE20-style dynamics, 121- and 160-style ribbons,
87- and 414-style large condensers, a 184-style pencil condenser, an omnidirectional
measurement microphone and a contact pickup. Manufacturer-family references and
the acoustic modeling basis are listed in [the research notes](CUPBOARD-REFERENCES.md).

Distance, lateral position, height and bearing affect the sound. The microphones
have different transducer voicings, directionality and proximity behavior. The
121-style ribbon has a figure-eight pattern; the 160-style ribbon uses a
hypercardioid pattern. Omni pickup has no ordinary pressure-gradient proximity
boost. Contact pickup uses the body surface, so its placement is edited in Face
view rather than as an air microphone.

**Natural arrival** retains the microphones’ travel-time differences. Those
differences produce comb filtering when the signals combine. **Aligned arrival**
removes their relative propagation offset while retaining each microphone’s
tonal response. **Polarity** reverses a channel’s sign; it is a separate control
from arrival alignment. Use Solo to compare channels before blending them.

Microphone levels add together. Output trim sets the finished level; there is no
automatic gain riding or hidden compressor. **Mono** feeds one summed source;
**Stereo** retains both source channels through the response. Low cut, High cut
and Room reflections are in the finishing fold.

## Projects, automation and resources

Every microphone setting is stored in projects and presets. Numeric position,
bearing, level, pan and finishing controls can receive automation and LFO routes.
The same processor runs in live playback, WAV exports, group stems and track
freeze. Frozen tracks retain their complete editable CUPBOARD settings for thaw.

The body response uses streaming convolution, shared by the microphone paths.
Moving microphones updates their pickup/filter/delay paths without regenerating
the cabinet IR. Disabled microphone channels do no pickup processing. Only the
selected source model is prepared; parameter transitions are smoothed. During
playback, a new response is prepared in small pieces while the previous response
continues, then fades in. The stage briefly shows “Preparing response…” during
that transition.

Run `npm run check:cabinet` and `npm run check:cabinet-browser` from the repository.
The equivalent `cabinet-*-checks.cjs` files are included in the editable source
download. The browser checks need Playwright and Chromium.
