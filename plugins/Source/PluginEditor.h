#pragma once
#include "PluginProcessor.h"
#include <juce_gui_extra/juce_gui_extra.h>

namespace kitchen {
class PluginEditor final : public juce::AudioProcessorEditor, private juce::Timer {
public:
    explicit PluginEditor(PluginProcessor&);
    void resized() override;
private:
    PluginProcessor& processor;
    std::unique_ptr<juce::WebBrowserComponent> browser;
    juce::Label error;
    juce::String lastStatus;
    juce::String lastParameters;
    int ticks = 0;
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String&);
    void timerCallback() override;
    void sendState();
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginEditor)
};
}
