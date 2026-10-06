# Kitchen

A dedicated, self-contained landing page for eleven music instruments and the GALLEY browser studio.

Live: https://calebhaines.github.io/sidequest-prototypes/music/

GALLEY studio: https://calebhaines.github.io/sidequest-prototypes/music/loom/

Two-minute GALLEY session: https://calebhaines.github.io/sidequest-prototypes/music/listen/

**The Cupboard at Low Tide** is the original two-minute arrangement made in the
studio. The listening page includes a browser player and the unchanged stereo
48 kHz / 16-bit WAV master. Its source page and recording live in `music/listen/`;
`npm run music:sync` copies them into the published site.

Three-minute industrial session: https://calebhaines.github.io/sidequest-prototypes/music/listen/the-walk-in-doesnt-sleep/

**The Walk-In Doesn’t Sleep** uses GALLEY 1.7's native mixer, automation and WAV
exporter, with eight tracks and seven Kitchen instruments. BROILER shapes both
the ROUX bass and SKEWER string parts. The song has a 128 BPM pulse, arranged on
a 64 BPM half-time clock across 48 studio bars for exactly three minutes. Its
listening page includes the stereo 48 kHz / 16-bit WAV and a portable project ZIP
with every source sample embedded and the editable instrument patches.

SIZZLE: https://calebhaines.github.io/sidequest-prototypes/music/grain/

HOTPLATE: https://calebhaines.github.io/sidequest-prototypes/music/form/

CLATTER: https://calebhaines.github.io/sidequest-prototypes/music/tine/

REDUCE: https://calebhaines.github.io/sidequest-prototypes/music/mire/

ROTISSERIE: https://calebhaines.github.io/sidequest-prototypes/music/spool/

STEAM: https://calebhaines.github.io/sidequest-prototypes/music/haze/

SKEWER: https://calebhaines.github.io/sidequest-prototypes/music/bower/

DICER: https://calebhaines.github.io/sidequest-prototypes/music/ravel/

STOCK: https://calebhaines.github.io/sidequest-prototypes/music/fable/

ROUX: https://calebhaines.github.io/sidequest-prototypes/music/roux/

BATTER: https://calebhaines.github.io/sidequest-prototypes/music/batter/

The music page has its own design and navigation, separate from the Sidequest RPG gallery. All typography and artwork are embedded in `index.html`.

## Sharing audio

Every instrument and GALLEY has a **Samples** panel. In **Send audio**, render a hit, voice, pattern, deck, slice, spectral score, clip, or mix, depending on the app. Save it to the local library, then open **Samples** in another app and select the sound. Preview and trim the audio, choose a receiving destination, and explicitly confirm replacement when needed. Samples stay on this browser and site; WAV or portable Kitchen packets transfer them between devices or standalone HTML files. Downloaded apps include the complete interface and exchange code for offline use.

STOCK receives up to 120 seconds of stereo audio into a new or existing playable sample zone, with up to 64 zones and a 64 MiB decoded audio budget. HOTPLATE receives audio into any granular layer (2 seconds), REDUCE into any of four source exciters (10 seconds), ROTISSERIE into any deck (30 seconds), and DICER into its slicing engine (20 seconds). STEAM analyzes up to 20 seconds into an editable spectral score. BATTER receives up to 120 seconds into any of twelve drum lanes. GALLEY appends up to 120 seconds as a clip on any track. SIZZLE, CLATTER, SKEWER, and ROUX contribute synthesized sounds to the library. See [the exchange contract](../shared/README.md) for future apps and portable packet details.

## Sharing musical parts

Every instrument and GALLEY also has a **Patterns** panel. Share editable notes,
timing, durations, velocities, probability, and named voices through a separate
browser library or portable JSON. Receivers preserve the exact musical part and
require explicit voice mapping and replacement where needed. GALLEY receives parts
as note clips with a piano roll, plays them through native instrument synthesis,
and exports them alongside audio. Live instruments follow the studio’s shared
bar/beat clock. Print retains the source patch and pattern for **Edit source**,
**Update audio**, or **Restore notes**. See [the pattern contract](../shared/PATTERN-CONTRACT.md).

## Editing and adding apps

Edit `music/index.html` to change the page. Add another instrument article to its collection for each new app, using a relative link such as `./new-app/`. Put that app's browser files in `music/new-app/`, with an `index.html` entry point. The layout adapts to additional articles.

