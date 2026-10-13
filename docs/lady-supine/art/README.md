# Replaceable art

Original editable SVG placeholders for **Lady Supine: Entering the Unenterable Entrance**. Every location uses a `1400 700` viewBox; portraits use `160 160`. They share a restrained parchment, forest-green, sage, olive and antique-gold palette with a subtle paper-grain SVG filter.

Replace an SVG at its existing path to change the art without changing game logic. The main entry illustration is `gate.svg`. The scenes use no embedded lettering so the interface can supply readable labels. All assets are locally authored vectors; no external image sources or font dependencies.

The walkable game uses original procedural pixel art in `src/openworld/sprites.ts` and `src/openworld/renderer.ts`, with matching pixel portraits in dialogue. The SVGs are retained as references. Character sprite sheets can be substituted using `registerSpriteSheet(kind, source, options)`; four rows represent down, left, right, and up, with idle and walking frames across columns. `frameWidth`, `frameHeight`, and optional `feetX`/`feetY` keep the character's feet aligned with the world. Resolve local replacement image paths from `import.meta.env.BASE_URL` so the game continues to work on a GitHub Pages subpage.

Terrain, architecture, resource nodes, icons, and character sprites are separate from the story and game rules. Temporary palettes and motifs can therefore change without changing saved quests or collision layouts.
