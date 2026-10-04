"""Build TINE as a standalone browser instrument with all assets embedded."""
from pathlib import Path
import base64

root = Path(__file__).resolve().parent
css = (root / 'styles.css').read_text()
faces = []
for weight, name in [(400, 'Regular'), (500, 'Medium'), (600, 'Semibold'), (700, 'Bold')]:
    font = Path('/usr/share/fonts/openai-sans') / f'OpenAISans-{name}.woff2'
    if font.exists():
        encoded = base64.b64encode(font.read_bytes()).decode('ascii')
        faces.append(f"@font-face{{font-family:'Tine Sans';font-style:normal;font-weight:{weight};font-display:swap;src:url(data:font/woff2;base64,{encoded}) format('woff2')}}")
css = css.replace('/* FONT_FACES */', '\n'.join(faces))
scripts = '\n'.join((root / name).read_text() for name in [
    'synth-schema.js', 'presets.js', 'audio-engine.js', 'app.js'
])
scripts = scripts.replace('</script', '<\\/script')
html = (root / 'app.html').read_text().replace(
    '<!-- STYLES -->', '<style>\n' + css + '\n</style>'
).replace('<!-- SCRIPTS -->', '<script>\n' + scripts + '\n</script>')
(root / 'index.html').write_text(html)
print(f'Built TINE: {len(html.encode()):,} bytes, all assets embedded.')
