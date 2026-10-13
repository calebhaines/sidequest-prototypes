# Replaceable torn-paper artwork

The playable game's art closely follows [direction 03, Torn paper](../style-studies/03-torn-paper.png): faceted adult faces, flat overlapping scraps, exposed pale fibers, muted paper stock, and visibly pasted repairs. Characters, portraits, buildings, trees, water, furniture, tools, map, menus, and puzzle diagrams share this material.

Five native transparent sheets in `src/assets/torn-paper/` have three columns and two rows of 512-pixel cells:

| Sheet | Top row | Bottom row |
| --- | --- | --- |
| `heads.png` | Supine, Ada, Aristobat | Player, moth, ox |
| `heads-residents.png` | Gatekeeper, tortoise, otter | Deer, mole, peacock |
| `heads-residents-two.png` | Boar, mouse, fox | Heron, merchant, salamander |
| `scenery.png` | Trailer, willow, cot | Shelves, brain machine, billboard |
| `parts.png` | Supine's gown, Ada's coat, worker coat | Arm, bat wing, moth wing |

`study.png` preserves the selected reference for the title artwork. All PNGs retain their native source pixels. `src/openworld/paperAssets.ts` measures transparent margins once and draws the cutouts smoothly; it never rewrites the images. Assets finish loading before the world and its caches are created. Vite packages the same images into the website and embeds them in the single-file offline game.

`src/openworld/paper.ts` supplies cached fine grain, ragged silhouettes, exposed fibers, overlap seams, and small pasted shadows. Its material cache is bounded to 4.5 MiB. `sprites.ts` articulates the native head, clothing, arm, and wing pieces at separate joints. `renderer.ts` combines native scenery with original cut-paper terrain, civic facades, fixtures, resources, and effects; terrain/object caches remain bounded by bytes and retain the desktop pixel budget and drawing cap.

The 24 authored base pigments remain in `src/openworld/palette.ts` and `src/styles/palette.css`; [the swatch sheet](palette-24.svg) gives their names and values. The generated sheets follow that palette direction. Paper texture, transparency, and smooth edges naturally blend the pigments. The active game uses no pixel art or nearest-neighbor rendering.

Buildings should remain materially poor and repeatedly repaired: old trailers, salvaged tin, cinderblocks, taped plastic windows, tarpaulin lean-tos and improvised cable. Avoid turning the setting into a cozy village or ornate fantasy town. Lady Supine is a living human woman with a disproportionately large head and an uncovered opening in its top. She must be beautiful as well as terrifying: an elegant adult face, composed posture and unnervingly steady eyes beneath the immense open skull. Preserve that anatomy and contrast in replacement character illustrations and portraits.

`registerSpriteSheet(kind, source, options)` can register replacement animated artwork. Four directional rows represent down, left, right and up. `frameWidth`, `frameHeight`, and optional `feetX`/`feetY` place the character's feet in the world. Use a Vite asset import for portable URLs and offline embedding.

`actorHeadAnchor(kind)` identifies the physical opening used by the brain-exchange animation: Ada's crown is at y -48, and Supine's opening at x -0.7, y -53, in drawing coordinates relative to the feet. `playerToolPose(...)` locates the moving right palm and forearm so tools remain attached through a strike. Replacement art must preserve or update those anchors. The God Switch moves two actual organs; a generic thought symbol is not a replacement for the procedure.

The drawing API accepts optional animation state for walking pace, action recovery, hurt, individual phase offsets, billboard gestures, and reduced motion. Painted body parts remain cached while joints and secondary details move continuously. Tree trunks keep their feet planted while branch joints bend and separate canopy fragments and willow strands respond to visible gusts. Gameplay impact events drive resource recoil, falling harvested objects, construction settling, and item gestures; they are transient and never alter saved progress. Preserve those connections when replacing illustrations.

Earlier SVG scenery is retained as historical reference. The live favicon is built from the native torn-paper Supine portrait after loading. Door artwork agrees with the central interaction point, foliage fades around the player, and the map shows an informational floor plan while indoors.
