# Kitchen native plugin notices

These notices accompany the native Kitchen VST3 and Audio Unit distribution.
They apply to the plugin integration and its bundled components. They do not
change the license of the repository as a whole or of unrelated web projects.

The new native integration uses the open source AGPLv3 licensing route for
JUCE. Its scope is described in
[licenses/KITCHEN-NATIVE-LICENSING.md](licenses/KITCHEN-NATIVE-LICENSING.md),
and the full license is in [licenses/AGPL-3.0.txt](licenses/AGPL-3.0.txt).
The individual third party copyrights, grants and notices below remain in
effect. No warranty is provided beyond the applicable license terms.

## Native framework and JavaScript audio compatibility

| Component | Version | License and retained text |
| --- | --- | --- |
| JUCE Framework, Raw Material Software Ltd. | 8.0.12 | AGPLv3 or a separate JUCE commercial license; [pinned upstream notice](licenses/JUCE-8.0.12-LICENSE.md), [AGPLv3](licenses/AGPL-3.0.txt), [commercial alternative EULA snapshot](licenses/JUCE-8-COMMERCIAL-EULA.txt) |
| web-audio-engine, Nao Yonamine | 0.13.4 | MIT; [upstream package README](licenses/npm/web-audio-engine-0.13.4-README.md), [author's linked MIT grant](licenses/Nao-Yonamine-MIT.txt) |
| fflate, Arjun Barrett | 0.8.2 | [MIT](licenses/fflate-0.8.2-MIT.txt) |
| fft.js, Fedor Indutny | 4.0.4 | [MIT, verbatim upstream README license section](licenses/fft.js-4.0.4-MIT.txt) |
| events, Joyent and Node contributors | 3.3.0 | [MIT](licenses/events-3.3.0-MIT.txt) |

The native compatibility changes to Web Audio processing are maintained in
`plugins/js/vendor-entry.js`. They include synchronous bounded block pulling,
partitioned convolution, compressor processing, sample clock callbacks and
AudioParam scheduling corrections. The upstream MIT grants are retained;
these changes are not represented as an unmodified upstream Web Audio engine.

JUCE includes additional third party components. Copies of the exact license
files from the pinned JUCE 8.0.12 tree are in [licenses/juce](licenses/juce):
Steinberg VST3 SDK (MIT), Apple's AudioUnitSDK (Apache 2.0), FLAC and Ogg Vorbis
(BSD), Independent JPEG Group, libpng and zlib, HarfBuzz, and SheenBidi
(Apache 2.0). Components used depend on the enabled JUCE modules and target
format. The full JUCE upstream notice lists the framework's other optional
components as well. VST is a trademark of Steinberg Media Technologies GmbH;
the plugin product is independent of Steinberg.

The following MIT licensed runtime dependencies are also retained with their
package version and original attribution in [licenses/npm](licenses/npm):

| Components | Versions | Attribution |
| --- | --- | --- |
| audio-type | 1.0.2 | Hemanth.HM |
| biquad-coeffs-webaudio, biquad-coeffs-webaudio-v1, biquad-coeffs-webaudio-v2 | 1.2.0 each | Nao Yonamine |
| fourier-transform | 1.1.2 | Dmitry Ivanov / Dima Yv; upstream README credits dsp.js and RealFFT |
| is-flac, is-mp3, is-ogg, is-wav | 1.1.3, 1.1.4, 1.1.3, 1.1.3 | Hemanth.HM |
| is-m4a | 1.1.1 | Hemanth.HM |
| nmap | 1.1.0 | Nao Yonamine |
| pify, read-chunk | 3.0.0, 2.1.0 | Sindre Sorhus |
| safe-buffer | 5.2.1 | Feross Aboukhadijeh |
| scijs-window-functions | 2.0.2 | Ricky Reusser |
| wav-decoder, wav-encoder | 1.3.0 each | Nao Yonamine |

Some older npm releases contain only a MIT declaration and an author license
link, without a standalone license file. Their unchanged package metadata and
READMEs are preserved here. Nao Yonamine's linked MIT page uses the current
year; the included snapshot preserves its 2026 copyright line. The current
upstream license files for fourier-transform and scijs-window-functions are
included with their provenance; the latter also offers an optional alternative
license. Their installed historical versions declare MIT. The original 2.0.2
README's Ricky Reusser attribution is retained separately.

## MORSEL original neural voices and preparation

MORSEL's original embedded editor prepares speech using its real locally
bundled neural model and Signalsmith fitting pipeline. Prepared PCM is then
retained in plugin state for native playback with the editor closed. The
included factory bank's provenance and hashes are in
[assets/morsel/README.md](assets/morsel/README.md).

| Component | Version or source | License and retained text |
| --- | --- | --- |
| KittenML KittenTTS model and selected speaker data | kitten-tts-nano-0.8-int8 | [Apache 2.0](licenses/morsel/MODEL-Apache-2.0.txt) |
| ONNX Runtime Web, Microsoft | 1.20.1 | [MIT](licenses/morsel/ORT-MIT.txt) and [complete upstream third party notices](licenses/morsel/ORT-ThirdPartyNotices.txt) |
| Signalsmith Stretch, Geraint Luff / Signalsmith Audio Ltd. | 1.3.2, source commit 222093b4cc13ddb4d07c826bc3c1559326091731 | [MIT](licenses/morsel/Signalsmith-MIT.txt) |
| Phonemizer.js | 1.2.1, source commit 6835144b7ee9043129222549c1ed2f6a27216278 | [Apache 2.0](licenses/morsel/PHONEMIZER-Apache-2.0.txt) |
| eSpeak NG underlying the phonemizer | upstream 1.52.0 source supplement | [GPLv3](licenses/morsel/eSpeak-GPL-3.0.txt), [original source offer and historical build qualification](licenses/morsel/PHONEMIZER-SOURCE-OFFER.txt) |

The model SHA-256 is
`f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc`;
the original speaker archive SHA-256 is
`8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f`.
The original voice mapping is Bella/Alto, Jasper/Tenor, Bruno/Bass and
Luna/Soprano, with `robot` retained as the legacy fourth voice ID.

The unchanged original neural and Signalsmith provenance documents are copied
into [licenses/morsel](licenses/morsel). They describe the complete original
model, runtime, inference, speaker and source artifacts. MORSEL's combined
integration carries GPLv3 obligations; a JUCE commercial license alone does
not remove those obligations. The native open source combined build follows
AGPLv3, including the combination permission in GPLv3 section 13.

## Corresponding source and rebuilding

Binary releases must accompany these notices, the complete `licenses/`
directory and the exact corresponding source used for that release, including
the native integration, canonical web sources, MORSEL source supplements and
the required third party sources. See
[licenses/SOURCE-AND-BUILD.md](licenses/SOURCE-AND-BUILD.md) for the source
contents, pinned dependency locations and build commands. The release's source
revision identifies the exact repository snapshot; the generated inventory
records the individual canonical source hashes.

The upstream/canonical license copies have file hashes and source locations in
[licenses/manifest.json](licenses/manifest.json). Website text snapshots are
identified as such; all copied legal terms are retained without rewriting.
