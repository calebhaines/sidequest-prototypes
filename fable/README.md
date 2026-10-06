# STOCK

**Everything labelled. Several things unidentified.** A full polyphonic sampler for Kitchen, with playable multisamples, velocity layers, round robins, drum kits, crossfaded loops, and granular textures. STOCK works as a browser instrument, a standalone HTML download, and an instrument inside GALLEY.

## Playing and collecting

Open `index.html` and click a key or Play to enable audio. The eight house presets are complete instruments made from sampled stereo buffers: bells, felt piano, reeds, tape, choir, dust, bass, and a percussion kit. The engine creates their samples once, then treats them like imported recordings.

Use the screen keyboard, computer keys, or MIDI input. MIDI supports note velocity, pitch bend, modulation wheel, pressure, and sustain. Panic stops voices, sequencing, held notes, and effect tails. Four patterns offer 16, 32, or 64 steps with note, velocity, gate, probability, and ratchet controls. The arpeggiator offers ascending, descending, pendulum, random, played-order, and chord modes, with Hold and octave expansion.

**Samples** opens the shared Kitchen library. Receive a sound from another app, import a local audio file or portable audio packet, or record a microphone take. Audio stays in your browser; microphone access begins only when you explicitly choose to record. Each imported sample can become a new zone or replace a selected zone with confirmation. Imported audio is included in native project downloads.

## Building an instrument

A sample asset is the actual audio; a zone is one way to play it. Several zones can reuse one asset with independent trim, pitch, filters, envelopes, or key ranges. STOCK supports **32 sample assets, 64 zones, and 8–64 simultaneous voices**, with 32 voices by default.

- **Mapping:** set a root note, key range, and velocity range for each zone. Automatic key mapping splits the keyboard at the midpoint between neighboring roots. Velocity mapping divides all 127 velocities into complete layers. Drum mapping assigns consecutive notes from C2 and disables pitch tracking. Zones with the same root retain their velocity-layer ranges during key mapping.
- **Variation:** round-robin groups alternate matching zones; choke groups stop related voices, such as an open hat when a closed hat plays. Zone duplication reuses its sample instead of duplicating audio in memory.
- **Sample editing:** set trim and loop boundaries, reverse, tune in semitones and cents, choose gate or one-shot playback, and audition forward or ping-pong loops. Silence trimming and pitch detection provide starting points; manual root-note and trim adjustments remain available.
- **Envelopes and filters:** independent amplitude and filter ADSRs, lowpass/highpass/bandpass/notch filtering, resonance, filter drive, key tracking, velocity response, pan, and stereo width.
- **Texture engine:** granular playback separates note pitch from scanning speed, with stretch, grain size, density, jitter, and position controls. Classic mode provides direct sampled playback.
- **Modulation:** two LFOs and eight routes connect LFOs, velocity, key position, wheel, pressure, random values, and amplitude envelope to pitch, cutoff, pan, level, sample start, or texture position.
- **Master processing:** drive, chorus, tempo-synchronized delay, feedback, reverb, tone, stereo width, and output level, followed by output protection.

## Projects and interchange

Save a native STOCK project to preserve the entire instrument: assets, zones, modulation, effects, performance settings, and all four patterns. Open restores it without automatically starting audio. Undo and Redo preserve edits, while immutable sample assets are shared between history snapshots to avoid repeatedly copying long recordings.

The Samples panel can render the selected zone or pattern to the shared library, WAV, or a portable Kitchen audio packet. GALLEY can load STOCK as an instrument, capture its output on a track, import samples into its zones, and restore the complete instrument with a session. STOCK projects are instrument files; Kitchen audio packets contain rendered sound and can be received by other compatible apps.

Export audio also offers unprocessed sample downloads. Export one source sample as WAV, or collect every sample into one ZIP with a manifest of names, root notes, rates, and durations. Imported source exports retain their sample rate; processed zone and pattern renders use 48 kHz stereo.

The local library and automatic project save belong to this browser profile on this device. They do not upload to GitHub or synchronize between devices. Download project, WAV, or portable packet files for an independent backup. If browser storage is unavailable, the app remains playable and file downloads remain available.

## Limits and validation

Samples may be mono or stereo, from **8–192 kHz**, and at most **120 seconds** each. The entire instrument has a **64 MiB decoded audio budget** and its portable JSON project is limited to **64 MiB**. High-rate stereo files reach the memory budget before the duration limit; lower rates or shorter trim regions allow more material. Imported projects store audio as 16-bit little-endian PCM in base64; playback decodes it into floating-point buffers.

Assets with corrupt dimensions, unsupported channel counts, malformed base64, invalid sample rates, mismatched frame counts or durations, unknown recipes, duplicate identifiers, or missing zone references are rejected. Non-finite sample values are rejected before encoding. Invalid project controls and incomplete sequencer arrays are rejected rather than silently repaired. Importing new audio must validate the budget and replacement destination before changing an instrument.

## Source and checks

There are no external runtime dependencies or network requests. `schema.js`, `presets.js`, `audio-engine.js`, `zip.js`, and `app.js` are embedded in the standalone HTML together with local styles, fonts, and the common Samples interface.

Build from this directory with:

```sh
python3 build.py
```

Run the persistent state and analysis checks with:

```sh
node checks.cjs
node zip-checks.cjs
```

Those checks cover audible default mapping, all eight portable presets, stereo PCM fidelity, malformed metadata rejection before decoding, project budgets, strict control validation, immutable audio history, gap-free mappings, anti-phase and bass pitch detection, silence trim, transient detection, and ZIP interoperability with Python's standard archive reader.

`node engine-checks.cjs` exercises the actual Web Audio graph in Chromium using Playwright. Install Playwright for development, or set `PLAYWRIGHT_MODULE` to its module path; `CHROMIUM_PATH` optionally selects a Chromium executable. These are testing tools and are not needed to run or build STOCK.

`window.FableApp` exposes native state, host transport, audio import/export, and the engine. `window.FableSchema` exposes project parsing, asset encoding/decoding, analysis, mapping, and limits. Sample destinations are typed zone identifiers; the `new` destination creates a new zone, and replacing an existing destination requires an explicit replacement flag. Audio receivers and exporters use interleaved stereo Float32 buffers at the Kitchen boundary.

## Compatibility

The Kitchen name is a presentation change. Existing app URLs, project formats, native APIs, storage keys, and source identifiers remain compatible. Earlier FABLE projects continue to open. Source archives keep their existing URL names.

## Interface refresh · 1.0.1

The keyboard and existing sound selection now open in a compact Performance view. Sample editor opens every original inventory, waveform, mapping, envelope and modulation tool; the keyboard remains playable. Arpeggiator and master settings have labelled expandable panels. Workspace choice is transient and never enters instrument data or Undo history. Existing sounds, samples, projects, presets, MIDI and audio rendering are unchanged.
