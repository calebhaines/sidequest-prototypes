"""Embed lossless original neural voice assets; Python standard library only."""
from pathlib import Path
import ast
import base64
import gzip
import hashlib
import json
import struct
import zipfile

root = Path(__file__).resolve().parent
neural = root / 'neural'
model_hash = 'f7b0afcbee92870b32b8e0276d855b954dc25470c9f051b376ac7eee537c76fc'
profiles = [
    {'id': 'alto', 'name': 'Alto', 'speaker': 'Bella', 'key': 'expr-voice-2-f'},
    {'id': 'tenor', 'name': 'Tenor', 'speaker': 'Jasper', 'key': 'expr-voice-2-m'},
    {'id': 'bass', 'name': 'Bass', 'speaker': 'Bruno', 'key': 'expr-voice-3-m'},
    {'id': 'robot', 'name': 'Soprano', 'speaker': 'Luna', 'key': 'expr-voice-3-f'},
]
b64 = lambda data: base64.b64encode(data).decode('ascii')
packed = lambda name: b64(gzip.compress((neural / name).read_bytes(), compresslevel=9, mtime=0))
model = (neural / 'model.onnx.gz').read_bytes()
if hashlib.sha256(gzip.decompress(model)).hexdigest() != model_hash:
    raise ValueError('The upstream neural model has changed.')
if hashlib.sha256((neural / 'voices.npz').read_bytes()).hexdigest() != '8aa7cee235abb0739cb51e6559685f65a4dacd95568833d05699b1633f519b3f':
    raise ValueError('The upstream neural voice data has changed.')
rows = []
with zipfile.ZipFile(neural / 'voices.npz') as archive:
    for profile in profiles:
        data = archive.read(profile['key'] + '.npy')
        if data[:6] != b'\x93NUMPY': raise ValueError('Invalid neural voice data.')
        version = data[6]
        offset = 10 if version == 1 else 12
        size = struct.unpack('<H' if version == 1 else '<I', data[8:offset])[0]
        header = ast.literal_eval(data[offset:offset + size].decode('latin1'))
        if header['descr'] != '<f4' or header['fortran_order'] or header['shape'] != (400, 256):
            raise ValueError('Unexpected neural voice layout.')
        # Upstream indexes by len(text), including its terminal punctuation.
        # Up to160typed characters plus an appended comma require rows0..161.
        rows.append(data[offset + size:offset + size + 162 * 256 * 4])
assets = {
    'backend': 'kitten-tts-nano-0.8-int8', 'modelHash': model_hash, 'profiles': profiles,
    'styleRows': 162, 'styleWidth': 256, 'model': b64(model),
    'wasm': b64((neural / 'ort-wasm-simd-threaded.wasm.gz').read_bytes()),
    'runtime': packed('ort.min.js'), 'module': packed('ort-wasm-simd-threaded.mjs'),
    'phonemizer': packed('phonemizer.js'), 'styles': b64(gzip.compress(b''.join(rows), 9, mtime=0)),
}
script = '/* Lossless neural voice assets. See vendor/neural/README.md for licenses and provenance. */\n'
script += 'window.MorselSpeechAssets=' + json.dumps(assets, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c') + ';\n'
(root / 'speech-assets.js').write_text(script, encoding='utf-8')
print('Prepared offline neural voice assets:', len(script.encode()), 'bytes')
