# HOTPLATE — Percussion Lab

HOTPLATE 2.0.3 is a browser percussion studio with three synthesis layers, subtractive/FM/wavetable/granular/percussion engines, cross-layer modulation, local recording import, and sample/kit/pattern WAV export. Its decorative copy describes three unruly kitchen burners; synthesis controls and practical instructions remain clear.

Live: https://calebhaines.github.io/sidequest-prototypes/music/form/

`index.html` is the self-contained, tested application. Open it directly for offline play. `FORM-source.zip` contains the complete editable React/TypeScript/Vite project and its audio/playback tests; it is also available at the live app URL with `FORM-source.zip` appended.

## Updating the application

1. Edit the maintained `form/` project at the repository root, or extract `FORM-source.zip` independently.
2. In the extracted project, run `npm ci`, edit the source, and run `npm test`, `npm run test:exchange`, and `npm run package`.
3. Copy the generated `releases/FORM.html` to this folder as `index.html`, and update `FORM-source.zip` from that project's `releases/` folder.
4. From the site repository root, run `npm run music:sync`. Commit the updated files in `music/`, `public/music/`, and `docs/music/`.

GitHub Pages publishes the copy in `docs/music/form/`. Fonts and their license notices are embedded in the standalone app. Sound design and imported recordings remain local to the browser.

The shared **Samples** panel exports voices and patterns, reads the Kilter Kitchen local library, and imports explicitly trimmed audio into any of 24 granular layer destinations. Existing synthesis layers require replacement confirmation. Audio is converted to mono at 22.05 kHz with a two-second limit; the other layers and voice settings remain intact. The native `FormApp` facade supplies the same contract to GALLEY and future integrations.
