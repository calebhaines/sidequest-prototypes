# Voxelbloom

[Open the live studio](https://calebhaines.github.io/sidequest-prototypes/voxelbloom/).

A browser-based studio for making and arranging sprite-stacked pixel art. Built with React, Vite, and Canvas 2D.

```sh
npm install
npm run dev
```

Run `npm run build` for a production build, or `npm run preview` to serve it.

Draw with the pencil, eraser, flood fill, and color picker. Add, duplicate, hide, delete, and drag layers to reorder them; the stack preview updates as you work. Adjust rotation, tilt, and layer spacing, or turn on auto-rotation.

Switch to Scene to drag sprites around an isometric floor. Rotate, scale, duplicate, and position each object. Six starter sprites are included; create a blank sprite or start from a template.

Projects and scenes save in this browser. Download a project JSON to back up or transfer the editable art and scene arrangement. Export a sprite sheet, a stack render, or the full scene as PNG.

Keyboard shortcuts: **B** pencil, **E** eraser, **G** fill, **I** color picker, **[ / ]** switch layers, **Ctrl/⌘ Z** undo, **Ctrl/⌘ Shift Z** redo, **?** help.

## Publishing updates

From the repository root, run `npm --prefix voxelbloom ci` once, then `npm run voxelbloom:build`. This builds the app with relative asset paths and copies its output into `public/voxelbloom/` and `docs/voxelbloom/`. GitHub Pages publishes the committed `docs/` directory from `main`.
