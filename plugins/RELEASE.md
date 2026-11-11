Apple Silicon preview of **all 18 Kitchen instruments and 24 GALLEY effects/utilities**, as VST3 plugins, with Audio Units included for Logic.

- Original Kitchen editors and DSP, with DAW tempo, playhead, looping and MIDI.
- Audio and offline rendering work with the editor closed.
- Prepared MORSEL neural voices, per-voice percussion effects and FERMENT MIDI capture/export are retained.
- Source, licenses, rebuild instructions and native test reports accompany the binaries.

Extract `Kitchen-Apple-Silicon.zip`. Run `Install.command` on your Mac, or copy the VST3 bundles into `~/Library/Audio/Plug-Ins/VST3/` and the Audio Units into `~/Library/Audio/Plug-Ins/Components/`. Rescan your DAW. Turn **DAW pattern** off to use DAW MIDI alone.

This is an **arm64 preview**, ad-hoc signed rather than notarized. The installer verifies each bundle and removes quarantine only from the installed Kitchen plugins. The README documents graph-compressor/oversampling differences, MORSEL live sustain, preview controls and CPU limitations. Native automated host tests do not imply testing in every commercial DAW.

The native integration uses the AGPLv3 open-source JUCE build path. All corresponding sources and applicable third-party notices are included.
