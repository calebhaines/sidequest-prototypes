"""Embed Music Lab's sample and editable-pattern exchange in standalone apps."""
from pathlib import Path
import json
import re

APPS = {
    'grain': ('GrainApp', '#c6c493', '.topbar-right'),
    'form': ('FormApp', '#ed6847', '.topbar-actions'),
    'tine': ('TineApp', '#efab8e', '.topbar-right'),
    'mire': ('MireApp', '#adc18b', '.masthead-actions'),
    'spool': ('SpoolApp', '#dfb66f', '.masthead-actions'),
    'haze': ('HazeApp', '#b7a5e7', '.masthead nav'),
    'bower': ('BowerApp', '#c2d49b', '.masthead'),
    'ravel': ('RavelApp', '#ed9588', '.topline'),
    'fable': ('FableApp', '#8bdacb', '.masthead-actions'),
    'loom': ('LoomApp', '#dce89b', '.topline'),
}

EXCHANGE_FILES = [
    'music-audio-exchange.js', 'music-audio-exchange.css',
    'pattern-schema.js', 'pattern-pitched.js', 'pattern-drums.js',
    'music-patterns.js', 'music-patterns.css', 'pattern-checks.cjs',
    'PATTERN-CONTRACT.md', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md',
]

def exchange_directory(root):
    for candidate in [root / 'shared', root.parent / 'shared']:
        if (candidate / 'music-audio-exchange.js').is_file():
            return candidate
    raise FileNotFoundError('Missing shared Music Lab exchange sources.')

def embed_exchange(html, app, root):
    directory = exchange_directory(root)
    facade, accent, mount = APPS[app]
    css = '\n'.join((directory / name).read_text() for name in ['music-audio-exchange.css', 'music-patterns.css'])
    audio_js = (directory / 'music-audio-exchange.js').read_text().replace('</script', '<\\/script')
    schema_js = (directory / 'pattern-schema.js').read_text().replace('</script', '<\\/script')
    pattern_js = '\n'.join((directory / name).read_text() for name in ['pattern-pitched.js', 'pattern-drums.js', 'music-patterns.js']).replace('</script', '<\\/script')
    options = json.dumps({'id': app, 'name': app.upper(), 'accent': accent, 'mountSelector': mount}, separators=(',', ':'))
    audio_registration = 'MusicLabExchange.register({...' + options + ',getAdapter:()=>window.' + facade + '});'
    pattern_registration = 'MusicLabPatterns.register({...' + options + ',getAdapter:()=>window.MusicLabPatternInstrument});'
    marker = '<!-- MUSIC_LAB_EXCHANGE -->'
    if marker in html:
        raise ValueError('Music Lab exchange was already embedded.')
    # Native schemas restore optional exact-note overlays during startup; schema must precede them.
    html, replacements = re.subn(r'<head(?:\s[^>]*)?>', lambda match: match.group(0) + '\n' + marker + '\n<script>\n' + schema_js + '\n</script>', html, count=1, flags=re.IGNORECASE)
    if replacements != 1:
        raise ValueError('Standalone HTML needs a head for shared pattern validation.')
    return html.replace('</head>', '\n<style>\n' + css + '\n</style>\n</head>', 1).replace('</body>', '<script>\n' + audio_js + '\n' + audio_registration + '\n</script>\n<script>\n' + pattern_js + '\n' + pattern_registration + '\n</script>\n</body>', 1)

def exchange_sources(root):
    directory = exchange_directory(root)
    return [('shared/' + name, (directory / name).read_bytes()) for name in EXCHANGE_FILES]
