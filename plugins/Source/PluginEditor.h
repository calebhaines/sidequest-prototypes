#pragma once
#include "PluginProcessor.h"
#include <juce_gui_extra/juce_gui_extra.h>

namespace kitchen {
class PluginEditor final : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit PluginEditor(PluginProcessor&);
    ~PluginEditor() override;
    void resized() override;
    bool nativeUiReady() const noexcept { return receivedReady; }
    void startNativeUiSmoke();
    juce::var nativeUiSmokeResult() const { return smokeResult; }
    void startNativeNeuralSmoke();
    juce::var nativeNeuralSmokeResult() const { return neuralSmokeResult; }
    void startNativeStorageSmoke(bool readOnly);
    juce::var nativeStorageSmokeResult() const { return storageSmokeResult; }
private:
    PluginProcessor& processor;
    std::unique_ptr<juce::WebBrowserComponent> browser;
    std::unique_ptr<juce::FileChooser> downloadChooser;
    juce::MemoryBlock downloadData;
    juce::Label error;
    juce::String lastStatus;
    juce::String lastParameters;
    int ticks = 0;
    std::uint64_t lastSnapshotRevision = 0;
    bool receivedReady = false;
    juce::var smokeResult;
    juce::var neuralSmokeResult;
    juce::var storageSmokeResult;
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String&);
    void timerCallback() override;
    void sendState();
    void downloadToFile(const juce::var&);
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginEditor)
};
}
