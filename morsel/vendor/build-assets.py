"""Package unchanged offline speech sources as the one global used by MORSEL."""
from pathlib import Path
import json

root = Path(__file__).resolve().parent
assets = {
    'version': 'meSpeak 2.0.7',
    'core': (root / 'mespeak-core.js').read_text(),
    'english': json.loads((root / 'en-us.json').read_text()),
}
script = '/* meSpeak 2.0.7 / eSpeak: GNU GPL v3; see vendor/COPYING and vendor/README.md. */\n'
script += 'window.MorselSpeechAssets=' + json.dumps(assets, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c') + ';\n'
(root / 'speech-assets.js').write_text(script)
print('Prepared offline speech assets:', len(script.encode()), 'bytes')
