import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'second-pour', 'dist');

if (!fs.existsSync(path.join(build, 'index.html'))) {
  throw new Error('Build Second Pour first: npm --prefix second-pour run build');
}

// Keep the parent Vite site and its GitHub Pages directory identical.
for (const parent of ['public', 'docs']) {
  const destination = path.join(root, parent, 'second-pour');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(build, destination, { recursive: true });
}

console.log('Synced Second Pour to public/second-pour and docs/second-pour.');
