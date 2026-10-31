# GALLEY · CPU resources

Open **CPU resources**, just above the arrangement. It is an inspection hatch:
closing it stops profiling. Opening it does not start audio or change the sound.
Use the normal transport or microphone monitoring to hear and measure a session.

## A useful first look

1. Keep **Light** sampling for a first pass and let readings warm up.
2. Open a track to inspect its five insert slots, or a return or the master for
   four slots. Tracks
   also expose their built-in EQ and channel mixing.
3. Compare the **Insert hotspots** list and the recent callback-load history.
4. Open **Other engine work** to see clip/timeline preparation, LFOs, recording,
   transport events, live meters and diagnostic report preparation.
5. Use **Reset readings** before comparing a new setup, **Pause** to hold a
   reading, or **Save report** to download the timing data.

Click an assigned insert's name to open its existing effect editor. Muting a
track does not necessarily stop its processing. Bypass behaviour also differs
between effects: fades and tails may still cost time. Compare the measured work
rather than assuming a silent or bypassed processor is free.

## What the numbers measure

The percentage is sampled elapsed time divided by the audio callback's available
block time. For example, 128 frames at 48 kHz allow about 2.67 ms per callback.
A measured 0.67 ms callback uses about 25% of that deadline budget. This is not
an operating-system CPU percentage or a measure of every process on the machine.
Elapsed time can also include interruptions by the operating system.

The native callback total includes GALLEY's own audio mixing and inserts,
recording/input history, normal meter reports and the diagnostics work measured
inside that callback. It excludes upstream instrument synthesis, native audio
nodes, percussion voice inserts and browser work performed outside the measured
callback. Those may share the same audio rendering thread and can still be
expensive even when GALLEY's measured percentage is low.

Owner rows include the effects and EQ below them. The engine row also includes
its individual stages. These are nested views of the same processing: **do not
add all rows together**. An insert's mean is its contribution per sampled
callback, including callbacks where it did no work.

Mean and worst readings use a bounded recent window of up to 256 sampled
callbacks. P95 means approximately 95% of those observations fall below that
value. Percentiles use bounded histogram estimates and are labelled accordingly.
A sampled timing above the block budget is an observation, not proof of an
actual audible dropout. Missed callbacks and unmeasured processors are outside
that count.

## Clock precision matters

Chrome's AudioWorklet currently exposes a coarse `Date.now` clock rather than
`performance.now`. A single short effect often completes below its clock
resolution. The panel marks these readings as estimates, shows the clock and
sampling coverage, and displays **< clock** for unresolved zero observations.
That means below the measurement's resolution, not zero cost.

Averages over more callbacks can reveal sustained differences. Isolated peaks
and tiny differences are less trustworthy with a coarse clock. Other browsers
or the ScriptProcessor fallback may expose a different clock. If no usable clock
is available, the panel reports that timing is unavailable; context information
can still be shown.

## Keeping the inspector light

- **Light** samples one callback in each group of 16; **Balanced** samples one in
  four; **Deep** samples every callback. The chosen position varies between
  groups to avoid repeatedly measuring the same periodic DSP work.
- Reports update at about four times per second. Histories and statistics are
  bounded; profiling performs no extra audio rendering or test tones.
- Collapsing the hatch, scrolling it out of view, hiding the page, or opening
  SERVICE or a dialog pauses collection. The inspector has no polling loop or interface
  observers running while closed. It adds no timing reads to audio processing
  while disabled.
- Profiling is not literally free when enabled. Light sampling is the default
  because it uses fewer clock reads. Use Deep briefly when finer inspection is
  useful, then pause or close the hatch.

## Browser and audio context

The folded context view shows the audio mode, sample rate, callback size,
reported base/output latency, clock information and a JavaScript heap estimate
when the browser provides one. Heap usage is not total application or system
memory. Instrument activity is descriptive and does not claim instrument CPU
measurements.

**Monitor interface stalls** is optional and off by default. When selected, it
observes main-thread tasks of at least 50 ms and animation gaps over 50 ms while
the panel is visible. Those are interface responsiveness observations, not audio
dropout detection. The monitor disconnects when profiling stops.

The downloaded JSON contains timing and engine metadata. Audio, note contents,
instrument patches, session/track names and device identifiers are excluded.
Diagnostics are not saved in projects and do not alter Undo, recordings or WAV
exports.
