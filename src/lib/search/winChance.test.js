// The 'Highest chance to win' goal and the fast low-rate decisions of both win-rate goals (simulation.md
// §Win rate): calibration on synthetic arms (no engine), then the goal end to end on a custom mob.
import { describe, it, expect } from 'vitest';
import { makeObjective, resolveTarget, objectiveKindsFor, winRateTarget, WIN_RATE_TARGET } from './objectives.js';
import { contrastSets, setOf } from './sampler.js';
import { race } from './race.js';
import { optimize } from './search.js';
import { BLOCKS } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { normaliseSetup } from '../ui/optimiserSetup.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

const target = resolveTarget({ kind: 'custom', mob: { hp: 10, attack: 1, attackSpeed: 1 }, seconds: 10 });
const maxObj = makeObjective({ kind: 'win-chance' }, target);
const tgtObj = makeObjective({ kind: 'win-rate', target: 0.7 }, target);
// Standard precision (simulation.md §Effort)
const STANDARD = { alpha: 0.05, delta: 0.01, deltaKind: 'absolute', n0: 16, maxN: 32768 };

// Synthetic fights on common random numbers: fight i of replicate `rep` has one shared uniform u (who wins:
// a build of rate p wins iff u < p, so wins are nested) and one shared progress shock; each arm adds its own
// noise. A win scores 1 + hp, a loss its reach (share of the step's HP removed) plus noise, kept in [0, 1).
const unif = (...k) => mulberry32(hashSeed('win-chance-test', ...k))();
function armSet(arm, n, rep) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    if (unif(rep, i, 'u') < arm.p) out[i] = 1 + (arm.hp ?? 0.5);
    else out[i] = Math.min(0.999, Math.max(0, arm.reach + 0.2 * (unif(rep, i, 'shock') - 0.5) + 0.1 * (unif(rep, i, arm.key) - 0.5)));
  }
  return setOf([out]);
}
const getSetOf = (rep, drawn) => async (arm, n) => {
  drawn?.set(arm.key, Math.max(drawn.get(arm.key) ?? 0, n));
  return armSet(arm, n, rep);
};

describe('win-chance: the goal and its target', () => {
  it("leads the goal list for content you clear, with 'Reach a win rate' beside it; custom keeps dps first", () => {
    for (const k of ['chapter', 'dungeon', 'raid', 'oblivion']) expect(objectiveKindsFor(k).slice(0, 2)).toEqual(['win-chance', 'win-rate']);
    expect(objectiveKindsFor('custom')[0]).toBe('dps');
    expect(objectiveKindsFor('custom')).toContain('win-chance');
    expect(objectiveKindsFor('dummy')).not.toContain('win-chance');
  });

  it('has no target, ranks on the plain rate and keys apart from every target goal', () => {
    expect(maxObj.spec).toEqual({ kind: 'win-chance' });
    expect(maxObj.target).toBeNull();
    expect(maxObj.label).toBe('Highest chance to win');
    expect(maxObj.key).not.toBe(makeObjective({ kind: 'win-rate', target: 1 }, target).key);
    expect(maxObj.primary(armSet({ key: 'a', p: 0.99, reach: 0 }, 400, 0))).toBeGreaterThan(0.95);
  });

  it('the target goes down to 1%', () => {
    expect(WIN_RATE_TARGET.min).toBe(0.01);
    expect(winRateTarget(0.01)).toBe(0.01);
    expect(() => winRateTarget(0.009)).toThrow(/between/);
  });
});

describe('win-chance: setup normalisation', () => {
  const character = fixtureCharacter('WARRIOR');
  const dungeon = { kind: 'dungeon', id: 'dungeon_1', step: 1 };

  it('a new setup for content you clear defaults to the highest chance to win', () => {
    expect(normaliseSetup({ target: dungeon }, character).objective).toEqual({ kind: 'win-chance' });
    expect(normaliseSetup({ target: { kind: 'custom', mob: { hp: 10, attack: 1, attackSpeed: 1 } } }, character).objective).toEqual({ kind: 'dps' });
  });

  it('an old saved target goal keeps its goal and target; 1% is now a valid target', () => {
    expect(normaliseSetup({ target: dungeon, objective: { kind: 'win-rate', target: 0.7 } }, character).objective).toEqual({ kind: 'win-rate', target: 0.7 });
    expect(normaliseSetup({ target: dungeon, objective: { kind: 'win-rate' } }, character).objective).toEqual({ kind: 'win-rate' });
    expect(normaliseSetup({ target: dungeon, objective: { kind: 'win-rate', target: 0.01 } }, character).objective).toEqual({ kind: 'win-rate', target: 0.01 });
    expect(normaliseSetup({ target: dungeon, objective: { kind: 'win-rate', target: 0.005 } }, character).objective).toEqual({ kind: 'win-rate' });
    expect(normaliseSetup({ target: dungeon, objective: { kind: 'win-chance', target: 0.5 } }, character).objective).toEqual({ kind: 'win-chance' });
  });
});

