#pragma once
#include "HostContract.h"
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_dsp/juce_dsp.h>
#include <JavaScriptCore/JavaScriptCore.h>
#include <memory>
#include <vector>

namespace kitchen {
struct Product {
    juce::String id, name, kind;
    juce::var descriptor;
    bool instrument() const { return kind == "instrument"; }
    bool liveInput() const { return id == "mire" || id == "spool"; }
    juce::Array<juce::var> parameters() const;
};
juce::File findResourceRoot();
juce::String readTextResource(const juce::File& root, const juce::String& relative);
juce::var readManifest(const juce::File& root);
Product findProduct(const juce::var& manifest, const juce::String& id);

class NativeRuntime {
public:
    using RetireFunction = bool (*)(void*, void*, void (*)(void*));
    NativeRuntime(const Product&, const juce::File&, double rate, int maxBlock,
                  const juce::String& state, void* retireOwner = nullptr, RetireFunction retire = nullptr);
    ~NativeRuntime();
    NativeRuntime(const NativeRuntime&) = delete;
    bool ready() const noexcept { return api != nullptr && error.isEmpty(); }
    const juce::String& getError() const noexcept { return error; }
    void process(int count) noexcept;
    void parameter(int index, double normalized, bool realtime = false) noexcept;
    void prepareParameters(const std::vector<float>&);
    double appliedParameter(int index) const noexcept { return appliedParameters[static_cast<size_t>(index)]; }
    void reset() noexcept;
    juce::String stateJSON();
    juce::String captureRequestJSON(const juce::String&);
    int latency() const noexcept { return latencySamples; }
    int capacity() const noexcept { return blockCapacity; }
    void setGeneration(std::uint64_t value) noexcept { generation = value; }
    std::uint64_t getGeneration() const noexcept { return generation; }
    float* input(int channel) noexcept { return channel == 0 ? inL.data() : inR.data(); }
    float* output(int channel) noexcept { return channel == 0 ? outL.data() : outR.data(); }
    double* midi() noexcept { return events.data(); }
    double* midiOutput() noexcept { return outputEvents.data(); }
    double* parameterValues() noexcept { return parameters.data(); }
    double* clock() noexcept { return clockData.data(); }
    int& midiCount() noexcept { return eventCount; }
    int midiOutputCount() const noexcept { return outputEventCount; }
    void setMidiCount(int value) noexcept { eventCount = juce::jlimit(0, maxEvents, value); }
    void setError(const juce::String& message) { error = message; }
    static void destroy(void* value) { delete static_cast<NativeRuntime*>(value); }
private:
    friend struct NativeRuntimeContractChecks;
    struct Convolver {
        juce::dsp::Convolution dsp;
        juce::AudioBuffer<float> buffer;
        bool active = true;
    };
    JSGlobalContextRef context = nullptr;
    JSContextGroupRef group = nullptr;
    JSClassRef globalClass = nullptr;
    JSObjectRef api = nullptr, io = nullptr;
    JSObjectRef renderFunction = nullptr, parameterFunction = nullptr, resetFunction = nullptr, stateFunction = nullptr;
    juce::File resources;
    Product product;
    double rate;
    int blockCapacity = 0, eventCount = 0, outputEventCount = 0, latencySamples = 0;
    std::uint64_t generation = 0;
    bool inRender = false;
    juce::String error;
    std::vector<float> inL, inR, outL, outR;
    std::vector<double> events, outputEvents, parameters, appliedParameters;
    std::array<double, clockFields> clockData{};
    std::vector<std::unique_ptr<Convolver>> convolvers;
    void* retireOwner = nullptr;
    RetireFunction retireFunction = nullptr;
    void evaluate(const juce::String&, const juce::String&);
    void waitUntilPrepared();
    void updateLatency();
    JSValueRef call(JSObjectRef, size_t, const JSValueRef*, bool captureError = true);
    JSObjectRef function(const char*);
    void set(JSObjectRef, const char*, JSValueRef);
    void exposeTypedArray(JSObjectRef, const char*, void*, size_t, JSTypedArrayType);
    void exposeFunction(const char*, JSObjectCallAsFunctionCallback);
    static NativeRuntime* owner(JSContextRef);
    static JSValueRef resourceCallback(JSContextRef, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef*);
    static JSValueRef logCallback(JSContextRef, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef*);
    static JSValueRef convolverCreate(JSContextRef, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef*);
    static JSValueRef convolverProcess(JSContextRef, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef*);
    static JSValueRef convolverReset(JSContextRef, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef*);
    static JSValueRef convolverDestroy(JSContextRef, JSObjectRef, JSObjectRef, size_t, const JSValueRef[], JSValueRef*);
};
}
