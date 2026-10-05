"""Embed Music Lab's sample exchange in an instrument and its source archive."""
from pathlib import Path
import json

APPS = {
    'grain': ('GrainApp', '#c6c493', '.topbar-right'),
    'form': ('FormApp', '#ed6847', '.topbar-actions'),
    'tine': ('TineApp', '#efab8e', '.topbar-right'),
    'mire': ('MireApp', '#adc18b', '.masthead-actions'),
    'spool': ('SpoolApp', '#dfb66f', '.masthead-actions'),
    'haze': ('HazeApp', '#b7a5e7', '.masthead nav'),
    'bower': ('BowerApp', '#c2d49b', '.masthead'),
    'ravel': ('RavelApp', '#ed9588', '.topline'),
    'loom': ('LoomApp', '#dce89b', '.topline'),
}

def exchange_directory(root):
    for candidate in [root / 'shared', root.parent / 'shared']:
        if (candidate / 'music-audio-exchange.js').is_file():
            return candidate
    raise FileNotFoundError('Missing shared Music Lab audio exchange sources.')

def embed_exchange(html, app, root):
    directory = exchange_directory(root)
    facade, accent, mount = APPS[app]
    css = (directory / 'music-audio-exchange.css').read_text()
    js = (directory / 'music-audio-exchange.js').read_text().replace('</script', '<\\/script')
    options = json.dumps({'id': app, 'name': app.upper(), 'accent': accent, 'mountSelector': mount}, separators=(',', ':'))
    registration = 'MusicLabExchange.register({...' + options + ',getAdapter:()=>window.' + facade + '});'
    marker = '<!-- MUSIC_LAB_EXCHANGE -->'
    if marker in html:
        raise ValueError('Audio exchange was already embedded.')
    return html.replace('</head>', marker + '\n<style>\n' + css + '\n</style>\n</head>', 1).replace('</body>', '<script>\n' + js + '\n' + registration + '\n</script>\n</body>', 1)

def exchange_sources(root):
    directory = exchange_directory(root)
    return [('shared/' + name, (directory / name).read_bytes()) for name in ['music-audio-exchange.js', 'music-audio-exchange.css', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md']]
