# TINE

A physical-modeling drum machine with an exciter-and-resonator topology inspired by instruments such as Intellijel Plonk. TINE is an original browser implementation.

Open `index.html` directly in a modern browser and press Play. Fonts, interface, synthesis, and sounds are embedded in the file. There are no recorded samples, external libraries, accounts, or runtime network requests.

Eight independent voices feed a sixteen-step sequencer. Each voice combines a shaped mallet strike and enveloped noise to excite a bank of damped resonances. Six body geometries—string, beam, marimba, drumhead, membrane, and plate—provide different mode-frequency relationships. Strike position, stiffness, brightness, and damping shape the response. Pitch envelopes, variation, and velocity response add movement.

Use the **Resonator**, **Exciter**, and **Motion** tabs to shape the selected voice. Mix the noise and mallet independently; direct exciter mix lets some of the initial impact bypass the vibrating body. Decay is expressed as the approximate time for the fundamental to fall by 60 dB; higher modes decay according to the damping control.

Four pattern banks, accents, swing, mute/solo, curated grooves, voice mutation, undo, automatic local saving, JSON project import/export, and stereo WAV export are available. WAV export renders four bars plus the natural resonator and reverb tail. Download the HTML from Music Lab for offline use.

Live: https://calebhaines.github.io/sidequest-prototypes/music/tine/

Rebuild and publish the static files from the repository root:

```sh
python tine/build.py
npm run music:sync
```

The editable sources remain in `tine/`; the standalone app is copied to `public/music/tine/index.html` and `docs/music/tine/index.html`.
