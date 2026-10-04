# TINE

A physical-modeling drum machine with an exciter-and-resonator topology inspired by instruments such as Intellijel Plonk. TINE is an original browser implementation.

Open `index.html` directly in a modern browser and press Play. Fonts, interface, synthesis, and sounds are embedded in the file. There are no recorded samples, external libraries, accounts, or runtime network requests.

Eight independent voices feed a sixteen-step sequencer. Each voice combines a shaped mallet strike and enveloped noise to excite a bank of damped resonances. Nine body geometries—string, beam, marimba, drumhead, membrane, plate, bell, bowl, and tube—provide different mode-frequency relationships. The bell uses cast-shell partials; the bowl uses closely paired curved-shell modes; the tube follows a closed air column's odd harmonics. Strike position, stiffness, brightness, and damping shape the response. Pitch envelopes, variation, and velocity response add movement.

Use the **Resonator**, **Exciter**, and **Motion** tabs to shape the selected voice. Choose a neutral, felt, rubber, wood, nylon, ceramic, or metal striker, then adjust its hardness and contact time. Material changes shape the contact pulse and its spectrum; they are physical-inspired approximations rather than measurements of particular mallets. **Contact texture** adds material-colored friction during contact. **Rebound** introduces smaller repeat impacts, with **Bounce spacing** moving from a close buzz to distinct bounces. Set texture and rebound to zero for a clean single contact.

Mix the noise and mallet independently; contact texture belongs to the mallet, while the noise retains its own color, cutoff, attack, and decay. Direct exciter mix lets some of the initial impact bypass the vibrating body. Decay is expressed as the approximate time for the fundamental to fall by 60 dB; higher modes decay according to the damping control. All bodies use a finite set of modal resonances, giving musical physical approximations rather than a full simulation of every object.

Four pattern banks, accents, swing, mute/solo, eight curated grooves, voice mutation, undo, automatic local saving, JSON project import/export, and stereo WAV export are available. **Porcelain orbit** and **Hollow rituals** showcase the new bodies and striking materials. WAV export renders four bars plus the natural resonator, rebound, and reverb tail. Download the HTML from Music Lab for offline use.

Projects save as version 2. Version 1 projects are strictly validated before migration: the original six resonators receive the neutral striker with texture and rebound at zero, preserving their previous synthesis settings. Migration keeps every bank, pattern, mix setting, and voice parameter. The original six factory grooves retain their original contact response as well.

Live: https://calebhaines.github.io/sidequest-prototypes/music/tine/

Rebuild and publish the static files from the repository root:

```sh
python tine/build.py
npm run music:sync
```

The editable sources remain in `tine/`; the standalone app is copied to `public/music/tine/index.html` and `docs/music/tine/index.html`.
