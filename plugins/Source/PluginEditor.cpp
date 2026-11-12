#include "PluginEditor.h"
#include <cstring>

namespace kitchen {
PluginEditor::PluginEditor(PluginProcessor& p) : AudioProcessorEditor(p), processor(p) {
    lastSnapshotRevision = processor.editorStateRevision();
    setResizable(true, true); setResizeLimits(620, 420, 2400, 1800); setSize(1180, 820);
    auto options = juce::WebBrowserComponent::Options().withNativeIntegrationEnabled()
        // Hosts can mount or hide an editor after its page has loaded. Keep
        // that page instead of navigating to about:blank during attachment.
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withResourceProvider([this](const juce::String& path) { return resource(path); })
        .withUserScript("window.KitchenPluginDescriptor=" + juce::JSON::toString(p.getProduct().descriptor, true) + ";window.KitchenNativeEditorStorage=" + juce::JSON::toString(p.editorStorageSnapshot(), true) + ";window.KitchenPluginNative=true;")
        .withInitialisationData("kitchenProduct", p.getProduct().descriptor)
        .withEventListener("kitchenSetState", [this](const juce::var& value) { processor.stateFromEditor(value); })
        .withEventListener("kitchenSetParameter", [this](const juce::var& value) { const auto reply = processor.parameterFromEditor(value); if (reply.isObject() && browser) browser->emitEventIfBrowserIsVisible("kitchenParameterAck", reply); })
        .withEventListener("kitchenMidi", [this](const juce::var& value) { processor.midiFromEditor(value); })
        .withEventListener("kitchenEditorStorage", [this](const juce::var& value) { processor.storageFromEditor(value); })
        .withEventListener("kitchenCapture", [this](const juce::var& value) { processor.captureFromEditor(value); })
        .withEventListener("kitchenDownload", [this](const juce::var& value) { downloadToFile(value); })
        .withEventListener("kitchenReady", [this](const juce::var&) { receivedReady = true; sendState(); })
        .withEventListener("kitchenSmokeResult", [this](const juce::var& value) { smokeResult = value; })
        .withEventListener("kitchenNeuralSmokeResult", [this](const juce::var& value) { neuralSmokeResult = value; })
        .withEventListener("kitchenStorageSmokeResult", [this](const juce::var& value) { storageSmokeResult = value; })
        .withEventListener("kitchenGetState", [this](const juce::var&) { sendState(); });
    browser = std::make_unique<juce::WebBrowserComponent>(options);
    addAndMakeVisible(*browser);
    // The preferred size was set before the browser existed. Hosts may attach
    // the editor at that exact size without sending another resize callback.
    resized();
    browser->goToURL(juce::WebBrowserComponent::getResourceProviderRoot() + "ui/" + p.getProduct().id + ".html");
    startTimerHz(20);
}
void PluginEditor::resized() { if (browser) browser->setBounds(getLocalBounds()); }
PluginEditor::~PluginEditor() { processor.releaseEditorMidi(); }
void PluginEditor::startNativeUiSmoke() {
    smokeResult = juce::var(); if (!browser) return;
    browser->evaluateJavascript("void window.KitchenNativeEditor.runSmokeTest()",
        [safe = juce::Component::SafePointer<PluginEditor>(this)](juce::WebBrowserComponent::EvaluationResult result) {
            if (safe) if (const auto* error = result.getError()) {
                auto* failure = new juce::DynamicObject(); failure->setProperty("pass", false);
                failure->setProperty("error", "Could not start the original WebKit control probe: " + error->message);
                safe->smokeResult = juce::var(failure);
            }
        });
}
void PluginEditor::startNativeNeuralSmoke() { neuralSmokeResult = juce::var(); if (browser) browser->evaluateJavascript("void window.KitchenNativeEditor.runNeuralSmokeTest()"); }
void PluginEditor::startNativeStorageSmoke(bool readOnly) {
    storageSmokeResult = juce::var(); if (!browser) return;
    browser->evaluateJavascript("void(function(){const r={pass:false};try{" + juce::String(readOnly ? "" : "localStorage.setItem('__kitchenNativeSmokePreset','saved-original-editor-preset');") + "r.value=localStorage.getItem('__kitchenNativeSmokePreset');r.pass=r.value==='saved-original-editor-preset';r.reopened=" + juce::String(readOnly ? "true" : "false") + ";}catch(e){r.error=String(e);}KitchenNativeEditor.send('kitchenStorageSmokeResult',r);})()");
}
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
    result.mimeType = path.endsWithIgnoreCase(".html") ? "text/html" : path.endsWithIgnoreCase(".js") ? "text/javascript" : path.endsWithIgnoreCase(".json") ? "application/json" : path.endsWithIgnoreCase(".css") ? "text/css" : path.endsWithIgnoreCase(".wasm") ? "application/wasm" : path.endsWithIgnoreCase(".woff2") ? "font/woff2" : "application/octet-stream";
    return result;
}
void PluginEditor::sendState() {
    if (!browser) return;
    lastSnapshotRevision = processor.editorStateRevision();
    const auto snapshot = processor.editorSnapshot();
    lastParameters = juce::JSON::toString(snapshot["parameters"], true);
    browser->emitEventIfBrowserIsVisible("kitchenReady", snapshot);
}
void PluginEditor::downloadToFile(const juce::var& payload) {
    if (downloadChooser) return;
    const auto encoded = payload["base64"].toString();
    if (encoded.isEmpty() || encoded.length() > 640 * 1024 * 1024) return;
    downloadData.reset(); bool decoded = false;
    { juce::MemoryOutputStream output(downloadData, false); decoded = juce::Base64::convertFromBase64(output, encoded); }
    if (!decoded) { downloadData.reset(); return; }
    auto filename = juce::File::createLegalFileName(payload["filename"].toString()); if (filename.isEmpty()) filename = "Kitchen-export";
    downloadChooser = std::make_unique<juce::FileChooser>("Save Kitchen export", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile(filename));
    downloadChooser->launchAsync(juce::FileBrowserComponent::saveMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::warnAboutOverwriting,
        [safe = juce::Component::SafePointer<PluginEditor>(this)](const juce::FileChooser& chooser) {
            if (!safe) return;
            const auto file = chooser.getResult();
            if (file != juce::File()) { const bool saved = file.replaceWithData(safe->downloadData.getData(), safe->downloadData.getSize()); auto* result = new juce::DynamicObject(); result->setProperty("ok", saved); result->setProperty("filename", file.getFileName()); if (safe->browser) safe->browser->emitEventIfBrowserIsVisible("kitchenDownloadResult", juce::var(result)); }
            safe->downloadData.reset(); safe->downloadChooser.reset();
        });
}
void PluginEditor::timerCallback() {
    if (!browser) return;
    const auto revision = processor.editorStateRevision();
    if (revision != lastSnapshotRevision) { lastSnapshotRevision = revision; sendState(); }
    browser->emitEventIfBrowserIsVisible("kitchenClock", processor.editorClock());
    for (const auto& reply : processor.captureReplies()) browser->emitEventIfBrowserIsVisible("kitchenCapture", reply);
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
