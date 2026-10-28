# GALLEY

Kitchen’s central production station.

An eight-track browser studio for Kitchen. Eight tracks. One increasingly specific order.

Live: https://calebhaines.github.io/sidequest-prototypes/music/loom/

The standalone `index.html` bundles all fourteen Kitchen instruments,
the studio, effects, fonts, and a playable starter arrangement. Open it in a
modern browser and press Play. Instrument HTML can also be added from a file;
the hosted version can discover and load new instruments from Kitchen.

**ROUX** is the dedicated bass instrument: a circular recipe sequencer combines
relative note movement, rests, accents, and slides with a deep fundamental and
a driven resonant waveguide. Its editor, shared patterns, and native synthesis
are available inside GALLEY alongside the other thirteen instruments.

**BATTER** sequences recorded acoustic drums across twelve lanes and eight
pattern banks. Its embedded starter kit plays offline; additional recorded kits
can be loaded on the site or imported as downloaded bundles. The same editor,
sample editing, shared audio, and drum-note voices are available inside GALLEY.
BATTER 1.1 embeds 148 samples in four recorded starter kits, with two-source A/B
blending and a per-lane tempo-synced or free LFO. Both sources, modulation, and
per-hit blend edits survive project saves and revisable printed clips. Its
Clear pattern action empties only the selected bank and can be undone.

**LEAVEN** is Kitchen’s arpeggiator and five-model 80s-inspired polyphonic synth.
Its eight-chord progression and four sixteen-step banks create evolving phrases;
all sound controls stay visible. DCO, twin VCO, hard sync, four-operator FM and
spectral vector synthesis are available in the same editor. LEAVEN shares realized
notes through Patterns, plays incoming piano-roll notes directly through its synth,
and uses that same engine for live audio and revisable prints. The complete app is
embedded for offline use; the studio retains eight tracks and four inserts per track.

**MARINADE** combines two recorded ingredients into a polyphonic spectral morphing instrument. Its full native editor, two sample-import bays, editable note patterns and isolated native renderer are available inside the studio. Printed parts retain the source audio, patch and original notes for Edit source, Update audio or Restore notes.

**PICNIC** is a six-part sampled village ensemble: melody, chords, bass, drums,
neighbor calls and texture. Choose factory sounds, write A–D 16/32-step patterns,
or compose an editable tune for the hour, season and weather. Its full keyboard,
mixer and sample engine are embedded for offline use. Patterns sends exact notes
between PICNIC and GALLEY; Print keeps the sound patch and part for later edits.
Open it separately at https://calebhaines.github.io/sidequest-prototypes/music/picnic/.

## SERVICE · separate performance desk

