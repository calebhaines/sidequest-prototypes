"""Build MORSEL's offline instrument and reproducible editable source download.

Only Python 3's standard library is required. The bundled speech engine and its
English dictionary are local; building and playing require no network access.
"""
from pathlib import Path
import argparse
import re
import runpy
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parent
SCRIPTS = ['schema.js', 'sequence.js', 'vendor/speech-assets.js', 'speech-source.js', 'vendor/signalsmith/assets.js',
           'audio-engine.js', 'presets.js', 'app.js', 'adapters.js']


def standalone():
    for script in ['vendor/build-assets.py', 'vendor/signalsmith/build-assets.py']:
        subprocess.run([sys.executable, str(ROOT / script)], check=True)
    directory = ROOT / 'shared' if (ROOT / 'shared' / 'bundle_audio_exchange.py').is_file() else ROOT.parent / 'shared'
    helpers = runpy.run_path(str(directory / 'bundle_audio_exchange.py'))
    template = (ROOT / 'app.html').read_text(encoding='utf-8')
    for marker in ['<!-- STYLES -->', '<!-- SCRIPTS -->']:
        if template.count(marker) != 1:
            raise ValueError('MORSEL template needs exactly one ' + marker + ' slot.')
    template = re.sub(r'<link\b[^>]*\bhref=[\"\']styles\.css[\"\'][^>]*>\s*', '', template, flags=re.IGNORECASE)
    for source in SCRIPTS + ['../shared/pattern-schema.js', 'shared/pattern-schema.js']:
        template = re.sub(r'<script\b[^>]*\bsrc=[\"\']' + re.escape(source) + r'[\"\'][^>]*>\s*</script>\s*', '', template, flags=re.IGNORECASE)
    css = (ROOT / 'styles.css').read_text(encoding='utf-8')
    scripts = '\n'.join((ROOT / name).read_text(encoding='utf-8') for name in SCRIPTS)
    scripts = re.sub(r'</script', r'<\\/script', scripts, flags=re.IGNORECASE)
    # Keep licensing available inside the offline file as well as its source ZIP.
    licenses = ['vendor/COPYING', 'vendor/neural/MODEL-LICENSE.txt', 'vendor/neural/ORT-LICENSE.txt',
                'vendor/neural/ORT-ThirdPartyNotices.txt', 'vendor/neural/PHONEMIZER-LICENSE.txt',
                'vendor/signalsmith/LICENSE.txt']
    credits = '\n'.join('<script type="text/plain" data-morsel-license="' + name + '">' +
                        (ROOT / name).read_text(encoding='utf-8').replace('</script', '<\\/script') +
                        '</script>' for name in licenses)
    html = template.replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>')
    html = html.replace('<!-- SCRIPTS -->', credits + '\n<script>\n' + scripts + '\n</script>')
    html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
    html = helpers['embed_exchange'](html, 'morsel', ROOT)
    if re.search(r'<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=', html, flags=re.IGNORECASE):
        raise ValueError('MORSEL standalone still contains an external source dependency.')
    if len(html.encode('utf-8')) > 36 * 1024 * 1024:
        raise ValueError('MORSEL exceeds GALLEY’s 36 MiB hosted instrument limit.')
    if html.lower().index('<meta charset') > 1024:
        raise ValueError('MORSEL needs an early UTF-8 declaration.')
    return html, helpers


def source_archive(target, helpers):
    files = []
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT)
        if not path.is_file() or any(part in {'node_modules', '__pycache__', '.git'} for part in rel.parts):
            continue
        if rel.as_posix() in {'index.html', 'vendor/speech-assets.js'} or path.suffix in {'.pyc', '.log'}:
            continue
        files.append((rel.as_posix(), path.read_bytes()))
    # Extracted archives already carry shared sources; avoid duplicate entries.
    names = {name for name, _ in files}
    files.extend((name, data) for name, data in helpers['exchange_sources'](ROOT) if name not in names)
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files):
            info = zipfile.ZipInfo('MORSEL-source/' + name, (2026, 10, 30, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    print(f'Packaged MORSEL source: {target.stat().st_size:,} bytes; {len(files)} files.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Standalone destination; default index.html beside this script.')
    parser.add_argument('--archive', type=Path, help='Source ZIP destination; default music/morsel/MORSEL-source.zip in this checkout.')
    args = parser.parse_args()
    html, helpers = standalone()
    target = args.output or ROOT / 'index.html'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding='utf-8')
    print(f'Built MORSEL: {len(html.encode("utf-8")):,} bytes; all speech, English dictionary and artwork embedded.')
    archive = args.archive
    if archive is None and args.output is None and (ROOT.parent / 'music' / 'README.md').is_file():
        archive = ROOT.parent / 'music' / 'morsel' / 'MORSEL-source.zip'
    if archive is not None:
        source_archive(archive, helpers)


if __name__ == '__main__':
    main()
