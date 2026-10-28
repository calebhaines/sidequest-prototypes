# BROILER amplifier and pedal models

BROILER contains 22 amplifier characters, 11 speaker cabinets, and four internal pedal slots. The names below identify the musical references behind each alias. These are reduced-order, circuit-informed models: valve and diode behaviour, frequency-shaping networks, dynamic power response, and cabinet coloration are simplified for real-time use. They are not measured, circuit-exact reproductions of the named products.

The amplifier selector changes the head. It preserves a manually chosen cabinet and the pedalboard. **Matched cabinet** is a separate action. A **complete recipe** replaces the whole rig, including all four pedal slots and Workshop settings.

## Amplifiers

The first 12 models retain their existing IDs and stock sound. The ten additional aliases provide more specific guitar-amp starting points.

| Alias / ID | Recognizable inspiration | Musical character | Suggested cabinet |
| --- | --- | --- | --- |
| Solid-state clean / `clean-bass` | High-headroom solid-state bass heads | Firm lows and direct attack; original clean bass voice | Bass 4 × 10 |
| Warm flip-top / `flip-top` | Small vintage valve bass combos | Soft power bloom, rounded treble, warm low mids | Bass 1 × 15 |
| Valve stack / `valve-stack` | Large vintage valve bass heads | Broad lows and muscular drive | Bass 8 × 10 |
| Modern grind / `modern-grind` | Modern high-gain bass heads | Focused upper-mid drive with a clean low foundation | Bass 4 × 10 |
| Doom fuzz / `doom-fuzz` | Fuzz-driven bass stacks | Dense clipping and heavy lows | Bass 8 × 10 |
| American clean / `american-clean` | Classic American clean combos | Open treble and spacious, scooped mids | Open 1 × 12 |
| British crunch / `british-crunch` | Classic British valve heads | Forward mids and responsive crunch | Guitar 2 × 12 |
| High gain / `high-gain` | Modern cascaded high-gain heads | Saturated sustain and a controlled low end | Closed 4 × 12 |
| Portaflex 64 / `portaflex-64` | Ampeg B-15 Portaflex family | Pillowy bass, rounded fingers, soft power bloom | Vintage flip-top 1 × 15 |
| SVT 69 / `svt-69` | Ampeg classic SVT family | Large-head muscle and strong mid authority | Sealed 8 × 10 |
| V-4B 71 / `v4b-71` | Ampeg V-4B family | Open mids and lively, pick-friendly power crunch | Sealed 8 × 10 |
| SVT PRO / `svt-pro` | Ampeg SVT-PRO family | Modern hybrid-style attack and brighter definition | Ported 4 × 10 |
| Tweed 55 / `tweed-55` | Fender narrow-panel 5E3 Deluxe family | Small-combo warmth, loose bass bloom, early touch-sensitive breakup | Open 1 × 12 |
| Black panel 65 / `black-panel-65` | Fender blackface Twin Reverb / Deluxe Reverb family | Bright clean headroom, American mid scoop, firm bass | Guitar 2 × 12 |
| Copper 30 / `copper-30` | Vox AC30 Top Boost family | Chiming upper mids and a lively EL84-style edge | Guitar 2 × 12 |
| Royal 68 / `royal-68` | Marshall late-1960s Plexi / Super Lead family | Open British crunch and power-stage bite | Closed 4 × 12 |
| Iron 800 / `iron-800` | Marshall JCM800 2203 / 2204 family | Sharper cascaded crunch, focused bass, cutting upper mids | Closed 4 × 12 |
| Dual red 92 / `dual-red-92` | Mesa/Boogie Dual Rectifier family | Thick saturation, broad low-end weight, assertive treble | Closed 4 × 12 |
| Cali IV / `cali-iv` | Mesa/Boogie Mark IV family | Focused singing gain, tight preamp lows, articulate mids | Closed 4 × 12 |
| Fifty-one / `fifty-one` | Peavey 5150 family | Dense, aggressive gain and a biting upper-mid centre | Closed 4 × 12 |
| Citrus verb / `citrus-verb` | Orange Rockerverb family | Dark British weight, chewy low mids, grainy drive | Closed 4 × 12 |
| Jazz 120 / `jazz-120` | Roland JC-120 Jazz Chorus family | Fast, clean solid-state attack and wide headroom | Guitar 2 × 12 |

