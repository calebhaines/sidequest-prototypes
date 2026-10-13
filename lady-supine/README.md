# Lady Supine: Entering the Unenterable Entrance

A freely walkable, torn-paper browser adventure in the Land of Limited Time. Its trailer homes are patched with tarpaulin and rejected signs. Its ruler is a living woman with a large head and an opening in the top. The world, dialogue, borrowed time, inventory, maps, puzzles, and menus all live inside one gameplay window.

## Download and play offline

[Play the game](https://calebhaines.github.io/sidequest-prototypes/lady-supine/) and select **Download game (.html)** on the title screen or in Settings. The download is one `Lady-Supine.html` file; open it in a modern browser to play without an internet connection, installation, or local server. Its game code, art, fonts, puzzles, and sound are all included.

To carry an existing journey between the website and a downloaded copy, use **Settings → Export save**, then **Settings → Import save** in the other copy. Each browser keeps its own progress; keep an exported save before moving or replacing the HTML file.

## Play locally

```sh
npm install
npm run dev
```

Open the address printed by Vite. For a production build, run `npm run build`; `npm run preview` serves that build.

The production build also creates `dist/lady-supine.html`. Use `npm run build:single` to rebuild just that file, or `node scripts/build-single-html.mjs path/to/game.html` to choose its filename. The single-file build embeds the locally cached fonts and their licenses from `public/fonts`; it needs no network access once dependencies are installed. The normal website assets remain available alongside the download.

## The adventure

Six story acts connect 90 dialogue scenes, six substantial investigations, 52 interactive puzzles, and three endings. The campaign targets approximately five hours. After the expanded narrative rewrite, a route-based audit estimates **5.1–6.7 hours**, with a central estimate of **5.9 hours**. The mandatory route contains about 27,000 player-readable words, 36 multi-step investigation challenges, and 16 shorter story puzzles. This is a content-based estimate rather than a timed human playtest; hints and faster reading shorten the journey.

Explore twelve connected regions and nine enterable interiors on foot. Gather timber, stone, herbs, iron, and curly willow; catch fish at the lake; cook restorative food; craft and place lights, hearths, benches, work tables, and saplings. Aristobats patrol the countryside, hear careless footsteps, and steal borrowed time. A willow cane, quieter movement, and a few kind meals help you survive. Three friends can travel with you as your relationships grow.

Your borrowed time changes with decisions, active travel, and Aristobat encounters. It rests while you read or open any menu. If your balance or health reaches zero, the Hospital for Those Out of Time gives you a way to continue. The map reveals explored ground and sets walking destinations; it does not teleport you. Story handoffs lead to physical characters and machines in the world.

Progress saves automatically in local browser storage, including your position, supplies, placed objects, explored ground, and every casebook answer. Earlier narrative saves migrate into the walkable world. Close a casebook and reopen it to continue where you stopped. Completed cases can be reread in the journal. Settings can export and import a JSON save. Ambient sound starts only when enabled. Reduced motion, world zoom, fullscreen, and touch controls are included.

Move with **WASD or arrows**, run with **Shift**, and move quietly with **C**. **E** speaks, gathers small resources, opens doors, or interacts. **Click or Space** uses the selected tool; **1–8** selects the hotbar. **M** opens the map, **I/Tab** the inventory, **B** crafting, **J** the journal, and **Escape** the pause menu. Select the fishing rod, cast toward water, and reel when the float dips. Place crafted comforts with a click. Phones and tablets have a movement stick and action buttons.

The six investigations recover a missing afternoon in the Library, expose artificial scarcity in the Fields, identify the people erased from Supine's art, preserve a hospital patient's identity, relieve the castle's constant observation, and reconcile the final shared account. Each discovery matters to the next part of the story; the main route cannot bypass them.

## Replace the temporary art

[Compare ten exploratory art directions](https://calebhaines.github.io/sidequest-prototypes/lady-supine/style-studies/). Each sheet includes characters, a settlement exterior, two interiors, and outdoor assets, with original PNG downloads. **Direction 03, Torn paper, is now implemented in the playable game.**

The characters, scenery, portraits, icons, map, menus, and puzzle boards closely follow the selected torn-paper study: faceted adult faces, ragged pale fibers, flat overlapping scraps, and visibly pasted repairs. Five native transparent sheets supply all 18 faces, articulated clothing and wings, patched trailers, willow, furniture, the brain machine, and Supine's billboard. Their unmodified PNGs live in `src/assets/torn-paper`; `src/openworld/paperAssets.ts` loads them before the world starts and draws their separate parts. `src/openworld/paper.ts` supplies matching cached grain and torn silhouettes for the world and map; CSS paper textures and `PaperMotif.tsx` carry the material into menus and puzzle diagrams.

All authored paints use a shared set of **24 pigments** in `src/openworld/palette.ts` and `src/styles/palette.css`. The native sheets follow the same base-pigment direction; paper texture, transparency, and smooth edges naturally blend those pigments. There is no pixel art or nearest-neighbour rendering. `src/openworld/sprites.ts` draws the jointed figures, portraits, and inventory objects; `src/openworld/renderer.ts` draws terrain, architecture, weather, and lights. Both can be replaced without changing the story or saved progress. The map includes an informational floor plan while indoors. See [the art guide](public/art/README.md) and [the 24-colour swatches](public/art/palette-24.svg).

The visual references are Philip Guston’s heavy, awkward bodies, Cy Twombly’s nervous scrawls and rubbed-out marks, and Paul Klee’s fragile geometry and muted colour. The setting should look repaired repeatedly under deprivation, never like a tidy fantasy village.

Animation follows the weight of these drawings: planted steps, different running and sneaking postures, delayed hands and lanterns, tired glances, and individual ears, tails, and wings. Trees have rooted trunks, bending branch joints, independently moving canopy fragments, and trailing willow strands. Wind pulls at laundry, tarps, reeds, and crops. Smoke, fire, water, and fishing tackle move in layers. Tools have a wind-up and follow-through; struck resources react, harvested objects fall or crumble, and new constructions settle. Supine’s billboard image performs a slow kiss. The God Switch procedure builds pressure, extracts the organs, transfers them, and seats them in the receiving head or jar. Reduced motion attenuates decoration and interface transitions while retaining clear action feedback.

Large and high-density desktop displays use a bounded world canvas resolution with smooth image filtering. Interface text and controls retain the browser's display resolution. Visible terrain and scenery remain cached within memory budgets, including wide and zoomed-out views. Simulation follows elapsed time while painting is limited to 60 frames per second; 120 Hz and 240 Hz monitors therefore preserve the same movement speed and borrowed-time accounting. Paused scenes repaint when their appearance changes, and the God Switch procedure continues to animate while its story clock rests.

Supine is beautiful and terrifying: a poised adult face and graceful figure beneath an immense human head with an uncovered opening. The God Switch performs a visible physical exchange: Ada’s brain enters Supine’s head, and Supine’s brain occupies Ada’s body. That occupied body travels with the player until Dr. Anima restores Ada and confines Supine’s brain in glass. The procedure plays inside the world, can be skipped, and never charges extra borrowed time. Existing journals update to the revised prose when loaded.

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

`npm run test:paper` verifies the five native transparent sheets, all 30 cutouts and 18 character faces, jointed poses and blinking, physical skull openings, stateful portraits, and desktop/mobile room-map navigation. The decoded native art remains bounded to 36 MiB. `test:abstract` checks the 24 authored pigment bases and actual visible tree motion with fixed rooted bark, without relying on the old marker drawing paths.

`npm run build` type-checks and builds the game. `npm run test:campaign` validates narrative links, enforces all six investigations, and replays routes to every ending. `npm run test:pacing` verifies all 36 investigation solutions, independently checks clue consistency, and regenerates [the pacing report](scripts/pacing-report.json). `test:marker` checks smooth rendering, both physical brain procedures, the occupied companion body, and restoration. `test:marker-viewports` checks every menu at four desktop and mobile sizes. `test:animations` checks visible movement, frozen menus, distinct movement paces, real resource and fishing rewards during animations, construction, manual reduced motion, and procedure timing. `test:abstract` audits all 24 authored pigment bases, proves independent tree and branch motion with planted roots, and checks reduced motion and responsive presentation.

`npm run test:layout` audits physical navigation through all twelve regions and nine interiors. With the dev server running, `npm run test:browser` checks movement, world interactions, inventory, maps, saves, migration, and touch controls. `npm run test:widgets` checks all 52 challenge interfaces, assisted story-puzzle completion, direct caseboard solutions, and saved casebook inputs inside the gameplay window. `test:case-save`, `test:quests`, and `test:waypoints` check the controller’s saved investigations, physical resource requirements, permits, castle access, and room destinations on global maps. `test:production` checks a built game at a nested URL; set `GAME_URL` to its served address. These scripts use `/usr/bin/chromium`; change the executable path to use a different local installation. The older narrative-page browser scripts are retained as historical checks and are superseded by the open-world checks.

`npm run test:single` copies only the generated HTML into an isolated folder, opens it with internet access disabled, checks movement, puzzles, investigations, audio, responsive menus, and persistent progress, and verifies both website download buttons and save transfer. Set `GAME_URL` to a served production build and `BROWSER_TYPE=firefox` to use Playwright Firefox; install that test browser with `npx playwright install firefox` if needed. `HTML_FILE` selects a different generated file. The default transport opens the actual local `file://` document.

Run `npm run test:performance` alone with the development server running to compare desktop and mobile world rendering, including high-density displays, while checking movement, paused time, saves, and actual tree motion. Set `PERFORMANCE_MATRIX=targeted` to include 4K and zoomed-out desktop views, and `REFRESH_CHECK=1 ASSERT_DRAW_CAP=1` to verify simulation timing and bounded painting from 59.94 through 240 Hz, including timestamp variation. `ASSERT_TERRAIN_REUSE=1 ASSERT_PIXEL_BUDGET=1 ASSERT_STATIC_PAUSE=1` also check warm terrain reuse, bounded canvases, and paused-frame invalidation. The [torn-paper performance report](scripts/torn-paper-performance-report.json) records 24 current rendering cases, regression checks, and exact contour comparisons. The [earlier desktop comparison](scripts/desktop-performance-report.json) documents the original engine fixes and refresh-rate tests. These comparative frame costs on the test machine do not guarantee a particular frame rate on every device.
