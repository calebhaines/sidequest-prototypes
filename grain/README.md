# SIZZLE.

A self-contained, noise-powered drum machine with an commercial kitchen inspired dark interface.

**Double-click `index.html` to open it in a modern browser, then press Play.** It works offline. No installation, server, account, external fonts, libraries, or samples are needed. All sound is synthesized in the browser.

- Eight individually editable voices and a 16-step sequencer.
- Twelve sources: white, pink, brown, blue, violet, grey, velvet, crackle, metallic, digital, dust, and radio noise.
- Six curated grooves, four pattern banks, swing, accents, mute, solo, randomization, and undo.
- Separate BODY and NOISE layer levels, voice level, and stereo pan.
- Drum-body oscillator waveform, fundamental, harmonics, detune, pitch sweep, sweep time, and its own attack/hold/decay envelope.
- Noise playback speed, four filter types, cutoff, resonance, filter sweep, saturation, burst count/gap, and an independent envelope.
- Sine, triangle, square, sawtooth, and sample-and-hold modulation for noise cutoff, amplitude, pitch, or voice pan; free rate or tempo-synced divisions.
- Exponential or linear envelope curves, visual envelope/LFO displays, section reset, and physical-unit parameter values.
- Master saturation, reverb, and volume.
- Automatic browser saving, downloadable project files, and project reopening.
- Stereo 44.1 kHz / 16-bit WAV export: four bars plus a natural effect tail.

Click a step to toggle it. Shift + click adds an accent; on touchscreens, press and hold. Select a voice to blend its BODY and NOISE levels, then click Synthesis to open Drum body, Noise shaper, and Modulation. Each section edits that voice independently; Hear voice auditions the result. Body can also be added to hats, claps, and textures by raising BODY. Modulation restarts on each hit. Older saved projects load into the new synthesis controls automatically. Drag a knob vertically, or focus it and use arrow keys. Hold Shift for fine adjustments. Press Space to play or pause, 1–8 to audition voices, and Ctrl / Cmd + Z to undo. The question-mark button has the full guide.

## Sharing samples

The Samples panel shares a rendered pattern mix, selected voice pattern, or selected voice one-shot with the other Kilter Kitchen apps. Pattern renders can cover one to sixteen bars; one-shots include the voice's natural envelope and an optional effect tail. Rendering snapshots the current sound and pattern without changing the project or stopping playback. A selected voice can be shared even when it is muted in the mix. SIZZLE generates samples; it does not replace its noise synthesis with imported recordings.

Integrations can call `GrainApp.exportAudio({scope, bars, tailSeconds, signal})` for an audio payload without starting a download. `GrainApp.audioExport` describes the supported scopes. Existing Export WAV still downloads four bars with the natural effect tail.

The deliverable is `index.html`; all of its assets are embedded. The other root files are editable sources. To rebuild after editing, run `python build.py`. It embeds the locally available font files when present and falls back to system sans-serif otherwise.

Browser verification covers playback, step editing, sound controls, envelope displays, modulation sync, section reset, keyboard focus, version 1 migration, version 2 save/import, invalid-settings rejection, undo, WAV export, persistence, and all synthesis tabs at 320/390 px. The audio engine was also checked at maximum levels with every noise source and effect.

## Site integration

The live page is https://calebhaines.github.io/sidequest-prototypes/music/grain/.
Its landing page is https://calebhaines.github.io/sidequest-prototypes/music/.
The GitHub Pages publishing directory is `docs/`; the Vite static directory is `public/`.
From the repository root, rebuild and copy the standalone page with:

```sh
python grain/build.py
npm run music:sync
```

Kilter Kitchen links to SIZZLE. Old `/grain/` URLs redirect to the new music route. The Sidequest RPG gallery has no music promotion. Existing RPG downloads retain their published version.

## Display identity

The kitchen name is a presentation change. Existing URL routes, JavaScript integration APIs, storage keys, and portable project identifiers remain unchanged so earlier sessions and shared projects still open.
