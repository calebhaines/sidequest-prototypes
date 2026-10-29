# SAUTÉ microphone preamp models

SAUTÉ adds twelve recognizable microphone preamp families and a transparent reference to GALLEY. It works on an instrument or audio track, either shared return, and the master bus. Models have different transfer curves, bandwidth, transient response and transformer-memory behaviour, rather than only different knob presets.

These are deterministic, reduced-order circuit interpretations, not measured replicas of a particular unit or revision. Familiar names below explain the inspirations behind the aliases. The effect adds no random noise or mains hum, and it has no phantom-power switch: those belong to the microphone and audio interface. Virtual loading changes the software model’s response; it does not change the electrical load at an interface input.

## Starting a sound

1. Select a model and set **Input gain** for the source. **Drive** pushes the model into its characteristic overload. Watch the live Input, Stage and Output readings and listen for the amount of colour you want.
2. Leave **Drive compensation** on to subtract the additional Drive gain after the stage. This keeps gain exploration more manageable. It does not subtract Input gain or undo the pad, and it is not automatic loudness matching: saturation changes dynamics and perceived level.
3. Set **Output trim** for the surrounding effects. Use **Colour** for the amount of circuit response and **Dry / wet** for a parallel blend with the original signal.
4. Open the advanced sections when you need input routing, a different circuit response, or tone shaping.

**Model** changes only the model, preserving all knobs. **Use circuit starting point** explicitly loads that model’s suggested Colour, Virtual input loading, Transformer core, Stage headroom, Bias asymmetry, Circuit feedback and Slew character. It preserves gain staging, compensation, pad, polarity, tone, Dry / wet and bypass. A **complete recipe** replaces every preamp setting; no control from a previous recipe is left behind.

The house default is Iron 73 with 6 dB Drive and Drive compensation on. Generic workshop settings provide a neutral starting position. Loading Iron 73’s circuit starting point is an explicit way to increase the transformer contribution and asymmetry.

## Models and inspirations

| Alias / ID | Recognizable inspiration | Character in SAUTÉ |
| --- | --- | --- |
| Clear / `clean` | Transparent modern preamp reference | Transparent gain and tone path. Colour, virtual loading and the circuit workshop are inactive. |
| Iron 73 / `iron-73` | Neve 1073 class-A transformer preamp family | Rounded class-A transfer, a broad low-mid foundation and transformer memory. |
| Punch 312 / `punch-312` | API 312 / 512 discrete op-amp preamp family | Forward discrete op-amp character, firmer transients and output-transformer weight. |
| Console 4K / `console-4k` | SSL 4000 E / G console microphone preamp family | Controlled console response, taut low end and a relatively symmetrical overload. |
| Super 9K / `super-9k` | SSL 9000 J / K SuperAnalogue microphone preamp family | Wide-band, high-headroom transformerless console response and fast transients. Transformer core is inactive. |
| Tube 610 / `tube-610` | Universal Audio 610 valve microphone preamp family | Soft valve overload, asymmetric harmonics, a softer upper range and slower recovery. |
| Red 47 / `redd-47` | EMI REDD.47 valve microphone amplifier | Lively valve presence and a more immediate upper-mid edge than Tube 610. |
| Valve 72 / `valve-72` | Telefunken V72 valve microphone amplifier family | Dense valve response, a narrower bandwidth, more core memory and a soft overload knee. |
| Helium 69 / `helios-69` | Helios Type 69 console microphone preamp family | Focused middle, open upper presence and lively discrete-console overload. The full Type 69 EQ is not reproduced. |
| Trident A / `trident-a` | Trident A-Range console microphone preamp family | Broad discrete-console colour, textured mids and gently rounded transients. |
| Blue 110 / `isa-110` | Focusrite ISA 110 transformer microphone preamp family | Extended transformer input response, restrained saturation and ample headroom. |
| Air 737 / `avalon-737` | Avalon VT-737sp valve preamp section | Open valve character, smooth overload and a restrained upper lift. No hidden compressor or channel-strip EQ. |
| TG Two / `tg-2` | Chandler Limited TG2 / EMI TG transistor amplifier family | Assertive upper mids, thick transistor harmonics and a transformer-led low end. |

The circuit workshop is deliberately common to every coloured model, including controls the original hardware did not expose. It lets you explore that family’s response without presenting a universal set of knobs as an exact hardware front panel. SAUTÉ does not reproduce the complete equalizers or dynamics sections of the referenced channel strips.

## Signal controls

| Control / saved key | Range or choices | House default | Purpose |
| --- | --- | --- | --- |
| Preamp model / `model` | Thirteen model IDs above | `iron-73` | Choose the transfer, bandwidth and transient family. |
| Input gain / `input` | −24–24 dB | 0 dB | Gain after the pad and before Drive. |
| Drive / `drive` | 0–36 dB | 6 dB | Additional gain into the model. |
| Colour / `colour` | 0–1 | 0.65 | Blend the circuit response against the gain-staged clean path. Inactive on Clear. |
| Output trim / `output` | −36–18 dB | 0 dB | Final wet gain; remains independent of Drive compensation. |
| Drive compensation / `compensate` | `on`, `off` | `on` | Subtract Drive gain only. It is nominal gain compensation, not loudness matching. |
| Input pad / `pad` | `off`, `10`, `20` | `off` | Digital attenuation of 0, −10 or −20 dB before Input gain. |
| Wet polarity / `polarity` | `normal`, `invert` | `normal` | Invert only the processed side of Dry / wet. Partial blends can cancel. |
| Dry / wet / `mix` | 0–1 | 1 | Blend the original stereo input with the final processed output. Zero is exact dry. |
| Bypass / `bypass` | Boolean | `false` | Return dry immediately. Circuit histories continue tracking the input. |

