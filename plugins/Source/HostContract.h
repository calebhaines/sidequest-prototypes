#pragma once
#include <array>
#include <algorithm>
#include <cmath>
#include <cstdint>

namespace kitchen {
constexpr int clockFields = 16;
constexpr int eventFields = 8;
constexpr int maxEvents = 4096;
constexpr int maxParameters = 4096;
enum ClockField { tempo, ppq, playing, numerator, denominator, looping, loopStart, loopEnd,
                  hostSample, localFrame, revision, sampleRate, frames, recording, validPpq, validHostSample };
enum MidiType { noteOn = 1, noteOff = 2, controller = 3, pitchBend = 4, allNotesOff = 5 };
inline void writeMidiRow(double* row, int offset, int type, int data1, double data2, int channel, std::uint32_t id = 0) noexcept {
    for (int i = 0; i < eventFields; ++i) row[i] = 0;
    row[0] = offset; row[1] = type; row[2] = type == pitchBend ? data2 : data1; row[3] = data2; row[4] = channel; row[5] = id;
}
struct MidiNoteIdentities {
    static constexpr std::uint32_t editorMask = 0x80000000u;
    std::uint32_t serial = 0;
    std::uint32_t evicted = 0;
    std::array<std::array<std::uint32_t, 8>, 16 * 128> held{};
    std::array<int, 16 * 128> counts{};
    void clear() noexcept { counts.fill(0); }
    std::uint32_t event(int type, int pitch, int channel, std::uint32_t editorId = 0) noexcept {
        evicted = 0;
        if ((type != noteOn && type != noteOff)) return 0;
        if ((editorId & editorMask) != 0) return editorId;
        const auto key = static_cast<size_t>(std::clamp(channel - 1, 0, 15) * 128 + std::clamp(pitch, 0, 127)); auto& count = counts[key]; auto& ids = held[key];
        if (type == noteOn) {
            if (count == static_cast<int>(ids.size())) { evicted = ids[0]; for (int i = 1; i < count; ++i) ids[static_cast<size_t>(i - 1)] = ids[static_cast<size_t>(i)]; --count; }
            serial = (serial + 1u) & ~editorMask; if (serial == 0) serial = 1;
            ids[static_cast<size_t>(count++)] = serial; return serial;
        }
        if (count == 0) return 0;
        const auto id = ids[0]; for (int i = 1; i < count; ++i) ids[static_cast<size_t>(i - 1)] = ids[static_cast<size_t>(i)]; --count; return id;
    }
};
struct ClockTracker {
    std::uint64_t local = 0, epoch = 0;
    bool previousValid = false, previousPlaying = false;
    double previousPpq = 0, previousTempo = 120;
    int previousFrames = 0;
    void reset() noexcept { local = 0; ++epoch; previousValid = false; }
    void begin(std::array<double, clockFields>& c, double rate, int count) noexcept {
        const bool valid = c[validPpq] != 0;
        const bool isPlaying = c[playing] != 0;
        if (valid && previousValid) {
            const double expected = previousPpq + (previousPlaying ? previousFrames * previousTempo / (60.0 * rate) : 0.0);
            const double tolerance = std::max(1.0e-7, 2.0 * std::max(previousTempo, c[tempo]) / (60.0 * rate));
            if (std::abs(c[ppq] - expected) > tolerance || previousPlaying != isPlaying) ++epoch;
        } else if (previousValid != valid || previousPlaying != isPlaying) ++epoch;
        c[localFrame] = static_cast<double>(local); c[revision] = static_cast<double>(epoch);
        c[sampleRate] = rate; c[frames] = count;
        previousValid = valid; previousPlaying = isPlaying; previousPpq = c[ppq];
        previousTempo = c[tempo]; previousFrames = count;
    }
    void advance(int count) noexcept { local += static_cast<std::uint64_t>(count); }
};
}
