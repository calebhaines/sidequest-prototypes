# PICNIC performance and audio checks

Measured on 15 October 2026 in headless Chromium 154 in the development environment.
These measurements describe one instrument instance on this machine, not every
device or the cost of eight simultaneous instruments.

The default six-part 32-step phrase ran twice for about four seconds after warm-up. Five
sampled voice counts were 16, 13, 14, 10 and 11. Chromium's Web Audio
`renderCapacity` averaged **5.90–8.00%**, with a highest sampled value of **12.53%**.
That leaves substantial audio-thread headroom in this test. Renderer task CPU
was **8.51–10.30% of one core**, compared with **2.38–3.13% idle**; script CPU was **0.83–0.91%**.
Renderer task CPU excludes the audio rendering thread, so these are separate
measurements rather than quantities to add together.

The full CPU fixture and raw sampled Web Audio metrics are emitted by:

```sh
PICNIC_QA_FILTER='CPU' node picnic/browser-checks.cjs
```

The report is written to `/tmp/picnic-browser-qa/cpu-report.json` by default.
Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` for an existing browser installation.
The browser checks also capture actual native playback and verify finite stereo
PCM. AudioContext starts after an explicit gesture; editing an idle project does
not initialize its audio graph.

The self-contained HTML also plays and exports WAV with every network request
blocked. Direct `file://` navigation could not be exercised because this managed
Chromium installation blocks that URL scheme; the instrument does not require
network assets or modify browser policy.

The sampler decodes only samples needed by selected presets. Its voice allocator
limits simultaneous voices to **32**, including out-of-order manual and scheduled
notes. Tests check the cap at every event boundary in randomized scheduling, not
only the size of a bookkeeping array. Shared effect sends avoid an effect graph
per note, and source-specific cancellation prevents a superseded live generation
from restarting after its boundary.

A separate maximum-level 32-voice rendering test peaked at **0.9972**, with no
nonfinite samples. A bounded master stage is shared by live playback and offline
rendering. Source PCM and SoundFont zone, root, tuning, loop and envelope metadata
remain available in the library. Exact event parity is tested; repeated native
Web Audio renders may differ in floating-point rounding by less than `1e-6`.

Existing instruments' synthesis and SERVICE playback are unchanged. PICNIC adds
one optional instrument to GALLEY's chooser and uses its existing discrete note
scheduler; it does not add the previously rejected multi-instrument SERVICE live
mode.
