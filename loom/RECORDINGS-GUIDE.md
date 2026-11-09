# Recordings and project space

Open **Recordings** beside **Save** and **Open** in GALLEY. It lists all recorded
and imported source audio in the project, plus temporary frozen audio grouped by
track. Instrument-internal sample libraries remain in each instrument editor.

Search by name, filter by use or frozen audio, and sort by size, duration or name.
Each item shows its duration, sample rate, storage and clip usage. Selecting a
recording shows a waveform; Play previews the full original source, without the
clip’s trimming, fades or track effects. Stop, changing selection and closing the
browser release the private preview audio context. Browsing does not start audio
processing. Download WAV preserves the source recording’s stored Int16 samples.
Use GALLEY’s normal export for a complete frozen track and its routing.

## Permanently remove audio

Select one or more items and choose Delete selected. Delete unused selects audio
that has no current clip or frozen-track reference. Review the affected clips,
tracks and audio payload before confirming. Cancel leaves the project unchanged.

- Deleting a source recording removes every clip that refers to it, across all
  tracks. Any affected frozen track is unfrozen and its unneeded render chunks
  are removed. Its other clips, notes, instruments, effects and automation remain.
- Releasing a frozen render unfreezes its whole track. Its original recordings,
  clips and effect settings remain editable. Individual chunks stay grouped to
  keep the track coherent; audio shared by another frozen track is retained.
- Unselected unused recordings remain available in the current session. Normal
  Save already omits unused source audio and orphan frozen caches, so deleting
  those items frees loaded audio without an additional saving in the next file.

Permanent deletion stops playback and clears Undo/Redo, browser recovery of the
old session and relevant render caches. The action cannot be undone. The browser
shows the consequences before committing; downloading a source WAV first keeps a
separate copy. Recording, saving, rendering and other active audio operations must
finish before deletion. Current instrument settings are captured before the
project’s audio graph is reset.

**Save the project again after deleting.** GALLEY downloads a new project file;
it does not modify an earlier project or WAV already saved on your device. Those
older copies must be removed through your device’s file manager if desired.
Shared Kitchen samples and other projects are independent of this browser.

## Capacity and file size

Portable `.loom.json` files can now be up to **448 MiB** (469,762,048 bytes).
Opening and saving count actual UTF-8 bytes, including Unicode names and settings.
Older projects still open normally. As of GALLEY 1.42.4, recordings and imports
can use up to **256 MiB of source PCM**, replacing the old 64 MiB cap. Sources
and frozen renders share a **256 MiB total PCM pool**; frozen renders also retain
their individual 192 MiB cap. This keeps the original combined audio allowance
while allowing unused freeze capacity to hold more recordings. The instrument,
note and saved-source snapshot allowance remains 96 MiB. Individual source clips
still retain up to two minutes, with unchanged timing, sample precision and effects.

Recording, audio imports, instrument prints, SERVICE generated audio and freezes
all check the same remaining shared space. The engine also caps simultaneous
recordings to the available space across every armed track, finishing before that
space is exceeded. Recordings shows the source space available after frozen audio
is counted. At full capacity, open Recordings to review unused takes or release
frozen renders; no recording is deleted automatically. Deleting a timeline clip
alone keeps its original audio in Recordings until it is explicitly removed.

Audio is stored inside JSON as base64, which adds about one third to its raw
size. The browser also keeps decoded audio and temporary working copies. A
project’s disk size therefore understates its memory use; available capacity
still depends on the browser and device. The new cap stays below common desktop
JavaScript single-string limits. Much larger portable files would need a chunked
or binary container rather than a higher JSON cap alone.

Displayed audio savings refer to the encoded audio payload, not an exact total
file size: clip metadata, settings, Unicode and pruning also contribute. Frozen
send feeds count toward storage even though the browser previews the main track.

## Checks

`npm run check:recordings` runs UTF-8 boundary and deletion-model checks.
`npm run check:source-capacity-large` checks a real source-only project above
the old 64 MiB cap, including exact PCM and stereo endpoint preservation.
`npm run check:recording-capacity-browser` checks actual microphone recording
in a project above 64 MiB, Save/Open, and a full-budget rejection without accessing
the microphone or changing existing audio.
`npm run check:project-capacity-large` performs an optional real project
round-trip above the former 256 MiB limit; run it without other memory-heavy work.
`RECORDINGS_QA_BUILT=1 npm run check:recordings-browser` checks the packaged app’s
real controls, audible previews, WAV downloads, deletion, save/open and responsive
layout. Rebuild with `python3 loom/build.py` before the packaged browser check.
