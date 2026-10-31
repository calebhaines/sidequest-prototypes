# GALLEY mix upgrades

This guide covers the sweepable track EQ, BUTTER multiband compression, expanded CHAR circuits and fifth track insert in GALLEY 1.25.0.

## Track EQ and inserts

Each of the eight instrument tracks now has **five insert slots**. Return A, Return B and Master keep four slots each; percussion instruments keep two effects slots per voice. Slot order still determines processing order.

The four EQ gain knobs keep their ±12 dB range. Low and High remain shelves at 100 Hz and 10 kHz. Each mid gain now has a paired **Sweep** knob:

| Control | Range | Reset value |
| --- | --- | --- |
| Low-mid sweep | 80–2,000 Hz | 400 Hz |
| High-mid sweep | 400–10,000 Hz | 2,500 Hz |

Drag a sweep knob vertically; hold Shift for finer movement. The knob follows a logarithmic frequency scale. Enter an exact integer frequency in the Hz field. Arrow keys move 1 Hz, Shift + arrows or Page Up/Down move 10 Hz, and Home/End select the limits. Double-click, Enter or Space resets that individual knob. Gain knob keyboard steps remain 0.1 dB, or 1 dB with Shift/Page keys.

**Flat resets the four manual gains only** and retains both sweep frequencies. Enabled automation still controls playback. A sweep at 0 dB does not colour the audio; raise or lower its paired gain to hear the selected frequency. The EQ adds no buffering delay. At unusually low sample rates, effective filter frequencies are limited below Nyquist.

## BUTTER: one circuit or three bands

Add BUTTER to an insert and change its band mode from **Full band** to **Three bands**. Full-band mode remains the default and preserves the existing compressor behavior. Three-band mode reveals two crossover controls and Low, Mid and High cards.

| Split | Range | Default |
| --- | --- | --- |
| Low / mid | 50–800 Hz | 200 Hz |
| Mid / high | 1,200–12,000 Hz | 2,500 Hz |

Each band has threshold (−60–0 dB), ratio (1:1–40:1), attack (0.02–100 ms), release (20–5,000 ms), trim (±12 dB), compression on/off and solo monitoring. The cards show band input/output levels and gain reduction. Turning compression off retains that band's trim; selecting several solos monitors their combination.

Model, Input, Makeup, knee, stereo linking and detector/colour controls are shared. Band threshold, ratio, attack and release replace their full-band counterparts while multiband mode is selected. Band timing is manual; the selected compressor family still supplies its detector character and program memory. Global Makeup is applied once after recombining the bands.

The two 24 dB/octave Linkwitz–Riley splits use phase compensation in both the processed and parallel-reference paths. Positive Dry / wet settings therefore blend against a phase-matched reference without crossover cancellation; that reference has an all-pass phase response. Settled zero Dry / wet and bypass return the original dry signal after a short transition. Solo applies to both reference and compressed paths. Mode changes also transition smoothly.

## CHAR: fifteen circuits

Use CHAR's **Circuit** selector with the existing Drive, Bias, Tone, Output gain and Dry / wet controls. Its original Soft saturation, Asymmetric diode and Wavefolder remain available with their original processing.

The twelve additions are Hard clip · silicon, Cubic overdrive, Round drive · arctan, Rectifier · octave up, Class-A valve, Push-pull · crossover, Transistor fuzz, Op-amp · feedback drive, LED clip · wide headroom, Starved fuzz · gate, Sine fold and Broken transistor. They cover clipping, folding, octave emphasis, asymmetric colour, gated decay and sagging overload. The new circuits use 4× oversampling and DC cleanup. They are original character models rather than measured hardware replicas.

BUTTER and CHAR are shared GALLEY effects, so the additions are also available in compatible percussion voice inserts.

## Projects, automation and diagnostics

Opening an older project appends an empty fifth insert to each four-slot instrument track, supplies missing EQ sweep defaults and fills in BUTTER's new defaults. Existing effects, four EQ gains, routing and automation remain in place. BUTTER stays full-band and existing CHAR circuit selections keep their meanings. New saves use the current schema; older GALLEY versions may not accept them.

Both sweep frequencies, numeric multiband controls and fifth-slot numeric effect parameters can be automated and targeted by the four LFOs. Discrete circuit, band-mode and compression/solo selections remain direct controls. EQ automation keys are `eq:lowMidFreq` and `eq:highMidFreq`; the fifth insert uses zero-based `fx:4:<parameter>` targets. Changes participate in project save/recovery and Undo.

The CPU resources panel now has **89 diagnostic rows**, including all eight fifth-track inserts. Multiband BUTTER is measured as one insert. Profiling covers GALLEY's mixer, track EQ and inserts, not instrument synthesis or percussion voice effects. Timings are sampled callback elapsed time, not total system CPU. Profiling is off while the panel is collapsed, hidden or out of view; see [CPU-GUIDE.md](CPU-GUIDE.md).

## Validation

Run from the repository root:

```sh
npm run check:mix-upgrades
npm run check:track-eq
npm run check:compressor
npm run check:lfos
npm run check:cpu
```

The upgrade checks cover legacy EQ PCM compatibility, frequency response and stable sweeps, multiband crossover/parallel behavior and independent controls, CHAR's original and new circuits, five-slot migration, automation/LFO targets, and live/offline/SERVICE integration. The existing EQ, compressor, LFO and CPU suites provide regression coverage.

After building, run `MIX_QA_BUILT=1 npm run check:mix-upgrades-browser` for actual knob gestures and exact Hz entry, reset/Flat/Undo behavior, fifth-slot editing and reorder, multiband controls, CHAR circuit selection, save/recovery and 89-row diagnostics. A useful listening check is to sweep a boosted mid band, compare BUTTER at wet/parallel/bypass settings, solo each compressed band, and compare CHAR circuits on the same source at matched output levels.
