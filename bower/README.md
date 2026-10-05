# BOWER

A generative instrument built from four modeled string lanes.

Live: https://calebhaines.github.io/sidequest-prototypes/music/bower/

Open `index.html` in a modern browser and press Play. All code, fonts, artwork
and built-in sounds are embedded. No dependency installation or connection is
needed to play the standalone HTML.

## Playing

Press Play to grow a pattern, or pluck and strum the strings yourself.
Each lane has sixteen visible steps and its own pattern length, clock division
and direction. Shape step notes, velocity and probability; generate Euclidean
rhythms and choose a scale. Pluck position, damping, brightness, dispersion and
body controls change the physical string model. Seven playable studies and an
empty plot are included.

The master effects and performance controls let you shape a live performance.
Panic stops sound and cancels pending audio actions. Undo restores earlier
edits. Save score downloads the complete instrument state; Open
restores it. Browser storage is optional: a project download remains available
when storage is denied or full.

Export WAV renders the current settings as 48 kHz, 16-bit stereo audio.
Capture mix records a live performance, including manual gestures; live
recording is limited to three minutes. Field notes explain the controls and keyboard
shortcuts and includes HTML and editable source downloads.

## Source and build

`app.html`, `styles.css` and `app.js` define the interface. `schema.js` bounds
controls and validates project files; `presets.js` contains eight studies.
`audio-engine.js` shares the synthesis engine between AudioWorklet playback,
a ScriptProcessor fallback and offline WAV rendering.

Run `python3 bower/build.py` from the repository root to generate
`bower/index.html` and `music/bower/BOWER-source.zip`. Run `npm run build`
to refresh the Music Lab copies in `public/` and `docs/`. GitHub Pages publishes
`docs/`.

From an extracted source archive, run `python3 build.py` in its directory.
The standalone HTML is generated beside the source; no external packages are
needed. The archive includes the fonts and their license.

Bundled Noto font subsets are copyright Google and licensed under the SIL
Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.
