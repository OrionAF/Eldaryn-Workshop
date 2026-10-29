// Generates src/data/specBaseline.json: the Spec baseline's tables, every GUIDE_SPECS entry at every
// BASELINE_LEVELS level for every profile (features/specBaseline.js runBaseline). It reads the per-roll
// values in src/data/specGuide.json, so run `npm run gen:spec-guide` first when those are stale.
// Deterministic: the same code gives the same file.  npm run gen:spec-baseline
import fs from 'node:fs';
import { GUIDE_SPECS } from '../src/lib/features/specGuide.js';
import { BASELINE, BASELINE_LEVELS, PROFILES, runBaseline } from '../src/lib/features/specBaseline.js';

const SEED = 1;
const guide = JSON.parse(fs.readFileSync(new URL('../src/data/specGuide.json', import.meta.url), 'utf8'));
const out = new URL('../src/data/specBaseline.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const sig = (v) => Number(v.toPrecision(4));

const entries = [];
const t0 = Date.now();
for (const g of GUIDE_SPECS) {
  for (const level of BASELINE_LEVELS) {
    for (const p of PROFILES) {
      const e = runBaseline(guide, g.id, level, p.id, { seed: SEED });
      entries.push({ ...e, rows: e.rows.map((r) => ({ ...r, lo: sig(r.lo), median: sig(r.median), hi: sig(r.hi) })) });
    }
  }
  console.log(`${g.id}: done (${Math.round((Date.now() - t0) / 1000)} s)`);
}
const data = { version: 1, appVersion: pkg.version, seed: SEED, assumptions: BASELINE, levels: BASELINE_LEVELS, entries };
fs.writeFileSync(out, `${JSON.stringify(data)}\n`);
console.log(`wrote ${entries.length} entries in ${Math.round((Date.now() - t0) / 1000)} s`);
