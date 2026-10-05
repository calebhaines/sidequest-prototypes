# RAVEL

A stereo sample instrument for slicing sounds into rhythmic phrases.

Live: https://calebhaines.github.io/sidequest-prototypes/music/ravel/

Open `index.html` in a modern browser and press Play. All code, fonts, artwork
and built-in sounds are embedded. No dependency installation or connection is
needed to play the standalone HTML.

## Playing

Press Play to hear a built-in clip sequenced as a groove, or trigger its
sixteen slice pads by keyboard or touch. Import your own audio or explicitly
enable microphone capture. The first twenty seconds become the source clip.
Edit slice boundaries and sequence slice choices, velocity, probability,
ratchets, pitch, reverse and gate in four sixteen-step patterns. Eight studies
are included.

The master effects and performance controls let you shape a live performance.
Panic stops sound and cancels pending audio actions. Undo restores earlier
edits. Save project downloads the complete instrument state; Open project
restores it. Browser storage is optional: a project download remains available
when storage is denied or full.

Export WAV renders the current settings as 48 kHz, 16-bit stereo audio.
Record output captures a live performance, including manual gestures; live
recording is limited to three minutes. Help explains the controls and keyboard
shortcuts and includes HTML and editable source downloads.

Imported and recorded clips are stored as portable 16-bit PCM inside projects.
Microphone capture is optional and requires browser permission; browser support
for a local HTML file may differ from the hosted version. Panic releases live
microphone tracks and discards an unfinished sample capture.

## Source and build

`app.html`, `styles.css` and `app.js` define the interface. `schema.js` bounds
controls and validates project files; `presets.js` contains eight studies.
`audio-engine.js` shares the synthesis engine between AudioWorklet playback,
a ScriptProcessor fallback and offline WAV rendering.

Run `python3 ravel/build.py` from the repository root to generate
`ravel/index.html` and `music/ravel/RAVEL-source.zip`. Run `npm run build`
to refresh the Music Lab copies in `public/` and `docs/`. GitHub Pages publishes
`docs/`.

From an extracted source archive, run `python3 build.py` in its directory.
The standalone HTML is generated beside the source; no external packages are
needed. The archive includes the fonts and their license.

Bundled Noto font subsets are copyright Google and licensed under the SIL
Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.
