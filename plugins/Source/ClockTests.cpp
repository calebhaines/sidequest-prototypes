#include "HostContract.h"
#include <cassert>
#include <iostream>
int main() {
    kitchen::ClockTracker tracker; std::array<double, kitchen::clockFields> c{};
    c[kitchen::tempo] = 120; c[kitchen::ppq] = 8; c[kitchen::playing] = 1; c[kitchen::validPpq] = 1;
    tracker.begin(c, 48000, 128); const auto epoch = tracker.epoch; tracker.advance(128);
    c[kitchen::ppq] += 128.0 / 24000; tracker.begin(c, 48000, 256); assert(tracker.epoch == epoch); assert(c[kitchen::localFrame] == 128);
    tracker.advance(256); c[kitchen::ppq] += 256.0 / 24000 + 1.0 / 24000; tracker.begin(c, 48000, 64); assert(tracker.epoch == epoch);
    tracker.advance(64); c[kitchen::ppq] = 4; tracker.begin(c, 48000, 64); assert(tracker.epoch == epoch + 1);
    c[kitchen::playing] = 0; tracker.begin(c, 48000, 64); assert(tracker.epoch == epoch + 2);
    tracker.reset(); assert(tracker.local == 0);
    std::array<double, kitchen::eventFields> event{};
    kitchen::writeMidiRow(event.data(), 17, kitchen::pitchBend, 0, -.25, 3);
    assert(event[0] == 17 && event[1] == 4 && event[2] == -.25 && event[3] == -.25 && event[4] == 3);
    kitchen::writeMidiRow(event.data(), 31, kitchen::noteOn, 60, .8, 2, 77);
    assert(event[0] == 31 && event[2] == 60 && event[3] == .8 && event[4] == 2 && event[5] == 77);
    std::cout << "PASS native clock continuity, seek/loop revisions, stop and reset\n";
}
