# CUPBOARD · modeling references

Sources checked on 9 November 2026. CUPBOARD's responses are original,
procedurally generated impulse responses. No commercial IR recordings,
manufacturer response plots, or third-party sample libraries were copied into
the effect. Familiar microphone and speaker families guide the choices; these
are not measured captures or calibrated replicas of individual products.

## Acoustic basis

- Julius O. Smith, Stanford CCRMA, [Physical Audio Signal Processing](https://ccrma.stanford.edu/~jos/pasp/), especially [Modal Representation](https://ccrma.stanford.edu/~jos/pasp/Modal_Representation.html). A linear resonant object's transfer function can be represented with parallel second-order modes. This supports constructing a finite response from decaying modes with different frequencies, damping, weights and signs.
- Smith, [Acoustic Modeling with Digital Delay](https://ccrma.stanford.edu/~jos/pasp/Acoustic_Modeling_Digital_Delay.html). Propagation, fractional delays, reflections and frequency-dependent absorption belong to the response's timing and coloration, not to a compressor or an automatic gain control.
- UNSW Music Acoustics, [Guitar acoustics](https://newt.phys.unsw.edu.au/music/guitar/) and [The Virtual Guitar](https://newt.phys.unsw.edu.au/music/guitar/virtual.html). A guitar body has spatial vibration modes, affected by geometry and bracing; its response is more than a single low-pass filter.
- UNSW, [Helmholtz resonance](https://newt.phys.unsw.edu.au/jw/Helmholtz.html). An enclosed air volume and port form a mass/spring resonance. The page's worked example uses sound speed 343 m/s; CUPBOARD's ordinary air-path timing uses this conventional room-temperature approximation.
- UNSW, [Violin acoustics research](https://newt.phys.unsw.edu.au/jw/violin.html). Instrument-body radiation and resonances provide the broad physical basis for the bowed-body studies. CUPBOARD's chosen modes and damping are design parameters, not extracted measurements of a particular violin or cello.

The speaker, enclosure/body, microphone voicing, microphone direction and path
length are separate parts of the model. Moving a microphone should change the
actual transfer response and arrival timing. Moving several microphones should
therefore also change their interference. Polarity inversion is a sign change;
it is distinct from aligning arrival times.

Natural alignment retains the modeled propagation differences. Aligned mode is
an explicit recording convenience which equalizes those differences. It does
not make different microphone frequency responses identical. Contact pickups
are interpreted as surface coupling, rather than as pressure microphones with
ordinary air-distance loss and a directional polar pattern.

## Microphone families

| CUPBOARD family | Primary reference and verified facts | Modeling implication |
| --- | --- | --- |
| `dynamic57` | Shure [SM57](https://www.shure.com/en-US/products/microphones/sm57?variant=SM57-LC): cardioid; 40–15,000 Hz; contoured instrument response. | Directional dynamic color and a shaped upper midrange. |
| `dynamic421` | Sennheiser [MD 421 II](https://www.sennheiser.com/en-us/catalog/products/microphones/md-421-ii/md-421-ii-000984): cardioid dynamic; 30–17,000 Hz. | A different broad dynamic response, not a gain-adjusted SM57 curve. |
| `dynamic20` | Electro-Voice [RE20](https://www.electrovoice.com/product/re20): cardioid; 45–18,000 Hz; Variable-D minimizes proximity-related bass buildup. | Less close-distance bass emphasis than the other directional dynamic studies. |
| `ribbon121` | Royer [R-121](https://www.royerlabs.com/r-121): figure-eight ribbon; 30–15,000 Hz ±3 dB; rear side can be brighter. | Figure-eight pickup and ribbon voicing. A front-only placement view does not claim to reproduce the full rear response. |
| `ribbon160` | beyerdynamic [M 160](https://europe.beyerdynamic.com/p/m-160): **hypercardioid** double-ribbon; 40–18,000 Hz. | It must not inherit the R-121's figure-eight pickup merely because both are ribbons. |
| `condenser87` | Neumann [U 87 Ai](https://www.neumann.com/en-en/products/microphones/u-87-ai/): omni, cardioid and figure-eight settings; 20 Hz–20 kHz. | CUPBOARD uses one specified directional interpretation; the product's multiple hardware patterns are not silently combined. |
| `condenser414` | A general multipattern, large-diaphragm condenser family. | Original condenser voicing using a specified pattern. No numerical C414 curve or measured unit is claimed. |
| `small184` | Neumann [KM 184](https://www.neumann.com/en-en/products/microphones/km-184-series-180/): cardioid; 20 Hz–20 kHz; slight lift around 9 kHz; smooth off-axis response. | Keep the small-diaphragm study comparatively smooth off axis. |
| `omni` | DPA, [Directional vs. omnidirectional microphones](https://www.dpamicrophones.com/mic-university/technology/directional-vs-omnidirectional-microphones/). | Pressure/omni pickup has no pressure-gradient proximity boost. |
| `contact` | Original surface-transducer interpretation. | Spatial body-mode coupling and a piezo-like color; no air polar-pattern claim. |

DPA's [proximity-effect explanation](https://www.dpamicrophones.com/mic-university/background-knowledge/proximity-effect-in-microphones-explained/)
distinguishes point, line and plane sources. It states that pressure microphones
do not exhibit proximity effect, and shows greater proximity bass lift for a
figure-eight than a cardioid. Its point-source example loses approximately
6 dB per doubling of distance. A nearby extended speaker cone is not a perfect
point source, so CUPBOARD uses bounded, explicitly chosen near-field behavior.

First-order cardioid and figure-eight pattern equations are useful
approximations, not broadband measured polar plots. Microphone pickup angle and
the speaker cone's frequency-dependent radiation angle are different effects.

## Speaker and enclosure anchors

| Public driver reference | Published data | Use in the original studies |
| --- | --- | --- |
| Celestion [Vintage 30](https://celestion.com/product/vintage-30/) | 70–5,000 Hz; free-air resonance 75 Hz. | A broad bandwidth reference for a modern, closed guitar-speaker family. |
| Celestion [G12M Greenback](https://celestion.com/product/g12m-greenback/) | 75–5,000 Hz; free-air resonance 75 Hz. | A separate British guitar-speaker family. |
| Celestion [Blue](https://celestion.com/product/celestion-blue/) | 75–5,000 Hz; free-air resonance 75 Hz. | A broad open/compact guitar-speaker reference. |
| Jensen [P10R](https://www.jensentone.com/vintage-alnico/p10r) | Free-air resonance approximately 97–99 Hz, depending on impedance version. | A smaller vintage 10-inch driver's higher bass-resonance region. |
| Celestion [PULSE15](https://celestion.com/product/pulse15/) | 40–3,500 Hz; free-air resonance 35.1 Hz. | A lower-reaching 15-inch bass-driver family. |
| Ampeg [Classic bass cabinets](https://ampeg.com/products/classic/cabs.html#svt810e) | Separate 4 × 10, 8 × 10 and 1 × 15 constructions; the ported 4 × 10 family includes a high-frequency horn. | Distinct bass-enclosure construction concepts; CUPBOARD does not use an Ampeg measured IR. |

Free-air driver resonance is not the completed cabinet's resonance or its whole
frequency response. Enclosure loading, baffle geometry, multiple drivers,
microphone placement and reflections all change the recorded result.

The twenty IDs describe original construction/color families:

- Cabinets: `open112`, `tweed110`, `british212`, `british412`, `modern412`,
  `bass410`, `bass810`, `bass115`.
- Unusual speakers: `rotary`, `radio`, `megaphone`, `horn`, `electrostatic`,
  `underwater`.
- Resonant bodies: `acousticguitar`, `violin`, `cello`, `grandpiano`,
  `metalbowl`, `woodenbox`.

The unusual speakers and resonant bodies are deliberately interpretive effects.
A stationary rotary-cabinet response is not a simulation of a rotating horn's
Doppler motion. The submerged color is not a calibrated underwater recording.
An acoustic-body response shapes incoming audio; it does not synthesize the
instrument's strings or replace a guitar signal with a sampled violin.

The individual FIR taps, mode frequencies, decays, spatial mode weights and
voicing coefficients are original implementation choices. Microphone levels
are user-controlled, with no envelope-following normalization or hidden
compression. Multiple microphones may reinforce or cancel each other, as their
positions, polarity and alignment imply.
