# CLATTER

A physical-modeling drum machine with an exciter-and-resonator topology inspired by instruments such as Intellijel Plonk. CLATTER is an original browser implementation.

Open `index.html` directly in a modern browser and press Play. Fonts, interface, synthesis, and sounds are embedded in the file. There are no recorded samples, external libraries, accounts, or runtime network requests.

Eight independent voices feed a sixteen- or thirty-two-step sequencer. Each voice combines a shaped mallet strike and enveloped noise to excite a bank of damped resonances. Nine body geometries—string, beam, marimba, drumhead, membrane, plate, bell, bowl, and tube—provide different mode-frequency relationships. The bell uses cast-shell partials; the bowl uses closely paired curved-shell modes; the tube follows a closed air column's odd harmonics. Strike position, stiffness, brightness, and damping shape the response. Pitch envelopes, variation, and velocity response add movement.

Use the **Resonator**, **Exciter**, and **Motion** tabs to shape the selected voice. Choose a neutral, felt, rubber, wood, nylon, ceramic, or metal striker, then adjust its hardness and contact time. Material changes shape the contact pulse and its spectrum; they are physical-inspired approximations rather than measurements of particular mallets. **Contact texture** adds material-colored friction during contact. **Rebound** introduces smaller repeat impacts, with **Bounce spacing** moving from a close buzz to distinct bounces. Set texture and rebound to zero for a clean single contact.

Mix the noise and mallet independently; contact texture belongs to the mallet, while the noise retains its own color, cutoff, attack, and decay. Direct exciter mix lets some of the initial impact bypass the vibrating body. Decay is expressed as the approximate time for the fundamental to fall by 60 dB; higher modes decay according to the damping control. All bodies use a finite set of modal resonances, giving musical physical approximations rather than a full simulation of every object.

Four pattern banks, accents, swing, mute/solo, eight curated grooves, voice mutation, undo, automatic local saving, JSON project import/export, and stereo WAV export are available. **Ceramic tasting menu** and **Ventilation inspection** showcase the new bodies and striking materials. WAV export renders four bars plus the natural resonator, rebound, and reverb tail. Download the HTML from Kitchen for offline use.

The compact **16 STEPS / 32 STEPS** chooser in the sequence heading changes the loop length. At 32, **1–16 / 17–32** switches the existing grid between its two halves; arrow keys also cross between halves. The second half starts empty. Returning to 16 excludes the second half from playback and exports while preserving its hits and accents in all four banks. Clear and New groove edit the active length. Undo, browser saving, project files, native playback, and shared patterns include the chosen length. Factory grooves remain sixteen steps. Pattern export lengths are musical bars: choose at least two bars for a complete 32-step sequence.

Projects save as version 5. Earlier projects migrate to empty sound locks and a disabled chain; versions 1 and 2 retain their sixteen-step loops. Version 1 projects are strictly validated before migration: the original six resonators receive the neutral striker with texture and rebound at zero, preserving their previous synthesis settings. Migration keeps every bank, pattern, mix setting, and voice parameter. Factory grooves keep their original audio when chains and locks are unused.

## Chain and step sound (v1.2)

**Chain** beside A–D opens a compact editor. Append whole patterns, set 1–16 repeats, move entries up/down, duplicate or remove them, and enable **Play chain**. **Loop chain** repeats the list; unchecking it plays one pass and leaves the final resonators ringing naturally. The grid remains on the bank you are editing; the footer identifies the playing entry, bank and repeat. Entry, repeat, bank and length changes take effect at the next complete-pattern boundary without restarting the audio clock. Chains support up to 32 entries and 256 beats. Clearing or editing the chain supports Undo.

**Edit step** changes ordinary grid clicks into inspector selection. Right-click or press E on a focused step, or hold a step on touchscreens, to open it directly. Shift-click still accents. In the inspector, a checked box means **inherit the voice**; uncheck it to override that control for one hit. Output cutoff has a logarithmic slider and a precise Hz entry, and filters the entire resonator and direct strike. Resonance shapes that filter. Decay, brightness, level, pan and drive provide further per-hit changes. Decay stays within CLATTER’s native 40 ms–4 s range. **Hear step** auditions those settings; **Inherit all** removes them. Overridden steps carry a small diamond.

Locks never edit the base voice. Copy bank copies hidden steps and their locks; Clear and New groove remove locks only in the active length. Switching from 32 to 16 preserves the second half. Native rhythm/lock edits return from a received shared pattern to the grid, with Undo restoring the received part. Chains and locks save in project downloads and browser recovery.