Black panel 65 and Citrus verb do not contain hidden reverbs; use the spring pedal. Jazz 120 does not contain a hidden chorus; add the chorus pedal. Cali IV does not imply a separate five-band graphic EQ. These distinctions keep each available control and signal stage explicit.

The new heads use distinct gain-stage placement and dynamic networks, rather than a common distortion followed by ten EQ presets. The following notes describe BROILER's actual reduced-order choices, not the complete hardware schematics:

| Model | Architecture used in BROILER |
| --- | --- |
| Tweed 55 | Two nonlinear stages, 6V6-style power response, little feedback, and a softer supply. A simplified James-style network approximates its broad tone shape; the hardware 5E3's interactive volume/tone circuit is not reproduced exactly. |
| Black panel 65 | Two relatively clean stages, an early American-style tone network, stronger feedback, and 6L6-style power response. Twin and Deluxe variants are a family reference, not selectable schematics. |
| Copper 30 | Three stages, a British-style network between gain stages, EL84-style power response, little feedback, and stronger cathode-bypass character. The AC30 Top Boost network is simplified. |
| Royal 68 | Three stages, a British-style tone network between stages, EL34-style power response, and a bright preamp character. The model emphasizes open power crunch rather than simulating patchable Plexi channels. |
| Iron 800 | Three cascaded stages with a colder-biased clipping stage, a later British-style tone network, tighter coupling, and EL34-style power response. |
| Dual red 92 | Four stages with a colder-biased clipping stage, a late American-style tone network, 6L6-style power response, and a softer supply. It does not expose hardware channel or rectifier-mode switches. |
| Cali IV | Four stages with the American-style tone network early in the gain path, tight interstage bass filtering, stronger feedback, and 6L6-style power response. |
| Fifty-one | Four tightly coupled gain stages with a colder-biased clipping stage, a later British-style tone network, and 6L6-style power response. |
| Citrus verb | Four warmer-biased stages, a later James-style tone approximation, EL34-style power response, and a darker bandwidth. The James-style approximation is not a claim about the exact Rockerverb schematic. |
| Jazz 120 | A clean solid-state stage, broad-band response, strong feedback, and a Baxandall-style tone approximation. Chorus remains a separate pedal. |

Stock valve choices follow these profiles; explicit Workshop choices replace those response characters. Valve names describe reduced-order gain, headroom, and saturation responses, not a physical tube substitution or a full schematic solver.

## Amplifier controls

The face keeps input, drive, bass/middle/treble, power drive, cabinet, output, and dry/wet close at hand. The Workshop exposes the remaining controls. Stock choices and neutral new-control defaults preserve the 12 existing amp sounds and the 13 original recipes.

| Parameter | Range / choices | Default | Purpose |
| --- | --- | --- | --- |
| `ampEnable` | `on`, `off` | `on` | Turn the head on/off while keeping input/output trim, the pedalboard, and the selected cabinet active; choose DI as well for a pedals-only rig |
| `preampTube` | `stock`, `12ax7`, `12at7`, `12au7` | `stock` | Choose stock or alternative preamp-valve gain and response |
| `powerTube` | `stock`, `6v6`, `6l6`, `el34`, `el84`, `kt88`, `solid` | `stock` | Choose stock or alternative power-stage character |
| `toneStack` | `stock`, `american`, `british`, `baxandall`, `james`, `flat` | `stock` | Select the response network used by the tone controls |
| `bias` | −0.8–0.8 | 0 | Change valve asymmetry and operating-point character |
| `voltage` | 0.6–1.4× | 1× | Change supply-related headroom |
| `feedback` | 0–1 | 0.5 | Adjust the power-stage negative-feedback response |
| `tightness` | 0–1 | 0.5 | Shape how low frequencies feed the driven stages |
| `bright` | 0–1 | 0 | Add a bright bypass character |
| `coupling` | 0–1 | 0.5 | Adjust interstage low-frequency coupling |
| `cathode` | 0–1 | 0.5 | Adjust cathode-bypass coloration |
| `transformer` | 0–1 | 0 | Add transformer coloration |
| `powerScale` | 0.1–1 | 1 | Adjust the power-stage scale |
| `micType` | `stock`, `dynamic57`, `ribbon121`, `condenser87` | `stock` | Stock, 57-style dynamic, 121-style ribbon, or 87-style condenser character |
| `cabLowCut` | 0–250 Hz | 0 Hz | 0 inherits the cabinet's existing low-frequency limit |
| `cabHighCut` | 1,000–20,000 Hz | 20,000 Hz | 20,000 inherits the cabinet's existing high-frequency limit |
| `cabResonance` | 0–1 | 0.5 | Adjust cabinet-resonance emphasis |

