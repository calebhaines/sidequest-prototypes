#include "NativeRemoteRuntime.h"
#include <atomic>
#include <cerrno>
#include <cstring>
#include <new>
#include <stdexcept>
#include <chrono>
#include <sys/mman.h>
#include <sys/socket.h>
#include <sys/wait.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <poll.h>
#include <spawn.h>
#include <signal.h>
#include <unistd.h>
#include <pthread.h>
#include <pthread/qos.h>
#include <mach/mach.h>
#include <mach/mach_time.h>
#include <mach/thread_policy.h>
#include <crt_externs.h>

namespace kitchen {
namespace {
constexpr int maximumFrames = 65536;
constexpr int childSocket = 198;
constexpr int protocolVersion = 1;
constexpr std::uint64_t protocolMagic = 0x4b49544348454e31ull;
enum Command { commandInitialise = 1, commandPrepare, commandRender, commandReset, commandSnapshot, commandCapture, commandFinish };
template <size_t size> void put(char (&destination)[size], const juce::String& value) {
    value.copyToUTF8(destination, size); destination[size - 1] = 0;
}
std::int64_t nowNanos() noexcept {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(std::chrono::steady_clock::now().time_since_epoch()).count();
}
bool receiveToken(int socket, std::uint64_t expected, int timeoutMs, pid_t& child) noexcept {
    const auto deadline = nowNanos() + static_cast<std::int64_t>(timeoutMs) * 1000000;
    for (;;) {
        const auto remaining = deadline - nowNanos(); if (remaining <= 0) return false;
        pollfd descriptor { socket, POLLIN, 0 };
        const int waitMs = static_cast<int>(std::max<std::int64_t>(1, (remaining + 999999) / 1000000));
        const int result = ::poll(&descriptor, 1, std::min(waitMs, 250));
        if (result < 0 && errno == EINTR) continue;
        if (result == 0) {
            const auto reaped = ::waitpid(child, nullptr, WNOHANG);
            if (reaped == child || (reaped < 0 && errno == ECHILD)) { child = -1; return false; }
            continue;
        }
        if (result < 0 || (descriptor.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) return false;
        std::uint64_t token = 0;
        const auto bytes = ::recv(socket, &token, sizeof(token), MSG_DONTWAIT);
        if (bytes < 0 && (errno == EINTR || errno == EAGAIN)) continue;
        if (bytes != sizeof(token)) return false;
        if (token == expected) return true;
    }
}
void configureAudioPriority(double rate, int frames) noexcept {
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INTERACTIVE, 0);
    mach_timebase_info_data_t timebase{}; mach_timebase_info(&timebase);
    const auto nanos = std::max(1000000.0, frames * 1.0e9 / rate);
    const auto ticks = nanos * timebase.denom / timebase.numer;
    thread_time_constraint_policy_data_t policy{};
    policy.period = static_cast<std::uint32_t>(std::min(ticks, static_cast<double>(UINT32_MAX)));
    policy.computation = static_cast<std::uint32_t>(std::max(50000.0 * timebase.denom / timebase.numer, ticks * .8));
    policy.constraint = policy.period; policy.preemptible = true;
    const auto thread = mach_thread_self();
    thread_policy_set(thread, THREAD_TIME_CONSTRAINT_POLICY, reinterpret_cast<thread_policy_t>(&policy), THREAD_TIME_CONSTRAINT_POLICY_COUNT);
    mach_port_deallocate(mach_task_self(), thread);
}
void configureControlPriority() noexcept {
    const auto thread = mach_thread_self();
    thread_policy_set(thread, THREAD_STANDARD_POLICY, nullptr, 0);
    mach_port_deallocate(mach_task_self(), thread);
    pthread_set_qos_class_self_np(QOS_CLASS_USER_INITIATED, 0);
}
struct AudioPriority {
    AudioPriority(double rate, int frames) { configureAudioPriority(rate, frames); }
    ~AudioPriority() { configureControlPriority(); }
};
class ChildGarbage final : private juce::Thread {
public:
    ChildGarbage() : juce::Thread("Kitchen DSP retirement") { startThread(); }
    ~ChildGarbage() override { signalThreadShouldExit(); notify(); stopThread(-1); drain(); }
    static bool retire(void* owner, void* pointer, void (*destroy)(void*)) {
        auto& self = *static_cast<ChildGarbage*>(owner); int first, count, second, remaining;
        self.fifo.prepareToWrite(1, first, count, second, remaining); if (count == 0) return false;
        self.items[static_cast<size_t>(first)] = { pointer, destroy }; self.fifo.finishedWrite(1); return true;
    }
private:
    struct Item { void* pointer = nullptr; void (*destroy)(void*) = nullptr; };
    std::array<Item, 1024> items{}; juce::AbstractFifo fifo { static_cast<int>(items.size()) };
    void drain() {
        int first, count, second, remaining; fifo.prepareToRead(static_cast<int>(items.size()), first, count, second, remaining);
        for (int i = 0; i < count; ++i) { auto& item = items[static_cast<size_t>(first + i)]; item.destroy(item.pointer); }
        for (int i = 0; i < remaining; ++i) { auto& item = items[static_cast<size_t>(second + i)]; item.destroy(item.pointer); }
        fifo.finishedRead(count + remaining);
    }
    void run() override { while (!threadShouldExit()) { drain(); wait(20); } drain(); }
};
}

struct alignas(64) NativeRemoteRuntime::Shared {
    std::uint64_t magic = protocolMagic, bytes = 0;
    std::uint32_t version = protocolVersion;
    std::atomic<std::uint64_t> requested { 0 }, completed { 0 };
    int command = 0, frames = 0, eventCount = 0, outputEventCount = 0, parameterCount = 0;
    int latency = 0, failed = 0;
    double tail = 0;
    char error[2048]{}, captureRequest[16384]{}, captureResponse[131072]{};
    alignas(64) float inputLeft[maximumFrames]{}, inputRight[maximumFrames]{};
    alignas(64) float outputLeft[maximumFrames]{}, outputRight[maximumFrames]{};
    alignas(64) double events[maxEvents * eventFields]{}, outputEvents[maxEvents * eventFields]{};
    alignas(64) double parameters[maxParameters]{}, clock[clockFields]{};
};
static_assert(std::atomic<std::uint64_t>::is_always_lock_free, "Shared process sequence requires lock-free atomics");

NativeRemoteRuntime::NativeRemoteRuntime(NativeRuntime& runtime, const juce::String& state) : owner(runtime) {
    try {
        auto helper = owner.resources.getParentDirectory().getParentDirectory().getChildFile("Helpers/KitchenDSPHelper");
        if (!helper.existsAsFile()) helper = juce::File::getSpecialLocation(juce::File::currentExecutableFile).getSiblingFile("KitchenDSPHelper");
        const auto overridePath = juce::SystemStats::getEnvironmentVariable("KITCHEN_DSP_HELPER", {});
        if (overridePath.isNotEmpty()) helper = juce::File(overridePath);
        if (!helper.existsAsFile()) throw std::runtime_error("The signed Kitchen DSP helper is missing from this plugin installation");
        const auto unique = juce::Uuid().toString().removeCharacters("-");
        temporaryDirectory = juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("kitchen-dsp-" + unique);
        if (temporaryDirectory.createDirectory().failed()) throw std::runtime_error("Unable to create private DSP preparation directory");
        ::chmod(temporaryDirectory.getFullPathName().toRawUTF8(), 0700);
        const auto stateFile = temporaryDirectory.getChildFile("initial.json");
        if (!stateFile.replaceWithText(state)) throw std::runtime_error("Unable to save DSP preparation state");
        sharedName = "/ktch-" + unique.substring(0, 20);
        const int memory = ::shm_open(sharedName.toRawUTF8(), O_CREAT | O_EXCL | O_RDWR, 0600);
        if (memory < 0) throw std::runtime_error("Unable to create private shared DSP memory");
        if (::ftruncate(memory, static_cast<off_t>(sizeof(Shared))) != 0) { ::close(memory); throw std::runtime_error("Unable to size shared DSP memory"); }
        void* mapping = ::mmap(nullptr, sizeof(Shared), PROT_READ | PROT_WRITE, MAP_SHARED, memory, 0); ::close(memory);
        if (mapping == MAP_FAILED) throw std::runtime_error("Unable to map shared DSP memory");
        shared = new (mapping) Shared(); shared->bytes = sizeof(Shared); ::mlock(shared, sizeof(Shared));
        int sockets[2]{};
        if (::socketpair(AF_UNIX, SOCK_DGRAM, 0, sockets) != 0) throw std::runtime_error("Unable to create DSP wake channel");
        socket = sockets[0]; ::fcntl(socket, F_SETFD, FD_CLOEXEC); ::fcntl(sockets[1], F_SETFD, FD_CLOEXEC);
        const int noSignal = 1; ::setsockopt(socket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, sizeof(noSignal));
        posix_spawn_file_actions_t actions; posix_spawn_file_actions_init(&actions);
        posix_spawn_file_actions_addclose(&actions, sockets[0]);
        posix_spawn_file_actions_adddup2(&actions, sockets[1], childSocket);
        if (sockets[1] != childSocket) posix_spawn_file_actions_addclose(&actions, sockets[1]);
        posix_spawnattr_t attributes; posix_spawnattr_init(&attributes);
#ifdef POSIX_SPAWN_CLOEXEC_DEFAULT
        posix_spawnattr_setflags(&attributes, POSIX_SPAWN_CLOEXEC_DEFAULT);
        for (int descriptor = 0; descriptor < 3; ++descriptor) if (::fcntl(descriptor, F_GETFD) >= 0) posix_spawn_file_actions_addinherit_np(&actions, descriptor);
#endif
        juce::StringArray arguments { helper.getFullPathName(), "--memory", sharedName, "--resources", owner.resources.getFullPathName(), "--product", owner.product.id,
                                      "--state", stateFile.getFullPathName(), "--rate", juce::String(owner.rate, 12), "--capacity", juce::String(owner.blockCapacity), "--parent", juce::String(static_cast<int>(::getpid())) };
        std::vector<char*> argv; for (const auto& value : arguments) argv.push_back(const_cast<char*>(value.toRawUTF8())); argv.push_back(nullptr);
        const int spawned = ::posix_spawn(&child, helper.getFullPathName().toRawUTF8(), &actions, &attributes, argv.data(), *_NSGetEnviron());
        posix_spawnattr_destroy(&attributes); posix_spawn_file_actions_destroy(&actions); ::close(sockets[1]);
        if (spawned != 0) { child = -1; throw std::runtime_error("Unable to launch the signed Kitchen DSP helper: " + std::string(std::strerror(spawned))); }
        if (!exchange(commandInitialise, 65000)) throw std::runtime_error(owner.error.toStdString());
        ::shm_unlink(sharedName.toRawUTF8()); stateFile.deleteFile();
    } catch (...) { cleanup(); throw; }
}
NativeRemoteRuntime::~NativeRemoteRuntime() { cleanup(); }
void NativeRemoteRuntime::cleanup() noexcept {
    if (socket >= 0) { ::close(socket); socket = -1; }
    if (child > 0) {
        ::kill(child, SIGTERM);
        for (int attempt = 0; attempt < 50; ++attempt) {
            const auto reaped = ::waitpid(child, nullptr, WNOHANG);
            if (reaped == child || (reaped < 0 && errno == ECHILD)) { child = -1; break; }
            juce::Thread::sleep(2);
        }
        if (child > 0) { ::kill(child, SIGKILL); while (::waitpid(child, nullptr, 0) < 0 && errno == EINTR) {} child = -1; }
    }
    if (shared != nullptr) { ::munlock(shared, sizeof(Shared)); ::munmap(shared, sizeof(Shared)); shared = nullptr; }
    if (sharedName.isNotEmpty()) ::shm_unlink(sharedName.toRawUTF8());
    if (temporaryDirectory != juce::File()) temporaryDirectory.deleteRecursively();
}
bool NativeRemoteRuntime::exchange(int command, int timeoutMs) noexcept {
    if (socket < 0 || shared == nullptr || owner.error.isNotEmpty()) return false;
    shared->command = command; const auto token = ++sequence;
    shared->requested.store(token, std::memory_order_release);
    if (::send(socket, &token, sizeof(token), MSG_DONTWAIT) != sizeof(token) || !receiveToken(socket, token, timeoutMs, child)
        || shared->completed.load(std::memory_order_acquire) != token) {
        owner.error = "The Kitchen DSP helper stopped responding; audio has been stopped for this instance"; return false;
    }
    copyStatus(); return owner.error.isEmpty();
}
void NativeRemoteRuntime::copyStatus() noexcept {
    owner.latencySamples = shared->latency; owner.cachedTail = shared->tail;
    if (shared->failed != 0) owner.error = juce::String::fromUTF8(shared->error);
}
void NativeRemoteRuntime::prepare(const std::vector<float>& values) {
    shared->parameterCount = std::min(static_cast<int>(values.size()), maxParameters);
    for (int i = 0; i < shared->parameterCount; ++i) {
        shared->parameters[i] = values[static_cast<size_t>(i)]; owner.parameters[static_cast<size_t>(i)] = values[static_cast<size_t>(i)];
        owner.appliedParameters[static_cast<size_t>(i)] = values[static_cast<size_t>(i)];
    }
    exchange(commandPrepare, 65000);
}
void NativeRemoteRuntime::process(int frames) noexcept {
    if (frames < 0 || frames > owner.blockCapacity) { owner.error = "Invalid shared DSP block size"; return; }
    shared->frames = frames; shared->eventCount = owner.eventCount;
    std::memcpy(shared->inputLeft, owner.inL.data(), static_cast<size_t>(frames) * sizeof(float));
    std::memcpy(shared->inputRight, owner.inR.data(), static_cast<size_t>(frames) * sizeof(float));
    std::memcpy(shared->events, owner.events.data(), static_cast<size_t>(owner.eventCount * eventFields) * sizeof(double));
    std::memcpy(shared->clock, owner.clockData.data(), clockFields * sizeof(double));
    std::memcpy(shared->parameters, owner.parameters.data(), static_cast<size_t>(shared->parameterCount) * sizeof(double));
    const int timeoutMs = std::max(50, static_cast<int>(std::ceil(frames * 4000.0 / owner.rate)));
    if (!exchange(commandRender, timeoutMs)) return;
    std::memcpy(owner.outL.data(), shared->outputLeft, static_cast<size_t>(frames) * sizeof(float));
    std::memcpy(owner.outR.data(), shared->outputRight, static_cast<size_t>(frames) * sizeof(float));
    owner.outputEventCount = juce::jlimit(0, maxEvents, shared->outputEventCount);
    std::memcpy(owner.outputEvents.data(), shared->outputEvents, static_cast<size_t>(owner.outputEventCount * eventFields) * sizeof(double));
}
void NativeRemoteRuntime::reset() noexcept {
    std::memcpy(shared->parameters, owner.parameters.data(), static_cast<size_t>(shared->parameterCount) * sizeof(double));
    exchange(commandReset, 100);
}
juce::String NativeRemoteRuntime::stateJSON() {
    if (owner.error.isNotEmpty()) return {};
    std::memcpy(shared->parameters, owner.parameters.data(), static_cast<size_t>(shared->parameterCount) * sizeof(double));
    return exchange(commandSnapshot, 65000) ? temporaryDirectory.getChildFile("snapshot.json").loadFileAsString() : juce::String{};
}
juce::String NativeRemoteRuntime::capture(const juce::String& request) {
    if (owner.error.isNotEmpty()) return "{\"ok\":false,\"error\":\"DSP helper is unavailable\"}";
    if (request.getNumBytesAsUTF8() >= sizeof(shared->captureRequest)) return "{\"ok\":false,\"error\":\"MIDI capture request is too large\"}";
    put(shared->captureRequest, request);
    std::memcpy(shared->parameters, owner.parameters.data(), static_cast<size_t>(shared->parameterCount) * sizeof(double));
    return exchange(commandCapture, 100) ? juce::String::fromUTF8(shared->captureResponse) : "{\"ok\":false,\"error\":\"DSP helper is unavailable\"}";
}
int NativeRemoteRuntime::runChild(int argc, char** argv) {
    juce::ScopedJuceInitialiser_GUI initialiser;
    juce::String memoryName, productId; juce::File resources, stateFile; double rate = 48000; int capacity = 512, parent = 0;
    for (int i = 1; i + 1 < argc; i += 2) {
        const juce::String argument(argv[i]), value(argv[i + 1]);
        if (argument == "--memory") memoryName = value; else if (argument == "--resources") resources = juce::File(value);
        else if (argument == "--product") productId = value; else if (argument == "--state") stateFile = juce::File(value);
        else if (argument == "--rate") rate = value.getDoubleValue(); else if (argument == "--capacity") capacity = value.getIntValue(); else if (argument == "--parent") parent = value.getIntValue();
    }
    const int memory = ::shm_open(memoryName.toRawUTF8(), O_RDWR, 0600); if (memory < 0) return 2;
    struct stat memoryInfo{};
    if (::fstat(memory, &memoryInfo) != 0 || memoryInfo.st_size != static_cast<off_t>(sizeof(Shared))) { ::close(memory); ::shm_unlink(memoryName.toRawUTF8()); return 2; }
    auto* shared = static_cast<Shared*>(::mmap(nullptr, sizeof(Shared), PROT_READ | PROT_WRITE, MAP_SHARED, memory, 0)); ::close(memory); ::shm_unlink(memoryName.toRawUTF8());
    if (shared == MAP_FAILED) return 2;
    ::mlock(shared, sizeof(Shared));
    const int noSignal = 1; ::setsockopt(childSocket, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, sizeof(noSignal));
    ChildGarbage garbage;
    std::unique_ptr<NativeRuntime> runtime;
    configureControlPriority();
    auto status = [&] {
        if (runtime) { shared->latency = runtime->latency(); shared->tail = runtime->tailSeconds(); if (!runtime->ready()) { shared->failed = 1; put(shared->error, runtime->getError()); } }
    };
    try {
        if (shared->magic != protocolMagic || shared->version != protocolVersion || shared->bytes != sizeof(Shared) || parent <= 0 || capacity < 128 || capacity > maximumFrames || !std::isfinite(rate) || rate < 8000) throw std::runtime_error("Invalid DSP helper protocol/setup");
        const auto product = findProduct(readManifest(resources), productId);
        runtime = std::make_unique<NativeRuntime>(product, resources, rate, capacity, stateFile.loadFileAsString(), &garbage, ChildGarbage::retire, true); status();
    } catch (const std::exception& exception) { shared->failed = 1; put(shared->error, juce::String(exception.what())); }
    for (;;) {
        if (::getppid() != parent || (::kill(parent, 0) != 0 && errno == ESRCH)) break;
        pollfd descriptor { childSocket, POLLIN, 0 }; const int result = ::poll(&descriptor, 1, 1000);
        if (result < 0 && errno == EINTR) continue;
        if (result < 0 || (descriptor.revents & (POLLERR | POLLHUP | POLLNVAL)) != 0) break;
        if (result == 0) continue;
        std::uint64_t token = 0; if (::recv(childSocket, &token, sizeof(token), 0) != sizeof(token)) break;
        if (shared->requested.load(std::memory_order_acquire) != token) break;
        const int command = shared->command; if (command == commandFinish) break;
        try {
            if (runtime && runtime->ready()) {
                if (command != commandInitialise && command != commandPrepare) {
                    const int count = juce::jlimit(0, maxParameters, shared->parameterCount);
                    for (int i = 0; i < count; ++i) if (shared->parameters[i] != runtime->appliedParameter(i)) runtime->parameter(i, shared->parameters[i], true);
                }
                if (command == commandPrepare) {
                    const int count = juce::jlimit(0, maxParameters, shared->parameterCount); std::vector<float> values;
                    for (int i = 0; i < count; ++i) values.push_back(static_cast<float>(shared->parameters[i]));
                    runtime->prepareParameters(values);
                } else if (command == commandRender) {
                    juce::ScopedNoDenormals noDenormals;
                    const int frames = shared->frames; if (frames < 0 || frames > capacity) throw std::runtime_error("Invalid DSP render frame count");
                    AudioPriority priority(rate, frames);
                    std::memcpy(runtime->input(0), shared->inputLeft, static_cast<size_t>(frames) * sizeof(float));
                    std::memcpy(runtime->input(1), shared->inputRight, static_cast<size_t>(frames) * sizeof(float));
                    std::memcpy(runtime->clock(), shared->clock, clockFields * sizeof(double));
                    const int eventCount = juce::jlimit(0, maxEvents, shared->eventCount); runtime->setMidiCount(eventCount);
                    std::memcpy(runtime->midi(), shared->events, static_cast<size_t>(eventCount * eventFields) * sizeof(double));
                    runtime->process(frames);
                    std::memcpy(shared->outputLeft, runtime->output(0), static_cast<size_t>(frames) * sizeof(float));
                    std::memcpy(shared->outputRight, runtime->output(1), static_cast<size_t>(frames) * sizeof(float));
                    shared->outputEventCount = runtime->midiOutputCount();
                    std::memcpy(shared->outputEvents, runtime->midiOutput(), static_cast<size_t>(shared->outputEventCount * eventFields) * sizeof(double));
                } else if (command == commandReset) runtime->reset();
                else if (command == commandSnapshot) { if (!stateFile.getSiblingFile("snapshot.json").replaceWithText(runtime->stateJSON())) throw std::runtime_error("Unable to write DSP state snapshot"); }
                else if (command == commandCapture) {
                    const auto response = runtime->captureRequestJSON(juce::String::fromUTF8(shared->captureRequest));
                    put(shared->captureResponse, response.getNumBytesAsUTF8() < sizeof(shared->captureResponse) ? response : juce::String("{\"ok\":false,\"error\":\"MIDI capture response exceeds the bounded page size\"}"));
                }
                status();
            }
        } catch (const std::exception& exception) { shared->failed = 1; put(shared->error, juce::String(exception.what())); }
        shared->completed.store(token, std::memory_order_release);
        if (::send(childSocket, &token, sizeof(token), MSG_DONTWAIT) != sizeof(token)) break;
    }
    runtime.reset(); ::munlock(shared, sizeof(Shared)); ::munmap(shared, sizeof(Shared)); ::close(childSocket); stateFile.getParentDirectory().deleteRecursively(); return 0;
}
}
