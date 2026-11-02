"""Build GALLEY and its compatible reproducible editable source archive."""
from pathlib import Path
import base64
import runpy
import hashlib
import json
import zipfile
import gzip
import io

ROOT = Path(__file__).resolve().parent
exchange_dir = ROOT / 'shared' if (ROOT / 'shared' / 'bundle_audio_exchange.py').exists() else ROOT.parent / 'shared'
exchange_helpers = runpy.run_path(str(exchange_dir / 'bundle_audio_exchange.py'))
INSTRUMENTS = ['grain', 'form', 'tine', 'mire', 'spool', 'haze', 'bower', 'ravel', 'fable', 'roux', 'batter', 'proof', 'marinade', 'picnic', 'morsel', 'heirloom', 'brine', 'citrus']
SCRIPTS = ['vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'char-catalog.js', 'lofi-catalog.js', 'pedal-synth-catalog.js', 'deluxe-catalog.js', 'svt-catalog.js', 'guitar-pedals-catalog.js', 'effects-catalog.js', 'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'char-dsp.js', 'lofi-dsp.js', 'pedal-synth-tracker.js', 'pedal-midi-dsp.js', 'pedal-synth-dsp.js', 'deluxe-dsp.js', 'svt-dsp.js', 'guitar-pedals-dsp.js', 'effects.js', 'service-schema.js', 'lfo.js', 'schema.js', 'cpu-profiler.js', 'track-eq-dsp.js', 'mastering-dsp.js', 'audio-engine.js', 'service-capture.js', 'host-bridge.js', 'embedded-instruments.js', 'instrument-host.js', 'clip-transfer.js', 'lfo-ui.js', 'automation-ui.js', 'note-playback.js', 'note-renderer.js', 'piano-roll.js', 'note-workflow.js', 'service-midi.js', 'service-ui.js', 'service.js', 'cpu-ui.js', 'multiband-ui.js', 'freeze.js', 'recordings.js', 'recordings-ui.js', 'mastering-ui.js', 'deluxe-ui.js', 'master-playback-dsp.js', 'master-playback.js', 'master-playback-ui.js', 'svt-ui.js', 'guitar-pedals-ui.js', 'guitar-pedals-routing.js', 'pedal-midi.js', 'pedal-midi-ui.js', 'app.js']

bundled = {}
instrument_files = {}
for name in INSTRUMENTS:
    candidates = [ROOT / 'instruments' / (name + '.html')] + ([ROOT.parent / 'music' / name / 'index.html'] if name == 'form' else [ROOT.parent / name / 'index.html', ROOT.parent / 'music' / name / 'index.html'])
    source = next((p for p in candidates if p.is_file()), None)
    if source is None:
        raise FileNotFoundError('Missing bundled instrument: ' + name)
    data = source.read_bytes()
    instrument_files[name] = data
    if name == 'batter':
        # Lossless packing creates room for new equipment without changing BATTER.
        stream = io.BytesIO()
        with gzip.GzipFile(fileobj=stream, filename='', mode='wb', compresslevel=9, mtime=0) as archive:
            archive.write(data)
        packed = stream.getvalue()
        assert gzip.decompress(packed) == data
        bundled[name] = {'encoding': 'gzip-base64', 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(), 'data': base64.b64encode(packed).decode('ascii')}
    else:
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

css = (ROOT / 'styles.css').read_text() + '\n' + (ROOT / 'automation.css').read_text() + '\n' + (ROOT / 'lfo.css').read_text() + '\n' + (ROOT / 'piano-roll.css').read_text() + '\n' + (ROOT / 'kitchen.css').read_text() + '\n' + (ROOT / 'service.css').read_text() + '\n' + (ROOT / 'creative-effects.css').read_text() + '\n' + (ROOT / 'broiler.css').read_text() + '\n' + (ROOT / 'compressor.css').read_text() + '\n' + (ROOT / 'buses.css').read_text() + '\n' + (ROOT / 'preamp.css').read_text() + '\n' + (ROOT / 'track-eq.css').read_text() + '\n' + (ROOT / 'tape.css').read_text() + '\n' + (ROOT / 'cpu.css').read_text() + '\n' + (ROOT / 'multiband.css').read_text() + '\n' + (ROOT / 'freeze.css').read_text() + '\n' + (ROOT / 'lofi.css').read_text() + '\n' + (ROOT / 'pedal-synth.css').read_text() + '\n' + (ROOT / 'recordings.css').read_text() + '\n' + (ROOT / 'mastering.css').read_text() + '\n' + (ROOT / 'deluxe.css').read_text() + '\n' + (ROOT / 'master-playback.css').read_text() + '\n' + (ROOT / 'pedal-midi.css').read_text() + '\n' + (ROOT / 'svt.css').read_text() + '\n' + (ROOT / 'guitar-pedals.css').read_text()
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
if len(html.encode('utf-8')) >= 100 * 1024 * 1024:
    raise ValueError('GALLEY must remain below GitHub’s 100 MiB per-file limit.')
