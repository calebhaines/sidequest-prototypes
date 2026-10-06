# Kilter Kitchen rollback

The Kilter Kitchen redesign changes presentation and display copy. Instrument URLs,
browser storage keys, native integration IDs, project formats, shared sample and
pattern formats, and the studio's eight tracks with four effects slots are retained.
Existing projects and browser libraries continue to work in either design.

The complete working site before the redesign is preserved by the annotated Git tag
`pre-kilter-kitchen-2026-10-05`, pointing to commit
`516a75b93640d4c7dd83080e6ce3e663ffe8ee84`.
The redesign is one commit, tagged `kilter-kitchen-v1`.

To restore the previous design while preserving repository history, start from a
clean checkout and run:

```sh
git switch main
git pull --ff-only
git revert --no-edit kilter-kitchen-v1
git push origin main
```

The revert restores maintained sources, bundled standalone HTML, source archives,
and the published `docs/` copies together. GitHub Pages then republishes the previous
design. If later work touches the same files, review any conflicts before committing
the revert. Avoid resetting or force-pushing the main branch.

For an isolated review of the previous site:

```sh
git worktree add ../music-lab-before-kilter pre-kilter-kitchen-2026-10-05
```

The original site description was:

> Browser music instruments, an eight-track studio, and playable RPG experiments. Play online or download standalone HTML.

GitHub repository descriptions are separate from Git history. If a full brand
rollback is wanted, restore that description in the repository settings as well.

The published app URLs intentionally keep their original paths:

| Current name | Stable path |
| --- | --- |
| SIZZLE | `music/grain/` |
| CLATTER | `music/tine/` |
| HOTPLATE | `music/form/` |
| REDUCE | `music/mire/` |
| ROTISSERIE | `music/spool/` |
| STEAM | `music/haze/` |
| SKEWER | `music/bower/` |
| DICER | `music/ravel/` |
| STOCK | `music/fable/` |
| GALLEY | `music/loom/` |

Legacy source archive names and downloaded project extensions also remain compatible.

## Kitchen and ROUX release

The shorter display name and ROUX addition have a separate checkpoint,
`pre-kitchen-roux-2026-10-05`, at the working CLATTER export fix
`786baa8bfbd77bfefcd74949b14525bec853e4fd`. The new release is tagged
`kitchen-roux-v1`. To undo this release while preserving the export fix and
original Kilter Kitchen design, revert only that tag:

```sh
git revert --no-edit kitchen-roux-v1
git push origin main
```

ROUX projects and patterns use their own stable instrument identity; save portable
files before reverting if you want to keep them for a later reinstallation.
The previous nine instruments and their storage formats are unchanged.

## GALLEY microphone and amplifier release

GALLEY 1.7 adds microphone timing compensation, optional live monitoring, and the
BROILER amp and cabinet effect. The previous working site is preserved at
`pre-galley-mic-amp-2026-10-05`, commit
`2d1a25a97465f744b4f8bf05c2fe0d1255a4b091`. The update is tagged
`galley-mic-amp-v1`. To restore GALLEY 1.6 and its matching downloads:

```sh
git revert --no-edit galley-mic-amp-v1
git push origin main
```

Save portable projects before reverting. The older version can retain recorded
audio but does not implement BROILER or the new microphone settings.

## GALLEY audio-interface release

GALLEY 1.8 adds local interface preferences, input-channel selection, latency
profiles, device diagnostics, and the BROILER practice shortcut. The checkpoint
`pre-galley-audio-interface-2026-10-05` preserves commit
`861010c58eb099141b5a6ab1f6dabd1d3e19943f`, including both published songs.
The update is tagged `galley-audio-interface-v1`. To restore GALLEY 1.7 and its
matching downloads while keeping both listening pages:

```sh
git revert --no-edit galley-audio-interface-v1
git push origin main
```

Project data is unchanged by the interface release. Device preferences belong to
the current browser and are ignored by the older version. Review conflicts if
later releases modify the same files.

## BATTER, GLAZE, and bass amplifier release

GALLEY 1.9 adds the GLAZE vocal strip and four additional BROILER bass amp
characters. BATTER adds recorded acoustic drums, sample editing, and intricate
step sequencing to Kitchen and GALLEY. The complete previous site is preserved
at `pre-batter-glaze-2026-10-05`, commit
`73950b20987a5e420188181beaf5bf50203059bc`. The release is tagged
`batter-glaze-v1`. To restore GALLEY 1.8 and the previous equipment list:

```sh
git revert --no-edit batter-glaze-v1
git push origin main
```

Save portable projects before reverting. Older GALLEY versions cannot restore
GLAZE inserts or BATTER instruments. Both published songs remain available.
Review conflicts if later work changes these files.

## BATTER blending, modulation, and expanded starter release

