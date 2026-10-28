# BUTTER compressor models

BUTTER keeps GALLEY's original Clean compressor and adds eight recognizable analog-inspired families. Their detector, gain curve, timing, program memory, and colour responses differ; they are not eight sets of knob defaults applied to the same compressor.

These are deterministic, reduced-order models of useful circuit behaviour, not measured, circuit-exact reproductions of particular hardware units or revisions. The familiar names identify the references behind the aliases. There are no brand logos or external assets.

## Choosing a model or recipe

- **Model** changes only the compressor model. Threshold, gain staging, timing mode, blend, and other saved controls remain where you put them.
- **Use classic settings** explicitly loads the selected model's recommended Ratio, Attack, Release, Soft knee, Analog colour, Timing, FET mode, and Thrust settings. It preserves Input gain, Threshold, Makeup gain, Detector high-pass, Stereo link, Dry/wet, and bypass.
- **Complete recipe** replaces every compressor setting. All recipes include a complete normalized parameter snapshot, so a previous model's special modes or gain settings cannot leak into the next recipe.

The recommended settings are useful starting points, not claims that the hardware had identical knobs. Ratio, Threshold, and Soft knee remain continuous musical controls, including on the optical models. BUTTER does not reproduce every hardware ratio switch, limiter section, channel mode, or revision.

## Models and inspirations

| Alias / ID | Recognizable inspiration | Character in BUTTER |
| --- | --- | --- |
| Clean / `clean` | Original GALLEY BUTTER compressor | The original filtered-peak compressor and soft-knee curve. New Input gain and Stereo link are optional extensions; their defaults preserve the original sound. |
| Seventy-six / `fet-76` | UREI / Universal Audio 1176 FET family | Fast FET-style gain control and feedback character. Useful for urgent vocals, punchy drums, and more aggressive All-buttons compression. |
| Optical 2A / `opto-2a` | Teletronix LA-2A tube optical family | A softer optical leveller with tube-style colour and exposure-dependent optical memory. Sustained compression recovers differently from a short peak. |
| Optical 3A / `opto-3a` | UREI LA-3A solid-state optical family | A faster, firmer optical response, lighter memory contribution, and solid-state colour. |
| Vari 670 / `vari-670` | Fairchild 670 variable-mu family | Broad soft transfer, valve character, and recovery shaped by sustained program history. It is one continuous character, not six exact hardware time-constant positions. |
| Bus 4K / `bus-4k` | SSL 4000 G-series stereo bus compressor family | A coherent console-VCA bus envelope with a slower program component for bus control. |
| VCA 160 / `vca-160` | dbx 160 RMS / VCA family | RMS averaging and an OverEasy-style soft transition. The family reference includes the softer-knee behaviour of later members; this is not a claim to reproduce only the original hard-knee 160 VU. |
| Bus 2500 / `bus-2500` | API 2500 stereo bus compressor family | A forward VCA bus character with independent Thrust detector weighting. It does not expose a hardware Old/New topology switch. |
| Diode 609 / `diode-609` | Neve 33609 diode-bridge compressor family | Feedback-style compression, rounded recovery, and diode-bridge colour. It evokes the compressor section, with no hidden separate limiter. |

## Timing

**Manual** uses the displayed Attack and Release as base time constants. Detector averaging, gain-control behaviour, and model-specific memory still distinguish the analog models.

**Classic** uses the model's internal profile constants and program response. Manual Attack and Release are disabled and the editor shows the actual timing description. Their stored values are retained for a later switch back to Manual. Clean always uses its manual Attack and Release; selecting Classic does not change Clean.

The values below describe the implementation's time constants, not a measured promise about a hardware unit's 10–90% envelope time:

| Model | Classic timing in BUTTER |
| --- | --- |
| Seventy-six | 0.08 ms attack, 80 ms base release. All buttons uses 0.035 ms attack, 45 ms base release, and program-dependent recovery. |
| Optical 2A | 10 ms attack, 60 ms fast release, and an exposure-dependent 1–5 s slow optical memory component. |
| Optical 3A | 1.8 ms attack, 50 ms fast release, and a lighter 0.8–1.8 s slow optical memory component. |
| Vari 670 | 0.3 ms attack, 300 ms base release, and up to 3 s sustained-program memory. |
| Bus 4K | 10 ms attack, 100 ms base release, and a slower program component. |
| VCA 160 | 10 ms RMS integration, then 2 ms gain attack and 100 ms base release. The detector integration and gain attack are separate operations. |
| Bus 2500 | 3 ms attack, 100 ms base release, and program recovery. Thrust remains an independent detector choice. |
| Diode 609 | 3 ms attack, 100 ms fast release, and about 1 s slow recovery. |

Optical memory and program recovery make a single fixed Release value an incomplete description of these responses. A longer preceding phrase can hold down gain longer than a brief transient.

## Controls and storage

The effect ID remains `velvet`. Existing labels and default values remain unchanged; Ratio, Attack, and Release have wider ranges so the faster and slower model behaviours can also be explored manually.

