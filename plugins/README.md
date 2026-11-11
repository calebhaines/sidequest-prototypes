# Kitchen native plugins

This suite builds **18 instruments and 24 effects** as separate native macOS
VST3 plugins. Apple Silicon (`arm64`) is the default target. Audio Units are
also built for hosts such as Logic. The deployment target is macOS 12.0;
the automated native build and host tests run on macOS 15 Apple Silicon.
Windows and Linux plugin binaries are not part of this implementation.

## Install and play

Download the `Kitchen-Apple-Silicon` artifact from a successful
[native build](https://github.com/calebhaines/sidequest-prototypes/actions/workflows/kitchen-vst3.yml).
Extract its `Kitchen-Apple-Silicon.zip`. Run `Install.command` to install the
suite in your user account, or copy whichever plugins you want:

| Format | User installation folder |
| --- | --- |
| VST3 | `~/Library/Audio/Plug-Ins/VST3/` |
| Audio Unit | `~/Library/Audio/Plug-Ins/Components/` |

Restart or rescan plugins in your DAW. Instruments receive MIDI; effects
receive stereo audio (mono input is duplicated to stereo). Use the original
Kitchen editor to change sounds, samples, patterns and effect settings.
Presets, samples and the current recipe are saved with the DAW plugin state.
REDUCE and ROTISSERIE additionally expose an optional live audio input. Enable
that bus in your DAW, route audio to it and use the instrument's DAW input
switch. REDUCE's destination control routes the first input channel to its
selected voice; ROTISSERIE receives stereo input.

**Follow DAW pattern** plays an instrument's internal pattern from the DAW's
playhead. Switch it off to sequence the instrument exclusively with DAW MIDI.
Live MIDI also works while the DAW transport is stopped. Tempo-synced effects
use the DAW tempo. Play/stop, tempo, PPQ position, looping, time signature and
sample position come from the host; opening the editor is not required for
audio, synchronization or offline rendering. The host must supply its clock
for pattern synchronization; an unavailable tempo falls back to 120 BPM.

For DAW piano-roll sequencing, SIZZLE, HOTPLATE and CLATTER use MIDI notes
36–43 for their eight voices; BATTER uses 36–47 for its twelve lanes. DICER
uses MIDI channels 1–16 to select slices, with note 60 at the original pitch.
REDUCE and SKEWER use channels 1–4 to select their four voices. PICNIC uses
channels 1–6 for its parts and channel 10 for drums. The tonal instruments
otherwise use ordinary pitched MIDI notes. Octave names vary between DAWs;
these numeric MIDI note values are authoritative.

The bundles are ad-hoc signed and verified by the build. They are **not
Apple Developer signed or notarized**. macOS may require local approval for
downloaded plugins. No Xcode installation is needed to use the binaries.
The installer verifies each signature and removes quarantine only from the
Kitchen bundles it installs; it does not change system-wide security settings.

## Included products

| Instruments | |
| --- | --- |
| SIZZLE | HOTPLATE |
| CLATTER | REDUCE |
| ROTISSERIE | STEAM |
| SKEWER | DICER |
| STOCK | ROUX |
| BATTER | LEAVEN |
| MARINADE | PICNIC |
| MORSEL | HEIRLOOM |
| BRINE | CITRUS |

| Effects | |
| --- | --- |
| MANDOLINE | BUTTER |
| CHAR | DOUBLE |
| LEFTOVERS | HOOD |
| PROOF | WHISK |
| BROILER | GLAZE |
| SCALES | STRAINER |
| SWIRL | CRUMBLE |
| SAUTÉ | PRESERVE |
| TIN CAN | FERMENT |
| SUNDAY | CELLAR |
| BOARD | CUPBOARD |
| CHANNEL EQ | MASTERING |

CHANNEL EQ and MASTERING expose GALLEY's channel EQ and master processing as
standalone effects. The arrangement-wide Master Speed/Pitch control is not
an insert: changing a song's duration requires the host's arrangement or
offline rendering, so it is not counted as a separate effect here.

## Fidelity and implementation

The packer reads the canonical web DSP and original instrument pages rather
than maintaining rewritten approximations of the synthesizers and effects.
Native JUCE plugin wrappers call a private, in-process JavaScriptCore DSP
instance synchronously. A WKWebView displays the editor and sends controls;
it does not run the audio device or stream audio to the host. Each plugin
has independent state, timers and DSP. Samples and speech banks are prepared
before the engine is published to the audio callback. Resource loading and
full recipe reconstruction run outside rendering. Continuous parameter
automation retains the active DSP and voices.

The 22 rack effects, CHANNEL EQ, MASTERING and eleven Core instruments reuse
their original numerical DSP. Adapter tests compare their PCM directly with
the canonical engines. SIZZLE, HOTPLATE, CLATTER, STOCK, BATTER, PICNIC and
MORSEL retain their original graphs through a native-pull Web Audio
compatibility layer. Real convolution includes the original impulse
responses and Web Audio normalization; native builds use JUCE convolution.
These graph instruments report their 128-sample processing latency plus any
compressor lookahead to the host for delay compensation.

There are specific remaining differences from browser audio:

- Graph compressors use a documented soft-knee stereo dynamics model with
  6 ms lookahead. Browser compressor implementations differ; identical PCM
  is not claimed for those nodes.
- The Web Audio compatibility engine retains the original waveshaper curves
  but does not implement the browser's `oversample` hint.
- MORSEL's finite pattern notes use the original neural speech and
  Signalsmith-fitted waveforms. A live MIDI gate has no known future duration,
  so held notes sustain a crossfaded loop in the prepared voiced region and
  release on key-up. Prepare changed words in the editor before playing them;
  the prepared voices are then retained in DAW state for editor-closed and
  offline playback. Factory voices cover MIDI 36–84. Use DAW phrase playback
  to audition steps with a custom word or voice; the keyboard audition uses
  the current keyboard word and voice.
- The browser's shared sample/pattern storage is not shared across DAW
  processes. Import samples or recipes into the plugin and save the DAW
  project to retain them.
- Standalone ingredient previews that directly create browser audio, such as
  MARINADE's Hear A/B controls, are not routed to the DAW. Use the instrument's
  native keys or DAW MIDI. In BATTER, use a catalog sample in a lane before
  auditioning it with a lane pad.
- Browser microphone-device recording and ROTISSERIE's internal deck capture
  are replaced by DAW recording followed by sample import. Live DAW input
  routing in REDUCE and ROTISSERIE is supported separately.

The original engines still allocate some per-note objects and use a garbage
collected VM. This is not a claim of allocation-free or hard-real-time DSP.
The supplied tests verify functionality and output; they do not replace
performance testing in your particular DAW and buffer-size configuration.

## Rebuild

Build on macOS with its command-line SDK, CMake 3.22+, Ninja, Git and Node.js
22 or newer. The full Xcode application is optional when the command-line
SDK is installed. JUCE 8.0.12 is fetched at the pinned release; JavaScriptCore
and WebKit are macOS system frameworks.

```sh
npm ci --prefix plugins
node plugins/scripts/generate.mjs
node plugins/scripts/checks.cjs
node plugins/scripts/runtime-checks.cjs
bash plugins/build-native.sh
```

`KITCHEN_PRODUCTS=brine\;cinder` builds selected products. Set
`KITCHEN_BUILD_AU=OFF` for VST3 only, or
`KITCHEN_ARCHITECTURES='arm64;x86_64'` to request universal binaries. The
automated distribution is arm64; an Intel slice is not implied.

Portable DSP verification also runs on Linux:

```sh
node plugins/tests/effects-checks.cjs
node plugins/tests/core-instruments-checks.cjs
node plugins/tests/webaudio-instruments-checks.cjs
node plugins/tests/host-runtime-checks.cjs
node plugins/tests/morsel-checks.cjs
```

The optional editor checks require Playwright/Chromium; set
`PLAYWRIGHT_MODULE` to its installed module path. MORSEL's factory bank is
checked in with provenance; regenerating it additionally requires the
original embedded neural and Signalsmith workers, not a speech service.

The macOS workflow additionally compiles a JavaScriptCore capability probe,
builds every plugin, tests native DSP and saved-state restoration, loads
the compiled VST3 bundles through a VST3 host with editors closed, verifies
the arm64 executable slices and checks code signatures. Build artifacts
include the reports so a successful generation step cannot be mistaken for
a validated native binary.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and `licenses/` for the
open-source JUCE/AGPL build path and the other bundled components' terms.
The native integration's license does not change the licensing of unrelated
web applications in this repository.
