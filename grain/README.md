# SIZZLE.

A self-contained, noise-powered drum machine with a compact commercial kitchen inspired dark interface.

**Double-click `index.html` to open it in a modern browser, then press Play.** It works offline. No installation, server, account, external fonts, libraries, or samples are needed. All sound is synthesized in the browser.

- Eight individually editable voices and a 16/32-step sequencer, four pattern banks, compact pattern chaining, and per-step sound overrides.
- Twelve sources: white, pink, brown, blue, violet, grey, velvet, crackle, metallic, digital, dust, and radio noise.
- The original six curated grooves, four additional specialist noise kits (Prep surface, Short-order static, Radio misdemeanour, and Crumb counter), four pattern banks, swing, accents, mute, solo, randomization, and undo.
- Separate BODY and NOISE layer levels, voice level, and stereo pan.
- Drum-body oscillator waveform, fundamental, harmonics, detune, pitch sweep, sweep time, and its own attack/hold/decay envelope.
- Noise playback speed, four filter types, cutoff, resonance, filter sweep, saturation, burst count/gap, and an independent envelope.
- Sine, triangle, square, sawtooth, and sample-and-hold modulation for noise cutoff, amplitude, pitch, or voice pan; free rate or tempo-synced divisions.
- Exponential or linear envelope curves, visual envelope/LFO displays, section reset, and physical-unit parameter values.
- Master saturation, reverb, and volume.
- Automatic browser saving, downloadable project files, and project reopening.
- Stereo 44.1 kHz / 16-bit WAV export: four bars plus a natural effect tail.

Click a step to toggle it. Shift + click adds an accent. To change one step's sound, turn on **Edit step** beside the banks and choose the step; right-click, a touch long press, or **E** on a focused step also opens its inspector. Choose **Accent** in that inspector on touchscreens. Select a voice to blend its BODY and NOISE levels, then click Synthesis to open Drum body, Noise shaper, and Modulation. Each section edits that voice independently; Hear voice auditions the result. Body can also be added to hats, claps, and textures by raising BODY. Modulation restarts on each hit. Older saved projects load into the new synthesis controls automatically. Drag a knob vertically, or focus it and use arrow keys. Hold Shift for fine adjustments. Press Space to play or pause, 1–8 to audition voices, and Ctrl / Cmd + Z to undo. The question-mark button has the full guide.

The compact **16 STEPS / 32 STEPS** chooser in the existing sequence heading changes the loop length. At 32, **1–16 / 17–32** switches the same grid between its two halves; arrow-key navigation crosses between halves. The second half starts empty. Choosing 16 temporarily excludes steps 17–32 from playback and export without deleting them, including in all four pattern banks. Clear and Randomize edit the active length. Undo, browser saving, JSON projects, native playback, and shared patterns include the chosen length. Factory grooves and older projects still start at 16 steps with their original sounds and timing.

Projects now save as version 4; versions 1 and 2 migrate to a 16-step loop, and version 3 keeps its loop length. Earlier projects start with empty step overrides and chaining off. Export lengths for a single bank are musical bars: use two or more bars to hear a complete 32-step pattern. With chaining off, Export WAV still renders four bars.

## Noise bench (v1.2)

The familiar sequencer, four BODY/NOISE/LEVEL/PAN controls, twelve-source palette, and full Synthesis station remain available. The default groove and the original six presets are unchanged.

**Noise bench** is an optional, initially closed panel. Open it with the Voice station button or its labelled disclosure. Its sixteen recipes cover friction, static, interference, and noise percussion. Choose a recipe, then press **Apply noise**: only the selected voice's noise source and noise synthesis settings change. Drum body, steps and pattern banks, voice level/pan/mute/solo, master effects, and modulation remain yours. Undo restores the previous sound. The recipe chooser itself does not edit the project.

Its six quick controls directly edit the existing cutoff, decay, attack, saturation, playback speed, and burst count parameters. Filter and envelope curve are also available. The same settings appear in the full Noise shaper and are used for playback, project saving, and every WAV/sample export; there is no hidden sound-design state or new audio engine.

Four new complete **Kit + groove** presets append the original bank. Loading one follows the original preset behavior: it changes all eight voices, the rhythm, tempo, swing, and master effects; master output level stays unchanged. These new kits combine authored sixteen-step rhythms with noise-only contact sounds, electrical backbeats, resonant interference, sparse impulses, and a supporting low pulse.

The Noise bench refresh retained project version 2; the 32-step addition saved version 3, and pattern chains now save version 4 with the same storage keys and existing integration APIs. Interface disclosure/recipe selection is excluded from musical projects. Header controls wrap on phones; sequencer lanes retain their names while you scroll to the remaining steps.

## Pattern chains and step sounds (v1.3)

The existing grid, banks, transport and voice panels stay in place. **Chain** beside banks A–D opens a compact editor; it is closed by default. Add banks in the order you want, set each entry to 1–16 complete-pattern repeats, and enable the chain. Entries can be moved, duplicated, removed or cleared, with Undo in the editor. Up to sixteen entries are stored. **Loop chain** repeats the list; turn it off to finish the list once and let the last sound and reverb decay naturally. The editor shows the bank, entry and repeat being heard, and the playing bank has a small underline without moving the bank you are editing.

Bank selection, tempo, swing and pattern-length changes enter at the next whole-pattern boundary. They do not restart the audio clock. Editing the chain list, its enable switch or its loop setting starts the revised arrangement from its first entry at the next boundary. Turning chaining off returns to the selected bank. All banks share the chosen 16/32-step length, voice sounds, mute/solo and master effects.

