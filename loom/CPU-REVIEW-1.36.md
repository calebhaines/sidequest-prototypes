# GALLEY 1.36 · CPU review and track power

The power button beside each track name and at the top of each mixer channel
switches that complete track off. Its clips, instrument patch, EQ, inserts,
sends, automation, arm and solo choices remain in the project. **OFF** in the
mixer identifies a parked track; press the same button to enable it again.

Off is different from Mute: Mute keeps processing histories warm. Freeze keeps
the rendered sound playing while suspending the original processing. Power off
stops the track's sound and releases its processing, including frozen playback.
A disabled Solo does not silence enabled tracks.

## What stops

- The hosted instrument saves its latest settings, terminates its Worklet or
  fallback callbacks, disconnects its own nodes, and unloads its editor frame.
  Its timers and animation callbacks disappear with the frame. Other instruments
  retain the shared audio context and keep playing.
- The mixer skips its recorded/frozen clips, live input, note scheduling, EQ,
  five inserts, automation evaluation, gain/pan/send mixing and meter reads.
  Its insert/EQ runtime and audio buffers are released. Disabled profiler rows
  retain identification only; they allocate no timing rings or sample slots.
- Its microphone monitoring, instrument audition and active FERMENT MIDI capture
  stop. Recording or printing a disabled source requires enabling it first.
  Existing stored notes can still be edited, exported or restored without
  starting an instrument.

Saving, recovery, Open, Undo and Redo retain the power state. Enabling restores
the saved patch into fresh processors and rejoins the current arrangement
position. The explicitly disabled track's old oscillator phase, sounding notes
and effect tails are not a suspended live snapshot. Its editable settings and
musical source are preserved. Shared return/master tails continue because those
processors belong to the mix and may serve other tracks.

There is no continuing per-track synthesis or effect callback after shutdown.
Shared mixer bookkeeping, shared LFO dependencies, return/master processors and
the browser still have their own CPU cost. Web Audio also retains registered
processor module code until the shared context closes; this is code memory,
not an active instrument processor.

The switch waits for current patch capture before completing. A failed capture
keeps the track enabled; a failed re-enable leaves the saved track off. Active
recordings, renders, transfers and other incompatible operations must finish
before changing track power. A frozen track can be switched off without changing
its cache; its sample-rate and recipe restrictions remain in force.

## Sound-preserving changes

The comparison baseline is the released GALLEY 1.35 commit
`59a31f7563ab60dff7f54cd3eb5b3bc04ec34a15`. Its original sources were captured
before implementation. Frozen fixtures are generated only from that immutable
release, never from the candidate.

SUNDAY caches unchanged preamp/cabinet values and avoids rebuilding cabinet
filters for unrelated output/blend automation. FERMENT calculates one identical
SVF coefficient tuple for the four existing stereo/oversample signal steps.
BUTTER reuses the unchanged bias baseline inside its existing nonlinear colour
stages. The mixer resolves unmodulated controls once per block and reuses empty
clip candidate lists. The LFO runtime reuses its immutable ordered parameter
descriptors, removing 128 temporary arrays per 128-frame callback with four
active LFOs. Its arithmetic and shared phases are unchanged. Mixer gain
smoothing and audio multiplication/addition order are unchanged.

No oversampling, signal filter step, envelope, noise clock, smoothing time,
control rate or release tail was reduced. Stateful bypass/zero-Blend processing
that affects later sound is retained. Flat track EQ and disabled mastering/
analysis were already cold and do not need new audio shortcuts.

The CPU inspector releases its timing runtime, report cache, histories, active
listeners, timers and observers when closed or hidden. Reopening starts fresh
measurements. Pause retains readings. Expanded unchanged reports avoid redundant
row/history painting; an unused per-sample timing array was removed. The main
interface also observes the master-playback panel's visibility and avoids
painting disabled meters or querying modal state twice per animation frame.

## Verification

Portable fixtures cover 183 effect lifecycle cases, 24 whole-mixer comparisons,
236 additional effect model/lifecycle cases and 17 integrated mixer scenarios.
They compare exact stereo PCM, meters and tails with the actual previous
release. Coverage includes odd callback sizes, 8–192 kHz sample rates across
the suites, automation, LFO dependencies, model changes, bypass/re-entry,
multiband processing, routing, mastering, Freeze and SERVICE. Optional
`disabled:false` and profiler off/light/after-close retain identical audio.

Dedicated checks also exercise zero per-track processing calls, instrument
shutdown, sibling isolation, pending loads, snapshot failure/rollback,
recording guards, current-transport note rejoin, project saving, frozen recipe
validity and CPU inspector resource cleanup.

## Measurements and limits

Final CPU comparisons used fresh Node processes for each version, mode and
trial, with only that version's factories loaded. Three trials rotated mode
and version order. Each had 1,024 sustained warm callbacks and 512 measured
128-frame callbacks at 48 kHz. Closing first ran 256 actual Light-profiled
callbacks. The ten-track fixture used 20 track inserts spanning all 19 effect
types, three bus/master inserts, automation and LFOs. Every child recorded its
source hashes; final LFO SHA-256 is
`13ec7f247f65e5e2e31a17473db513011dd83ead3c9965a46efe5e8677e1fc73`.

| Final isolated automation fixture | 1.35 | 1.36 |
| --- | ---: | ---: |
| Profiler never opened, median CPU-equivalent callback budget | 89.59% | 90.52% |
| Profiler actually opened then closed, median CPU-equivalent budget | 89.38% | 86.41% |

These results do not establish a uniform whole-mix speedup. CPU-equivalent
values include process compilation/GC threads and differ from callback wall
time or operating-system CPU. One current off trial retained 98.72 ms total GC
(including a 57.72 ms event) and a 32-callback wall maximum of 367.2% of that
batch's budget. For
actual Close, observed 32-callback wall P95/max were 95.63%/98.41%, versus
198.59%/317.14% in the baseline. Those are 18 observed batches, not per-callback
P95 measurements or a realtime guarantee. All off/paused/closed intervals
verified zero profiler timing reads and zero reports; only the current Close
released the retained profiler runtime.

The earlier paired test directly compared nine muted tracks with the same nine
tracks disabled: median processing budget fell from 80.24% to 12.17%, with
identical remaining-track audio. That run preceded the final LFO descriptor
cache and is reported separately. Deterministic counts independently show
SUNDAY cabinet rebuilds dropping from 128 to zero for unrelated output
automation, FERMENT coefficient setup from four to one per frame, and the
four-active-LFO descriptor arrays from 128 to zero per callback. Every original
signal/filter/oversample step is retained.

From the repository:

```sh
npm run check:galley-cpu-review
npm run check:galley-cpu-review-browser
```

From an extracted editable source download:

```sh
python3 build.py
node performance-2026-checks.cjs
node exact-effects-cpu-checks.cjs
node track-disable-project-checks.cjs
node track-disable-engine-checks.cjs
node disabled-host-checks.cjs
node track-disable-integration-checks.cjs
node cpu-lifecycle-checks.cjs
```

Timing comparisons require an otherwise idle machine and an explicit immutable
baseline. They are informational measurements, not pass/fail deadlines or an
operating-system CPU estimate for an arbitrary project. Browser/process totals,
audio callback timings and deterministic operation counts are separate metrics.
