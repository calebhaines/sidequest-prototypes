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