BATTER 1.1 adds 148 embedded samples, a fourth recorded starter kit, two-source
A/B blending, a per-lane LFO, and an undoable Clear pattern action. GALLEY 1.10
includes the updated instrument and clear GLAZE stage/control explanations.
The checkpoint `pre-batter-blend-lfo-2026-10-05` preserves commit
`992ecf47ecabb414583f1c250bb46451c797f987`. The update is tagged
`batter-blend-lfo-v1`. To restore the previous apps and matching downloads:

```sh
git revert --no-edit batter-blend-lfo-v1
git push origin main
```

Save portable projects before reverting. Earlier BATTER versions cannot reproduce
B-layer blends or LFO motion. Existing sample IDs, twelve musical voices, eight
GALLEY tracks, four insert slots, shared libraries, and both published songs are
preserved. Review conflicts if later updates touch these files.

## SCALES tuner and utility release

GALLEY 1.11 adds SCALES, a utility insert with a chromatic tuner, stereo meters,
gain and routing tools, bass mono, DC removal, filters, clip guard and mute.
The working BATTER 1.1 and GLAZE guide release is preserved at
`pre-galley-scales-2026-10-05`, commit
`ea26055e1f1f222f0699662bfe975f4871126143`. This update is tagged
`galley-scales-v1`. To restore the previous GALLEY and matching downloads:

```sh
git revert --no-edit galley-scales-v1
git push origin main
```

Save portable projects before reverting. Earlier GALLEY versions do not implement
SCALES; they cannot reproduce its processing or tuner settings. Eleven instruments,
BATTER's embedded samples, the other ten inserts, shared libraries, eight tracks,
four slots per track, and both published songs are retained. Review conflicts if
later releases modify the same files.

## HOTPLATE 3 groovebox overhaul

The prior HOTPLATE and the working GALLEY 1.11/SCALES release are preserved at
`pre-hotplate-overhaul-2026-10-05`, commit
`29ba6af6604682e3652317334a03dcaed73cc9f0`. The overhaul release is tagged
`hotplate-overhaul-v1`. To restore the earlier app and matching downloads:

```sh
git revert --no-edit hotplate-overhaul-v1
git push origin main
```

Save portable projects before reverting. HOTPLATE 2 can open the underlying
sounds and boolean grid but cannot reproduce HOTPLATE 3 step details. The new
version keeps FORM's app ID, project format, storage keys, sample exchange, and
old sounds so existing sessions remain usable. GALLEY embeds the updated app;
the other instruments, effects, sample libraries, and published songs remain
unchanged. Review conflicts if later releases touch the same files.

## Additive SIZZLE and Kitchen interface refresh

The previous release is preserved at `pre-kitchen-interface-refresh-2026-10-06`, commit `6cbf913df89980f475faf1063ee2551928b2d799`. This release is tagged `kitchen-interface-refresh-v1`.

For an immediate return to SIZZLE’s earlier interface, open [the preserved SIZZLE 1.1.1 HTML](./grain/previous.html). It is byte-for-byte the checkpoint’s standalone file. Existing SIZZLE sounds, six original presets, project format, browser storage and synthesis remain compatible. The new noise recipes use parameters already supported by the previous engine.

To undo the entire interface release and restore matching standalone downloads and GALLEY’s embedded instruments:

```sh
git revert --no-edit kitchen-interface-refresh-v1
git push origin main
```

The release does not change the other instruments’ sound engines, preset data, recorded libraries or project schemas. HOTPLATE, GALLEY effects and both songs remain intact. Download projects for portable backups, and review conflicts if later commits modify the same files.

## CLATTER’s open interface restored

The follow-up tagged `clatter-open-interface-v1` restores CLATTER’s previous complete sound-design workspace, original control organization and presentation source from `pre-kitchen-interface-refresh-2026-10-06`. It removes the refresh’s extra quick-control row and expandable editor. Synthesis, presets, projects and current shared libraries stay compatible. GALLEY and the offline download include the restored interface; other instruments retain their refreshed interfaces.

To restore the entire pre-refresh release after this follow-up, revert the two releases in reverse order together, then publish the resulting restoration:

```sh
git revert --no-commit clatter-open-interface-v1 kitchen-interface-refresh-v1
git commit -m "Restore the pre-interface-refresh Kitchen release"
git push origin main
```

Review conflicts if subsequent commits alter the same files. The preserved previous SIZZLE page remains available independently of this CLATTER correction.

## LEAVEN arpeggiator instrument

The previous complete Kitchen release, including CLATTER’s restored open interface,
is preserved at `pre-proof-instrument-2026-10-06`, commit
`bc7424d819a7a9e7934ce2a73d0f46a1c6485e46`. The LEAVEN addition is tagged `proof-v1`.
It adds a new instrument and matching GALLEY bundle, landing-page links and downloads;
the existing instruments, their standalone files, sample libraries and songs are retained.

To remove this addition and restore the matching published release:

```sh
git revert --no-edit proof-v1
git push origin main
```

Save portable LEAVEN projects before reverting; the earlier GALLEY does not contain
LEAVEN. Shared samples and patterns remain in browser storage. Review conflicts if
later releases modify these files.
