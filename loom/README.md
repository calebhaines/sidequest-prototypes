# GALLEY

Kitchen’s central production station.

An eight-track browser studio for Kitchen. Eight tracks. One increasingly specific order.

Live: https://calebhaines.github.io/sidequest-prototypes/music/loom/

The standalone `index.html` bundles all eleven Kitchen instruments,
the studio, effects, fonts, and a playable starter arrangement. Open it in a
modern browser and press Play. Instrument HTML can also be added from a file;
the hosted version can discover and load new instruments from Kitchen.

**ROUX** is the dedicated bass instrument: a circular recipe sequencer combines
relative note movement, rests, accents, and slides with a deep fundamental and
a driven resonant waveguide. Its editor, shared patterns, and native synthesis
are available inside GALLEY alongside the other ten instruments.

**BATTER** sequences recorded acoustic drums across twelve lanes and eight
pattern banks. Its embedded starter kit plays offline; additional recorded kits
can be loaded on the site or imported as downloaded bundles. The same editor,
sample editing, shared audio, and drum-note voices are available inside GALLEY.

## Making a piece

Select a track, choose an instrument, and open its editor. Its full original
interface plays through that track’s mixer and four effects slots. Editor
audition lets you try sounds; Live makes the app follow the studio transport.
Arm tracks and record their actual output into audio clips. Preparation loads
the instrument’s engine before recording starts.

Choose **+ Note clip** to write a part directly in the piano roll. Click to add
notes, drag to move, and drag their ends to resize. Select several notes to move
or quantize them together; edit velocity, probability, and destination voices.
Note clips play the actual instrument through the track’s mixer and four inserts,
including when Live is off. Their time rate changes timing without changing pitch;
transpose changes pitch separately. Use note velocities and the track mixer for
dynamics; printed audio adds clip level and fades. Drum and spectral parts retain
named voices.
Choose **Pan** to drag a longer score horizontally or vertically, including on
a touchscreen. P toggles Pan while the piano roll is focused; Escape returns to Draw.

Every app has a **Patterns** panel alongside Samples. Send an editable native
sequence to the shared browser library, receive it in another app, or append it
as a GALLEY note clip. Map voices explicitly when instruments differ. Portable
pattern JSON carries notes between devices and standalone HTML files. Imported
parts retain their exact timing, durations, velocity, and probability. Choose
**Use native sequence** in an instrument to return to its own sequencer.

GALLEY supplies a shared musical clock. Live instrument patterns follow its tempo,
position, and loops; pattern changes enter at the next bar or loop boundary. Seeks cancel pending
notes and restore held notes at the new position. Standalone apps keep independent
transport controls.

**Print** turns a note clip into audio while saving its complete native patch,
samples, voice mapping, and pattern. **Edit source** reopens that patch and its
notes; **Update audio** replaces the source while preserving placement, trims,
gain, fades, and track effects. **Restore notes** makes the part editable again.
After revising the instrument’s own sequencer, choose **Use instrument pattern**
to copy that sequence into the source notes before updating.
These sources travel inside projects and participate in Undo/Redo. A printed
clip’s audio remains available while its source is being revised.

Arrange clips by moving, trimming, splitting, duplicating, reversing, or looping
them. Source trim, gain, fades, and speed are nondestructive. Speed also changes
pitch. Snap and zoom make precise edits easier; the clip inspector offers
numeric timing controls. Loop phase survives splitting and left trimming.
Audio imports and explicitly enabled microphone input can provide material too.

### Audio interface and latency

Open **Audio settings** to choose the input interface, Input 1, Input 2, or
stereo input, the output device where supported, sample rate, and latency mode.
Use **Live** for playing through effects, **Balanced** for a larger browser
buffer request, or **Stable** when the device needs more margin. Auto sample
rate lets the browser choose the device rate; explicit 44.1, 48, and 96 kHz
requests are available. The panel shows the actual rate and processing path,
along with the input and output delays reported by the browser. Unknown values
stay unknown; the monitoring total is an estimate, not a loopback measurement.

