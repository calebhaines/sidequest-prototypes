# HOOD · fifteen more places to play

Choose **Reverb type** in HOOD’s effect editor. The six sound knobs and Dry / wet
remain in place. Changing the type keeps your settings, so you can compare spaces
without losing your edits. Each slot has its own stereo histories.

| Type | Character and starting point |
| --- | --- |
| Original | The existing eight-line feedback network, with exactly its previous sound. Older projects select this automatically. |
| Room | Compact early reflections and a short, connected room tail. Try a short Decay behind drums. |
| Chamber | An enclosed, reflective space with a dense body. Useful for vocals and acoustic instruments. |
| Hall | A spacious, diffuse tail with a more gradual build. Pre-delay keeps the source clear. |
| Cathedral | Long reflection paths and a slowly gathering wash. Try a longer Decay on sustained notes. |
| Plate | A quick, dense, metallic diffusion characteristic, without a room’s distinct walls. |
| Spring | Dispersive reflections with the uneven, resonant character of a spring tank. |
| Tiled room | Bright, closely spaced wall reflections and a hard, lively tail. |
| Ambience | Early space and a restrained late field for a source that needs depth without a prominent wash. |
| Vintage digital | A deliberately grainier digital texture with recognizable reflection spacing. |
| Modulated hall | A moving, diffuse hall for broad synth and guitar tails. |
| Shimmer | An octave-up pitch path feeds the reverberant field for a rising harmonic halo. |
| Gated | A dense field with a defined closing envelope. Start with Decay around 0.3–0.7 seconds on snare. |
| Reverse | A rising reverberant envelope that ends in a softened cutoff. It does not reverse the dry recording. |
| Bloom | A reverberant field that swells gradually behind the source. |
| Nonlinear | A shaped, clustered reflection envelope rather than a natural exponential decay. Try it on percussion. |

**Room size** changes reflection spacing. **Decay** sets the tail’s duration; it
sets the envelope duration for Gated, Reverse and Nonlinear. **Damping** softens
high frequencies as the tail develops. **Pre-delay** leaves space before the
wet sound. **Diffusion** controls how clearly individual reflections remain.
**Stereo width** narrows or widens the wet field; zero makes the wet return mono.

Use a low Dry / wet value on an insert. On Return A or B, start fully wet and use
the track’s send to set the amount. All types work on track, return and master
inserts, in offline exports, and in frozen tracks. Existing knob automation and
LFO routes retain their targets; the type selector is a discrete setting.

Only the selected type runs once a switch has settled. A 30 ms crossfade briefly
runs the outgoing and incoming types to avoid an abrupt cut when auditioning.
Original’s sample processing, meter values and reported tail remain unchanged;
its equivalent new model field is omitted from freeze fingerprints so previously
saved frozen tracks still validate.

Run `npm run check:hood` and `npm run check:hood-browser` from the repository.
From the editable source download, run `node hood-checks.cjs` or
`node hood-browser-checks.cjs` (the browser check needs Playwright and Chromium).
