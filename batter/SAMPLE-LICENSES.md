# BATTER sample-library credits

BATTER uses real recorded acoustic drums and percussion. The recordings are not synthesized. Imported user recordings retain their original ownership and license.

The sample library has its own license, separate from the BATTER application code. Each factory sample carries its source, author attribution, license, original sample name and any conversion details in the library JSON.

## AVL-Drumkits adaptations

Recordings by **Glen MacArthur (2015)**, originally published as AVL-Drumkits. SoundFont adaptations are distributed by **Robin Gareus / x42 and contributors**. BATTER repackages the SoundFont's original PCM into individual WAV containers; the AVL audio samples and native 44.1 kHz sample rate remain unchanged. Stereo bell-tree recordings remain stereo.

Original names and BATTER collection names:

| BATTER collection | Original recorded library | Full collection WAVs |
| --- | --- | ---: |
| Iron service | Black Pearl 4 | 118 |
| Red service | Red Zeppelin 4 | 118 |
| Late lunch | Blonde Bop | 135 |
| Pantry percussion | Buskman's Holiday | 200 |

There are 571 recorded WAV entries in the full AVL collections. Some accessory recordings are shared between the original drum kits; this count describes library entries, not 571 guaranteed unique audio recordings. The offline starter contains **148 entries across four complete kits**: 36 from Iron service, 24 from Red service, 24 from Late lunch and 64 from Pantry percussion. The first three kits retain two or three real dynamic layers per instrument. The embedded Pantry percussion kit includes five real dynamic layers for cajon thump/slap, stick clicks, hand claps, congas, shakers, shaken tambourine and cowbell; three each for finger snaps, claves, foot stomps and bucket; and one mid-dynamic, full-tail cymbal and cymbal bell recording. All four kit presets reference samples already embedded in the standalone HTML. The full drum collections provide five real dynamic layers. Most hand percussion provides ten real dynamic layers; the stereo bell trees provide five. AVL records one strike per dynamic layer, so those samples are not labelled as round-robin recordings.

**License: [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/), with the original author's explicit music exception.** The original notice says:

> CC-BY-SA with the following exception:
> The by-sa condition is imperative if you modify the samples
> themselves or create new sample libraries with this licensed product.
> However, produced music and other non-sample-library works can be
> licensed freely.
>
> Attribution means keeping all authors information and this readme-file or
> its content in the release.
> If you want to create a fork, a modified version, of this sample library
> you have to release and distribute it under a different name.

The BATTER sample-library adaptation is distributed under CC BY-SA 3.0 with that same exception. This includes the extracted WAV samples, the bundled sample metadata and the embedded offline sample collection. It does not change the license of the application code. Keep the original credits and license notice when redistributing this sample library. The distinct BATTER collection names identify the adapted library.

- Original project: <http://www.bandshed.net/avldrumkits/>
- Redistributed SoundFonts and notice: <https://github.com/x42/avldrums.lv2/tree/master/sf2>
- Original license/readme preserved in [samples/AVL-Drumkits-original-README.txt](samples/AVL-Drumkits-original-README.txt).

The upstream SoundFonts already include these changes, documented in their original notice: changed accessory panning; silence trimmed at the start of some recordings; exclusive cymbal/hi-hat groups; generic names and numbers; corrected velocity ordering and sample loop points; corrected maraca root key; updated Red Zeppelin side-stick, snare and snare-edge samples with an alternate Ludwig 14-inch snare. BATTER does not claim those upstream changes as original work.

## Downloaded source checksums

The source archives were retrieved on 2026-10-05. SHA-256:

