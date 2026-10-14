# Replaceable photographic collage artwork

The playable game follows [direction 30, Hard-cut color specimens](../style-studies/30-hard-cut-color-specimens.png): actual photographic fragments, rounded scissor-cut edges, thin cream rims, and muted olive mounts. World, characters, portraits, tools, map, menus, and puzzle boards share that material. Broad surfaces are quiet olive mounting stock with restrained terrain contours. Intact photographic figures and objects lead the composition; gravel, metal and velvet must not become large repeated background fields.

Fourteen native 1536×1024 atlases in `src/assets/photo-collage/` have three columns and two rows of 512-pixel cells:

| Sheet | Top row | Bottom row |
| --- | --- | --- |
| `heads.png` | Supine, Ada, Aristobat | Player, moth, ox |
| `heads-residents.png` | Gatekeeper, tortoise, otter | Deer, mole, peacock |
| `heads-residents-two.png` | Boar, mouse, fox | Heron, merchant, salamander |
| `heads-rear.png` | Supine rear, dark curls, Ada rear | Gray, red, mottled rear hair |
| `parts.png` | Yellow raincoat, blue coat, beige coat | Arm, bat wing, moth wing |
| `parts-extra.png` | Boot, trouser leg, yellow glove | Hare ears, fox tail, tortoise shell |
| `scenery.png` | Cream caravan, willow, porcelain seat | Hanging books, brain machine, billboard |
| `world-props.png` | Blue caravan, bare tree, rock | Iron ore, herbs/reeds, workbench |
| `interiors.png` | Civic greenhouse, telescreen, desk | Round stools, crate, old pantry cabinet |
| `tools.png` | Cane, axe, pick | Fishing rod, lantern, soup |
| `supplies.png` | Timber, stone, ore | Herbs, fish, curly willow |
| `special.png` | Brain, key, hourglass | Photo coupon, sapling, campfire |
| `puzzle-props.png` | Museum crown, bowl, scales | Chime, mirror, curtain |
| `materials.png` | Olive mount, gravel, rusty metal | Wood, water, grass |

Cutout atlases retain native transparency; material cells are opaque photographs. `study.png` preserves the selected reference byte for byte. Source PNGs are never rewritten or filtered. `paperAssets.ts` measures transparent margins once, crops specimens at runtime, and finishes loading before world caches are created. Vite packages the same originals into the website and downloadable HTML. The fifteen loaded native images use 90 MiB of decoded pixels.

`paper.ts` supplies cached photographic material tiles, smooth scissor-cut silhouettes, cream rims, and small pasted shadows. The material tile cache is bounded to 4.5 MiB. Small native tiles also texture the HTML interface. `sprites.ts` articulates coherent full photographic figures from individual heads, long coats, arms, gloves, trousers, boots, ears, tails, and wings. Aristobat wings hang alongside the long coat rather than spreading above the torso. `renderer.ts` assembles native buildings, trees, furniture, resources, and effects. Existing terrain and object byte budgets, desktop pixel budget, and drawing cap remain in place.

The 24 authored base pigments remain in `palette.ts` and `palette.css`; [the swatch sheet](palette-24.svg) gives their values. Photographs retain their natural tones. Use smooth sampling throughout.

Keep the setting materially poor and repeatedly repaired: rounded caravans with rusty boiler additions, salvaged metal, patched glass, mismatched furniture, improvised cables, and exhausted residents. Lady Supine is a living human woman with an enormous beautiful head and an uncovered opening in its top, above a tiny yellow raincoat body. She wears no crown. The puzzle crown is a separate museum object.

`actorHeadAnchor(kind)` locates the physical opening for the brain exchange relative to each figure's feet. Its coordinates follow the loaded photograph's proportions. `playerToolPose(...)` locates the moving palm and forearm so tools remain attached during a strike. Replacement assets must preserve or update those anchors. The God Switch visibly transfers two brains; the hospital restores Ada and confines Supine's brain in glass.

`registerSpriteSheet(kind, source, options)` supports replacement animated artwork. Its four directional rows are down, left, right, and up; `frameWidth`, `frameHeight`, and optional `feetX`/`feetY` place feet in the world. Use Vite asset imports for portable URLs and offline embedding.

Walking pace, action recovery, hurt, individual phase offsets, billboard gestures, and reduced motion all reach the drawing API. Tree roots stay planted while branch joints, clipped leaf discs, and willow strands respond to gusts. Gameplay events drive tool strikes, resource recoil, falling harvested objects, and construction settling without changing save formats. Door artwork agrees with the central interaction point, foliage fades around the player, and the map includes an informational interior floor plan.

Earlier torn-paper images and SVG drawings remain inactive historical references. The live favicon uses the new native Supine portrait.
