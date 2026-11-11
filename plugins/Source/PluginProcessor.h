#pragma once
#include "NativeRuntime.h"
#include <atomic>
#include <array>

namespace kitchen {
class PluginEditor;
class PluginProcessor final : public juce::AudioProcessor, private juce::Thread {
public:
    explicit PluginProcessor(Product product, juce::File resources = findResourceRoot());
    ~PluginProcessor() override;
    const juce::String getName() const override { return product.name; }
    bool acceptsMidi() const override { return product.instrument() || product.id == "ferment"; }
    bool producesMidi() const override { return product.id == "ferment"; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return product.instrument() ? 30.0 : 60.0; }
    void prepareToPlay(double, int) override;
    void releaseResources() override;
    bool isBusesLayoutSupported(const BusesLayout&) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    void reset() override;
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return "Default"; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;
    const Product& getProduct() const noexcept { return product; }
    const juce::File& resourceRoot() const noexcept { return resources; }
    juce::var editorSnapshot();
    juce::var editorClock() const;
    juce::var parameterSnapshot() const;
    juce::String statusMessage();
    void stateFromEditor(const juce::var&);
    void parameterFromEditor(const juce::var&);
    void midiFromEditor(const juce::var&);
    bool isReady() const noexcept { return readyFlag.load(); }
private:
    Product product;
    juce::File resources;
    juce::Array<juce::var> metadata;
    std::vector<juce::RangedAudioParameter*> hostParameters;
    NativeRuntime* current = nullptr;
    std::atomic<NativeRuntime*> pending { nullptr };
    std::vector<float> lastParameters;
    std::atomic<bool> readyFlag { false }, runtimeFault { false }, resetRequested { false }, appliedFlag { false };
    std::atomic<double> rate { 48000.0 };
    std::atomic<int> maxBlock { 512 };
    std::atomic<std::uint64_t> requestVersion { 0 };
    std::uint64_t builtVersion = 0;
    juce::CriticalSection stateLock;
    juce::String cachedState, status;
    juce::MidiBuffer outputMidi;
    ClockTracker clockTracker;
    std::array<std::atomic<double>, clockFields> displayClock{};
    struct Garbage { void* pointer = nullptr; void (*destroy)(void*) = nullptr; };
    std::array<Garbage, 1024> garbage{};
    juce::AbstractFifo garbageFifo { static_cast<int>(garbage.size()) };
    struct UiMidi { int type = 0, data1 = 0, channel = 1; double data2 = 0; };
    std::array<UiMidi, 1024> uiMidi{};
    juce::AbstractFifo uiMidiFifo { static_cast<int>(uiMidi.size()) };
    std::uint32_t noteSerial = 0;
    std::array<std::array<std::uint32_t, 8>, 16 * 128> heldIds{};
    std::array<int, 16 * 128> heldCount{};
    void run() override;
    void requestRebuild();
    void rebuildSynchronously();
    bool retire(void*, void (*)(void*)) noexcept;
    static bool retireThunk(void*, void*, void (*)(void*));
    void drainGarbage();
    std::uint32_t midiId(int pitch, int channel, bool on) noexcept;
    void addEvent(NativeRuntime&, int offset, int type, int first, double second, int channel) noexcept;
    void readHostClock(std::array<double, clockFields>&, int frames);
    void synchronizeParametersFromState(const juce::var&);
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(PluginProcessor)
};
}