The preferred AudioWorklet path processes 128-frame blocks: about 2.7 ms at
48 kHz. If it is unavailable, the fallback requests 256 frames in Live mode,
512 in Balanced, or 1,024 in Stable. These are browser buffer requests, not
controls for an ASIO/Core Audio driver. The interface's own buffer settings and
the browser's capture/output buffers still determine achievable latency.
Capture requests disable echo cancellation, noise suppression, and automatic
gain control so guitar and vocal input retain their original signal.

Device settings belong to this browser and are kept outside projects. Applying
them pauses playback and monitoring; sample-rate or latency-mode changes restart
the audio engine and reconnect hosted instruments while preserving the session.
Changes are blocked during a take, pending microphone permission, and exports.
Use **Refresh devices** to reveal interface names after permission.

**Play through BROILER** starts monitoring on the selected track and adds an amp
to an empty insert if needed. An existing BROILER keeps its sound; a full rack is
left intact. Choose the correct input channel for the plugged-in guitar or mic.
This shortcut works with the transport stopped, and recordings still stay dry.

### Monitoring and recording alignment

Open **Microphone & interface · monitoring & timing** below the transport. Select a track
and press **Monitor microphone** to hear the input through its four inserts,
level, pan, mute/solo, and master, including while playback is stopped. Input trim
and the input meter help set the level. Use headphones to prevent speaker feedback.
Monitoring starts off and is never saved as enabled in a project.

The monitor route stays on its displayed track when you select another channel.
**Move monitoring to track…** moves it explicitly. Select **Microphone → selected
track** under Record from, then Record. A monitored take must use that same
track. Recordings capture the input after its trim and before the DAW effects;
the inserts process it once when played back. **Finish take** retains monitoring
if you enabled it. Pause, Stop, Panic, switching Record from back to instruments,
opening a project, and leaving the page turn it off and release the microphone.
Turning monitoring off during a take leaves the dry recording running.

**Recording alignment** has three modes. Auto estimates input, output, and
processing delay using the timing available from the browser, plus your extra
trim. Unreported device delays are clearly identified. Manual uses only your
signed offset; Off leaves timing unchanged. Positive milliseconds move the take
earlier; negative milliseconds move it later. The range is −500 to +500 ms for
manual offset and extra trim. Settings lock while a take is preparing, recording,
or finishing, so its gain and timing remain consistent. Delay compensation keeps
the intended length, count-in, and punch boundaries, including a short finishing
capture when needed. Auto is an estimate: fine-tune the offset by ear for your
interface. Recording alignment does not remove live monitoring delay.

Each of the eight tracks has level, pan, mute, solo, and exactly four serial
effects slots. Effects can be edited, bypassed, reordered, reset, or removed.
Recordings capture live track input before the DAW inserts. Play existing clips
while recording a new performance, then shape the recorded part afterward.

The bundled starter session contains actual rendered DICER percussion, SKEWER
strings, and STEAM clouds, with matching instrument states. The other tracks are
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
inside each app; automation currently covers the GALLEY mixer and insert effects.
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
mixer settings and insert effects stay in GALLEY. Existing receiving audio or
synthesis layers require the replacement checkbox. Empty tracks load the chosen
instrument and replace its chosen starter destination.

| Destination | Limit | Interpretation |
| --- | --- | --- |
| STOCK | 120 seconds | New or existing stereo sample zone; up to 64 zones |
| HOTPLATE | 2 seconds | One of 24 mono granular layers |
| REDUCE | 10 seconds | One of four mono source exciters |
| ROTISSERIE | 30 seconds | One of four stereo tape decks |
| DICER | 20 seconds | Stereo sample and sixteen slices |
| STEAM | 20 seconds | Audio analysis into an editable spectral score |
| BATTER | 120 seconds | One of twelve stereo drum sample lanes |

Loaded future instruments with `audioImport` are included automatically; their
number or string destination IDs and declared limits are preserved. The original
clip remains in the arrangement. The receiving instrument keeps unrelated
sounds, patterns, mixer, and effects. Imports persist in its native snapshot;
transfer Undo/Redo restores the previous instrument audio.

