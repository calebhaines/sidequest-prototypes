# MORSEL offline speech sources

The runtime uses the unmodified meSpeak **2.0.7** core by Norbert Landsteiner,
based on Alon Zakai's speak.js port of Jonathan Duddington's eSpeak. It performs
English text-to-phoneme and formant speech synthesis entirely in a dedicated
local worker. It does not use an operating-system speech service, network TTS,
or voice recordings. The four MORSEL profiles use original voice definitions
that change formant frequencies, bandwidths, voicing and the Klatt excitation.

meSpeak and eSpeak are distributed under **GNU GPL version 3**. The full upstream
license is in [COPYING](COPYING). MORSEL's speech wrapper is also GNU GPL v3.
English pronunciation dictionary and phoneme data are distributed with the
upstream GPL project; no MBROLA or third-party sampled voices are included.
Keep the notice, license and source bundles with editable distributions.

## Files and provenance

`mespeak-core.js` and `en-us.json` are verbatim files from the author's release:

- <https://www.masswerk.at/mespeak/mespeak.zip?v=2.0.7>
- Release date: 2020-04-23; retrieved 2026-10-30.
- Core SHA-256: `0945233a22ccbbcab2fd70607cb03605002eef16c00cce1c1c9617d46bbe0189`
- English SHA-256: `757de5de43981ac734c51ee350632049a65c6a04b9ed1a630b9916cf88440721`

`mespeak-2.0.7-upstream.zip` preserves the entire original release, including
the original JavaScript wrapper, documentation, voice modules and license:

- SHA-256: `0f64d9659cff8551d16473b65fae6e02439292c249e0c2c76f602b16838e5156`

`speak.js-9c6f642-source.zip` preserves the upstream eSpeak/speak.js C/C++ source,
pronunciation dictionary sources, data, license, Makefile and Emscripten build
scripts referenced by meSpeak. This is the upstream project source, rather than
a claim that today's compiler reproduces the historical generated core bytes:

- <https://github.com/kripken/speak.js/tree/9c6f642f7d78bab51d16b2e8b79cdf205643ec35>
- Source archive: <https://codeload.github.com/kripken/speak.js/zip/9c6f642f7d78bab51d16b2e8b79cdf205643ec35>
- SHA-256: `6c9af42c9764df92407fa4f2d1fdd5023f9fcfe5026bf9a99ed8eaf8be24113a`

The engine match is verified: the compiled meSpeak core embeds version string
`1.45.04  25.Apr.11`, exactly matching `src/synthdata.cpp` in the pinned source.
The English `en_dict` decoded from `en-us.json` is byte-identical to that source
archive's compiled dictionary. All four decoded core data files (`phontab`,
`phonindex`, `phondata`, `intonations`) also match the archive byte-for-byte.
Run `python3 vendor/verify-source.py` to repeat these checks offline.

The historical C/C++ port's `src/emscripten.sh`, `src/bundle.py` and wrapper
templates are inside that source archive. Their historical compiler paths need
updating to rebuild that old port. The shipped, unmodified meSpeak release
remains the canonical backend used for byte-reproducible MORSEL HTML builds.

## Rebuilding the instrument's embedded data

Run `python3 vendor/build-assets.py` from the MORSEL source directory. This
generates `speech-assets.js` from the unchanged core and English JSON, with no
downloads or compilation. The instrument build includes this generated file
before `speech-source.js`. Complete source ZIPs include all the files above;
upstream archives are not embedded in the playable HTML.

`speech-source.js` wraps the unchanged core with an in-memory voice loader and
creates a Blob worker, so local HTML files need no fetch or external script.
It returns 22,050 Hz mono PCM and an actual measured source pitch. MORSEL's
musical audio engine independently fits pitch and duration while preserving
the synthesized vocal tract. English pronunciation remains deliberately
synthetic; it does not imitate a particular person's recorded voice.

Exact quick sound tokens `ah`, `ee`, `oo`, `oh`, `mm`, `sh`, `sss`, `la`, `na`
and `da` select vowel, hum, fricative or syllable phonemes. All other words and
phrases use normal English pronunciation. The phoneme syntax stays inside the
backend; the instrument's word fields remain plain text.
