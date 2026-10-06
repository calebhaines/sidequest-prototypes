# HOTPLATE — Electronic drum groovebox

HOTPLATE 3.0 is Kitchen’s eight-burner electronic drum groovebox. The enamel-and-copper interface puts sixteen visible steps, playable burners, and direct Pitch/Length/Body/Snap/Air/Heat controls up front. Four complete kits contain 32 new synthesized drum recipes; twelve newly authored two-bar rhythms offer independent starting patterns. The 46 original sounds remain available in Archive.

Use Bar A/B for 32-step rhythms, open step details for velocity/probability/repeats/timing/pitch, and shape the selected burner without opening the deeper editor. Density, rotation, lane shifts, variation, bar duplication, temporary fills, clear, and Undo make the sequencer useful for building a groove rather than just playing a demo. **Open recipe** still exposes three layers, five synthesis engines, modulation, effects, and granular recording import.

Live: https://calebhaines.github.io/sidequest-prototypes/music/form/

`index.html` is the self-contained, tested application. Open it directly for offline play. `FORM-source.zip` contains the complete editable React/TypeScript/Vite project and its audio/playback tests; it is also available at the live app URL with `FORM-source.zip` appended.

## Updating the application

1. Edit the maintained `form/` project at the repository root, or extract `FORM-source.zip` independently.
2. In the extracted project, run `npm ci`, edit the source, and run `npm test`, `npm run test:sequencing`, `npm run test:compat`, and the optional Playwright browser checks before `npm run package`.
3. Copy the generated `releases/FORM.html` to this folder as `index.html`, and update `FORM-source.zip` from that project's `releases/` folder.
4. From the site repository root, run `npm run music:sync`. Commit the updated files in `music/`, `public/music/`, and `docs/music/`.

GitHub Pages publishes the copy in `docs/music/form/`. Fonts and their license notices are embedded in the standalone app. Sound design and imported recordings remain local to the browser.

The shared **Samples** panel exports voices and patterns, reads the Kitchen local library, and imports explicitly trimmed audio into any of 24 granular layer destinations. Existing synthesis layers require replacement confirmation. Audio is converted to mono at 22.05 kHz with a two-second limit; the other layers and voice settings remain intact. The native `FormApp` facade supplies the same contract to GALLEY and future integrations.

Shared **Patterns** keeps received notes exactly, including off-grid timing, velocities, probabilities, and pitch. Sound and mute/solo changes preserve those notes. **Use native grid** or editing the native rhythm restores its stored grid; Undo restores the received part. Native repeats export as separate portable notes, whose probability decisions can be independent in other instruments. Download a HOTPLATE project to retain complete native step details, grouped repeat probability, and embedded recordings.

The URL, FORM project/storage identifiers, `.form.json` imports, and `FORM` download filenames remain compatible. Original saved sound parameters keep their sound; this release replaces the factory recipes and working interface.
