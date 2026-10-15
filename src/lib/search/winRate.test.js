// The PVE win-rate objective and its "fewest changes that reach the target" framing (backlog §4;
// simulation.md §Win rate).
import { describe, it, expect } from 'vitest';
import {
  makeObjective, resolveTarget, objectiveKindsFor, winRateFightScore, winRateTarget, meetsTarget, WIN_RATE_TARGET,
} from './objectives.js';
import { contrastSets, compareSets, setOf } from './sampler.js';
import { race } from './race.js';
import { rankRows } from './result.js';
import { optimize, optimizeMore } from './search.js';
import { BLOCKS } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { normaliseSetup } from '../ui/optimiserSetup.js';
import { hashSeed, mulberry32 } from '../engine/rng.js';

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const TINY = { level: 'quick', n0: 8, maxN: 64, randomStarts: 0 };
const custom = (mob, seconds = 10) => resolveTarget({ kind: 'custom', mob, seconds });
const relicless = () => {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  return normaliseCharacter(raw);
};
const timeless = (r) => ({ ...r, stats: { ...r.stats, ms: 0 }, phases: r.phases.map((p) => ({ ...p, ms: 0 })) });

// Synthetic paired fights: fight i has one common uniform u_i (common random numbers); a build of true
// rate p wins fight i iff u_i < p, a win keeping `hp` of its HP and a loss removing `reach` of the mobs.
const u = (i) => mulberry32(hashSeed('win-rate-test', i))();
const fights = (p, n, { hp = 0.5, reach = 0.5 } = {}) => Array.from({ length: n }, (_, i) => (u(i) < p ? 1 + hp : reach));
const setFor = (p, n, o) => setOf([fights(p, n, o)]);

describe('win-rate objective: per-fight score', () => {
  it('a win scores 1 + HP left / max HP; a loss the share of the step HP removed, below 1', () => {
    expect(winRateFightScore({ won: true, hpLeft: 300, damageDealt: 900, enemyHpLeft: 0 }, 1200)).toBe(1.25);
    expect(winRateFightScore({ won: false, hpLeft: 0, damageDealt: 300, enemyHpLeft: 900 }, 1200)).toBe(0.25);
    // the time cap: alive but not cleared is a loss, scored by progress
    expect(winRateFightScore({ won: false, timedOut: true, hpLeft: 800, damageDealt: 999, enemyHpLeft: 1 }, 1200)).toBe(0.999);
    expect(winRateFightScore({ won: false, hpLeft: 0, damageDealt: 1e18, enemyHpLeft: 1 }, 1200)).toBeLessThan(1);
  });

  it('the win bit is score >= 1; the estimate counts wins and the margin is the mean score', () => {
    const o = makeObjective({ kind: 'win-rate' }, custom({ hp: 10, attack: 1, attackSpeed: 1 }));
    expect(o.spec).toEqual({ kind: 'win-rate', target: 0.95 });
    const e = o.estimate(setOf([[1.5, 0.25, 1, 0.999, 2]]));
    expect(e.value).toMatchObject({ est: 3 / 5, n: 5, method: 'wilson' });
    expect(e.aux.margin.est).toBeCloseTo((1.5 + 0.25 + 1 + 0.999 + 2) / 5, 12);
  });
});