| Original file | SHA-256 |
| --- | --- |
| Black_Pearl_4_LV2.sf2 | `e0542ec19f2816ef4e0d00aeb087e7aa311e888d6f4805f971688bb267c6d405` |
| Red_Zeppelin_4_LV2.sf2 | `289fc3e30a4859eb74ae14eb08ddef453e8bf8eab3e501772dcf96fd8328a71a` |
| Blonde_Bop_LV2.sf2 | `7fdb2ab1810604127f06e27f45669e0ed4ffd8d997f1929c0cad5b96a940b979` |
| Buskmans_Holiday_LV2.sf2 | `868a67ff7ce85308d9a5cbbb20fad94a7d8da643a19c7f8e44e0117af6d7cf74` |

Each sample also includes a SHA-256 of its WAV bytes, so the redistribution can be verified independently.

## Rope tension — optional Salamander adaptation

**Rope tension** is a separately licensed, optional pack adapted from the **Salamander Drumkit by Alexander Holm**. It is not part of BATTER's embedded starter or default kit. The original recordings feature a handmade birch-stave drum kit and stereo overhead microphones, including two birch/mahogany snares, a 12-inch rack tom, a 14-inch floor tom, an 18-inch kick and recorded Paiste, Stagg and Masterworks cymbals.

The curated pack contains **70 actual recorded strikes**, including up to four alternate closed-hat recordings per dynamic and up to three alternate kick, snare, side-stick, tom and cowbell recordings per dynamic. Original long cymbal tails are retained. Open-hat and ride recordings have one selected strike per included dynamic. BATTER's alternate-strike mode can rotate the retained recordings; the original SFZ used a mixture of random strike selection and round-robin sequencing.

The source files were recorded as stereo 48 kHz PCM24. The pack converts them to stereo 44.1 kHz PCM16 with polyphase resampling and deterministic triangular dither. No sample is synthesized or retuned in the distributed pack. Conversion details and both original and adapted WAV hashes are included in every entry. The kit's hand-clap lane references the separately credited AVL starter clap; the Salamander archive contains no recorded clap. Because the source kit has two toms, the additional third-tom lane is honestly labelled **Snare wires off**.

**License: [Creative Commons Attribution-ShareAlike 3.0](https://creativecommons.org/licenses/by-sa/3.0/).** The original Salamander notice says:

> Licence: CC-by-sa
> http://creativecommons.org/licenses/by-sa/3.0/
>
> Author: Alexander Holm

Unlike the AVL collections, Salamander's original notice contains **no separate produced-music exception**. Do not assume that AVL's exception extends to this pack. Preserve the original attribution and follow CC BY-SA 3.0 when redistributing or creating adaptations. The optional collection browser identifies this distinction before loading. The Rope tension sample-library adaptation is distributed under the same CC BY-SA 3.0 license, separate from the application's code license.

- Original archive and creator's upload: <https://archive.org/details/SalamanderDrumkit>
- Original source: <https://archive.org/download/SalamanderDrumkit/salamanderDrumkit.tar.bz2>
- Original author notice preserved in [samples/Salamander-original-REAMDE.txt](samples/Salamander-original-REAMDE.txt).
- Original archive metadata preserved in [samples/Salamander-original-metadata.json](samples/Salamander-original-metadata.json).
- Source archive SHA-256: `34e746ec1721bb530b1caf5b17443ae3cde45a2cce1a80e2637e4c11d6f1e3f5`.

## Offline and optional collections

The standalone HTML embeds the 148-entry AVL starter plus credits and library metadata. The full AVL collections and Rope tension remain explicit optional downloads. Library JSONs contain all their selected WAV bytes and can also be downloaded and imported from disk for offline use. The embedded Pantry percussion selection is playable immediately offline. Loading both optional Pantry percussion parts expands that same kit with its full recorded dynamics and additional articulations.

There are **641 recorded WAV entries across the five full source kits**, with the starter's 148 entries already included in that total. Every distributed library JSON is below 50 MB. The original 510 MB source downloads are not bundled with the application.

The reproducible acquisition and conversion scripts are in [samples/tools/](samples/tools/README.md). They pin the AVL source revision, verify original source hashes and decode only selected audio streams; they do not extract arbitrary archive paths.
