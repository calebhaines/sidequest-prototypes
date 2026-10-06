"""Build MARINADE's self-contained HTML and reproducible editable source archive.

Python 3's standard library is the only build dependency. --output and --archive
allow checks to build isolated previews without changing the published files.
"""
from pathlib import Path
import argparse
import re
import runpy
import zipfile

ROOT = Path(__file__).resolve().parent
SCRIPTS = ['schema.js', 'sequence.js', 'sources.js', 'presets.js', 'analysis.js', 'audio-engine.js', 'app.js', 'adapters.js']


def standalone():
    directory = ROOT / 'shared' if (ROOT / 'shared' / 'bundle_audio_exchange.py').is_file() else ROOT.parent / 'shared'
    helpers = runpy.run_path(str(directory / 'bundle_audio_exchange.py'))
    template = (ROOT / 'app.html').read_text(encoding='utf-8')
    for marker in ['<!-- STYLES -->', '<!-- SCRIPTS -->']:
        if template.count(marker) != 1:
            raise ValueError('MARINADE template needs exactly one ' + marker + ' slot.')
    template = re.sub(r'<link\b[^>]*\bhref=[\"\']styles\.css[\"\'][^>]*>\s*', '', template, flags=re.IGNORECASE)
    local_scripts = SCRIPTS + ['../shared/pattern-schema.js', 'shared/pattern-schema.js']
    for source in local_scripts:
        template = re.sub(r'<script\b[^>]*\bsrc=[\"\']' + re.escape(source) + r'[\"\'][^>]*>\s*</script>\s*', '', template, flags=re.IGNORECASE)
    css = (ROOT / 'styles.css').read_text(encoding='utf-8')
    scripts = '\n'.join((ROOT / name).read_text(encoding='utf-8') for name in SCRIPTS)
    scripts = re.sub(r'</script', r'<\\/script', scripts, flags=re.IGNORECASE)
    html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>')
    html = html.replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
    html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
    html = helpers['embed_exchange'](html, 'marinade', ROOT)
    if re.search(r'<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=', html, flags=re.IGNORECASE):
        raise ValueError('MARINADE standalone still contains an external source dependency.')
    if len(html.encode('utf-8')) > 32 * 1024 * 1024:
        raise ValueError('MARINADE exceeds GALLEY’s 32 MB hosted instrument limit.')
    return html, helpers


def source_archive(target, helpers):
    sources = {'app.html', 'styles.css', *SCRIPTS, 'build.py', 'README.md'}
    sources.update(path.name for path in ROOT.iterdir() if path.is_file() and (path.suffix in ('.md', '.txt') or 'checks' in path.name))
    files = [(name, (ROOT / name).read_bytes()) for name in sorted(sources)]
    if (ROOT / 'fonts').is_dir():
        files.extend((path.relative_to(ROOT).as_posix(), path.read_bytes()) for path in sorted((ROOT / 'fonts').rglob('*')) if path.is_file())
    files.extend(helpers['exchange_sources'](ROOT))
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files):
            info = zipfile.ZipInfo('MARINADE-source/' + name, (2026, 10, 6, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    print(f'Packaged MARINADE source: {target.stat().st_size:,} bytes; {len(files)} files.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Standalone HTML destination (default: index.html beside this script).')
    parser.add_argument('--archive', type=Path, help='Editable ZIP destination; default: music/marinade/MARINADE-source.zip in the site checkout.')
    args = parser.parse_args()
    html, helpers = standalone()
    target = args.output or ROOT / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')
    print(f'Built MARINADE: {len(html.encode("utf-8")):,} bytes; all assets embedded.')
    archive = args.archive
    if archive is None and args.output is None and (ROOT.parent / 'music' / 'README.md').is_file():
        archive = ROOT.parent / 'music' / 'marinade' / 'MARINADE-source.zip'
    if archive is not None:
        source_archive(archive, helpers)


if __name__ == '__main__':
    main()
