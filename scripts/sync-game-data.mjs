// Copies every JSON file in docs/Reference/Game/data into src/data/game (the L0 synced copy).
// Byte-for-byte copy; docs/ stays the single source of truth. Run: npm run sync:data
import { readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'docs/Reference/Game/data');
const dst = join(root, 'src/data/game');

if (!existsSync(src)) {
  console.error(`sync:data: ${src} not found`);
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
const files = readdirSync(src).filter((f) => f.endsWith('.json')).sort();
for (const f of files) copyFileSync(join(src, f), join(dst, f));
console.log(`sync:data: copied ${files.length} files`);
