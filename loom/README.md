# LOOM

An eight-track browser studio for Music Lab’s very odd orchestra.

Live: https://calebhaines.github.io/sidequest-prototypes/music/loom/

The standalone `index.html` bundles all eight existing Music Lab instruments,
the studio, effects, fonts, and a playable starter arrangement. Open it in a
modern browser and press Play. Instrument HTML can also be added from a file;
the hosted version can discover and load new instruments from Music Lab.

## Making a piece

Select a track, choose an instrument, and open its editor. Its full original
interface plays through that track’s mixer and four effects slots. Editor
audition lets you try sounds; Live makes the app follow the studio transport.
Arm tracks and record their actual output into audio clips. Preparation loads
the instrument’s engine before recording starts.

Arrange clips by moving, trimming, splitting, duplicating, reversing, or looping
them. Source trim, gain, fades, and speed are nondestructive. Speed also changes
pitch. Snap and zoom make precise edits easier; the clip inspector offers
numeric timing controls. Loop phase survives splitting and left trimming.
Audio imports and explicitly enabled microphone input can provide material too.

Each of the eight tracks has level, pan, mute, solo, and exactly four serial
effects slots. Effects can be edited, bypassed, reordered, reset, or removed.
Recordings capture live track input before the DAW inserts. Play existing clips
while recording a new performance, then shape the recorded part afterward.

The bundled starter session contains actual rendered RAVEL percussion, BOWER
strings, and HAZE clouds, with matching instrument states. The other tracks are
ready for new parts. Empty session starts with eight blank tracks.

## Transport and navigation

Play continues from the current position. Pause holds the position; Stop finishes
any recording and returns to the beginning. The recording button finishes a take
and holds its position. Start/End and bar-step controls move the needle, loop
boundary buttons jump to the loop's edges, and Restart plays from the beginning.
Non-loop playback stops at the session end, including live hosted instruments.

Drag the ruler or playhead handle to scrub. Click the clock to enter an exact bar,
beat, and tick; 1,000 ticks make a beat. Follow keeps the playing needle visible;
manually scrolling pauses following briefly. Loop this clip sets the loop to the
selected clip's time range. Position and loop-range controls lock while recording
is preparing, active, or finalizing, keeping recorded timing intact.

Space plays/pauses, Enter stops and returns to the beginning, Home/End jumps to
the session boundaries, Alt + Left/Right steps by bars, and Shift + Space restarts.
G opens Go To, [ and ] jump to loop edges, F toggles Follow, L toggles looping, and
Shift + L loops the selected clip. Inputs and dialogs keep their normal keys.

## Automation and sections

Each track can automate its level, pan, and numeric insert-effect controls,
including dry/wet mix. Choose a parameter and add a lane, click to add points,
and drag them or use the numeric beat/value editor. Linear interpolation draws
ramps; Hold draws steps. Read enables or disables each lane without deleting it.
The editor has its own snap, zoom, and Fit controls. Arm Write during playback
and move the selected track's mixer or effect controls to capture a gesture.
Write disarms on track changes and Panic. Moving an insert also moves its lanes;
removing or replacing an insert removes its previous automation.

The playback and export engines evaluate the same automation, including seeks,
loop wraps, and partial-range renders. Instrument editor parameters are controlled
inside each app; automation currently covers the LOOM mixer and insert effects.
Automation and section markers persist in projects, recovery, and Undo/Redo.

Add named, colored section markers at the playhead with + Marker or M. Clicking a
marker jumps to its position; the pencil edits its name, time, or color. Previous
and next section buttons help navigate a longer arrangement.

## Recording setup and clip transfers

Count-in adds one or two bars of clicks before a fresh recording starts. The
timeline holds during the countdown; the clicks and countdown are excluded from
captured audio. Finishing or cancelling before capture leaves no empty clip.
When playback is already running, recording starts without another count-in.

Punch in/out captures only its chosen time range. Start playback/recording before
the punch boundary for pre-roll; the recorder starts at punch-in and automatically
prints the take at punch-out. Punch makes a single pass, temporarily suspending
transport looping. Use loop range copies the current loop boundaries. A punch
range must be ahead of the playhead before recording.

