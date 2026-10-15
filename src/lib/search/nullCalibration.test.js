// H3: confirm calibration on real fight outcomes (redesign plan A.1 I4, #74). Eleven finalists that equal
// the baseline are selected on the search samples and confirmed on fresh ones (the driver's S1 and S3):
//   - the top row is flagged `better` in at most 5 % of 400 runs (it used to be ~15 %), and
//   - the delta reported for the selected row is unbiased within Monte-Carlo error.
// The outcome pool is 1024 real fights of a fixture Warrior against the training dummy; a finalist's sample
// is drawn from it with the common-random-numbers overlap measured on the real engine (rho = 0.16).
import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { buildFighter } from '../build/fighter.js';
import { simulatePve, trainingDummy } from '../engine/pve/fight.js';
import { fightRng, hashSeed, mulberry32 } from '../engine/rng.js';
import { makeObjective, resolveTarget } from './objectives.js';
import { holmSequential } from './minimise.js';
import { compareSets, setOf, contrastSets } from './sampler.js';

const SECONDS = 10;
const K = 11;
const N = 32;
const RUNS = 400;
const RHO = 0.16;

const objective = makeObjective({ kind: 'dps' }, resolveTarget({ kind: 'dummy', seconds: SECONDS }));
const fighter = buildFighter(fixtureCharacter('WARRIOR'), 'p1');
const pool = Array.from({ length: 1024 }, (_, i) => simulatePve({ fighter, enemy: trainingDummy(), maxMs: SECONDS * 1000, rng: fightRng(17, i) }).damageDealt / SECONDS);

/** A finalist's sample of N fights on one stage: fight i shares the baseline's draw with probability rho. */
function draw(stage, run, own) {
  const rc = mulberry32(hashSeed(stage, run, 'common'));
  const ro = mulberry32(hashSeed(stage, run, own));
  return Array.from({ length: N }, () => {
    const c = pool[Math.floor(rc() * pool.length)];
    const o = pool[Math.floor(ro() * pool.length)];
    return ro() < RHO ? c : o;
  });
}

describe('confirm calibration on real outcomes (null finalists)', { timeout: 120000 }, () => {
  it(`${K} finalists equal to the baseline: the top row is flagged better in <= 5 % of ${RUNS} runs, its reported delta is unbiased`, async () => {
    let flagged = 0;
    let anyFlagged = 0;
    const reported = [];
    for (let run = 0; run < RUNS; run++) {
      // S1: select the top row on the search samples
      const search = Array.from({ length: K }, (_, k) => setOf([draw('s1', run, k)]));
      const top = search.reduce((best, s, k) => (objective.score(s) > objective.score(search[best]) ? k : best), 0);

      // S3: confirm every finalist on fresh samples with Holm across the family
      const base = setOf([draw('s3', run, 'base')]);
      const rows = Array.from({ length: K }, (_, k) => setOf([draw('s3', run, k)]));
      const verdicts = await holmSequential(rows, 0.05, (x, a) => compareSets(objective, async () => x, async () => base, { alpha: a, delta: 0.005, n0: N, maxN: N }));
      if (verdicts[top].verdict === 'better') flagged++;
      if (verdicts.some((v) => v.verdict === 'better')) anyFlagged++;

      const c = contrastSets(objective, rows[top], base, { delta: 0.005 });
      reported.push(c.pct);
    }
    expect(flagged / RUNS, 'top row flagged better').toBeLessThanOrEqual(0.05);
    expect(anyFlagged / RUNS, 'any row flagged better').toBeLessThanOrEqual(0.05);
    const mean = reported.reduce((s, x) => s + x, 0) / RUNS;
    const sd = Math.sqrt(reported.reduce((s, x) => s + (x - mean) ** 2, 0) / (RUNS - 1));
    expect(Math.abs(mean), `reported delta ${mean} (se ${sd / Math.sqrt(RUNS)})`).toBeLessThanOrEqual(3 * (sd / Math.sqrt(RUNS)));
  });
});