(ROOT / 'index.html').write_text(html)
print(f'Built GALLEY: {len(html.encode()):,} bytes; all {len(INSTRUMENTS)} Kitchen instruments and all assets embedded.')

if (ROOT.parent / 'music' / 'README.md').exists():
    target = ROOT.parent / 'music' / 'loom' / 'LOOM-source.zip'
    target.parent.mkdir(parents=True, exist_ok=True)
    sources = ['app.html', 'styles.css', 'automation.css', 'piano-roll.css', 'kitchen.css', *SCRIPTS, 'build.py', 'checks.cjs', 'note-checks.cjs', 'amp-checks.cjs', 'vocal-checks.cjs', 'vocal-browser-checks.cjs', 'utility-checks.cjs', 'utility-integration-checks.cjs', 'utility-browser-checks.cjs', 'batter-integration-checks.cjs', 'microphone-engine-checks.cjs', 'microphone-browser-checks.cjs', 'audio-interface-checks.cjs', 'audio-interface-browser-checks.cjs', 'README.md', 'HOSTING.md', 'demo-assets.json', 'demo-session.json']
    sources += ['service.css', 'service-schema-checks.cjs', 'service-engine-checks.cjs', 'service-note-checks.cjs', 'service-capture-checks.cjs', 'service-midi-checks.cjs', 'service-controller-checks.cjs', 'service-browser-checks.cjs', 'host-navigation-checks.cjs', 'creative-effects.css', 'filter-checks.cjs', 'creative-checks.cjs', 'creative-effects-integration-checks.cjs', 'creative-effects-browser-checks.cjs', 'tonal-print-timing-checks.cjs', 'tonal-live-timing-checks.cjs', 'tonal-fallback-clock-checks.cjs', 'transport-count-in-checks.cjs']
    sources += ['clip-loop-continuity-checks.cjs', 'host-node-lifecycle-checks.cjs', 'clatter-polyphony-checks.cjs', 'percussion-integration-checks.cjs']
    sources += ['broiler.css', 'BROILER-MODELS.md', 'broiler-workshop-checks.cjs', 'broiler-pedal-checks.cjs', 'broiler-browser-checks.cjs', 'broiler-project-checks.cjs', 'broiler-legacy-fixtures.json']
    sources += ['compressor.css', 'BUTTER-MODELS.md', 'compressor-checks.cjs', 'compressor-browser-checks.cjs', 'compressor-project-checks.cjs', 'compressor-legacy-fixtures.json']
    sources += ['buses.css', 'bus-schema-checks.cjs', 'bus-routing-checks.cjs', 'bus-review-checks.cjs', 'bus-browser-checks.cjs', 'bus-legacy-fixtures.json', 'bus-automation-checks.cjs']
    sources += ['preamp.css', 'SAUTE-MODELS.md', 'preamp-checks.cjs', 'preamp-project-checks.cjs', 'preamp-review-checks.cjs', 'preamp-browser-checks.cjs']
    sources += ['track-eq.css', 'track-eq-checks.cjs', 'track-eq-project-checks.cjs', 'track-eq-review-checks.cjs', 'track-eq-browser-checks.cjs']
    sources += ['voice-effect-clock-checks.cjs']
    sources += ['lyric-note-checks.cjs']
    sources += ['tape.css', 'PRESERVE-MODELS.md', 'tape-checks.cjs', 'tape-project-checks.cjs', 'tape-integration-checks.cjs', 'tape-browser-checks.cjs']
    sources += ['lfo.css', 'LFO-GUIDE.md', 'lfo-checks.cjs', 'lfo-service-checks.cjs', 'lfo-browser-checks.cjs']
    sources += ['cpu.css', 'CPU-GUIDE.md', 'cpu-checks.cjs', 'cpu-browser-checks.cjs']
    sources += ['multiband.css', 'CHAR-GUIDE.md', 'MIX-UPGRADE-GUIDE.md', 'char-checks.cjs', 'track-eq-sweep-checks.cjs', 'multiband-checks.cjs', 'mix-upgrade-checks.cjs', 'mix-upgrade-browser-checks.cjs']
    sources += ['PERFORMANCE-GUIDE.md', 'performance-regression-checks.cjs', 'performance-legacy-fixtures.json', 'effects-performance-checks.cjs', 'effects-performance-fixtures.json', 'ui-performance-checks.cjs']
    sources += ['freeze.css', 'FREEZE-GUIDE.md', 'freeze-checks.cjs', 'freeze-browser-checks.cjs']
    sources += ['lofi.css', 'TIN-CAN-GUIDE.md', 'lofi-checks.cjs', 'lofi-project-checks.cjs', 'lofi-browser-checks.cjs']
    sources += ['pedal-synth.css', 'FERMENT-GUIDE.md', 'pedal-synth-checks.cjs', 'pedal-synth-project-checks.cjs', 'pedal-synth-browser-checks.cjs']
    sources += ['recordings.css', 'RECORDINGS-GUIDE.md', 'recordings-checks.cjs', 'recordings-browser-checks.cjs', 'project-capacity-checks.cjs']
    sources += ['mastering.css', 'MASTERING-GUIDE.md', 'mastering-checks.cjs', 'ten-track-checks.cjs', 'mastering-browser-checks.cjs']
    sources += ['deluxe.css', 'DELUXE-REVERB-GUIDE.md', 'deluxe-checks.cjs', 'deluxe-project-checks.cjs', 'deluxe-browser-checks.cjs']
    sources += ['Signalsmith-Stretch-LICENSE.txt', 'master-playback.css', 'MASTER-PLAYBACK-GUIDE.md', 'master-playback-schema-checks.cjs', 'master-playback-dsp-checks.cjs', 'master-playback-render-checks.cjs', 'master-playback-checks.cjs', 'master-playback-browser-checks.cjs']
    sources += ['pedal-midi.css', 'FERMENT-MIDI-GUIDE.md', 'pedal-midi-checks.cjs', 'pedal-midi-engine-checks.cjs', 'pedal-midi-browser-checks.cjs', 'embedded-instruments-checks.cjs']
    sources += ['CPU-REVIEW-1.36.md', 'track-disable-project-checks.cjs', 'track-disable-engine-checks.cjs', 'track-disable-engine-fixtures.json', 'track-disable-integration-checks.cjs', 'disabled-host-checks.cjs', 'cpu-lifecycle-checks.cjs', 'performance-2026-checks.cjs', 'performance-2026-fixtures.json', 'performance-2026-browser-checks.cjs', 'exact-effects-cpu-checks.cjs', 'exact-effects-cpu-fixtures.json']
    sources += ['svt.css', 'guitar-pedals.css', 'CELLAR-CIRCUITS.md', 'BOARD-PEDALS.md', 'svt-checks.cjs', 'guitar-pedals-checks.cjs', 'cellar-board-project-checks.cjs', 'cellar-board-checks.cjs', 'cellar-board-browser-checks.cjs', 'cellar-board-legacy-fixtures.json']
    files = [(name, (ROOT / name).read_bytes()) for name in sources]
    # The clock regression executes the real standalone source engines. Keep
    # those fixtures with the editable download so its checks run offline too.
    timing_fixtures = ['shared/pattern-schema.js', 'proof/schema.js', 'proof/arp.js', 'proof/audio-engine.js', 'marinade/analysis.js', 'marinade/sources.js', 'marinade/schema.js', 'marinade/sequence.js', 'marinade/audio-engine.js']
    timing_fixtures += ['tine/' + name for name in ['app.html', 'styles.css', 'cancellation-checks.cjs']]
    timing_fixtures += ['tine/' + source.name for source in sorted((ROOT.parent / 'tine').glob('*.js'))]
    files += [('timing-fixtures/' + name, (ROOT.parent / name).read_bytes()) for name in timing_fixtures]
    files += exchange_helpers['exchange_sources'](ROOT)
    files += [('shared/pattern-lock-checks.cjs', (exchange_dir / 'pattern-lock-checks.cjs').read_bytes())]
    files += [('shared/percussion-browser-checks.cjs', (exchange_dir / 'percussion-browser-checks.cjs').read_bytes())]
    files += [(str(p.relative_to(ROOT)), p.read_bytes()) for p in sorted((ROOT / 'fonts').glob('*'))]
    files += [('instruments/' + name + '.html', data) for name, data in instrument_files.items()]
    # MORSEL is a separately licensed GPL speech instrument. Keep its complete
    # editable/corresponding-source distribution beside the hosted HTML.
    morsel_source = ROOT.parent / 'music' / 'morsel' / 'MORSEL-source.zip'
    files += [('MORSEL-source.zip', morsel_source.read_bytes())]
    # Preserve the new instrument’s editable DSP, recipes and research alongside its HTML.
    heirloom_source = ROOT.parent / 'music' / 'heirloom' / 'HEIRLOOM-source.zip'
    files += [('HEIRLOOM-source.zip', heirloom_source.read_bytes())]
    brine_source = ROOT.parent / 'music' / 'brine' / 'BRINE-source.zip'
    files += [('BRINE-source.zip', brine_source.read_bytes())]
    citrus_source = ROOT.parent / 'music' / 'citrus' / 'CITRUS-source.zip'
    files += [('CITRUS-source.zip', citrus_source.read_bytes())]
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in files:
            info = zipfile.ZipInfo('LOOM-source/' + name, (2026, 10, 5, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    if target.stat().st_size >= 100 * 1024 * 1024:
        raise ValueError('GALLEY’s source archive must remain below GitHub’s 100 MiB per-file limit.')
    print(f'Packaged GALLEY source: {target.stat().st_size:,} bytes, {len(files)} files.')
    print('Standalone SHA-256: ' + hashlib.sha256(html.encode()).hexdigest())
