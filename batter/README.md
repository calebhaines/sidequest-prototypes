# BATTER

BATTER is Kitchen's recorded acoustic drum sequencer: twelve lanes, eight pattern banks, and precise control over small, unruly rhythms. Open `index.html` in a browser and press Play. The starter kit is embedded; it does not need a server, a login, or an audio download.

## Sequence

- Twelve acoustic lanes, each with an audition pad, Mute and Solo.
- Eight A–H banks; 16, 32 or 64 steps, displayed in pages of sixteen.
- Pattern chains, global swing, reproducible chance and gentle timing / velocity humanization.
- Independent lane lengths and rotation, Euclidean distribution, seeded mutation, end fills and bank copying.
- Per-hit velocity, probability, timing offset, pitch, natural or explicit beat gate, reverse, flam, ratchets and ratchet decay.
- Cycle conditions, parameter locks (including per-hit A/B blend), protected lanes and protected hits; Undo / Redo.
- Prominent Clear pattern resets all 64 stored hits on every lane of the selected bank, including hidden and protected hits, and clears any exact imported performance. Other banks, lane clocks, sound edits and lane protection remain intact. Undo restores the complete bank.
- Six house recipes: Off the clock, Broken breakfast, House drummer, Slow service, Cutlery shuffle and an empty board.

Click a grid square to add / remove a hit. Shift-click selects it without changing it. Use the arrows to move between pages. Fill mode makes “Fill only” hits eligible; “Outside fill” does the opposite.

## Sample preparation

The selected drum shows its recorded waveform. Drag the trim edges; Start and End also offer precise controls. Pitch, fine tuning, level, pan, reverse, normalization, attack / decay / sustain / release, duration, choke group, high-pass / low-pass filters, resonance, transient / body shaping, saturation, bit reduction, rate reduction, room and echo are available. Each lane can use a single sample, velocity layers, round-robin alternatives, or random variations. Available layers and alternate strikes are genuinely recorded; a single recorded strike does not become a manufactured alternate take.

Change sample opens a searchable cupboard with type, collection, articulation, recording details and license labels. A batch can replace its layer group, append alternate layers, or fill separate lanes. Loading a collection applies its full recorded kit while keeping the rhythm. WAV is decoded directly; other audio formats depend on your browser. Individual files are limited to 120 seconds and the decoded audio cupboard to 64 MB.

## Two sources and one automatic whisk

Each lane can combine main source A with a second source B. The equal-power fader plays A alone at zero, B alone at one, and both at approximately 0.707 gain at the midpoint. Choosing a source can use a single sample or its real recorded dynamic / alternate-strike group. Source B also accepts imported audio and alternate layers. It has independent relative pitch, fine tuning, level, arrival delay (0–1 second), reverse and group-variation mode. Both sources pass through the lane trim, envelope, filter, texture, pan and sends. The source-card play buttons audition A or B alone; the main audition button plays the complete drum. Removing B leaves A intact.

One LFO per lane has sine, triangle, square, saw and seeded random shapes; a free 0.03–30 Hz rate or tempo divisions; phase; depth; and hit-reset or continuous song-clock timing. It can move pitch (up to ±12 semitones), low-pass cutoff (up to ±4 octaves), stereo pan, level / tremolo, or A/B blend. Blend modulation needs source B and Blend on. These changes alter the actual live and exported audio. The defaults leave blending and modulation off, preserving older projects.

## Real recorded samples and credits

The offline starter uses recorded AVL-Drumkits acoustic drums by Glen MacArthur, with SoundFont adaptation by Robin Gareus / x42 contributors. Four starter kits—Iron service, Red service, Late lunch and Pantry percussion—include 148 real recorded samples. The 64 additional Pantry recordings bring cajon, congas, snaps, claps, shakers, tambourine, cowbell, claves, foot stomps, bucket and cymbal / bell recordings, with five selected real dynamic layers where available. The original three starter kits retain their original 84 recordings. Larger optional collections, including hand percussion, can be loaded on the Kitchen site or imported from downloaded JSON bundles. Sample bundles contain the audio, provenance, attribution and source-license metadata.

The AVL source samples use CC BY-SA 3.0 with an explicit exception allowing produced music and other non-sample-library works to be licensed freely. Adapted or redistributed samples and sample libraries retain the source license. An optional Rope tension pack draws from Alexander Holm's Salamander Drumkit. It has true recorded alternate strikes and stereo acoustic recordings, but its plain CC BY-SA 3.0 notice has **no separate produced-music exception**. Its load card explains that distinction before loading. Consult the packaged sample-credit files and original license for redistribution or adaptations.

## Keep, export and share

Save downloads a complete BATTER project with every referenced sample embedded. Open restores it. Autosave stores complete imported and optional sample audio in BATTER’s local IndexedDB database, so a saved kit can recover after reload without a network request. Small starter recipes also have a localStorage fallback. Hosted BATTER instances use their GALLEY project state and do not read or overwrite standalone autosave. The footer confirms when the standalone recipe has saved on this device; download Save for portable backups. If device storage is unavailable or full, the footer asks you to download a copy. Export WAV renders the current pattern or bank chain with a release tail. Export samples creates a portable recorded-sample bundle. Export pattern creates a Kitchen rhythm packet. The Samples and Patterns controls share with Kitchen instruments and GALLEY when browser storage is available. The same standalone file can be hosted as a GALLEY instrument.

Device and interface settings determine actual playback latency. No microphone access is needed by BATTER itself.

## Keyboard

Space plays / pauses; Escape clears sound. Ctrl / Command Z undoes; Ctrl / Command Shift Z redoes. Keys 1–9, 0, minus and equals audition the twelve lanes. A focused waveform accepts left / right arrows for Start, Shift + arrows for End, Home for the original beginning and End for the original ending.

## Build

Run `python build.py` from the extracted source folder, or `python batter/build.py` in the repository. The build embeds the recorded starter manifest, native code, fonts and Kitchen exchange code into `index.html`. The repository build also creates `music/batter/BATTER-source.zip`. Optional online bundles remain separate to keep the HTML comfortably below GALLEY's hosted-instrument file limit; the starter is fully offline and the source archive rebuilds it without the original repository.
