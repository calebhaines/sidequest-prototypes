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
