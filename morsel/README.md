# MORSEL

**A mouthful of melody.** A four-voice word and sound instrument for Kitchen.

Live: https://calebhaines.github.io/sidequest-prototypes/music/morsel/

Choose Alto, Tenor, Bass or Robot, type a word, and play the keyboard. Each voice
has its own vocal character. MORSEL uses synthetic English pronunciation; it
does not need a microphone, an account or an internet connection.

## Make a phrase

1. Enter a short sentence and choose **Distribute words**.
2. Select a step to change its word, note, voice, velocity or length.
3. Press Play. Try a factory recipe or change the default voice to hear another
   reading of the same melody.

The keyboard plays the current word across two octaves. Quick sounds provide
vowels and consonants for singing, humming and rhythmic textures. The tone, air,
vibrato, space and volume knobs shape the result. Keep enough time between notes
for longer words; a short note can intentionally turn a word into a vocal chop.

Save/Open project includes the phrase, melody, all voice choices and sound
settings. Undo/Redo and browser recovery help preserve edits. Audio and note
exports use the same prepared synthesis as playback. The shared Samples and
Patterns panels move sounds and editable phrases between Kitchen apps.

## GALLEY

MORSEL is bundled into GALLEY 1.20 as its fifteenth native instrument. Piano-roll
notes retain an optional `lyric` string and select Alto, Tenor, Bass or Robot as
their voice. Notes without a lyric use MORSEL's current keyboard word.

Native patterns include per-note lyrics, pitches, timing and voice identities.
Patterns are prepared asynchronously before transport starts, then scheduled at
the shared AudioContext clock without waiting for word generation. Cancellation
can address one note source without silencing independent voices. Stop, seek and
Panic invalidate pending work. Print preserves the complete patch and words for
Edit source, Update audio and Restore notes.

The instrument supports notes C2–C6 and up to 64 distinct voice/utterance pairs
in a prepared pattern. Repeated words share a cache. Pronunciation runs in a
dedicated local worker; musical note playback stays on Web Audio's clock.

## Editable offline build

Run `python3 build.py` in this directory. Python 3's standard library is the only
build dependency. It regenerates the local speech assets and produces one
self-contained `index.html`. The HTML contains the speech engine, English data,
interface, artwork and shared Kitchen panels. It makes no runtime downloads.

`python3 build.py --output /path/MORSEL.html --archive /path/MORSEL-source.zip`
builds isolated outputs. In the repository, the default editable archive is
`music/morsel/MORSEL-source.zip`. To publish, rebuild MORSEL, then
`python3 loom/build.py` and `npm run build` from the repository root.

The source archive includes the instrument sources, shared exchange code,
vendored speech engine and its upstream source distributions. It can rebuild
the offline HTML without downloading dependencies.

## Speech engine and licensing

MORSEL incorporates meSpeak.js and eSpeak, with English pronunciation data.
The integrated instrument is distributed under GNU GPL version 3; the full
license is in [vendor/COPYING](vendor/COPYING) and embedded in the offline HTML.
See the vendor notices for upstream versions, source provenance and build
instructions. Complete corresponding sources accompany the editable download.
The speech audio is synthesized locally, not recorded from or modeled after
named individual speakers. Kitchen's bundled fonts retain their included
SIL Open Font License notices.

The rest of Kitchen and the GALLEY host remain separately distributed programs;
their existing licenses and interfaces are unchanged.
