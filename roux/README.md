# ROUX

ROUX is Kitchen’s monophonic bass instrument. Its circular recipe moves through a scale rather than storing an independent pitch at every step. A deep fundamental, harmonic oscillator, and tuned resonant waveguide make the sound; independent accent and slide cycles keep the recipe moving.

Open `index.html` in a browser. It is a complete standalone HTML application with inline fonts, styles, synthesis, presets, and sharing adapters. Audio starts after a click or key press. Chrome, Edge, Firefox, and Safari support the instrument; Web MIDI additionally requires browser support and permission. On iPhone, enable sound with the phone’s silent switch.

## Sequence

Sixteen circular stops each choose Move, Root, Hold, or Rest. Movement changes the previous pitch by scale degrees; Root returns to the circuit’s home note, Hold extends the previous note, and Rest creates space. Stops have octave offset, velocity, gate, probability, accent, and slide. Recipe length, division, direction, stride, starting rotation, global gate, swing, and circuit drift shape traversal.

Accent and slide have independent Euclidean pulse cycles. Their lengths, pulse counts, and rotations create changing intersections with the pitch recipe. Circuit drift transposes each turn by scale degrees. The complete four-turn phrase repeats, and the seed makes probability reproducible between playback and rendering. Shared Patterns exports either the complete four-turn phrase or a single turn as exact notes.

## Synthesis

A harmonic oscillator and excitation transient feed a tuned feedback delay. Copper, iron, ceramic, and rubber change the vessel’s character. Sub level, oscillator level, vessel mix, body decay, damping, tuning, excitation, and bite shape the foundation. Wavefold and drive shape the mixed signal and add harmonics; a resonant low-pass, band-pass, or high-pass filter follows.

Amplitude and filter have independent ADSR envelopes. Filter-envelope depth is measured in octaves. Pitch envelope, glide, legato, and a free or synchronized LFO provide motion. The LFO targets cutoff, vessel mix, pitch, drive, or pulse width. Output, stereo width, and tempo-synchronized echo complete the patch. The actual synthesis code is reused for live sound, WAV export, and GALLEY note printing.

## Keep and share

Save recipe downloads the complete patch and recipe as `.roux.json`. Open restores it. Current state is stored under the stable `roux-project-v1` browser storage key. Undo and Redo restore musical edits. Export WAV renders a fresh stereo 48 kHz file, including the decay tail, without changing playback. Samples shares a rendered recipe or selected bass note through the shared pantry; Patterns shares exact notes through the order book.

Imported patterns remain exact and are saved with the patch. Sound controls and tempo changes preserve the imported pattern. Editing a native recipe parameter, or choosing Use native recipe, returns to the circular recipe. Undo can restore the imported pattern.

GALLEY hosts ROUX as an instrument, with full patch snapshots, note scheduling, shared transport, reversible note printing, and sample/pattern sharing. ROUX supports one pitched bass voice; overlapping imported notes are handled with monophonic last-note priority.

## Keys

- Space: Play / Stop. Escape: Panic.
- A S D F G H J K: audition scale notes.
- Ctrl / Command Z: Undo. Ctrl / Command Shift Z: Redo.
- Arrow keys on a circular stop: move selection.
- Arrow keys on sound tabs: move between pages.
- Connect MIDI: attached MIDI notes; CC 74 controls cutoff.

Typing in a control leaves musical shortcuts alone. Stop ends sequencing; Return to beginning resets the phrase and restarts if playing. Panic clears sound and echo immediately.

## Build

From the repository root, run `python3 roux/build.py`. The build writes `roux/index.html` and `music/roux/ROUX-source.zip`, bundling the shared Kitchen theme, offline font, sample exchange, and pattern adapter. Run `python3 loom/build.py` after native instrument builds and `npm run music:sync` to refresh the embedded instrument and published site copies.

The source archive includes the shared modules needed to reproduce the standalone instrument. Generated files are committed for direct browser use and GitHub Pages.

After extracting `ROUX-source.zip`, open a terminal inside `ROUX-source` and run `python3 build.py`. Open the resulting `index.html`. This build needs Python 3 and no package installation.

Run `node engine-checks.cjs` inside the extracted source folder for actual synthesis, tuning, safety, cancellation, and deterministic WAV checks. Browser integration checks use `node browser-checks.cjs` after building and require Playwright and Chromium; `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can select installed copies. `ROUX_QA_URL` optionally checks a published instrument, and `ROUX_QA_ARTIFACTS` saves responsive screenshots.
