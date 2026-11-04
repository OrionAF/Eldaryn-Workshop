// Finalists and the repeated single-change baseline comparison, measured on real fixtures (backlog §12).
// A measurement, not a check, so it runs only with FINALISTS_MEASURE=1 set (cases: FINALISTS_CASES=a,b):
//   FINALISTS_MEASURE=1 npx vitest run src/lib/__fixtures__/real/finalists.test.js
import { describe, it, vi } from 'vitest';
import sentinel from './profile-sentinel-l85-oct15b.json';
import warrior from './profile-warrior-l73.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { debugLogLines } from '../../search/debugLog.js';
import { changesOf } from '../../search/effect.js';

// Every minimise call, with each comparison it makes: which arms, at what alpha, and its verdict and n.
const calls = [];
vi.mock('../../search/minimise.js', async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    async minimise(ctx, F0, o) {
      const call = { finalist: F0.key, changes: changesOf(ctx.space, ctx.B.cand, F0.cand).length, alpha: o.alpha, alphaFinal: o.alphaFinal, compares: [] };
      calls.push(call);
      const compare = async (X, Y, a) => {
        const c = await ctx.compare(X, Y, a);
        call.compares.push({ x: X.key, y: Y.key, vsBase: Y.key === ctx.B.key, a, verdict: c.verdict, n: c.n });
        return c;
      };
      const m = await mod.minimise({ ...ctx, compare }, F0, o);
      call.out = m.arm.key === ctx.B.key ? 'baseline' : m.arm.key;
      call.kept = m.arm.key === ctx.B.key ? 0 : changesOf(ctx.space, ctx.B.cand, m.arm.cand).length;
      return m;
    },
  };
});
const { optimize } = await import('../../search/search.js');

const NOW = '2026-10-15T00:00:00.000Z';
const CHARS = {
  sentinel: normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW })),
  warrior: normaliseCharacter(gameProfileToCharacter(warrior, { now: NOW })),
};
const TARGETS = {
  dummy: { target: { kind: 'dummy' }, objective: { kind: 'dps' } },
  fortress: { target: { kind: 'fortressBoss', group: 'TOP', stars: 5 }, objective: { kind: 'dps' } },
  dungeon: { target: { kind: 'dungeon', id: 'dungeon_1_hard', step: 6 }, objective: { kind: 'win-chance' } },
  dungeon3: { target: { kind: 'dungeon', id: 'dungeon_1_hard', step: 3 }, objective: { kind: 'win-chance' } },
};
const ALL = Object.keys(CHARS).flatMap((c) => Object.keys(TARGETS).map((t) => `${c}-${t}`));
const CASES = (process.env.FINALISTS_CASES ?? 'sentinel-dummy,warrior-dummy').split(',').flatMap((c) => (c === 'all' ? ALL : [c]));
const SEEDS = (process.env.FINALISTS_SEEDS ?? '1').split(',').map(Number);

describe.skipIf(!process.env.FINALISTS_MEASURE)('Finalists and repeated baseline comparisons, measured (backlog §12)', { timeout: 6 * 3600e3 }, () => {
  for (const name of CASES) for (const seed of SEEDS) {
    it(`${name} seed ${seed}`, async () => {
      const [c, t] = name.split('-');
      calls.length = 0;
      const t0 = Date.now();
      const r = await optimize({ character: CHARS[c], presetId: CHARS[c].activePresetId, ...TARGETS[t], effort: 'standard', seed, debug: 'builds' });
      const ms = Date.now() - t0;
      const rows = [...debugLogLines(r.debug)].map((l) => JSON.parse(l)).filter((x) => x.kind === 'build' || x.step);
      const byPhase = {};
      for (const x of rows) byPhase[x.phase] = (byPhase[x.phase] ?? 0) + (x.fights ?? 0);
      // minimise's comparisons in order, two rows each (X then its reference), to read each one's new fights
      const s2 = rows.filter((x) => x.stage === 'minimise' && x.step === 'compare');
      let k = 0;
      for (const call of calls) for (const cmp of call.compares) { cmp.fights = (s2[2 * k]?.fights ?? 0) + (s2[2 * k + 1]?.fights ?? 0); k++; }
      // the repeated pair: a finalist whose Holm round compares it with the baseline, then the final check does again
      const repeats = calls.flatMap((call) => {
        const vb = call.compares.filter((x) => x.vsBase);
        return vb.length >= 2 && vb[0].x === vb.at(-1).x ? [{ changes: call.changes, first: vb[0], final: vb.at(-1) }] : [];
      });
      const outs = calls.map((x) => x.out);
      const summary = {
        case: `${name} seed ${seed}`, status: r.status, seconds: Math.round(ms / 1000),
        finalists: calls.length, changesPerFinalist: calls.map((x) => x.changes), keptPerFinalist: calls.map((x) => x.kept),
        toBaseline: outs.filter((o) => o === 'baseline').length, distinctMinimised: new Set(outs.filter((o) => o !== 'baseline')).size,
        rows: r.rows?.length ?? 0,
        fightsByPhase: byPhase, minimiseFights: byPhase.minimise ?? 0,
        minimiseFightsPerFinalist: calls.map((x) => x.compares.reduce((s, y) => s + y.fights, 0)),
        repeats: repeats.map((x) => ({ changes: x.changes, first: `${x.first.verdict}@${x.first.n} a=${x.first.a.toFixed(4)} +${x.first.fights}`, final: `${x.final.verdict}@${x.final.n} a=${x.final.a.toFixed(4)} +${x.final.fights}` })),
        repeatExtraFights: repeats.reduce((s, x) => s + x.final.fights, 0),
      };
      console.log(JSON.stringify(summary));
    });
  }
});
