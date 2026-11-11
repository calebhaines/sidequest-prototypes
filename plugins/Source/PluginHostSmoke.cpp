#include "NativeRuntime.h"
#include <juce_audio_utils/juce_audio_utils.h>
#include <iostream>
#include <cmath>

class TestPlayHead final : public juce::AudioPlayHead {
public:
    PositionInfo position;
    juce::Optional<PositionInfo> getPosition() const override { return position; }
};
namespace {
struct Metrics { double rms = 0, peak = 0; int first = -1; };
Metrics render(juce::AudioPluginInstance& plugin, TestPlayHead& playHead, bool instrument) {
    constexpr int frames = 128, quanta = 140; double energy = 0; Metrics metrics;
    juce::AudioBuffer<float> audio(2, frames); juce::MidiBuffer midi; midi.ensureSize(16384);
    double beat = 0;
    for (int block = 0; block < quanta; ++block) {
        const double bpm = block < 45 ? 120 : 137;
        if (block == 75) beat = .5;
        playHead.position.setBpm(bpm); playHead.position.setPpqPosition(beat);
        playHead.position.setTimeInSamples(block * frames); playHead.position.setTimeSignature({ 7, 8 });
        playHead.position.setIsPlaying(block >= 8 && block < 125);
        playHead.position.setIsLooping(block >= 75 && block < 125);
        playHead.position.setLoopPoints({ .5, 2.5 });
        audio.clear(); midi.clear();
        if (instrument && block == 0) for (const int pitch : { 36, 48, 60 }) midi.addEvent(juce::MidiMessage::noteOn(1, pitch, .8f), 17);
        if (instrument && block == 12) midi.addEvent(juce::MidiMessage::pitchWheel(1, 10240), 19);
        if (instrument && block == 20) midi.addEvent(juce::MidiMessage::controllerEvent(1, 1, 80), 23);
        if (instrument && block == 100) for (const int pitch : { 36, 48, 60 }) midi.addEvent(juce::MidiMessage::noteOff(1, pitch), 31);
        if (!instrument) for (int i = 0; i < frames; ++i) { const double t = (block * frames + i) / 48000.0; audio.setSample(0, i, static_cast<float>(.07 * std::sin(2 * juce::MathConstants<double>::pi * 220 * t))); audio.setSample(1, i, static_cast<float>(.06 * std::sin(2 * juce::MathConstants<double>::pi * 330 * t))); }
        plugin.processBlock(audio, midi);
        for (int channel = 0; channel < 2; ++channel) for (int i = 0; i < frames; ++i) { const auto sample = audio.getSample(channel, i); if (!std::isfinite(sample)) throw std::runtime_error("Compiled VST3 emitted non-finite audio"); energy += sample * sample; metrics.peak = juce::jmax(metrics.peak, static_cast<double>(std::abs(sample))); if (metrics.first < 0 && std::abs(sample) > 1.0e-7f) metrics.first = block * frames + i; }
        if (block >= 8 && block < 125) beat += frames * bpm / (60.0 * 48000.0);
    }
    metrics.rms = std::sqrt(energy / (quanta * frames * 2)); return metrics;
}
}
int main(int argc, char* argv[]) {
    juce::ScopedJuceInitialiser_GUI initialiser; juce::File directory; juce::File reportFile;
    for (int i = 1; i < argc; ++i) { const juce::String arg(argv[i]); if (arg == "--bundles" && i + 1 < argc) directory = juce::File(argv[++i]); else if (arg == "--report" && i + 1 < argc) reportFile = juce::File(argv[++i]); }
    if (!directory.isDirectory()) { std::cerr << "Pass --bundles with the CMake build directory\n"; return 2; }
    juce::AudioPluginFormatManager manager; manager.addFormat(std::make_unique<juce::VST3PluginFormat>());
    juce::Array<juce::File> bundles; directory.findChildFiles(bundles, juce::File::findDirectories, true, "*.vst3");
    bool success = !bundles.isEmpty(); juce::Array<juce::var> rows;
    for (const auto& bundle : bundles) {
        auto* row = new juce::DynamicObject(); row->setProperty("bundle", bundle.getFullPathName());
        try {
            juce::OwnedArray<juce::PluginDescription> descriptions; manager.getFormat(0)->findAllTypesForFile(descriptions, bundle.getFullPathName());
            if (descriptions.size() != 1) throw std::runtime_error("Compiled bundle did not expose exactly one VST3 product");
            juce::String error; auto plugin = manager.createPluginInstance(*descriptions[0], 48000, 128, error);
            if (!plugin) throw std::runtime_error(("Could not load compiled VST3: " + error).toStdString());
            TestPlayHead playHead; plugin->setPlayHead(&playHead); plugin->setPlayConfigDetails(descriptions[0]->isInstrument ? 0 : 2, 2, 48000, 128); plugin->prepareToPlay(48000, 128);
            const auto audio = render(*plugin, playHead, descriptions[0]->isInstrument);
            if (audio.first < 0 || audio.rms < 1.0e-8) throw std::runtime_error("Compiled VST3 rendered silence");
            juce::MemoryBlock saved; plugin->getStateInformation(saved); if (saved.getSize() == 0) throw std::runtime_error("Compiled VST3 state is empty");
            plugin->releaseResources(); plugin.reset();
            auto restored = manager.createPluginInstance(*descriptions[0], 48000, 128, error); if (!restored) throw std::runtime_error(error.toStdString());
            restored->setStateInformation(saved.getData(), static_cast<int>(saved.getSize())); restored->setPlayHead(&playHead); restored->setPlayConfigDetails(descriptions[0]->isInstrument ? 0 : 2, 2, 48000, 128); restored->prepareToPlay(48000, 128);
            const auto again = render(*restored, playHead, descriptions[0]->isInstrument); if (again.rms < 1.0e-8) throw std::runtime_error("Reloaded compiled VST3 rendered silence");
            row->setProperty("name", descriptions[0]->name); row->setProperty("passed", true); row->setProperty("rms", audio.rms); row->setProperty("peak", audio.peak); row->setProperty("firstSample", audio.first); row->setProperty("latencySamples", restored->getLatencySamples()); row->setProperty("stateBytes", static_cast<juce::int64>(saved.getSize())); row->setProperty("editorClosed", true); row->setProperty("clockChanges", true); restored->releaseResources();
        } catch (const std::exception& e) { success = false; row->setProperty("passed", false); row->setProperty("error", e.what()); }
        rows.add(juce::var(row)); std::cout << juce::JSON::toString(juce::var(row), true).toStdString() << std::endl;
    }
    auto* result = new juce::DynamicObject(); result->setProperty("passed", success); result->setProperty("products", rows);
    if (reportFile != juce::File{}) reportFile.replaceWithText(juce::JSON::toString(juce::var(result), false));
    return success ? 0 : 1;
}
