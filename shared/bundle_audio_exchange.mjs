import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const exchangeFiles = [
  'kilter-kitchen.css', 'KILTER-FONTS-LICENSE.txt',
  'music-audio-exchange.js', 'music-audio-exchange.css',
  'pattern-schema.js', 'pattern-pitched.js', 'pattern-drums.js', 'pattern-bass.js',
  'music-patterns.js', 'music-patterns.css', 'pattern-checks.cjs',
  'PATTERN-CONTRACT.md', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md',
];
export function exchangeDirectory(root) {
  const path = [resolve(root, 'shared'), resolve(root, '../shared')].find(path => existsSync(resolve(path, 'music-audio-exchange.js')));
  if (!path) throw Error('Missing shared Kitchen exchange sources.');
  return path;
}
export async function embedExchange(html, root) {
  const directory = exchangeDirectory(root);
  const read = name => readFile(resolve(directory, name), 'utf8');
  const [audioCss, patternCss, kitchenCss, schema, audio, pitched, drums, bass, patterns] = await Promise.all([
    read('music-audio-exchange.css'), read('music-patterns.css'), read('kilter-kitchen.css'), read('pattern-schema.js'),
    read('music-audio-exchange.js'), read('pattern-pitched.js'), read('pattern-drums.js'), read('pattern-bass.js'), read('music-patterns.js'),
  ]);
  if (html.includes('<!-- MUSIC_LAB_EXCHANGE -->')) throw Error('Kitchen exchange was already embedded.');
  if (!/<head(?:\s[^>]*)?>/i.test(html)) throw Error('Standalone HTML needs a head for shared pattern validation.');
  const safe = js => js.replace(/<\/script/gi, '<\\/script');
  const audioRegistration = "MusicLabExchange.register({id:'form',name:'HOTPLATE',sourceApp:'FORM',accent:'#ff8d45',mountSelector:'.topbar-actions',getAdapter:()=>window.FormApp});";
  const patternRegistration = "MusicLabPatterns.register({id:'form',name:'HOTPLATE',sourceApp:'FORM',accent:'#ff8d45',mountSelector:'.topbar-actions',getAdapter:()=>window.MusicLabPatternInstrument});";
  return html.replace(/<html(?=\s|>)/i, '<html data-musiclab-app="form"')
    .replace(/<head(?:\s[^>]*)?>/i, match => `${match}\n<!-- MUSIC_LAB_EXCHANGE -->\n<script>${safe(schema)}</script>`)
    .replace('</head>', () => `<style>${audioCss}\n${patternCss}\n${kitchenCss}</style></head>`)
    .replace('</body>', () => `<script>${safe(audio)}\n${audioRegistration}</script>\n<script>${safe(pitched)}\n${safe(drums)}\n${safe(bass)}\n${safe(patterns)}\n${patternRegistration}</script></body>`);
}