GALLEY 1.11 is an eight-track browser DAW with audio and note arrangement, all eleven Kitchen instruments inside the studio, four effects slots per track, and eleven native effects. SCALES adds a live chromatic tuner, calibrated string guides, stereo meters, gain and phase tools, mono bass, filters, and clip protection. Audio settings select the interface, input channel, output where supported, sample rate, and Live/Balanced/Stable latency mode. Play through BROILER sets up monitoring while stopped, without replacing an occupied rack. Monitor the input through a selected track's effects while recording a dry take, with estimated automatic delay compensation and signed manual adjustment. BROILER adds nine bass amp models (including four Ampeg-inspired characters), three guitar models, eleven cabinets, a clean-low blend, EQ, gate, sag, and microphone shaping. GLAZE supplies a complete practical and creative vocal strip with clear stage descriptions and expandable control guidance, with a microphone shortcut, cleanup, dynamics, tone, pitch correction/shifting, harmonies, doubling, vowel filters, vocoder, rhythmic motion, ducked delay and reverb. Import and record audio, arrange clips, save projects, undo edits, and export stereo WAV. Its standalone HTML includes the eleven instruments for offline use, including STOCK's full sampler interface and sample state. Future instruments can be added from an HTML file or same-site URL; the MusicLabHost v1 bridge allows compatible apps to exchange transport, project state, and audio with GALLEY. See [`loom/README.md`](../loom/README.md) for the app-hosting contract and practical integration instructions. Editable sources are in `loom/`; rebuild the standalone page and `music/loom/LOOM-source.zip` with `python loom/build.py`. The Kitchen studio feature opens it at `./loom/` or downloads the self-contained HTML. Its Help panel includes the editable source ZIP.

SIZZLE's editable source remains in `grain/`. Rebuild it with `python grain/build.py` when its source changes. Its `index.html` continues to work as a standalone offline download.

HOTPLATE 3.0 is an eight-burner electronic drum groovebox with four curated kits, 32 new sounds, twelve authored grooves, fast sound shaping, and detailed step sequencing. Optional deeper recipes retain its five synthesis engines, three layers, modulation, imported grains, and WAV exports. Its maintainable React/TypeScript sources are in `form/`, standalone page in `music/form/index.html`, and complete editable project in `music/form/FORM-source.zip`. See `music/form/README.md` for update instructions. The Kitchen card opens the app or downloads its offline HTML.

CLATTER 1.1.3 has nine resonator bodies, selectable striking materials, contact texture and rebound controls, and eight grooves. Its editable source is in `tine/`. Rebuild it with `python tine/build.py`; its single-file page is copied to the music section by the same sync command. Existing CLATTER projects upgrade automatically with their original excitation preserved.

REDUCE 1.0.1 is a feedback instrument with four interconnected delay/resonator pools, six processor models, eight exciter types including imported audio, and four sixteen-step lanes. Its routing matrix, two LFOs, assignable XY pad, freeze, live microphone input, and stereo recording turn short sounds into evolving loops and textures. Eight complete kitchen presets are included. The editable source is in `mire/`; rebuild its standalone page and `music/mire/MIRE-source.zip` with `python mire/build.py`. Kitchen opens the app at `./mire/` or downloads the same self-contained HTML for offline play. The app's Help panel includes its editable source download.

ROTISSERIE 1.0.1 is a tape-loop playground with four overlapping stereo decks, eight tape-study presets, thirty seconds per deck, audio import, live microphone input, built-in keys, and overdubbing. Shape speed, reverse playback, loop regions, tape wear, tone, wow, and flutter; save projects and export stereo WAV. Its editable source is in `spool/`; rebuild the standalone page and `music/spool/SPOOL-source.zip` with `python spool/build.py`. Kitchen opens the app at `./spool/` or downloads the same self-contained HTML for offline play. The app's Help panel includes its editable source download.

STEAM 1.0.1 is a spectral painting instrument. Its thirty-two-column, twenty-four-band canvas turns time and pitch into forty-eight additive partials, with cloud motion, overtone shaping, and spectral freeze. Its editable source is in `haze/`; run `python haze/build.py` to rebuild the standalone page and `music/haze/HAZE-source.zip`. Kitchen opens it at `./haze/` or downloads the same self-contained HTML for offline play.

SKEWER 1.0.1 is a generative string instrument with four waveguide voices, sixteen-step patterns, scales, Euclidean rhythms, probability, and independent loop lengths for polyrhythms. Its editable source is in `bower/`; run `python bower/build.py` to rebuild the standalone page and `music/bower/BOWER-source.zip`. Kitchen opens it at `./bower/` or downloads the same self-contained HTML for offline play.

DICER 1.0.1 is a stereo sample-slicing instrument with sixteen slices, a sixteen-step sequencer, transient auto-slicing, audio import, microphone recording, ratchets, and step editing. Its editable source is in `ravel/`; run `python ravel/build.py` to rebuild the standalone page and `music/ravel/RAVEL-source.zip`. Kitchen opens it at `./ravel/` or downloads the same self-contained HTML for offline play.

