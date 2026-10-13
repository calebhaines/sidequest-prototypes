# Lady Supine: Entering the Unenterable Entrance

A freely walkable, hand-drawn browser adventure in the Land of Limited Time. Its trailer homes are patched with tarpaulin and rejected signs. Its ruler is a living woman with a large head and an opening in the top. The world, dialogue, borrowed time, inventory, maps, puzzles, and menus all live inside one gameplay window.

## Play locally

```sh
npm install
npm run dev
```

Open the address printed by Vite. For a production build, run `npm run build`; `npm run preview` serves that build.

## The adventure

Six story acts connect 90 dialogue scenes, six substantial investigations, 52 interactive puzzles, and three endings. The campaign targets approximately five hours. After the expanded narrative rewrite, a route-based audit estimates **5.1–6.7 hours**, with a central estimate of **5.9 hours**. The mandatory route contains about 27,000 player-readable words, 36 multi-step investigation challenges, and 16 shorter story puzzles. This is a content-based estimate rather than a timed human playtest; hints and faster reading shorten the journey.

Explore twelve connected regions and nine enterable interiors on foot. Gather timber, stone, herbs, iron, and curly willow; catch fish at the lake; cook restorative food; craft and place lights, hearths, benches, work tables, and saplings. Aristobats patrol the countryside, hear careless footsteps, and steal borrowed time. A willow cane, quieter movement, and a few kind meals help you survive. Three friends can travel with you as your relationships grow.

Your borrowed time changes with decisions, active travel, and Aristobat encounters. It rests while you read or open any menu. If your balance or health reaches zero, the Hospital for Those Out of Time gives you a way to continue. The map reveals explored ground and sets walking destinations; it does not teleport you. Story handoffs lead to physical characters and machines in the world.

Progress saves automatically in local browser storage, including your position, supplies, placed objects, explored ground, and every casebook answer. Earlier narrative saves migrate into the walkable world. Close a casebook and reopen it to continue where you stopped. Completed cases can be reread in the journal. Settings can export and import a JSON save. Ambient sound starts only when enabled. Reduced motion, world zoom, fullscreen, and touch controls are included.

Move with **WASD or arrows**, run with **Shift**, and move quietly with **C**. **E** speaks, gathers small resources, opens doors, or interacts. **Click or Space** uses the selected tool; **1–8** selects the hotbar. **M** opens the map, **I/Tab** the inventory, **B** crafting, **J** the journal, and **Escape** the pause menu. Select the fishing rod, cast toward water, and reel when the float dips. Place crafted comforts with a click. Phones and tablets have a movement stick and action buttons.

The six investigations recover a missing afternoon in the Library, expose artificial scarcity in the Fields, identify the people erased from Supine's art, preserve a hospital patient's identity, relieve the castle's constant observation, and reconcile the final shared account. Each discovery matters to the next part of the story; the main route cannot bypass them.

## Replace the temporary art

The characters, scenery, portraits, icons, and map use original marker-style drawing: uneven ink contours, overlapping pigment, stained paper, patched trailers, and muted colours. There is no pixel art or nearest-neighbour rendering. `src/openworld/sprites.ts` draws the characters, matching portraits, and inventory objects; `src/openworld/renderer.ts` draws organic terrain, architecture, weather, and lights. Both can be replaced without changing the story or saved progress. See [the art guide](public/art/README.md).

The visual references are Philip Guston’s heavy, awkward bodies, Cy Twombly’s nervous scrawls and rubbed-out marks, and Paul Klee’s fragile geometry and muted colour. The setting should look repaired repeatedly under deprivation, never like a tidy fantasy village.

Supine has an oversized human head with an uncovered opening. The God Switch performs a visible physical exchange: Ada’s brain enters Supine’s head, and Supine’s brain occupies Ada’s body. That occupied body travels with the player until Dr. Anima restores Ada and confines Supine’s brain in glass. The procedure plays inside the world, can be skipped, and never charges extra borrowed time. Existing journals update to the revised prose when loaded.

## Extend the world

- `src/data/campaign.ts`: locations, dialogue, choice effects, inventory, acts, and objectives.
- `src/data/game.ts`: save format, initial state, and requirement helpers.
- `src/OpenWorldGame.tsx`: in-game interface, physical story handoffs, investigation gates, and saves.
- `src/openworld/world.ts`: connected terrain, interiors, NPCs, resources, and landmarks.
- `src/openworld/engine.ts`: movement, collision, tools, combat, fishing, building, companions, and world persistence.
- `src/openworld/story.ts`: conversations and progression attached to physical world stations.
- `src/openworld/items.ts`: supplies, tools, food, and crafting recipes.
- `src/openworld/mindExchange.ts`: the two physical organs travelling between heads and the hospital return procedure.
- `src/components/PuzzleModal.tsx`: sixteen distinct puzzle types, progressive hints, and assisted solutions.
- `src/data/investigations*.ts`: six linked casefiles, evidence, independently verified solutions, and story gates.
- `src/components/InvestigationModal.tsx`: logic ledgers, ciphers, balanced accounts, chronology, constrained routes, and linked lamp boards, with persistent progress.
- `src/styles`: responsive presentation and puzzle styles.

The game is entirely client-side and requires no account, server, or API key.

## Verification

`npm run build` type-checks and builds the game. `npm run test:campaign` validates narrative links, enforces all six investigations, and replays routes to every ending. `npm run test:pacing` verifies all 36 investigation solutions, independently checks clue consistency, and regenerates [the pacing report](scripts/pacing-report.json). `test:marker` checks smooth rendering, both physical brain procedures, the occupied companion body, and restoration. `test:marker-viewports` checks every menu at four desktop and mobile sizes.

`npm run test:layout` audits physical navigation through all twelve regions and nine interiors. With the dev server running, `npm run test:browser` checks movement, world interactions, inventory, maps, saves, migration, and touch controls. `npm run test:widgets` checks all 52 puzzle solutions and saved casebook inputs inside the gameplay window. `test:case-save`, `test:quests`, and `test:waypoints` check the controller’s saved investigations, physical resource requirements, permits, castle access, and room destinations on global maps. `test:production` checks a built game at a nested URL; set `GAME_URL` to its served address. These scripts use `/usr/bin/chromium`; change the executable path to use a different local installation. The older narrative-page browser scripts are retained as historical checks and are superseded by the open-world checks.
