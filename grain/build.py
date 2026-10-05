"""Bundle the entire instrument, including fonts, into a double-clickable HTML file."""
from pathlib import Path
import base64
import runpy

root = Path(__file__).resolve().parent
exchange_dir = root / 'shared' if (root / 'shared' / 'bundle_audio_exchange.py').exists() else root.parent / 'shared'
exchange_helpers = runpy.run_path(str(exchange_dir / 'bundle_audio_exchange.py'))
css = (root / 'styles.css').read_text()
faces = []
for weight, file in [(400, 'Regular'), (500, 'Medium'), (600, 'Semibold'), (700, 'Bold')]:
    path = Path('/usr/share/fonts/openai-sans') / f'OpenAISans-{file}.woff2'
    if path.exists():
        data = base64.b64encode(path.read_bytes()).decode()
        faces.append(f"@font-face{{font-family:'Grain Sans';font-style:normal;font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{data}) format('woff2')}}")
css = css.replace('/* FONT_FACES */', '\n'.join(faces))
scripts = '\n'.join((root / name).read_text() for name in ['synth-params.js', 'presets.js', 'audio-engine.js', 'voice-lab.js', 'app.js'])
html = (root / 'app.html').read_text().replace('<!-- STYLES -->', '<style>\n' + css + '\n</style>').replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
html = exchange_helpers['embed_exchange'](html, 'grain', root)
(root / 'index.html').write_text(html)
print(f'Built index.html: {len(html.encode()):,} bytes. No external dependencies.')
