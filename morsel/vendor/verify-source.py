"""Audit original neural assets and the generated lossless offline pack."""
from pathlib import Path
import base64
import gzip
import hashlib
import json

ROOT = Path(__file__).resolve().parent
NEURAL = ROOT / 'neural'
manifest = json.loads((NEURAL / 'manifest.json').read_text())
for name, item in manifest['files'].items():
    data = (NEURAL / name).read_bytes()
    if len(data) != item['size'] or hashlib.sha256(data).hexdigest() != item['sha256']:
        raise SystemExit('FAIL changed neural artifact: ' + name)
for name, expected in [('model.onnx.gz', manifest['modelSHA256']), ('ort-wasm-simd-threaded.wasm.gz', manifest['wasmSHA256'])]:
    data = gzip.decompress((NEURAL / name).read_bytes())
    if hashlib.sha256(data).hexdigest() != expected: raise SystemExit('FAIL decompressed hash: ' + name)
script = (ROOT / 'speech-assets.js').read_text()
assets = json.loads(script[script.index('window.MorselSpeechAssets=') + len('window.MorselSpeechAssets='):].strip().removesuffix(';'))
assert assets['backend'] == manifest['backend'] and assets['modelHash'] == manifest['modelSHA256']
assert assets['styleRows'] == 162 and assets['styleWidth'] == 256
assert len(gzip.decompress(base64.b64decode(assets['styles']))) == 4 * 162 * 256 * 4
for key, filename in [('model', 'model.onnx.gz'), ('wasm', 'ort-wasm-simd-threaded.wasm.gz')]:
    assert base64.b64decode(assets[key]) == (NEURAL / filename).read_bytes()
for key, filename in [('runtime', 'ort.min.js'), ('module', 'ort-wasm-simd-threaded.mjs'), ('phonemizer', 'phonemizer.js')]:
    assert gzip.decompress(base64.b64decode(assets[key])) == (NEURAL / filename).read_bytes()
assert [profile['id'] for profile in assets['profiles']] == ['alto', 'tenor', 'bass', 'robot']
assert len(script.encode()) < 36 * 1024 * 1024
print('PASS original neural model/runtime/speaker/source hashes and lossless offline pack; no modified weights')
