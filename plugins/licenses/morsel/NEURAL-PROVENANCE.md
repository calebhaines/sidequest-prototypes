# Natural voices and inference runtime

MORSEL 1.1 performs neural English speech synthesis locally in a dedicated
worker. All model, inference, phoneme and speaker data required to play are
embedded in the standalone HTML. There are no runtime model downloads, remote
speech calls or operating-system speech voices.

## Model and speaker data — Apache 2.0

- Model: `KittenML/kitten-tts-nano-0.8-int8`.
- Original model: <https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/main/kitten_tts_nano_v0_8.onnx>.
- Original model SHA-256: `f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc`.
- Original speaker data: <https://huggingface.co/KittenML/kitten-tts-nano-0.8-int8/resolve/main/voices.npz>.
- Speaker-data SHA-256: `8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f`.

`model.onnx.gz` is a lossless GZIP copy of the unmodified upstream INT8 model.
No additional model quantization or weight precision reduction is applied.
`voices.npz` is the complete original speaker archive. The runtime selects Bella
for Alto, Jasper for Tenor, Bruno for Bass and Luna for Soprano. The old internal
`robot` ID maps to Soprano so saved notes still select a valid fourth voice.

Upstream selects a 256-float style row by preprocessed text length. MORSEL accepts
at most 160 typed characters and adds a terminal prosodic comma to bare words,
matching upstream's `ensure_punctuation`. The generated pack preserves all rows
0–161 for each selected voice. This does not approximate styles or limit IPA
token length. Terminal punctuation is restored after browser phonemization to
match the Python reference's `preserve_punctuation=True` behavior.
`MODEL-CARD.md`, `kitten-config.json`, `UPSTREAM-INFERENCE.py` and
`MODEL-LICENSE.txt` preserve model documentation, the inference reference and
the Apache 2.0 license. Reference code:
<https://github.com/KittenML/KittenTTS/blob/main/kittenml/kittentts_legacy/onnx_model.py>.

## ONNX Runtime Web 1.20.1 — MIT

`ort.min.js`, `ort-wasm-simd-threaded.mjs` and the losslessly compressed
`ort-wasm-simd-threaded.wasm.gz` come from the published `onnxruntime-web@1.20.1`
package. Inference uses the WASM provider with one thread; no GPU or cross-origin
isolation is required. The original MIT license and third-party notices are
included. Upstream source: <https://github.com/microsoft/onnxruntime/tree/v1.20.1>.
Published package: <https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.20.1.tgz>.

## Phonemizer.js 1.2.1 and eSpeak NG

The unmodified `phonemizer.js` comes from `phonemizer@1.2.1`, published under
Apache 2.0. It contains English eSpeak NG phonemization code and data; it produces
IPA text only. Its speech waveform output is never used by MORSEL. The full
preferred upstream JavaScript source is in `phonemizer-source.zip`, pinned to
commit `6835144b7ee9043129222549c1ed2f6a27216278`:
<https://github.com/xenova/phonemizer.js/tree/6835144b7ee9043129222549c1ed2f6a27216278>.

The underlying eSpeak NG code is GNU GPL version 3. The full GPL license remains
in `../COPYING`; MORSEL's combined integration is GPLv3. A full upstream eSpeak
NG 1.52.0 C/C++/dictionary/phoneme/build-source supplement is provided alongside
the editable instrument at:
<https://calebhaines.github.io/sidequest-prototypes/music/morsel/MORSEL-phonemizer-C-source.zip>.
See `SOURCE-OFFER.txt`. Upstream does not record the historical C/compiler
revision of its generated JavaScript; this supplement is upstream 1.52.0 source,
not a claim of byte-identical recompilation of that historical generated file.

## Reproducible packaging

`manifest.json` records every original artifact's size and SHA-256. Run
`python3 ../verify-source.py` from this directory, or run that script from any
working directory. It verifies the decompressed model/WASM hashes and the
original voices. The instrument build only requires Python's standard library;
it reconstructs its self-contained HTML from these local, already compiled
assets without downloading the C source supplement or running Emscripten.