Select a recording to reveal the direct clip actions below the timeline, including
Delete clip. Right-clicking a clip opens an actions dialog; Undo restores deletion.
Send to instrument renders a selected region of that clip, including source
trim/offset, speed, reverse, repetitions, level, and fades. Choose selection start
and end in seconds; **Fit receiver limit** explicitly shortens the region. Track
mixer settings and insert effects stay in LOOM. Existing receiving audio or
synthesis layers require the replacement checkbox. Empty tracks load the chosen
instrument and replace its chosen starter destination.

| Destination | Limit | Interpretation |
| --- | --- | --- |
| FORM | 2 seconds | One of 24 mono granular layers |
| MIRE | 10 seconds | One of four mono source exciters |
| SPOOL | 30 seconds | One of four stereo tape decks |
| RAVEL | 20 seconds | Stereo sample and sixteen slices |
| HAZE | 20 seconds | Audio analysis into an editable spectral score |

Loaded future instruments with `audioImport` are included automatically; their
number or string destination IDs and declared limits are preserved. The original
clip remains in the arrangement. The receiving instrument keeps unrelated
sounds, patterns, mixer, and effects. Imports persist in its native snapshot;
transfer Undo/Redo restores the previous instrument audio.

The **Samples** panel shares the same local library as all standalone Music Lab
apps and hosted editors. Render the selected clip, arranged mix, or track
instrument; save audio to the library or download WAV/portable packets. Receive a
sample as a new clip on any of the eight tracks. Hosted instrument project storage
stays isolated, while its sample library is deliberately shared with the studio.
Downloaded HTML includes all exchange code and works offline. If browser storage
is unavailable, keep a WAV or packet for the next session.

## Eight effects

| Effect | Processing |
| --- | --- |
| PRISM | Three EQ bands and a resonant filter |
| VELVET | Stereo-linked compressor with a soft knee |
| CINDER | Saturation, diode distortion, or wavefolding |
| UNDERTOW | Stereo chorus and flanging |
| PARALLAX | Tempo-synced or free ping-pong echo |
| VESTIGE | Eight-line algorithmic reverb |
| HALO | Windowed, phase-aligned pitch shifting |
| TREMOR | Tempo-locked rhythmic gating and auto-pan |

## Projects, recording, and export

Save project preserves all clips, their portable 16-bit PCM audio, mixer and
effects settings, native instrument states, and uploaded future-app HTML.
Open project restores the session. Undo and Redo preserve editing history;
downloaded projects remain available when browser storage is denied or full.

Mix and track WAV exports render arranged audio through the same DSP as live
playback, at 48 kHz, 16-bit stereo. Choose a render range and an effect tail;
long feedback tails can continue beyond the chosen render. Progress and Cancel
keep rendering manageable. Record live instrument parts into clips before
exporting an arrangement.

LOOM has eight fixed tracks, four slots each, up to 64 bars, and up to 128 clips
per track. Each imported or recorded source holds up to 120 seconds. The source
audio budget is 64 MB of PCM; native app snapshots have a separate 96 MB budget.
Microphone monitoring is optional and starts only after permission is granted.
Panic stops the studio and instruments, cancels pending audio, clears effect
buffers, discards unfinished takes, and releases microphone tracks.

## Hosting and source

[HOSTING.md](HOSTING.md) documents the MusicLabHost v1 bridge for future apps.
Hosted apps keep their original interfaces. Their live AudioContexts share LOOM’s
clock and route into their assigned track; offline app renderers keep their own
OfflineAudioContexts. App storage is isolated from standalone saved projects.

Run `python3 loom/build.py` from the repository root to build `loom/index.html`
and `music/loom/LOOM-source.zip`. Run `npm run music:sync` to refresh the copies in
`public/music/` and `docs/music/`. GitHub Pages publishes `docs/`.

Run `npm run check:loom` for the dependency-free Node engine checks. These verify
project compatibility, automation in playback and export, sample-exact
count-in/punch recording, and cropped stereo transfers with clip edits and limits.
From an extracted archive, run `node checks.cjs`.

From an extracted source archive, run `python3 build.py` in its directory. The
archive includes the eight original standalone instrument pages in
`instruments/`, complete LOOM sources, fonts, and demo audio. Individual app
source projects are available from Music Lab.

Bundled Noto fonts are copyright Google, licensed under the SIL Open Font
License 1.1; see `fonts/LICENSE.txt`. Instrument pages retain their embedded
font license notices. Version 1.2.0.
