Apple Silicon preview of **all 18 Kitchen instruments and 24 GALLEY effects/utilities**, as VST3 plugins, with Audio Units included for Logic.

Preview 2 fixes black plugin interfaces when a DAW opens an editor at its preferred size without resizing it. The embedded browser now receives its bounds immediately and keeps its page loaded during host attachment or temporary hiding. It also removes long interface stalls when reopening HOTPLATE or restoring large saved states. Native regression tests cover initial layout without a resize and opening, reopening and resizing the compiled VST3 editor in a host window. Audio DSP, plugin IDs and project-state formats are retained.

- Original Kitchen editors and DSP, with DAW tempo, playhead, looping and MIDI.
- Audio and offline rendering work with the editor closed.
- Prepared MORSEL neural voices, per-voice percussion effects and FERMENT MIDI capture/export are retained.
- Source, licenses, rebuild instructions and native test reports accompany the binaries.

Close your DAW, extract `Kitchen-Apple-Silicon.zip`, and run `Install.command` on your Mac, or copy the VST3 bundles into `~/Library/Audio/Plug-Ins/VST3/` and the Audio Units into `~/Library/Audio/Plug-Ins/Components/`. Reopen and rescan your DAW. Turn **DAW pattern** off to use DAW MIDI alone.

This is an **arm64 preview**, ad-hoc signed rather than notarized. The installer verifies each bundle and removes quarantine only from the installed Kitchen plugins. The README documents graph-compressor/oversampling differences, MORSEL live sustain, preview controls and CPU limitations. Native automated host tests do not imply testing in every commercial DAW.

The native integration uses the AGPLv3 open-source JUCE build path. All corresponding sources and applicable third-party notices are included.
