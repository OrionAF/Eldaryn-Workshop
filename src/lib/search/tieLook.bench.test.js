// Tie-look benchmark (simulation.md §Cost, the tie look): the real optimize() on sanitised profile captures,
// with and without the win rate's tie look (effort `tieLook: false`, benchmarks only), reporting the fights
// of each phase and whether the best build and the rows' verdicts agree. Skipped by default (minutes of
// simulation); run with
//   TIE_BENCH=1 npx vitest run src/lib/search/tieLook.bench.test.js
// TIE_BENCH_ONLY=<name,...> picks setups, TIE_BENCH_MODE=before|after one side, TIE_BENCH_OUT=<file> writes JSON.
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { optimize } from './search.js';
import { BLOCKS } from './space.js';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import w73 from '../__fixtures__/real/profile-warrior-l73.json';
import s85 from '../__fixtures__/real/profile-sentinel-l85-oct15b.json';

const env = typeof process !== 'undefined' ? process.env : {};
const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const load = (p) => normaliseCharacter(gameProfileToCharacter(p));
const CH = { w73: load(w73), s85: load(s85) };

export const TIE_SETUPS = [
  // no build wins (the baseline: 0 of 64, about 37 % of the step's HP), as in the user's run 1
  { name: 'win-never-chapter-sigils', ch: 'w73', target: { kind: 'chapter', chapter: 10, level: 7 }, objective: { kind: 'win-chance' }, space: only('sigils') },
  // partly cleared (the baseline: about half)
  { name: 'win-partial-dungeon-sigils', ch: 's85', target: { kind: 'dungeon', id: 'dungeon_7', step: 6 }, objective: { kind: 'win-chance' }, space: only('sigils') },
  // rarely cleared (the baseline: 1 of 64): most pairs tie at 0 %, a few builds win
  { name: 'win-rare-chapter-sigils', ch: 's85', target: { kind: 'chapter', chapter: 12, level: 1 }, objective: { kind: 'win-chance' }, space: only('sigils') },
  // control: no win-rate contrast, so no tie look (must be identical)
  { name: 'dps-dummy-sigils', ch: 's85', target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, space: only('sigils') },
  { name: 'dps-dummy-minor-mount', ch: 'w73', target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, space: only('minorGlyphs', 'mount') },
];

async function run(s, tieLook) {
  const character = CH[s.ch];
  const t0 = Date.now();
  const r = await optimize({
    character, presetId: character.activePresetId, target: s.target, objective: s.objective, space: s.space,
    effort: tieLook ? 'quick' : { level: 'quick', tieLook: false }, seed: 1,
  });
  return {
    status: r.status, ms: Date.now() - t0,
    phases: Object.fromEntries(r.phases.map((p) => [p.id, p.fights])),
    total: r.search.fights.total,
    evaluated: r.search.evaluated,
    best: r.rows[0]?.key ?? null,
    rows: r.rows.map((x) => ({ key: x.key, verdict: x.vsBaseline?.verdict ?? null, basis: x.vsBaseline?.basis ?? null })),
    goal: r.goal?.status ?? null,
  };
}

describe.skipIf(!env.TIE_BENCH)('tie-look benchmark (real optimize runs)', () => {
  const out = [];
  const pick = env.TIE_BENCH_ONLY ? TIE_SETUPS.filter((s) => env.TIE_BENCH_ONLY.split(',').includes(s.name)) : TIE_SETUPS;
  for (const s of pick) {
    it(s.name, async () => {
      const m = { name: s.name };
      if (env.TIE_BENCH_MODE !== 'after') m.before = await run(s, false);
      if (env.TIE_BENCH_MODE !== 'before') m.after = await run(s, true);
      out.push(m);
      console.log(JSON.stringify(m));
      if (env.TIE_BENCH_OUT) writeFileSync(env.TIE_BENCH_OUT, JSON.stringify(out, null, 1));
      if (m.before && m.after) {
        expect(m.after.status).toBe('done');
        if (s.objective.kind === 'dps') expect(m.after).toEqual({ ...m.before, ms: m.after.ms });
      }
    }, 7200000);
  }
});
