#include "NativeRuntime.h"
#include <dlfcn.h>
#include <cstring>
#include <stdexcept>
#include <limits>

namespace kitchen {
namespace {
struct JSString {
    JSStringRef value;
    explicit JSString(const juce::String& text) : value(JSStringCreateWithUTF8CString(text.toRawUTF8())) {}
    ~JSString() { JSStringRelease(value); }
    operator JSStringRef() const { return value; }
};
juce::String text(JSContextRef ctx, JSValueRef value) {
    if (value == nullptr) return {};
    auto str = JSValueToStringCopy(ctx, value, nullptr);
    if (str == nullptr) return {};
    std::vector<char> bytes(JSStringGetMaximumUTF8CStringSize(str));
    JSStringGetUTF8CString(str, bytes.data(), bytes.size()); JSStringRelease(str);
    return juce::String::fromUTF8(bytes.data());
}
JSValueRef stringValue(JSContextRef ctx, const juce::String& value) { JSString s(value); return JSValueMakeString(ctx, s); }
JSValueRef property(JSContextRef ctx, JSObjectRef object, const char* name) { JSString key(name); return JSObjectGetProperty(ctx, object, key, nullptr); }
void fail(JSContextRef ctx, JSValueRef* exception, const juce::String& message) {
    if (exception != nullptr) { auto value = stringValue(ctx, message); *exception = JSObjectMakeError(ctx, 1, &value, nullptr); }
}
float* floatArrayData(JSContextRef ctx, JSObjectRef array, JSValueRef* exception) {
    if (JSValueGetTypedArrayType(ctx, array, exception) != kJSTypedArrayTypeFloat32Array) { fail(ctx, exception, "Native convolution requires Float32Array channels"); return nullptr; }
    const auto offset = JSObjectGetTypedArrayByteOffset(ctx, array, exception);
    auto* base = static_cast<unsigned char*>(JSObjectGetTypedArrayBytesPtr(ctx, array, exception));
    // JavaScriptCore returns the backing ArrayBuffer base, including for a
    // subarray. Every channel view must account for its own byte offset.
    return base != nullptr ? reinterpret_cast<float*>(base + offset) : nullptr;
}
juce::File safeResource(const juce::File& root, const juce::String& relative) {
    auto decoded = juce::URL::removeEscapeChars(relative).replaceCharacter('\\', '/');
    if (decoded.startsWithChar('/') || decoded.contains("..") || decoded.containsChar(':')) return {};
    const auto result = root.getChildFile(decoded);
    return result.isAChildOf(root) ? result : juce::File{};
}
void resourceAnchor() {}
}

juce::Array<juce::var> Product::parameters() const { if (auto* p = descriptor["parameters"].getArray()) return *p; return {}; }
juce::File findResourceRoot() {
    if (auto path = juce::SystemStats::getEnvironmentVariable("KITCHEN_RESOURCE_ROOT", {}); path.isNotEmpty()) return juce::File(path);
    Dl_info info{};
    if (dladdr(reinterpret_cast<const void*>(&resourceAnchor), &info) != 0 && info.dli_fname != nullptr) {
        auto binary = juce::File(juce::String::fromUTF8(info.dli_fname));
        return binary.getParentDirectory().getParentDirectory().getChildFile("Resources/Kitchen");
    }
    return {};
}
juce::String readTextResource(const juce::File& root, const juce::String& relative) {
    auto file = safeResource(root, relative);
    if (file.existsAsFile()) return file.loadFileAsString();
    file = safeResource(root, relative + ".gz");
    if (!file.existsAsFile()) throw std::runtime_error(("Missing plugin resource: " + relative).toStdString());
    juce::FileInputStream input(file);
    juce::GZIPDecompressorInputStream decompressed(&input, false, juce::GZIPDecompressorInputStream::gzipFormat);
    return decompressed.readEntireStreamAsString();
}
juce::var readManifest(const juce::File& root) { return juce::JSON::parse(readTextResource(root, "products.json")); }
Product findProduct(const juce::var& manifest, const juce::String& id) {
    if (auto* products = manifest["products"].getArray()) for (const auto& descriptor : *products)
        if (descriptor["id"].toString() == id) return { id, descriptor["name"].toString(), descriptor["kind"].toString(), descriptor };
    throw std::runtime_error(("Unknown Kitchen plugin: " + id).toStdString());
}

NativeRuntime::NativeRuntime(const Product& p, const juce::File& root, double sampleRate, int maxBlock,
                             const juce::String& state, void* ownerPtr, RetireFunction retire)
    : resources(root), product(p), rate(sampleRate), blockCapacity(juce::jlimit(128, 65536, maxBlock)),
      inL(static_cast<size_t>(blockCapacity)), inR(inL.size()), outL(inL.size()), outR(inL.size()),
      events(maxEvents * eventFields), outputEvents(maxEvents * eventFields), parameters(maxParameters), appliedParameters(maxParameters, std::numeric_limits<double>::quiet_NaN()),
      retireOwner(ownerPtr), retireFunction(retire) {
    try {
        group = JSContextGroupCreate();
        JSClassDefinition definition = kJSClassDefinitionEmpty; definition.className = "KitchenNativeHost";
        globalClass = JSClassCreate(&definition); context = JSGlobalContextCreateInGroup(group, globalClass);
        auto global = JSContextGetGlobalObject(context); JSObjectSetPrivate(global, this);
        io = JSObjectMake(context, nullptr, nullptr); JSValueProtect(context, io);
        exposeTypedArray(io, "inputLeft", inL.data(), inL.size() * sizeof(float), kJSTypedArrayTypeFloat32Array);
        exposeTypedArray(io, "inputRight", inR.data(), inR.size() * sizeof(float), kJSTypedArrayTypeFloat32Array);
        exposeTypedArray(io, "outputLeft", outL.data(), outL.size() * sizeof(float), kJSTypedArrayTypeFloat32Array);
        exposeTypedArray(io, "outputRight", outR.data(), outR.size() * sizeof(float), kJSTypedArrayTypeFloat32Array);
        exposeTypedArray(io, "events", events.data(), events.size() * sizeof(double), kJSTypedArrayTypeFloat64Array);
        exposeTypedArray(io, "outputEvents", outputEvents.data(), outputEvents.size() * sizeof(double), kJSTypedArrayTypeFloat64Array);
        exposeTypedArray(io, "clock", clockData.data(), clockData.size() * sizeof(double), kJSTypedArrayTypeFloat64Array);
        exposeTypedArray(io, "parameters", parameters.data(), parameters.size() * sizeof(double), kJSTypedArrayTypeFloat64Array);
        set(io, "eventCount", JSValueMakeNumber(context, 0)); set(io, "outputEventCount", JSValueMakeNumber(context, 0));
        set(global, "KitchenHostIO", io);
        JSString json(juce::JSON::toString(product.descriptor, true));
        set(global, "KitchenPluginDescriptor", JSValueMakeFromJSONString(context, json));
        exposeFunction("KitchenNativeReadResource", resourceCallback); exposeFunction("KitchenNativeLog", logCallback);
        exposeFunction("KitchenNativeCreateConvolver", convolverCreate); exposeFunction("KitchenNativeProcessConvolver", convolverProcess);
        exposeFunction("KitchenNativeResetConvolver", convolverReset); exposeFunction("KitchenNativeDestroyConvolver", convolverDestroy);
        evaluate(readTextResource(resources, "runtime.js"), "kitchen://runtime.js");
        if (error.isNotEmpty()) return;
        api = JSValueToObject(context, property(context, global, "KitchenNativePlugin"), nullptr);
        if (api == nullptr) throw std::runtime_error("KitchenNativePlugin runtime is missing");
        JSValueProtect(context, api);
        renderFunction = function("render"); parameterFunction = function("setParameter"); resetFunction = function("reset"); stateFunction = function("getStateJSON");
        if (renderFunction == nullptr || parameterFunction == nullptr) throw std::runtime_error("Plugin runtime has no render/parameter contract");
        auto create = function("create");
        if (create == nullptr) throw std::runtime_error("Plugin runtime has no create contract");
        const JSValueRef args[] = { stringValue(context, p.id), JSValueMakeNumber(context, sampleRate), JSValueMakeNumber(context, blockCapacity), stringValue(context, state) };
        call(create, 4, args);
        if (error.isNotEmpty()) return;
        waitUntilPrepared(); updateLatency();
    } catch (const std::exception& e) { error = e.what(); }
}
void NativeRuntime::waitUntilPrepared() {
        if (auto statusFunction = function("getStatusJSON")) {
            const auto started = juce::Time::getMillisecondCounterHiRes();
            auto tickFunction = function("prepareTick");
            for (;;) {
                const auto statusValue = call(statusFunction, 0, nullptr);
                if (statusValue == nullptr) { if (error.isNotEmpty()) return; throw std::runtime_error("Native preparation status is missing"); }
                juce::String statusJSON;
                if (JSValueIsString(context, statusValue)) statusJSON = text(context, statusValue);
                else if (auto jsonValue = JSValueCreateJSONString(context, statusValue, 0, nullptr)) {
                    std::vector<char> jsonBytes(JSStringGetMaximumUTF8CStringSize(jsonValue));
                    JSStringGetUTF8CString(jsonValue, jsonBytes.data(), jsonBytes.size()); JSStringRelease(jsonValue); statusJSON = juce::String::fromUTF8(jsonBytes.data());
                }
                const auto status = juce::JSON::parse(statusJSON);
                if (status["error"].toString().isNotEmpty()) throw std::runtime_error(status["error"].toString().toStdString());
                if (static_cast<bool>(status["ready"])) break;
                if (error.isNotEmpty()) return;
                if (tickFunction == nullptr || juce::Time::getMillisecondCounterHiRes() - started > 60000) throw std::runtime_error("Native instrument preparation did not become ready");
                const JSValueRef budget = JSValueMakeNumber(context, 5); call(tickFunction, 1, &budget);
                juce::Thread::sleep(1);
            }
        }

}
void NativeRuntime::updateLatency() {
        latencySamples = juce::jmax(0, static_cast<int>(product.descriptor["latencySamples"]));
        if (auto getLatency = function("getLatencySamples")) {
            const auto value = call(getLatency, 0, nullptr);
            if (value != nullptr && JSValueIsNumber(context, value)) latencySamples = juce::jlimit(0, 1048576, static_cast<int>(JSValueToNumber(context, value, nullptr)));
        }
}
void NativeRuntime::prepareParameters(const std::vector<float>& values) {
    if (!ready()) return;
    try {
        for (size_t i = 0; i < values.size() && i < static_cast<size_t>(maxParameters); ++i) parameter(static_cast<int>(i), values[i]);
        waitUntilPrepared(); updateLatency();
    } catch (const std::exception& e) { error = e.what(); }
}

NativeRuntime::~NativeRuntime() {
    if (context != nullptr) {
        if (api != nullptr) JSValueUnprotect(context, api);
        if (io != nullptr) JSValueUnprotect(context, io);
        JSGlobalContextRelease(context);
    }
    if (globalClass != nullptr) JSClassRelease(globalClass);
    if (group != nullptr) JSContextGroupRelease(group);
}
void NativeRuntime::set(JSObjectRef object, const char* name, JSValueRef value) { JSString key(name); JSObjectSetProperty(context, object, key, value, kJSPropertyAttributeNone, nullptr); }
void NativeRuntime::exposeTypedArray(JSObjectRef object, const char* name, void* bytes, size_t size, JSTypedArrayType type) {
    JSValueRef exception = nullptr;
    auto array = JSObjectMakeTypedArrayWithBytesNoCopy(context, type, bytes, size, nullptr, nullptr, &exception);
    if (exception != nullptr || array == nullptr) throw std::runtime_error("JavaScriptCore typed-array setup failed");
    set(object, name, array);
}
void NativeRuntime::exposeFunction(const char* name, JSObjectCallAsFunctionCallback callback) { JSString key(name); set(JSContextGetGlobalObject(context), name, JSObjectMakeFunctionWithCallback(context, key, callback)); }
void NativeRuntime::evaluate(const juce::String& source, const juce::String& url) {
    JSString code(source), name(url); JSValueRef exception = nullptr;
    JSEvaluateScript(context, code, nullptr, name, 1, &exception);
    if (exception != nullptr) error = text(context, exception);
}
JSObjectRef NativeRuntime::function(const char* name) {
    const auto value = property(context, api, name);
    if (value == nullptr || !JSValueIsObject(context, value)) return nullptr;
    const auto result = JSValueToObject(context, value, nullptr);
    return JSObjectIsFunction(context, result) ? result : nullptr;
}
JSValueRef NativeRuntime::call(JSObjectRef fn, size_t count, const JSValueRef* args, bool captureError) {
    if (fn == nullptr || context == nullptr) return nullptr;
    JSValueRef exception = nullptr;
    const auto value = JSObjectCallAsFunction(context, fn, api, count, args, &exception);
    if (exception != nullptr && captureError) error = text(context, exception);
    return exception == nullptr ? value : nullptr;
}
void NativeRuntime::parameter(int index, double value, bool realtime) noexcept {
    if (!ready() || index < 0 || index >= maxParameters || !std::isfinite(value)) return;
    parameters[static_cast<size_t>(index)] = value;
    const JSValueRef args[] = { JSValueMakeNumber(context, index), JSValueMakeNumber(context, value) };
    const bool previousRender = inRender; inRender = inRender || realtime;
    call(parameterFunction, 2, args); inRender = previousRender;
    if (error.isEmpty()) appliedParameters[static_cast<size_t>(index)] = value;
}
void NativeRuntime::process(int count) noexcept {
    std::fill(outL.begin(), outL.begin() + count, 0.0f); std::fill(outR.begin(), outR.begin() + count, 0.0f);
    outputEventCount = 0; if (!ready()) return;
    inRender = true; set(io, "eventCount", JSValueMakeNumber(context, eventCount)); set(io, "outputEventCount", JSValueMakeNumber(context, 0));
    const JSValueRef arg = JSValueMakeNumber(context, count); call(renderFunction, 1, &arg);
    const auto countValue = property(context, io, "outputEventCount");
    if (JSValueIsNumber(context, countValue)) outputEventCount = juce::jlimit(0, maxEvents, static_cast<int>(JSValueToNumber(context, countValue, nullptr)));
    inRender = false;
    bool invalidOutput = false;
    for (int i = 0; i < count; ++i) {
        if (!std::isfinite(outL[static_cast<size_t>(i)])) { outL[static_cast<size_t>(i)] = 0; invalidOutput = true; }
        if (!std::isfinite(outR[static_cast<size_t>(i)])) { outR[static_cast<size_t>(i)] = 0; invalidOutput = true; }
    }
    if (invalidOutput && error.isEmpty()) error = "DSP emitted non-finite audio samples";
}
void NativeRuntime::reset() noexcept {
    if (!ready()) return;
    const bool previousRender = inRender; inRender = true;
    call(resetFunction, 0, nullptr); inRender = previousRender;
}
juce::String NativeRuntime::stateJSON() { return text(context, call(stateFunction, 0, nullptr)); }
juce::String NativeRuntime::captureRequestJSON(const juce::String& request) {
    const auto fn = function("captureRequestJSON");
    if (fn == nullptr) return "{\"ok\":false,\"error\":\"MIDI capture is unavailable.\"}";
    JSString string(request); const JSValueRef arg = JSValueMakeString(context, string);
    // Capture is an explicit UI operation, executed by the sole audio owner;
    // it cannot load resources or construct a replacement audio graph.
    const bool previousRender = inRender; inRender = true;
    const auto result = call(fn, 1, &arg, false); inRender = previousRender;
    return result != nullptr ? text(context, result) : "{\"ok\":false,\"error\":\"MIDI capture request failed.\"}";
}
NativeRuntime* NativeRuntime::owner(JSContextRef ctx) { return static_cast<NativeRuntime*>(JSObjectGetPrivate(JSContextGetGlobalObject(ctx))); }
JSValueRef NativeRuntime::resourceCallback(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef* exception) {
    auto* runtime = owner(ctx);
    if (runtime == nullptr || argc < 1) return JSValueMakeUndefined(ctx);
    if (runtime->inRender) { fail(ctx, exception, "Native resources must be prepared before audio processing"); return JSValueMakeUndefined(ctx); }
    const auto name = text(ctx, argv[0]); auto file = safeResource(runtime->resources, name);
    auto bytes = std::make_unique<juce::MemoryBlock>();
    if (file.existsAsFile()) {
        if (!file.loadFileAsData(*bytes)) { fail(ctx, exception, "Could not load plugin resource"); return JSValueMakeUndefined(ctx); }
    } else {
        file = safeResource(runtime->resources, name + ".gz");
        if (!file.existsAsFile()) { fail(ctx, exception, "Missing plugin resource: " + name); return JSValueMakeUndefined(ctx); }
        juce::FileInputStream input(file); juce::GZIPDecompressorInputStream stream(&input, false, juce::GZIPDecompressorInputStream::gzipFormat); stream.readIntoMemoryBlock(*bytes);
    }
    if (argc > 1 && JSValueToBoolean(ctx, argv[1])) return stringValue(ctx, juce::String::fromUTF8(static_cast<const char*>(bytes->getData()), static_cast<int>(bytes->getSize())));
    auto* owned = bytes.release();
    auto result = JSObjectMakeArrayBufferWithBytesNoCopy(ctx, owned->getData(), owned->getSize(), [](void*, void* data) { delete static_cast<juce::MemoryBlock*>(data); }, owned, exception);
    if (result == nullptr) delete owned;
    return result;
}
JSValueRef NativeRuntime::logCallback(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef*) {
    if (auto* runtime = owner(ctx); runtime != nullptr && !runtime->inRender && argc > 0) juce::Logger::writeToLog("Kitchen: " + text(ctx, argv[0]));
    return JSValueMakeUndefined(ctx);
}
JSValueRef NativeRuntime::convolverCreate(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef* exception) {
    auto* runtime = owner(ctx);
    if (runtime == nullptr || argc < 3 || runtime->inRender) { fail(ctx, exception, "Convolution IRs must be prepared outside audio processing"); return JSValueMakeUndefined(ctx); }
    auto a = JSValueToObject(ctx, argv[0], exception), b = JSValueToObject(ctx, argv[1], exception);
    if (a == nullptr || b == nullptr) return JSValueMakeUndefined(ctx);
    const auto n = JSObjectGetTypedArrayLength(ctx, a, exception), m = JSObjectGetTypedArrayLength(ctx, b, exception);
    if (n == 0 || n != m || n > static_cast<size_t>(runtime->rate * 30)) { fail(ctx, exception, "Invalid convolution impulse response"); return JSValueMakeUndefined(ctx); }
    const auto* left = floatArrayData(ctx, a, exception);
    const auto* right = floatArrayData(ctx, b, exception);
    const double irRate = JSValueToNumber(ctx, argv[2], exception);
    if (left == nullptr || right == nullptr || irRate < 8000 || irRate > 192000) { fail(ctx, exception, "Invalid convolution rate or channels"); return JSValueMakeUndefined(ctx); }
    auto convolver = std::make_unique<Convolver>(); juce::AudioBuffer<float> impulse(2, static_cast<int>(n));
    for (size_t i = 0; i < n; ++i) { impulse.setSample(0, static_cast<int>(i), std::isfinite(left[i]) ? left[i] : 0); impulse.setSample(1, static_cast<int>(i), std::isfinite(right[i]) ? right[i] : 0); }
    convolver->dsp.loadImpulseResponse(std::move(impulse), irRate, juce::dsp::Convolution::Stereo::yes, juce::dsp::Convolution::Trim::no, juce::dsp::Convolution::Normalise::no);
    convolver->dsp.prepare({ runtime->rate, static_cast<juce::uint32>(runtime->blockCapacity), 2 }); convolver->buffer.setSize(2, runtime->blockCapacity);
    size_t slot = 0; while (slot < runtime->convolvers.size() && runtime->convolvers[slot]) ++slot;
    if (slot >= 256) { fail(ctx, exception, "Too many native convolution nodes"); return JSValueMakeUndefined(ctx); }
    if (slot == runtime->convolvers.size()) runtime->convolvers.push_back(std::move(convolver)); else runtime->convolvers[slot] = std::move(convolver);
    return JSValueMakeNumber(ctx, static_cast<double>(slot));
}
JSValueRef NativeRuntime::convolverProcess(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef* exception) {
    auto* runtime = owner(ctx); if (runtime == nullptr || argc < 6) return JSValueMakeUndefined(ctx);
    const int id = static_cast<int>(JSValueToNumber(ctx, argv[0], exception)), count = static_cast<int>(JSValueToNumber(ctx, argv[5], exception));
    if (id < 0 || id >= static_cast<int>(runtime->convolvers.size()) || !runtime->convolvers[static_cast<size_t>(id)] || count < 0 || count > runtime->blockCapacity) { fail(ctx, exception, "Invalid native convolution block"); return JSValueMakeUndefined(ctx); }
    auto& c = *runtime->convolvers[static_cast<size_t>(id)]; if (!c.active) return JSValueMakeUndefined(ctx);
    float* data[4]{};
    for (int i = 0; i < 4; ++i) { auto array = JSValueToObject(ctx, argv[i + 1], exception); if (array == nullptr || JSObjectGetTypedArrayLength(ctx, array, exception) < static_cast<size_t>(count)) { fail(ctx, exception, "Native convolution channel is too short"); return JSValueMakeUndefined(ctx); } data[i] = floatArrayData(ctx, array, exception); if (data[i] == nullptr) return JSValueMakeUndefined(ctx); }
    c.buffer.copyFrom(0, 0, data[0], count); c.buffer.copyFrom(1, 0, data[1], count);
    auto block = juce::dsp::AudioBlock<float>(c.buffer).getSubBlock(0, static_cast<size_t>(count)); c.dsp.process(juce::dsp::ProcessContextReplacing<float>(block));
    std::memcpy(data[2], c.buffer.getReadPointer(0), static_cast<size_t>(count) * sizeof(float)); std::memcpy(data[3], c.buffer.getReadPointer(1), static_cast<size_t>(count) * sizeof(float));
    return JSValueMakeUndefined(ctx);
}
JSValueRef NativeRuntime::convolverReset(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef*) {
    auto* runtime = owner(ctx); const int id = argc ? static_cast<int>(JSValueToNumber(ctx, argv[0], nullptr)) : -1;
    if (runtime && id >= 0 && id < static_cast<int>(runtime->convolvers.size()) && runtime->convolvers[static_cast<size_t>(id)]) runtime->convolvers[static_cast<size_t>(id)]->dsp.reset();
    return JSValueMakeUndefined(ctx);
}
JSValueRef NativeRuntime::convolverDestroy(JSContextRef ctx, JSObjectRef, JSObjectRef, size_t argc, const JSValueRef argv[], JSValueRef*) {
    auto* runtime = owner(ctx); const int id = argc ? static_cast<int>(JSValueToNumber(ctx, argv[0], nullptr)) : -1;
    if (runtime && id >= 0 && id < static_cast<int>(runtime->convolvers.size())) {
        auto& object = runtime->convolvers[static_cast<size_t>(id)];
        if (object) {
            object->active = false;
            if (!runtime->inRender) object.reset();
            else if (runtime->retireFunction && runtime->retireFunction(runtime->retireOwner, object.get(), [](void* value) { delete static_cast<Convolver*>(value); })) object.release();
        }
    }
    return JSValueMakeUndefined(ctx);
}
}
