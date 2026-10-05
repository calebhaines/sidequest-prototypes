"""Embed Kilter Kitchen's design, sample and pattern exchange in standalone apps."""
from pathlib import Path
import json
import re

APPS = {
    'grain': ('GrainApp', '#ff8d45', '.topbar-right'),
    'form': ('FormApp', '#ff8d45', '.topbar-actions'),
    'tine': ('TineApp', '#ddb181', '.topbar-right'),
    'mire': ('MireApp', '#dcc85e', '.masthead-actions'),
    'spool': ('SpoolApp', '#d9bd75', '.masthead-actions'),
    'haze': ('HazeApp', '#b1c3bb', '.masthead nav'),
    'bower': ('BowerApp', '#f0a27c', '.masthead'),
    'ravel': ('RavelApp', '#ff8d45', '.topline'),
    'fable': ('FableApp', '#f1ecdc', '.masthead-actions'),
    'loom': ('LoomApp', '#dcc85e', '.topline'),
}

# Presentation changes leave native facade names, packet provenance and app IDs intact.
APP_NAMES = {
    'grain': 'SIZZLE', 'tine': 'CLATTER', 'form': 'HOTPLATE', 'mire': 'REDUCE',
    'spool': 'ROTISSERIE', 'haze': 'STEAM', 'bower': 'SKEWER', 'ravel': 'DICER',
    'fable': 'STOCK', 'loom': 'GALLEY',
}

EXCHANGE_FILES = [
    'kilter-kitchen.css', 'KILTER-FONTS-LICENSE.txt',
    'music-audio-exchange.js', 'music-audio-exchange.css',
    'pattern-schema.js', 'pattern-pitched.js', 'pattern-drums.js',
    'music-patterns.js', 'music-patterns.css', 'pattern-checks.cjs',
    'PATTERN-CONTRACT.md', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md',
]

def exchange_directory(root):
    for candidate in [root / 'shared', root.parent / 'shared']:
        if (candidate / 'music-audio-exchange.js').is_file():
            return candidate
    raise FileNotFoundError('Missing shared Kilter Kitchen exchange sources.')

def embed_exchange(html, app, root):
    directory = exchange_directory(root)
    facade, accent, mount = APPS[app]
    css = '\n'.join((directory / name).read_text() for name in ['music-audio-exchange.css', 'music-patterns.css', 'kilter-kitchen.css'])
    audio_js = (directory / 'music-audio-exchange.js').read_text().replace('</script', '<\\/script')
    schema_js = (directory / 'pattern-schema.js').read_text().replace('</script', '<\\/script')
    pattern_js = '\n'.join((directory / name).read_text() for name in ['pattern-pitched.js', 'pattern-drums.js', 'music-patterns.js']).replace('</script', '<\\/script')
    options = json.dumps({'id': app, 'name': APP_NAMES[app], 'sourceApp': app.upper(), 'accent': accent, 'mountSelector': mount}, separators=(',', ':'))
    audio_registration = 'MusicLabExchange.register({...' + options + ',getAdapter:()=>window.' + facade + '});'
    pattern_registration = 'MusicLabPatterns.register({...' + options + ',getAdapter:()=>window.MusicLabPatternInstrument});'
    marker = '<!-- MUSIC_LAB_EXCHANGE -->'
    if marker in html:
        raise ValueError('Kilter Kitchen exchange was already embedded.')
    html = re.sub(r'<html(?=\s|>)', '<html data-musiclab-app="' + app + '"', html, count=1, flags=re.IGNORECASE)
    # Native schemas restore optional exact-note overlays during startup; schema must precede them.
    html, replacements = re.subn(r'<head(?:\s[^>]*)?>', lambda match: match.group(0) + '\n' + marker + '\n<script>\n' + schema_js + '\n</script>', html, count=1, flags=re.IGNORECASE)
    if replacements != 1:
        raise ValueError('Standalone HTML needs a head for shared pattern validation.')
    return html.replace('</head>', '\n<style>\n' + css + '\n</style>\n</head>', 1).replace('</body>', '<script>\n' + audio_js + '\n' + audio_registration + '\n</script>\n<script>\n' + pattern_js + '\n' + pattern_registration + '\n</script>\n</body>', 1)

def exchange_sources(root):
    directory = exchange_directory(root)
    return [('shared/' + name, (directory / name).read_bytes()) for name in EXCHANGE_FILES]
