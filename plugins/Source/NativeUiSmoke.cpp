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
class SmokeWindow final : public juce::DocumentWindow {
public:
    SmokeWindow() : DocumentWindow("Kitchen native WebKit integration", juce::Colours::black, closeButton) { setUsingNativeTitleBar(true); }
    void closeButtonPressed() override { juce::JUCEApplication::getInstance()->systemRequestedQuit(); }
};
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
    bool requested = false, success = true;
    double started = 0;
    void closeProduct() { audio.reset(); window.reset(); editor = nullptr; if (processor) processor->releaseResources(); processor.reset(); }
    void beginProduct() {
        closeProduct();
        const auto product = kitchen::findProduct(manifest, ids[index]);
        processor = std::make_unique<kitchen::PluginProcessor>(product, resources); processor->prepareToPlay(48000, 128);
        if (!processor->isReady()) throw std::runtime_error(processor->statusMessage().toStdString());
        window = std::make_unique<SmokeWindow>(); editor = new kitchen::PluginEditor(*processor); window->setContentOwned(editor, true); window->centreWithSize(1180, 820); window->setVisible(true); audio = std::make_unique<AudioPump>(*processor);
        requested = false; started = juce::Time::getMillisecondCounterHiRes();
    }
    void finishProduct(juce::var result) {
        auto* object = result.getDynamicObject(); if (object == nullptr) { object = new juce::DynamicObject(); result = juce::var(object); }
        object->setProperty("id", ids[index]); object->setProperty("wkWebView", true); object->setProperty("nativeReady", editor != nullptr && editor->nativeUiReady());
        if (!static_cast<bool>(result["pass"])) success = false;
        results.add(result); std::cout << juce::JSON::toString(result, true).toStdString() << std::endl;
        closeProduct();
        if (++index >= ids.size()) { stopTimer(); writeReport(); setApplicationReturnValue(success ? 0 : 1); quit(); return; }
        try { beginProduct(); } catch (const std::exception& e) { auto* failure = new juce::DynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", e.what()); finishProduct(juce::var(failure)); }
    }
    void timerCallback() override {
        if (editor == nullptr) return;
        if (juce::Time::getMillisecondCounterHiRes() - started > 45000) { auto* failure = new juce::DynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", "Timed out waiting for original WebKit UI hydration and parameter roundtrip"); finishProduct(juce::var(failure)); return; }
        if (!requested && editor->nativeUiReady()) { requested = true; editor->startNativeUiSmoke(); }
        const auto result = editor->nativeUiSmokeResult(); if (!result.isObject()) return;
        if (static_cast<bool>(result["pass"])) {
            const auto parameter = result["parameter"]; const int at = parameter["index"];
            const auto expected = parameter["normalizedAfter"];
            const auto& parameters = processor->getParameters();
            if (at < 0 || at >= parameters.size() || expected.isVoid() || std::abs(parameters[at]->getValue() - static_cast<float>(expected)) > .002f) { auto* failure = result.getDynamicObject(); failure->setProperty("pass", false); failure->setProperty("error", "Original UI edit did not reach the native host parameter"); }
            else result.getDynamicObject()->setProperty("nativeParameterRoundTrip", true);
        }
        finishProduct(result);
    }
    void writeReport() {
        auto* object = new juce::DynamicObject(); object->setProperty("passed", success); object->setProperty("products", results);
        reportFile.replaceWithText(juce::JSON::toString(juce::var(object), false));
    }
};
}
START_JUCE_APPLICATION(NativeUiSmokeApplication)
