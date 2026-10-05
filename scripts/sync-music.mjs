import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const music = path.join(root, 'music');
if (!fs.existsSync(path.join(music, 'index.html'))) {
  throw new Error('The Music Lab source page is missing: music/index.html');
}
const grain = fs.readFileSync(path.join(root, 'grain', 'index.html'));
const tine = fs.readFileSync(path.join(root, 'tine', 'index.html'));
const mire = fs.readFileSync(path.join(root, 'mire', 'index.html'));
const spool = fs.readFileSync(path.join(root, 'spool', 'index.html'));
const haze = fs.readFileSync(path.join(root, 'haze', 'index.html'));
const bower = fs.readFileSync(path.join(root, 'bower', 'index.html'));
const ravel = fs.readFileSync(path.join(root, 'ravel', 'index.html'));
const loom = fs.readFileSync(path.join(root, 'loom', 'index.html'));
const legacy = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#191d18">
  <title>GRAIN has moved to Music Lab</title>
  <link rel="canonical" href="https://calebhaines.github.io/sidequest-prototypes/music/grain/">
  <meta http-equiv="refresh" content="0;url=../music/grain/index.html">
  <style>
    :root{color-scheme:dark}body{margin:0;min-height:100vh;display:grid;place-content:center;padding:24px;box-sizing:border-box;background:#191d18;color:#edeedd;font:16px/1.7 system-ui,sans-serif}main{max-width:400px}h1{font-size:34px;letter-spacing:-1px;font-weight:500;margin:0 0 12px}p{color:#adb5a1;margin:0 0 24px}a{color:#e8aa80;text-underline-offset:5px}a:focus-visible{outline:2px solid #e8aa80;outline-offset:6px}
  </style>
  <script>
    location.replace((location.protocol === 'file:' ? '../music/grain/index.html' : '../music/grain/') + location.search + location.hash);
  </script>
</head>
<body><main><h1>GRAIN lives in Music Lab.</h1><p>Your drum machine has a new home alongside future music apps.</p><a href="../music/grain/index.html">Open GRAIN →</a></main></body>
</html>
`;

// Keep Vite's static files and GitHub Pages identical. Each instrument's
// generated page remains a complete standalone HTML file for offline use.
for (const directory of ['public', 'docs']) {
  // Future apps can live in music/<app-name>/ and are copied with their assets.
  fs.cpSync(music, path.join(root, directory, 'music'), {
    recursive: true,
    filter: source => !['README.md', '.DS_Store'].includes(path.basename(source)),
  });
  for (const [relative, content] of [
    ['music/grain/index.html', grain],
    ['music/tine/index.html', tine],
    ['music/mire/index.html', mire],
    ['music/spool/index.html', spool],
    ['music/haze/index.html', haze],
    ['music/bower/index.html', bower],
    ['music/ravel/index.html', ravel],
    ['music/loom/index.html', loom],
    ['grain/index.html', legacy],
  ]) {
    const target = path.join(root, directory, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}
console.log('Synced Music Lab, LOOM, its instruments, and the GRAIN compatibility redirect.');
