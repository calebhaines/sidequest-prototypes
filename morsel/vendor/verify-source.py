"""Verify release provenance and the matching source/data without network access."""
from pathlib import Path
from zipfile import ZipFile
import base64
import hashlib
import json
import re

root = Path(__file__).resolve().parent
hashes = {
    'mespeak-core.js': '0945233a22ccbbcab2fd70607cb03605002eef16c00cce1c1c9617d46bbe0189',
    'en-us.json': '757de5de43981ac734c51ee350632049a65c6a04b9ed1a630b9916cf88440721',
    'mespeak-2.0.7-upstream.zip': '0f64d9659cff8551d16473b65fae6e02439292c249e0c2c76f602b16838e5156',
    'speak.js-9c6f642-source.zip': '6c9af42c9764df92407fa4f2d1fdd5023f9fcfe5026bf9a99ed8eaf8be24113a',
}
for name, expected in hashes.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == expected, name

core = (root / 'mespeak-core.js').read_text()
with ZipFile(root / 'speak.js-9c6f642-source.zip') as archive:
    assert archive.testzip() is None
    prefix = archive.namelist()[0].split('/')[0] + '/'
    compiled = re.search(r'\[49,46,52,53,46,48,52[^\]]*\]', core).group()
    version = bytes(map(int, compiled[1:-1].split(','))).rstrip(b'\0').decode()
    assert version == '1.45.04  25.Apr.11'
    assert '"' + version + '"' in archive.read(prefix + 'src/synthdata.cpp').decode()
    voice = json.loads((root / 'en-us.json').read_text())
    assert base64.b64decode(voice['dict']) == archive.read(prefix + 'espeak-data/en_dict')
    position = core.index('var configData=') + len('var configData=')
    configuration, _ = json.JSONDecoder().raw_decode(core[position:])
    for name in ['phontab', 'phonindex', 'phondata', 'intonations']:
        assert base64.b64decode(configuration[name]) == archive.read(prefix + 'espeak-data/' + name), name
    for name in ['src/emscripten.sh', 'src/bundle.py', 'src/Makefile', 'License.txt']:
        assert archive.read(prefix + name), name
print('PASS unchanged meSpeak release hashes, matching eSpeak 1.45.04 source, English dictionary and all four phoneme data files')
