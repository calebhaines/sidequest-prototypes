# Source accompanying a native Kitchen release

The corresponding source for a binary release is the exact repository snapshot
identified by that release's source revision, together with the pinned third
party sources below. An updated default branch alone does not identify the
source used for an older binary.

The release source archive includes all corresponding native plugin sources:
`plugins/`, its manifests and lockfile, the original Kitchen instruments and
GALLEY sources, shared dependencies, original self-contained instrument pages,
vendored MORSEL assets, notices and source supplements. Unrelated web projects
in the repository are not needed to build the suite. Generated native JavaScript/resources
are reproducible from those files; `node_modules/` and a macOS build directory
are not canonical project sources.

Keep the following source dependencies with the release's source distribution:

| Source | Exact revision / location |
| --- | --- |
| JUCE Framework | tag `8.0.12`, <https://github.com/juce-framework/JUCE/tree/8.0.12>; include the complete archive, its modules, bundled dependency sources and build files |
| npm runtime dependencies | exact versions and integrity hashes in `plugins/package-lock.json`; include the published source packages used for the build |
| web-audio-engine preferred source | commit `a7d09ffd8aa1ef9837355fd412457c8bab296a21`, <https://github.com/mohayonao/web-audio-engine/tree/a7d09ffd8aa1ef9837355fd412457c8bab296a21>; npm 0.13.4 ships transpiled `lib/`, this source also retains `src/` |
| fflate preferred TypeScript source | 0.8.2 npm revision `d3243651cb142e3e04f3e4bc037b9e985878f444`, <https://github.com/101arrowz/fflate/tree/d3243651cb142e3e04f3e4bc037b9e985878f444> |
| fft.js | 4.0.4 npm revision `f8be92e1369f684da3e121e4c5b7fbcc8d50f868`, <https://github.com/indutny/fft.js/tree/f8be92e1369f684da3e121e4c5b7fbcc8d50f868> |
| events | 3.3.0 npm revision `aed9f91fee236bdedab8d593f7aa418ae6ed2718`, <https://github.com/Gozala/events/tree/aed9f91fee236bdedab8d593f7aa418ae6ed2718> |
| Original Signalsmith C++/build sources | tracked `morsel/vendor/signalsmith/signalsmith-stretch-source.zip`, commit `222093b4cc13ddb4d07c826bc3c1559326091731`; official npm archive is adjacent |
| Original phonemizer JavaScript preferred source | tracked `morsel/vendor/neural/phonemizer-source.zip`, commit `6835144b7ee9043129222549c1ed2f6a27216278` |
| eSpeak NG C/C++/dictionary/phoneme/build source supplement | tracked `music/morsel/MORSEL-phonemizer-C-source.zip`, upstream `1.52.0`; SHA-256 `b4517592e3cbc43703bb1c782702eafb98097659e0b7e96e69c32ee32ae5003a` |
| Neural model, speakers, original inference and upstream notices | tracked `morsel/vendor/neural/`; exact upstream hashes are in its `manifest.json` |

The phonemizer upstream does not identify its historical C/compiler revision.
The exact unmodified JavaScript used in MORSEL and its preferred JavaScript
source are provided. The eSpeak NG 1.52.0 supplement is not represented as a
byte-identical reconstruction of that historical generated JavaScript. The
original qualification is retained in `PHONEMIZER-SOURCE-OFFER.txt`.

The original MIT licensed runtime modifications are in
`plugins/js/vendor-entry.js`. The native host does not depend on a separate
proprietary audio service or a WebView audio transport. macOS JavaScriptCore and
WebKit are platform frameworks supplied by the operating system.

## Build the Apple Silicon plugins

Use macOS 12 or later with the macOS SDK and command line compiler tools,
Node.js/npm, Python 3, CMake 3.22 or later and Ninja. A GUI Xcode project is not
required; Apple's command line build tools and SDK are required for the native
macOS binaries. The repository root contains the canonical source files used
by the resource generator.

From that exact source checkout:

```sh
npm ci --prefix plugins
node plugins/scripts/generate.mjs
KITCHEN_ARCHITECTURES=arm64 plugins/build-native.sh
```

The build script regenerates the native resources, configures CMake, builds the
VST3 and optional Audio Unit targets and runs CTest. CMake fetches JUCE's pinned
tag by default. To use the JUCE source shipped with a release without fetching,
configure it directly with the standard CMake FetchContent override:

```sh
cmake -S plugins -B plugins/build -G Ninja \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_OSX_ARCHITECTURES=arm64 \
  -DFETCHCONTENT_SOURCE_DIR_JUCE=/absolute/path/to/JUCE-8.0.12
cmake --build plugins/build --config Release
ctest --test-dir plugins/build --output-on-failure
```

The initial npm installation can likewise use a local npm cache populated with
the exact source packages retained from the release. Keep the lockfile's
integrity checks in place. Build tooling such as npm, CMake, Ninja and esbuild
does not become plugin runtime code merely by being used to build it.

The resource generator consumes the tracked, real MORSEL factory bank in
`plugins/assets/morsel/morsel-bank.json.gz`; it does not require neural inference
during an ordinary plugin build. Its source provenance and optional regeneration
commands are in `plugins/assets/morsel/README.md`. User-edited MORSEL words are
prepared by the bundled original editor and stored with plugin state.

Useful portable verification commands include:

```sh
node plugins/tests/morsel-checks.cjs
node plugins/tests/host-runtime-checks.cjs
node plugins/scripts/checks.cjs
```

The native macOS tests and DAW checks remain necessary for platform binaries;
portable JavaScript checks do not by themselves certify a DAW or processor
architecture.
