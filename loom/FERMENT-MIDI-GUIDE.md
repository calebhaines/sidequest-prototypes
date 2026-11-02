# FERMENT · capture a played line as notes

Open a FERMENT insert and expand **Capture MIDI**. Play a clean, single-note
guitar or bass line with unused strings muted. Set **Input instrument** and the
existing input sensitivity/gate for a steady pitch lock. Place FERMENT before
heavy distortion or time effects for the clearest detector input.

1. Press **Start capture**, wait for **Capturing**, then play. Normal monitoring
   or playback supplies the audio; capture does not add a second pitch analyser
   or change the synth sound.
2. Press the capture panel's **Stop** button to finish the take and close its
   held note.
3. Download a MIDI file, export a Kitchen pattern, or use **Place as notes** to put the
   notes on an explicitly selected destination track. Choose CITRUS for a new
   acid-bass part, or another compatible pitched instrument.

Capture follows the played **input pitch**. FERMENT's output register,
oscillator octaves, second-oscillator interval, detune, glide and vibrato do not
transpose or add notes to the captured line. Use **Pitch Tracking** mode;
Chord Texture does not support capture. Chords and pitch bends are not
transcribed: notes use ordinary MIDI pitches.

## Timing and touch

Notes are measured on the audio sample clock, rather than inferred from the
moving GUI meters. Confidence checks and pitch hysteresis reject unstable
estimates. A recognised pick onset can supply the note's start while the pitch
detector settles; low bass notes need more time to identify than high notes.
Distinct repeated picks can create separate notes even with the synth envelope
set to legato. Note endings follow the input gate, not the synth's release tail.

Raw performed timing is the default. Leading silence remains part of the take.
**Trim leading silence** and **Quantize** are optional export/placement choices;
they do not rewrite the original capture. The tempo stored at capture start
converts audio frames to beats, so a downloaded take retains its performed
timing independently of later project tempo edits.

The MIDI download is a Standard MIDI File, format 0, with 960 ticks per
quarter note and a tempo event. Kitchen pattern export retains pitch, position,
individual duration and velocity for editing or reuse in other Kitchen apps.
Neither export contains recorded audio.

Browsers using GALLEY's legacy fallback audio engine temporarily use a
**1,024-frame buffer** during capture when the current buffer is smaller.
This gives input processing more time, with slightly more monitoring latency.
Buffers already at 1,024 frames or larger stay as configured. GALLEY keeps the
same audio context, processing state and input connections, changes no saved
device or latency preferences, and restores the exact previous buffer size
when capture finishes. AudioWorklet playback keeps its existing buffer.

## Keeping a take

Capture is temporary runtime data. It is not included in browser recovery or
ordinary project saving until you place its notes in the arrangement. Export
the MIDI/pattern or place the take to keep it before closing the session.

Each take is bounded to **4,096 notes** and **256 beats**. Reaching a limit
finishes the take safely. Stop, Panic, a seek, closing/reopening the audio
interface, freezing the source track, or removing/replacing/moving its insert
also closes an active capture. Changing its tracking mode, input range, gate,
sensitivity or tracking stability finishes the take; ordinary filter and
oscillator edits can continue. Bypass or zero Blend stops capture.

Silence between phrases does not reset the capture clock or erase earlier
notes. Completed note events move from the audio engine in bounded batches;
the on-screen capture display updates at a lower rate without moving those
event times. A stopped take stays available until you clear it or start a new
one, so export or place it before replacing it.
