# Replaceable marker artwork

The playable world uses original hand-drawn marker-style Canvas illustrations in `src/openworld/sprites.ts` and `src/openworld/renderer.ts`. Characters, portraits, item icons, terrain, water, vegetation, buildings and map contours share uneven ink lines, layered pigment and stained paper. The active game uses no pixel art.

Buildings should remain materially poor and repeatedly repaired: old trailers, salvaged tin, cinderblocks, taped plastic windows, tarpaulin lean-tos and improvised cable. Avoid turning the setting into a cozy village or ornate fantasy town. Lady Supine is a living human woman with a disproportionately large head and an uncovered opening in its top. Preserve that anatomy in replacement character illustrations and portraits.

`registerSpriteSheet(kind, source, options)` can register replacement animated artwork. Four directional rows represent down, left, right and up. `frameWidth`, `frameHeight`, and optional `feetX`/`feetY` place the character’s feet in the world; the art itself is smoothly rendered. Resolve image paths from `import.meta.env.BASE_URL` for GitHub Pages subpage portability.

`actorHeadAnchor(kind)` identifies the physical opening used by the brain-exchange animation. Replacement art must preserve or update those anchors. The God Switch moves two actual organs; a generic thought symbol is not a replacement for the procedure.

Earlier SVG scenery is retained here as historical reference. It is not rendered in the playable world.
