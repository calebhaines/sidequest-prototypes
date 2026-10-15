# PICNIC

PICNIC is Kitchen's six-part sampled village ensemble: a little piano by the
window, plucked chords, a walking bass, hand percussion, neighbor voices and
sparkling accents. Its factory palette comes from the supplied **Animal Crossing:
City Folk** SoundFont archive, with original sample tuning, velocity/key regions,
loops and envelopes preserved. See [SAMPLES.md](SAMPLES.md) for the exact sources,
curation and reproducible extraction process.

The standalone HTML contains its sounds, artwork, code and Kitchen exchange.
It needs no server, account, sample download or external font after saving.

## Make a little place

Choose a key, scale, hour, season and weather, then compose an editable picnic.
The composition tools make new note patterns using gentle extended harmony,
melody and response, bass, percussion and optional neighbor voices. Choose your
own sounds from the searchable library; presets retain their source-bank names.

Six parts each have an independent note row. A–D store four patterns with 16 or
32 steps. Page 17–32 edits the second half without widening the score; shortening
a pattern retains its inactive notes. Chain banks for a longer arrangement.
Select a step to edit notes, velocity, gate, chance, ratchets and microtiming.
Chord steps can contain several notes. Swing and seeded probability use the same
event realization in live playback and offline exports.

The sound and mixer controls offer per-part level, pan, transpose, envelope,
filter, mute/solo and reverb/delay sends. The sampled percussion kit maps genuine
conga, djembe and taiko sounds to notes 36–45; the library records each source.
Use the keyboard or on-screen piano to audition the selected part.

Save/Open keeps the complete editable project. Undo/Redo and local recovery help
retain edits. Export WAV prints the actual sampled ensemble in stereo. Kitchen's
Samples and Patterns buttons share audio and editable notes with other instruments.
Received patterns preserve their exact timing and voice mapping; sound edits keep
them intact, while editing the native sequence returns to native patterns.

## GALLEY

Load PICNIC from Kitchen's instrument chooser. Its six note voices are `melody`,
`chords`, `bass`, `drums`, `neighbors` and `texture`. Live note playback uses
GALLEY's shared musical clock and track routing without running a second native
sequencer. Snapshots keep the entire project by stable factory preset IDs.
Print, Edit source and Update audio use the same isolated native sampler graph.
The instrument never needs to retrieve its samples from the room again.

Realtime playback has a fixed 32-voice limit and lazy sample decoding. Muted parts
do not schedule voices. Reverb and delay are shared sends. Performance depends
on device, browser, polyphony and the chosen sounds; browser checks record the
measured six-part CPU cost rather than assume all devices behave alike.
See [PERFORMANCE.md](PERFORMANCE.md) for the measured scenario and its limits.

## Build and verify

Python 3's standard library builds from the checked-in assets:

```sh
python3 picnic/build.py
python3 loom/build.py
npm run music:sync
```

From the editable source ZIP, run `python3 build.py` in `PICNIC-source` to make
the same standalone. `--output PATH --archive PATH` builds isolated previews.
The original ZIP is needed only to regenerate the prepared factory assets.

```sh
node picnic/sequence-checks.cjs
node picnic/browser-checks.cjs
node picnic/integration-checks.cjs
```

Browser checks require Playwright and Chromium; set `PLAYWRIGHT_MODULE` and
`CHROMIUM_PATH` to existing installations when needed. They exercise the real
standalone and GALLEY, portable projects, patterns, responsive controls and audio.
The GALLEY integration check needs the checkout's built `loom/index.html`, or
`PICNIC_HOST_QA_URL` pointing to a PICNIC-enabled GALLEY.

## Roll back

`kitchen-before-picnic-20261015` marks the published Kitchen immediately before
PICNIC, including the ROUX navigation fix. Revert the PICNIC release commit to
remove the instrument without undoing that fix; rebuilding older source from
the tag provides the exact prior standalone and source archives.

The release is tagged `kitchen-picnic-v1`; `git revert kitchen-picnic-v1` applies
that rollback as a new commit while retaining later history.
