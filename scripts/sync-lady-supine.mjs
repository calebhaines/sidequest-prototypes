import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'lady-supine', 'dist');

if (!fs.existsSync(path.join(build, 'index.html'))) {
  throw new Error('Build Lady Supine first: npm --prefix lady-supine run build');
}

for (const parent of ['public', 'docs']) {
  const destination = path.join(root, parent, 'lady-supine');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(build, destination, { recursive: true });
}

console.log('Synced Lady Supine to public/lady-supine and docs/lady-supine.');
