# LEAVEN

**Let the chord rise.** A Kitchen polyphonic synthesizer and arpeggiator with five distinct oscillator engines, an eight-slot chord progression, four sixteen-step pattern banks, and a visible sound rack. The amber enamel and turquoise display borrow their language from a commercial proofing oven and an eighties instrument panel.

Open `index.html` for the self-contained, offline instrument. Developers can open `app.html` from this repository or build a fresh standalone with `python3 build.py`. There are no network dependencies. Sound starts after a playback or keyboard gesture. The technical app ID, globals, project format, and source directory remain `proof` for compatibility; the instrument's display name is LEAVEN.

## Start playing

Choose a factory recipe and press **Play**. Enabled chord slots cycle in order. Select a slot to edit its scale degree, quality, inversion, spread, duration, or enabled state in the adjacent chord inspector. Degree `0` is the root; other degrees follow the selected scale. The note source chooses the progression, the selected chord, or your held keyboard notes.

Select a step in the sixteen-step tray to edit its velocity, gate multiplier, probability, ratchet, timing offset, and octave. Use **On / Off** in its inspector to mute it. Double-clicking a step also toggles it. **Tie previous** carries the previous note instead of retriggering. **Protect step** prevents mutation and Euclidean edits from changing that step. A shorter bank keeps all sixteen stored steps while using only its active length.

**Spice**, probability, random directions, and mutation use the saved seed. The realized phrase display and MIDI export use the same sequencer as the audio engine. **Cycle fold** reshapes the note order or octave across phrase cycles. Rotation turns the available note order. Exact imported MusicLab notes bypass the native arp; **Use native arp** clears that overlay, with Undo available.

## Shape the sound

All synthesis controls stay on the front panel:

- **DCO:** steady dual analogue waveforms and sub, suited to the classic stereo chorus sound.
- **VCO:** detuned twin oscillators with cross-modulation.
- **SYNC:** a slave oscillator resets against its master; the ratio produces bright sync leads.
- **FM:** four sine operators with cascade, parallel, or feedback routing.
- **VECTOR:** six harmonic spectral tables with continuous morphing.

Model character controls are visibly disabled until their engine is selected. Their saved settings survive switching models. The resonant filter has low-pass 12/24 dB, high-pass, and band-pass modes, its own envelope, key tracking, and a bipolar envelope depth measured in octaves. The amplitude envelope operates separately. The LFO can run freely or follow tempo and target filter, pitch, pulse width, vector position, amplitude, or pan. Chorus, rhythmic delay, room, stereo width, and output complete the chain. The filter and envelope graphics illustrate their controls; the VFD waveform and meter show actual audio.

## Performance

The two-octave keyboard scrolls locally on phones. Computer keys begin **A W S E D F T G Y H U J K**. **Z / X** changes its octave. Choose **Keyboard / held notes** to arpeggiate a chord. With Latch enabled, releasing the keys retains the chord; a new chord begins once all previous keys are released. With Latch off, only currently held notes feed the arp. When the arp is stopped, the keyboard directly auditions the synthesizer in every source mode. During held-note playback it updates the arp chord instead. Direct audition notes release safely even if the note source changes while a key is down. Web MIDI can be connected and reconnected from the performance panel, where supported by the browser. MIDI note velocity is preserved.

**Hold to fill** temporarily introduces double hits without changing the saved pattern. **Space** plays or stops. **Home** restarts from the beginning. **Escape / Panic** silences all notes. **Ctrl / Command Z** undoes an edit; add **Shift** to redo. Shortcuts do not take over text or number editing. Chord and step selection does not consume Undo entries. History contains up to 64 musical edits and groups a slider gesture into one entry.

## Keep and export a recipe

**Save project** downloads a version 1 `.proof.json` file containing the full recipe. **Open project** validates its structure and numeric controls before applying it; the size limit is 1 MiB. Standalone browser recovery is debounced under `proof-project-v1`. Storage failures appear in the footer; Save project always remains available. Hosted instruments leave recovery to their host.

**Download WAV** renders the actual deterministic DSP to stereo 48 kHz PCM16, with an effect tail. Choose an arp phrase of one to sixteen bars, a single note, or the selected chord. Rendering uses an independent state snapshot, supports cancellation, and leaves live playback and subsequent edits available. **Download MIDI** writes a standard type 0 file with absolute note timing, velocity, tempo, and realized probability decisions for the chosen bar count. Both use the saved recipe name as their filename.

Shared Audio and Patterns controls are injected into the standalone build. LEAVEN can share a rendered sound or its realized note phrase with compatible Kitchen instruments and GALLEY. An imported phrase preserves exact pitches, timing, durations, and velocities. The native adapter schedules one pitched synth voice directly, with source-aware cancellation, host transport, and independent offline rendering.

## Source and verification

`schema.js` defines normalization, strict project parsing, chord vocabulary, and parameter ranges. `arp.js` is the deterministic event generator. `presets.js` contains 24 authored recipes. `audio-engine.js` contains the shared live/offline DSP and Web Audio wrapper. `app.js`, `app.html`, and `styles.css` implement the accessible instrument panel. `adapters.js` supplies native host and portable-pattern integration. `build.py` embeds the source, shared exchange controls, schema, and fonts into `index.html` and makes the reproducible `LEAVEN-source.zip` archive.

Run `node engine-checks.cjs` for DSP, sequencing, preset, project, and cancellation checks. Run `node browser-checks.cjs [standalone-URL]` for actual browser checks. With no URL it creates an isolated source preview under `/tmp`. Sibling STOCK/GALLEY transfer checks run in the full repository; extracted archives run the standalone cases. Playwright and Chromium are required; `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can select their installations. `PROOF_HOST_URL` can point the suite at a GALLEY preview for host integration checks. The UI is designed for 320, 390, 768, and 1440-pixel viewports with no document overflow. Grids reflow; the step tray and keyboard can scroll locally on narrow screens to preserve touch targets. Native focus indicators, labelled sliders, reduced-motion support, and an embedded operating-notes dialog are included.
