# Kitchen performance audit

6 October 2026. All thirteen instruments and GALLEY were reviewed against
`pre-kitchen-performance-2026-10-06` (`e7c2b8f499e81e6c949efae5454977f3911b57a8`).

The changes reduce interface work. Sound generation, effects, factory recordings,
presets, random generators, sequencing, audio buffers, sample rates, polyphony,
and recording compensation retain their previous implementation. Project formats
and parameter ranges are retained. GALLEY still has eight tracks and four inserts
per track.

## Improvements across every app

| App | Work removed | Focused before/after evidence |
| --- | --- | --- |
| SIZZLE | Cached playhead/knob elements; parked decorative animation while idle | 20,480 document searches → 0 across 10,240 step updates; idle decorative callbacks → 0 |
| CLATTER | Cached playhead/knob elements; parked decorative animation while idle | 20,480 document searches → 0 across 10,240 step updates; idle decorative callbacks → 0 |
| HOTPLATE | Reused kit identification, custom preset identification, sound-control values, and normalized step descriptions | Derived results are reused during transport pulses; the original computation runs when its inputs change |
| REDUCE | Cached exact route geometry; skipped unchanged meter text | 3,200 route-distance calculations → 0 per 100 unchanged display frames |
| ROTISSERIE | Skipped waveform paints with identical inputs | Repeated identical paints eliminated; moving reels and meters still update |
| STEAM | Reused canvas bounds and display colors; skipped unchanged meter HTML | 300 bounds reads → 100; 100 meter HTML rebuilds → 1 per 100 frames |
| SKEWER | Retained step labels and skipped unchanged classes, accessibility attributes, and meters | 6,400 step subtree rebuilds → 0 across 100 control edits |
| DICER | Keyed waveform peaks to decoded audio instead of a newly copied project object | Repeated full-sample scans eliminated on unrelated control edits |
| STOCK | Cached the exact original stereo min/max display bins | Trimming and envelope edits reuse peaks; changing audio, zoom, or width recomputes them |
| ROUX | Retained rhythm indicators and exact display geometry; skipped unchanged meters | 1,200 indicator allocations → 0 across 100 control edits |
| BATTER | Cached the exact original sample peaks | Dragging trim handles reuses peaks instead of rescanning the complete recording |
| LEAVEN | Reused scope bitmaps and skipped unchanged transport/meter writes | 400 bitmap assignments → 0 across 200 scope frames |
| MARINADE | Reused canvas dimensions and skipped unchanged readout text | 400 dimension writes → 0; 600 text writes → 6 per 100 unchanged meter frames |
| GALLEY | Skipped unchanged meter/control/accessibility writes; coalesced waveform previews before paint | Idle DOM mutations 967 → 1; eight synchronous edits draw 3 waveform previews instead of 24 |

These figures measure the specified interface workloads, rather than whole-app
CPU or audio-processing speed. Canvas pixels, control values, saved state, and
outgoing audio-control messages were compared with the checkpoint. Waveform
checks cover long samples, zoom, trim, selection, display sizes, and pixel ratios.
SKEWER, ROUX, and LEAVEN checks also cover all 44 authored presets. HOTPLATE checks
cover imported audio, banks, editing, Clear, Undo, playback, and immutable cache
invalidation. Decorative animation may pause while idle; audio transport retains
its original behavior.

All caches retain the original values and invalidate when their inputs change.
Display caches do not hold or modify active audio buffers. Older canvas APIs keep
the original reset behavior where the newer reset method is unavailable.

## Sound preservation

The release gate compares complete cryptographic hashes of 84 sound-bearing
source, preset, sample, state, sequencing, adapter, and effect files. They are
byte-identical to the checkpoint. It also compares 563 ordered audio/control/getter
call expressions across 22 interface modules. Those expressions are unchanged.

All 337 deterministic before/after Float32 PCM comparisons pass with zero
differing samples. They use the production code with zero tolerance, including
all authored sound presets, both 44.1 and 48 kHz, different processing block
sizes, scheduled notes, swing patterns, and GALLEY's eleven effect families.
333 cases produce audible output; four explicitly empty presets remain silent.
BATTER also passes two exact native Web Audio comparisons covering all twelve
voices and sample blending with modulation. GALLEY's full-rack comparison WAV
is byte-identical:

`5372561c7717a2fec98d68a55ea2fc9f19614385c3295667eac87550f33f561f`

Native Web Audio comparison results and the complete sample/source hashes are
recorded in [performance-audit.json](./performance-audit.json). Chromium's native oscillator,
filter, and convolution graphs can exhibit numerical variation between repeated
renders of the untouched baseline. This is checked separately; tolerances are
not used to conceal a changed implementation. Browser/device differences are
outside a same-runtime before/after test.

The standalone builds were checked separately. Python-built instruments change
only their interface script and existing shared-library display-name aliases.
Their embedded synthesis and sample content retains its prior bytes. HOTPLATE is
rebuilt through the existing TypeScript/Vite packaging process. GALLEY embeds the
updated standalone versions of all thirteen instruments.

Final Chromium checks confirm audible playback and working Stop in all thirteen
standalone instruments, with zero application errors. All 39 responsive
comparisons preserve the checkpoint's visible controls and horizontal extent.
GALLEY's demo and hosted SIZZLE/MARINADE reach its actual mixer. The original
39 microphone regression checks pass, covering both AudioWorklet and fallback
recording, timing compensation, live effects, and four viewport widths.

Packaging checks pass 161/161: all 426 members of the twelve source downloads
match maintained sources, and GALLEY embeds the exact current thirteen
standalones. BATTER's 148 factory recordings and 641 expansion recordings retain
their previous bytes. The existing published songs and Kitchen landing page
also retain their previous bytes.

## Deliberately retained costs

Audio-processing loops, filter/oscillator calculations, modal resonators, noise
generation, sample decoding/resampling, buffer representations, lookahead timing,
voice limits, and quality settings were left intact. Simplifying them or changing
floating-point operation order could change a sound or an untested patch.

GALLEY's microphone diagnostics retain their original call cadence because
observing the output clock updates its validation history. Shared Samples and
Patterns dialogs already work on demand; their conversion and transfer copies
are retained to preserve independent sample ownership and exact exports.

## Reproduce or roll back

From the repository checkout, with its existing dependencies installed:

```sh
npm run check:performance-audio
node scripts/performance-audio-checks.cjs --sources-only
node scripts/performance-audio-checks.cjs --native-only --browser-apps grain,tine,fable,batter
```

The checks write their reports to `/tmp`; `--report PATH` selects another location.
`--baseline REF` selects a different Git checkpoint. Native browser checks use
Playwright and Chromium; `KITCHEN_PLAYWRIGHT` and `CHROME_BIN` can override their
installed locations. `--browser-repeat-baseline` compares the original app with
itself to diagnose intrinsic native-render variation without changing the test's
zero-tolerance comparison.

The release tag is `kitchen-performance-v1`. To restore the complete previous
site and downloads while retaining Git history, follow [ROLLBACK.md](./ROLLBACK.md).
