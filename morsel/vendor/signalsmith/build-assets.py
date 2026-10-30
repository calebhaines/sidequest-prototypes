"""Embed the unchanged Signalsmith WASM factory, without the Web Audio wrapper."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent
upstream = (root / 'SignalsmithStretch.js').read_text()
marker = 'function registerWorkletProcessor'
if upstream.count(marker) != 1:
    raise ValueError('Unexpected Signalsmith web release.')
# Its official web release contains the self-contained WASM factory followed by
# an AudioWorklet wrapper. MORSEL uses that same factory in a preparation worker.
factory = upstream[:upstream.index(marker)]
script = '/* Signalsmith Stretch 1.3.2: MIT, copyright Geraint Luff. See vendor/signalsmith/LICENSE.txt. */\n'
assets = {
    'version': '1.3.2',
    'core': factory,
    'license': (root / 'LICENSE.txt').read_text(),
    'source': 'https://github.com/Signalsmith-Audio/signalsmith-stretch/tree/222093b4cc13ddb4d07c826bc3c1559326091731',
}
script += 'window.MorselStretchAssets=' + json.dumps(assets, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c') + ';\n'
(root / 'assets.js').write_text(script)
print('Prepared offline vocal stretch assets:', len(script.encode()), 'bytes')
