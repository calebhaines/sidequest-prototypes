// Actual macOS helper/process regressions. This executable must be signed and
// run beside the built KitchenDSPHelper, using the same generated resources.
#include "NativeRuntime.h"
#include <chrono>
#include <cmath>
#include <cstring>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <vector>
#include <csignal>
#include <cerrno>
#include <unistd.h>

namespace {
using Runtime = kitchen::NativeRuntime;
void require(bool condition, const juce::String& message) { if (!condition) throw std::runtime_error(message.toStdString()); }
std::vector<float> defaults(const kitchen::Product& product) {
    std::vector<float> result; for (const auto& p : product.parameters()) result.push_back(static_cast<float>(p["defaultNormalized"])); return result;
}
int parameter(const kitchen::Product& product, const juce::String& path) {
    const auto params = product.parameters(); for (int i = 0; i < params.size(); ++i) if (params[i]["path"].toString() == path) return i;
    throw std::runtime_error(("Missing transport-test control " + product.id + ":" + path).toStdString());
}
float normalized(const kitchen::Product& product, const juce::String& path, const juce::var& actual) {
    const auto p = product.parameters()[parameter(product, path)];
    if (auto* options = p["options"].getArray()) for (int i = 0; i < options->size(); ++i) if ((*options)[i]["value"] == actual) return options->size() > 1 ? static_cast<float>(i) / static_cast<float>(options->size() - 1) : 0;
    if (p["type"].toString() == "boolean") return static_cast<bool>(actual) ? 1.0f : 0.0f;
    const double lo = p["min"], hi = p["max"]; require(hi > lo, "Invalid test control bounds"); return static_cast<float>((static_cast<double>(actual) - lo) / (hi - lo));
}
void set(std::vector<float>& values, const kitchen::Product& product, const juce::String& path, const juce::var& actual) { values[static_cast<size_t>(parameter(product, path))] = normalized(product, path, actual); }
std::unique_ptr<Runtime> create(const kitchen::Product& product, const juce::File& resources, const std::vector<float>& values, bool local, const juce::String& saved = {}) {
    auto runtime = std::make_unique<Runtime>(product, resources, 48000, 512, saved.isEmpty() ? juce::JSON::toString(product.descriptor["defaultState"], true) : saved, nullptr, nullptr, local);
    require(runtime->ready(), "Transport engine creation: " + runtime->getError()); runtime->prepareParameters(values);
    require(runtime->ready(), "Transport engine preparation: " + runtime->getError()); require(runtime->usingHelper() != local, "Wrong local/helper runtime selected");
    if (!local) require(runtime->helperProcessId() > 0, "Helper did not expose its process identity"); return runtime;
}
void clock(Runtime& runtime, std::uint64_t frame, int frames, double bpm, double beat, int revision = 1, bool playing = true, bool looping = false) {
    auto* c = runtime.clock(); std::fill(c, c + kitchen::clockFields, 0.0);
    c[kitchen::tempo] = bpm; c[kitchen::ppq] = beat; c[kitchen::playing] = playing ? 1 : 0;
    c[kitchen::numerator] = 7; c[kitchen::denominator] = 8; c[kitchen::looping] = looping ? 1 : 0; c[kitchen::loopStart] = .5; c[kitchen::loopEnd] = 4;
    c[kitchen::hostSample] = static_cast<double>(frame) - 2048; c[kitchen::localFrame] = static_cast<double>(frame) + 900000;
    c[kitchen::revision] = revision; c[kitchen::sampleRate] = 48000; c[kitchen::frames] = frames; c[kitchen::recording] = 1;
    c[kitchen::validPpq] = c[kitchen::validHostSample] = 1; runtime.setMidiCount(0);
}
void event(Runtime& runtime, int offset, int type, int first, double second, int channel, std::uint32_t id = 0) {
    const int at = runtime.midiCount(); kitchen::writeMidiRow(runtime.midi() + at * kitchen::eventFields, offset, type, first, second, channel, id); runtime.setMidiCount(at + 1);
}
void exact(Runtime& local, Runtime& remote, int frames) {
    for (int channel = 0; channel < 2; ++channel) {
        require(std::memcmp(local.output(channel), remote.output(channel), static_cast<size_t>(frames) * sizeof(float)) == 0, "Helper changed same-block Float32 PCM or inserted a block of latency");
        for (int i = 0; i < frames; ++i) require(std::isfinite(remote.output(channel)[i]), "Helper emitted non-finite audio");
    }
    require(local.midiOutputCount() == remote.midiOutputCount(), "Helper changed output MIDI count");
    require(std::memcmp(local.midiOutput(), remote.midiOutput(), static_cast<size_t>(local.midiOutputCount() * kitchen::eventFields) * sizeof(double)) == 0, "Helper changed output MIDI rows");
    require(local.latency() == remote.latency(), "Helper added host compensation latency");
}
void pairProof(const kitchen::Product& product, const juce::File& resources) {
    auto values = defaults(product); if (product.instrument()) set(values, product, "_nativeSequence", false);
    if (product.id == "track-eq") set(values, product, "params.low", 4.0);
    if (product.id == "tremor") { set(values, product, "params.depth", .89); set(values, product, "params.division", "1/16"); }
    auto local = create(product, resources, values, true), remote = create(product, resources, values, false);
    for (auto* runtime : { local.get(), remote.get() }) { clock(*runtime, 0, 0, 120, 0); runtime->process(0); require(runtime->ready(), "Zero-frame helper callback failed"); }
    const int chunks[] { 129, 301, 127, 511, 17, 128, 63, 512 }; std::uint64_t frame = 0; double beat = -.25, totalNanos = 0, audioNanos = 0, energy = 0;
    for (int turn = 0; turn < 36; ++turn) {
        const int frames = chunks[turn % 8]; const double bpm = turn < 12 ? 120 : 137;
        if (turn == 8) beat = .75; if (turn == 24) beat = 3.999;
        for (auto* runtime : { local.get(), remote.get() }) {
            clock(*runtime, frame, frames, bpm, beat, turn >= 24 ? 3 : turn >= 8 ? 2 : 1, turn < 30, turn >= 24);
            if (product.instrument()) {
                if (turn == 0) { event(*runtime, 17, kitchen::noteOn, 60, .8, 2, 0x80000001u); event(*runtime, 31, kitchen::noteOn, 64, .7, 1, 92); }
                if (turn == 3) event(*runtime, 19, kitchen::pitchBend, 0, .25, 2);
                if (turn == 4) event(*runtime, std::min(23, frames - 1), kitchen::controller, 1, 80.0 / 127, 2);
                if (turn == 18) event(*runtime, 7, kitchen::noteOff, 60, 0, 2, 0x80000001u);
                if (turn == 21) event(*runtime, 11, kitchen::noteOff, 64, 0, 1, 92);
            }
            for (int i = 0; i < frames; ++i) { runtime->input(0)[i] = product.instrument() ? 0 : static_cast<float>(.09 * std::sin((frame + i) * .037)); runtime->input(1)[i] = product.instrument() ? 0 : static_cast<float>(.07 * std::cos((frame + i) * .029)); }
        }
        if (turn == 9) { const int index = product.id == "track-eq" ? parameter(product, "params.high") : product.id == "tremor" ? parameter(product, "params.depth") : parameter(product, "synth.pwmAmount"); local->parameter(index, .37f); remote->parameter(index, .37f); }
        local->process(frames); const auto before = std::chrono::steady_clock::now(); remote->process(frames); totalNanos += std::chrono::duration<double, std::nano>(std::chrono::steady_clock::now() - before).count(); audioNanos += frames * 1.0e9 / 48000;
        require(local->ready() && remote->ready(), "Transport render fault: " + local->getError() + " / " + remote->getError()); exact(*local, *remote, frames);
        for (int i = 0; i < frames; ++i) energy += std::abs(remote->output(0)[i]) + std::abs(remote->output(1)[i]);
        if (turn == 0 && product.instrument()) for (int i = 0; i < 17; ++i) require(std::abs(remote->output(0)[i]) < 1.0e-8f, "Helper started MIDI before its sample offset");
        frame += static_cast<std::uint64_t>(frames); if (turn < 30) beat += frames * bpm / (60 * 48000.0);
    }
    require(energy > .0001, "Transport parity compared silence"); require(totalNanos < audioNanos, "Helper CPU gate including wake/copy/wait exceeds realtime");
    const auto saved = remote->stateJSON(); require(juce::JSON::parse(saved).isObject(), "Helper state snapshot is invalid JSON"); require(juce::JSON::toString(juce::JSON::parse(saved), true) == juce::JSON::toString(juce::JSON::parse(local->stateJSON()), true), "Helper changed canonical saved state");
    // Same NativeRuntime state semantics before any subsequent audio block.
    remote->parameter(0, .73f); local->parameter(0, .73f); const auto pendingSaved = remote->stateJSON(); require(juce::JSON::toString(juce::JSON::parse(pendingSaved), true) == juce::JSON::toString(juce::JSON::parse(local->stateJSON()), true), "Helper snapshot missed a pending parameter change");
    remote->reset(); local->reset(); clock(*local, 0, 128, 91, 0); clock(*remote, 0, 128, 91, 0); local->process(128); remote->process(128); exact(*local, *remote, 128);
    std::vector<float> restoredValues; for (int i = 0; i < product.parameters().size(); ++i) restoredValues.push_back(static_cast<float>(remote->appliedParameter(i)));
    auto restored = create(product, resources, restoredValues, false, pendingSaved); require(juce::JSON::toString(juce::JSON::parse(restored->stateJSON()), true) == juce::JSON::toString(juce::JSON::parse(pendingSaved), true), "Restored helper lost nondefault state/parameter overlays"); clock(*restored, 0, 128, 120, 0); restored->process(128); require(restored->ready(), "Headless/offline state restoration failed");
    std::cout << "PASS helper/local exact PCM, odd blocks, MIDI/controllers, clock/loop/tempo, params, reset, headless state; " << product.id << "; realtimeRatio=" << totalNanos / audioNanos << '\n';
}
void isolation(const kitchen::Product& product, const juce::File& resources) {
    auto aValues = defaults(product), bValues = defaults(product); set(aValues, product, "params.low", 9); set(bValues, product, "params.low", -9);
    auto a = create(product, resources, aValues, false), b = create(product, resources, bValues, false);
    require(a->helperProcessId() != b->helperProcessId(), "Instances share one helper identity"); const auto before = b->stateJSON();
    a->parameter(parameter(product, "params.low"), .1); clock(*a, 0, 128, 120, 0); clock(*b, 0, 128, 120, 0);
    for (int i = 0; i < 128; ++i) { a->input(0)[i] = b->input(0)[i] = .1f; a->input(1)[i] = b->input(1)[i] = -.07f; } a->process(128); b->process(128);
    require(a->stateJSON() != b->stateJSON() && b->stateJSON() == before, "One helper changed another instance's state"); require(std::memcmp(a->output(0), b->output(0), 128 * sizeof(float)) != 0, "Distinct helper states produced indistinguishable test audio");
    const auto pid = a->helperProcessId(); a.reset(); errno = 0; require(::kill(pid, 0) == -1 && errno == ESRCH, "Helper was not reaped during destruction"); require(b->ready(), "Destroying one instance stopped another");
    std::cout << "PASS independent helper instances, state/audio isolation and normal child cleanup\n";
}
juce::var capture(Runtime& runtime, const juce::String& command) {
    const auto text = runtime.captureRequestJSON(command); juce::var result; const auto parsed = juce::JSON::parse(text, result);
    require(parsed.wasOk() && result.isObject(), "Helper truncated/corrupted capture JSON"); require(static_cast<bool>(result["ok"]), "Capture request failed: " + result["error"].toString()); return result;
}
void capturePages(const kitchen::Product& product, const juce::File& resources) {
    auto values = defaults(product); set(values, product, "params.gate", -60); set(values, product, "params.mix", 1); set(values, product, "params.inputRange", "guitar");
    auto remote = create(product, resources, values, false);
    capture(*remote, R"JSON({"action":"start","requestId":"start","token":"helper-capture-proof","tempo":120,"maxBeats":256,"captureMaxNotes":512})JSON");
    constexpr int noteFrames = 9600, noteCount = 160; std::uint64_t frame = 0;
    for (; frame < static_cast<std::uint64_t>(noteFrames * noteCount); frame += 512) {
        const int count = std::min(512, noteFrames * noteCount - static_cast<int>(frame)); clock(*remote, frame, count, 120, frame / 24000.0);
        for (int i = 0; i < count; ++i) { const auto at = frame + static_cast<std::uint64_t>(i); const int pitch = (at / noteFrames) % 2 == 0 ? 57 : 69; const double hz = 440 * std::pow(2.0, (pitch - 69) / 12.0); const auto sample = static_cast<float>(.2 * std::sin(2 * juce::MathConstants<double>::pi * hz * (at % noteFrames) / 48000.0)); remote->input(0)[i] = remote->input(1)[i] = sample; }
        remote->process(count); require(remote->ready(), "Capture audio transport failed: " + remote->getError());
    }
    auto* request = new juce::DynamicObject(); const auto requestId = juce::String::repeatedString("x", 12000); request->setProperty("action", "stop"); request->setProperty("requestId", requestId); request->setProperty("maxNotes", 128);
    auto response = capture(*remote, juce::JSON::toString(juce::var(request), true)); require(response["requestId"].toString() == requestId, "Large capture reply lost its request identity");
    const int total = response["take"]["noteCount"]; require(total >= 128, "Real capture did not exercise a full128-note page"); int received = 0;
    for (;;) {
        const auto take = response["take"]; const auto* notes = take["notes"].getArray(); require(notes != nullptr && notes->size() <= 128, "Capture page exceeded its note bound"); require(static_cast<int>(take["notesOffset"]) == received, "Capture paging lost or duplicated notes");
        if (received == 0) require(notes->size() == 128, "Capture did not deliver the maximum128-note JSON page");
        for (const auto& note : *notes) require(static_cast<int>(note["pitch"]) >= 0 && static_cast<int>(note["pitch"]) <= 127 && static_cast<double>(note["endFrame"]) > static_cast<double>(note["startFrame"]), "Invalid captured note timing");
        received += notes->size(); if (!static_cast<bool>(take["moreNotes"])) break;
        response = capture(*remote, "{\"action\":\"poll\",\"afterNote\":" + juce::String(received) + ",\"maxNotes\":128}");
    }
    require(received == total, "Capture did not retain every completed note across transport pages"); std::cout << "PASS FERMENT actual capture128-note pages, large valid JSON and complete retained take; notes=" << received << '\n';
}
void failure(const kitchen::Product& product, const juce::File& resources, bool stop) {
    int pid = -1;
    {
        auto runtime = create(product, resources, defaults(product), false); pid = runtime->helperProcessId(); require(::kill(pid, stop ? SIGSTOP : SIGKILL) == 0, "Unable to exercise helper failure");
        clock(*runtime, 0, 128, 120, 0); const auto before = std::chrono::steady_clock::now(); runtime->process(128); const auto elapsed = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - before).count();
        require(elapsed < 500, "Helper failure blocked beyond its bounded deadline"); require(!runtime->ready() && runtime->getError().isNotEmpty(), "Helper failure was hidden as successful silence"); const auto error = runtime->getError(); runtime->reset(); runtime->process(128); require(!runtime->ready() && runtime->getError() == error, "Helper failure silently recovered with stale state");
        for (int i = 0; i < 128; ++i) require(runtime->output(0)[i] == 0 && runtime->output(1)[i] == 0, "Helper reused stale audio after a failed exchange");
        std::cout << "PASS visible persistent helper " << (stop ? "timeout" : "crash") << " fault with bounded wait=" << elapsed << "ms\n";
    }
    errno = 0; require(::kill(pid, 0) == -1 && errno == ESRCH, "Faulted/stopped helper was not reaped");
}
}
int main(int argc, char** argv) {
    juce::ScopedJuceInitialiser_GUI initialiser; juce::ScopedNoDenormals noDenormals; juce::File resources = kitchen::findResourceRoot();
    for (int i = 1; i + 1 < argc; ++i) if (juce::String(argv[i]) == "--resources") resources = juce::File(argv[++i]);
    try {
        const auto manifest = kitchen::readManifest(resources); const auto eq = kitchen::findProduct(manifest, "track-eq");
        pairProof(eq, resources); pairProof(kitchen::findProduct(manifest, "tremor"), resources); pairProof(kitchen::findProduct(manifest, "brine"), resources);
        isolation(eq, resources); capturePages(kitchen::findProduct(manifest, "ferment"), resources); failure(eq, resources, true); failure(eq, resources, false);
        std::cout << "PASS all actual helper transport contracts (CPU measurements include copying, wake and synchronous wait)\n";
    } catch (const std::exception& exception) { std::cerr << "FAIL helper transport: " << exception.what() << '\n'; return 1; }
    return 0;
}
