#include "PluginEditor.h"
#include <iostream>
#include <cmath>
#include <stdexcept>

namespace {
class AudioPump final : private juce::Thread {
public:
    explicit AudioPump(kitchen::PluginProcessor& p) : juce::Thread("Kitchen UI smoke audio"), processor(p) { startThread(); }
    ~AudioPump() override { signalThreadShouldExit(); notify(); stopThread(-1); }
private:
    kitchen::PluginProcessor& processor;
    void run() override {
        juce::AudioBuffer<float> audio(2, 128); juce::MidiBuffer midi; midi.ensureSize(16384); std::uint64_t frame = 0;
        while (!threadShouldExit()) {
            audio.clear(); midi.clear();
            if (processor.getProduct().instrument() && frame == 0) midi.addEvent(juce::MidiMessage::noteOn(1, 48, .7f), 17);
            if (!processor.getProduct().instrument()) for (int i = 0; i < 128; ++i) { const float sample = static_cast<float>(.03 * std::sin((frame + i) * 220.0 * 2.0 * juce::MathConstants<double>::pi / 48000.0)); audio.setSample(0, i, sample); audio.setSample(1, i, sample); }
            processor.processBlock(audio, midi); frame += 128; wait(3);
        }
    }
};
class SmokeWindow final : public juce::Component {
public:
    SmokeWindow() { setName("Kitchen native WebKit integration"); }
    void setContentOwned(juce::Component* view) {
        content.reset(view); addAndMakeVisible(*content); setSize(content->getWidth(), content->getHeight());
    }
    void attach() { addToDesktop(juce::ComponentPeer::windowHasTitleBar); setVisible(true); }
private:
    std::unique_ptr<juce::Component> content;
};
void requireBrowserBounds(const kitchen::PluginEditor& editor) {
    for (int i = 0; i < editor.getNumChildComponents(); ++i)
        if (auto* browser = dynamic_cast<juce::WebBrowserComponent*>(editor.getChildComponent(i))) {
            if (browser->getBounds() == editor.getLocalBounds() && browser->getWidth() > 0 && browser->getHeight() > 0) return;
            throw std::runtime_error("Native browser does not fill the editor before a host resize");
        }
    throw std::runtime_error("Native editor is missing its browser component");
}
class NativeUiSmokeApplication final : public juce::JUCEApplication, private juce::Timer {
public:
    const juce::String getApplicationName() override { return "Kitchen native UI smoke"; }
    const juce::String getApplicationVersion() override { return "1.0"; }
    bool moreThanOneInstanceAllowed() override { return true; }
    void initialise(const juce::String& commandLine) override {
        auto arguments = juce::StringArray::fromTokens(commandLine, true);
        for (int i = 0; i < arguments.size(); ++i) { if (arguments[i] == "--resources" && i + 1 < arguments.size()) resources = juce::File(arguments[++i].unquoted()); else if (arguments[i] == "--report" && i + 1 < arguments.size()) reportFile = juce::File(arguments[++i].unquoted()); }
        if (reportFile == juce::File()) reportFile = resources.getChildFile("native-ui-smoke-report.json");
        try { manifest = kitchen::readManifest(resources); beginProduct(); startTimerHz(20); }
        catch (const std::exception& e) { std::cerr << e.what() << std::endl; setApplicationReturnValue(2); quit(); }
    }
    void shutdown() override { stopTimer(); closeProduct(); }
    void systemRequestedQuit() override { success = false; writeReport(); setApplicationReturnValue(1); quit(); }
private:
    const juce::StringArray ids { "brine", "form", "morsel", "sunday" };
    juce::File resources, reportFile;
    juce::var manifest;
    juce::Array<juce::var> results;
    std::unique_ptr<kitchen::PluginProcessor> processor;
    std::unique_ptr<SmokeWindow> window;
    std::unique_ptr<AudioPump> audio;
    kitchen::PluginEditor* editor = nullptr;
    int index = 0;
    bool requested = false, neuralRequested = false, success = true;
    int storageStage = 0;
    juce::var parameterResult;
    double started = 0, attachAfter = 0;
    bool attached = false, resizeChecked = false, preferredBoundsChecked = false, reopenedBoundsChecked = false, tickRunning = false;
    void closeProduct() { audio.reset(); window.reset(); editor = nullptr; if (processor) processor->releaseResources(); processor.reset(); }
    void openEditor(bool reopening = false) {
        window = std::make_unique<SmokeWindow>(); auto next = std::make_unique<kitchen::PluginEditor>(*processor);
        // No parent, peer, DocumentWindow content fitting, or extra setSize may
        // repair a missing initial browser layout before this assertion.
        requireBrowserBounds(*next);
        if (reopening) reopenedBoundsChecked = true; else preferredBoundsChecked = true;
        editor = next.get(); window->setContentOwned(next.release()); window->centreWithSize(editor->getWidth(), editor->getHeight());
        attached = false; attachAfter = juce::Time::getMillisecondCounterHiRes() + 250;
    }
    void beginProduct() {
        closeProduct();
        const auto product = kitchen::findProduct(manifest, ids[index]);
        processor = std::make_unique<kitchen::PluginProcessor>(product, resources); processor->prepareToPlay(48000, 128);
        if (!processor->isReady()) throw std::runtime_error(processor->statusMessage().toStdString());
        preferredBoundsChecked = reopenedBoundsChecked = resizeChecked = false;
        openEditor(); audio = std::make_unique<AudioPump>(*processor);
        requested = neuralRequested = false; storageStage = 0; parameterResult = juce::var(); started = juce::Time::getMillisecondCounterHiRes();
    }
    void finishProduct(juce::var result) {
        auto* object = result.getDynamicObject(); if (object == nullptr) { object = new juce::DynamicObject(); result = juce::var(object); }
        object->setProperty("id", ids[index]); object->setProperty("wkWebView", true); object->setProperty("nativeReady", editor != nullptr && editor->nativeUiReady());
        object->setProperty("preferredSizeWithoutHostResize", preferredBoundsChecked); object->setProperty("delayedAttachment", attached); object->setProperty("resizeRoundTrip", resizeChecked);
        if (ids[index] == "brine") object->setProperty("reopenedPreferredSize", reopenedBoundsChecked);
        if (!static_cast<bool>(result["pass"])) success = false;
        results.add(result); std::cout << juce::JSON::toString(result, true).toStdString() << std::endl;
        closeProduct();
        if (++index >= ids.size()) { stopTimer(); writeReport(); setApplicationReturnValue(success ? 0 : 1); quit(); return; }
        try { beginProduct(); } catch (const std::exception& e) { auto* failure = new juce::DynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", e.what()); finishProduct(juce::var(failure)); }
    }
    void timerCallback() override {
        if (tickRunning) return;
        const juce::ScopedValueSetter<bool> guard(tickRunning, true);
        if (editor == nullptr) return;
        const double timeout = ids[index] == "morsel" ? 120000 : 45000;
        if (juce::Time::getMillisecondCounterHiRes() - started > timeout) { auto* failure = new juce::DynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", neuralRequested ? "Timed out waiting for original WebKit neural/Signalsmith preparation" : "Timed out waiting for original WebKit UI hydration and parameter roundtrip"); finishProduct(juce::var(failure)); return; }
        if (!attached) {
            if (juce::Time::getMillisecondCounterHiRes() < attachAfter) return;
            window->attach();
            try { requireBrowserBounds(*editor); }
            catch (const std::exception& error) { auto* failure = new juce::DynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", error.what()); finishProduct(juce::var(failure)); return; }
            attached = true; return;
        }
        if (storageStage != 0) {
            if (storageStage == 2) { if (editor->nativeUiReady()) { storageStage = 3; editor->startNativeStorageSmoke(true); } return; }
            const auto storage = editor->nativeStorageSmokeResult(); if (!storage.isObject()) return;
            if (!static_cast<bool>(storage["pass"])) { parameterResult.getDynamicObject()->setProperty("pass", false); parameterResult.getDynamicObject()->setProperty("error", "Native editor preset storage roundtrip failed"); finishProduct(parameterResult); return; }
            if (storageStage == 1) {
                juce::MemoryBlock saved; processor->getStateInformation(saved);
                const auto state = juce::JSON::parse(juce::String::fromUTF8(static_cast<const char*>(saved.getData()), static_cast<int>(saved.getSize())));
                const auto unit = juce::String::fromUTF8(u8"saved-original-editor-preset 'single' \"double\" \\ path\ncaf\u00e9 \U0001f373 \u2028");
                if (state["editorStorage"]["__kitchenNativeSmokePreset"].toString() != juce::String::repeatedString(unit, 8192)) { parameterResult.getDynamicObject()->setProperty("pass", false); parameterResult.getDynamicObject()->setProperty("error", "Quoted Unicode editor preset was not preserved in native host state"); finishProduct(parameterResult); return; }
                processor->setStateInformation(saved.getData(), static_cast<int>(saved.getSize()));
                window.reset(); editor = nullptr;
                try { openEditor(true); }
                catch (const std::exception& error) { parameterResult.getDynamicObject()->setProperty("pass", false); parameterResult.getDynamicObject()->setProperty("error", error.what()); finishProduct(parameterResult); return; }
                storageStage = 2; return;
            }
            parameterResult.getDynamicObject()->setProperty("editorStorageRoundTrip", storage); finishProduct(parameterResult); return;
        }
        if (neuralRequested) {
            const auto neural = editor->nativeNeuralSmokeResult(); if (!neural.isObject()) return;
            parameterResult.getDynamicObject()->setProperty("neural", neural);
            if (!static_cast<bool>(neural["pass"])) { parameterResult.getDynamicObject()->setProperty("pass", false); parameterResult.getDynamicObject()->setProperty("error", neural["error"]); }
            finishProduct(parameterResult); return;
        }
        if (!requested && editor->nativeUiReady()) { requested = true; editor->startNativeUiSmoke(); }
        const auto result = editor->nativeUiSmokeResult(); if (!result.isObject()) return;
        if (static_cast<bool>(result["pass"])) {
            const auto parameter = result["parameter"]; const int at = parameter["index"];
            const auto expected = parameter["normalizedAfter"];
            const auto& parameters = processor->getParameters();
            if (at < 0 || at >= parameters.size() || expected.isVoid() || std::abs(parameters[at]->getValue() - static_cast<float>(expected)) > .002f) { auto* failure = result.getDynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", "Original UI edit did not reach the native host parameter"); }
            else result.getDynamicObject()->setProperty("nativeParameterRoundTrip", true);
            try { editor->setSize(1060, 720); requireBrowserBounds(*editor); editor->setSize(1180, 820); requireBrowserBounds(*editor); resizeChecked = true; }
            catch (const std::exception& error) { result.getDynamicObject()->setProperty("pass", false); result.getDynamicObject()->setProperty("error", error.what()); }
        }
        if (ids[index] == "morsel" && static_cast<bool>(result["pass"])) { parameterResult = result; neuralRequested = true; editor->startNativeNeuralSmoke(); return; }
        if (ids[index] == "brine" && static_cast<bool>(result["pass"])) { parameterResult = result; storageStage = 1; editor->startNativeStorageSmoke(false); return; }
        finishProduct(result);
    }
    void writeReport() {
        auto* object = new juce::DynamicObject(); object->setProperty("passed", success); object->setProperty("products", results);
        reportFile.replaceWithText(juce::JSON::toString(juce::var(object), false));
    }
};
}
START_JUCE_APPLICATION(NativeUiSmokeApplication)
