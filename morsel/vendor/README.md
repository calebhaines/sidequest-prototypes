# MORSEL 1.1 natural voice sources

The audible voice engine is now **KittenTTS Nano 0.8 INT8**, a local neural speech
model with four distinct learned speaker profiles. No classic meSpeak speech or
operating-system speech service remains in the runtime. eSpeak NG is used only
to turn English spelling into phonemes before neural inference.

See [neural/README.md](neural/README.md) for exact artifacts, licenses and source
offers. The classic MORSEL 1.0 backend and its source remain available in the
versioned `MORSEL-1.0-source.zip` download; they are not fallback voices.

`python3 build-assets.py` losslessly packages the original model and inference
runtime as GZIP/base64 data. It never downloads dependencies or changes neural
weights. The generated `speech-assets.js` is omitted from editable source ZIPs
because it is rebuilt from these same vendored inputs.

Run `python3 verify-source.py` to audit every artifact and the generated pack.
`node backend-checks.cjs` checks validation, detached caches, cancellation and
restart protocol without pretending mocked audio measures speech quality.
Actual neural audio is verified by the instrument's Chromium browser checks.
