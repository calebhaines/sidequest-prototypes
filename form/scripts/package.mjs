import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { deflateRawSync } from "node:zlib";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const release = resolve(root, "releases");
const exchangeDirectory = [resolve(root,"shared"),resolve(root,"../shared")].find(path=>existsSync(resolve(path,"bundle_audio_exchange.mjs")));
if(!exchangeDirectory)throw Error("Missing Music Lab audio exchange sources.");
const {embedExchange,exchangeFiles}=await import(pathToFileURL(resolve(exchangeDirectory,"bundle_audio_exchange.mjs")).href);
await mkdir(release, { recursive: true });
let html = await readFile(resolve(dist, "index.html"), "utf8");
const scriptPath = html.match(/<script[^>]+src="([^"]+)"[^>]*><\/script>/)?.[1];
const stylePath = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)?.[1];
if (!scriptPath || !stylePath)
  throw new Error("Run npm run build before packaging.");
const js = await readFile(resolve(dist, scriptPath), "utf8");
let css = await readFile(resolve(dist, stylePath), "utf8");
const urls = [...css.matchAll(/url\((?:["']?)([^)'"\s]+)(?:["']?)\)/g)];
for (const [match, path] of urls) {
  if (/^(data:|https?:)/.test(path)) continue;
  const localPath = path.startsWith("/")
    ? resolve(dist, `.${path}`)
    : resolve(dirname(resolve(dist, stylePath)), path);
  const file = await readFile(localPath);
  const mime = path.endsWith(".woff2")
    ? "font/woff2"
    : path.endsWith(".svg")
      ? "image/svg+xml"
      : "application/octet-stream";
  css = css.replace(
    match,
    `url(data:${mime};base64,${file.toString("base64")})`,
  );
}
html = html.replace(/<script[^>]+src="[^"]+"[^>]*><\/script>/, "");
html = html.replace(
  /<link[^>]+href="[^"]+\.css"[^>]*>/,
  () => `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`,
);
html = html.replace(
  "</body>",
  () =>
    `<script type="module">${js.replace(/<\/script/gi, "<\\/script")}</script></body>`,
);
const favicon = await readFile(resolve(dist, "favicon.svg"));
html = html.replace(
  /href="\.\/favicon.svg"/,
  `href="data:image/svg+xml;base64,${favicon.toString("base64")}"`,
);
const fontLicenses = {
  "DM Sans": await readFile(resolve(dist, "fonts/DM-Sans-OFL.txt"), "utf8"),
  "Space Grotesk": await readFile(
    resolve(dist, "fonts/Space-Grotesk-OFL.txt"),
    "utf8",
  ),
};
html = html.replace(
  "</body>",
  () =>
    `<script type="application/json" id="font-licenses">${JSON.stringify(fontLicenses).replaceAll("<", "\\u003c")}</script></body>`,
);
html = html.replace(/^[ \t]+$/gm, "");
html = await embedExchange(html, root);
await writeFile(resolve(release, "FORM.html"), html);

// A standards-compliant ZIP with index.html at the root for direct hosting upload.
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let n = i;
  for (let bit = 0; bit < 8; bit++)
    n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
async function walk(folder, base = dist) {
  const entries = [];
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const path = resolve(folder, item.name);
    if (item.isDirectory()) entries.push(...(await walk(path, base)));
    else
      entries.push({
        name: relative(base, path).replaceAll("\\", "/"),
        data: await readFile(path),
      });
  }
  return entries;
}
function makeZip(files) {
  const locals = [],
    directories = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = deflateRawSync(file.data);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0);
    directory.writeUInt16LE(20, 4);
    directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x800, 8);
    directory.writeUInt16LE(8, 10);
    directory.writeUInt32LE(crc, 16);
    directory.writeUInt32LE(data.length, 20);
    directory.writeUInt32LE(file.data.length, 24);
    directory.writeUInt16LE(name.length, 28);
    directory.writeUInt32LE(offset, 42);
    directories.push(directory, name);
    offset += local.length + name.length + data.length;
  }
  const central = Buffer.concat(directories);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}
await writeFile(
  resolve(release, "FORM-hosting.zip"),
  makeZip(await walk(dist)),
);
const sourceFiles = [];
for(const name of exchangeFiles)sourceFiles.push({name:"shared/"+name,data:await readFile(resolve(exchangeDirectory,name))});
for (const folder of ["src", "public", "scripts"])
  sourceFiles.push(...(await walk(resolve(root, folder), root)));
for (const name of [
  "package.json",
  "package-lock.json",
  "index.html",
  "tsconfig.json",
  "vite.config.ts",
  ".gitignore",
  "README.md",
  "HOSTING.md",
  "VERIFICATION.md",
])
  sourceFiles.push({ name, data: await readFile(resolve(root, name)) });
await writeFile(resolve(release, "FORM-source.zip"), makeZip(sourceFiles));
const startHere = `HOTPLATE 2.0.3 — Kitchen

1. Extract this ZIP to a folder.
2. Open FORM.html in a current Chrome, Edge, Firefox, or Safari browser.
3. Click a pad or Audition sound to enable audio.

No installation, account, or internet connection is needed to use the app.
Your sounds and imported recordings are processed in your browser.

Sound engines opens the three synthesis layers. Click A, B, or C to edit a
layer; choose Subtractive, 4-op FM, Wavetable, Granular, or Percussion.
Connect layers adds FM, ring, or amplitude modulation. Modulation opens
the two LFOs and eight-route matrix. Export sample downloads WAVs or kits.

Use Audition layer A/B/C to hear the engine you are editing on its own.
The waveform play button plays the complete sound. A quiet layer may be
masked by other layers; its separate audition leaves your saved mix intact.

Granular imports use the first two seconds, converted to mono at 22.05 kHz.
Use Project options > Download project to back up patches and recordings.
Large recordings may exceed your browser's local storage allowance.

Want a normal website address? Create a free Cloudflare account and upload
FORM-hosting.zip using Pages Direct Upload. HOSTING.md has the full steps.
FORM-source.zip contains the editable project and instructions.
`;
await writeFile(
  resolve(release, "FORM-app.zip"),
  makeZip([
    { name: "FORM.html", data: Buffer.from(html) },
    { name: "START-HERE.txt", data: Buffer.from(startHere) },
    { name: "HOSTING.md", data: await readFile(resolve(root, "HOSTING.md")) },
    {
      name: "VERIFICATION.md",
      data: await readFile(resolve(root, "VERIFICATION.md")),
    },
    {
      name: "FORM-hosting.zip",
      data: await readFile(resolve(release, "FORM-hosting.zip")),
    },
    {
      name: "FORM-source.zip",
      data: await readFile(resolve(release, "FORM-source.zip")),
    },
  ]),
);
console.log("Ready: releases/FORM.html (open directly in your browser)");
console.log(
  "Ready: releases/FORM-app.zip (app, hosting files, and editable source)",
);
console.log("Ready: releases/FORM-hosting.zip (upload to Cloudflare Pages)");
console.log("Ready: releases/FORM-source.zip (complete editable project)");
