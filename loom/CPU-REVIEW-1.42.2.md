# GALLEY 1.42.2 · playback continuity and responsiveness

This release reduces work that competes with real-time playback. Its comparison
baseline is unchanged GALLEY 1.42.1, commit
`5df579ee99caa7a73222f8d6a52268be4cab3c75`. The original baseline standalone HTML
SHA256 is `b1a4cf4ca95ad5d01bc1c7eb893dc4db8ed616cd5f5351cf4afa3e2783fe46ae`.

## Changes

- The normal clip interpolator writes stereo samples directly instead of
  returning each channel through scalar JavaScript helper calls. It retains the
  exact interpolation arithmetic, source position, gain and fade order. Forward
  and reverse selected-region seam handling remains on the released path.
- BOARD and SUNDAY pass private sample values through reusable Float64 storage
  rather than repeated scalar JavaScript argument/return boundaries. Selected
  BOARD/BROILER filter steps and CELLAR circuit steps are inlined with their
  original operation order. Public component scalar methods remain compatible;
  circuit solves, quality, oversampling, controls and histories are unchanged.
- GLAZE caches coefficients according to their actual control dependencies and
  reuses coefficient arrays. Unchanged controls do no redesign; a gain/ceiling
  edit does not rebuild unrelated filters. Pitch-off/harmony state actions,
  de-esser targets, reverb lengths and feature/reset transitions remain intact.
- Static SERVICE EQ stops creating four redundant setter/sub-block groups per
  track per quantum after the effective values have been applied. Macro changes
  still begin on the original absolute 32-frame control clock. Empty microphone
  input clears the same rolling-history cells in contiguous spans, preserving
  signed recording compensation and the history clock.
- BRINE 1.0.2 skips BBD reconstruction algebra only when held input and all five
  filter states are exactly positive zero at supported rates. The bucket clocks,
  LFO/oscillator phases, random seeds, rings and modulation keep advancing. Any
  excitation, negative-zero state or low-rate case retains the original path;
  existing chorus tails and future note response are preserved.
- Built-in editors with verified immediate change notifications reuse unchanged
  Live patterns and preparation signatures. These are LEAVEN, MARINADE, PICNIC,
  MORSEL, HEIRLOOM, BRINE and CITRUS. Custom/uploaded and older instruments retain
  polling. Tempo, edits, restore/import, adapter replacement, disable and reload
  invalidate the cache. Edits during asynchronous preparation are retried.
- Source audio validation proofs survive structural copies and normalization.
  Fresh JSON/Open, changed metadata/PCM, and accessor/unusual records retain
  validation. Recovery skips serialization only when retained payloads prove
  that its budget cannot fit; near-limit normalized checks remain authoritative.
- Timeline clip/canvas nodes survive unrelated selection and move actions.
  Waveform and note previews keep their original sample/draw order and opacity,
  but allocate/draw visible previews in short cooperative chunks. An LRU releases
  old offscreen backing stores; visible canvases are pinned, so its 24 MiB target
  is not a hard whole-page memory cap.
- Timeline gestures are frame-coalesced and synchronously flush the final input
  on pointer-up. Escape/cancel releases queued work. Piano note and automation
  point drags update retained geometry instead of rebuilding an entire score;
  topology changes still rebuild the required controls.
- WAV/master/freeze rendering reuses scratch buffers and private meter storage.
  It yields on a roughly 10 ms work budget rather than large fixed batches,
  using `scheduler.yield()` where available and the timer fallback elsewhere.
  Original audio block lengths, routing, tails and output bytes are retained.
  A single DSP block or cold constructor can still exceed that budget.

There is no automatic freeze, lower oversampling, shortened tail, changed sample
rate or added playback buffer. SAUTÉ's history-preserving bypass policy is
unchanged. Closed CPU inspection remains inactive.

## Evidence and limits

The first causal browser experiment used the actual serialized production
Worklet and normal browser flags, with identical fixture hashes, 12 seconds of
warmup, a six-second untraced CPU window, then a separate six-second trace.
Inlining common interpolation reduced collected temporary heap data in clean
eight-track playback from 22.00 to 11.68 MiB/s (about 47%). Independent clock-reference
and indexed-loop experiments added no allocation benefit and were not shipped.

In the matched mixed-effect pair, collected heap data fell from 93.25 to
81.78 MiB/s; Render mean was 0.836 to 0.803 ms, P99 2.060 to 1.584 ms, and tasks
longer than the 2.667 ms quantum fell from 5.34 to 1.78 per thousand. Clean
single-window tails were noisier despite reduced GC, so this experiment does
not establish a universal deadline improvement. GC byte differences estimate
collection churn, not exact allocation bandwidth or a retained-memory leak.

The environment is headless Chromium 156 on Linux with SwiftShader software
graphics, a two-core CPU quota and 8 GiB RAM. CPU percentages use one core as
100%; quota data accompanies each phase. Main-thread UI, port/constructor work
and interleaved audio-thread GC are not all represented by the in-app insert
profiler. These are synthetic lab projects, not measurements of a physical
interface or the user's saved project, and deadline observations are not
recordings of audible dropouts. Complex chains can still exhaust one audio
thread; exact work reductions do not make every possible effect count feasible.

## Final production browser comparison

The final standalone SHA256 is
`2e54e894feb340c7b03235404ba90e681fb911e5bb0ecac6072f70971b77ba07`.
Every observation used a fresh browser/context, 12 seconds of warmup, six
seconds of untraced CPU observation and a separate six-second trace. The heavy
case used two trials per version in alternating order; its distributions below
pool the actual Render events, rather than averaging percentiles.