Existing controls retain their IDs and ranges. Clean low blend and crossover protect bass beneath the driven amplifier; they are independent of the bass knob. Speaker breakup, mic position/distance, cabinet air, presence, depth, gate/release, and mono/stereo input remain available.

Flat removes the stock tone-stack coloration and loss; the user's bass, middle, and treble controls still work. DI turns off the cabinet, so speaker, microphone, cabinet cuts, and cabinet resonance have no effect until a cabinet is selected.

## Four-pedal board

Signal order is **before-amplifier pedals → amplifier → cabinet and mic → after-cabinet pedals**. Within either position, slot order is signal order. **After cabinet** means exactly that; it is not an amplifier effects loop. Each slot has its own enable switch, level, blend, and position. Removing a pedal selects Empty slot. Moving a slot moves its complete set of controls.

There are 13 active pedal models, plus Empty slot. All models have two primary controls whose labels follow the selected pedal:

| Pedal / ID | Inspiration | Amount control | Tone control | Character and use |
| --- | --- | --- | --- | --- |
| Green 808 / `green-808` | Ibanez TS808 Tube Screamer family | Drive | Tone | Mid-forward soft overdrive; trims bass before clipping to tighten an amp |
| Gold klone / `gold-klone` | Klon Centaur family | Gain | Treble | Clean-and-driven blend; clean contribution falls as gain rises |
| Rodent / `rodent` | Pro Co RAT family | Distortion | Brightness | Hard distortion; higher Brightness opens the filter, opposite the direction of a RAT Filter knob |
| Orange one / `orange-one` | BOSS DS-1 family | Distortion | Tone | DS-1-inspired hard distortion with BROILER's asymmetric clipping and broad tone tilt |
| Wool fuzz / `wool-fuzz` | ZVEX Woolly Mammoth and biased transistor fuzz families | Fuzz | Bias | Bass-friendly fuzz with asymmetric, pinched, or gated response |
| Muffin / `muffin` | Electro-Harmonix Big Muff Pi family | Sustain | Tone | Thick sustaining fuzz and a broad bass/treble scoop blend |
| Treble boost / `treble-boost` | Dallas Rangemaster family | Boost | Range | Frequency-selective boost; higher Range raises the bass-cut frequency |
| Studio compressor / `studio-comp` | Compact studio-style compression | Sustain | Attack | More even input level; higher Attack is slower and lets more transient through |
| Wah / `wah` | Inductor-style wah pedals | Sweep | Resonance | Manual 280–2,400 Hz sweep; useful as a parked wah, with no automatic sweep |
| Chorus / `chorus` | Analog bucket-brigade chorus pedals | Rate | Depth | Short modulated delay; rate about 0.15–4 Hz and depth about 0.5–5 ms |
| Phaser / `phaser` | Four-stage analog phase shifters | Rate | Feedback | Moving all-pass notches; rate about 0.05–4 Hz |
| Echo / `echo` | Dark analog-style delay pedals | Time | Feedback | Approximately 60–850 ms repeats, with softened high frequencies |
| Spring reverb / `spring` | Compact spring tanks | Length | Damping | Dispersive spring-like decay, about 0.45–3.8 s; higher Damping is darker |

