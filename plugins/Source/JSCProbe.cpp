#include <JavaScriptCore/JavaScriptCore.h>
#include <cstdio>
#include <string>
#include <vector>
#include <chrono>
#include <cerrno>
#include <cstdint>
#include <sys/mman.h>
#include <sys/wait.h>
#include <unistd.h>

extern "C" int csops(pid_t, unsigned int, void*, size_t);
namespace {
struct MemoryProbe { int allowed = 0, error = 0; std::uint32_t flags = 0; };
MemoryProbe probeMemoryInChild() {
    MemoryProbe result; int descriptors[2];
    if (pipe(descriptors) != 0) { result.error = errno; return result; }
    const auto child = fork();
    if (child == 0) {
        close(descriptors[0]); csops(getpid(), 0, &result.flags, sizeof(result.flags));
        auto* memory = mmap(nullptr, 16384, PROT_READ | PROT_WRITE | PROT_EXEC, MAP_ANON | MAP_PRIVATE | MAP_JIT, -1, 0);
        result.allowed = memory != MAP_FAILED; result.error = result.allowed ? 0 : errno;
        if (result.allowed) munmap(memory, 16384);
        static_cast<void>(write(descriptors[1], &result, sizeof(result))); close(descriptors[1]); _exit(0);
    }
    close(descriptors[1]);
    if (child > 0) { static_cast<void>(read(descriptors[0], &result, sizeof(result))); int status = 0; waitpid(child, &status, 0); }
    else result.error = errno;
    close(descriptors[0]); return result;
}
JSValueRef evaluate(JSContextRef context, const char* code, JSValueRef* exception) {
    const auto script = JSStringCreateWithUTF8CString(code); const auto result = JSEvaluateScript(context, script, nullptr, nullptr, 1, exception); JSStringRelease(script); return result;
}
double benchmark(JSGlobalContextRef context, JSObjectRef function, int blocks, JSValueRef* exception) {
    const auto before = std::chrono::steady_clock::now();
    for (int i = 0; i < blocks; ++i) JSObjectCallAsFunction(context, function, nullptr, 0, nullptr, exception);
    return std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - before).count() / blocks;
}
}
int main() {
    // MAP_JIT may be restricted to one region per process. Keep its probe in
    // a child so it cannot change the measured JSC VM allocator eligibility.
    const auto memory = probeMemoryInChild();
    auto context = JSGlobalContextCreate(nullptr); JSValueRef exception = nullptr;
    const char* setup = "globalThis.__kitchenPromise=0;Promise.resolve(17).then(x=>globalThis.__kitchenPromise=x);globalThis.__probePhase=0;globalThis.__probeState=0;globalThis.__probeBuffer=new Float32Array(128);globalThis.__probeRender=function(){let z=__probeState,p=__probePhase;for(let i=0;i<128;i++){const x=Math.sin(p);p+=.021;z+=.09*(Math.tanh(x*3.1+.1*z)-z);__probeBuffer[i]=z;}__probeState=z;__probePhase=p;return z;}";
    evaluate(context, setup, &exception);
    const auto key = JSStringCreateWithUTF8CString("__probeRender");
    const auto function = JSValueToObject(context, JSObjectGetProperty(context, JSContextGetGlobalObject(context), key, &exception), &exception); JSStringRelease(key);
    const auto coldMicros = benchmark(context, function, 128, &exception);
    benchmark(context, function, 2048, &exception);
    const auto warmMicros = benchmark(context, function, 512, &exception);
    const auto result = evaluate(context, "JSON.stringify({typedArray:(new Float32Array([1.25]))[0]===1.25,wasm:typeof WebAssembly==='object',promise:typeof Promise==='function',promiseResolved:globalThis.__kitchenPromise===17})", &exception);
    if (exception || !result) { std::fputs("JavaScriptCore capability probe failed\n", stderr); JSGlobalContextRelease(context); return 1; }
    auto string = JSValueToStringCopy(context, result, nullptr); std::vector<char> bytes(JSStringGetMaximumUTF8CStringSize(string)); JSStringGetUTF8CString(string, bytes.data(), bytes.size()); JSStringRelease(string);
    std::string report(bytes.data()); if (!report.empty()) report.pop_back();
    auto definition = kJSClassDefinitionEmpty; definition.className = "KitchenProbeCallbackGlobal";
    const auto customClass = JSClassCreate(&definition); const auto custom = JSGlobalContextCreate(customClass);
    evaluate(custom, setup, &exception); const auto customKey = JSStringCreateWithUTF8CString("__probeRender");
    const auto customFunction = JSValueToObject(custom, JSObjectGetProperty(custom, JSContextGetGlobalObject(custom), customKey, &exception), &exception); JSStringRelease(customKey);
    const auto customCold = benchmark(custom, customFunction, 128, &exception); benchmark(custom, customFunction, 2048, &exception); const auto customWarm = benchmark(custom, customFunction, 512, &exception);
    JSGlobalContextRelease(custom); JSClassRelease(customClass);
    #if defined(__aarch64__) || defined(__arm64__)
    const char* architecture = "arm64";
    #else
    const char* architecture = "x86_64";
    #endif
    std::printf("%s,\"architecture\":\"%s\",\"mapJitAllowed\":%s,\"mapJitErrno\":%d,\"codeSigningFlags\":\"0x%x\",\"cold128FrameMicros\":%.3f,\"warm128FrameMicros\":%.3f,\"customGlobalColdMicros\":%.3f,\"customGlobalWarmMicros\":%.3f}\n", report.c_str(), architecture, memory.allowed ? "true" : "false", memory.error, memory.flags, coldMicros, warmMicros, customCold, customWarm);
    const bool ok = report.find("\"typedArray\":true") != std::string::npos && report.find("\"wasm\":true") != std::string::npos && report.find("\"promiseResolved\":true") != std::string::npos;
    JSGlobalContextRelease(context); return ok ? 0 : 2;
}