describe('fast low-rate decisions (calibration, synthetic arms)', () => {
  const REPS = 40;

  it('two builds that never win are shown equal on the rate, then the progress decides, within the gate', () => {
    for (const o of [maxObj, tgtObj]) {
      const x = armSet({ key: 'x', p: 0, reach: 0.5 }, 1024, 0);
      const y = armSet({ key: 'y', p: 0, reach: 0.4 }, 1024, 0);
      // alpha / (5 arms x 12 looks): the exact bound on the discordant rates is below δ at 1 024 fights
      const c = contrastSets(o, x, y, { ...STANDARD, alpha: 0.05 / 60 });
      expect(c).toMatchObject({ verdict: 'better', basis: 'margin' });
      expect(c.winRate.hi).toBeLessThan(STANDARD.delta);
    }
  });

  it('all-zero arms with different progress resolve within a few looks and the best-progress arm wins at least 1 - alpha of the time', async () => {
    const arms = [
      { key: 'base', dist: 0, p: 0, reach: 0.40 },
      { key: 'a', dist: 1, p: 0, reach: 0.42 },
      { key: 'b', dist: 1, p: 0, reach: 0.45 },
      { key: 'best', dist: 2, p: 0, reach: 0.55 },
      { key: 'c', dist: 1, p: 0, reach: 0.30 },
    ];
    for (const o of [maxObj, tgtObj]) {
      let picked = 0;
      let maxN = 0;
      for (let rep = 0; rep < REPS; rep++) {
        const r = await race(arms, { objective: o, getSet: getSetOf(rep), effort: STANDARD, seed: 1 });
        if (arms[r.winner].key === 'best') picked++;
        maxN = Math.max(maxN, r.n);
      }
      expect(picked / REPS).toBeGreaterThanOrEqual(0.95);
      // before W3 the rate had to be equivalent on Tango's interval: 4 096 fights per arm
      expect(maxN).toBeLessThanOrEqual(1024);
    }
  });

  it('an arm with a true rate edge of δ is never dropped by a no-win arm or a higher-progress arm with fewer wins', async () => {
    const cases = [
      [{ key: 'far', dist: 0, p: 0, reach: 0.8 }, { key: 'edge', dist: 1, p: 0.01, reach: 0.2 }],
      [{ key: 'far', dist: 0, p: 0.002, reach: 0.8 }, { key: 'edge', dist: 1, p: 0.012, reach: 0.2 }],
    ];
    for (const o of [maxObj, tgtObj]) {
      for (const arms of cases) {
        for (let rep = 0; rep < REPS; rep++) {
          const r = await race(arms, { objective: o, getSet: getSetOf(rep), effort: { ...STANDARD, maxN: 4096 }, seed: 1 });
          const dropped = [...r.eliminated, ...r.futile].map((e) => arms[e.i].key);
          expect(dropped).not.toContain('edge');
        }
      }
    }
  });

  it('with a winning leader, zero-win arms leave early on the rate, whatever their progress', async () => {
    const arms = [{ key: 'lead', dist: 1, p: 0.035, reach: 0.3 }];
    for (let j = 0; j < 20; j++) arms.push({ key: `z${j}`, dist: j % 3, p: 0, reach: 0.5 + j / 100 });
    for (const o of [maxObj, tgtObj]) {
      const drawn = new Map();
      const r = await race(arms, { objective: o, getSet: getSetOf(7, drawn), effort: STANDARD, seed: 1 });
      expect(arms[r.winner].key).toBe('lead');
      expect(r.eliminated.length + r.futile.length).toBe(20);
      for (const e of r.eliminated) expect(e.contrast.basis).toBe('win-rate');
      for (let j = 0; j < 20; j++) expect(drawn.get(`z${j}`)).toBeLessThanOrEqual(1024);
    }
  });

  it('the highest chance to win ties builds within δ on the rate (fewest changes), never on progress', async () => {
    // both win about 40 %; the far one keeps more HP and gets further in its losses
    const arms = [{ key: 'near', dist: 0, p: 0.4, hp: 0.1, reach: 0.2 }, { key: 'far', dist: 3, p: 0.403, hp: 0.9, reach: 0.9 }];
    const r = await race(arms, { objective: maxObj, getSet: getSetOf(3), effort: { ...STANDARD, delta: 0.02, maxN: 65536 }, seed: 1 });
    expect(arms[r.winner].key).toBe('near');
    const c = contrastSets(maxObj, armSet(arms[1], 8192, 3), armSet(arms[0], 8192, 3), STANDARD);
    expect(c.basis).toBe('win-rate');
  });
});

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const relicless = () => {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  return normaliseCharacter(raw);
};

describe('optimize with the highest chance to win', { timeout: 120000 }, () => {
  it('when no build wins it says how far the best one gets', async () => {
    const r = await optimize({
      character: relicless(), presetId: 'p1', target: { kind: 'custom', mob: { hp: 1e12, attack: 0, attackSpeed: 0 }, seconds: 5 },
      objective: { kind: 'win-chance' }, space: only('relics'), effort: { level: 'quick', n0: 64, maxN: 2048, randomStarts: 0 }, seed: 3,
    });
    expect(r.status).toBe('done');
    expect(r.goal).toMatchObject({ mode: 'max', status: 'no-wins', target: null });
    expect(r.headline.text).toMatch(/^No build won any of [\d,]+ fights; the build that gets furthest .*removes \d+(\.\d)?% of the step's HP\.$/);
    for (const row of [r.baseline, ...r.rows]) {
      expect(row.aux.winRate.est).toBe(0);
      expect(row.aux).not.toHaveProperty('meetsTarget');
    }
    if (r.rows.length) expect(r.rows[0].vsBaseline).toMatchObject({ verdict: 'better', basis: 'margin' });
  });

  it('a build that wins every fight already has the highest chance', async () => {
    const r = await optimize({
      character: relicless(), presetId: 'p1', target: { kind: 'custom', mob: { hp: 10, attack: 1, attackSpeed: 1 }, seconds: 10 },
      objective: { kind: 'win-chance' }, space: only('relics'), effort: { level: 'quick', n0: 8, maxN: 2048, randomStarts: 0 }, seed: 1,
    });
    expect(r.rows).toEqual([]);
    expect(r.goal).toMatchObject({ mode: 'max', status: 'already', target: null });
    expect(r.headline.text).toMatch(/^Already clears at 100% \(95% CI \d+(\.\d)?%-100%\)\. No change needed\.$/);
  });
});
