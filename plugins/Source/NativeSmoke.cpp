#include "NativeRuntime.h"
#include <iostream>
#include <cmath>
#include <chrono>
#include <array>
#include <algorithm>

namespace kitchen {
struct NativeRuntimeContractChecks {
    static void run(NativeRuntime& runtime) {
        runtime.evaluate(R"JS((function () {
          function require(condition, message) { if (!condition) throw Error('Native convolution contract: ' + message); }
          const irBaseL = new Float32Array(64).fill(91), irBaseR = new Float32Array(71).fill(93);
          const irL = irBaseL.subarray(5, 37), irR = irBaseR.subarray(9, 41); irL.fill(0); irR.fill(0);
          irL[0] = .5; irL[7] = .125; irR[0] = .25; irR[11] = -.2;
          const id = KitchenNativeCreateConvolver(irL, irR, 48000);
          const inputL = new Float32Array(180).fill(97), inputR = new Float32Array(190).fill(99);
          const left = inputL.subarray(13, 141), right = inputR.subarray(23, 151); left.fill(0); right.fill(0); left[0] = .5; right[0] = .75;
          const resultL = new Float32Array(191).fill(-17), resultR = new Float32Array(199).fill(-19);
          const outL = resultL.subarray(17, 145), outR = resultR.subarray(29, 157);
          KitchenNativeProcessConvolver(id, left, right, outL, outR, 128);
          for (let i = 0; i < 128; i++) {
            const expectedL = i === 0 ? .25 : i === 7 ? .0625 : 0;
            const expectedR = i === 0 ? .1875 : i === 11 ? -.15 : 0;
            require(Math.abs(outL[i] - expectedL) < 2e-5, 'left IR/input/output view at ' + i);
            require(Math.abs(outR[i] - expectedR) < 2e-5, 'right IR/input/output view at ' + i);
          }
          for (let i = 0; i < resultL.length; i++) if (i < 17 || i >= 145) require(resultL[i] === -17, 'left output sentinel ' + i);
          for (let i = 0; i < resultR.length; i++) if (i < 29 || i >= 157) require(resultR[i] === -19, 'right output sentinel ' + i);
          let rejected = false; try { KitchenNativeCreateConvolver(new Float64Array(32), new Float64Array(32), 48000); } catch (_) { rejected = true; }
          require(rejected, 'reject incompatible typed arrays'); KitchenNativeDestroyConvolver(id);
        })())JS", "native-convolver-subarray-contract.js");
        if (!runtime.ready()) throw std::runtime_error(runtime.getError().toStdString());
    }
};
}