The **Samples** panel shares the same local library as all standalone Kitchen
apps and hosted editors. Render the selected clip, arranged mix, or track
instrument; save audio to the library or download WAV/portable packets. Receive a
sample as a new clip on any of the eight tracks. Hosted instrument project storage
stays isolated, while its sample library is deliberately shared with the studio.
Downloaded HTML includes all exchange code and works offline. If browser storage
is unavailable, keep a WAV or packet for the next session.

## Ten effects

| Effect | Processing |
| --- | --- |
| MANDOLINE | Three EQ bands and a resonant filter |
| BUTTER | Stereo-linked compressor with a soft knee |
| CHAR | Saturation, diode distortion, or wavefolding |
| DOUBLE | Stereo chorus and flanging |
| LEFTOVERS | Tempo-synced or free ping-pong echo |
| HOOD | Eight-line algorithmic reverb |
| PROOF | Windowed, phase-aligned pitch shifting |
| WHISK | Tempo-locked rhythmic gating and auto-pan |
| BROILER | Bass and guitar amp heads, power-stage dynamics, speaker cabinets, microphone position, and protected clean lows |
| GLAZE | Vocal cleanup, de-essing, compression, tone, saturation, pitch correction/shifting, harmonies, doubling, vowel filters, vocoder, echo, reverb, and rhythmic chopping |

BROILER contains nine bass models: the original clean solid-state, flip-top,
valve stack, modern grind, and doom fuzz, plus four characters inspired by the
Ampeg B-15 Portaflex, classic SVT, V-4B, and SVT-PRO. These additional models use
distinct gain staging, tone shaping, power curves, and sag response. American
clean, British crunch, and high-gain guitar models remain available.
Its four control groups follow the signal: input/preamp, low end
and tone, power/dynamics, then cabinet/output. Clean low blend protects the
fundamental under heavy drive; its crossover sets the clean band's edge. Tone,
presence, depth, power drive, sag, gate threshold/release, speaker breakup,
microphone position/distance, cabinet air, and output are independently adjustable.
Eleven cabinet choices include six bass cabs, three guitar cabs, DI, and an
unlikely steel cupboard. The new bass cabinets are a Portaflex-style 1×15,
sealed 8×10, and ported 4×10. DI disables the cabinet-only controls. Stereo/mono
input options, thirteen complete recipe presets, dry/wet, bypass, and automation
work on clips, instruments, and monitored microphone input. No impulse-response
downloads or network audio are needed.

GLAZE is a complete vocal channel strip occupying one insert. Start with a
recipe and the Essentials view; Full pantry exposes every stage. The signal
passes through input/high-pass/gate, split-band de-essing, compression, tonal EQ,
saturation, optional pitch processing and harmonies, doubling, resonant vowel
filters, robot/vocoder, rhythmic chopping, ducked echo and reverb, then output
and peak protection. Every stage has its own mode or enable control.

The microphone shortcut **Sing through GLAZE** connects the selected input to
the selected track without overwriting an existing strip or occupied rack.
Recorded takes stay dry, so effect settings can change after recording.
Input/output levels, dynamics reduction, detected pitch, and pitch-path timing
come from the actual insert engine. Practical processing has no lookahead
buffer. Optional windowed pitch shifting adds wet-path delay, and pitch
correction also needs time to detect a single voiced note. Choose its key,
scale, speed, and window for the source; it is not a polyphonic note editor.
Vowel controls use resonant filters to change vocal colour. The vocoder uses a
multiband envelope detector and synthesized carrier, not a recorded voice.
GLAZE runs through the same DSP in live monitoring and offline WAV exports.

## Projects, recording, and export

Save project preserves all clips, their portable 16-bit PCM audio, mixer and
effects settings, native instrument states, and uploaded future-app HTML.
Open project restores the session. Undo and Redo preserve editing history;
downloaded projects remain available when browser storage is denied or full.

