# SIZZLE.

A self-contained, noise-powered drum machine with a compact commercial kitchen inspired dark interface.

**Double-click `index.html` to open it in a modern browser, then press Play.** It works offline. No installation, server, account, external fonts, libraries, or samples are needed. All sound is synthesized in the browser.

- Eight playable voice pads, individually editable sounds, and a 16/32-step sequencer.
- Twelve sources: white, pink, brown, blue, violet, grey, velvet, crackle, metallic, digital, dust, and radio noise.
- The original six curated grooves, four additional specialist noise kits (Prep surface, Short-order static, Radio misdemeanour, and Crumb counter), four pattern banks, swing, accents, mute, solo, randomization, and undo.
- Separate BODY and NOISE layer levels, voice level, and stereo pan.
- Quick filter cutoff, noise decay, body pitch, and noise saturation controls tied directly to the detailed synthesis settings.
- Drum-body oscillator waveform, fundamental, harmonics, detune, pitch sweep, sweep time, and its own attack/hold/decay envelope.
- Noise playback speed, four filter types, cutoff, resonance, filter sweep, saturation, burst count/gap, and an independent envelope.
- Sine, triangle, square, sawtooth, and sample-and-hold modulation for noise cutoff, amplitude, pitch, or voice pan; free rate or tempo-synced divisions.
- Exponential or linear envelope curves, visual envelope/LFO displays, section reset, and physical-unit parameter values.
- Master saturation, reverb, and volume.
- Named projects, browser-saving feedback, downloadable project files, and project reopening.
- Stereo 44.1 kHz / 16-bit WAV export: four bars plus a natural effect tail.

## Start service (v1.3)

Choose a house preset and press **Play**, or tap one of the eight voice pads to select and hear it. **Stop** ends playback; **Escape** silences the instrument. Choose how a preset loads: **Kit + groove** replaces the sound and rhythm together, **Sounds only** keeps your rhythm, and **Groove only** keeps your sounds. All ten existing presets retain their original synthesis and rhythms.

Click a step to toggle it, or Shift-click to accent it. The **Hit**, **Accent**, and **Erase** tools make these edits directly available on touchscreens. On screens up to 650 pixels wide, the grid shows four steps at a time with previous/next navigation; larger screens show sixteen. **Follow playhead** can move the visible page during playback. Paging changes only the view, not the loop length or stored notes.

Select a voice to blend its BODY and NOISE levels, adjust level and pan, or quickly change filter cutoff, noise decay, body pitch, and noise saturation. These controls edit the same saved parameters as **Synthesis**, whose Drum body, Noise shaper, and Modulation tabs retain the complete editor. The optional **Noise bench** adds noise-only recipes and further shaping. Body can also be added to hats, claps, and textures by raising BODY. Modulation restarts on each hit; older saved projects upgrade automatically.

Drag a knob vertically, or focus it and use arrow keys. Hold Shift for fine adjustments. **Space** starts or stops playback, **1–8** selects and auditions voices, and **Ctrl / Cmd + Z** undoes an edit. The question-mark button has the full guide. Name your project before saving; the local-save message reports browser saving, and **Save project** downloads a portable copy.

The **16 STEPS / 32 STEPS** chooser changes the loop length. Page navigation and arrow keys reach all active steps. The second half starts empty. Choosing 16 temporarily excludes steps 17–32 from playback and export without deleting them, including in all four pattern banks. Clear and Randomize edit the active length. Undo, browser saving, JSON projects, native playback, and shared patterns include the chosen length. Factory grooves and older projects still start at 16 steps with their original sounds and timing.

Projects now save as version 3; versions 1 and 2 migrate to a 16-step loop. Export lengths are musical bars: use two or more bars to hear a complete 32-step pattern. The existing Export WAV button still renders four bars.

## Noise bench (v1.2)

The familiar sequencer, four BODY/NOISE/LEVEL/PAN controls, twelve-source palette, and full Synthesis station remain available. The default groove and the original six presets are unchanged.

**Noise bench** is an optional, initially closed panel. Open it with the Voice station button or its labelled disclosure. Its sixteen recipes cover friction, static, interference, and noise percussion. Choose a recipe, then press **Apply noise**: only the selected voice's noise source and noise synthesis settings change. Drum body, steps and pattern banks, voice level/pan/mute/solo, master effects, and modulation remain yours. Undo restores the previous sound. The recipe chooser itself does not edit the project.

Its six quick controls directly edit the existing cutoff, decay, attack, saturation, playback speed, and burst count parameters. Filter and envelope curve are also available. The same settings appear in the full Noise shaper and are used for playback, project saving, and every WAV/sample export; there is no hidden sound-design state or new audio engine.

Four specialist presets append the original six. With **Kit + groove**, loading one changes all eight voices, the rhythm, tempo, swing, and master effects; master output level stays unchanged. **Sounds only** and **Groove only** let you keep the other part of your work. These kits combine authored sixteen-step rhythms with noise-only contact sounds, electrical backbeats, resonant interference, sparse impulses, and a supporting low pulse.

The Noise bench refresh retained project version 2; the 32-step addition saves version 3 with the same storage keys and integration APIs. The v1.3 workflow uses that same format and engine. Interface disclosure, recipe selection, and step paging do not change the musical data.

## Sharing samples

The Samples panel shares a rendered pattern mix, selected voice pattern, or selected voice one-shot with the other Kitchen apps. Pattern renders can cover one to sixteen bars; one-shots include the voice's natural envelope and an optional effect tail. Rendering snapshots the current sound and pattern without changing the project or stopping playback. A selected voice can be shared even when it is muted in the mix. SIZZLE generates samples; it does not replace its noise synthesis with imported recordings.

Integrations can call `GrainApp.exportAudio({scope, bars, tailSeconds, signal})` for an audio payload without starting a download. `GrainApp.audioExport` describes the supported scopes. Existing Export WAV still downloads four bars with the natural effect tail.

Shared **Patterns** can supply an exact received performance. Sound edits preserve those notes. Editing the native grid or its rhythm returns playback to the visible native sequence; Undo restores the received performance as well as the preceding edit.

The deliverable is `index.html`; all of its assets are embedded. The other root files are editable sources. To rebuild after editing, run `python build.py`. It embeds the locally available font files when present and falls back to system sans-serif otherwise.

Browser verification covers playback, step editing, sound controls, envelope displays, modulation sync, section reset, keyboard focus, version 1 migration, version 2 save/import, invalid-settings rejection, undo, WAV export, persistence, and all synthesis tabs at 320/390 px. The audio engine was also checked at maximum levels with every noise source and effect.

Run `node grain/pattern-length-checks.cjs` from the repository root for the SIZZLE and CLATTER length regression. It serves the maintained sources directly, compares every factory groove's state and native WAV to the rollback checkpoint, and exercises 32-step playback, accents, exports, paging, banks, migration, persistence, malformed-project rejection, and 320/390 px controls. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` select an installed browser; `KITCHEN_PATTERN_CHECKPOINT` overrides the comparison tag.

Run `node grain/workflow-checks.cjs` for the v1.3 browser workflow checks, including playable pads, touch paging and tools, preset load modes, direct sound shaping, project feedback, and received-pattern editing.

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
