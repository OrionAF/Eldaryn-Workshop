import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const docsDir = join(process.cwd(), 'docs/Reference/Game/data');
const copyDir = join(process.cwd(), 'src/data/game');
const hasDocs = existsSync(docsDir);
const docFiles = hasDocs ? readdirSync(docsDir).filter((f) => f.endsWith('.json')) : [];

describe.skipIf(!hasDocs)('synced game data matches docs/Reference/Game/data', () => {
  it('has at least the 15 original files', () => {
    expect(docFiles.length).toBeGreaterThanOrEqual(15);
  });
  it.each(docFiles)('%s is an exact copy', (f) => {
    expect(existsSync(join(copyDir, f))).toBe(true);
    expect(readFileSync(join(copyDir, f), 'utf8')).toBe(readFileSync(join(docsDir, f), 'utf8'));
  });
  it('has no orphan copies', () => {
    const copies = readdirSync(copyDir).filter((f) => f.endsWith('.json'));
    expect([...copies].sort()).toEqual([...docFiles].sort());
  });
});
