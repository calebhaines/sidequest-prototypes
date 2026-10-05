# SKEWER

A generative instrument built from four modeled string lanes.

Live: https://calebhaines.github.io/sidequest-prototypes/music/bower/

Open `index.html` in a modern browser and press Play. All code, fonts, artwork
and built-in sounds are embedded. No dependency installation or connection is
needed to play the standalone HTML.

## Playing

Press Play to run a pattern, or pluck and strum the strings yourself.
Each lane has sixteen visible steps and its own pattern length, clock division
and direction. Shape step notes, velocity and probability; generate Euclidean
rhythms and choose a scale. Pluck position, damping, brightness, dispersion and
body controls change the physical string model. Seven playable recipes and an
empty station are included.

The master effects and performance controls let you shape a live performance.
Panic stops sound and cancels pending audio actions. Undo restores earlier
edits. Save score downloads the complete instrument state; Open
restores it. Browser storage is optional: a project download remains available
when storage is denied or full.

Export WAV renders the current settings as 48 kHz, 16-bit stereo audio.
Capture mix records a live performance, including manual gestures; live
recording is limited to three minutes. Operating notes explain the controls and keyboard
shortcuts and includes HTML and editable source downloads.

## Sharing samples

The Samples panel shares all string patterns or the selected string pattern with other Kilter Kitchen apps. Render one to sixteen bars with a configurable effect tail. The selected string can be shared even if it is muted in the mix. The offline render preserves the current score, random seed, and sound settings; live playback continues unchanged. Finish a live capture before sharing a render.

`BowerApp.exportAudio({scope, bars, tailSeconds, signal})` returns an audio payload without starting a download. `BowerApp.audioExport` describes the available scopes. SKEWER's strings remain physically modeled rather than sample-based.

## Source and build

`app.html`, `styles.css` and `app.js` define the interface. `schema.js` bounds
controls and validates project files; `presets.js` contains eight recipes.
`audio-engine.js` shares the synthesis engine between AudioWorklet playback,
a ScriptProcessor fallback and offline WAV rendering.

Run `python3 bower/build.py` from the repository root to generate
`bower/index.html` and `music/bower/BOWER-source.zip`. Run `npm run build`
to refresh the Kilter Kitchen copies in `public/` and `docs/`. GitHub Pages publishes
`docs/`.

From an extracted source archive, run `python3 build.py` in its directory.
The standalone HTML is generated beside the source; no external packages are
needed. The archive includes the fonts and their license.

Bundled Noto font subsets are copyright Google and licensed under the SIL
Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.

## Compatibility

The Kilter Kitchen name is a presentation change. Existing app URLs, project formats, native APIs, storage keys, and source identifiers remain compatible. Earlier BOWER projects continue to open. Source archives keep their existing URL names.
