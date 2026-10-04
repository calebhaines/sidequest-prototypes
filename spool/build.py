"""Build SPOOL's standalone HTML and reproducible editable source download."""
from pathlib import Path
import base64
import zipfile

root = Path(__file__).resolve().parent
faces = []
for family, weight, style, file in [
    ('Spool Sans', 400, 'normal', 'noto-sans-regular.woff2'),
    ('Spool Sans', 700, 'normal', 'noto-sans-bold.woff2'),
    ('Spool Serif', 400, 'normal', 'noto-serif-regular.woff2'),
    ('Spool Serif', 400, 'italic', 'noto-serif-italic.woff2'),
]:
    encoded = base64.b64encode((root / 'fonts' / file).read_bytes()).decode('ascii')
    faces.append(f"@font-face{{font-family:'{family}';font-style:{style};font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{encoded}) format('woff2')}}")
license = (root / 'fonts' / 'LICENSE.txt').read_text().replace('*/', '* /')
faces.append('/* Embedded Noto fonts: copyright Google; SIL Open Font License 1.1.\n' + license + '\n*/')
css = (root / 'styles.css').read_text().replace('/* FONT_FACES */', '\n'.join(faces))
scripts = '\n'.join((root / name).read_text() for name in ['schema.js', 'presets.js', 'audio-engine.js', 'app.js']).replace('</script', '<\\/script')
html = (root / 'app.html').read_text().replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>').replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
(root / 'index.html').write_text(html)
print(f'Built SPOOL: {len(html.encode()):,} bytes, all assets embedded.')

if (root.parent / 'music' / 'README.md').exists():
    archive = root.parent / 'music' / 'spool' / 'SPOOL-source.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    files = [root / name for name in ['app.html', 'styles.css', 'schema.js', 'presets.js', 'audio-engine.js', 'app.js', 'build.py', 'README.md']]
    files += sorted((root / 'fonts').glob('*'))
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in files:
            info = zipfile.ZipInfo('SPOOL-source/' + str(path.relative_to(root)), (2026, 10, 4, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, path.read_bytes())
    print(f'Packaged SPOOL source: {archive.stat().st_size:,} bytes.')
