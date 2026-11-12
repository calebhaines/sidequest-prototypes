Apple Silicon preview of **all 18 Kitchen instruments and 24 GALLEY effects/utilities**, as VST3 plugins, with Audio Units included for Logic.

Preview 3 fixes missed notes and growing CPU usage during sustained playback in the native Web Audio instruments. CLATTER's finished voice clocks now release their audio graphs, and note starts cannot be stranded in an already-rendered audio block by floating-point rounding. BATTER automation updates the affected control without repeatedly recompiling the pattern, preserves the DAW tempo, and bounds completed control-smoothing history. Saving a BATTER snapshot also retains the connection between its live controls and audio graph. Regression checks cover precise source timing and cleanup, plus five minutes of paired BATTER/CLATTER playback through the compiled VST3 plugins with DAW patterns, MIDI, continuous volume automation, tempo changes and looping. Instrument recipes, DSP models, plugin IDs and project-state formats are retained.

Preview 2 fixes black plugin interfaces when a DAW opens an editor at its preferred size without resizing it. The embedded browser now receives its bounds immediately and keeps its page loaded during host attachment or temporary hiding. It also removes long interface stalls when reopening HOTPLATE or restoring large saved states. Native regression tests cover initial layout without a resize and opening, reopening and resizing the compiled VST3 editor in a host window. Audio DSP, plugin IDs and project-state formats are retained.

- Original Kitchen editors and DSP, with DAW tempo, playhead, looping and MIDI.
- Audio and offline rendering work with the editor closed.
- Prepared MORSEL neural voices, per-voice percussion effects and FERMENT MIDI capture/export are retained.
- Source, licenses, rebuild instructions and native test reports accompany the binaries.

Close your DAW, extract `Kitchen-Apple-Silicon.zip`, and run `Install.command` on your Mac, or copy the VST3 bundles into `~/Library/Audio/Plug-Ins/VST3/` and the Audio Units into `~/Library/Audio/Plug-Ins/Components/`. Reopen and rescan your DAW. Turn **DAW pattern** off to use DAW MIDI alone.

This is an **arm64 preview**, ad-hoc signed rather than notarized. The installer verifies each bundle and removes quarantine only from the installed Kitchen plugins. The README documents graph-compressor/oversampling differences, MORSEL live sustain, preview controls and CPU limitations. Native automated host tests do not imply testing in every commercial DAW.

The native integration uses the AGPLv3 open-source JUCE build path. All corresponding sources and applicable third-party notices are included.
