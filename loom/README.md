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
Existing app builds remain unchanged. Their live AudioContexts share LOOM’s
clock and route into their assigned track; offline app renderers keep their own
OfflineAudioContexts. App storage is isolated from standalone saved projects.

Run `python3 loom/build.py` from the repository root to build `loom/index.html`
and `music/loom/LOOM-source.zip`. Run `npm run music:sync` to refresh the copies in
`public/music/` and `docs/music/`. GitHub Pages publishes `docs/`.

From an extracted source archive, run `python3 build.py` in its directory. The
archive includes the eight original standalone instrument pages in
`instruments/`, complete LOOM sources, fonts, and demo audio. Individual app
source projects are available from Music Lab.

Bundled Noto fonts are copyright Google, licensed under the SIL Open Font
License 1.1; see `fonts/LICENSE.txt`. Instrument pages retain their embedded
font license notices. Version 1.0.0.
