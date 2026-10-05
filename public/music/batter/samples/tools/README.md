# Rebuild the recorded BATTER libraries

These acquisition scripts download about 510 MB of openly licensed source files into a temporary workspace. They do not put the original archives in the Git repository. No account or payment is required. Read `../../SAMPLE-LICENSES.md` before redistributing an adaptation.

Use Python 3 with NumPy and SciPy installed. The release conversion used NumPy 2.3.5 and SciPy 1.17.0. The AVL extraction preserves the source's PCM exactly; Salamander resampling/dither is deterministic for a given toolchain.

Run from the BATTER directory:

```sh
python samples/tools/acquire.py
python samples/tools/build_library.py
python samples/tools/build_salamander.py
```

The source workspace defaults to the system temporary directory's `kitchen-batter-sources` folder. Set `BATTER_SAMPLE_WORKSPACE` to use another directory.

The download script pins the AVL Git commit, verifies every source archive's SHA-256, and reads archive members as streams. It never performs a general tar extraction. The generated factory manifest and optional kit JSONs contain author attribution, source URLs, the original license notices, WAV hashes, dynamic ranges, and actual alternate-strike metadata.

`build_library.py` rebuilds the 148-entry AVL offline starter, four complete offline kits, and the five AVL optional collection bundles. The starter contains 84 acoustic-kit entries plus 64 Pantry percussion entries; the full optional audio collections remain unchanged. Its manifest stays below 29 MiB. Run it before `build_salamander.py`, which appends the separately licensed optional Rope tension bundle to the browser's collection list. The Salamander pack stays outside the embedded starter.

The JSON bundle files remain ordinary portable BATTER library files. Keep them beside the website for loading in the browser, or download a bundle and import it from disk when using the standalone HTML offline. The embedded Pantry percussion selection plays offline immediately. Loading both optional Pantry percussion parts expands that same kit to the full library; both parts provide all of its original dynamics and articulations.
