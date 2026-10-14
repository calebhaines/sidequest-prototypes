# Kitchen pattern sequencing

Optional conventional patterns and 32-step editing, 14 October 2026.

The existing sequencers remain the defaults. ROUX, LEAVEN, SKEWER, STEAM,
and ROTISSERIE also offer **Pattern** / **Step patterns** in a small sequencing
selector. Their A–D pattern banks retain their own notes while switching back
to the original mode. Sound controls and native engines are shared between modes.

| Instrument | Original sequencing | Conventional pattern option | Steps |
| --- | --- | --- | --- |
| SIZZLE | Four drum pattern banks | Existing grid | 16 / 32 |
| HOTPLATE | Drum groove grid | Existing grid | 16 / 32, unchanged |
| CLATTER | Four percussion pattern banks | Existing grid | 16 / 32 |
| REDUCE | Four exciter trigger lanes | Existing grid | 16 / 32 |
| ROTISSERIE | Four continuous tape loops | A–D gated deck patterns | 16 / 32 |
| STEAM | Spectral painting with 32 columns | A–D tuned-band step patterns | 16 / 32 |
| SKEWER | Independent string clocks, directions, and evolution | A–D absolute-note patterns on a common forward clock | Up to 32 |
| DICER | Four slice pattern banks | Existing grid | 16 / 32 per bank |
| STOCK | Note patterns and arpeggiator | Existing grid | 16 / 32 / 64, unchanged |
| ROUX | Relative circular recipes with accent and slide cycles | A–D absolute-note patterns | Up to 32 in both modes |
| BATTER | Eight recorded drum pattern banks | Existing grid | 16 / 32 / 64, unchanged |
| LEAVEN | Chord progression and arpeggiator | A–D absolute-note patterns | Up to 32 in both modes |
| MARINADE | Note patterns | Existing grid | 1–32 |

## Editing

Select a longer length using the existing length control or compact 16/32
selector. The step grids keep sixteen visible positions. The adjacent page
control selects **1–16** or **17–32**, keeping the original step size, inspector,
and layout. Pages do not change automatically while playing.

Shortening a phrase preserves the hidden steps, so lengthening it restores them.
Pattern-bank selection and original-mode data are saved with the native project
and GALLEY instrument snapshot. Undo restores musical edits. Display-page selection
does not change the musical project.

ROUX and LEAVEN's Pattern modes edit absolute note pitches using their existing
step inspector. SKEWER uses its current four string grids and note inspector.
STEAM exposes tuned-band steps; ROTISSERIE exposes gated deck steps, while retaining
their painting and tape controls. All native synthesis, samples, voice limits,
and mixer/effect routes remain in use.

Existing 16-step projects load with their original timing and original sequencing
mode. The new second half starts silent. Imported portable note patterns keep
their exact timing; explicitly selecting or editing a native sequence returns to
that sequence, while changing sound controls preserves the imported part.

## GALLEY and exchange

The adapters export the selected active sequence and its full length, including
steps 17–32. Inactive stored steps do not enter a shortened export. ROUX's explicit
Recipe and Turn export scopes still export its original circular sequence while
Pattern mode is selected.

GALLEY uses its existing native note playback for the new patterns. STEAM and
ROTISSERIE's original modes retain continuous transport following; their step
patterns use the shared discrete-note scheduler. This change does not add the
previously assessed live SERVICE mode: SERVICE continues preparing note sources
as audio before scene playback.

## Verification and rebuilding

Focused checks cover second-half onsets and exported audio, independent banks,
inactive sequence preservation, legacy project migration, imported parts, Undo,
native/WAV/shared export, responsive sixteen-cell layouts, and native Worklet and
fallback playback. Baseline PCM comparisons use the rollback checkpoint. Native
Web Audio comparisons separately report small repeated-render numerical variation;
deterministic DSP comparisons require exact equality.

```sh
npm run check:sequencing
npm run check:sequencing-browser
node scripts/performance-audio-checks.cjs --pcm-only --pure-only --baseline kitchen-before-pattern-sequencing-20261014 --report /tmp/kitchen-sequencing-pcm.json
```

The PCM-only command intentionally skips the old source-hash equality gate because
sequencer source has changed; it still compares the tested original audio patches
against the checkpoint with zero tolerance. The strict source-equality gate remains
the default for the original presentation-only performance audit.

Rebuild affected instruments, then GALLEY, then synchronize Kitchen. Shared
adapters are embedded in all apps, so the published builds and source ZIPs for
the other apps also receive the updated shared code. GitHub Pages publishes `docs/`.

## Rollback

Annotated checkpoint: **`kitchen-before-pattern-sequencing-20261014`**, at
`f8823049ca2a8db7e338891559b6e96d07772611`.

Release tag: **`kitchen-pattern-sequencing-v1`**. The feature is prepared on
**`kitchen-pattern-sequencing-32`** and published as one feature commit. Reverse
that release while retaining Git history:

```sh
git fetch origin --tags
git switch main
git pull --ff-only
git revert kitchen-pattern-sequencing-v1
git push origin main
```

This restores sources, standalone HTML, embedded GALLEY instruments, source
archives, and both site mirrors together. The before-change checkpoint preserves
the exact pre-change repository. Existing downloaded projects remain separate
from the site; save a backup before opening newer pattern data in an older app.