## Sharing samples

The Samples panel shares the **Current sequence** (enabled chain or current pattern), explicit **Current pattern mix**, **Complete chain**, selected voice pattern, or a single selected voice strike with the other Kitchen apps. Complete-chain exports include every entry and repeat once, even when chain playback is disabled; their bar-length control is not used. Other pattern renders can cover one to sixteen bars. A single strike remains one base-voice hit, preserving its resonator and exciter decay, with an optional effect tail. Muted voices can still be shared individually. Rendering snapshots the current project without stopping playback or changing any settings. CLATTER generates samples; imported recordings do not replace its physical models.

`TineApp.exportAudio({scope, bars, tailSeconds, signal})` returns an audio payload without downloading it; `TineApp.audioExport` lists the supported scopes. Export WAV renders the complete enabled chain, or the familiar four bars when the chain is off, with natural tails. Locks and chains use the same native event graph as playback. Audio exports longer than 120 seconds report a limit instead of truncating; shared patterns allow up to 4,096 notes and 256 beats.

`TineApp.getSequencerPattern(options)` returns a fresh portable note packet without changing the project. The default is the enabled chain or current pattern; explicit `scope: 'pattern'`, `'chain'`, or `'voice'` selects the corresponding material. Per-hit `note.locks` use the Kitchen canonical physical units, and native `scheduleNativeNote`/`renderNativeEvents` consume the same locks. The `sequenceLoop` getter lets GALLEY honor a native once chain while its own transport controls song looping.

Live: https://calebhaines.github.io/sidequest-prototypes/music/tine/

Rebuild and publish the static files from the repository root:

```sh
python tine/build.py
npm run music:sync
```

The editable sources remain in `tine/`; the standalone app is copied to `public/music/tine/index.html` and `docs/music/tine/index.html`.

Run `npm run check:tine-export` with Playwright installed to exercise the actual
Export WAV button and the original pattern, voice and one-shot export scopes. The check validates
stereo WAV audio, the four-bar duration and natural tail, unchanged project state,
and cancellation. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` can select an existing
Playwright/Chromium installation; `TINE_QA_URL` can check the published page.

Run `node tine/cancellation-checks.cjs` for native audio checks of repeated stops,
natural release fades, and cancellation before a scheduled strike. Hosted notes
retain a stable lane identity so GALLEY applies CLATTER's six-voice limit even
when each strike reads a fresh sound-settings snapshot. The integration check is
`node loom/clatter-polyphony-checks.cjs`.

`node grain/pattern-length-checks.cjs` also verifies CLATTER's maintained sources directly: all eight factory groove states and native WAVs match the rollback checkpoint within the browser's native filter precision, versions 1/2 migrate without changing their sound, and 32-step playback/export, accents, paging, banks, undo, persistence, strict project validation, and 320/390 px controls work together.

Run `node tine/chain-lock-checks.cjs` for maintained-source schema and migration checks, exact live chain order, complete boundaries, once playback with natural tails, actual WAV cutoff and hit isolation, inspector inheritance, bank copying, hidden locks and recovery. `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` select an installed browser.

## Display identity

The kitchen name is a presentation change. Existing URL routes, JavaScript integration APIs, storage keys, and portable project identifiers remain unchanged so earlier sessions and shared projects still open.

## GALLEY inserts per voice

Each of CLATTER’s eight voices has two serial GALLEY effect slots in its voice
editor. The slots use the studio’s full effect catalog, parameter definitions,
recipes and DSP. Notes from the same voice share a persistent stereo rack, so
compression reacts to overlapping hits and delays and reverbs retain their
tails. The rack follows voice level and pan, before CLATTER’s master processing.

Open either slot to choose an effect, edit its controls or load a complete
recipe. Bypass, Reset, Remove and order changes are local to that voice. Voice
reset restores the resonator while retaining its insert rack; a complete kit
preset replaces the whole patch. Effect edits support Undo and saved projects.
Native project version 5 stores `galleyFx: [null, null]` on every voice. Versions
1–4 migrate with empty slots, and supplied malformed effect data is rejected.

Voice samples, pattern and chain WAVs, shared samples, and GALLEY source prints
include these inserts. Empty racks keep the legacy synthesis route unchanged.
Active offline effects require a browser with Offline AudioWorklet support.
