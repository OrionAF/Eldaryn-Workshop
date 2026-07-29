import { it, expect } from 'vitest';
import { DROP_GOALS, createDropScorer, scoreSwapMonteCarlo } from './dropGoals.js';
import { offensiveStats } from './dps.js';
import { applyStatCaps } from './totals.js';
import { sigilAwareDpsFromTotals } from './optimizer.js';
import { tankScoreFromTotals } from './tankObjective.js';
import { newCharacter, DROP_GOAL_KINDS } from './model.js';

function warrior() {
  const c = newCharacter('Drop Goal Tester');
  c.class = 'Warrior';
  return c;
}

it('DROP_GOALS covers exactly the persisted goal kinds, tank gated to Warrior', () => {
  expect(DROP_GOALS.map((g) => g.kind)).toEqual(DROP_GOAL_KINDS);
  expect(DROP_GOALS.find((g) => g.kind === 'tank').warriorOnly).toBe(true);
  expect(DROP_GOALS.filter((g) => g.kind !== 'tank').every((g) => !g.warriorOnly)).toBe(true);
});

it('the dps-fast scorer is the sigil-aware closed form over capped totals', () => {
  const c = warrior();
  const preset = c.presets[0];
  const totals = offensiveStats({ attack: 1000, crit: 30, crit_mult: 200, speed: 150 });
  const scorer = createDropScorer({ kind: 'dps-fast', ehpWeight: 0.5 }, c, preset);
  expect(scorer(totals)).toBeCloseTo(sigilAwareDpsFromTotals(applyStatCaps(totals), c, preset));
});

it("the dps-accurate scorer's interim estimate equals the fast scorer", () => {
  const c = warrior();
  const preset = c.presets[0];
  const totals = offensiveStats({ attack: 1000, speed: 100 });
  const fast = createDropScorer({ kind: 'dps-fast', ehpWeight: 0.5 }, c, preset);
  const interim = createDropScorer({ kind: 'dps-accurate', ehpWeight: 0.5 }, c, preset);
  expect(interim(totals)).toBeCloseTo(fast(totals));
});

it('hps is gone from the goal list (goals redesign); an unknown kind falls back to the DPS scorer', () => {
  expect(DROP_GOALS.some((g) => g.kind === 'hps')).toBe(false);
  const c = warrior();
  const preset = c.presets[0];
  const totals = offensiveStats({ attack: 1000, speed: 100 });
  const stale = createDropScorer({ kind: 'hps', ehpWeight: 0.5 }, c, preset);
  const dps = createDropScorer({ kind: 'dps-fast', ehpWeight: 0.5 }, c, preset);
  expect(stale(totals)).toBeCloseTo(dps(totals));
});

it('the tank scorer re-applies stat caps before scoring (applySwap output is uncapped)', () => {
  const c = warrior();
  // dmg_reduction over its 60% game cap - a raw applySwap result could carry this.
  const overCap = offensiveStats({ health: 10000, dmg_reduction: 90, hp_regen: 5 });
  const scorer = createDropScorer({ kind: 'tank', ehpWeight: 0.5 }, c, c.presets[0]);
  expect(scorer(overCap)).toBeCloseTo(tankScoreFromTotals(applyStatCaps(overCap), 0.5));
  expect(scorer(overCap)).not.toBeCloseTo(tankScoreFromTotals(overCap, 0.5));
});

it('the tank scorer respects ehpWeight (pure EHP vs pure sustain rank opposite builds oppositely)', () => {
  const c = warrior();
  const preset = c.presets[0];
  const hpPool = offensiveStats({ health: 50000 });
  const sustain = offensiveStats({ health: 10000, hp_regen: 10 });
  const pureEhp = createDropScorer({ kind: 'tank', ehpWeight: 1 }, c, preset);
  const pureSustain = createDropScorer({ kind: 'tank', ehpWeight: 0 }, c, preset);
  expect(pureEhp(hpPool)).toBeGreaterThan(pureEhp(sustain));
  expect(pureSustain(sustain)).toBeGreaterThan(pureSustain(hpPool));
});

it('scoreSwapMonteCarlo pairs both runs on one seed: identical totals score identically', () => {
  const c = warrior();
  const totals = offensiveStats({ attack: 1000, crit: 25, crit_mult: 180, speed: 120 });
  const { curScore, newScore } = scoreSwapMonteCarlo({
    character: c,
    preset: c.presets[0],
    beforeTotals: totals,
    afterTotals: { ...totals },
    iterations: 10,
    durationSeconds: 10,
  });
  expect(curScore).toBe(newScore);
  expect(curScore).toBeGreaterThan(0);
});

it('scoreSwapMonteCarlo detects a real upgrade', () => {
  const c = warrior();
  const before = offensiveStats({ attack: 1000, speed: 100 });
  const after = offensiveStats({ attack: 2000, speed: 100 });
  const { curScore, newScore } = scoreSwapMonteCarlo({
    character: c,
    preset: c.presets[0],
    beforeTotals: before,
    afterTotals: after,
    iterations: 10,
    durationSeconds: 10,
  });
  expect(newScore).toBeGreaterThan(curScore);
});
