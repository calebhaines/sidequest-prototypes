# CITRUS

CITRUS is Kitchen’s monophonic acid-bass instrument, informed by the Roland
TB-303 circuit. Saw and square oscillation feed a nonlinear diode-ladder model,
with separate amplifier/filter contours, accent memory and outgoing slides.
This is an original numerical interpretation, without measured calibration to
a particular physical unit or any claim of a perfect hardware match.

## Play and write

The main knobs are Tuning, Cutoff, Resonance, Envelope, Decay, Accent and Volume.
Choose Saw or Square, then play the keyboard or press Play. Eight independent
patterns retain sixteen stored steps each; their active length can be 1–16.
Each step has a pitch, rest, accent and slide. The optional chain plays up to
eight entries, with one to eight repeats per entry. The maximum chain is 256
beats. Sound recipes change the synthesis patch while preserving the part.

Slide belongs to the note that leads into the next note. It holds the gate to
that boundary, glides into the next pitch and keeps the envelope connected.
The stock slide is an exponential control-voltage transition with a 22 ms time
constant, independent of tempo. Normal native notes use an approximately 55%
gate; slides use the full step. A rest interrupts the connection. The last step
can slide into the first step when the part loops. Deep controls expose slide
time, filter drive and component variation as explicit software adjustments.

Accent affects filter and amplifier behavior rather than simply multiplying
the final output. Consecutive accents can build retained sweep charge. The
original circuit’s different normal/accent decay paths, nonlinear feedback and
unequal ladder stages inform the model. High and Eco are explicit processing
choices; no automatic quality reduction is applied while playing.

## GALLEY and sharing

Samples exports the current part, selected pattern, complete chain or one note
as a stereo WAV, or saves it in Kitchen’s shared audio library. Renders are
limited to 120 seconds including their selected release tail, with a 64 MiB
decoded stereo budget. Patterns exports editable exact notes. Native accent
and outgoing slide travel as optional boolean `note.accent` and
`note.slide`, so they survive GALLEY’s piano roll, live notes,
source-aware printing and project files. Other instruments can ignore these
articulation fields while preserving their timing and pitches.

Received monophonic parts remain exact, including off-grid positions and
variable note lengths. They appear as a received part until you choose the
native step patterns. Ordinary incoming notes retain their supplied gate
duration; native articulation flags request the 303 gate behavior. Where an
explicit accent flag is absent, velocities of 0.85 or more request accent.
Simultaneous chords are rejected with a useful message; overlapping notes use
monophonic last-note priority. Held keyboard notes have a bounded return stack.

The complete editor, sound engine and exchange work inside GALLEY and offline.
Live Worklet playback, the real ScriptProcessor fallback and offline renders
use the same sample-frame scheduler and synthesis. Notes retain oscillator,
filter and envelope history across connected steps. Stop cancels the native
sequence; Panic clears every source. Host cancellation remains source scoped.

## Circuit references and limits

- [Roland TB-303 Service Notes](https://archive.org/download/synthmanual-roland-tb-303-service-notes/rolandtb-303servicenotes.pdf): original schematic/service documentation.
- [Robin Whittle’s Devil Fish manual](https://www.firstpr.com.au/rwi/dfish/Devil-Fish-Manual.pdf): first-hand circuit documentation clearly distinguishing the stock instrument from modifications. The stock slide DAC resistance and C35 give approximately 100 kΩ × 0.22 µF = 22 ms.
- [Whittle’s unique-characteristics analysis](https://www.firstpr.com.au/rwi/dfish/303-unique.html): accent sweep charge, resonance-dependent lag and interacting envelopes.
- [Tim Stinchcombe’s diode-ladder analysis](https://www.timstinchcombe.co.uk/index.php?pge=diode): four unequal interacting stages, including the bottom capacitor’s different value. A generic three-pole “18 dB” cascade does not describe this circuit accurately.

Only original software, recipes and factual paraphrases are distributed. No
factory firmware, commercial emulator code, manufacturer artwork or manual scans
are included. Roland and TB-303 identify the reference instrument and imply no
affiliation. Component tolerances, control laws, oscillator shape, amplitude and
distortion still need physical-unit calibration. The older Whittle slide-timing
page carries a correction caveat; its exact clock-pulse gate ratio is not treated
as verified measurement. The 55% native gate is an explicit approximation.

## Build and checks

Python 3’s standard library builds a complete offline HTML and editable source:

```sh
python3 citrus/build.py
node citrus/checks.cjs
```

An extracted archive can rebuild with `python3 build.py --output CITRUS.html`.
The source archive includes DSP, scheduler, schema, recipes, interface, adapters
and the shared exchange sources. Rebuild GALLEY after the standalone instrument.
