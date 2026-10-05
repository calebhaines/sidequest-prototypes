"""Build BATTER: embedded recorded drums, offline HTML and editable source archive."""
from pathlib import Path
import json
import html as html_module
import runpy
import zipfile

root = Path(__file__).resolve().parent
exchange = root / 'shared' if (root / 'shared' / 'bundle_audio_exchange.py').is_file() else root.parent / 'shared'
helpers = runpy.run_path(str(exchange / 'bundle_audio_exchange.py'))
manifest = json.loads((root / 'factory-samples.json').read_text())
if manifest.get('format') != 'kitchen-batter-library' or not manifest.get('samples'):
    raise ValueError('BATTER needs a recorded, playable starter library.')
css = (root / 'styles.css').read_text()
js = 'window.BatterLibrary=' + json.dumps(manifest, separators=(',', ':')) + ';\n'
js += '\n'.join((root / name).read_text() for name in ['engine.js', 'app.js', 'adapters.js'])
js = js.replace('</script', '<\\/script')
template = (root / 'app.html').read_text()
credits = '<details class="sample-credits"><summary>Recorded sample credits & licenses</summary><pre>' + html_module.escape((root / 'SAMPLE-LICENSES.md').read_text()) + '</pre></details>'
template = template.replace('<!-- SAMPLE_CREDITS -->', credits)
for slot in ['<!-- STYLES -->', '<!-- SCRIPTS -->']:
    if template.count(slot) != 1:
        raise ValueError('BATTER template needs exactly one STYLES and SCRIPTS slot.')
html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>')
html = html.replace('<!-- SCRIPTS -->', '<script>\n' + js + '\n</script>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
html = helpers['embed_exchange'](html, 'batter', root)
if len(html.encode()) > 32 * 1024 * 1024:
    raise ValueError('BATTER HTML exceeds GALLEY’s 32 MB hosted instrument limit.')
(root / 'index.html').write_text(html)
print(f'Built BATTER: {len(html.encode()):,} bytes; {len(manifest["samples"])} real recorded starter samples.')
if (root.parent / 'music' / 'README.md').is_file():
    archive = root.parent / 'music' / 'batter' / 'BATTER-source.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    sources = ['app.html', 'styles.css', 'engine.js', 'app.js', 'adapters.js', 'build.py', 'README.md', 'SAMPLE-LICENSES.md', 'factory-samples.json']
    files = [(name, (root / name).read_bytes()) for name in sources]
    files += [(path.name, path.read_bytes()) for path in sorted(root.glob('*checks*')) if path.is_file()]
    files += [(path.relative_to(root).as_posix(), path.read_bytes()) for path in sorted(root.glob('*.txt'))]
    files += [(path.relative_to(root).as_posix(), path.read_bytes()) for path in sorted((root / 'samples').rglob('*')) if path.is_file() and (path.suffix in ('.md', '.txt') or path.parent.name == 'tools' or path.name.endswith('original-metadata.json'))]
    files += helpers['exchange_sources'](root)
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in files:
            info = zipfile.ZipInfo('BATTER-source/' + name, (2026, 10, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    print(f'Packaged BATTER source: {archive.stat().st_size:,} bytes; reproducible starter included.')
