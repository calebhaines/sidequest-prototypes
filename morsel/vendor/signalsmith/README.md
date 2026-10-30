# Signalsmith Stretch for MORSEL

The unchanged official `signalsmith-stretch` 1.3.2 web release supplies the
waveform-preserving pitch, duration and formant processor. It is MIT licensed;
the complete grant and copyright notice are in `LICENSE.txt`.

- npm: <https://www.npmjs.com/package/signalsmith-stretch/v/1.3.2>
- Original package: <https://registry.npmjs.org/signalsmith-stretch/-/signalsmith-stretch-1.3.2.tgz>
- Matching upstream source: <https://github.com/Signalsmith-Audio/signalsmith-stretch/tree/222093b4cc13ddb4d07c826bc3c1559326091731>
- `SignalsmithStretch.js` SHA-256:
  `fe0e23b6bb5dbffb231a91e7dc39f9d2a7d10c7f793fb0237d819ca748f7f778`.

The npm archive and matching source archive accompany the editable instrument.
The upstream source commit's `web/release/SignalsmithStretch.js` is byte-identical
to the vendored file. Its C++ implementation and Emscripten build scripts are in
the source archive; the instrument build uses the already compiled official web
release and needs no C++ compiler or network access.

`python3 build-assets.py` extracts the unchanged self-contained WASM factory
before its official AudioWorklet adapter. It emits `assets.js`, a data object
consumed by MORSEL's local preparation worker. All WASM bytes are embedded in
the factory. There are no runtime downloads or worklet monitoring latency.

`fixtures/bella-hello.wav` is a locally generated KittenTTS Nano 0.8 speech sample
of “Hello from the kitchen”, used only by source checks for realistic vocal
pitch/time processing. It is not loaded into the playable instrument.
The `natural-ah.wav`, `natural-ee.wav` and `natural-mm.wav` fixtures are generated
by the same model and exercise very short neural vowel and humming tokens.
The `soprano-{ah,ee,oo,mm}.wav` fixtures come from the production Soprano speaker
and production alias/phoneme path. Their initial decoder residue delayed the
meaningful vocal onset by roughly 0.4–0.8 seconds despite a nonzero first sample.
Source checks verify voiced-core selection, prompt audible onset and sustained
level after fitting. Ordinary words retain a 40 ms phonetic prepad and their
complete consonant tails.
The `word-{alto,tenor,bass,robot}-hello-kitchen.wav` fixtures use the exact
production phrase path for all four profiles. Tenor and Bass include a quiet
decoder island before a near-silent gap and the actual spoken word. The RMS
leading trim must discard that island while preserving the word's consonants.
The full MIT notice is included in the embedded `assets.js` data, so it also
travels with the self-contained HTML.
