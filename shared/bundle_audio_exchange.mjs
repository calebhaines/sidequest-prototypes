import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const exchangeFiles = [
  'kilter-kitchen.css', 'KILTER-FONTS-LICENSE.txt',
  'music-audio-exchange.js', 'music-audio-exchange.css',
  'pattern-schema.js', 'pattern-pitched.js', 'pattern-drums.js', 'pattern-bass.js',
  'music-patterns.js', 'music-patterns.css', 'pattern-checks.cjs', 'sequencing-adapter-checks.cjs',
  'PATTERN-CONTRACT.md', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md',
];
export const voiceEffectFiles = [
  'vocal-catalog.js', 'utility-catalog.js', 'filter-catalog.js', 'creative-catalog.js', 'preamp-catalog.js', 'tape-catalog.js', 'effects-catalog.js',
  'vocal-dsp.js', 'utility-dsp.js', 'filter-dsp.js', 'creative-dsp.js', 'broiler-pedals.js', 'compressor-dsp.js', 'preamp-dsp.js', 'tape-dsp.js', 'effects.js',
];
function insertHeadScripts(html, markup) {
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (!head) throw Error('Standalone HTML needs a head for shared sources.');
  const start = head.index + head[0].length, end = html.toLowerCase().indexOf('</head', start);
  const charset = /<meta\s+charset\s*=[^>]*>/i.exec(html.slice(start, end));
  const at = charset ? start + charset.index + charset[0].length : start;
  return html.slice(0, at) + (charset ? '' : '\n<meta charset="utf-8">') + markup + html.slice(at);
}
export function voiceEffectDirectory(root) {
  const directory = [resolve(root, '../loom'), resolve(root, 'shared/galley-effects'), resolve(root, 'galley-effects')]
    .find(candidate => voiceEffectFiles.every(name => existsSync(resolve(candidate, name))));
  if (!directory) throw Error('Missing GALLEY effects sources for percussion voice inserts.');
  return directory;
}
export async function voiceEffectSources(root) {
  const directory = exchangeDirectory(root), effects = voiceEffectDirectory(root);
  const names = ['voice-effects.js', 'voice-effects.css', 'voice-effects-checks.cjs', 'VOICE-EFFECTS.md', 'percussion-voice-fx-browser-checks.cjs'];
  return await Promise.all([
    ...names.map(async name => ({ name: 'shared/' + name, data: await readFile(resolve(directory, name)) })),
    ...voiceEffectFiles.map(async name => ({ name: 'shared/galley-effects/' + name, data: await readFile(resolve(effects, name)) })),
  ]);
}
export async function embedVoiceEffects(html, root) {
  if (html.includes('<!-- KITCHEN_VOICE_EFFECTS -->')) return html;
  const directory = exchangeDirectory(root), effects = voiceEffectDirectory(root);
  const scripts = await Promise.all(voiceEffectFiles.map(name => readFile(resolve(effects, name), 'utf8')));
  scripts.push(await readFile(resolve(directory, 'voice-effects.js'), 'utf8'));
  const css = (await readFile(resolve(directory, 'voice-effects.css'), 'utf8')).replace(/<\/style/gi, '<\\/style');
  const js = scripts.join('\n').replace(/<\/script/gi, '<\\/script');
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('Percussion HTML needs a head for its voice effects.');
  return insertHeadScripts(html, `\n<!-- KITCHEN_VOICE_EFFECTS -->\n<script data-kitchen-voice-effects>${js}</script>\n<style data-kitchen-voice-effects>${css}</style>`);
}
export function exchangeDirectory(root) {
  const path = [resolve(root, 'shared'), resolve(root, '../shared')].find(path => existsSync(resolve(path, 'music-audio-exchange.js')));
  if (!path) throw Error('Missing shared Kitchen exchange sources.');
  return path;
}
export async function embedExchange(html, root, app = 'form') {
  if (!['form', 'proof', 'marinade'].includes(app)) throw Error('Choose a registered Kitchen app.');
  if (app === 'form') html = await embedVoiceEffects(html, root);
  const directory = exchangeDirectory(root);
  const read = name => readFile(resolve(directory, name), 'utf8');
  const [audioCss, patternCss, kitchenCss, schema, audio, pitched, drums, bass, patterns] = await Promise.all([
    read('music-audio-exchange.css'), read('music-patterns.css'), read('kilter-kitchen.css'), read('pattern-schema.js'),
    read('music-audio-exchange.js'), read('pattern-pitched.js'), read('pattern-drums.js'), read('pattern-bass.js'), read('music-patterns.js'),
  ]);
  if (html.includes('<!-- MUSIC_LAB_EXCHANGE -->')) throw Error('Kitchen exchange was already embedded.');
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('Standalone HTML needs a head for shared pattern validation.');
  const safe = js => js.replace(/<\/script/gi, '<\\/script');
  const audioRegistration = app === 'marinade'
    ? "MusicLabExchange.register({id:'marinade',name:'MARINADE',sourceApp:'MARINADE',accent:'#dda775',mountSelector:'.masthead-actions',getAdapter:()=>window.MarinadeApp});"
    : app === 'proof'
    ? "MusicLabExchange.register({id:'proof',name:'LEAVEN',sourceApp:'PROOF',accent:'#e6b86e',mountSelector:'.masthead-actions',getAdapter:()=>window.ProofApp});"
    : "MusicLabExchange.register({id:'form',name:'HOTPLATE',sourceApp:'FORM',accent:'#ff8d45',mountSelector:'.topbar-actions',getAdapter:()=>window.FormApp});";
  const patternRegistration = app === 'marinade'
    ? "MusicLabPatterns.register({id:'marinade',name:'MARINADE',sourceApp:'MARINADE',accent:'#dda775',mountSelector:'.masthead-actions',getAdapter:()=>window.MusicLabPatternInstrument});"
    : app === 'proof'
    ? "MusicLabPatterns.register({id:'proof',name:'LEAVEN',sourceApp:'PROOF',accent:'#e6b86e',mountSelector:'.masthead-actions',getAdapter:()=>window.MusicLabPatternInstrument});"
    : "MusicLabPatterns.register({id:'form',name:'HOTPLATE',sourceApp:'FORM',accent:'#ff8d45',mountSelector:'.topbar-actions',getAdapter:()=>window.MusicLabPatternInstrument});";
  return insertHeadScripts(html.replace(/<html(?=\s|>)/i, '<html data-musiclab-app="' + app + '"'), `\n<!-- MUSIC_LAB_EXCHANGE -->\n<script>${safe(schema)}</script>`)
    .replace('</head>', () => `<style>${audioCss}\n${patternCss}\n${kitchenCss}</style></head>`)
    .replace('</body>', () => `<script>${safe(audio)}\n${audioRegistration}</script>\n<script>${safe(pitched)}\n${safe(drums)}\n${safe(bass)}\n${safe(patterns)}\n${patternRegistration}</script></body>`);
}
