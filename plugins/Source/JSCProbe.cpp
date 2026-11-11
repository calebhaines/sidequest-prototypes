#include <JavaScriptCore/JavaScriptCore.h>
#include <cstdio>
#include <string>
#include <vector>
int main() {
    auto ctx = JSGlobalContextCreate(nullptr);
    auto setup = JSStringCreateWithUTF8CString("globalThis.__kitchenPromise=0;Promise.resolve(17).then(x=>globalThis.__kitchenPromise=x)");
    JSValueRef exception = nullptr; JSEvaluateScript(ctx, setup, nullptr, nullptr, 1, &exception); JSStringRelease(setup);
    const char* source = "JSON.stringify({typedArray:(new Float32Array([1.25]))[0]===1.25,wasm:typeof WebAssembly==='object',promise:typeof Promise==='function',promiseResolved:globalThis.__kitchenPromise===17,architecture:'native'})";
    auto script = JSStringCreateWithUTF8CString(source);
    auto result = JSEvaluateScript(ctx, script, nullptr, nullptr, 1, &exception); JSStringRelease(script);
    if (exception || !result) { std::fputs("JavaScriptCore capability probe failed\n", stderr); JSGlobalContextRelease(ctx); return 1; }
    auto string = JSValueToStringCopy(ctx, result, nullptr); std::vector<char> bytes(JSStringGetMaximumUTF8CStringSize(string)); JSStringGetUTF8CString(string, bytes.data(), bytes.size()); std::puts(bytes.data());
    const std::string report(bytes.data()); const bool ok = report.find("\"typedArray\":true") != std::string::npos && report.find("\"wasm\":true") != std::string::npos && report.find("\"promiseResolved\":true") != std::string::npos;
    JSStringRelease(string); JSGlobalContextRelease(ctx); return ok ? 0 : 2;
}
