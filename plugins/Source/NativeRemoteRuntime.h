#pragma once
#include "NativeRuntime.h"
#include <sys/types.h>

namespace kitchen {
// Each instance owns an independently signed process and its own JSC VM. Only
// fixed-size wake tokens cross the socket; audio/MIDI use preallocated memory.
class NativeRemoteRuntime {
public:
    explicit NativeRemoteRuntime(NativeRuntime&, const juce::String& state);
    ~NativeRemoteRuntime();
    void prepare(const std::vector<float>&);
    void process(int frames, bool nonRealtime = false) noexcept;
    void reset() noexcept;
    juce::String stateJSON();
    juce::String capture(const juce::String&);
    int processId() const noexcept { return static_cast<int>(child); }
    static int runChild(int argc, char** argv);
private:
    struct Shared;
    NativeRuntime& owner;
    Shared* shared = nullptr;
    int socket = -1;
    pid_t child = -1;
    std::uint64_t sequence = 0;
    std::uint64_t pendingSequence = 0;
    std::int64_t pendingDeadline = 0;
    std::array<double, maxEvents * eventFields * 2> deferredMidi{};
    int deferredMidiCount = 0;
    juce::String sharedName;
    juce::File temporaryDirectory;
    bool exchange(int command, int timeoutMs, bool allowLateRender = false) noexcept;
    bool finishPending() noexcept;
    bool retainOutputMidi(bool late) noexcept;
    void publishDeferredMidi(int frames) noexcept;
    void copyStatus() noexcept;
    void cleanup() noexcept;
};
}
