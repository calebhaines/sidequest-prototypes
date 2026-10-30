"""Embed Kitchen's design, sample and pattern exchange in standalone apps."""
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
    'roux': ('RouxApp', '#e7be76', '.masthead-actions'),
    'batter': ('BatterApp', '#dcaa6b', '.masthead-actions'),
    'proof': ('ProofApp', '#e6b86e', '.masthead-actions'),
    'marinade': ('MarinadeApp', '#dda775', '.masthead-actions'),
    'picnic': ('PicnicApp', '#7eae83', '.masthead-actions'),
    'morsel': ('MorselApp', '#ed8b59', '.masthead-actions'),
    'loom': ('LoomApp', '#dcc85e', '.topline'),
}

# Presentation changes leave native facade names, packet provenance and app IDs intact.
APP_NAMES = {
    'grain': 'SIZZLE', 'tine': 'CLATTER', 'form': 'HOTPLATE', 'mire': 'REDUCE',
    'spool': 'ROTISSERIE', 'haze': 'STEAM', 'bower': 'SKEWER', 'ravel': 'DICER',
    'fable': 'STOCK', 'roux': 'ROUX', 'batter': 'BATTER', 'proof': 'LEAVEN', 'marinade': 'MARINADE', 'picnic': 'PICNIC', 'morsel': 'MORSEL', 'loom': 'GALLEY',
}

EXCHANGE_FILES = [
    'kilter-kitchen.css', 'KILTER-FONTS-LICENSE.txt',
    'music-audio-exchange.js', 'music-audio-exchange.css',
    'pattern-schema.js', 'pattern-pitched.js', 'pattern-drums.js', 'pattern-bass.js',
    'music-patterns.js', 'music-patterns.css', 'pattern-checks.cjs', 'sequencing-adapter-checks.cjs',
    'PATTERN-CONTRACT.md', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md',
]

# These are the same catalog and DSP sources used by GALLEY. Source archives
# carry a frozen copy under shared/galley-effects; repository builds read loom/.
VOICE_EFFECT_FILES = [
    'vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js',
    'creative-catalog.js', 'preamp-catalog.js', 'effects-catalog.js',
    'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js',
    'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'effects.js',
]
PERCUSSION_APPS = {'grain', 'tine', 'form', 'batter'}

def insert_head_scripts(html, markup):
    head = re.search(r'<head(?:\s[^>]*)?>', html, flags=re.IGNORECASE)
    if not head:
        raise ValueError('Standalone HTML needs a head for shared sources.')
    head_end = html.lower().find('</head', head.end())
    charset = re.search(r'<meta\s+charset\s*=[^>]*>', html[head.end():head_end], flags=re.IGNORECASE)
    if charset:
        at = head.end() + charset.end()
        return html[:at] + markup + html[at:]
    return html[:head.end()] + '\n<meta charset="utf-8">' + markup + html[head.end():]

def voice_effect_directory(root):
    candidates = [root.parent / 'loom', root / 'shared' / 'galley-effects', root / 'galley-effects']
    for candidate in candidates:
        if all((candidate / name).is_file() for name in VOICE_EFFECT_FILES):
            return candidate
    raise FileNotFoundError('Missing GALLEY effects sources for percussion voice inserts.')

def embed_voice_effects(html, app, root):
    if app not in PERCUSSION_APPS:
        return html
    marker = '<!-- KITCHEN_VOICE_EFFECTS -->'
    if marker in html:
        return html
    directory = exchange_directory(root)
    effects = voice_effect_directory(root)
    script = '\n'.join((effects / name).read_text() for name in VOICE_EFFECT_FILES)
    script += '\n' + (directory / 'voice-effects.js').read_text()
    script = script.replace('</script', '<\\/script')
    css = (directory / 'voice-effects.css').read_text().replace('</style', '<\\/style')
    injection = '\n' + marker + '\n<script data-kitchen-voice-effects>\n' + script + '\n</script>\n<style data-kitchen-voice-effects>\n' + css + '\n</style>\n'
    return insert_head_scripts(html, injection)

def exchange_directory(root):
    for candidate in [root / 'shared', root.parent / 'shared']:
        if (candidate / 'music-audio-exchange.js').is_file():
            return candidate
    raise FileNotFoundError('Missing shared Kitchen exchange sources.')

def embed_exchange(html, app, root):
    html = embed_voice_effects(html, app, root)
    directory = exchange_directory(root)
    facade, accent, mount = APPS[app]
    css = '\n'.join((directory / name).read_text() for name in ['music-audio-exchange.css', 'music-patterns.css', 'kilter-kitchen.css'])
    audio_js = (directory / 'music-audio-exchange.js').read_text().replace('</script', '<\\/script')
    schema_js = (directory / 'pattern-schema.js').read_text().replace('</script', '<\\/script')
    pattern_js = '\n'.join((directory / name).read_text() for name in ['pattern-pitched.js', 'pattern-drums.js', 'pattern-bass.js', 'music-patterns.js']).replace('</script', '<\\/script')
    options = json.dumps({'id': app, 'name': APP_NAMES[app], 'sourceApp': app.upper(), 'accent': accent, 'mountSelector': mount}, separators=(',', ':'))
    audio_registration = 'MusicLabExchange.register({...' + options + ',getAdapter:()=>window.' + facade + '});'
    pattern_registration = 'MusicLabPatterns.register({...' + options + ',getAdapter:()=>window.MusicLabPatternInstrument});'
    marker = '<!-- MUSIC_LAB_EXCHANGE -->'
    if marker in html:
        raise ValueError('Kitchen exchange was already embedded.')
    html = re.sub(r'<html(?=\s|>)', '<html data-musiclab-app="' + app + '"', html, count=1, flags=re.IGNORECASE)
    # Native schemas restore optional exact-note overlays during startup; schema must precede them.
    html = insert_head_scripts(html, '\n' + marker + '\n<script>\n' + schema_js + '\n</script>')
    return html.replace('</head>', '\n<style>\n' + css + '\n</style>\n</head>', 1).replace('</body>', '<script>\n' + audio_js + '\n' + audio_registration + '\n</script>\n<script>\n' + pattern_js + '\n' + pattern_registration + '\n</script>\n</body>', 1)

def exchange_sources(root):
    directory = exchange_directory(root)
    files = [('shared/' + name, (directory / name).read_bytes()) for name in EXCHANGE_FILES]
    if root.name in PERCUSSION_APPS or root.name in {'loom', 'LOOM-source', 'BATTER-source'}:
        files += voice_effect_sources(root)
    return files

def voice_effect_sources(root):
    directory = exchange_directory(root)
    effects = voice_effect_directory(root)
    names = ['voice-effects.js', 'voice-effects.css', 'voice-effects-checks.cjs', 'VOICE-EFFECTS.md', 'percussion-voice-fx-browser-checks.cjs']
    files = [('shared/' + name, (directory / name).read_bytes()) for name in names]
    files += [('shared/galley-effects/' + name, (effects / name).read_bytes()) for name in VOICE_EFFECT_FILES]
    return files
