# PICNIC factory recordings

PICNIC plays recordings extracted from the supplied **Animal Crossing: City
Folk** SoundFont collection. The game and its original audio are Nintendo's;
the generic SoundFont headers do not identify the bank converter. The supplied
archive does not include a separate license file. These recordings are not
original Kitchen synthesis recipes. No official artwork or game logos are
included in PICNIC.

Source archive: `Animal_Crossing_City_Folk.zip`, 62,435,310 bytes.

SHA-256:
`0e3cb4214ec373548b2fcc625aa01d60fd76f2b363064b1df38197a3cbbbf7d2`

The original archive stays outside the site repository. Normal PICNIC builds
use the checked-in `assets/manifest.js` and `assets/samples.js`; rebuilding its
standalone HTML or extracted editable source ZIP needs no original archive,
network request, audio converter, or installed audio library.

## Included selection

The source contains 278 SoundFonts, 1,366 presets, 2,012 sample headers and
3,560 instrument regions. Exact duplicate waveforms account for much of the
repeated source material. Including every unique source recording would require
49.7 MB of base64 before mapping data and the interface, beyond GALLEY's 32 MiB
hosted-instrument limit.

PICNIC includes **189 source banks**, covering every named `MELODY_INST` bank,
all 89 villager melody banks, all 75 numbered song palettes, and the five town
daytime/morning/night/midnight/first-arrival banks. Café, Able Sisters and the
small town chime bank complete the selection. The 89 omitted banks include
additional event, holiday, television, shop and other alternate collections.
`assets/provenance.json` lists every omitted filename and every original bank's
SHA-256, including omitted banks.

The selection's **611 source presets** reduce to **523 distinct playable
mappings**. An additional authored percussion kit gives **524 choices**. All
source-program aliases remain available in `presetAliases`, `banks`, and each
retained preset's `aliases`; equivalent presets share an audible mapping instead
of occupying duplicate browser entries. Names such as Grand piano, Ukulele and
Cello follow the named source filenames. Unknown song parts are labelled by
their source palette and voice number rather than guessed instrument names.
Villager F/M suffixes and unidentified special-character codes remain visible.

**436 unique mono recordings** occupy 14,218,016 bytes of PCM16. The generated
mapping and sample scripts together occupy about 19.5 MB. AudioBuffers are
decoded only when needed; the complete collection is not decoded at startup.

## Playback mapping

The pipeline preserves source sample boundaries, sample rates, key and velocity
ranges, sample root notes and pitch correction, amplitude attenuation, pan,
amplitude attack/decay/sustain/release, and loop boundaries/modes. Timecents become
seconds; centibels become linear gain; no loudness normalization is applied.
Adjacent key ranges merge only when every other playback field agrees.

All source samples are mono. Generator and modulator analysis found no custom
modulators or source filter generators. All present sample modes are 0 (no loop)
or 1 (loop through the release envelope); the manifest format also represents
SoundFont mode 3 (loop until release). Original preset reverb-send values remain
as metadata; PICNIC's own shared effects are controlled by its mixer.

The collection contains 6 kHz source audio, below Web Audio's standard sample-rate
minimum. One unique recording in this selection is therefore converted from
6 kHz to 8 kHz using deterministic integer linear interpolation and PCM16
rounding. Sample duration, pitch, and loop-time positions are preserved to the
nearest output frame. Every other selected waveform retains exact source PCM16
bytes. The transformation and the original waveform hashes are recorded in
`assets/provenance.json`.

## Authored percussion keyboard

The Picnic percussion kit combines ten source one-shots. Each original
recording, envelope, gain and pan is preserved; its root and key range are moved
to the following keys so each strike plays at its source pitch. This keyboard
mapping is authored for PICNIC, rather than presented as an original game kit.

| MIDI pitch | Recording |
| --- | --- |
| 36 | Conga, source voice 1 |
| 37 | Conga, source voice 2 |
| 38 | Conga, source voice 3 |
| 39 | Conga, source voice 4 |
| 40 | Djembe, source voice 1 |
| 41 | Djembe, source voice 2 |
| 42 | Wadaiko, source voice 1 |
| 43 | Wadaiko, source voice 2 |
| 44 | Wadaiko, source voice 3 |
| 45 | Wadaiko, source voice 4 |

`drumNotes` supplies these names to the interface. `sourceMapping` records each
source preset and original root. Five town palettes arrange six preset IDs in
the stable order melody, chords, bass, drums, neighbors, texture. The melodic
parts use their named town bank's authentic mappings; drums, neighbors and
texture use the factory defaults. The composition engine creates original
editable parts; the assets contain no MIDI arrangements or game melodies.

## Reproduce the asset conversion

With Python 3 and the verified original archive:

```sh
python3 picnic/tools/prepare_samples.py \
  --source /path/to/Animal_Crossing_City_Folk.zip
```

Use `--output /tmp/picnic-assets` to prepare an isolated comparison. The converter
checks the exact archive hash, requires flat SF2 members, parses RIFF and
SoundFont tables, validates samples and loops, rejects unsupported generators or
custom modulators, deduplicates waveforms and equivalent presets, and enforces a
23 MiB combined generated-script budget. The output is deterministic and uses
only Python's standard library. The source ZIP is never extracted into the
repository by this tool.
