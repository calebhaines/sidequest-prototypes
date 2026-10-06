# STEAM

An additive instrument for painting sound in time and pitch.

A Kitchen instrument. The previous app identity is preserved in project
formats, browser storage, source APIs and URLs so existing work opens unchanged.

Live: https://calebhaines.github.io/sidequest-prototypes/music/haze/

Open `index.html` in a modern browser and press Play. All code, fonts, artwork
and built-in sounds are embedded. No dependency installation or connection is
needed to play the standalone HTML.

## Playing

The 1.0.1 drawing desk keeps the full score first. Detail view enlarges eight
columns and eight bands for touch; its Time and Pitch menus reach the complete
score without changing playback or saved data. Selected cells show their actual
note and frequency. The precise cell editor opens on small screens. Sound recipe
contains all existing tuning, synthesis, envelope and space controls; output and
export remain immediately available. This is a presentation update: all sounds,
factory studies, project formats and defaults are unchanged.


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

## Samples between instruments

The shared Samples panel can publish the current score as stereo WAV or analyze
audio from the other Kitchen apps. Imported audio becomes an editable 32-column,
24-band spectral score using the current root, scale and harmonic stretch. STEAM
continues to synthesize its own additive sound; analysis is a creative translation
of the sample, rather than exact sample playback. Existing envelopes, effects,
tempo and score length stay in place. Confirm replacement when the score already
contains notes; Undo restores the previous score, and project files save the new
painted notes normally.

Analysis accepts complete stereo Float32 PCM up to 20 seconds and uses mono
spectral energy, with an anti-phase fallback for stereo material that would cancel
when mixed. Trim longer recordings before import. Changes to the score or tuning,
project loads, Panic and cancellation discard an unfinished analysis. Shared
exports use a stable snapshot of the current sound, default to one bar without a
tail, and support cancellation without affecting playback.

## Source and build

`app.html`, `styles.css` and `app.js` define the interface. `schema.js` bounds
controls and validates project files; `presets.js` contains eight studies.
`audio-engine.js` shares the synthesis engine between AudioWorklet playback,
a ScriptProcessor fallback and offline WAV rendering.

Run `python3 haze/build.py` from the repository root to generate
`haze/index.html` and `music/haze/HAZE-source.zip`. Run `npm run build`
to refresh the Kitchen copies in `public/` and `docs/`. GitHub Pages publishes
`docs/`.

From an extracted source archive, run `python3 build.py` in its directory.
The standalone HTML is generated beside the source; no external packages are
needed. The archive includes the fonts and their license.

Bundled Noto font subsets are copyright Google and licensed under the SIL
Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.
