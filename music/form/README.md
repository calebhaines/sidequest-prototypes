# FORM — Percussion Lab

FORM 2.0.2 is a browser percussion studio with three synthesis layers, subtractive/FM/wavetable/granular/percussion engines, cross-layer modulation, local recording import, and sample/kit/pattern WAV export. Its decorative copy describes a most improper layer-cake; synthesis controls and practical instructions remain clear.

Live: https://calebhaines.github.io/sidequest-prototypes/music/form/

`index.html` is the self-contained, tested application. Open it directly for offline play. `FORM-source.zip` contains the complete editable React/TypeScript/Vite project and its audio/playback tests; it is also available at the live app URL with `FORM-source.zip` appended.

## Updating the application

1. Extract `FORM-source.zip` outside the site project.
2. In the extracted project, run `npm ci`, edit the source, and run `npm test` and `npm run package`.
3. Copy the generated `releases/FORM.html` to this folder as `index.html`, and update `FORM-source.zip` from that project's `releases/` folder.
4. From the site repository root, run `npm run music:sync`. Commit the updated files in `music/`, `public/music/`, and `docs/music/`.

GitHub Pages publishes the copy in `docs/music/form/`. Fonts and their license notices are embedded in the standalone app. Sound design and imported recordings remain local to the browser.