describe('win-rate objective: target and compatibility', () => {
  it('is the default for chapters, dungeons, raids and Oblivion; an option for custom mobs', () => {
    for (const k of ['chapter', 'dungeon', 'raid', 'oblivion']) expect(objectiveKindsFor(k)[0]).toBe('win-rate');
    expect(objectiveKindsFor('custom')).toContain('win-rate');
    expect(objectiveKindsFor('dummy')).not.toContain('win-rate');
    expect(objectiveKindsFor('worldBoss')).not.toContain('win-rate');
    expect(objectiveKindsFor('dungeon')).toEqual(['win-rate']);
  });

  it('takes a target between 0.1 and 1 (default 0.95) and keys on it', () => {
    expect(winRateTarget(undefined)).toBe(WIN_RATE_TARGET.default);
    expect(winRateTarget(0.1)).toBe(0.1);
    expect(winRateTarget(0.5)).toBe(0.5);
    expect(() => winRateTarget(0.09)).toThrow(/between/);
    expect(() => winRateTarget(1.01)).toThrow(/between/);
    const t = resolveTarget({ kind: 'dungeon', id: 'dungeon_4', step: 6 });
    expect(makeObjective({ kind: 'win-rate', target: 0.8 }, t).key).not.toBe(makeObjective({ kind: 'win-rate' }, t).key);
    expect(() => makeObjective({ kind: 'win-rate' }, resolveTarget({ kind: 'dummy' }))).toThrow(/cannot score/);
  });

  it('the Optimiser setup defaults a dungeon to win rate and drops an out-of-range target', () => {
    const character = fixtureCharacter('WARRIOR');
    const s = normaliseSetup({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 } }, character);
    expect(s.objective).toEqual({ kind: 'win-rate' });
    const bad = normaliseSetup({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-rate', target: 3 } }, character);
    expect(bad.objective).toEqual({ kind: 'win-rate' });
    const ok = normaliseSetup({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-rate', target: 0.8 } }, character);
    expect(ok.objective).toEqual({ kind: 'win-rate', target: 0.8 });
  });
});

describe('win-rate objective: fights against real targets', () => {
  const character = relicless();
  const fighterOf = async () => {
    const { createBuildSpace } = await import('./space.js');
    const space = createBuildSpace(character, 'p1', {});
    return space.fighterOf(space.start);
  };

  it('a trivial mob is always cleared; a mob that cannot die in time is a loss at the cap, scored by progress', async () => {
    const fighter = await fighterOf();
    const easy = makeObjective({ kind: 'win-rate' }, custom({ hp: 10, attack: 1, attackSpeed: 1 }));
    const a = easy.sample(fighter, { seed: 1, from: 0, to: 20 });
    expect(a.main[0].every((v) => v > 1 && v <= 2)).toBe(true);
    expect(easy.estimate(setOf(a.main)).value).toMatchObject({ est: 1, n: 20, method: 'wilson' });

    const wall = makeObjective({ kind: 'win-rate' }, custom({ hp: 1e12, attack: 0, attackSpeed: 0 }, 5));
    const b = wall.sample(fighter, { seed: 1, from: 0, to: 20 });
    expect(b.main[0].every((v) => v > 0 && v < 1)).toBe(true);
    expect(wall.estimate(setOf(b.main)).value.est).toBe(0);
  });
});

describe('win-rate objective: the capped contrast', () => {
  const t = custom({ hp: 10, attack: 1, attackSpeed: 1 });
  const o = makeObjective({ kind: 'win-rate', target: 0.95 }, t);
  const zone = { delta: 0.02, deltaKind: 'absolute', alpha: 0.05 };

  it('a build that reaches the target is better than one confidently below it', () => {
    const c = contrastSets(o, setFor(0.99, 2000), setFor(0.8, 2000), zone);
    expect(c.verdict).toBe('better');
    expect(c.basis).toBe('win-rate');
    expect(c.lo).toBeGreaterThan(0);
    // the capped gain is at most τ − p_Y, the uncapped one is reported beside it
    expect(c.delta).toBeCloseTo(0.95 - 0.8, 1);
    expect(c.winRate.delta).toBeGreaterThan(c.delta);
  });

  it('two builds above the target are equivalent, whatever their margins', () => {
    const c = contrastSets(o, setFor(1, 4000, { hp: 0.9 }), setFor(0.98, 4000, { hp: 0.1 }), zone);
    expect(c.verdict).toBe('equivalent');
    expect(c.basis).toBe('win-rate');
  });

  it('below the target with equal win rates the margin decides (a 0% build that gets further ranks higher)', async () => {
    const x = setFor(0, 4096, { reach: 0.6 });
    const y = setFor(0, 4096, { reach: 0.4 });
    const c = await compareSets(o, async (n) => ({ ...x, main: [x.main[0].slice(0, n)], n }), async (n) => ({ ...y, main: [y.main[0].slice(0, n)], n }), { ...zone, n0: 64, maxN: 4096 });
    expect(c.verdict).toBe('better');
    expect(c.basis).toBe('margin');
    expect(o.score(x)).toBeGreaterThan(o.score(y));
  });

  it('a higher rate below the target outranks any margin', () => {
    expect(o.score(setFor(0.5, 1000, { reach: 0 }))).toBeGreaterThan(o.score(setFor(0.4, 1000, { reach: 0.99, hp: 1 })));
    expect(o.primary(setFor(1, 100))).toBe(0.95);
  });

  it('meetsTarget: reached inside the zone, not reached below, else unresolved', () => {
    expect(meetsTarget({ lo: 0.945, hi: 0.99 }, 0.95, 0.01)).toBe(true);
    expect(meetsTarget({ lo: 0.8, hi: 0.94 }, 0.95, 0.01)).toBe(false);
    expect(meetsTarget({ lo: 0.9, hi: 0.99 }, 0.95, 0.01)).toBe(null);
  });
});

describe('win-rate framing: fewest changes that reach the target', () => {
  const o = makeObjective({ kind: 'win-rate', target: 0.95 }, custom({ hp: 10, attack: 1, attackSpeed: 1 }));
  const effort = { alpha: 0.05, delta: 0.02, deltaKind: 'absolute', n0: 64, maxN: 8192 };
  const getSet = async (arm, n) => setFor(arm.p, n, { hp: arm.hp });

  it('a race picks the one-change build at 97% over the two-change build at 100%', async () => {
    const arms = [
      { key: 'base', dist: 0, p: 0.5, hp: 0.5 },
      { key: 'big', dist: 2, p: 1, hp: 0.9 },
      { key: 'small', dist: 1, p: 0.97, hp: 0.3 },
    ];
    const r = await race(arms, { objective: o, getSet, effort, seed: 1 });
    expect(arms[r.leader].key).toBe('big'); // the best estimate
    expect(arms[r.winner].key).toBe('small'); // ...but reaching the target ties, and the nearer one wins
    expect(r.eliminated.map((e) => arms[e.i].key)).toEqual(['base']);
  });

  it('rows that reach the target rank by fewest changes, before a higher rate with more changes', () => {
    const row = (key, k, primary, score) => ({ key, changes: Array(k).fill({}), vsBaseline: { verdict: 'better' }, primary, score });
    const rows = [row('big', 3, 0.95, 0.95e6 + 1.9), row('small', 1, 0.95, 0.95e6 + 1.2), row('close', 1, 0.9, 0.9e6 + 1.9)];
    const ranked = rankRows(rows, (r) => r.score, { primaryOf: (r) => r.primary });
    expect(ranked.map((r) => r.key)).toEqual(['small', 'big', 'close']);
    // without a primary the old order (by score) stands
    expect(rankRows(rows, (r) => r.score).map((r) => r.key)).toEqual(['big', 'small', 'close']);
  });
});

describe('optimize with a win-rate goal', { timeout: 120000 }, () => {
  it('a baseline that already clears says so and suggests nothing', async () => {
    const r = await optimize({
      character: relicless(), presetId: 'p1', target: { kind: 'custom', mob: { hp: 10, attack: 1, attackSpeed: 1 }, seconds: 10 },
      objective: { kind: 'win-rate', target: 0.9 }, space: only('relics'), effort: { ...TINY, maxN: 512 }, seed: 1,
    });
    expect(r.status).toBe('done');
    expect(r.rows).toEqual([]);
    expect(r.goal).toMatchObject({ status: 'already', target: 0.9 });
    expect(r.headline.text).toMatch(/^Already clears at 100% \(95% CI \d+(\.\d)?%-100%\)\. No change needed\.$/);
    expect(r.baseline.aux.meetsTarget).toBe(true);
    expect(r.baseline.aux.margin.est).toBeGreaterThan(1);
    expect(r.baseline.value).toEqual(r.goal.baseline.winRate);
    expect(r.phases.find((p) => p.id === 'search').state).toBe('not-run');
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });

  it('when nothing reaches the target it says how close the best comes, and rows carry win rate and margin', async () => {
    const req = {
      character: relicless(), presetId: 'p1', target: { kind: 'custom', mob: { hp: 1e12, attack: 0, attackSpeed: 0 }, seconds: 5 },
      objective: { kind: 'win-rate' }, space: only('relics'), effort: { ...TINY, n0: 64, maxN: 2048 }, seed: 3,
    };
    const r = await optimize(req);
    expect(r.status).toBe('done');
    expect(r.goal).toMatchObject({ status: 'not-reached', target: 0.95 });
    expect(r.headline.text).toMatch(/^No build was shown to reach 95%\. The (current|best) build wins 0%/);
    expect(r.rows.length).toBeGreaterThan(0); // at 0 % the margin (damage done before the cap) still ranks builds
    expect(r.rows[0].vsBaseline).toMatchObject({ verdict: 'better', basis: 'margin' });
    for (const row of [r.baseline, ...r.rows]) {
      expect(row.aux.winRate).toMatchObject({ est: 0, method: 'wilson' });
      expect(row.aux.meetsTarget).toBe(false);
      expect(row.aux.margin.est).toBeGreaterThan(0);
      expect(row.aux.margin.est).toBeLessThan(1);
    }
    for (const c of r.rows.flatMap((x) => x.changes)) if (c.own) expect(c.own).toHaveProperty('winRate');
    // determinism: the same request gives the same result
    expect(timeless(await optimize(req))).toEqual(timeless(r));
    // Run more re-derives the goal from the re-measured rows
    const more = await optimizeMore({ character: req.character, result: r, targetN: 64 });
    expect(more.goal).toMatchObject({ status: 'not-reached', target: 0.95 });
    expect(more.headline.text).toBe(more.goal.text);
  });
});

describe('win-rate objective under the futility stop (A5)', () => {
  const o = makeObjective({ kind: 'win-rate', target: 0.95 }, custom({ hp: 10, attack: 1, attackSpeed: 1 }));
  const zone = { delta: 0.02, deltaKind: 'absolute', alpha: 0.05 };
  const lazy = (s) => async (n) => ({ ...s, main: [s.main[0].slice(0, n)], n });
  // a stub objective returning one fixed lexicographic contrast, to test the rule on each branch
  const stub = (c) => ({ higherIsBetter: true, deltaKind: 'absolute', contrast: () => c });
  const one = setOf([[1]]);
  const rate = { delta: -0.01, lo: -0.03, hi: 0.01, basis: 'win-rate', higherIsBetter: true, ref: 0.5 };
  // a build that wins fight i iff a <= u_i < b (discordant with setFor(b - a) both ways)
  const windowSet = (a, b, n, hp) => setOf([Array.from({ length: n }, (_, i) => (u(i) >= a && u(i) < b ? 1 + hp : 0.5))]);
  const margin = (lo, hi) => ({ delta: (lo + hi) / 2, lo, hi, basis: 'margin', higherIsBetter: true, ref: 1 });

  it('the rate alone cannot make an arm futile while the margin is attached and open in its favour', () => {
    expect(contrastSets(stub({ ...rate, then: margin(0.1, 0.5) }), one, one, zone)).toMatchObject({ verdict: 'unresolved', futile: false });
    expect(contrastSets(stub({ ...rate, then: margin(-0.2, 0.01) }), one, one, zone)).toMatchObject({ verdict: 'unresolved', futile: true });
  });

  it('while the margin may still attach (thenPending) the arm is not futile; once it cannot, it is', () => {
    expect(contrastSets(stub({ ...rate, then: null, thenPending: true }), one, one, zone).futile).toBe(false);
    expect(contrastSets(stub({ ...rate, then: null, thenPending: false }), one, one, zone).futile).toBe(true);
  });

  it('a rate-equivalent arm whose margin cannot win stops futile; without the stop it runs on', async () => {
    const eq = { delta: 0, lo: -0.01, hi: 0.01, basis: 'win-rate', higherIsBetter: true, ref: 0.5 };
    const marginLost = stub({ ...eq, then: margin(-0.1, 0.01) });
    const g = async (n) => setOf([Array(n).fill(1)]);
    const f = await compareSets(marginLost, g, g, { ...zone, n0: 1, maxN: 4, futility: true });
    expect(f).toMatchObject({ verdict: 'futile', looks: 1 });
    expect((await compareSets(marginLost, g, g, { ...zone, n0: 1, maxN: 4 })).looks).toBe(3);
  });

  it('a slightly lower rate with a much better margin (both below target) is still accepted as better', async () => {
    // X wins 0.5 % fewer fights than Y (inside δ = 2 points; discordant both ways) but keeps far more
    // HP: lexicographically better. A rate-only futility rule drops it before the rate is equivalent.
    const x = windowSet(0.015, 0.51, 16384, 0.9);
    const y = setFor(0.5, 16384, { hp: 0.1 });
    const c = await compareSets(o, lazy(x), lazy(y), { ...zone, n0: 64, maxN: 16384, futility: true });
    expect(c.verdict).toBe('better');
    expect(c.basis).toBe('margin');
  });

  it('a race drops an arm just below a leader that reaches the target, and keeps one open on its margin', async () => {
    const effort = { alpha: 0.05, delta: 0.02, deltaKind: 'absolute', n0: 64, maxN: 16384 };
    const drawn = new Map();
    const getSet = async (arm, n) => {
      drawn.set(arm.key, Math.max(drawn.get(arm.key) ?? 0, n));
      return setFor(arm.p, n, { hp: arm.hp });
    };
    const arms = [
      { key: 'base', dist: 0, p: 0.3, hp: 0.5 },
      { key: 'reach', dist: 1, p: 1, hp: 0.5 },
      { key: 'short', dist: 2, p: 0.94, hp: 0.5 },
    ];
    const r = await race(arms, { objective: o, getSet, effort, seed: 1 });
    expect(arms[r.winner].key).toBe('reach');
    expect(r.futile.map((f) => arms[f.i].key)).toEqual(['short']);
    expect(drawn.get('short')).toBeLessThan(effort.maxN);

    // both below the target: the far arm's rate is inside δ of the leader's and its margin is better,
    // so it is never dropped as futile (the margin can still win once the rate is equivalent)
    const below = [
      { key: 'base', dist: 0, p: 0.5, hp: 0.1 },
      { key: 'margin', dist: 1, window: [0.015, 0.51], hp: 0.9 },
    ];
    const r2 = await race(below, { objective: o, getSet: async (arm, n) => (arm.window ? windowSet(...arm.window, n, arm.hp) : setFor(arm.p, n, { hp: arm.hp })), effort, seed: 1 });
    expect(r2.futile).toEqual([]);
  });
});
