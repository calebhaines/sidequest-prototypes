"""Build HAZE's standalone HTML and reproducible editable source download."""
from pathlib import Path
import base64
import zipfile

root = Path(__file__).resolve().parent
faces = []
for family, weight, style, file in [
    ('Haze Sans', 400, 'normal', 'noto-sans-regular.woff2'),
    ('Haze Sans', 700, 'normal', 'noto-sans-bold.woff2'),
    ('Haze Serif', 400, 'normal', 'noto-serif-regular.woff2'),
    ('Haze Serif', 400, 'italic', 'noto-serif-italic.woff2'),
]:
    encoded = base64.b64encode((root / 'fonts' / file).read_bytes()).decode('ascii')
    faces.append(f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{encoded}) format('woff2')}}")
license = (root / 'fonts' / 'LICENSE.txt').read_text().replace('*/', '* /')
faces.append('/* Embedded Noto fonts: copyright Google; SIL Open Font License 1.1.\n' + license + '\n*/')
css_template = (root / 'styles.css').read_text()
if css_template.count('/* FONT_FACES */') != 1:
    raise ValueError('styles.css needs exactly one FONT_FACES slot.')
css = css_template.replace('/* FONT_FACES */', '\n'.join(faces))
scripts = '\n'.join((root / name).read_text() for name in ['schema.js', 'presets.js', 'audio-engine.js', 'app.js']).replace('</script', '<\\/script')
template = (root / 'app.html').read_text()
if any(template.count(slot) != 1 for slot in ['<!-- STYLES -->', '<!-- SCRIPTS -->']):
    raise ValueError('app.html needs exactly one STYLES and SCRIPTS slot.')
html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>').replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
(root / 'index.html').write_text(html)
print(f'Built HAZE: {len(html.encode()):,} bytes, all assets embedded.')

if (root.parent / 'music' / 'README.md').exists():
    archive = root.parent / 'music' / 'haze' / 'HAZE-source.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    files = [root / name for name in ['app.html', 'styles.css', 'schema.js', 'presets.js', 'audio-engine.js', 'app.js', 'build.py', 'README.md']]
    files += sorted((root / 'fonts').glob('*'))
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in files:
            info = zipfile.ZipInfo('HAZE-source/' + str(path.relative_to(root)), (2026, 10, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, path.read_bytes())
    print(f'Packaged HAZE source: {archive.stat().st_size:,} bytes.')
