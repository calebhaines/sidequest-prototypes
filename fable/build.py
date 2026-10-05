"""Build FABLE's standalone sampler and reproducible editable source archive."""
from pathlib import Path
import base64
import runpy
import zipfile

ROOT = Path(__file__).resolve().parent
shared_dir = ROOT / 'shared' if (ROOT / 'shared' / 'bundle_audio_exchange.py').exists() else ROOT.parent / 'shared'
exchange = runpy.run_path(str(shared_dir / 'bundle_audio_exchange.py'))
scripts = ['schema.js', 'presets.js', 'audio-engine.js', 'zip.js', 'app.js']

faces = []
for family, weight, style, filename in [
    ('Fable Sans', 400, 'normal', 'noto-sans-regular.woff2'),
    ('Fable Sans', 700, 'normal', 'noto-sans-bold.woff2'),
    ('Fable Serif', 400, 'normal', 'noto-serif-regular.woff2'),
    ('Fable Serif', 400, 'italic', 'noto-serif-italic.woff2'),
]:
    data = base64.b64encode((ROOT / 'fonts' / filename).read_bytes()).decode('ascii')
    faces.append(f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:{style};font-display:swap;src:url(data:font/woff2;base64,{data}) format('woff2')}}")
license_text = (ROOT / 'fonts' / 'LICENSE.txt').read_text().replace('*/', '* /')
faces.append('/* Embedded Noto fonts: copyright Google; SIL Open Font License 1.1.\n' + license_text + '\n*/')

css = (ROOT / 'styles.css').read_text()
if css.count('/* FONT_FACES */') != 1:
    raise ValueError('styles.css needs exactly one FONT_FACES slot.')
css = css.replace('/* FONT_FACES */', '\n'.join(faces))
javascript = '\n'.join((ROOT / name).read_text() for name in scripts).replace('</script', '<\\/script')
template = (ROOT / 'app.html').read_text()
if any(template.count(slot) != 1 for slot in ['<!-- STYLES -->', '<!-- SCRIPTS -->']):
    raise ValueError('app.html needs exactly one STYLES and SCRIPTS slot.')
html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>').replace('<!-- SCRIPTS -->', '<script>\n' + javascript + '\n</script>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
html = exchange['embed_exchange'](html, 'fable', ROOT)
(ROOT / 'index.html').write_text(html)
print(f'Built FABLE: {len(html.encode()):,} bytes, all sample engines, artwork, fonts and exchange embedded.')

if (ROOT.parent / 'music' / 'README.md').exists():
    target = ROOT.parent / 'music' / 'fable' / 'FABLE-source.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    sources = ['app.html', 'styles.css', *scripts, 'build.py', 'README.md', 'CONTRACT.md', 'checks.cjs']
    sources += [name for name in ['engine-checks.cjs', 'zip-checks.cjs'] if (ROOT / name).is_file()]
    files = [(name, (ROOT / name).read_bytes()) for name in sources]
    files += [(str(path.relative_to(ROOT)), path.read_bytes()) for path in sorted((ROOT / 'fonts').glob('*'))]
    files += exchange['exchange_sources'](ROOT)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files:
            info = zipfile.ZipInfo('FABLE-source/' + name, (2026, 10, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    print(f'Packaged FABLE source: {target.stat().st_size:,} bytes, {len(files)} files.')
