import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = new URL('../public/ear-training/', import.meta.url);
const published = new URL('../docs/ear-training/', import.meta.url);
const files = ['index.html', 'styles.css', 'app.js', 'music.js', 'audio.js', 'pitch-test.js', 'ensemble.js', 'ensemble-ui.js', 'temperaments.js', 'temperament-test.js', 'temperament-ui.js'];
if (process.argv.includes('--check')) {
  for (const file of files) {
    if (!readFileSync(new URL(file, source)).equals(readFileSync(new URL(file, published)))) {
      throw new Error(`${file} differs between public/ and docs/. Run npm run ear-training:sync.`);
    }
  }
  console.log('Overtone source and GitHub Pages files match.');
} else {
  mkdirSync(published, { recursive: true });
  for (const file of files) cpSync(fileURLToPath(new URL(file, source)), fileURLToPath(new URL(file, published)));
  console.log('Synced Overtone to docs/ear-training/.');
}
