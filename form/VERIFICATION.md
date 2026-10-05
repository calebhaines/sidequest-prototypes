# FORM 2.0.3 verification

Verified on 5 October 2026. The native host and sample-exchange facade preserves the original React instrument and DSP.

- TypeScript and production packaging completed successfully; all 19 existing DSP and export tests passed.
- Focused Chromium checks verified 24 unique receiving targets, explicit replacement protection, invalid sample rate/target/NaN/duration rejection, exact preservation of every unrelated project field, 22.05 kHz mono conversion, undo/redo, finite audible stereo voice export, exact pattern-loop duration and provenance, cancelled transfer state preservation, and native playback/stop/panic/project restoration.
- The tested standalone document produced zero runtime errors. It was served from a local HTTP server because managed Chromium blocks file URLs.
- The Samples control mounts inside FORM's toolbar after React is ready, opens all 24 receiving targets, and fits at desktop, tablet, and phone widths. The phone toolbar uses an accessible compact sample icon.

## FORM 2.0.2 verification record

Verified on 4 October 2026. This release changes decorative copy and metadata. DSP, presets, project formats, playback, and export implementations are unchanged.

- All 19 existing audio, modular-synthesis, and export tests passed with `npm test`.
- All 10 existing Chromium playback checks passed against the packaged standalone HTML, comparing the PCM actually sent to Web Audio.
- All four editor views fit without page overflow at 1440, 1024, 768, 390, and 320 px. Help and preset-library dialogs retained their readable instructions and controls at each width.
- The copy and layout check reported no runtime errors or external requests. Desktop and mobile screenshots were inspected.
- `npm run package` completed successfully, producing consistent standalone HTML and editable source.

## FORM 2.0.1 verification record

Verified on 3 October 2026 with Node.js 24.19.0 and Chromium 151.0.7922.173.

## Production audio checks

`npm test` runs 19 permanent tests against the actual TypeScript DSP: six audio and export tests, plus thirteen modular synthesis tests. All passed.

- All 46 factory presets produce deterministic, finite, bounded audio with faded endpoints.
- Percussion controls, PCM WAV encoding at 16/24/32 bit, stereo sequencing, swing, velocity, mute, normalization, trimming, playback caching, and cancellation remain covered.
- The five synthesis engines produce distinct sounds. Tests change oscillator and filter controls, all four FM operators' ratios/levels/decays, FM algorithms and index envelope, wavetable controls, and granular source position/size/density/pitch/reversal.
- Granular tests use supplied PCM and verify that a silent source stays silent. Cross-engine FM, ring modulation, and AM alter rendered audio; disabled modulators bypass the connection.
- Every modulation destination, LFO and envelope source, third-layer routing, shared effects, independent envelopes, and deep patch cloning are exercised. Per-hit random routes vary successive hits while repeated pattern exports remain reproducible.
- Malformed imported parameters sanitize without changing the input and render safely.
- A muted, zero-level layer can be auditioned separately; its engine edits affect the preview, other layers cannot mask it, and the original sound parameters remain unchanged.

## Parameter playback regression

Investigated the reported unchanged sound by intercepting actual `AudioBufferSourceNode.start` calls and comparing their PCM, rather than relying on stored settings or a waveform redraw.

- In the original app, all 38 tested engine knob changes reached waveform-button playback. Live sequencer edits also used updated audio.
- Quiet layers can mask changes: in the default Furnace kick, a granular position edit changed the mixed signal by about 0.36% relative RMS, versus 34.4% through the new isolated-layer audition.
- `scripts/test-playback.mjs` contains 10 browser regressions for four engines' waveform-button playback, live sequencing, audible isolated-layer edits, unchanged saved parameters, and preview of a disabled layer. All passed in Chromium. Numeric edits are also committed by clicking play while the value editor is focused.
- Ten additional browser checks passed for prominent off/zero-level warnings, conditional oscillator/FM/wavetable guidance, engine-specific modulation destinations, retained inactive routes after engine changes, LFO connection feedback, and the 390 px mobile layout. No runtime errors occurred.

## Browser checks

All 19 automated browser checks passed against the running application.

- The dark studio loads, FM editing supports undo/redo, keyboard knobs work, and wavetable edits redraw the waveform. Layer connections and the eight-route modulation editor work.
- A generated WAV imported through the UI decodes to real mono PCM at 22.05 kHz. Its source waveform and reverse control work. The decoded samples survive browser saving, downloaded project JSON, kit metadata, project reimport, and reload exactly.
- Audition and sequencer controls start and stop. Exports produce a valid 24 bit mono WAV, a ZIP with eight WAVs and complete synthesis parameters, and a stereo pattern with decay tails.
- Desktop, tablet (768 px), and mobile (390 px) layouts were inspected. The tablet and mobile views have no page-level horizontal overflow.
- No browser runtime errors or external network requests occurred during synthesis, audio import, project saving, or exports.

The packaged standalone HTML also passed playback, sequencer, WAV download, and persistent reload checks. It made zero external requests. The managed test browser blocks direct file URLs, so the HTML was supplied as an intercepted document for this check.

Browser automation covered Chromium. Other browsers and physical MIDI controllers were not tested in this pass.
