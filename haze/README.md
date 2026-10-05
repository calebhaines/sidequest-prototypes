# HAZE

An additive instrument for painting sound in time and pitch.

Live: https://calebhaines.github.io/sidequest-prototypes/music/haze/

Open `index.html` in a modern browser and press Play. All code, fonts, artwork
and built-in sounds are embedded. No dependency installation or connection is
needed to play the standalone HTML.

## Playing

Paint the score and press Play. Its 32 columns form a repeating timeline;
24 pitch bands feed a bank of up to 48 sine partials. Brush intensity controls
amplitude. Choose a scale and root, then shape harmonic stretch, envelopes,
blur, drift, tone and stereo spread. Reverse or ping-pong the scan, or freeze
it to sustain a spectral cloud. Seven playable studies and a blank canvas are
included.

The master effects and performance controls let you shape a live performance.
Panic stops sound and cancels pending audio actions. Undo restores earlier
edits. Save project downloads the complete instrument state; Open project
restores it. Browser storage is optional: a project download remains available
when storage is denied or full.

Export WAV renders the current settings as 48 kHz, 16-bit stereo audio.
Record output captures a live performance, including manual gestures; live
recording is limited to three minutes. Help explains the controls and keyboard
shortcuts and includes HTML and editable source downloads.

## Source and build

`app.html`, `styles.css` and `app.js` define the interface. `schema.js` bounds
controls and validates project files; `presets.js` contains eight studies.
`audio-engine.js` shares the synthesis engine between AudioWorklet playback,
a ScriptProcessor fallback and offline WAV rendering.

Run `python3 haze/build.py` from the repository root to generate
`haze/index.html` and `music/haze/HAZE-source.zip`. Run `npm run build`
to refresh the Music Lab copies in `public/` and `docs/`. GitHub Pages publishes
`docs/`.

From an extracted source archive, run `python3 build.py` in its directory.
The standalone HTML is generated beside the source; no external packages are
needed. The archive includes the fonts and their license.

Bundled Noto font subsets are copyright Google and licensed under the SIL
Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.
