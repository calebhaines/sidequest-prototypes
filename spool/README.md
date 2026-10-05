# SPOOL

A standalone stereo tape-loop playground. Four decks, eight locally generated
tape studies, and a small playable instrument for making your own phrases.

Live: https://calebhaines.github.io/sidequest-prototypes/music/spool/

Open `index.html` in a modern browser and press Play. All code, fonts, artwork
and built-in sounds are embedded. Audio imports, keys, loop editing, project
files and WAV exports work without a connection. Microphone input is optional
and depends on the browser's permissions and support for the current origin.

## Playing

- Each stereo deck has an independent loop region, speed, direction and phase.
  Tape speed also changes pitch. Sync fits the selected region to the chosen
  number of beats; Speed then multiplies that matched rate.
- Select a deck to edit its splice, filters, saturation, wow, flutter, wear,
  hiss and dropouts. Mute and Solo control the mix. A held Brake slows the tape;
  releasing it restores the chosen speeds.
- Import audio into a deck, or play the built-in keys to record a phrase. Audio
  imports retain the first thirty seconds. Mono fills both channels; stereo
  keeps its left and right channels.
- Replace records a new tape. Overdub writes sound onto the current loop at its
  moving playhead; Feedback controls how much of the previous tape survives.
  Keys, microphone, both together, or the other decks can feed a recording.
  Other decks includes the playable keys and excludes the deck receiving the
  take. It records the decks after their tape processing and before the master
  echo and room effects.
- Quantized recording joins the next bar during playback, or starts at the
  first beat when stopped. Choose one, two or four bars, or stop a free take
  manually. Replace takes are limited to thirty seconds; overdub sessions can
  run for two minutes while the stored loop keeps its original length.
- Panic stops transport and input, releases microphone tracks and cancels the
  current take. Stop finishes the current take. Undo restores earlier edits and
  captured loops.
- Save project includes all four tapes. Imported and recorded audio uses a
  portable 16-bit PCM format. Browser storage may be too small for long tapes;
  the downloaded project file preserves the complete session.
- Record mix captures the live stereo output. Mix WAV export renders a fresh
  performance of the current loops and effects; Deck WAV exports the selected
  loop. Offline mix renders use 48 kHz, 16-bit stereo WAV. They do not include
  live microphone input or unfinished recordings.

LOOM can send an edited arrangement clip directly into a chosen deck. The Samples panel also imports samples made by other Music Lab apps into decks A–D. Replacing an occupied deck requires explicit confirmation; Undo restores its previous loop. Shared audio is limited to thirty seconds per deck.

The same panel can share the full deck mix with master effects, one complete selected deck loop with its tape processing, or the selected deck's unprocessed source audio. These choices keep processed loops and original recordings distinct. Rendering snapshots the tapes and settings without stopping playback; finish a take or capture before sharing.

`SpoolApp.exportAudio({scope, bars, tailSeconds, signal})` returns audio without downloading it. `SpoolApp.audioExport` describes the scopes. `SpoolApp.importAudio({pcm, sampleRate, name, options})` accepts interleaved stereo PCM; `options.target` and `options.deck` both select a deck, and `options.replace` authorizes replacement. Import preserves Undo and project saving.
Receiving audio preserves the other decks and current instrument/effect controls.
Replacement is explicit, and the received tape is included in Undo and projects.

## Source and build

`app.html`, `styles.css` and `app.js` define the interface and editing workflow.
`schema.js` defines the portable project format and bounded controls;
`presets.js` contains eight complete patches. The eighth study is deliberately
blank for recording from scratch.

`audio-engine.js` shares one DSP implementation between AudioWorklet playback,
a ScriptProcessor fallback, and offline rendering. It handles interpolated tape
reads, loop splices, stereo filtering, tape motion and coloration, recording
heads, echo, room reflections, DC removal and output limiting.

Run `python3 spool/build.py` from the repository root to build `spool/index.html`
and `music/spool/SPOOL-source.zip`. The source ZIP includes all fonts and their
license. Run `npm run build` to refresh `public/music/` and `docs/music/`.
GitHub Pages publishes `docs/`.

For an extracted source archive, run `python3 build.py` in its directory. The
standalone HTML is written beside the source. No dependency installation is
needed to build or play the instrument.

The bundled Noto font subsets are copyright Google and licensed under the SIL
Open Font License 1.1. See `fonts/LICENSE.txt`.

Version 1.0.0.
