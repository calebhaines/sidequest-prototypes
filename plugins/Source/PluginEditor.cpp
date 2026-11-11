#include "PluginEditor.h"
#include <cstring>

namespace kitchen {
PluginEditor::PluginEditor(PluginProcessor& p) : AudioProcessorEditor(p), processor(p) {
    setResizable(true, true); setResizeLimits(620, 420, 2400, 1800); setSize(1180, 820);
    auto options = juce::WebBrowserComponent::Options().withNativeIntegrationEnabled()
        .withResourceProvider([this](const juce::String& path) { return resource(path); })
        .withUserScript("window.KitchenPluginDescriptor=" + juce::JSON::toString(p.getProduct().descriptor, true) + ";window.KitchenPluginNative=true;")
        .withInitialisationData("kitchenProduct", p.getProduct().descriptor)
        .withEventListener("kitchenSetState", [this](const juce::var& value) { processor.stateFromEditor(value); })
        .withEventListener("kitchenSetParameter", [this](const juce::var& value) { processor.parameterFromEditor(value); })
        .withEventListener("kitchenMidi", [this](const juce::var& value) { processor.midiFromEditor(value); })
        .withEventListener("kitchenReady", [this](const juce::var&) { sendState(); })
        .withEventListener("kitchenGetState", [this](const juce::var&) { sendState(); });
    browser = std::make_unique<juce::WebBrowserComponent>(options);
    addAndMakeVisible(*browser);
    browser->goToURL(juce::WebBrowserComponent::getResourceProviderRoot() + "ui/" + p.getProduct().id + ".html");
    startTimerHz(20);
}
void PluginEditor::resized() { if (browser) browser->setBounds(getLocalBounds()); }
std::optional<juce::WebBrowserComponent::Resource> PluginEditor::resource(const juce::String& requested) {
    auto path = juce::URL::removeEscapeChars(requested).upToFirstOccurrenceOf("?", false, false);
    while (path.startsWithChar('/')) path = path.substring(1);
    if (path.isEmpty()) path = "ui/" + processor.getProduct().id + ".html";
    if (path.contains("..") || path.containsChar(':') || path.containsChar('\\')) return std::nullopt;
    auto file = processor.resourceRoot().getChildFile(path); if (!file.isAChildOf(processor.resourceRoot())) return std::nullopt;
    juce::MemoryBlock bytes;
    if (file.existsAsFile()) { if (!file.loadFileAsData(bytes)) return std::nullopt; }
    else if (processor.resourceRoot().getChildFile(path + ".gz").existsAsFile()) {
        juce::FileInputStream input(processor.resourceRoot().getChildFile(path + ".gz"));
        juce::GZIPDecompressorInputStream stream(&input, false, juce::GZIPDecompressorInputStream::gzipFormat); stream.readIntoMemoryBlock(bytes);
    } else return std::nullopt;
    juce::WebBrowserComponent::Resource result; result.data.resize(bytes.getSize()); if (bytes.getSize()) std::memcpy(result.data.data(), bytes.getData(), bytes.getSize());
    result.mimeType = path.endsWithIgnoreCase(".html") ? "text/html; charset=utf-8" : path.endsWithIgnoreCase(".js") ? "text/javascript" : path.endsWithIgnoreCase(".json") ? "application/json" : path.endsWithIgnoreCase(".css") ? "text/css" : path.endsWithIgnoreCase(".wasm") ? "application/wasm" : path.endsWithIgnoreCase(".woff2") ? "font/woff2" : "application/octet-stream";
    return result;
}
void PluginEditor::sendState() {
    if (!browser) return;
    const auto value = processor.editorSnapshot(); browser->emitEventIfBrowserIsVisible("kitchenReady", value); browser->emitEventIfBrowserIsVisible("kitchenState", value);
}
void PluginEditor::timerCallback() {
    if (!browser) return;
    browser->emitEventIfBrowserIsVisible("kitchenClock", processor.editorClock());
    const auto message = processor.statusMessage();
    if (message != lastStatus) { lastStatus = message; auto* value = new juce::DynamicObject(); value->setProperty("message", message); value->setProperty("ready", processor.isReady()); browser->emitEventIfBrowserIsVisible("kitchenStatus", juce::var(value)); }
    // Host automation changes do not touch the DSP's JavaScript context from
    // the message thread. Deliver only normalized atomics to the web controls.
    if (++ticks % 4 == 0) {
        const auto values = processor.parameterSnapshot(); const auto next = juce::JSON::toString(values, true);
        if (next != lastParameters) { lastParameters = next; browser->emitEventIfBrowserIsVisible("kitchenParameters", values); }
    }
}
}
