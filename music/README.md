# Music Lab

A dedicated, self-contained landing page for Caleb Haines's music apps.

Live: https://calebhaines.github.io/sidequest-prototypes/music/

GRAIN: https://calebhaines.github.io/sidequest-prototypes/music/grain/

FORM: https://calebhaines.github.io/sidequest-prototypes/music/form/

TINE: https://calebhaines.github.io/sidequest-prototypes/music/tine/

MIRE: https://calebhaines.github.io/sidequest-prototypes/music/mire/

SPOOL: https://calebhaines.github.io/sidequest-prototypes/music/spool/

The music page has its own design and navigation, separate from the Sidequest RPG gallery. All typography and artwork are embedded in `index.html`.

## Editing and adding apps

Edit `music/index.html` to change the page. Add another instrument article to its collection for each new app, using a relative link such as `./new-app/`. Put that app's browser files in `music/new-app/`, with an `index.html` entry point. The layout adapts to additional articles.

GRAIN's editable source remains in `grain/`. Rebuild it with `python grain/build.py` when its source changes. Its `index.html` continues to work as a standalone offline download.

FORM 2.0.2 is in `music/form/`, with a standalone `index.html` and the complete editable project in `FORM-source.zip`. Its three layers combine subtractive, four-operator FM, wavetable, granular, and percussion synthesis. See `music/form/README.md` for update instructions. The Music Lab card opens the app or downloads its offline HTML.

TINE 1.1 has nine resonator bodies, selectable striking materials, contact texture and rebound controls, and eight grooves. Its editable source is in `tine/`. Rebuild it with `python tine/build.py`; its single-file page is copied to the music section by the same sync command. Existing TINE projects upgrade automatically with their original excitation preserved.

MIRE 1.0 is a feedback instrument with four interconnected delay/resonator pools, six processor models, eight exciter types including imported audio, and four sixteen-step lanes. Its routing matrix, two LFOs, assignable XY pad, freeze, live microphone input, and stereo recording turn short sounds into evolving loops and textures. Eight complete garden presets are included. The editable source is in `mire/`; rebuild its standalone page and `music/mire/MIRE-source.zip` with `python mire/build.py`. Music Lab opens the app at `./mire/` or downloads the same self-contained HTML for offline play. The app's Help panel includes its editable source download.

SPOOL 1.0 is a tape-loop playground with four overlapping stereo decks, eight tape-study presets, thirty seconds per deck, audio import, live microphone input, built-in keys, and overdubbing. Shape speed, reverse playback, loop regions, tape wear, tone, wow, and flutter; save projects and export stereo WAV. Its editable source is in `spool/`; rebuild the standalone page and `music/spool/SPOOL-source.zip` with `python spool/build.py`. Music Lab opens the app at `./spool/` or downloads the same self-contained HTML for offline play. The app's Help panel includes its editable source download.

Run `npm run music:sync` to copy the music page, apps, and assets to both `public/music/` and `docs/music/`. The sync also runs before `npm run dev` and `npm run build`. GitHub Pages publishes `docs/`, so commit the refreshed copies when publishing.

The previous `/grain/` route redirects to `/music/grain/`, preserving query strings and hashes. Browser projects remain in the same origin-wide storage. The redirect also has a plain link for browsers without JavaScript.
