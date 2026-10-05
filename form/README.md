# HOTPLATE — Kitchen

HOTPLATE is Kitchen’s three-layer hybrid percussion instrument. Shared Kitchen samples can enter any voice’s granular layer, while selected voices and complete grooves can leave as stereo audio.

A browser instrument for designing percussion and exporting samples for your sampler or drum machine. Audio synthesis, playback, and export run locally through the Web Audio API. No backend, paid audio service, or account is required to use the app.

## What you can make

- Eight editable pads for kick, snare, clap, hi-hat, tom, rimshot, percussion, and shaker, with 46 starting presets and a dark interface.
- Combine three synthesis layers per pad. Choose dual-oscillator subtractive synthesis with a resonant filter, four-operator FM, scanning wavetable synthesis, overlapping granular synthesis, or the original percussion models. Each layer has its own pitch, level, and amplitude envelope.
- Connect layers with audio-rate frequency modulation, ring modulation, or amplitude modulation. Use two LFOs, pitch and amplitude envelopes, and seeded random values across eight modulation routes. Targets include pitch, filter cutoff, FM index, wavetable position, grain position/density, layer level, and master drive.
- Import a recording for granular synthesis or use the built-in metal, wood, noise, and vocal textures. Recordings are decoded locally, converted to mono at 22.05 kHz, and limited to the first two seconds. Imported PCM is embedded in saved sounds, downloaded projects, and kit manifests.
- Receive shared samples directly into any of the 24 voice/layer combinations. Replacing an enabled layer requires confirmation; other layers, modulation, envelopes, and sequencer settings remain intact. Shared imports require an intentional two-second-or-shorter selection instead of silently cropping audio.
- Shape master tuning, pitch sweeps, modulation envelopes, and filtered white, pink, or brown noise. Add saturation, bitcrushing, sample-rate reduction, reverb, delay, level, and pan.
- Inspect the rendered waveform and frequency spectrum, zoom into transients, and click knob values to enter precise settings.
- Use **Audition layer A/B/C** to hear an engine on its own while editing. This preview uses full layer level without changing your saved mix. The waveform play button plays the complete sound. Muted layers, unconnected LFOs, and inactive modulation destinations are clearly indicated.
- Build 16- or 32-step grooves with tempo, swing, accents, mute, solo, pattern presets, and randomized patterns.
- Search and audition presets by drum type or engine, mark favorites, save your own sounds, generate variations, and undo or redo changes. Sessions autosave locally; download and import projects to move them between browsers. Embedded recordings can exceed browser storage limits, so download a project to keep a portable backup. Original FORM projects migrate to a percussion layer when opened.
- Export mono samples, complete kits as ZIP archives, or stereo patterns with panning, swing, accents, and decay tails. Choose 44.1/48/96 kHz and 16/24/32-bit PCM WAV, with optional normalization and sample silence trimming. Kit archives include sound parameters and sequence settings.

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

All 19 permanent audio tests passed. Browser checks include 10 regressions that compare the actual PCM sent to playback, plus 10 focused control-feedback checks and the original 19 functional checks. They cover synthesis edits, live sequencing, isolated layer audition, real recording import, project round-trips, exports, and mobile layouts. The standalone HTML passed playback, export, and persistence checks with zero external requests; its document was supplied through intercepted navigation because the managed test browser blocks direct file URLs. See [VERIFICATION.md](./VERIFICATION.md) for details and limits.

The optional playback regression requires Playwright and Chromium:

```sh
npm install --no-save playwright
npx playwright install chromium
npm run package
npm run test:playback
npm run test:exchange
```

Set `CHROMIUM_PATH` to use an existing Chromium executable, `PLAYWRIGHT_MODULE` to use a separate Playwright installation, or `FORM_URL` to test a running development server.

## Kitchen integration

The native `window.FormApp` facade provides `getState`, `getProject`, `loadState`, `prepare`, `play`, `stop`, `panic`, and `setTempo`. Host integration uses this public API rather than editing compiled React internals.

`audioImport.targets` lists stable IDs such as `0:a` and `7:c`, display names, and replacement metadata. `importAudio({ pcm, sampleRate, name, options: { target: "0:c", replace: true } })` accepts finite interleaved stereo Float32 PCM between 8 and 192 kHz, up to two seconds. Audio is downmixed and resampled locally to 22.05 kHz mono. `replace` must be explicit for an existing sample or enabled synthesis layer. Each transfer is one undoable project change.

`exportAudio({ scope: "voice" | "pattern", voice, bars, sampleRate, tailSeconds, signal })` returns interleaved stereo PCM with tempo, duration, and source metadata. Voice exports default to the selected pad; pattern exports respect mute, solo, panning, swing, and accents. `bars` requests one to four repetitions of the current 16- or 32-step pattern. Effect tails default to zero for seamless loop transfer. Cancelled transfers leave project state intact.

The facade announces readiness with `musiclab:app-ready` and completed sample imports with `musiclab:state-change` events.

## Project

Built with React, TypeScript, Vite, and browser audio APIs. Browser audio and download support determine availability on your device; headphones or speakers are required to hear the instrument.

## Branding and compatibility

HOTPLATE retains FORM’s internal app identifier, `window.FormApp`, storage keys, project format, `.form.json` imports, and `FORM` release filenames so existing sessions, native hosting, and downloads continue to work. The Kitchen presentation changes names, copy, illustrations, and styles only; synthesis settings and preset IDs are unchanged.
