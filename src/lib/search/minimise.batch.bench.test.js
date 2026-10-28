// Benchmark: the batch-drop Minimise (the default since 2026-10-28) against one at a time (effort.batchDrop: false)
// on real sanitised fixtures (docs/WIP/being-worked-on/minimise-batch-drop.md). Slow, so it runs only with
// BATCH_DROP=1 set; BATCH_DROP_SETUP picks one setup by id, BATCH_DROP_SEEDS the seeds (default 1,2,3):
//   BATCH_DROP=1 npx vitest run src/lib/search/minimise.batch.bench.test.js
// Per run it prints the Minimise fights, compares and builds, the other phases' fights, and every row.
import { describe, it } from 'vitest';
import warrior from '../__fixtures__/real/profile-warrior-l72.json';
import mystic from '../__fixtures__/real/profile-mystic-l50.json';
import sentinel from '../__fixtures__/real/profile-sentinel-l85-oct15b.json';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import { optimize } from './search.js';
import { push } from './push.js';
import { BLOCKS } from './space.js';
import { hashSeed } from '../engine/rng.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const char = (p) => normaliseCharacter(gameProfileToCharacter(p));
const env = (k, d) => process.env[k] ?? d;

const WIDE = only('relics', 'pet', 'sigils', 'utility', 'ancient', 'conditions', 'mount', 'minorGlyphs', 'majorGlyphs');
const CH = env('BD_CH', '8-9').split('-').map(Number);
const SCH = env('BD_SCH', '10-7').split('-').map(Number);
const STEP = Number(env('BD_STEP', '7'));
const PCH = env('BD_PCH', '7-1').split('-').map(Number);
const PUSH_PROFILES = { warrior, mystic, sentinel };
const PUSH_PROFILE = env('BD_PUSH_PROFILE', 'sentinel');

// Baselines (a sweep at the time of writing): Mystic L50 wins chapter 8-9 77 % and dungeon_4 step 7 16 %;
// Sentinel L85 (oct15b) wins chapter 10-7 58 %
export const SETUPS = [
  { id: 'dummy-dps', label: 'Warrior L72, 60 s dummy DPS', profile: warrior, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, space: WIDE },
  { id: 'dummy-dps-mystic', label: 'Mystic L50, 60 s dummy DPS', profile: mystic, target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, space: WIDE },
  { id: 'chapter-rate', label: `Mystic L50, chapter ${CH.join('-')}, win rate 95 %`, profile: mystic, target: { kind: 'chapter', chapter: CH[0], level: CH[1] }, objective: { kind: 'win-rate', target: 0.95 }, space: WIDE },
  { id: 'chapter-rate-sentinel', label: `Sentinel L85, chapter ${SCH.join('-')}, win rate 95 %`, profile: sentinel, target: { kind: 'chapter', chapter: SCH[0], level: SCH[1] }, objective: { kind: 'win-rate', target: 0.95 }, space: WIDE },
  { id: 'push', label: `${PUSH_PROFILE} Push from chapter ${PCH.join('-')}, 95 %`, push: true, profile: PUSH_PROFILES[PUSH_PROFILE], target: { kind: 'chapter', chapter: PCH[0], level: PCH[1] }, objective: { kind: 'push', target: 0.95 }, space: WIDE },
  { id: 'dungeon-chance', label: `Mystic L50, dungeon_4 step ${STEP}, highest chance`, profile: mystic, target: { kind: 'dungeon', id: 'dungeon_4', step: STEP }, objective: { kind: 'win-chance' }, space: WIDE },
];

