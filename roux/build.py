"""Build ROUX as one offline HTML file and a reproducible editable source archive."""
from pathlib import Path
import runpy
import zipfile

root = Path(__file__).resolve().parent
exchange_dir = root / 'shared' if (root / 'shared' / 'bundle_audio_exchange.py').is_file() else root.parent / 'shared'
helpers = runpy.run_path(str(exchange_dir / 'bundle_audio_exchange.py'))

css = (root / 'styles.css').read_text()
scripts = '\n'.join((root / name).read_text() for name in ['schema.js', 'presets.js', 'audio-engine.js', 'app.js'])
scripts = scripts.replace('</script', '<\\/script')
template = (root / 'app.html').read_text()
for slot in ['<!-- STYLES -->', '<!-- SCRIPTS -->']:
    if template.count(slot) != 1:
        raise ValueError('app.html needs exactly one STYLES and SCRIPTS slot.')
html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>')
html = html.replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
html = helpers['embed_exchange'](html, 'roux', root)
(root / 'index.html').write_text(html)
print(f'Built ROUX: {len(html.encode()):,} bytes, all assets embedded.')

# Extracted sources rebuild index.html without needing the original repository.
# In the repository, publish an archive beside the standalone download as well.
if (root.parent / 'music' / 'README.md').is_file():
    archive = root.parent / 'music' / 'roux' / 'ROUX-source.zip'
    archive.parent.mkdir(parents=True, exist_ok=True)
    files = [(name, (root / name).read_bytes()) for name in [
        'app.html', 'styles.css', 'schema.js', 'presets.js', 'audio-engine.js',
        'app.js', 'build.py', 'README.md',
    ]]
    files += [(path.name, path.read_bytes()) for path in sorted(root.glob('*checks*')) if path.is_file()]
    files += helpers['exchange_sources'](root)
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name, data in files:
            info = zipfile.ZipInfo('ROUX-source/' + name, (2026, 10, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            z.writestr(info, data)
    print(f'Packaged ROUX source: {archive.stat().st_size:,} bytes.')
