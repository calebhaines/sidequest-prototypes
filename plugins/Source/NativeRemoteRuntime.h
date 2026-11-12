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
    void process(int frames) noexcept;
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
    juce::String sharedName;
    juce::File temporaryDirectory;
    bool exchange(int command, int timeoutMs) noexcept;
    void copyStatus() noexcept;
    void cleanup() noexcept;
};
}
