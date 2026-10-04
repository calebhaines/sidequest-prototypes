# Sidequest

**Six RPG worlds, eight browser-playable versions.** Velvet Static and Hidden Ember now have 3D counterparts alongside their existing pixel-art versions. The four earlier prototypes remain available.

[Play the gallery](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0) · [Velvet Static 3D](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-lynch-3d) · [Hidden Ember 3D](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-shinobi-3d)

## Download and play

Download [**sidequest-prototypes.zip**](https://raw.githubusercontent.com/calebhaines/sidequest-prototypes/v0.6.0/docs/sidequest-prototypes.zip), extract it, and open **sidequest/PLAY.html** in your browser. For a single file, save [**sidequest-play.html**](https://raw.githubusercontent.com/calebhaines/sidequest-prototypes/v0.6.0/docs/sidequest-play.html) and open the saved HTML. These downloads are fixed to **v0.6.0**.

All eight versions, artwork, 3D code, previews, and fonts are bundled for offline play. No account, installation, or server is needed. The 3D versions require a browser with WebGL enabled. Three.js is included locally; playing does not download libraries or models from other sites.

## The two 3D finalists

[**Velvet Static 3D**](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-lynch-3d) turns its Lynch-inspired county mystery into a world of shaded buildings, solid characters, pine forests, a red-curtain theater, paper mill, observatory, railway, and ferry. Cross between waking and dreaming to investigate contradictory accounts.

[**Hidden Ember 3D**](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-shinobi-3d) brings its original Naruto-inspired shinobi adventure into orange-roofed villages, cedar forests, training grounds, clan outposts, and waterfall country. Use kunai, chakra techniques, conversations, and competing loyalties to pursue the stolen scroll.

Both use real 3D geometry and a perspective camera with orbit and zoom. Their existing quests, conversations, remembered choices, real-time combat, loot, levels, side stories, travel stops, and three endings carry over through the shared gameplay engine.

Each finalist has a **4800 × 3456 simulation map**, **14 characters**, **six main objectives**, **three side stories**, and **six travel stops**. All enclosed buildings are enterable in 2D and 3D: **31 interiors** in Velvet Static and **25** in Hidden Ember. Explore furnished rooms, inspect objects, and find residents and clues inside. Velvet Static's dream crossings extend indoors.

These are playable concept adventures for developing a larger RPG. Gameplay starts fresh when you reopen a version.

## All playable versions

- **Velvet Static:** [3D](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-lynch-3d) · [2D](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-lynch) — an uncanny county, investigation, and waking/dream crossings.
- **Hidden Ember:** [3D](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-shinobi-3d) · [2D](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-shinobi) — hidden shinobi villages, jutsus, and clan loyalties.
- [**Moss & Myth**](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-moss) — woodland fantasy and forgotten magic.
- [**Neon Afterglow**](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-neon) — cyberpunk streets and a stolen signal.
- [**The Dustlands**](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-dust) — desert salvage and a town's water crisis.
- [**Borrowed Sky**](https://calebhaines.github.io/sidequest-prototypes/?v=0.6.0#play-odd) — surreal suburbs and a missing Thursday.

## Controls

**WASD / arrows** move; **Shift** sprints; **E / Enter** talks, inspects, enters doors, or leaves through an indoor exit; **Space** attacks; **M** opens the map; **T** opens discovered travel stops in the finalists; **Escape** closes dialogue or the map, or returns to the gallery. Touch controls and clickable abilities are available. Ambient sound is optional.

In 3D, **drag** the game view to orbit and **scroll** to zoom. On-screen camera buttons also rotate, zoom, and reset the view. Movement follows the current camera direction; reset restores the initial north-facing view.

**Velvet Static:** Q crosses between waking and dream, including indoors; Space flashes the camera. **Hidden Ember:** 1 Ember Release, 2 Shadow Clone, 3 Substitution; Space throws kunai. Chakra regenerates. Ask Sora about the watchtower passphrase for a peaceful route.

Use E at a marked doorstep to enter, and E at the indoor exit to leave. **M** shows the outdoor map with your location at the doorway; **Room floor plan** shows the furnished room and exit. **T** can travel from a room to a discovered outdoor stop. Accept side stories in conversations and track them from the sidebar. Progress and dialogue choices carry through entrances, exits, dream crossings, and travel during an adventure.

## Source and credits

The ZIP contains the standalone player, production website, and complete editable source in **sidequest/source/**. That folder's README includes development instructions.

World design, pixel artwork, and 3D models are original. Three.js is bundled under the MIT License, with its license text included in **source/public/licenses/three-MIT.txt** and **website/licenses/three-MIT.txt** inside the ZIP. DM Sans and Space Grotesk are bundled under the SIL Open Font License 1.1; font notices are included in **sidequest/source/public/fonts/** and **sidequest/website/fonts/**.
