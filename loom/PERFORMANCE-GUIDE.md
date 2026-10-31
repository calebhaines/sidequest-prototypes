# GALLEY 1.25.1 performance maintenance

This release removes redundant work from the mixer, effects, display and shared
percussion inserts. It retains the audio algorithms, oversampling, smoothing,
control clocks, routing, delay/reverb histories and transport behavior.

## What was expensive

- Every mixer sample looked up LFO targets by constructing strings and querying
  maps, including when all LFOs were disabled. Static pan curves and the fixed
  limiter release coefficient were also recalculated for each sample.
- Several effects repeatedly calculated unchanged control transforms, nonlinear
  bias baselines, filter coefficients or metering logarithms. Automated inserts
  received complete parameter objects at every 32-sample control boundary.
- The interface repeatedly fetched the same meters, rebuilt automation metadata,
  read layout after writes, and repainted offscreen or unchanged controls.
  Meter transitions animated width and height, forcing layout between updates.
- Percussion voices resent unchanged effect patches on strikes and pushed meter
  snapshots even when no editor was reading them.
- Disabled profiling did not read timing clocks or send reports, but the
  production audio callback still entered no-op profiling helpers. Those calls
  now have a direct unprofiled path. Opening and closing the inspector does not
  leave periodic profiling work running.

## What changed

The mixer compiles LFO target handles when state changes and reuses the exact
current target buffers. Static pan calculations and fixed coefficients are
cached without reassociating floating-point multiplication. Only changed
numeric automation values go to effect setters; manual settings are still
applied through the normal state update.

Nine effect modules cache exact control-derived results. Caches follow actual
smoothed values, so moving controls keep their original response. BROILER,
SAUTÉ, BUTTER and PRESERVE retain their processing histories and oversampling;
bypass and zero wet settings retain the original warming behavior. SCALES keeps
its analysis budget and accumulation order. Pitch analysis and effect tails are
not shortened, approximated or disabled.

The interface shares one meter snapshot per paint, reuses target metadata while
reading current manual baselines, and suspends drawing for hidden panels.
Automation Write continues to capture while its display is offscreen. Meter
bars animate transforms with their existing durations and ranges, rather than
changing layout geometry. The CPU inspector does no snapshot reads or painting
while closed.

Percussion inserts deduplicate normalized patches while still detecting caller
mutations, bypass, replacement, reordering and removal. Meter getters request
snapshots only when read, with one outstanding request per voice. The audio
processors continue rendering all signal, history, noise and tails. Permanent
bank disposal explicitly terminates its processors; it does not reset or clear
large audio buffers in a realtime message handler.

## Measurements

Node measurements compare the actual released 1.25 sources (commit
`47d210f95124c54ba5aa4a87f4370986963f32c6`) with this release in the same native
JavaScript realm. Each version loads its own effect factories. Warmed cases
alternate in order; reported values are medians of three trials at 48 kHz with
128-frame blocks and ordinary meter snapshot cloning.

| Fixture | Released CPU / block | Updated CPU / block | Reduction |
| --- | ---: | ---: | ---: |
| Eight-track mixer, no inserts | 646 µs | 206 µs | 68% |
| Dense effect chain stress test | 4,673 µs | 3,418 µs | 27% |
| Effects, automation and LFO stress test | 5,384 µs | 3,895 µs | 28% |

The dense fixtures deliberately use 35 insert instances. They can exceed a
realtime callback budget on the test machine; their figures measure saved
processing work rather than promising a particular number of playable effects.
These CPU timings are informational, hardware dependent and include normal
runtime variation. They are not operating-system CPU readings for your project.
The eight-track mixer was also measured with profiling enabled, and after
profiling had been enabled and disabled again.

Deterministic steady-state checks over 1,024 frames show exponentials falling
from 1,032 to 8, inactive LFO lookups from 38,272 to zero, and repeated pan
sine/cosine calls from 36,864 to zero. Profiling clocks remain at zero while off,
including after closing the inspector. These are operation counts, not timing
estimates.

Browser measurements separately isolate display work using the same released
audio DSP, a fixed viewport and eight nonzero recorded stereo tracks. Timing
windows contain no operation-count wrappers. Layout/paint traces and plain
main/audio-thread CPU samples are kept separate from Node DSP measurements.
The first display-only comparison reduced median main-thread CPU with the
profiler closed from 80.2% to 40.9% of one core. A separate fixed-viewport meter
comparison reduced layouts from 301 to 100 per five seconds (closed), 277 to
110 (Light profiling), and 276 to 101 (after closing). The two comparisons isolate
different changes; their percentage savings must not be added together.

## Audio and behavior checks

- 162 released effect/model/lifecycle fixtures compare exact stereo PCM,
  sampled meters and tails across all sixteen effects, including model changes,
  partial updates, bypass/reentry, reset, odd block sizes and 8–192 kHz rates.
- 46 integration comparisons cover all effects with static and automated
  parameters, eight-track mixes, recorded clips, LFOs and multiband compression.
- Two deterministic regression groups guard cold-off and after-disable work
  without fragile timing limits.
- Shared percussion checks compare actual serialized Worklet and fallback audio
  against the released patch-delivery and metering behavior. The repeated-strike
  fixture drops from 129 to 7 patch messages; unobserved meter reports are zero.
  Chromium also verifies that the disposal message reaches its processor before
  port closure, and disposed processors return false with zero output.
- Browser checks cover metadata freshness, Undo, project reload, offscreen
  Write/pause behavior, visibility reentry, resize fallback and rendered meters.

The frozen audio fixtures were generated only from the immutable released
sources. Extracted source downloads run those checks without Git or an old
checkout.

## Reproducing the checks

From the repository root:

```sh
npm run check:galley-performance
npm run check:lfos
npm run check:cpu
```

From the extracted GALLEY source directory:

```sh
python3 build.py
node performance-regression-checks.cjs
node effects-performance-checks.cjs
node shared/voice-effects-performance-checks.cjs
```

For informational benchmarks on an otherwise idle machine:

```sh
node loom/performance-regression-checks.cjs --matrix --ref working
node loom/performance-regression-checks.cjs --bench --refs 47d210f,working --modes off,after-disable,light,deep
```

`ui-performance-checks.cjs` uses Playwright and Chromium for interface checks.
Its normal candidate mode does not need an old checkout; comparative timing
requires an explicit saved baseline and candidate. Do not run builds, other
browsers or DSP benchmarks at the same time as timing measurements.
