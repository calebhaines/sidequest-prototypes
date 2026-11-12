# MORSEL prepared factory voices

`morsel-bank.json.gz` is real output from the original MORSEL 1.1 neural speech,
analysis and Signalsmith note-fitting pipeline. It is a plugin startup bank,
not a substitute speech synthesizer. Changed words and patterns are prepared
using the original embedded editor and retained with the plugin state. Native
playback and offline DAW rendering then work with the editor closed.

The bank contains the original four voice identities: Alto/Bella,
Tenor/Jasper, Bass/Bruno, and Soprano/Luna (legacy `robot` ID). Each has `ah`
prepared for all 49 MIDI pitches 36–84. The default `hello / from / the /
kitchen` phrase is prepared in all four voices at 60, 90, 96, 100, 110, 120,
128, 140, 160 and 180 BPM. This gives 20 analyzed words and 356 fitted notes.
The original nearest-duration cache policy covers intermediate tempos.

The finite authored notes use the original fitted PCM and envelopes. Live
MIDI notes have an unknown future gate, so they sustain a crossfaded loop
inside the measured voiced region and release on key-up. This live MIDI
behavior is a documented extension to the finite notes in the web instrument.

## Reproduction and provenance

From the repository root, with Chromium and Playwright installed:

```sh
node plugins/tests/morsel-checks.cjs --prepare-default
cp plugins/generated/morsel-bank.json.gz plugins/assets/morsel/morsel-bank.json.gz
node plugins/tests/morsel-checks.cjs
node plugins/tests/morsel-checks.cjs --prepare-word zucchini
```

The generator opens the original self-contained MORSEL page, calls its real
speech and Signalsmith workers, and exports the resulting caches. It does not
use operating system speech, prerecorded replacement voices or a network
service. Generation completed without browser errors on 2026-11-11, based on
repository commit `df7e584fc155f8055f12e34cd118b370d2edcbf2`.

| Artifact | SHA-256 |
| --- | --- |
| Compressed bank (27,502,306 bytes) | `96a30228e32e0efe0f35d403eaaaf2ebefe9bb0fa538611fa31699b3a818b9a6` |
| Uncompressed JSON (37,019,310 bytes) | `4c02c720ee57824d0b52c41d9218a949fe4529c1a4139b1034d7ecac9bc1447a` |
| Original `morsel/index.html` | `05c78d817290a924e745c053a6c1dabbf526766c24c6de770bb8fb9bed0c0bb0` |
| `morsel/schema.js` | `2f08de882106d84fa0189e0515214db0637bb9d3432401a4f78c18ee83a5f71d` |
| `morsel/sequence.js` | `71da10c6f57a4b6bf76a2eb0fb353f8d650c1bceb27582cacbd15e745252c401` |
| `morsel/audio-engine.js` | `98daccc955677f863ff12ab03206304c9ac070266bc947fbbf3e74eab09bcbf5` |
| `morsel/speech-source.js` | `bdf827100d882c526fdfa607d01b1d62c27daa4d40156d8b72884beaf76677b6` |
| Preparation helper used for generation | `7ad292dc0f6b926f5005d06078713ee157a2e2f84afe1139e388f2a6ec834ebe` |

The bank format is version 1, `float32le`, with configuration key `cb9f6327`.
Plugin state and editor messages encode cache identities as lossless JSON
tuples (`identityEncoding: json-tuple-v1`), because JUCE rejects embedded NUL
characters in otherwise valid JSON strings. Hydration restores the original
cache identities before rendering. This transport encoding does not change
the factory bank asset, model data or PCM.
Its decoded word cache uses 1,048,608 bytes and its fitted notes use
26,642,336 bytes, within MORSEL's separate original 64 MiB cache budgets.
Re-running neural inference or a different browser version may change PCM;
the checked-in hashes identify this particular generated factory bank.

## Model, voices and runtime licenses

The model is `KittenML/kitten-tts-nano-0.8-int8`, with unmodified model SHA-256
`f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc`.
The original speaker archive SHA-256 is
`8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f`.
Model and speaker data are Apache 2.0; ONNX Runtime Web 1.20.1 and
Signalsmith Stretch 1.3.2 are MIT. Phonemizer.js is Apache 2.0 and its eSpeak
NG component is GPLv3. MORSEL's combined integration is GPLv3. The generated
waveforms do not embed the neural model or inference runtime.

The original notices, licenses, source offer and artifact verification remain
in [MORSEL neural provenance](../../../morsel/vendor/neural/README.md),
[neural manifest](../../../morsel/vendor/neural/manifest.json),
[Signalsmith provenance](../../../morsel/vendor/signalsmith/README.md) and
[GPL license](../../../morsel/vendor/COPYING). Distribution of the plugin
must preserve the applicable original notices and source obligations.
