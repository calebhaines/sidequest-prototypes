# GALLEY 1.42.1 · playback performance

The comparison baseline is the released GALLEY 1.42.0 merge,
`244ab5b41d14e42c8a588aea9a180725d0b71cba`. Frozen preservation fixtures
were captured from that immutable commit before comparing candidate audio.

## Findings

The production Chromium AudioWorklet missed its 128-frame audio deadlines with
recorded tracks and the CPU inspector closed. The eight/ten-track mixed and
four-microphone fixtures exceeded their 2.667 ms render quantum at 48 kHz.
Chrome's high-resolution audio Render tasks provide the wall-time evidence;
the Worklet's coarse Date.now readings are supporting observations only.
These are measurements on the test server, not a count of every audible click
or a capacity guarantee for other machines.

The closed CPU inspector already released its measurement runtime. Separate
insert-meter collection still built and cloned readings for every effect even
when all effect editors were hidden. Callback allocations and repeated state
compilation added more avoidable work around the signal processors.

## Changes

- CUPBOARD caches microphone targets and walks only enabled/fading microphones.
  Control smoothing stops doing work only when its double-precision recurrence
  has naturally reached a fixed value. Mono microphone filtering shares exact
  identical channel histories; split history and transitions retain stereo
  processing. Its direct convolution head traverses contiguous ring sections in
  the same multiply/add order.
- BOARD shares distortion circuit solves while its input and circuit histories
  are exactly mono. Before a divergent input or configuration change it restores
  every right-channel circuit state. Oversampling, nonlinear solves and the
  stereo response are retained. Constant circuit terms are cached and temporary
  render-block arrays are removed. Five/six-node network products use the same
  sequential arithmetic with cached right-hand-side values.
- CELLAR reads its immutable six-value history vector once per James-network
  step and preserves the original multiply/add order for every row and output.
- Original HOOD and PARALLAX avoid processing empty delay/reverb rings before
  their first excitation. Their write clocks and PARALLAX control smoothing
  still advance. Once excited, their complete tails and histories remain active.
  Existing effect and SAUTÉ finite bounds take an exact fast path for ordinary
  samples.
- Realtime hosts reuse private meter rows and clip candidate storage. Public
  meter snapshots retain independent rows. Unchanged clips and automation do not
  recompile on each fader movement; unchanged insert parameters do not resend to
  the processor. Automation and LFO changes still update the effective values.
- Rich insert readings are collected for the visible selected effect. Track,
  bus and master level meters remain available. Hiding the editor/page or opening
  a dialog or SERVICE clears the detail subscription. The CPU inspector's timing
  data remains separate, and knob edits preserve its existing measurement rings.
- Sound-control gestures keep an open piano-roll canvas and skip unrelated note
  fingerprinting and freeze-control rebuilds. Score and instrument-live changes
  retain their scheduling updates.

No sample rate, oversampling factor, convolution response, oscillator/envelope
clock, control rate, modulation phase or established release tail was reduced.
There is no automatic freeze, sound-quality downgrade or added playback buffer.

## Verification

The new portable suite covers 186 exact PCM comparisons and nine structural
resource/snapshot groups against the immutable release. It covers every effect,
mono/stereo circuit transitions, model/quality changes, odd blocks, automation
and LFO addition/removal, duplicate state updates, stop/panic, frozen playback,
realtime/default Core paths, and full/selected/absent insert-meter details.
Retained public snapshots remain stable after later callbacks.

CUPBOARD's sixteen acoustic/lifecycle groups remain in the source download.
The prior legacy fixtures are kept unchanged. The browser checks additionally
exercise production Worklet and ScriptProcessor callbacks, editor subscriptions,
open-piano editing and real hosted instruments.

## Paired native measurements

The same 48 kHz, 128-frame fixtures ran in three alternating-version trials,
with 256 warm-up and 768 measured callbacks per observation. Values below are
median process CPU as a percentage of the available audio duration. Process CPU
includes runtime/JIT work and is distinct from audio-thread wall time.

| Fixture | 1.42.0 | 1.42.1 | CPU reduction |
| --- | ---: | ---: | ---: |
| Two recorded tracks, no inserts | 1.38% | 1.89% | -36.7% |
| Ten recorded tracks, no inserts | 6.13% | 4.74% | 22.7% |
| Four tracks, light effects | 10.82% | 10.07% | 6.9% |
| Four tracks, mixed effects | 47.80% | 39.65% | 17.1% |
| Ten tracks, dense mixed effects | 112.15% | 94.26% | 16.0% |
| Four tracks, four microphones each | 47.97% | 18.09% | 62.3% |
| Four tracks, four microphones with automation | 63.41% | 32.66% | 48.5% |

The dense ten-track native fixture remains too close to its deadline: measured
callback misses fell from 1594 to 345 across 2,304 callbacks per version, and
the median trial's 99th percentile fell from 4.992 to 4.611 ms. Isolated wall
outliers remain in other fixtures too. These results establish saved work,
not dropout-free operation at every effect count. No sound-quality setting was
reduced to obtain these measurements. Freeze still provides a reversible way
to release a demanding track's original effect processing.

The tiny two-track case did not improve: its absolute process CPU budget rose
by 0.51 percentage points, while its callback 95th percentile remained about
0.064 ms. The four-track mixed case also retained more rare callback misses
(5 to 18) despite lower average CPU. Short windows vary with runtime and
scheduling effects; there is no uniform improvement or zero-dropout guarantee.

## Production Chromium traces

The final standalone HTML was measured through its actual AudioWorklet at
48 kHz with the inspector closed. Chrome audio-destination Render tasks provide
high-resolution wall durations. Baseline windows contain about three seconds;
final windows contain about six seconds, so overruns are normalized per 1,000
render tasks. The deadline is 2.667 ms. These are four focused server fixtures,
not measurements of the user's saved project or a promise about another device.

| Recorded-track fixture | Mean ms, old → new | p99 ms, old → new | Overruns per 1,000, old → new |
| --- | ---: | ---: | ---: |
| Eight four-microphone CUPBOARD tracks | 1.590 → 1.205 | 3.282 → 3.207 | 24.2 → 18.5 |
| Eight amp-family tracks | 2.525 → 2.166 | 4.713 → 3.723 | 221.5 → 104.5 |
| Eight mixed-effect tracks | 0.884 → 0.968 | 1.924 → 2.461 | 2.7 → 8.1 |
| Ten mixed-effect tracks | 1.176 → 1.185 | 2.488 → 2.257 | 8.0 → 7.6 |

The targeted CUPBOARD/amp improvements repeat in the real browser, but the
mixed fixtures do not establish a general browser improvement. Warm-up/order
repeats showed substantial tail variation; total browser CPU also varies.
All outliers remain in the reports. Individual Chrome thread-clock events can
have coarse/inconsistent CPU durations, so per-event CPU deadlines are not
claimed. The heavy amp fixture still exceeds its deadline regularly; Freeze or
Track Off remains useful for demanding sessions without changing their recipes.

## Reproduce

`npm run check:realtime-performance` runs the portable exact-audio/resource
checks. `npm run check:realtime-performance-browser` runs the browser harness;
it requires Playwright and Chromium. Timing modes are informational and need an
otherwise idle machine. The source files include the comparison options.