**Edit step** opens controls for a single strike: noise cutoff in Hz (with a logarithmic slider), physical resonance Q (0.1–20), noise decay in seconds, noise saturation, voice level and stereo pan. Keep **Inherit** checked for any control that should follow its base sound. Uncheck it to store an override, or use **Clear overrides** to restore inheritance for that step. **Hear step** auditions the result. An off step can hold overrides for when it is enabled later; adding an override does not silently add a hit. A small light on a grid cell marks stored overrides. Noise controls need an audible NOISE layer; the inspector explains when that layer is silent. Overrides apply to that strike only, leaving the base voice and following unlocked hits unchanged.

Copy bank includes its overrides. Clear and Randomize clear overrides within the active length; hidden steps 17–32 and their overrides survive when editing at 16. Bank switching, Undo, browser recovery and downloaded projects keep all four banks' overrides and chain settings. A native grid or chain edit exits a received shared note pattern; Undo restores the received part.

When a chain is enabled, the main **Export WAV** button renders the complete list once, with all repeats, swing, accents, locks and a natural tail. In **Samples**, choose **Complete chain** to share that same arrangement, including when chaining is disabled; **Current bank mix** keeps its existing bar-count export. A selected voice one-shot remains its base sound, unaffected by pattern locks or chaining. Full-chain exports report an actionable error if the list exceeds 256 beats, 4,096 notes, the portable 1 MiB packet limit, or 120 seconds of audio including its tail. They never silently shorten the chain.

`GrainApp.getSequencerPattern(options = {})` returns a canonical `musiclab-pattern` v1 packet. The default is the enabled chain, otherwise the selected bank; explicit scopes `pattern`, `chain`, and `voice` select the current bank, complete stored chain, or selected voice in the current bank. An optional `voice` index selects another lane. Swing is realized in note beat positions, and only overridden notes contain `locks`. `GrainApp.sequenceLoop` is false only for an enabled once chain. Native `scheduleNativeNote` and `renderNativeEvents` also accept canonical `locks`, using the same transient synthesis snapshots as grid playback. Explicit resonance locks use physical linear Q for every filter type; the engine converts low/high-pass Q at its AudioParam while preserving the stored native settings and sound of unlocked patches.

Run `node grain/chain-lock-checks.cjs` for maintained-source browser checks: migration and malformed-project rejection, chain editor operations, live repeat order and boundary timing, once tails, complete WAVs, step cutoff and exact unlocked-hit restoration in native/shared PCM, copy/hidden32-step/Undo/recovery, export limits, and touch controls at 320/390 px. No published HTML rebuild is needed for this check. `node grain/resonance-lock-checks.cjs` measures actual physical-Q responses and short-envelope cleanup PCM at 50 Hz / Q 10 and 20 without requiring Git history. Set `SIZZLE_BASELINE_ENGINE=/absolute/path/to/audio-engine.js` to additionally compare unlocked PCM against an explicit previous engine file. Factory audio compatibility is covered separately by the pinned-checkpoint pattern-length regression.

## Sharing samples

The Samples panel shares a rendered pattern mix, selected voice pattern, or selected voice one-shot with the other Kitchen apps. Pattern renders can cover one to sixteen bars; one-shots include the voice's natural envelope and an optional effect tail. Rendering snapshots the current sound and pattern without changing the project or stopping playback. A selected voice can be shared even when it is muted in the mix. SIZZLE generates samples; it does not replace its noise synthesis with imported recordings.

Integrations can call `GrainApp.exportAudio({scope, bars, tailSeconds, signal})` for an audio payload without starting a download. `GrainApp.audioExport` describes the supported scopes. Existing Export WAV still downloads four bars with the natural effect tail.

The deliverable is `index.html`; all of its assets are embedded. The other root files are editable sources. To rebuild after editing, run `python build.py`. It embeds the locally available font files when present and falls back to system sans-serif otherwise.

Browser verification covers playback, step editing, sound controls, envelope displays, modulation sync, section reset, keyboard focus, version 1 migration, version 2 save/import, invalid-settings rejection, undo, WAV export, persistence, and all synthesis tabs at 320/390 px. The audio engine was also checked at maximum levels with every noise source and effect.

Run `node grain/pattern-length-checks.cjs` from the repository root for the SIZZLE and CLATTER length regression. It serves the maintained sources directly, compares every factory groove's state and native WAV to the rollback checkpoint, and exercises 32-step playback, accents, exports, paging, banks, migration, persistence, malformed-project rejection, and 320/390 px controls. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` select an installed browser; `KITCHEN_PATTERN_CHECKPOINT` overrides the comparison tag.

## Site integration

The live page is https://calebhaines.github.io/sidequest-prototypes/music/grain/.
Its landing page is https://calebhaines.github.io/sidequest-prototypes/music/.
The GitHub Pages publishing directory is `docs/`; the Vite static directory is `public/`.
From the repository root, rebuild and copy the standalone page with:

```sh
python grain/build.py
npm run music:sync
```

Kitchen links to SIZZLE. Old `/grain/` URLs redirect to the new music route. The Sidequest RPG gallery has no music promotion. Existing RPG downloads retain their published version.

## Display identity

The kitchen name is a presentation change. Existing URL routes, JavaScript integration APIs, storage keys, and portable project identifiers remain unchanged so earlier sessions and shared projects still open.