STOCK 1.0.1 is a full polyphonic stereo sampler with 64 sample zones, key and velocity mapping, round-robin groups, choke groups, pitch detection, classic and granular playback, crossfaded forward/ping-pong loops, amplitude and filter envelopes, two LFOs, and eight modulation routes. Play its keyboard or MIDI, use the arpeggiator, or edit four 16/32/64-step patterns. Import shared library sounds or local files, record the microphone, and save portable instruments with their sample audio. Its editable source is in `fable/`; run `python fable/build.py` to rebuild its standalone page and `music/fable/FABLE-source.zip`, then rebuild GALLEY to update the bundled instrument. Kitchen opens STOCK at `./fable/` or downloads the same self-contained HTML for offline play.

ROUX 1.0.1 is a bass instrument with a circular recipe sequencer: relative scale movements, rests, root resets and ties, with independently cycling accents and slides. A deep fundamental blends with a driven resonant waveguide. Sound controls include envelopes, filter, drive and modulation. Its editable source is in `roux/`; run `python roux/build.py` to rebuild the standalone page and `music/roux/ROUX-source.zip`, then rebuild GALLEY. Exact imported patterns and native patches are portable through the shared libraries.

BATTER is a recorded acoustic drum instrument with twelve sample lanes, eight pattern banks, 16/32/64-step sequences, lane polymeters, probability, conditional hits, flams, ratchets, microtiming, and per-step sound locks. Sample editing includes waveform trim, envelope, pitch, reverse, filters, transient/body shaping, saturation, bit reduction, choke groups, pan, and effects sends. Its 148 embedded samples span four starter kits and play offline. Each lane blends two sample sources with separate tuning, reversal, and layer selection, and has a tempo-synced or free LFO for pitch, tone, pan, level, or blend. Clear pattern empties the selected bank with Undo. Additional recorded kits can load from the site or downloaded bundles; portable projects preserve chosen audio. See [`batter/SAMPLE-LICENSES.md`](../batter/SAMPLE-LICENSES.md) for attribution and the specific sample licenses. Editable sources are in `batter/`; run `python batter/build.py`, then rebuild GALLEY and sync the site.

The instruments include project files, stereo WAV export, and editable source ZIP downloads in their Help panels. Typography, artwork, and audio code are bundled in each standalone HTML file.

Run `npm run music:sync` to copy the music page, apps, and assets to both `public/music/` and `docs/music/`. The sync also runs before `npm run dev` and `npm run build`. GitHub Pages publishes `docs/`, so commit the refreshed copies when publishing.

The previous `/grain/` route redirects to `/music/grain/`, preserving query strings and hashes. Browser projects remain in the same origin-wide storage. The redirect also has a plain link for browsers without JavaScript.

## Design and rollback

Kitchen uses dark commercial kitchen equipment panels, enamel labels, condensed display lettering, and orange service indicators. Functional controls retain their technical names. Display brands have changed; app paths, storage, APIs, project formats, and archive filenames remain stable. See [ROLLBACK.md](ROLLBACK.md) for the checkpoint and reversible deployment instructions.

## Interface refresh and SIZZLE additions

SIZZLE 1.2 adds four noise-focused kits and sixteen noise-layer recipes in an optional Noise bench. Its original six kits, default sound, synthesis engine, projects and familiar controls are preserved. [Open the preserved SIZZLE 1.1.1](./grain/previous.html) to compare or return to the previous interface immediately.

The other instrument interfaces retain their sound engines, preset data, sample libraries and project formats. CLATTER brings material and strike controls forward; SKEWER has playable strings and note feedback; STOCK opens on its keyboard with a dedicated sample editor; DICER puts slice and selected-step editing together; STEAM offers focused touch painting; REDUCE clarifies routing and performance; ROTISSERIE, ROUX and BATTER have compact navigation and touch refinements. HOTPLATE 3 is unchanged. GALLEY includes the refreshed standalone instruments.

See [ROLLBACK.md](./ROLLBACK.md) for the release checkpoint and full restoration instructions.

To verify this release against the checkpoint, capture the actual old projects and rendered audio in a temporary checkout, then run the instrument and GALLEY browser checks on the current checkout:

```sh
git worktree add --detach /tmp/kitchen-interface-baseline pre-kitchen-interface-refresh-2026-10-06
KITCHEN_ROOT=/tmp/kitchen-interface-baseline node shared/kitchen-interface-checks.cjs --capture-baseline
npm run check:interfaces
git worktree remove /tmp/kitchen-interface-baseline
```

The check uses Playwright and Chromium; set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` for other installations. Baselines and reports are written to `/tmp`; `KITCHEN_BASELINE` and `KITCHEN_REPORT` can override those paths. Checks cover retained sounds and controls, project restoration, responsive layouts, live output, new noise recipes, precise touch editing and the embedded GALLEY instruments.

Audio checks compare actual renders against the previous release. Deterministic renderers must match exactly. Native Web Audio comparisons allow only the small numerical variation measured by repeatedly rendering the untouched previous app; projects, parameter values and synthesis source still match exactly.
