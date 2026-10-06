# HOTPLATE — Kitchen

HOTPLATE 3.0 is Kitchen’s eight-burner electronic drum groovebox: pick a kit, put a rhythm on the hob, then shape each drum with six direct controls. Its dark enamel control panel puts the sixteen-step grid, transport, and playable burner pads first. The three-layer sound workshop is still there when you open a recipe.

HOTPLATE makes synthesized electronic drums. Use BATTER for recorded acoustic kits, CLATTER for physical-model percussion, or bring their recordings into HOTPLATE’s granular layers through the shared Kitchen sample library. Sound design, playback, and exports run locally in your browser. No account or audio service is required.

## First service

1. Choose **Enamel**, **Cast iron**, **Cold store**, or **After hours** from **Sound kit**. Each loads eight coherent electronic drums and leaves your rhythm intact.
2. Choose a **Rhythm recipe** and press **Play**. Twelve newly authored two-bar grooves include clean dance pulses, shuffled and broken rhythms, sparse space, industrial pressure, and irregular fills. **Use recipe tempo and swing** controls whether loading one also changes those settings.
3. Tap a grid step to toggle it. **Bar A** and **Bar B** each show sixteen steps; switch to **16 steps** for a one-bar loop. **Stop** ends playback and **Restart** begins at step one.
4. Tap a burner to hear and select it. **Pitch**, **Length**, **Body**, **Snap**, **Air**, and **Heat** change real saved synthesis parameters; their explanations sit beneath the controls. Level and pan are nearby.
5. Select **Edit step details** on a touchscreen, or Shift-click/right-click a step, to edit velocity, probability, repeats, timing, and pitch without toggling the hit. **Enable step** makes an empty inspected step audible.
6. **Undo** restores cleared steps, recipe changes, and sound edits. Export a sound, complete kit, or groove; download a project to keep the editable session and imported recordings.

## What you can make

- Eight playable burners for kick, snare, clap, hi-hat, tom, rimshot, percussion, and shaker, with 32 new sound recipes in four complete kits. The 46 original presets remain in **Archive**, with their saved IDs and sounds preserved.
- A focused six-control sound panel, an aligned sixteen-step grid, separate kit/rhythm selectors, bar navigation, nearby tempo/swing, and visible stop/restart controls. The off-kilter kitchen presentation uses copper burner rings, cream labels, and a graphite/enamel chassis.
- Combine three synthesis layers per pad. Choose dual-oscillator subtractive synthesis with a resonant filter, four-operator FM, scanning wavetable synthesis, overlapping granular synthesis, or the original percussion models. Each layer has its own pitch, level, and amplitude envelope.
- Connect layers with audio-rate frequency modulation, ring modulation, or amplitude modulation. Use two LFOs, pitch and amplitude envelopes, and seeded random values across eight modulation routes. Targets include pitch, filter cutoff, FM index, wavetable position, grain position/density, layer level, and master drive.
- Import a recording for granular synthesis or use the built-in metal, wood, noise, and vocal textures. Recordings are decoded locally, converted to mono at 22.05 kHz, and limited to the first two seconds. Imported PCM is embedded in saved sounds, downloaded projects, and kit manifests.
- Receive shared samples directly into any of the 24 voice/layer combinations. Replacing an enabled layer requires confirmation; other layers, modulation, envelopes, and sequencer settings remain intact. Shared imports require an intentional two-second-or-shorter selection instead of silently cropping audio.
- Shape master tuning, pitch sweeps, modulation envelopes, and filtered white, pink, or brown noise. Add saturation, bitcrushing, sample-rate reduction, reverb, delay, level, and pan.
- Inspect the rendered waveform and frequency spectrum, zoom into transients, and click knob values to enter precise settings.
- Use **Audition layer A/B/C** to hear an engine on its own while editing. This preview uses full layer level without changing your saved mix. The waveform play button plays the complete sound. Muted layers, unconnected LFOs, and inactive modulation destinations are clearly indicated.
- Build 16- or 32-step grooves with mute, solo, and individual velocity, probability, one-to-four repeats, signed microtiming, and ±24-semitone pitch. Native live playback and WAV rendering use the same deterministic timing and probability helper; repeated hits share one parent step’s probability decision.
- Shift a selected burner’s rhythm, vary it, clear it, duplicate bar A to B, or generate evenly spaced hits with density and rotation. **Clear pattern** has Undo nearby. Hold **Hold fill** for temporary repeats in the last four active steps; releasing it restores the saved rhythm without changing the project.
- Search and audition presets by drum type or engine, mark favorites, save your own sounds, generate variations, and undo or redo changes. Sessions autosave locally; download and import projects to move them between browsers. Embedded recordings can exceed browser storage limits, so download a project to keep a portable backup. Original FORM projects migrate to a percussion layer when opened.
- Export mono samples, complete kits as ZIP archives, or stereo patterns with panning, step details, swing, and decay tails. Choose 44.1/48/96 kHz and 16/24/32-bit PCM WAV, with optional normalization and sample silence trimming. Kit archives include sound parameters and sequence settings. Received Kitchen patterns render their exact notes rather than the dormant native grid.