| Eight recorded tracks | Render mean ms, old → new | P99 ms, old → new | Over-quantum tasks per 1,000, old → new | Collected heap MiB/s, old → new |
|---|---:|---:|---:|---:|
| Clean | 0.242 → 0.228 | 0.664 → 0.676 | 0.89 → 0.00 | 22.01 → 11.69 |
| Mixed effects | 0.816 → 0.767 | 2.154 → 1.634 | 4.00 → 2.22 | 93.57 → 81.99 |
| Demanding amp/pedal chains, two trials | 2.213 → 2.085 | 4.394 → 3.364 | 110.86 → 53.67 | 432.80 → 149.30 |

Untraced total Chrome CPU changed from 51.83% to 46.37% for Clean, 70.37% to
62.89% for Mixed, and 129.26% to 118.95% for the heavy case. Main-thread time
fell from 23.13% to 18.31%, 22.70% to 17.86%, and 25.22% to 19.76% respectively.
Whole real-time-thread CPU (including interleaved tasks) changed from 8.91% to
8.21%, 30.96% to 28.98%, and 83.50% to 78.83%. These are different measurement
scopes; do not sum inclusive trace stages or present separate captures as an
exact CPU pie chart.

The heavy traces recorded 550 ms of aggregate quota throttling before and
175 ms after; untraced CPU windows had none. Clean and Mixed had no throttling.
Rare maxima were not uniformly better: Mixed maximum increased from 3.731 to
5.986 ms and the pooled heavy maximum from 10.567 to 11.723 ms. Earlier clean
runs also had negative tails; one 8.690 ms wall task used only 1.085 ms of
thread CPU, establishing substantial off-CPU delay without identifying its
cause. The final clean run had no over-quantum tasks, but this is a short lab
observation, not a dropout-free guarantee. Very demanding chains still exceed
the callback budget regularly, so the heavy-case capacity limit remains.

The isolated factory tests held the other six recorded tracks clean and kept
the two original owners' exact parameters. They are absolute scene costs, not
additive per-effect allocations:

| Two active amp/pedal instances | Collected heap MiB/s, old → new | Whole real-time CPU %, old → new |
|---|---:|---:|
| BROILER | 49.49 → 40.72 | 20.85 → 19.51 |
| SUNDAY | 99.65 → 49.09 | 34.20 → 32.09 |
| CELLAR | 101.05 → 82.15 | 31.56 → 26.94 |
| BOARD | 255.37 → 48.83 | 40.31 → 34.59 |

BROILER and BOARD's final secondary step had some worse short-window wall tails
while saving churn/CPU; those results are retained in the evidence. The combined
production comparison above is the release-level test.

Supplementary idle/edit measurements used the first-fix build; the relevant
BRINE, Core and UI sources are unchanged in the final build. Eight prepared
hidden BRINEs, with zero voices/output, used 44.36% total Chrome CPU before and
27.19% after, versus empty-parent baselines of 14.21% and 13.97%. All steady
windows were unthrottled. In a legal 4,096-note stress score, the full eight-step
resize gesture plus final frames/previews took 4.150 to 1.227 seconds; aggregate
≥50 ms tasks fell from 3.739 to 0.744 seconds. A 4,096-point automation gesture
took 2.360 to 0.986 seconds, with ≥50 ms task time falling from 1.583 seconds to
zero. These include the entire automated gesture and completed visible previews,
not first-input latency, and are stress cases rather than normal small scores.

## Verification

The existing portable suite passes 186 exact released PCM comparisons and nine
closed-profiler/steady-path guards. New preservation suites cover common clip
interpolation/selected seams, SERVICE control boundaries, signed microphone
history, GLAZE controls/feature transitions, native note scheduling, WAV/stem
bytes, linear/loop master PCM, freeze packets and BRINE silent-to-active state.

Additional tests verify Canvas command parity, retained editor geometry,
RAF/pointer cancellation, validation/recovery boundaries, cache invalidation,
custom-host fallback and asynchronous preparation races. Expected audio and
musical traces are captured only from the immutable release, not the new DSP.
Ordinary portable checks do not require Git history.

The additional amp gates include 66 BROILER PCM/history cases plus four
serialized cases, 100 SUNDAY PCM/full-state cases plus ten serialized cases,
72 CELLAR PCM/full-state cases plus six serialized and five partition checks,
and 54 BOARD PCM/physical-state/public-API cases. They retain signed zero and
cover control ramps, stereo transitions, quality changes, bypass and reset.
Existing circuit/legacy/project suites also run; their obsolete historical
effect-count assertion is distinguished from the current catalog checks.

Run `npm run check:playback-stability` and `npm run check:realtime-performance`
from the site source checkout. BRINE's source includes its separate
`node silence-performance-checks.cjs` regression. Browser tests require
Playwright and Chromium; performance comparisons need an otherwise idle CPU.

Final actual-Worklet validation compared 1,920,000 stereo channel samples across
five four-second cases against the released baseline, byte-for-byte. It includes
all four changed amp families, automation/LFOs, fractional/reverse regions and
arrangement wraps. Nine visible Canvas RGBA/geometry comparisons and 17 actual
editing workflows passed on the identical UI source lineage. Nine final host
groups use actual manifest URLs, verify all seven notification-driven caches,
and preserve uploaded/legacy polling. The complete standalone and source archive
retain the portable frozen-reference checkers.