Open SERVICE from [Kitchen](https://calebhaines.github.io/sidequest-prototypes/music/loom/#service),
the **Operating notes** dialog, or **Alt + P**. It opens its own full-screen desk;
GALLEY's existing arrangement layout and controls remain unchanged. Closing it
stops the performance and returns to the original arrangement position.

Sixteen scenes each select a clip, silence, or **Hold** for each of the eight
tracks. Hold keeps that track's current source and phase while the others change.
Use **From loop** or **From markers** to build a scene bank, then edit each scene's
source clips. Each source repeats its own length. Scene launches can be immediate
or synchronized to a beat, half bar, bar, two bars, or four bars. The audio engine
applies queued changes at its sample clock; selecting another scene replaces the
pending launch. SERVICE does not automatically change tempo.

Four assignable macros can control track volume, pan, and numeric controls in
the existing four effects slots. Their center position is neutral. Range,
baseline, and direction are editable per mapping. The supplied Pressure, Heat,
Space, and Spread mappings are starting points, using the effects already in
the project. Hold the stutter, fill, or drop pads for momentary changes. Releasing
the pad, closing the desk, or losing focus releases those controls.

Arm **Capture**, then press **Play** to record a new performance from bar one.
Stop to keep the take. **Create arrangement from take** explicitly replaces the
current arrangement with editable clips, scene markers, and control automation
in one undoable step. One **Undo** restores the previous session. Capture keeps
up to 64 bars and 8,192 applied events; a completed capture can be retained while
performance continues. Source note clips use private dry renders of their saved
instrument patches. Captured prints retain their original note sources for
restoring or editing. Very short repeated cuts can become a small dry loop;
effects remain in their slots and are applied once. Captured cut boundaries use
GALLEY's usual short fades.

SERVICE uses saved static mixer and effect settings as its starting point.
Existing arrangement automation is reserved for arrangement playback; it is
neither changed nor played while SERVICE is active. Scenes, macro mappings,
learned MIDI assignments, and the latest stopped take are saved in the normal
GALLEY project. The original clips and assets remain untouched until an explicit
arrangement creation. If a deleted clip or replaced effect invalidates a saved
assignment, its stale reference is removed rather than routed to another sound.

**Enable MIDI** is optional. In a browser supporting Web MIDI, choose **Learn**
for a scene, macro, transport button, or pad and move the desired physical control.
Learn consumes the first message without playing it. MIDI only controls SERVICE
while its desk is open. Note-off, port disconnection, focus loss, and desk closure
release momentary pads. Unsupported browsers retain all on-screen controls.

SERVICE is version 1.0.0; GALLEY is version 1.15.0.

## Making a piece

Select a track, choose an instrument, and open its editor. Its full original
interface plays through that track’s mixer and four effects slots. Editor
audition lets you try sounds; Live makes the app follow the studio transport.
Arm tracks and record their actual output into audio clips. Preparation loads
the instrument’s engine before recording starts.

An armed track with note clips records those written parts. Its native groove
joins them only when **Live** is enabled. An armed track without note clips
records its native instrument performance. Leading rests stay in the take.
SKEWER’s generative pattern exports retain the actual humanized timing of the
captured phrase; its authored pattern banks keep editable probabilities.
The shared clock preserves count-in boundaries, and LEAVEN/MARINADE fallback
rendering uses each browser audio block’s timestamp rather than carrying a
clock lead into new notes. Internal instrument takes use their musical clock;
microphone delay correction applies only to microphone input.

Recorded audio can end while a resonator is still ringing. Repeating a source
or an arrangement loop now joins discontinuous clip audio with a brief correction
before the track inserts. Loop lengths, note timing, source trims, instrument
input, and effect tails retain their original timing; already seamless repeats
keep their waveform. This also applies to existing recorded takes.

CLATTER keeps its six-voice limit per lane when GALLEY schedules notes from saved
settings. Repeated stops preserve an ongoing release instead of restoring its
full volume, and finished instrument nodes are released during long sessions.

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

SIZZLE, CLATTER, HOTPLATE, and BATTER also have compact native pattern chains.
Open **Chain** beside the pattern banks to arrange entries and repeats, then
choose Loop or Once. Per-step sound overrides live in the selected-step editor;
cutoff and the supported sound settings apply to that strike, with an explicit
way to inherit the instrument's normal sound again.

**Patterns → Current sequence** sends the enabled chain or current native
pattern. Explicit pattern and chain choices remain available. Supported sound
overrides travel with each note through the shared library, projects, native
playback, and revisable prints. GALLEY Live follows native Once mode within each
host transport cycle; GALLEY's own arrangement loop remains the outer clock.

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

**Recording alignment** has three modes. Auto estimates input and output delay
using the timing available from the browser, plus your extra trim. The engine's
block size is displayed separately and is not added to the correction: it is
processing granularity, not a separately measured capture delay. Incomplete
estimates and unreported device delays are clearly identified. Manual uses only
your signed offset; Off leaves timing unchanged. Positive milliseconds move new
takes earlier; negative milliseconds move them later. The range is −500 to
+500 ms for manual offset and extra trim.

If a take lands early, use **Take too early? Later by 5 ms**. If it lands late,
use **Take too late? Earlier by 5 ms**. Hold Shift while clicking for a 1 ms
adjustment, or type an exact offset. The buttons change the saved trim, respect
its range, and participate in Undo/Redo. They are disabled when alignment is Off
or a take is preparing, recording, or finishing. Corrections affect new takes;
move an existing clip in the arrangement to adjust that recording.

To fine-tune by ear, play a tight drum pattern or metronome click, record a few
short muted guitar strums against it, and listen back. Adjust Later/Earlier and
repeat with a new take until the attacks sit correctly. Auto is an estimate;
performance timing and your interface's reported delays both affect the result.
The timing readout shows the estimated correction for new takes, or the frozen
correction actually applied while recording. Delay compensation keeps the
intended length, count-in, and punch boundaries, including a short finishing
capture when needed. Recording alignment does not remove live monitoring delay.

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
| BATTER | 120 seconds | A or B source in one of twelve stereo drum sample lanes |
| MARINADE | 20 seconds | A or B source for spectral analysis and morphing |

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

## Fourteen effects

| Effect | Processing |
| --- | --- |
| MANDOLINE | Three EQ bands and a resonant filter |
| BUTTER | Eight classic analog compressor families, the original Clean model, program-dependent timing, colour and stereo linking |
| CHAR | Saturation, diode distortion, or wavefolding |
| DOUBLE | Stereo chorus and flanging |
| LEFTOVERS | Tempo-synced or free ping-pong echo |
| HOOD | Eight-line algorithmic reverb |
| PROOF | Windowed, phase-aligned pitch shifting |
| WHISK | Tempo-locked rhythmic gating and auto-pan |
| BROILER | Bass and guitar amp heads, power-stage dynamics, speaker cabinets, microphone position, and protected clean lows |
| GLAZE | Vocal cleanup, de-essing, compression, tone, saturation, pitch correction/shifting, harmonies, doubling, vowel filters, vocoder, echo, reverb, and rhythmic chopping |
| SCALES | Chromatic tuner, calibration, stereo meters, gain trim, channel routing, width, mono bass, polarity, DC removal, filters, clip guard, and mute |
| STRAINER | Multimode filtering with clean, ladder, diode, and comb resonance; input envelope following, synced modulation, and stereo motion |
| SWIRL | Four-, eight-, or twelve-stage stereo phasing with feedback, envelope movement, and synced or free modulation |
| CRUMBLE | Bit-depth and sample-rate reduction with clock jitter, dither, transient recovery, and output tone |

### BUTTER: classic compression

The existing `velvet` insert now offers the original Clean compressor and eight
analog-inspired models: Seventy-six (1176), Optical 2A (LA-2A), Optical 3A
(LA-3A), Vari 670 (Fairchild 670), Bus 4K (SSL G bus), VCA 160 (dbx 160),
Bus 2500 (API 2500), and Diode 609 (Neve 33609). Their detector, gain law,
release memory and coloration differ in the audio engine. See
[BUTTER-MODELS.md](BUTTER-MODELS.md) for each family's response and controls.

Model selection preserves the knobs. Use classic settings applies that model's
suggested compression/timing character; complete recipes replace the full
compressor settings. Core level and timing controls stay visible, with the
remaining analog and linking options folded away. Classic timing uses the
model's recovery behaviour and disables manual attack/release controls. Manual
timing exposes the chosen base times while retaining the model's detector and
recovery characteristics. Colour is available on analog models; Clean preserves
the original compressor loop. Stereo link blends shared gain reduction with
independent channel detection without summing opposite-polarity inputs.

Input/output and gain-reduction readings come from the actual processing.
Settings, numeric automation and Undo work through the same DSP in live
monitoring, fallback and WAV export. Existing projects inherit Clean and retain
every old setting and sample. The compressor remains one effect in the existing
four-slot track rack. Run `npm run check:compressor` and
`npm run check:compressor-browser`; extracted sources use
`node compressor-checks.cjs`, `node compressor-project-checks.cjs` and
`LOOM_COMPRESSOR_QA_BUILT=1 node compressor-browser-checks.cjs` after rebuilding.

### STRAINER: shape a sound with its own envelope

Choose a resonance circuit and a low-pass, high-pass, band-pass, or notch
response. Clean uses a state-variable filter; Ladder has rounded four-pole
feedback; Diode adds asymmetric bite; Comb places tuned reflections before the
filter. Use 12 or 24 dB/octave response, then set cutoff, resonance, and Input heat.

Raise **Envelope sweep** for an opening wah, or use a negative value for an
inverted sweep. **Full-sweep level** sets the input level that reaches the whole
sweep; lower levels react to quieter playing. Attack and Release control the
follower’s response. Peak follows transients; RMS follows body and sustain.
The detector is stereo-linked and its low cut affects detection only.

The LFO can run freely or follow session tempo, with sine, triangle, rising ramp,
or seeded sample-and-hold movement. Stereo offset moves the right-hand sweep.
Live readings report each cutoff, detector level, and input/output peaks.
Start with a house recipe, then adjust the cutoff and envelope to suit the part.

### SWIRL and CRUMBLE

**SWIRL** makes phase cancellations with four, eight, or twelve all-pass stages.
Stage spread, signed feedback, and cancellation polarity change the character.
A synced/free LFO and a stereo-linked envelope move the sweep independently.
Set LFO sweep to zero for an envelope-only or manually placed phaser.

**CRUMBLE** reduces amplitude precision and sample-clock rate. Clock jitter,
independent stereo clocks, and signal-gated triangular dither add digital texture.
Raw mode deliberately aliases; Soft filters the input before reduction. Recover
attacks brings original transients back in parallel, and the output low-pass
softens the edges. Fractional bit depth supports smooth automated transitions.

All three effects have grouped controls, described recipes, actual DSP meters,
Dry / wet, bypass, and numeric automation targets. They use the same processing
in live monitoring and WAV export; their settings travel in normal projects.

BROILER contains 22 amplifier models, eleven cabinets and four independent pedal
slots inside one insert. Its ten new guitar heads span small tweed and black-panel
American combos, Copper 30 chime, Royal 68 and Iron 800 British stacks, Dual red 92,
Cali IV and Fifty-one high gain, Citrus verb and Jazz 120 clean. The original nine
bass and three guitar characters, their IDs and thirteen original rigs remain.
Model notes identify the real amplifier and pedal families behind the aliases;
see [BROILER-MODELS.md](BROILER-MODELS.md) for the signal models and limitations.

The main amp face keeps gain, tone, dynamics and cabinet choices close. Changing a
head preserves the pedalboard and chosen cabinet; matching a cabinet is explicit.
A whole-rig recipe replaces the complete sound. Four compact pedal cards offer
independent bypass, removal, ordering and routing before the amp or after its
cabinet. Their detail panels contain pedal-specific amount, tone, level and blend
controls. Seven overdrive, distortion, fuzz and boost characters join compression,
wah, chorus, phaser, echo and spring. Switch the head off to keep just pedals and the selected cabinet; DI removes the cabinet too.
All processing stays in the same four-slot GALLEY rack and the same track mixer.
Save rig and Load rig in the Workshop transfer complete sound settings between
sessions without changing other inserts, clips or track automation. Loading a
rig supports Undo and validates the complete file before changing the insert.

The folded Workshop exposes preamp and power valves, tone-stack topology,
coupling/cathode response, bias, supply voltage, negative feedback, transformer
character, power scaling and cabinet mic/cut/resonance controls. Stateful RC,
nonlinear clipping and valve models are used where they help tone and playing
response; this is a reduced-order simulation rather than an exact measured
replica or a general schematic solver. Old stock settings preserve the original
PCM, and old projects inherit disabled pedals and neutral Workshop controls.

Clean low blend protects the fundamental under drive. DI bypasses cabinet-only
controls. Mono/stereo routing, whole-rig dry/wet, bypass, project recovery and
numeric automation work on clips, instruments and monitored input. Microphone
takes remain dry. The same deterministic DSP runs in AudioWorklet, fallback and
WAV export, including pedal tails. All models and assets work offline.

GLAZE is a complete vocal channel strip occupying one insert. Each stage has a plain-language description visible even when switched off, plus an expandable guide explaining its controls and modes. Start with a
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

SCALES is a utility station for tuning and preparing signals. Its chromatic tuner
shows note, octave, frequency and cents, with an adjustable 430–450 Hz concert-A
reference. Guitar, Drop D, four- and five-string bass, and ukulele guides offer
clickable string targets. Auto follows the nearest note or string; a manual target
lets you tune against one fixed note. Play one note at a time. The detector covers
approximately 25–2000 Hz, including the low B of a five-string bass. Auto input
listens to the stronger channel so opposite stereo polarity cannot cancel the
signal being tuned; Left, Right and Mid are available explicitly.

Input/output trim, balance, stereo/mono/left/right/swap/mid/side routing, width,
polarity reversal and optional bass mono prepare the signal. Optional DC removal
and high/low cuts clean it; clip guard limits the final mixed output, and Mute
silences it while the tuner still listens. The defaults pass audio unchanged.
Peak/RMS channel levels, held peaks, clipping indicators, correlation, DC and
crest factor show what the signal is doing. Reset meters clears holds and clipping
without changing sound or adding a project edit. Tuning analysis runs alongside
the signal and adds no audio buffer delay; low bass needs a longer observation
than high notes. These tools are available in every track's normal four-slot rack.

For live tuning, select a track, add SCALES, and choose **Input → SCALES**.
The Audio settings panel uses your selected interface and input channel; its
**Input → SCALES** shortcut starts monitoring while stopped. It reuses an
existing SCALES insert or an empty slot and never replaces an occupied effect.
Enable SCALES Mute for silent tuning; the input meters and tuner keep listening.
Recording captures the dry input so utility settings can be revised afterward.

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
Run `npm run check:broiler`, `npm run check:broiler-browser`, `npm run check:loom-amp`, `npm run check:loom-vocal`, and `npm run check:loom-mic` for BROILER, GLAZE, and
microphone timing/routing checks. The extracted equivalents are
`node amp-checks.cjs`, `node vocal-checks.cjs`, and `node microphone-engine-checks.cjs`.
`npm run check:loom-vocal-browser` verifies real GLAZE monitoring, dry takes,
exports, actual insert meters, presets, and responsive vocal controls with
Playwright and Chromium; the extracted command is `node vocal-browser-checks.cjs`.
Run `npm run check:loom-utility` and `npm run check:loom-utility-integration` for
SCALES pitch detection, transparent audio, routing, meters, live/offline processing,
automation, and microphone recording. `npm run check:loom-utility-browser` verifies
the actual Worklet tuner, interface practice, controls, project restoration, and
phone/desktop layouts. Extracted commands are `node utility-checks.cjs`,
`node utility-integration-checks.cjs`, and `node utility-browser-checks.cjs`.
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
Run `npm run check:loom-navigation` for hosted ROUX section links, keyboard focus,
preserved edits, snapshots, routed audio, and reopening on desktop and phone
layouts. The extracted command is `node host-navigation-checks.cjs` and requires
Playwright and Chromium.

Run `npm run check:loom-filter`, `npm run check:loom-creative`, and
`npm run check:loom-creative-browser` for the new circuits, envelope response,
phase notches, digital reduction, automation, Worklet/fallback processing,
WAV parity, recipes, saved projects, and phone layouts.
`npm run check:loom-tonal-print` checks ten tonal and sample instruments through
source printing, including rests, swing, rate, source trim, and placement.
`npm run check:loom-tonal-clocks` checks actual fallback engine callbacks at
44.1, 48, and 96 kHz and count-in interpolation across render boundaries.
`npm run check:loom-tonal-live` records them through the shared clock in both
audio paths and checks native/arranged switching, count-in, and seeks.
`npm run check:loom-playback` checks audio loop continuity and transfer parity.
`npm run check:loom-playback-browser` checks actual hosted node cleanup, CLATTER
lane limits, and native cancellation envelopes in Chromium.
`npm run check:percussion-integration` checks all four native percussion apps
through GALLEY's actual host, once-mode scheduling, private printing, saved
origins, and arrangement WAV export with per-step sound overrides.

From an extracted source archive, run `python3 build.py` in its directory. The
archive includes all fourteen standalone instrument pages in
`instruments/`, complete GALLEY sources, fonts, and demo audio. Individual app
source projects are available from Kitchen.
The extracted percussion checks are `node percussion-integration-checks.cjs`
and `PERCUSSION_BUILT=1 node shared/percussion-browser-checks.cjs` with Playwright
and Chromium installed.

Bundled Noto fonts are copyright Google, licensed under the SIL Open Font
License 1.1; see `fonts/LICENSE.txt`. Instrument pages retain their embedded
font license notices. Version 1.15.0.

## Compatibility

The Kitchen rebrand changes display names and visual styling. Existing URLs, the `.loom.json` project format, `loom-*` browser storage, native instrument IDs, host APIs, effect IDs, and source archive paths stay compatible with earlier releases. GALLEY projects contain the same eight tracks and four effects slots per track.
