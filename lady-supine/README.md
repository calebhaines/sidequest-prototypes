# Lady Supine: Entering the Unenterable Entrance

A browser adventure in the Land of Limited Time. A gate declines to open, a ruler declines to finish her rhymes, and three very ordinary friends refuse to be ordinary to you.

## Play locally

```sh
npm install
npm run dev
```

Open the address printed by Vite. For a production build, run `npm run build`; `npm run preview` serves that build.

## The adventure

Six story acts connect 90 dialogue scenes, six substantial investigations, 52 interactive puzzles, and three endings. The standard campaign is paced for approximately five hours: a route-based audit estimates **4¾–6¼ hours**, with a central estimate around **5½ hours**. The mandatory route contains about 22,000 player-readable words, 36 multi-step investigation challenges, and 16 shorter story puzzles. This is a content-based estimate rather than a timed human playtest; hints and faster reading shorten the journey.

Your borrowed time changes with decisions. It never ticks down while you read. If your balance reaches zero, the Hospital for Those Out of Time gives you a way to continue. Your journal keeps past conversations, your pockets describe found objects, and the map opens as you find new roads. Revisiting people unlocks new conversations after important discoveries.

Progress saves automatically in local browser storage, including every casebook answer, route, lamp, rearranged card, and hint. Close a casebook and reopen it to continue where you stopped. Completed cases can be reread in the journal. Settings can export and import a JSON save. Ambient sound starts only when enabled. Keyboard shortcuts: **M** for the map, **J** for the journal, **I** for pockets, **H** for guidance, and **Escape** to close a panel. Larger reading text and reduced-motion support are included.

The six investigations recover a missing afternoon in the Library, expose artificial scarcity in the Fields, identify the people erased from Supine's art, preserve a hospital patient's identity, relieve the castle's constant observation, and reconcile the final shared account. Each discovery matters to the next part of the story; the main route cannot bypass them.

## Replace the temporary art

The SVG scenery in `public/art` is original, editable placeholder artwork. Scene art uses a **1400 × 700** viewBox; character portraits use square canvases. Replace the same named assets to update the game's look without changing its content. See [the art guide](public/art/README.md).

## Extend the world

- `src/data/campaign.ts`: locations, dialogue, choice effects, inventory, acts, and objectives.
- `src/data/game.ts`: save format, initial state, and requirement helpers.
- `src/App.tsx`: story transitions, navigation, journal, settings, and the time economy.
- `src/components/PuzzleModal.tsx`: sixteen distinct puzzle types, progressive hints, and assisted solutions.
- `src/data/investigations*.ts`: six linked casefiles, evidence, independently verified solutions, and story gates.
- `src/components/InvestigationModal.tsx`: logic ledgers, ciphers, balanced accounts, chronology, constrained routes, and linked lamp boards, with persistent progress.
- `src/styles`: responsive presentation and puzzle styles.

The game is entirely client-side and requires no account, server, or API key.

## Verification

`npm run build` type-checks and builds the game. `npm run test:campaign` validates narrative links, enforces all six investigations, and replays routes to every ending. `npm run test:pacing` verifies all 36 investigation solutions, independently checks clue consistency, and regenerates [the pacing report](scripts/pacing-report.json).

With the dev server running, `npm run test:puzzles`, `npm run test:investigations`, `npm run test:browser`, and `npm run test:story` check all 52 puzzle solutions, save/resume behavior, responsive layouts, and a complete story playthrough in Chromium. These scripts use `/usr/bin/chromium`; change the executable path to use a different local installation.