Colour at 0 bypasses the coloured circuit, while gain, pad, compensation, tone, output and wet polarity still apply. Dry / wet at 0 or Bypass returns the original samples. The channels have independent audio histories and do not crossfeed.

## Circuit workshop

| Control / saved key | Range | House default | Purpose |
| --- | --- | --- | --- |
| Virtual input loading / `impedance` | 150–10,000 Ω | 2,400 Ω | A virtual loading and damping response. This cannot change physical microphone loading. |
| Transformer core / `transformer` | 0–1 | 0.5 | Model-dependent core saturation and memory contribution. |
| Stage headroom / `headroom` | −12–18 dB | 0 dB | Relative change to the model’s overload point. Lower values reach overload sooner. |
| Bias asymmetry / `bias` | −1–1 | 0 | Shift harmonic asymmetry without introducing a constant output offset. |
| Circuit feedback / `feedback` | 0–1 | 0.5 | More feedback restrains stage nonlinearity; less allows more character. |
| Slew character / `slew` | 0–1 | 0.5 | Relative transient slew limitation; larger values soften faster changes. |

Headroom is relative to the selected model’s internal calibration. It is not a claim that 0 dBFS corresponds to a particular voltage, microphone gain position, or hardware output specification. These controls shape the interpretation of the circuit; their scales are musical controls, not calibrated replacement components.

Super 9K is transformerless and ignores Transformer core; that control is disabled while its saved value is retained for other models. Its other circuit controls remain available.

Clear ignores all workshop controls and Colour, while leaving their stored values available for the next model. Its Input, Drive, compensation, pad, polarity, tone, Output and Dry / wet controls remain active.

## Tone and cleanup

| Control / saved key | Range | House default |
| --- | --- | --- |
| High-pass / `lowCut` | 0–400 Hz; 0 is off | Off |
| Low-pass / `highCut` | 2,000–22,000 Hz; 22,000 is off | Off |
| Low shelf frequency / `lowFreq` | 40–400 Hz | 110 Hz |
| Low shelf gain / `lowGain` | −12–12 dB | 0 dB |
| High shelf frequency / `highFreq` | 2,000–16,000 Hz | 6,000 Hz |
| High shelf gain / `highGain` | −12–12 dB | 0 dB |

The filters and shelves are additional tools shared by all models, not copies of the original units’ EQ sections. Frequencies are bounded safely for the session’s sample rate. Numeric controls support automation on tracks, returns and the master; exact number fields provide precise adjustment without having to drag a slider.

## Suggested circuit starting points

Only the seven columns below are loaded by **Use circuit starting point**. A model change itself preserves these values.

| Model | Colour | Loading Ω | Core | Headroom dB | Bias | Feedback | Slew |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Clear | 0 | 2,400 | 0 | 12 | 0 | 1 | 0 |
| Iron 73 | 0.65 | 1,200 | 0.7 | 0 | 0.12 | 0.35 | 0.4 |
| Punch 312 | 0.65 | 1,500 | 0.55 | 3 | −0.03 | 0.65 | 0.2 |
| Console 4K | 0.55 | 1,200 | 0.12 | 5 | 0 | 0.8 | 0.18 |
| Super 9K | 0.45 | 1,500 | 0 | 10 | 0 | 0.92 | 0.06 |
| Tube 610 | 0.7 | 2,000 | 0.55 | −2 | 0.24 | 0.25 | 0.65 |
| Red 47 | 0.7 | 2,400 | 0.6 | 1 | 0.18 | 0.4 | 0.32 |
| Valve 72 | 0.7 | 2,000 | 0.8 | −1 | 0.2 | 0.45 | 0.7 |
| Helium 69 | 0.65 | 1,200 | 0.5 | 1 | 0.08 | 0.3 | 0.3 |
| Trident A | 0.6 | 1,200 | 0.4 | 2 | 0.06 | 0.45 | 0.4 |
| Blue 110 | 0.5 | 1,400 | 0.45 | 7 | 0.02 | 0.8 | 0.15 |
| Air 737 | 0.55 | 1,500 | 0.3 | 6 | 0.16 | 0.55 | 0.3 |
| TG Two | 0.7 | 1,200 | 0.75 | −1 | −0.12 | 0.3 | 0.42 |

## Complete recipes

Sixteen complete parameter snapshots cover all models and several uses: House iron, Close-mic punch, At the desk, Wide-open service, Warm vocal service, Red presence, Valve weight, Helium room, Textured console, Blue detail, Air on the pass, TG forward, Clear reference, Iron for bass, Small valve overdrive and Parallel TG edge.

Recipe gains and filters are starting points. Source levels vary; use Output trim and the meters when comparing. A shared return begins fully wet, and recipes with a partial Dry / wet blend replace that value explicitly.

## Implementation and portability

The same standalone preamp factory serves AudioWorklet playback, fallback playback and offline WAV rendering. It has no external assets. Projects store the flat `saute` parameter snapshot on its actual owner, including master and return inserts. Every parameter is validated against the catalog; numeric automation uses the existing GALLEY lane format.

The DSP uses stateful model profiles with anti-aliased nonlinear processing around an undelayed linear path, so parallel blending does not require a fixed audio delay. Saturation, filtering and slew still change phase and transients as part of their sound. Continuous controls are smoothed, and model changes are de-clicked. Seek, reset and Panic clear circuit histories. Zero input does not generate artificial noise.
