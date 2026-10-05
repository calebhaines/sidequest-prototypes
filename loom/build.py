"""Build the complete LOOM studio and reproducible editable source archive."""
from pathlib import Path
import base64
import runpy
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent
exchange_dir = ROOT / 'shared' if (ROOT / 'shared' / 'bundle_audio_exchange.py').exists() else ROOT.parent / 'shared'
exchange_helpers = runpy.run_path(str(exchange_dir / 'bundle_audio_exchange.py'))
INSTRUMENTS = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel', 'fable']
SCRIPTS = ['effects-catalog.js', 'effects.js', 'schema.js', 'audio-engine.js', 'host-bridge.js', 'instrument-host.js', 'clip-transfer.js', 'automation-ui.js', 'note-playback.js', 'note-renderer.js', 'piano-roll.js', 'note-workflow.js', 'app.js']

bundled = {}
instrument_files = {}
for name in INSTRUMENTS:
    candidates = [ROOT / 'instruments' / (name + '.html')] + ([ROOT.parent / 'music' / name / 'index.html'] if name == 'form' else [ROOT.parent / name / 'index.html', ROOT.parent / 'music' / name / 'index.html'])
    source = next((p for p in candidates if p.is_file()), None)
    if source is None:
        raise FileNotFoundError('Missing bundled instrument: ' + name)
    data = source.read_bytes()
    instrument_files[name] = data
    bundled[name] = data.decode('utf-8')

font_faces = []
for family, weight, style, name in [
    ('Loom Sans', 400, 'normal', 'noto-sans-regular.woff2'),
    ('Loom Sans', 700, 'normal', 'noto-sans-bold.woff2'),
    ('Loom Serif', 400, 'normal', 'noto-serif-regular.woff2'),
    ('Loom Serif', 400, 'italic', 'noto-serif-italic.woff2'),
]:
    encoded = base64.b64encode((ROOT / 'fonts' / name).read_bytes()).decode('ascii')
    font_faces.append(f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{encoded}) format('woff2')}}")
license_text = (ROOT / 'fonts' / 'LICENSE.txt').read_text().replace('*/', '* /')
font_faces.append('/* Embedded Noto fonts: copyright Google; SIL Open Font License 1.1.\n' + license_text + '\n*/')

def javascript_value(value):
    # Escape '<' so an instrument's embedded script cannot close LOOM's script.
    return json.dumps(value, ensure_ascii=True, separators=(',', ':')).replace('<', '\\u003c')

css = (ROOT / 'styles.css').read_text() + '\n' + (ROOT / 'automation.css').read_text() + '\n' + (ROOT / 'piano-roll.css').read_text()
if css.count('/* FONT_FACES */') != 1:
    raise ValueError('styles.css needs exactly one FONT_FACES slot.')
css = css.replace('/* FONT_FACES */', '\n'.join(font_faces))
embedded = 'window.LoomEmbeddedInstruments=' + javascript_value(bundled) + ';\n'
embedded += 'window.LoomDemoAssets=' + javascript_value(json.loads((ROOT / 'demo-assets.json').read_text())) + ';\n'
embedded += 'window.LoomDemoTemplate=' + javascript_value(json.loads((ROOT / 'demo-session.json').read_text())) + ';\n'
scripts = '\n'.join((ROOT / name).read_text() for name in SCRIPTS[:-1]) + '\n' + embedded + (ROOT / SCRIPTS[-1]).read_text()
scripts = scripts.replace('</script', '<\\/script')
template = (ROOT / 'app.html').read_text()
if any(template.count(slot) != 1 for slot in ['<!-- STYLES -->', '<!-- SCRIPTS -->']):
    raise ValueError('app.html needs exactly one STYLES and SCRIPTS slot.')
html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>').replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
html = exchange_helpers['embed_exchange'](html, 'loom', ROOT)
(ROOT / 'index.html').write_text(html)
print(f'Built LOOM: {len(html.encode()):,} bytes; all {len(INSTRUMENTS)} Music Lab instruments and all assets embedded.')

if (ROOT.parent / 'music' / 'README.md').exists():
    target = ROOT.parent / 'music' / 'loom' / 'LOOM-source.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    sources = ['app.html', 'styles.css', 'automation.css', 'piano-roll.css', *SCRIPTS, 'build.py', 'checks.cjs', 'note-checks.cjs', 'README.md', 'HOSTING.md', 'demo-assets.json', 'demo-session.json']
    files = [(name, (ROOT / name).read_bytes()) for name in sources]
    files += exchange_helpers['exchange_sources'](ROOT)
    files += [(str(p.relative_to(ROOT)), p.read_bytes()) for p in sorted((ROOT / 'fonts').glob('*'))]
    files += [('instruments/' + name + '.html', data) for name, data in instrument_files.items()]
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files:
            info = zipfile.ZipInfo('LOOM-source/' + name, (2026, 10, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    print(f'Packaged LOOM source: {target.stat().st_size:,} bytes, {len(files)} files.')
    print('Standalone SHA-256: ' + hashlib.sha256(html.encode()).hexdigest())
