import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const output = path.join(root, 'downloads');
const browserOutput = path.join(root, 'public', 'downloads');
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(browserOutput, { recursive: true });
// Keep previous generated downloads out of the fresh website build.
for (const name of ['sidequest-play.html', 'sidequest-prototypes.zip']) {
  const file = path.join(browserOutput, name);
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

const dist = path.join(root, 'dist');
const read = file => fs.readFileSync(file, 'utf8');
const assets = fs.readdirSync(path.join(dist, 'assets'));
const jsName = assets.find(file => file.endsWith('.js'));
const cssName = assets.find(file => file.endsWith('.css'));
if (!jsName || !cssName || assets.filter(file => file.endsWith('.js')).length !== 1) {
  throw new Error('Standalone packaging expects one JavaScript entry bundle and one stylesheet.');
}
let css = read(path.join(dist, 'assets', cssName));
css = css.replace(/url\(\/?fonts\/([^)]+)\)/g, (_, rawName) => {
  const name = rawName.replace(/["']/g, '');
  const font = fs.readFileSync(path.join(root, 'public', 'fonts', name));
  return `url(data:font/ttf;base64,${font.toString('base64')})`;
});
const script = read(path.join(dist, 'assets', jsName)).replace(/<\/script/gi, '<\\/script');
const favicon = Buffer.from(read(path.join(root, 'public', 'favicon.svg'))).toString('base64');
const standalone = `<!doctype html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#f7f6f1">
<meta name="sidequest-version" content="${version}">
<title>Sidequest — Six playable pixel RPG prototypes</title>
<link rel="icon" href="data:image/svg+xml;base64,${favicon}">
<style>${css}</style>
</head><body><div id="app"></div><script type="module">${script}</script></body></html>\n`;
const standalonePath = path.join(output, 'sidequest-play.html');
fs.writeFileSync(standalonePath, standalone);
fs.copyFileSync(standalonePath, path.join(browserOutput, 'sidequest-play.html'));
// The packaged static website can download the standalone game without a
// recursive copy of its own ZIP. The development gallery serves the ZIP.
const websiteDownloads = path.join(dist, 'downloads');
fs.mkdirSync(websiteDownloads, { recursive: true });
fs.copyFileSync(standalonePath, path.join(websiteDownloads, 'sidequest-play.html'));
fs.writeFileSync(path.join(dist, 'assets', jsName), script.replaceAll('/downloads/sidequest-prototypes.zip', '/downloads/sidequest-play.html'));

const instructions = `SIDEQUEST — SIX PLAYABLE PIXEL RPG PROTOTYPES (${version})

QUICKEST WAY TO PLAY
1. Extract this ZIP.
2. Double-click PLAY.html, or open it in Chrome, Edge, Firefox, or Safari.
3. Pick a world and press Play prototype.

All six games, fonts, and pixel art are inside PLAY.html.
No installation, account, internet connection, or server is needed.
If your browser downloads HTML instead of opening it, save it first and
then use your browser's Open File command.

THE WORLDS
01 Moss & Myth — woodland fantasy and ancient magic.
02 Neon Afterglow — cyberpunk city, street stories, and drones.
03 The Dustlands — desert salvage and a town running out of water.
04 Borrowed Sky — a surreal suburb and the missing Thursday.
05 Velvet Static — an uncanny town, dream crossings, and contradictory witnesses.
06 Hidden Ember — bright shinobi village, chakra, jutsus, and clan loyalties.

Velvet Static and Hidden Ember are the two finalists. Hidden Ember now features
an orange-clad genin, carved mountain faces, ramen stalls, and blue chakra effects.

CONTROLS
WASD / arrows: Move    Shift: Sprint    E / Enter: Talk or interact
Space: Attack    M: World map    Escape: Close dialogue/map or leave
Velvet Static: Q crosses between waking and dream; Space uses a camera flash.
Hidden Ember: 1 Ember Release, 2 Shadow Clone, 3 Substitution; Space throws kunai.
Small-screen browsers show touch controls. Ambient sound is optional.

Your chosen world and shortlist are stored in your browser, when local
file storage is available. Gameplay starts fresh when you re-enter a world.

IN THIS ZIP
PLAY.html — standalone, ready-to-play version containing all six worlds.
website/ — production web build; serve this folder as a static website.
source/ — complete editable Vite project, including original source art.

SOURCE DEVELOPMENT
Install Node.js 20.19+ or 22.12+.
In the source folder run: npm ci, then npm run dev.
To build the website: npm run build.
To regenerate downloadable files: npm run package (requires Python 3).

These are small playable concept prototypes, not finished huge open worlds.
Font licenses are included in source/public/fonts and website/fonts.
`;
const entries = [{ source: standalonePath, name: 'sidequest/PLAY.html' }];
const instructionsPath = path.join(output, 'START-HERE.txt');
fs.writeFileSync(instructionsPath, instructions);
entries.push({ source: instructionsPath, name: 'sidequest/START-HERE.txt' });
function walk(directory, prefix, exclude = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (exclude.includes(entry.name)) continue;
    const source = path.join(directory, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) walk(source, name, exclude);
    else entries.push({ source, name });
  }
}
walk(dist, 'sidequest/website');
for (const directory of ['src', 'public', 'scripts']) {
  walk(path.join(root, directory), `sidequest/source/${directory}`, ['downloads']);
}
for (const name of ['index.html', 'package.json', 'package-lock.json', 'README.md', '.gitignore']) {
  entries.push({ source: path.join(root, name), name: `sidequest/source/${name}` });
}
const zipPath = path.join(output, 'sidequest-prototypes.zip');
const manifestPath = path.join(output, '.package-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify({ output: zipPath, entries }));
const python = `import sys,json,zipfile
with open(sys.argv[1]) as f: manifest=json.load(f)
with zipfile.ZipFile(manifest['output'],'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for entry in manifest['entries']:
        z.write(entry['source'],entry['name'])
with zipfile.ZipFile(manifest['output']) as z:
    assert z.testzip() is None
    print('Archive verified:',len(z.namelist()),'files')
`;
execFileSync('python3', ['-c', python, manifestPath], { stdio: 'inherit' });
fs.unlinkSync(manifestPath);
fs.copyFileSync(zipPath, path.join(browserOutput, 'sidequest-prototypes.zip'));
console.log(`Standalone: ${standalonePath} (${fs.statSync(standalonePath).size.toLocaleString()} bytes)`);
console.log(`All six + source: ${zipPath} (${fs.statSync(zipPath).size.toLocaleString()} bytes)`);