Mix and track WAV exports render arranged audio and note clips through the same DSP as live
playback, at 48 kHz, 16-bit stereo. Choose a render range and an effect tail;
long feedback tails can continue beyond the chosen render. Progress and Cancel
keep rendering manageable. Native note synthesis is rendered first, then passes
through the studio mixer, automation, and inserts. Live performances outside
note clips should be recorded before exporting.

GALLEY has eight fixed tracks, four slots each, up to 64 bars, and up to 128 clips
per track. Each imported or recorded source holds up to 120 seconds. The source
audio budget is 64 MB of PCM; native app snapshots and saved sources share a
separate 96 MB budget. A pattern can hold 4,096 notes, 64 voices, and 256 beats.
Printing a single source is limited to 120 seconds; split longer parts or loop a
shorter note clip. Note clips can fill the full arrangement.
Microphone monitoring is optional and starts only after permission is granted.
Panic stops the studio and instruments, cancels pending audio, clears effect
buffers, discards unfinished takes, and releases microphone tracks.

## Hosting and source

[HOSTING.md](HOSTING.md) documents the MusicLabHost v1 bridge for future apps.
Hosted apps keep their original interfaces. Their live AudioContexts share GALLEY’s
clock and route into their assigned track; offline app renderers keep their own
OfflineAudioContexts. App storage is isolated from standalone saved projects.

Run `python3 loom/build.py` from the repository root to build `loom/index.html`
and `music/loom/LOOM-source.zip`. Run `npm run music:sync` to refresh the copies in
`public/music/` and `docs/music/`. GitHub Pages publishes `docs/`.

Run `npm run check:loom` for the dependency-free Node engine checks. These verify
project compatibility, automation in playback and export, sample-exact
count-in/punch recording, and cropped stereo transfers with clip edits and limits.
From an extracted archive, run `node checks.cjs`.
Run `npm run check:loom-amp`, `npm run check:loom-vocal`, and `npm run check:loom-mic` for BROILER, GLAZE, and
microphone timing/routing checks. The extracted equivalents are
`node amp-checks.cjs`, `node vocal-checks.cjs`, and `node microphone-engine-checks.cjs`.
`npm run check:loom-vocal-browser` verifies real GLAZE monitoring, dry takes,
exports, actual insert meters, presets, and responsive vocal controls with
Playwright and Chromium; the extracted command is `node vocal-browser-checks.cjs`.
`npm run check:loom-mic-browser` uses Playwright and Chromium to verify actual
microphone monitoring, permission cleanup, dry recording, amp exports, and
responsive controls. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` when using
an existing installation; extracted sources include `microphone-browser-checks.cjs`.
Run `npm run check:loom-interface` and `npm run check:loom-interface-browser`
for device/profile negotiation, input channel routing, restart/permission
cleanup, recording guards, the settings dialog, and BROILER practice setup.
The extracted equivalents are `node audio-interface-checks.cjs` and
`node audio-interface-browser-checks.cjs`. Hardware round-trip latency depends
on the actual interface, driver and browser and is not measured by these tests.
Run `npm run check:patterns` and `npm run check:loom-notes` for portable-pattern
and reversible-source checks. Extracted archives include `note-checks.cjs`.
Run `npm run check:loom-batter` for recorded drum playback, shared-clock timing,
clip transfers, source revision, offline sample restoration, and shared-library
exports through the actual embedded BATTER editor. The extracted equivalent is
`node batter-integration-checks.cjs`, with Playwright and Chromium available.

From an extracted source archive, run `python3 build.py` in its directory. The
archive includes all eleven standalone instrument pages in
`instruments/`, complete GALLEY sources, fonts, and demo audio. Individual app
source projects are available from Kitchen.

Bundled Noto fonts are copyright Google, licensed under the SIL Open Font
License 1.1; see `fonts/LICENSE.txt`. Instrument pages retain their embedded
font license notices. Version 1.9.0.

## Compatibility

The Kitchen rebrand changes display names and visual styling. Existing URLs, the `.loom.json` project format, `loom-*` browser storage, native instrument IDs, host APIs, effect IDs, and source archive paths stay compatible with earlier releases. GALLEY projects contain the same eight tracks and four effects slots per track.
