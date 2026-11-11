#include "NativeRuntime.h"
#include <iostream>
#include <cmath>

namespace {
struct Result { double rms = 0, peak = 0; int first = -1; };
Result render(kitchen::NativeRuntime& runtime, bool instrument, double rate, int block = 128) {
    Result result; double energy = 0; constexpr int blocks = 100;
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
        runtime.process(block);
        if (!runtime.ready()) throw std::runtime_error(runtime.getError().toStdString());
        for (int frame = 0; frame < block; ++frame) for (int channel = 0; channel < 2; ++channel) {
            const double sample = runtime.output(channel)[frame];
            if (!std::isfinite(sample)) throw std::runtime_error("Non-finite native plugin output");
            result.peak = juce::jmax(result.peak, std::abs(sample)); energy += sample * sample;
            if (std::abs(sample) > 1.0e-7 && result.first < 0) result.first = quantum * block + frame;
        }
    }
    result.rms = std::sqrt(energy / (blocks * block * 2)); return result;
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
                const auto parameters = product.parameters();
                std::vector<float> values; for (const auto& parameter : parameters) values.push_back(static_cast<float>(parameter["defaultNormalized"])); runtime.prepareParameters(values);
                const auto audio = render(runtime, product.instrument(), 48000);
                if (audio.rms < 1.0e-8 || audio.first < 0) throw std::runtime_error("Native plugin rendered silence from MIDI/audio input");
                const auto saved = runtime.stateJSON(); if (!juce::JSON::parse(saved).isObject()) throw std::runtime_error("Native state export is not valid JSON");
                kitchen::NativeRuntime restored(product, resources, 48000, 512, saved);
                if (!restored.ready()) throw std::runtime_error("Native state restoration: " + restored.getError().toStdString());
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