Play pads with **A S D F G H J K**, use **Space** for the sequencer, **R** for a new sound, and **Shift + R** for a subtle variation. The in-app help includes all shortcuts.

**MIDI:** connect a controller in Chrome or Edge over HTTPS or localhost. Drum-note mapping and velocity are supported.

## Run locally

**No-install option:** extract `FORM-app.zip` and open `FORM.html` directly in your browser. It bundles the app, synthesis engines, and fonts in one file and works offline. Click a pad to enable sound. The bundle also includes ready-built hosting files, these instructions, and the editable source.

In the source project, `npm run package` produces `releases/FORM.html`, `releases/FORM-app.zip`, and the hosting/source ZIPs after building.

For development:

Install [Node.js](https://nodejs.org/) 20 or newer. In this project folder:

```sh
npm install
npm run dev
```

Open the local address printed by Vite, usually `http://localhost:5173`. Use a current Chrome, Edge, Firefox, or Safari browser. Click a pad or playback control to enable audio: browsers require a first user gesture before sound can start.

## Build and preview

```sh
npm run build
npm run preview
```

`npm run build` creates the deployable website in `dist/`. The preview command serves that build locally. Serve `dist` over HTTP or HTTPS. The separately packaged `releases/FORM.html` can be opened directly.

## Free hosting

**Cloudflare Pages Direct Upload** is the recommended option: free static hosting, HTTPS, no credit card, and a folder upload. See [HOSTING.md](./HOSTING.md) for step-by-step Cloudflare, Netlify Drop, and GitHub Pages instructions and links to verified official pricing and limits.

`releases/FORM-hosting.zip` is ready to upload. `releases/FORM-source.zip` contains the complete editable project.

## Verify

```sh
npm test
npm run build
```

Production checks exercise the original synthesis engines and exports, new factory sounds and burner controls, authored rhythms, the shared live/offline sequencing helper, legacy PCM compatibility, and native Kitchen integration. See [VERIFICATION.md](./VERIFICATION.md) for the release record and browser-testing limits.

```sh
npm run test:sequencing
npm run test:compat
```

The optional playback regression requires Playwright and Chromium:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run package
npm run test:playback
npm run test:exchange
npm run test:overhaul
```

Set `CHROMIUM_PATH` to use an existing Chromium executable, `PLAYWRIGHT_MODULE` to use a separate Playwright installation, or `FORM_URL` to test a running development server.

## Kitchen integration

The native `window.FormApp` facade provides `getState`, `getProject`, `loadState`, `prepare`, `play`, `stop`, `panic`, and `setTempo`. GALLEY and the Kitchen libraries use this public API rather than editing compiled React internals. Stable native voices remain `voice-0` through `voice-7`, with the original eight-lane order.

Projects may contain `stepDetails`, an eight-row array matching the boolean grid. Each object stores `velocity` and `probability` from zero to one, integer `ratchet` from one to four, `timing` from −0.45 to +0.45 of a sixteenth note, and `pitch` from −24 to +24 semitones. Older projects without this field retain their original downbeat/offbeat accents. Project downloads, restoration, and kit manifests preserve these details and embedded granular PCM.

Portable Kitchen note patterns retain explicit velocities, probability, pitch, and exact hit positions. Native repeats expand into separate notes because the shared version-one format has no parent-step field; receiving instruments can make an independent probability choice for each expanded hit. Save a HOTPLATE project to preserve grouped native-step probability. Received patterns remain as an exact `musicLabPattern` overlay: changing sounds or mute/solo keeps the received notes; **Use native grid** or a native rhythm edit restores the stored grid, and Undo restores the received part. Received audio playback and exports use matching note-probability choices across repeated loops.

`audioImport.targets` lists stable IDs such as `0:a` and `7:c`, display names, and replacement metadata. `importAudio({ pcm, sampleRate, name, options: { target: "0:c", replace: true } })` accepts finite interleaved stereo Float32 PCM between 8 and 192 kHz, up to two seconds. Audio is downmixed and resampled locally to 22.05 kHz mono. `replace` must be explicit for an existing sample or enabled synthesis layer. Each transfer is one undoable project change.

`exportAudio({ scope: "voice" | "pattern", voice, bars, sampleRate, tailSeconds, signal })` returns interleaved stereo PCM with tempo, duration, and source metadata. Voice exports default to the selected pad; pattern exports respect mute, solo, panning, swing, and step details, or the exact received notes. `bars` requests one to four repetitions of the current native or received pattern; returned `bars` describes the actual four-beat bar count. Effect tails default to zero for seamless loop transfer. Cancelled transfers leave project state intact.

The facade announces readiness with `musiclab:app-ready` and completed sample imports with `musiclab:state-change` events.

## Project

Built with React, TypeScript, Vite, and browser audio APIs. Browser audio and download support determine availability on your device; headphones or speakers are required to hear the instrument.

## Branding and compatibility

HOTPLATE retains FORM’s internal app identifier, `window.FormApp`, storage keys, project format, `.form.json` imports, release filenames, and `/music/form/` address. The overhaul replaces the default sound/rhythm bank and interface while preserving the original synthesis engines and saved sound parameters. Original preset IDs remain available in Archive, and existing sessions, embedded recordings, and GALLEY projects continue to use their saved recipes.
