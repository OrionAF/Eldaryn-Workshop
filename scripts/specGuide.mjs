// Generates src/data/specGuide.json: the Spec stat guide's tables, every GUIDE_SPECS entry at every
// GUIDE_BANDS level (features/specGuide.js runSpecGuide). Deterministic: the same code gives the same file.
// Run after a change to the engine, the reference builds or the roll sizes:  npm run gen:spec-guide
import fs from 'node:fs';
import { GUIDE_SPECS, GUIDE_BANDS, TIME_ALIVE, runSpecGuide } from '../src/lib/features/specGuide.js';

const PRECISION = 'thorough';
const SEED = 1;
const out = new URL('../src/data/specGuide.json', import.meta.url);
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const entries = [];
const t0 = Date.now();
for (const g of GUIDE_SPECS) {
  for (const b of GUIDE_BANDS) {
    const e = await runSpecGuide(g, b.level, { precision: PRECISION, seed: SEED });
    entries.push(e);
    const top = e.damage.find((r) => r.score === 100)?.label ?? 'none';
    console.log(`${g.id} L${b.level}: top damage ${top}${e.base.calibrated ? '' : ' (survival calibration out of band)'}`);
  }
}
const data = {
  version: 1,
  appVersion: pkg.version,
  precision: PRECISION,
  seed: SEED,
  timeAlive: { targetSeconds: TIME_ALIVE.targetSeconds, capSeconds: TIME_ALIVE.capSeconds },
  levels: GUIDE_BANDS.map((b) => b.level),
  entries,
};
fs.writeFileSync(out, `${JSON.stringify(data, null, 1)}\n`);
console.log(`wrote ${entries.length} entries in ${Math.round((Date.now() - t0) / 1000)} s`);