| Parameter | Range / choices | Source default |
| --- | --- | --- |
| `model` | `clean`, `fet-76`, `opto-2a`, `opto-3a`, `vari-670`, `bus-4k`, `vca-160`, `bus-2500`, `diode-609` | `clean` |
| `input` | −24–24 dB, step 0.1 | 0 dB |
| `threshold` | −48–0 dB, step 0.1 | −18 dB |
| `ratio` | 1–40:1, step 0.1 | 4:1 |
| `attack` | 0.02–100 ms, step 0.01 | 12 ms |
| `release` | 20–5,000 ms, step 1 | 180 ms |
| `knee` | 0–18 dB, step 0.1 | 6 dB |
| `makeup` | −12–24 dB, step 0.1 | 3 dB |
| `sidechain` | 20–500 Hz, step 1 | 30 Hz |
| `colour` | 0–1, step 0.01 | 0.35 |
| `timing` | `manual`, `classic` | `manual` |
| `link` | 0–1, step 0.01 | 1 |
| `fetMode` | `normal`, `all-buttons` | `normal` |
| `thrust` | `off`, `medium`, `loud` | `off` |
| `mix` | 0–1, step 0.01 | 1 |
| `bypass` | `false`, `true` | `false` |

Input gain changes the signal presented to the compressor. Makeup gain follows compression and colour. Dry/wet follows that final gain; Dry/wet at 0 and bypass preserve the original dry samples exactly.

Detector high-pass filters the detector, not the audible output. It can reduce pumping from low notes or kick drums. Bus 2500's Thrust additionally weights the detector spectrum: Medium and Loud reduce low-frequency dominance and emphasize higher-frequency energy. Thrust does not directly EQ the audible signal.

Stereo link at 1 shares the stronger channel's gain reduction; 0 is dual mono, with intermediate settings providing partial linking. Linking acts on control gain without mixing the audio channels, including opposite-polarity stereo material.

Analog colour is inactive for Clean, as are Classic timing, All buttons, and Thrust. All buttons applies only to Seventy-six, and Thrust only to Bus 2500. Their stored values can remain in a project while another model is selected, but they do not silently colour unrelated models.

## Recommended classic settings

The explicit classic-settings action loads this subset. Analog entries select Classic timing; Clean selects Manual. All buttons defaults to Normal, and Thrust defaults to Off except for Medium on Bus 2500.

| Model | Ratio | Stored base attack / release | Soft knee | Colour |
| --- | --- | --- | --- | --- |
| Clean | 4:1 | 12 / 180 ms | 6 dB | 0.35, inactive |
| Seventy-six | 4:1 | 0.08 / 80 ms | 2 dB | 0.35 |
| Optical 2A | 4:1 | 10 / 60 ms | 8 dB | 0.35 |
| Optical 3A | 3:1 | 1.8 / 50 ms | 8 dB | 0.30 |
| Vari 670 | 4:1 | 0.3 / 300 ms | 12 dB | 0.40 |
| Bus 4K | 4:1 | 10 / 100 ms | 4 dB | 0.25 |
| VCA 160 | 4:1 | 2 / 100 ms | 10 dB | 0.25 |
| Bus 2500 | 4:1 | 3 / 100 ms | 4 dB | 0.30 |
| Diode 609 | 3:1 | 3 / 100 ms | 8 dB | 0.35 |

## Complete recipes

Twelve complete recipes cover the original model, all eight analog families, parallel compression, manual bus timing, and lighter levelling. Threshold and makeup are starting points: use the actual gain-reduction and output meters with your source.

| Recipe / ID | Starting point |
| --- | --- |
| House smooth / `house-smooth` | Original Clean with all original BUTTER defaults |
| Fast service vocal / `seventy-six-vocal` | Seventy-six peak control and moderate colour |
| All-in drum crush / `seventy-six-parallel` | Aggressive All-buttons FET compression at 35% Dry/wet |
| Warm optical vocal / `optical-vocal` | Soft Optical 2A curve and phrase-dependent recovery |
| Solid optical bass / `optical-bass` | Firmer Optical 3A start and sustained bass levelling |
| Slow-simmer ensemble / `vari-strings` | Low-ratio Vari 670 and a broad knee |
| Console bus glue / `bus-glue` | Bus 4K at 2:1 with a manual 30 ms attack |
| RMS punch / `vca-punch` | VCA 160 with a firmer knee for bass or drums |
| Thrust the pan / `thrust-drums` | Bus 2500 with Medium Thrust and manual timing |
| Diode room / `diode-room` | Diode 609 colour and rounded room-mic recovery |
| Gentle night shift / `optical-level` | Lower-ratio Optical 2A and a little dry signal |
| Clean transient trim / `clean-transients` | Original Clean, a shorter attack, filtered detector, and partial blend |

The catalog supplies model descriptions, timing explanations, recommended subsets, and complete recipe snapshots independently of audio initialization. AudioWorklet, fallback playback, and offline rendering use the same compressor DSP factory.