The pedal models evoke these families using reduced-order processing; the controls do not reproduce every original knob or circuit revision. Echo and spring produce the effect signal at Blend 100%; use a lower Blend to retain the dry note. The new recipes use restrained spatial blends as useful starting points.

The flat storage and automation contract is identical for slots `N = 1…4`:

| Key | Range / choices | Default |
| --- | --- | --- |
| `pedalNType` | `none` or one of the 13 IDs above | `none` |
| `pedalNEnabled` | `off`, `on` | `off` |
| `pedalNRoute` | `pre`, `post` | `pre` for 1–2; `post` for 3–4 |
| `pedalNDrive` | 0–1, step 0.01 | 0.5 |
| `pedalNTone` | 0–1, step 0.01 | 0.5 |
| `pedalNLevel` | −18–12 dB, step 0.1 | 0 dB |
| `pedalNMix` | 0–1, step 0.01 | 1 |

The stored `Drive` and `Tone` keys remain stable even when the UI calls them Time, Feedback, Sweep, or Damping. A complete recipe contains every control, so selecting a recipe clears pedals or custom Workshop choices left by the previous rig.

Choosing a pedal model uses its separate `pedalModels[].defaults` for a useful first setting and enables a nonempty slot; it preserves that slot's position and all other slots. These selection defaults do not change the flat storage defaults above. In particular, new chorus starts at Blend 40%, echo at 25%, and spring at 22%.

## Added complete recipes

The 13 existing recipes retain their IDs and original control values. Twelve additions cover the ten new heads, every active pedal model, clean and driven playing, bass fuzz, and an independent pedalboard:

| Recipe / ID | Starting point |
| --- | --- |
| Tweed lunch / `tweed-lunch` | Tweed 55, gentle Gold klone, small spring tail |
| Black coffee / `black-coffee` | Black panel 65, light compression, restrained spring |
| Copper kettle / `copper-kettle` | Copper 30, low treble boost, dark repeats |
| Royal service / `royal-service` | Royal 68 power crunch, Green 808, slow preamp phaser |
| Iron skewer / `iron-skewer` | Iron 800, restrained Rodent, quiet short echo |
| Red-line grill / `red-line` | Dual red 92, mild Orange one, tight lows and a trace of echo |
| Cali cut / `cali-cut` | Cali IV lead voice, partially blended parked wah, gentle chorus |
| Fifty-first service / `fifty-first` | Fifty-one, low-drive Green 808, dry closed stack |
| Citrus rind / `citrus-rind` | Citrus verb, sustaining Muffin, small dark spring |
| Cool-room chorus / `cool-room` | Jazz 120 clean, separate chorus and quiet echo |
| Woolly stock / `woolly-stock` | SVT 69, blended Wool fuzz, protected clean lows |
| Pedal tasting / `pedal-tasting` | Four pedals with the amp and cabinet bypassed |

The catalog is the authority for defaults, control limits, labels, and complete recipe snapshots. `ampModels`, `pedalModels`, and grouped `section` metadata supply the editor's model descriptions and Workshop organization without requiring the audio engine to run.

## Circuit processing and saved rigs

Driven amp stages and distortion-pedal clipping circuits run at four times the host sample
rate, followed by fourth-order decimation filters. The pedal diode node retains
RC state; a precomputed monotone solution table evaluates its implicit nonlinear
current equation at audio rate. Rodent adds a gain-dependent compensated op-amp
pole; Wool fuzz has bias and envelope memory. The valve stages use bounded
transfer curves with interstage RC, cathode and grid-blocking state, supply sag,
power feedback and optional transformer memory. Tone stacks and cabinets are
response approximations rather than complete component schematics or measured
impulse responses. These choices keep one deterministic signal path for live
monitoring and offline export without adding a fixed audio buffer.

**Save rig** and **Load rig** sit inside the Workshop. A `broiler-rig` version-one
JSON file contains a name and every sound parameter, including all four pedals.
It does not carry track automation, clips or mixer settings. Loading replaces
only the selected BROILER insert's parameters, with Undo, and preserves the rest
of the project. Malformed, incomplete, unknown or out-of-range settings reject
before mutation; the file limit is 128 KiB.