/** One Push run: the Push phases' fights (Optimise holds every rung's search, Minimise, confirm and attribute), the rungs reached and the rows. */
async function measurePush(setup, seed, batchDrop) {
  const character = char(setup.profile);
  const t0 = Date.now();
  const res = await push({
    character, presetId: character.activePresetId, target: setup.target, objective: setup.objective, space: setup.space,
    effort: { level: 'quick', batchDrop }, seed,
  });
  return {
    s: ((Date.now() - t0) / 1000).toFixed(0), status: res.status, phase: Object.fromEntries(res.phases.map((p) => [p.id, p.fights])),
    reached: res.push?.reached?.deepest ?? null, rungs: res.optimised?.rungs ?? 0, total: res.stats?.fights,
    digest: hashSeed('rows', ...res.rows.map((r) => r.key)).toString(16),
    rows: res.rows.map((r) => r.changes.map((c) => `${c.id.replace(/:[0-9a-f-]{36}:/, ':')}=${c.to}`).join(' ')),
  };
}

/** One run: Minimise's cost read from the checkpoint log (compare steps of the minimise phase) and the rows. */
async function measure(setup, seed, batchDrop) {
  const character = char(setup.profile);
  let cp = null;
  let finalists = 0;
  const t0 = Date.now();
  const res = await optimize({
    character, presetId: character.activePresetId, target: setup.target, objective: setup.objective, space: setup.space,
    effort: { level: 'quick', batchDrop }, seed,
  }, { onCheckpoint: (c) => { cp = c; finalists = Math.max(finalists, c.finalists.length); } });
  const steps = (cp?.log ?? []).filter((e) => e.phase === 'minimise' && e.kind === 'compare');
  const builds = new Set(steps.flatMap((e) => e.gets.map(([k]) => k)));
  const phase = Object.fromEntries(res.phases.map((p) => [p.id, p.fights]));
  return {
    s: ((Date.now() - t0) / 1000).toFixed(0), status: res.status, goal: res.goal?.status ?? null, phase,
    compares: steps.length, builds: builds.size, finalists,
    digest: hashSeed('rows', ...res.rows.map((r) => r.key)).toString(16),
    rows: res.rows.map((r) => ({
      changes: r.changes.map((c) => `${c.id.replace(/:[0-9a-f-]{36}:/, ':')}=${c.to}`).join(' '), verdict: r.vsBaseline?.verdict,
      delta: r.vsBaseline?.delta, pct: r.vsBaseline?.pct, n: r.vsBaseline?.n,
    })),
  };
}

const fmt = (x) => (x == null ? '-' : Math.abs(x) < 1 ? x.toFixed(4) : x.toFixed(1));

describe.skipIf(!process.env.BATCH_DROP)('Minimise batch drop vs one at a time (study)', () => {
  const seeds = env('BATCH_DROP_SEEDS', '1,2,3').split(',').map(Number);
  for (const setup of SETUPS.filter((s) => !process.env.BATCH_DROP_SETUP || s.id === process.env.BATCH_DROP_SETUP)) {
    it(setup.label, async () => {
      for (const seed of seeds) {
        for (const batchDrop of [false, true]) {
          if (setup.push) {
            const m = await measurePush(setup, seed, batchDrop);
            console.log(`${setup.id} seed ${seed} ${batchDrop ? 'batch' : 'single'}: ${m.s} s, ${m.status}; reached ${m.reached}, rungs optimised ${m.rungs}; fights ${m.total} ${JSON.stringify(m.phase)}; rows ${m.rows.length} digest ${m.digest}`);
            for (const r of m.rows) console.log(`    row [${r}]`);
            continue;
          }
          const m = await measure(setup, seed, batchDrop);
          console.log(`${setup.id} seed ${seed} ${batchDrop ? 'batch' : 'single'}: ${m.s} s, ${m.status}, goal ${m.goal}; finalists ${m.finalists}; rows ${m.rows.length} digest ${m.digest}; minimise ${m.phase.minimise} fights, ${m.compares} compares, ${m.builds} builds; search ${m.phase.search}, confirm ${m.phase.confirm}, attribute ${m.phase.attribute}`);
          for (const r of m.rows) console.log(`    row [${r.changes}] ${r.verdict} Δ ${fmt(r.delta)} (${fmt(r.pct)}) n ${r.n}`);
        }
      }
    }, 3_600_000);
  }
});
