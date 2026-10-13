#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

// This alternate build leaves the normal, chunked site in dist untouched.
// Cached fonts are embedded rather than fetched, so both building and playing
// the download work without an internet connection.
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node scripts/build-single-html.mjs [output.html]');
  console.log('Default output: dist/lady-supine.html');
  process.exit(0);
}
if (args.length > 1 || args[0]?.startsWith('-')) {
  throw new Error('Expected one optional output filename. Use --help for usage.');
}
const destination = args[0]
  ? path.resolve(process.cwd(), args[0])
  : path.join(root, 'dist/lady-supine.html');

const stripRemoteLinks = html => html.replace(/\s*<link\b[^>]*>/gi, tag => (
  /\brel\s*=\s*["'](?:preconnect|icon)["']/i.test(tag)
  || /\bhref\s*=\s*["']https?:\/\//i.test(tag)
) ? '' : tag);
const asText = source => typeof source === 'string' ? source : Buffer.from(source).toString('utf8');
const escapeScript = source => source.replace(/<\/script/gi, '<\\/script');
// CSS escapes preserve a literal '<' without allowing a closing HTML tag.
const escapeStyle = source => source.replace(/<\/style/gi, '\\3c /style');

const result = await build({
  root,
  configFile: false,
  base: './',
  publicDir: false,
  plugins: [
    react(),
    {
      name: 'lady-supine-single-html-document',
      transformIndexHtml: { order: 'pre', handler: stripRemoteLinks },
    },
  ],
  build: {
    // The Rollup result is assembled in memory; no temporary build can empty
    // the hosted build's assets or overwrite its index.html.
    write: false,
    outDir: path.join(root, 'scratch/single-html-build'),
    emptyOutDir: false,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    target: 'es2020',
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
});

const bundles = Array.isArray(result) ? result : [result];
const output = bundles.flatMap(bundle => bundle.output);
const chunks = output.filter(asset => asset.type === 'chunk');
const pages = output.filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.html'));
const styles = output.filter(asset => asset.type === 'asset' && asset.fileName.endsWith('.css'));
const otherAssets = output.filter(asset => asset.type === 'asset' && !/\.(?:html|css)$/.test(asset.fileName));
if (chunks.length !== 1 || pages.length !== 1 || otherAssets.length) {
  throw new Error(`Single HTML requires one script and one document with no external assets; got ${chunks.length} scripts, ${pages.length} documents, and ${otherAssets.length} other assets.`);
}
if (chunks[0].imports.length || chunks[0].dynamicImports.length) {
  throw new Error('The downloadable script still contains an external module import.');
}

const fontDirectory = path.join(root, 'public/fonts');
let fontCss = await readFile(path.join(fontDirectory, 'fonts.css'), 'utf8');
const fontUrls = [...new Set([...fontCss.matchAll(/url\(([^)]+)\)/g)].map(match => match[1]))];
for (const fontUrl of fontUrls) {
  const relativePath = fontUrl.replace(/^["']|["']$/g, '');
  if (!relativePath.startsWith('./') || !relativePath.endsWith('.woff2')) {
    throw new Error(`Expected a locally cached WOFF2 font, found ${relativePath}`);
  }
  const fontPath = path.resolve(fontDirectory, relativePath);
  if (!fontPath.startsWith(fontDirectory + path.sep)) throw new Error('Font path leaves the cached font directory.');
  const bytes = await readFile(fontPath);
  fontCss = fontCss.replaceAll(`url(${fontUrl})`, `url("data:font/woff2;base64,${bytes.toString('base64')}")`);
}
const fontLicenses = await Promise.all(['dmsans', 'kalam', 'librebaskerville'].map(async family => (
  `\n${family}\n${await readFile(path.join(fontDirectory, `${family}-OFL.txt`), 'utf8')}`
)));
const favicon = await readFile(path.join(root, 'public/art/supine-mark.svg'));
const licenseNotice = `The embedded DM Sans, Kalam, and Libre Baskerville fonts are distributed under the SIL Open Font License 1.1.\n${fontLicenses.join('\n')}`.replaceAll('--', '- -');
let html = asText(pages[0].source);
html = html.replace(/<html\b([^>]*)>/i, '<html$1 data-single-html="true">');
html = html.replace(/\s*<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>/gi, '');
let scriptsReplaced = 0;
html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'][^"']+["'][^>]*>\s*<\/script>/gi, () => {
  scriptsReplaced += 1;
  return '';
});
if (scriptsReplaced !== 1) throw new Error(`Expected one generated script tag, found ${scriptsReplaced}.`);
// Vite puts its module entry in the head. A classic inline script must run
// after the root element exists, so the self-contained entry goes last.
html = html.replace('</body>', `<script>${escapeScript(chunks[0].code)}</script>\n</body>`);
const css = `${fontCss}\n${styles.map(asset => asText(asset.source)).join('\n')}`;
html = html.replace('</head>', `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,${favicon.toString('base64')}" />\n<style>${escapeStyle(css)}</style>\n<!-- ${licenseNotice} -->\n</head>`);

// Reject accidental future asset references instead of shipping a download
// that appears to work online but fails when opened from disk.
if (/<(?:script|link|img|source)\b[^>]*\b(?:src|href)\s*=\s*["'](?!data:|#)[^"']+["']/i.test(html)) {
  throw new Error('The downloadable document still references an external asset.');
}
for (const match of css.matchAll(/url\(\s*["']?([^"')\s]+)/g)) {
  if (!match[1].startsWith('data:') && !match[1].startsWith('#')) {
    throw new Error(`The downloadable stylesheet still references an external asset: ${match[1]}`);
  }
}
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, html);
console.log(`Single HTML: ${path.relative(process.cwd(), destination)} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB; ${fontUrls.length} embedded font files)`);