namespace {
struct Result { double rms = 0, peak = 0, averageMicros = 0, p95Micros = 0, p99Micros = 0, maxMicros = 0, realtimeRatio = 0; int first = -1; };
Result render(kitchen::NativeRuntime& runtime, bool instrument, double rate, int block = 128) {
    juce::ScopedNoDenormals noDenormals;
    Result result; double energy = 0; constexpr int blocks = 100;
    std::array<double, blocks> timings{};
    for (int quantum = 0; quantum < blocks; ++quantum) {
        auto* clock = runtime.clock(); std::fill(clock, clock + kitchen::clockFields, 0.0);
        clock[kitchen::tempo] = quantum < 50 ? 120 : 137; clock[kitchen::ppq] = quantum * block * clock[kitchen::tempo] / (60.0 * rate);
        clock[kitchen::playing] = 1; clock[kitchen::numerator] = 4; clock[kitchen::denominator] = 4;
        clock[kitchen::sampleRate] = rate; clock[kitchen::frames] = block; clock[kitchen::localFrame] = quantum * block;
        clock[kitchen::hostSample] = quantum * block; clock[kitchen::validPpq] = clock[kitchen::validHostSample] = 1;
        clock[kitchen::revision] = quantum < 50 ? 1 : 2;
        runtime.setMidiCount(0);
        if (instrument && quantum == 0) {
            for (int n = 0; n < 3; ++n) { auto* event = runtime.midi() + n * kitchen::eventFields; std::fill(event, event + kitchen::eventFields, 0.0); event[0] = 17; event[1] = kitchen::noteOn; event[2] = 36 + n * 12; event[3] = .8; event[4] = 1; event[5] = n + 1; }
            runtime.setMidiCount(3);
        }
        if (instrument && quantum == 60) {
            for (int n = 0; n < 3; ++n) { auto* event = runtime.midi() + n * kitchen::eventFields; std::fill(event, event + kitchen::eventFields, 0.0); event[0] = 31; event[1] = kitchen::noteOff; event[2] = 36 + n * 12; event[4] = 1; event[5] = n + 1; }
            runtime.setMidiCount(3);
        }
        for (int frame = 0; frame < block; ++frame) { const auto at = quantum * block + frame; runtime.input(0)[frame] = instrument ? 0 : static_cast<float>(.07 * std::sin(at * 220.0 * 2.0 * juce::MathConstants<double>::pi / rate)); runtime.input(1)[frame] = instrument ? 0 : static_cast<float>(.06 * std::sin(at * 330.0 * 2.0 * juce::MathConstants<double>::pi / rate)); }
        const auto before = std::chrono::steady_clock::now(); runtime.process(block);
        timings[static_cast<size_t>(quantum)] = std::chrono::duration<double, std::micro>(std::chrono::steady_clock::now() - before).count();
        if (!runtime.ready()) throw std::runtime_error(runtime.getError().toStdString());
        for (int frame = 0; frame < block; ++frame) for (int channel = 0; channel < 2; ++channel) {
            const double sample = runtime.output(channel)[frame];
            if (!std::isfinite(sample)) throw std::runtime_error("Non-finite native plugin output");
            result.peak = juce::jmax(result.peak, std::abs(sample)); energy += sample * sample;
            if (std::abs(sample) > 1.0e-7 && result.first < 0) result.first = quantum * block + frame;
        }
    }
    result.rms = std::sqrt(energy / (blocks * block * 2));
    for (const auto value : timings) result.averageMicros += value / blocks;
    std::sort(timings.begin(), timings.end()); result.p95Micros = timings[94]; result.p99Micros = timings[98]; result.maxMicros = timings.back(); result.realtimeRatio = result.averageMicros * rate / (1.0e6 * block); return result;
}
}
int main(int argc, char* argv[]) {
    juce::ScopedJuceInitialiser_GUI juceInitialiser;
    juce::File resources = kitchen::findResourceRoot(); juce::String selected;
    for (int i = 1; i < argc; ++i) { const juce::String arg(argv[i]); if (arg == "--resources" && i + 1 < argc) resources = juce::File(argv[++i]); else if (arg == "--product" && i + 1 < argc) selected = argv[++i]; }
    juce::Array<juce::var> results; bool success = true;
    try {
        const auto manifest = kitchen::readManifest(resources); auto* products = manifest["products"].getArray(); if (products == nullptr || products->isEmpty()) throw std::runtime_error("Empty product manifest");
        for (const auto& descriptor : *products) {
            const auto id = descriptor["id"].toString(); if (selected.isNotEmpty() && selected != id) continue;
            auto* row = new juce::DynamicObject(); row->setProperty("id", id);
            try {
                const auto product = kitchen::findProduct(manifest, id);
                kitchen::NativeRuntime runtime(product, resources, 48000, 512, juce::JSON::toString(product.descriptor["defaultState"], true));
                if (!runtime.ready()) throw std::runtime_error(runtime.getError().toStdString());
                if (results.isEmpty()) { kitchen::NativeRuntimeContractChecks::run(runtime); row->setProperty("subarrayConvolution", true); }
                const auto parameters = product.parameters();
                std::vector<float> values; for (const auto& parameter : parameters) values.push_back(static_cast<float>(parameter["defaultNormalized"])); runtime.prepareParameters(values);
                const auto audio = render(runtime, product.instrument(), 48000);
                row->setProperty("tailSeconds", runtime.tailSeconds());
                if (id == "track-eq" && std::abs(runtime.tailSeconds() - .1) > 1.0e-5) throw std::runtime_error("Native EQ tail differs from its canonical 0.1 second bound");
                if (id == "vestige" && runtime.tailSeconds() <= 0) throw std::runtime_error("Native HOOD reverb did not report its decay tail");
                auto* timing = new juce::DynamicObject(); timing->setProperty("avg", audio.averageMicros); timing->setProperty("p95", audio.p95Micros); timing->setProperty("p99", audio.p99Micros); timing->setProperty("max", audio.maxMicros); row->setProperty("callbackMicros", juce::var(timing)); row->setProperty("realtimeRatio", audio.realtimeRatio);
                if (audio.realtimeRatio > 1.0) throw std::runtime_error("Native plugin average processing time exceeds the audio duration");
                if (audio.rms < 1.0e-8 || audio.first < 0) throw std::runtime_error("Native plugin rendered silence from MIDI/audio input");
                const auto saved = runtime.stateJSON(); juce::var parsedState; const auto parsed = juce::JSON::parse(saved, parsedState); row->setProperty("savedStateBytes", static_cast<juce::int64>(saved.getNumBytesAsUTF8()));
                if (parsed.failed() || !parsedState.isObject()) throw std::runtime_error(("Native state export JSON: " + parsed.getErrorMessage() + "; length=" + juce::String(saved.length()) + "; first=" + saved.substring(0, 120) + "; last=" + saved.substring(juce::jmax(0, saved.length() - 120))).toStdString());
                if (id == "morsel" && saved.contains("\\u0000")) throw std::runtime_error("MORSEL state contains unsupported escaped NUL keys");
                kitchen::NativeRuntime restored(product, resources, 48000, 512, saved);
                if (!restored.ready()) throw std::runtime_error("Native state restoration: " + restored.getError().toStdString());
                restored.prepareParameters(values);
                const auto again = render(restored, product.instrument(), 48000);
                if (again.rms < 1.0e-8) throw std::runtime_error("Restored native plugin rendered silence");
                runtime.reset(); row->setProperty("passed", true); row->setProperty("rms", audio.rms); row->setProperty("peak", audio.peak); row->setProperty("firstSample", audio.first); row->setProperty("latencySamples", runtime.latency()); row->setProperty("stateRoundTrip", true);
            } catch (const std::exception& e) { row->setProperty("passed", false); row->setProperty("error", e.what()); success = false; }
            results.add(juce::var(row)); std::cout << juce::JSON::toString(juce::var(row), true).toStdString() << std::endl;
        }
        if (results.isEmpty()) throw std::runtime_error("No matching native plugin was tested");
    } catch (const std::exception& e) { std::cerr << e.what() << std::endl; return 2; }
    auto* report = new juce::DynamicObject(); report->setProperty("passed", success); report->setProperty("products", results); report->setProperty("architecture", juce::SystemStats::getCpuVendor());
    resources.getChildFile("native-smoke-report.json").replaceWithText(juce::JSON::toString(juce::var(report), false));
    return success ? 0 : 1;
}
