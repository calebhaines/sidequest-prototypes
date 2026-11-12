// Sustained, editor-closed playback through the actual compiled VST3 bundles.
// The default run keeps BATTER and CLATTER alive together for five minutes.
#include <juce_audio_utils/juce_audio_utils.h>
#include <libproc.h>
#include <sys/resource.h>
#include <unistd.h>
#include <signal.h>
#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cerrno>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <thread>
#include <vector>

namespace {
using SteadyClock = std::chrono::steady_clock;
constexpr int sampleRate = 48000, blockSize = 128;
constexpr double silenceRms = 1.0e-8, silencePeak = 1.0e-7;
constexpr std::int64_t noteGate = 1920, midiPeriod = 6000, boundaryProbeFrame = 3456;
juce::var object() { return juce::var(new juce::DynamicObject()); }
void put(juce::var& value, const juce::Identifier& key, const juce::var& item) { value.getDynamicObject()->setProperty(key, item); }
juce::var integer(std::uint64_t value) { return juce::var(static_cast<juce::int64>(value)); }

struct Options {
    juce::File bundles, plugin, report;
    juce::String product;
    double seconds = 300;
    bool paced = true;
};
Options options(int argc, char** argv) {
    Options result;
    for (int i = 1; i < argc; ++i) {
        const juce::String argument(argv[i]);
        if (argument == "--unpaced") result.paced = false;
        else if (argument == "--paced") result.paced = true;
        else if (i + 1 < argc && argument == "--bundles") result.bundles = juce::File(argv[++i]);
        else if (i + 1 < argc && argument == "--plugin") result.plugin = juce::File(argv[++i]);
        else if (i + 1 < argc && argument == "--report") result.report = juce::File(argv[++i]);
        else if (i + 1 < argc && argument == "--product") result.product = juce::String(argv[++i]).trim().toLowerCase();
        else if (i + 1 < argc && argument == "--seconds") result.seconds = juce::String(argv[++i]).getDoubleValue();
        else throw std::runtime_error(("Unknown or incomplete sustained-test argument: " + argument).toStdString());
    }
    if (result.product == "clatter") result.product = "tine";
    if (result.product.isNotEmpty() && result.product != "batter" && result.product != "tine") throw std::runtime_error("--product must be batter or tine (CLATTER)");
    if (!std::isfinite(result.seconds) || result.seconds < 1 || result.seconds > 3600) throw std::runtime_error("--seconds must be between 1 and 3600");
    if (!result.bundles.isDirectory() && !result.plugin.isDirectory()) throw std::runtime_error("Pass --bundles with the build directory, or --plugin with one compiled VST3 bundle");
    return result;
}

class PlayHead final : public juce::AudioPlayHead {
public:
    PositionInfo position;
    juce::Optional<PositionInfo> getPosition() const override { return position; }
};
struct Timing {
    std::vector<double> values;
    double sum = 0, maximum = 0;
    std::uint64_t deadlineMisses = 0;
    void reserve(size_t size) { values.reserve(size); }
    void add(double micros, int frames) {
        values.push_back(micros); sum += micros; maximum = std::max(maximum, micros);
        if (micros > frames * 1.0e6 / sampleRate) ++deadlineMisses;
    }
    double mean() const { return values.empty() ? 0 : sum / static_cast<double>(values.size()); }
    void clear() { values.clear(); sum = maximum = 0; deadlineMisses = 0; }
    juce::var json() const {
        auto result = object(); auto sorted = values; std::sort(sorted.begin(), sorted.end());
        const auto percentile = [&sorted](double fraction) { return sorted.empty() ? 0 : sorted[static_cast<size_t>(std::ceil(fraction * static_cast<double>(sorted.size()))) - 1]; };
        put(result, "callbacks", integer(values.size())); put(result, "avg", mean());
        put(result, "p95", percentile(.95)); put(result, "p99", percentile(.99)); put(result, "max", maximum);
        put(result, "deadlineMisses", integer(deadlineMisses)); return result;
    }
};
struct HelperSample {
    int pid = -1;
    bool alive = false, memoryAvailable = false;
    std::uint64_t resident = 0, footprint = 0, userNanos = 0, systemNanos = 0, pageins = 0;
    juce::var json() const {
        auto result = object(); put(result, "pid", pid); put(result, "alive", alive); put(result, "memoryAvailable", memoryAvailable);
        if (memoryAvailable) {
            put(result, "residentBytes", integer(resident)); put(result, "footprintBytes", integer(footprint));
            put(result, "userNanos", integer(userNanos)); put(result, "systemNanos", integer(systemNanos)); put(result, "pageins", integer(pageins));
        }
        return result;
    }
};
std::vector<int> childPids() {
    std::array<pid_t, 256> children{};
    // Unlike proc_listpids(), proc_listchildpids() returns a PID count.
    const int count = proc_listchildpids(::getpid(), children.data(), static_cast<int>(sizeof(children)));
    std::vector<int> result;
    if (count > 0) for (int i = 0; i < std::min(count, static_cast<int>(children.size())); ++i) if (children[static_cast<size_t>(i)] > 0) result.push_back(children[static_cast<size_t>(i)]);
    return result;
}
HelperSample helperSample(int pid) {
    HelperSample result; result.pid = pid; errno = 0;
    result.alive = ::kill(pid, 0) == 0 || errno == EPERM;
    rusage_info_v2 usage{};
    if (result.alive && proc_pid_rusage(pid, RUSAGE_INFO_V2, reinterpret_cast<rusage_info_t*>(&usage)) == 0) {
        result.memoryAvailable = true; result.resident = usage.ri_resident_size; result.footprint = usage.ri_phys_footprint;
        result.userNanos = usage.ri_user_time; result.systemNanos = usage.ri_system_time; result.pageins = usage.ri_pageins;
    }
    return result;
}
struct Window {
    std::int64_t firstFrame = 0, endFrame = 0;
    double rms = 0, peak = 0, callbackMean = 0, rolling10 = 0, rolling30 = 0;
    std::uint64_t samples = 0, callbacks = 0, nonFinite = 0, deadlineMisses = 0;
    juce::var timing;
    std::vector<HelperSample> helpers;
    juce::var json() const {
        auto result = object(); put(result, "startSeconds", firstFrame / static_cast<double>(sampleRate)); put(result, "endSeconds", endFrame / static_cast<double>(sampleRate));
        put(result, "rms", rms); put(result, "peak", peak); put(result, "nonFiniteSamples", integer(nonFinite));
        put(result, "callbackMicros", timing); put(result, "rolling10MeanMicros", rolling10); put(result, "rolling30MeanMicros", rolling30);
        juce::Array<juce::var> children; for (const auto& helper : helpers) children.add(helper.json()); put(result, "helpers", children); return result;
    }
};

struct Instance {
    juce::String id, name, failure;
    juce::File bundle;
    PlayHead playHead;
    std::unique_ptr<juce::AudioPluginInstance> plugin;
    juce::AudioBuffer<float> audio { 2, blockSize };
    juce::MidiBuffer midi;
    Timing allTiming, windowTiming;
    std::vector<Window> windows;
    std::vector<int> helpers;
    std::int64_t firstFault = -1, firstAudible = -1, lastAudible = -1, windowFirst = 0, renderedFrames = 0;
    std::uint64_t windowSamples = 0, windowNonFinite = 0, noteOns = 0, noteOffs = 0, maxResident = 0, maxFootprint = 0;
    std::uint64_t tempoChanges = 0, loopWraps = 0, boundaryProbeMidiCount = 0;
    std::int64_t previousLoop = 0;
    double windowEnergy = 0, windowPeak = 0, baseline10 = 0, baseline30 = 0;
    int laneCount = 0, growthWindows = 0, overloadWindows = 0, followParameter = -1;
    bool prepared = false;
    ~Instance() { if (plugin && prepared) { plugin->releaseResources(); plugin->setPlayHead(nullptr); } }
    void fault(const juce::String& message, std::int64_t frame) {
        if (failure.isEmpty()) { failure = message; firstFault = frame; }
    }
    void prepare(juce::AudioPluginFormatManager& manager, const Options& opts) {
        const auto childrenBefore = childPids();
        juce::OwnedArray<juce::PluginDescription> descriptions; manager.getFormat(0)->findAllTypesForFile(descriptions, bundle.getFullPathName());
        if (descriptions.size() != 1 || !descriptions[0]->isInstrument) throw std::runtime_error("Selected compiled VST3 did not expose exactly one instrument");
        name = descriptions[0]->name; juce::String error;
        plugin = manager.createPluginInstance(*descriptions[0], sampleRate, blockSize, error);
        if (!plugin) throw std::runtime_error(("Could not load " + id + ": " + error).toStdString());
        plugin->setPlayHead(&playHead); plugin->setPlayConfigDetails(0, 2, sampleRate, blockSize);
        plugin->setNonRealtime(false); plugin->prepareToPlay(sampleRate, blockSize); prepared = true;
        if (plugin->getTotalNumOutputChannels() != 2) throw std::runtime_error("Sustained test requires stereo instrument output");
        for (int i = 0; i < plugin->getParameters().size(); ++i) {
            auto* parameter = plugin->getParameters()[i];
            if (parameter->getName(128).containsIgnoreCase("follow")) { followParameter = i; parameter->setValueNotifyingHost(1); break; }
        }
        if (followParameter < 0) throw std::runtime_error(("Missing Follow DAW pattern parameter for " + id).toStdString());
        for (const int pid : childPids()) if (std::find(childrenBefore.begin(), childrenBefore.end(), pid) == childrenBefore.end()) {
            std::array<char, PROC_PIDPATHINFO_MAXSIZE> path{};
            const int length = proc_pidpath(pid, path.data(), static_cast<std::uint32_t>(path.size()));
            // With no editor or WebKit launched, a newly created child is the DSP
            // helper. Keep it observable even when macOS denies its path query.
            if (length <= 0 || juce::String::fromUTF8(path.data()).containsIgnoreCase("KitchenDSPHelper")) helpers.push_back(pid);
        }
        laneCount = id == "batter" ? 12 : 8; midi.ensureSize(16384);
        allTiming.reserve(static_cast<size_t>(std::ceil(opts.seconds * sampleRate / blockSize)));
        windowTiming.reserve(sampleRate / blockSize + 2); windows.reserve(static_cast<size_t>(std::ceil(opts.seconds)));
    }
    void events(std::int64_t frame, int frames, bool off) {
        const std::int64_t start = 17 + (off ? noteGate : 0);
        std::int64_t index = frame <= start ? 0 : (frame - start + midiPeriod - 1) / midiPeriod;
        for (auto at = start + index * midiPeriod; at < frame + frames; at += midiPeriod, ++index) {
            // Eight hits/second total: a kick every quarter second, alternating
            // with a lane rotation. Separate channels keep overlapping MIDI
            // identities independent when the rotation also reaches the kick.
            const bool kick = index % 2 == 0;
            const int pitch = kick ? 36 : 36 + static_cast<int>((index / 2) % laneCount), channel = kick ? 2 : 1;
            const auto message = off ? juce::MidiMessage::noteOff(channel, pitch) : juce::MidiMessage::noteOn(channel, pitch, kick ? .85f : .68f);
            midi.addEvent(message, static_cast<int>(at - frame)); if (off) ++noteOffs; else ++noteOns;
        }
        const auto probeAt = boundaryProbeFrame + (off ? 64 : 0);
        if (probeAt >= frame && probeAt < frame + frames) {
            midi.addEvent(off ? juce::MidiMessage::noteOff(3, 38) : juce::MidiMessage::noteOn(3, 38, .5f), static_cast<int>(probeAt - frame));
            ++boundaryProbeMidiCount; if (off) ++noteOffs; else ++noteOns;
        }
    }
    void process(std::int64_t frame, int frames) {
        const auto tempoChangeFrame = static_cast<std::int64_t>(60) * sampleRate, loopBeginFrame = static_cast<std::int64_t>(90) * sampleRate;
        const double bpm = frame < tempoChangeFrame ? 120 : 137;
        const auto oldFrame = std::max<std::int64_t>(0, frame - blockSize);
        if (frame >= tempoChangeFrame && oldFrame < tempoChangeFrame) ++tempoChanges;
        // Integrate the tempo transition rather than changing the PPQ origin.
        const double absoluteBeat = std::min(frame, tempoChangeFrame) * 2.0 / sampleRate
            + std::max<std::int64_t>(0, frame - tempoChangeFrame) * 137.0 / (60.0 * sampleRate);
        const bool looping = frame >= loopBeginFrame;
        const double loopOrigin = 120.0 + 30.0 * 137.0 / 60.0;
        const auto loopIndex = looping ? static_cast<std::int64_t>(std::floor((absoluteBeat - loopOrigin) / 16.0)) : 0;
        if (loopIndex > previousLoop) loopWraps += static_cast<std::uint64_t>(loopIndex - previousLoop);
        previousLoop = loopIndex;
        const double beat = looping ? loopOrigin + std::fmod(std::max(0.0, absoluteBeat - loopOrigin), 16.0) : absoluteBeat;
        playHead.position.setBpm(bpm); playHead.position.setPpqPosition(beat);
        playHead.position.setLoopPoints(juce::AudioPlayHead::LoopPoints { loopOrigin, loopOrigin + 16.0 });
        playHead.position.setTimeInSamples(frame); playHead.position.setTimeInSeconds(frame / static_cast<double>(sampleRate));
        playHead.position.setTimeSignature(juce::AudioPlayHead::TimeSignature { 4, 4 }); playHead.position.setIsPlaying(true); playHead.position.setIsLooping(looping);
        audio.setSize(2, frames, false, false, true); audio.clear(); midi.clear();
        events(frame, frames, false); events(frame, frames, true);
        const auto before = SteadyClock::now(); plugin->processBlock(audio, midi);
        const double micros = std::chrono::duration<double, std::micro>(SteadyClock::now() - before).count();
        allTiming.add(micros, frames); windowTiming.add(micros, frames);
        for (int i = 0; i < frames; ++i) for (int channel = 0; channel < 2; ++channel) {
            const double sample = audio.getSample(channel, i); ++windowSamples;
            if (!std::isfinite(sample)) { ++windowNonFinite; fault("Compiled VST3 emitted non-finite audio", frame + i); continue; }
            windowEnergy += sample * sample; windowPeak = std::max(windowPeak, std::abs(sample));
            if (std::abs(sample) > silencePeak) { if (firstAudible < 0) firstAudible = frame + i; lastAudible = std::max(lastAudible, frame + i); }
        }
        renderedFrames = frame + frames;
    }
    double rollingMean(int seconds) const {
        double sum = 0; std::uint64_t count = 0; const auto first = windows.size() > static_cast<size_t>(seconds) ? windows.size() - static_cast<size_t>(seconds) : 0;
        for (size_t i = first; i < windows.size(); ++i) { sum += windows[i].callbackMean * static_cast<double>(windows[i].callbacks); count += windows[i].callbacks; }
        return count == 0 ? 0 : sum / static_cast<double>(count);
    }
    void finishWindow(std::int64_t end) {
        if (windowSamples == 0) return;
        Window window; window.firstFrame = windowFirst; window.endFrame = end; window.samples = windowSamples; window.nonFinite = windowNonFinite;
        window.rms = std::sqrt(windowEnergy / static_cast<double>(windowSamples)); window.peak = windowPeak;
        window.callbacks = windowTiming.values.size(); window.callbackMean = windowTiming.mean(); window.deadlineMisses = windowTiming.deadlineMisses; window.timing = windowTiming.json();
        for (const int pid : helpers) {
            const auto sample = helperSample(pid); window.helpers.push_back(sample); maxResident = std::max(maxResident, sample.resident); maxFootprint = std::max(maxFootprint, sample.footprint);
            if (!sample.alive) fault("The compiled plugin's DSP helper exited", window.firstFrame);
        }
        windows.push_back(std::move(window)); auto& current = windows.back(); current.rolling10 = rollingMean(10); current.rolling30 = rollingMean(30);
        const double seconds = end / static_cast<double>(sampleRate), budget = blockSize * 1.0e6 / sampleRate;
        if (seconds > 2 && end - current.firstFrame >= sampleRate && (current.rms < silenceRms || current.peak < silencePeak)) fault("A full second of repeated MIDI and pattern playback rendered silence", current.firstFrame);
        if (windows.size() == 10) baseline10 = current.rolling10;
        if (windows.size() == 30) baseline30 = current.rolling30;
        const bool growing = (windows.size() >= 20 && baseline10 > 0 && current.rolling10 > std::max(baseline10 * 3, budget * .25))
            || (windows.size() >= 60 && baseline30 > 0 && current.rolling30 > std::max(baseline30 * 3, budget * .25));
        growthWindows = growing ? growthWindows + 1 : 0;
        if (growthWindows >= 3) fault("Rolling callback CPU increased more than threefold from its initial baseline", current.firstFrame);
        overloadWindows = current.callbackMean > budget ? overloadWindows + 1 : 0;
        if (overloadWindows >= 3) fault("Callback CPU exceeded the audio duration for three successive windows", current.firstFrame);
        windowFirst = end; windowSamples = windowNonFinite = 0; windowEnergy = windowPeak = 0; windowTiming.clear();
    }
    juce::var json(bool includeWindows) const {
        auto result = object(); put(result, "id", id); put(result, "name", name); put(result, "bundle", bundle.getFullPathName());
        put(result, "passed", failure.isEmpty()); put(result, "error", failure); put(result, "editorClosed", true); put(result, "followDawPattern", followParameter >= 0);
        put(result, "tempoChanges", integer(tempoChanges)); put(result, "loopWraps", integer(loopWraps)); put(result, "boundaryProbeMidiCount", integer(boundaryProbeMidiCount));
        put(result, "boundaryProbeFrame", juce::var(static_cast<juce::int64>(boundaryProbeFrame))); put(result, "midiHitsPerSecond", 8);
        put(result, "validMidiLanes", laneCount); put(result, "midiNoteOns", integer(noteOns)); put(result, "midiNoteOffs", integer(noteOffs));
        put(result, "renderedSeconds", renderedFrames / static_cast<double>(sampleRate)); put(result, "firstFaultFrame", juce::var(static_cast<juce::int64>(firstFault)));
        put(result, "firstAudibleFrame", juce::var(static_cast<juce::int64>(firstAudible))); put(result, "lastAudibleFrame", juce::var(static_cast<juce::int64>(lastAudible)));
        put(result, "callbackMicros", allTiming.json()); put(result, "baseline10MeanMicros", baseline10); put(result, "baseline30MeanMicros", baseline30);
        put(result, "helperMonitoringAvailable", !helpers.empty()); put(result, "maxHelperResidentBytes", integer(maxResident)); put(result, "maxHelperFootprintBytes", integer(maxFootprint));
        juce::Array<juce::var> children; for (const int pid : helpers) children.add(helperSample(pid).json()); put(result, "helpersAtReport", children);
        if (!windows.empty()) put(result, "latestWindow", windows.back().json());
        if (includeWindows) { juce::Array<juce::var> rows; for (const auto& window : windows) rows.add(window.json()); put(result, "windows", rows); }
        return result;
    }
};
juce::String productFor(const juce::File& bundle) {
    const auto name = bundle.getFileNameWithoutExtension();
    if (name.containsIgnoreCase("BATTER")) return "batter";
    if (name.containsIgnoreCase("CLATTER")) return "tine";
    return {};
}
struct Run {
    Options opts;
    std::vector<std::unique_ptr<Instance>> instances;
    juce::String failure;
    SteadyClock::time_point started;
    std::int64_t frame = 0;
    std::uint64_t lateWakeups = 0, pairDeadlineMisses = 0;
    double maxWakeLatenessMicros = 0, maxPairMicros = 0, pairMicros = 0;
    bool complete = false;
    juce::var report(bool includeWindows) const {
        auto result = object(); put(result, "test", "compiled-vst3-sustained-audio"); put(result, "complete", complete); put(result, "passed", complete && failure.isEmpty()); put(result, "error", failure);
        put(result, "requestedSeconds", opts.seconds); put(result, "renderedSeconds", frame / static_cast<double>(sampleRate)); put(result, "paced", opts.paced);
        put(result, "wallSeconds", std::chrono::duration<double>(SteadyClock::now() - started).count()); put(result, "sampleRate", sampleRate); put(result, "blockSize", blockSize);
        put(result, "pairDeadlineMisses", integer(pairDeadlineMisses)); put(result, "maxPairMicros", maxPairMicros);
        put(result, "combinedRealtimeRatio", frame == 0 ? 0 : pairMicros * sampleRate / (static_cast<double>(frame) * 1.0e6));
        put(result, "lateWakeups", integer(lateWakeups)); put(result, "maxWakeLatenessMicros", maxWakeLatenessMicros);
        juce::Array<juce::var> rows; for (const auto& instance : instances) rows.add(instance->json(includeWindows)); put(result, "products", rows); return result;
    }
    void publish(bool final = false) const {
        auto progress = report(final); put(progress, "event", final ? "finished" : "progress");
        std::cout << juce::JSON::toString(progress, true).toStdString() << std::endl;
        if (opts.report != juce::File() && !opts.report.replaceWithText(juce::JSON::toString(report(true), false))) throw std::runtime_error("Could not write sustained-test JSON report");
    }
    void execute(juce::AudioPluginFormatManager& manager) {
        juce::Array<juce::File> bundles;
        if (opts.plugin.isDirectory()) bundles.add(opts.plugin); else opts.bundles.findChildFiles(bundles, juce::File::findDirectories, true, "*.vst3");
        for (const auto& bundle : bundles) {
            const auto id = productFor(bundle); if (id.isEmpty() || (opts.product.isNotEmpty() && opts.product != id)) continue;
            for (const auto& existing : instances) if (existing->id == id) throw std::runtime_error(("Multiple compiled bundles match " + id).toStdString());
            auto instance = std::make_unique<Instance>(); instance->id = id; instance->bundle = bundle;
            std::cerr << "Kitchen sustained PREPARE " << id.toStdString() << ' ' << bundle.getFullPathName().toStdString() << std::endl;
            instances.push_back(std::move(instance)); instances.back()->prepare(manager, opts);
        }
        const size_t expected = opts.product.isNotEmpty() || opts.plugin.isDirectory() ? 1 : 2;
        if (instances.size() != expected) throw std::runtime_error("Missing requested compiled BATTER/CLATTER VST3 bundles");
        started = SteadyClock::now(); const auto totalFrames = static_cast<std::int64_t>(std::llround(opts.seconds * sampleRate)); publish();
        for (; frame < totalFrames;) {
            const int frames = static_cast<int>(std::min<std::int64_t>(blockSize, totalFrames - frame));
            if (opts.paced) {
                const auto due = started + std::chrono::duration_cast<SteadyClock::duration>(std::chrono::duration<double>(frame / static_cast<double>(sampleRate)));
                const double late = std::chrono::duration<double, std::micro>(SteadyClock::now() - due).count();
                maxWakeLatenessMicros = std::max(maxWakeLatenessMicros, late); if (late > frames * 1.0e6 / sampleRate) ++lateWakeups;
            }
            double thisPairMicros = 0;
            for (auto& instance : instances) { instance->process(frame, frames); thisPairMicros += instance->allTiming.values.back(); }
            pairMicros += thisPairMicros; maxPairMicros = std::max(maxPairMicros, thisPairMicros);
            if (thisPairMicros > frames * 1.0e6 / sampleRate) ++pairDeadlineMisses;
            frame += frames;
            const bool windowEnd = frame % sampleRate == 0 || frame == totalFrames;
            if (windowEnd) for (auto& instance : instances) instance->finishWindow(frame);
            for (const auto& instance : instances) if (failure.isEmpty() && instance->failure.isNotEmpty()) failure = instance->id + ": " + instance->failure;
            if (failure.isNotEmpty()) break;
            if (windowEnd && frame % (sampleRate * 10) == 0) publish();
            if (opts.paced) std::this_thread::sleep_until(started + std::chrono::duration_cast<SteadyClock::duration>(std::chrono::duration<double>(frame / static_cast<double>(sampleRate))));
        }
        for (auto& instance : instances) {
            instance->finishWindow(frame);
            if (instance->firstAudible < 0) instance->fault("The compiled VST3 never rendered audible PCM", 0);
            if (failure.isEmpty() && instance->failure.isNotEmpty()) failure = instance->id + ": " + instance->failure;
        }
        if (failure.isEmpty() && pairMicros * sampleRate > static_cast<double>(frame) * 1.0e6) failure = "Combined plugin callback CPU exceeded the rendered audio duration";
        complete = true; publish(true);
    }
};
}
int main(int argc, char** argv) {
    juce::ScopedJuceInitialiser_GUI initialiser; juce::ScopedNoDenormals noDenormals;
    juce::AudioPluginFormatManager manager;
    Run run; run.started = SteadyClock::now();
    try {
        run.opts = options(argc, argv);
        manager.addFormat(std::make_unique<juce::VST3PluginFormat>());
        run.execute(manager); return run.failure.isEmpty() ? 0 : 1;
    } catch (const std::exception& error) {
        run.failure = error.what(); run.complete = true;
        for (auto& instance : run.instances) { instance->finishWindow(run.frame); if (instance->failure.isEmpty()) instance->fault(run.failure, run.frame); }
        try { run.publish(true); } catch (...) {}
        std::cerr << "FAIL sustained native VST3: " << error.what() << std::endl; return 1;
    }
}
