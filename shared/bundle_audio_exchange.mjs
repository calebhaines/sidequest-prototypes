import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export const exchangeFiles = ['music-audio-exchange.js', 'music-audio-exchange.css', 'bundle_audio_exchange.py', 'bundle_audio_exchange.mjs', 'README.md'];
export function exchangeDirectory(root) {
  const path = [resolve(root, 'shared'), resolve(root, '../shared')].find(path => existsSync(resolve(path, 'music-audio-exchange.js')));
  if (!path) throw Error('Missing shared Music Lab audio exchange sources.');
  return path;
}
export async function embedExchange(html, root) {
  const directory=exchangeDirectory(root),css=await readFile(resolve(directory,'music-audio-exchange.css'),'utf8'),js=await readFile(resolve(directory,'music-audio-exchange.js'),'utf8');
  if(html.includes('<!-- MUSIC_LAB_EXCHANGE -->'))throw Error('Audio exchange was already embedded.');
  const registration="MusicLabExchange.register({id:'form',name:'FORM',accent:'#ed6847',mountSelector:'.topbar-actions',getAdapter:()=>window.FormApp});";
  return html.replace('</head>',()=>`<!-- MUSIC_LAB_EXCHANGE --><style>${css}</style></head>`).replace('</body>',()=>`<script>${js.replace(/<\/script/gi,'<\\/script')}\n${registration}</script></body>`);
}
