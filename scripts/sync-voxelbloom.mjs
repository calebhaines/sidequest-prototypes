import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const build = path.join(root, 'voxelbloom', 'dist');

if (!fs.existsSync(path.join(build, 'index.html'))) {
  throw new Error('Build Voxelbloom first: npm --prefix voxelbloom run build');
}

// Keep the parent Vite site and its GitHub Pages directory identical.
for (const parent of ['public', 'docs']) {
  const destination = path.join(root, parent, 'voxelbloom');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(build, destination, { recursive: true });
}

console.log('Synced Voxelbloom to public/voxelbloom and docs/voxelbloom.');
