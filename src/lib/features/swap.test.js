import { describe, it, expect, beforeEach } from 'vitest';
import * as swap from './swap.js';
import {
  itemRawDelta, autoAttackDps, prepareSwap, groupBySet, runSwapMetrics,
  metricSignal, verdictFor, aggregateVerdict, statDeltas, secondaryKey, NEUTRAL_PCT,
  applyFamily, goalObjective, goalIsDamageOnly, goalEffort, DROP_OBJECTIVE_KINDS, DROP_PRECISION,
} from './swap.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { computePresetStats, sheetInputsKey } from '../build/stats.js';
import { buildFighter } from '../build/fighter.js';
import { dpsVsDummy, clearMetricCache } from '../engine/metrics.js';

beforeEach(() => clearMetricCache());

const item = (o = {}) => ({
  rarity: 'ETERNAL', itemLevel: 200, quality: 80,
  primaryStats: { attack: 0, hp: 0 }, secondaryStats: [], conduit: null, ...o,
});

/** Warrior fixture with Set 1 / Set 2 worn and a weaker current WEAPON. */
function warrior() {
  return fixtureCharacter('WARRIOR');
}

const upgrade = () => item({
  primaryStats: { attack: 9000, hp: 0 },
  secondaryStats: [{ type: 'ATTACK_PERCENT', value: 12 }, { type: 'CRIT_CHANCE', value: 8 }],
});

describe('itemRawDelta', () => {
  it('is candidate minus current, keyed by computedKey in raw units', () => {
    const cur = item({ primaryStats: { attack: 4000, hp: 100 }, secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.1 }], conduit: { type: 'FLAME', value: 40 } });
    const cand = item({
      primaryStats: { attack: 5000, hp: 100 },
      secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.15 }, { type: 'FEAR_CHANCE', value: 3 }, { type: 'PVP_ATTACK', value: 90 }],
    });
    const d = itemRawDelta(cur, cand);
    expect(d.totalAttack).toBe(1000);
    expect(d.totalHp).toBeUndefined();
    expect(d.totalAttackSpeed).toBeCloseTo(0.05, 9);
    expect(d.fearChance).toBe(3);
    expect(d.totalFlameConduit).toBe(-40);
    expect(Object.keys(d)).not.toContain('totalPvpAttack');
  });

  it('treats an empty slot as zero stats', () => {
    expect(itemRawDelta(null, item({ primaryStats: { attack: 7, hp: 9 } }))).toEqual({ totalAttack: 7, totalHp: 9 });
    expect(itemRawDelta(null, null)).toEqual({});
  });

  it('maps every pool secondary to a key except the inert PVP ratings', () => {
    expect(secondaryKey('CRIT_DAMAGE')).toBe('totalCritDamage');
    expect(secondaryKey('HEALTH_PERCENT')).toBe('totalHealthPercent');
    expect(secondaryKey('PVP_DEFENSE')).toBeNull();
  });
});

describe('autoAttackDps (combat-pve.md §7)', () => {
  const s = (o = {}) => ({ totalAttack: 1000, totalAttackSpeed: 1, totalCritChance: 0, totalCritDamage: 1.5, totalDoubleHit: 0, ...o });
  it('plain stats: attack per second', () => {
    expect(autoAttackDps(s())).toBe(1000);
  });
  it('uses the rounded swing interval: speed 1.3 swings every 769 ms', () => {
    expect(autoAttackDps(s({ totalAttackSpeed: 1.3 }))).toBeCloseTo((1000 * 1000) / 769, 6);
  });
  it('crit and double hit multiply the swing', () => {
    expect(autoAttackDps(s({ totalCritChance: 50, totalCritDamage: 2, totalDoubleHit: 10 }))).toBeCloseTo(1000 * (1 + 0.5 + 0.1), 6);
  });
  it('is zero for a dead build', () => {
    expect(autoAttackDps(s({ totalAttack: 0 }))).toBe(0);
    expect(autoAttackDps(null)).toBe(0);
  });
  it('agrees with the simulation for a spell-free build (the closed form is the sim mean)', () => {
    const stats = { ...s({ totalCritChance: 30, totalCritDamage: 2, totalDoubleHit: 12, totalAttackSpeed: 1.2 }), totalHp: 1e6, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0, totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0 };
    const sim = dpsVsDummy({ stats, class: 'WARRIOR', spec: null, sigils: [] }, { n: 400, seed: 5 });
    expect(Math.abs(sim.mean / autoAttackDps(stats) - 1)).toBeLessThan(0.02);
  });
});

describe('prepareSwap', () => {
  it('covers every preset, with the set each one would change', () => {
    const c = warrior();
    const rows = prepareSwap(c, { slot: 'WEAPON', item: upgrade() });
    expect(rows.map((r) => [r.presetId, r.setKey])).toEqual([['p1', 'set1'], ['p2', 'set2']]);
    expect(groupBySet(rows).map((g) => g.setKey)).toEqual(['set1', 'set2']);
  });

  it('Set 1 only leaves out the presets wearing Set 2', () => {
    const rows = prepareSwap(warrior(), { slot: 'WEAPON', item: upgrade(), sets: 'set1' });
    expect(rows.map((r) => [r.presetId, r.setKey])).toEqual([['p1', 'set1']]);
  });

  it('can be limited to chosen presets', () => {
    const rows = prepareSwap(warrior(), { slot: 'WEAPON', item: upgrade(), presetIds: ['p2', 'nope'] });
    expect(rows.map((r) => r.presetId)).toEqual(['p2']);
  });

  it('without a sheet recomputes exactly: after equals a rebuilt character', () => {
    const c = warrior();
    const cand = upgrade();
    const [r] = prepareSwap(c, { slot: 'WEAPON', item: cand, presetIds: ['p1'] });
    expect(r.source).toBe('computed');
    expect(r.method).toBe('recomputed');
    const clone = structuredClone(c);
    clone.equipment.set1.items.WEAPON = cand;
    expect(r.after.stats).toEqual(buildFighter(clone, 'p1').stats);
    expect(r.closed.delta).toBeGreaterThan(0);
    expect(r.closed.pct).toBeGreaterThan(0);
    // the input character is untouched
    expect(c.equipment.set1.items.WEAPON.primaryStats.attack).toBe(4200);
  });

  it('a worse item shows a negative closed-form change', () => {
    const [r] = prepareSwap(warrior(), { slot: 'WEAPON', item: item({ primaryStats: { attack: 100, hp: 0 } }), presetIds: ['p1'] });
    expect(r.closed.pct).toBeLessThan(0);
  });

  it('with a sheet anchors on the in-game numbers and agrees with a full recompute', () => {
    const c = warrior();
    const truth = computePresetStats(c, 'p1').computed;
    c.presets[0].sheet = { values: truth, enteredAt: 'now' };
    const cand = upgrade();
    const [r] = prepareSwap(c, { slot: 'WEAPON', item: cand, presetIds: ['p1'] });
    expect(r.source).toBe('sheet');
    expect(r.method).toBe('anchored');
    const clone = structuredClone(c);
    clone.presets[0].sheet = null;
    clone.equipment.set1.items.WEAPON = cand;
    const exact = buildFighter(clone, 'p1').stats;
    expect(Math.abs(r.after.stats.totalAttack / exact.totalAttack - 1)).toBeLessThan(0.002);
    expect(r.after.stats.totalCritChance).toBeCloseTo(exact.totalCritChance, 0);
  });

  it('an exact sheet anchors to the recompute exactly (the computed split rides in ctx.exact); a stale one recomputes', () => {
    const c = warrior();
    const truth = computePresetStats(c, 'p1').computed;
    c.presets[0].sheet = { values: truth, enteredAt: 'now', inputsKey: sheetInputsKey(c, 'p1') };
    const cand = upgrade();
    const [r] = prepareSwap(c, { slot: 'WEAPON', item: cand, presetIds: ['p1'] });
    expect(r.method).toBe('anchored');
    const clone = structuredClone(c);
    clone.presets[0].sheet = null;
    clone.equipment.set1.items.WEAPON = cand;
    const exact = buildFighter(clone, 'p1').stats;
    expect(r.after.stats.totalAttack).toBe(exact.totalAttack);
    expect(r.after.stats.totalHp).toBe(exact.totalHp);
    c.presets[0].petId = null; // the build changed: the sheet is stale
    const [s] = prepareSwap(c, { slot: 'WEAPON', item: cand, presetIds: ['p1'] });
    expect(s.source).toBe('computed');
    expect(s.method).toBe('recomputed');
  });

  it('anchors a sheet that differs from the pipeline: the difference rides along', () => {
    const c = warrior();
    const truth = computePresetStats(c, 'p1').computed;
    c.presets[0].sheet = { values: { ...truth, totalAttack: truth.totalAttack + 5000 }, enteredAt: 'now' };
    const [r] = prepareSwap(c, { slot: 'WEAPON', item: upgrade(), presetIds: ['p1'] });
    const [free] = prepareSwap(warrior(), { slot: 'WEAPON', item: upgrade(), presetIds: ['p1'] });
    expect(r.after.stats.totalAttack).toBeGreaterThan(free.after.stats.totalAttack + 4000);
    expect(r.before.stats.totalAttack).toBe(truth.totalAttack + 5000);
  });

  it('works in the Oblivion realm on the 12-slot set, with and without a sheet', () => {
    const c = warrior();
    const cand = item({ primaryStats: { attack: 60000, hp: 0 } });
    const rows = prepareSwap(c, { slot: 'BELT', item: cand, realm: 'oblivion' });
    expect(rows.every((r) => r.setKey === 'oblivion')).toBe(true);
    expect(rows[0].closed.delta).toBeGreaterThan(0);
    expect(rows[0].before.realm).toBe('oblivion');
    const truth = computePresetStats(c, 'p1', { realm: 'oblivion' }).computed;
    c.oblivion.sheet = { values: truth, enteredAt: 'now' };
    const [s] = prepareSwap(c, { slot: 'BELT', item: cand, realm: 'oblivion', presetIds: ['p1'] });
    expect(s.method).toBe('anchored');
    expect(s.after.stats.totalAttack).toBeGreaterThan(truth.totalAttack);
  });

  it('statDeltas lists only changed stats with display units', () => {
    const [r] = prepareSwap(warrior(), { slot: 'WEAPON', item: upgrade(), presetIds: ['p1'] });
    const rows = statDeltas(r.statsBefore, r.statsAfter);
    expect(rows.map((x) => x.key)).toContain('totalAttack');
    expect(rows.find((x) => x.key === 'totalAttack').delta).toBeGreaterThan(0);
    expect(rows.every((x) => x.delta !== 0)).toBe(true);
  });
});

describe('goals', () => {
  it('Drop Check has no opponent builder of its own: PVP goals use the Optimiser objective (#93)', () => {
    expect(swap.opponentFighter).toBeUndefined();
    expect(swap.dropOpponents).toBeUndefined();
  });

  it('goalObjective resolves Optimiser goals and refuses the kinds a swap cannot use', () => {
    const { target, objective } = goalObjective({ target: { kind: 'worldBoss', affinity: 'NONE' }, objective: { kind: 'dps' } });
    expect(target.kind).toBe('worldBoss');
    expect(objective.kind).toBe('dps');
    expect(goalIsDamageOnly(target, objective)).toBe(true);
    const enraged = goalObjective({ target: { kind: 'worldBoss', affinity: 'ENRAGED' }, objective: { kind: 'dps' } });
    expect(goalIsDamageOnly(enraged.target, enraged.objective)).toBe(false);
    expect(() => goalObjective({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'push' } })).toThrow(/cannot judge/);
    expect(() => goalObjective({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-rate' } })).toThrow(/cannot judge/);
    expect(() => goalObjective({ target: { kind: 'chapter', chapter: 99, level: 1 }, objective: { kind: 'win-chance' } })).toThrow(/does not exist/);
    expect(DROP_OBJECTIVE_KINDS).not.toContain('push');
  });

  it('goalEffort takes δ in the objective kind and the first look from its statistic', () => {
    const dps = goalObjective({ target: { kind: 'dummy' }, objective: { kind: 'dps' } }).objective;
    const win = goalObjective({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-chance' } }).objective;
    expect(goalEffort(dps, 'standard')).toMatchObject({ n0: 32, delta: DROP_PRECISION.standard.rel, deltaKind: 'relative', maxN: DROP_PRECISION.standard.maxN });
    expect(goalEffort(win, 'quick')).toMatchObject({ n0: 200, delta: DROP_PRECISION.quick.prob, deltaKind: 'absolute' });
    expect(goalEffort(dps, 'standard', 8, 4)).toMatchObject({ n0: 4, maxN: 8 });
  });
});

describe('runSwapMetrics', () => {
  const plain = (attack) => ({
    stats: {
      totalHp: 40000, totalAttack: attack, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 20, totalCritDamage: 1.5,
      totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0, totalMissChance: 0, totalBlindChance: 0,
      totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0, totalPvpDefense: 0,
    },
    class: 'WARRIOR', spec: null, sigils: [],
  });
  const items = [{ presetId: 'p1', before: plain(1000), after: plain(1200) }];
  const dummy = (seconds = 20) => ({ id: 'dps', target: { kind: 'dummy', seconds }, objective: { kind: 'dps' } });
  const chapter = { id: 'ch', target: { kind: 'chapter', chapter: 1, level: 2 }, objective: { kind: 'win-chance' } };

  it('reports a paired DPS delta that is significant for a clear upgrade', async () => {
    const { results, aborted } = await runSwapMetrics(items, { goals: [dummy()], n0: 16, maxN: 16, seed: 3 });
    expect(aborted).toBe(false);
    const g = results[0].goals[0];
    expect(g).toMatchObject({ goalId: 'dps', unit: 'dps', objectiveKind: 'dps', damageOnly: true });
    expect(g.label).toMatch(/Training dummy/);
    expect(g.delta.delta).toBeGreaterThan(0);
    expect(g.delta.significant).toBe(true);
    expect(g.after.mean / g.before.mean).toBeGreaterThan(1.15);
    expect(g.before.n).toBe(16);
    expect(g.delta.n).toBe(16);
  });

  it('the dummy goal draws the same fights the dummy DPS metric did (same seed, same rng lanes)', async () => {
    const { results } = await runSwapMetrics([{ presetId: 'p1', before: plain(1000), after: plain(1000) }], { goals: [dummy()], n0: 8, maxN: 8, seed: 3 });
    expect(results[0].goals[0].before.mean).toBeCloseTo(dpsVsDummy(plain(1000), { seconds: 20, n: 8, seed: 3 }).mean, 6);
  });

  it('common random numbers: a no-op swap has an exactly zero delta even with crits', async () => {
    const same = [{ presetId: 'p1', before: plain(1000), after: plain(1000) }];
    const { results } = await runSwapMetrics(same, { goals: [dummy()], n0: 16, maxN: 16, seed: 3 });
    expect(results[0].goals[0].delta).toMatchObject({ delta: 0, lo: 0, hi: 0 });
  });

  it('runs a clear-chance goal next to the dummy and shares one "before" across items with a baseKey', async () => {
    let calls = 0;
    const sampleFor = (goal) => {
      const { objective } = goalObjective(goal);
      return (f, o) => { calls += 1; return objective.sample(f, o); };
    };
    const two = [
      { presetId: 'p1', baseKey: 'b', before: plain(1000), after: plain(1200) },
      { presetId: 'p1', baseKey: 'b', before: plain(1000), after: plain(900) },
    ];
    const { results } = await runSwapMetrics(two, { goals: [dummy(10), chapter], n0: 8, maxN: 8, seed: 2 }, { sampleFor });
    expect(results.map((r) => r.goals.map((g) => g.goalId))).toEqual([['dps', 'ch'], ['dps', 'ch']]);
    expect(results[0].goals[1]).toMatchObject({ unit: 'p', damageOnly: false });
    expect(calls).toBe(6); // per goal: one shared before, two afters
  });

  it('reports progress per finished comparison', async () => {
    const seen = [];
    await runSwapMetrics(items, { goals: [dummy(5), chapter], n0: 4, maxN: 4 }, { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
  });

  it('cancel returns the presets that finished and aborted: true', async () => {
    const two = [...items, { presetId: 'p2', before: plain(1000), after: plain(1100) }];
    const ctl = new AbortController();
    let fired = false;
    const { results, aborted } = await runSwapMetrics(two, { goals: [dummy(5)], n0: 8, maxN: 8 }, {
      signal: ctl.signal,
      onProgress: () => { if (!fired) { fired = true; ctl.abort(); } },
    });
    expect(aborted).toBe(true);
    expect(results[0].goals).toHaveLength(1);
    expect(results.find((r) => r.presetId === 'p2')?.goals ?? []).toEqual([]);
  });

  it('reports the comparator fields and applies the family', async () => {
    const { results } = await runSwapMetrics([{ presetId: 'p1', before: plain(1000), after: plain(1300) }], { goals: [dummy(10)], n0: 4, maxN: 16 });
    expect(results[0].goals[0].delta).toMatchObject({ verdict: 'better', n: 4, maxN: 16, nLooks: 3, holmReject: true });
    expect(results[0].goals[0].delta.zone).toBeGreaterThan(0);
  });
});

describe('verdict', () => {
  const row = (pct, rawDelta = {}) => ({ closed: { pct }, rawDelta });
  const ci = (delta, lo, hi, zone = 0) => ({
    delta, lo, hi, n: 32, zone, significant: lo > 0 || hi < 0,
    verdict: lo > 0 ? 'better' : hi < 0 ? 'worse' : zone > 0 && -zone < lo && hi < zone ? 'equivalent' : 'unresolved',
  });
  const goal = (goalId, delta, damageOnly = false) => ({ goalId, label: goalId, damageOnly, before: { mean: 1 }, after: { mean: 1 }, delta });
  const res = (...goals) => ({ goals });

  it('metricSignal: better and worse need to clear the zone, equivalent is flat, unresolved is unknown', () => {
    expect(metricSignal(ci(5, 1, 9))).toBe('up');
    expect(metricSignal(ci(-5, -9, -1))).toBe('down');
    expect(metricSignal(ci(0.1, 0.05, 0.15, 1))).toBe('flat');
    expect(metricSignal(ci(0, -0.5, 0.5, 1))).toBe('flat');
    expect(metricSignal(ci(5, -1, 11, 1))).toBe('unknown');
    expect(metricSignal(null)).toBe('unknown');
  });

  it('metricSignal reads a Holm rejection in the contrast\'s own direction (a shorter clear time is up)', () => {
    const d = { delta: -500, lo: -900, hi: 100, zone: 100, verdict: 'unresolved', holmReject: true, higherIsBetter: false };
    expect(metricSignal(d)).toBe('up');
    expect(metricSignal({ ...d, higherIsBetter: true })).toBe('down');
  });

  it('without a sim the closed form decides, as an estimate, with a sidegrade band', () => {
    expect(verdictFor(row(3)).verdict).toBe('upgrade');
    expect(verdictFor(row(-3)).verdict).toBe('downgrade');
    expect(verdictFor(row(NEUTRAL_PCT / 2)).verdict).toBe('sidegrade');
    expect(verdictFor(row(null)).verdict).toBe('sidegrade');
    expect(verdictFor(row(3)).basis).toBe('closed');
    expect(verdictFor(row(3)).estimate).toBe(true);
    expect(verdictFor(row(3), res()).basis).toBe('closed');
  });

  it('with a sim the contrast decides: sidegrade only when equivalence is shown, inconclusive when unresolved (#94)', () => {
    expect(verdictFor(row(5), res(goal('a', ci(40, 10, 70)))).verdict).toBe('upgrade');
    expect(verdictFor(row(5), res(goal('a', ci(1, -3, 5, 10)))).verdict).toBe('sidegrade');
    expect(verdictFor(row(5), res(goal('a', ci(2, -30, 34, 10)))).verdict).toBe('inconclusive');
    expect(verdictFor(row(5), res(goal('a', ci(-40, -70, -10)))).verdict).toBe('downgrade');
    expect(verdictFor(row(5), res(goal('a', ci(40, 10, 70)))).basis).toBe('sim');
    expect(verdictFor(row(5), res(goal('a', ci(40, 10, 70)))).estimate).toBe(false);
  });

  it('is mixed when one goal improves and another worsens; unresolved names the goal', () => {
    expect(verdictFor(row(5), res(goal('a', ci(40, 10, 70)), goal('b', ci(-0.1, -0.2, -0.02)))).verdict).toBe('mixed');
    expect(verdictFor(row(0), res(goal('a', ci(0, -5, 5, 10)), goal('b', ci(0.2, 0.1, 0.3)))).verdict).toBe('upgrade');
    const u = verdictFor(row(0), res(goal('a', ci(40, 10, 70)), goal('b', ci(0.02, -0.1, 0.14, 0.01))));
    expect(u.verdict).toBe('inconclusive');
    expect(u.unresolved).toEqual(['b']);
  });

  it('aggregateVerdict combines presets sharing a set', () => {
    expect(aggregateVerdict([])).toBe('empty');
    expect(aggregateVerdict(['upgrade', 'sidegrade'])).toBe('upgrade');
    expect(aggregateVerdict(['upgrade', 'downgrade'])).toBe('mixed');
    expect(aggregateVerdict(['downgrade', 'sidegrade'])).toBe('downgrade');
    expect(aggregateVerdict(['mixed'])).toBe('mixed');
    expect(aggregateVerdict(['sidegrade', 'inconclusive'])).toBe('inconclusive');
    expect(aggregateVerdict(['upgrade', 'inconclusive'])).toBe('inconclusive');
  });

  it('HP% item with only damage-only goals: defence is not measured and HP% is not judged (#100)', () => {
    const c = warrior();
    const hpItem = item({ secondaryStats: [{ type: 'HEALTH_PERCENT', value: 20 }] });
    const [r] = prepareSwap(c, { slot: 'WEAPON', item: hpItem, presetIds: ['p1'] });
    expect(r.rawDelta.totalHealthPercent).toBe(20);
    const v = verdictFor(r, res(goal('dummy', ci(0, -1, 1, 5), true)));
    expect(v.coverage).toEqual(['dummy']);
    expect(v.coverageLabel).toBe('dummy. Damage only: defence not measured');
    expect(v.notJudged).toContain('totalHealthPercent');
    expect(v.notJudged).not.toContain('totalAttack');
    const withClear = verdictFor(r, res(goal('dummy', ci(0, -1, 1, 5), true), goal('dungeon', ci(0, -0.005, 0.005, 0.01))));
    expect(withClear.coverage).toEqual(['dummy', 'dungeon']);
    expect(withClear.coverageLabel).toBe('dummy; dungeon');
    expect(withClear.notJudged).toEqual([]);
  });

  it('Holm over the preset goals lets a weaker goal through when a stronger one is rejected', () => {
    const m = (goalId, delta, p, verdict) => ({ goalId, delta: { delta, lo: -1, hi: 9, n: 64, zone: 1, p, nLooks: 1, verdict } });
    const r = applyFamily({ goals: [m('a', 5, 0.0001, 'better'), m('b', 5, 0.03, 'unresolved')] });
    expect(r.goals[0].delta.holmReject).toBe(true);
    expect(r.goals[1].delta.pHolm).toBeCloseTo(0.03, 9);
    expect(r.goals[1].delta.holmReject).toBe(true);
    expect(metricSignal(r.goals[1].delta)).toBe('up');
    const alone = applyFamily({ goals: [m('a', 5, 0.09, 'unresolved'), m('b', 1, 0.9, 'unresolved')] });
    expect(alone.goals[0].delta.holmReject).toBe(false);
  });
});

describe('Oblivion anchoring (#98)', () => {
  it('an Oblivion sheet anchors only its owner preset; the others are recomputed from their own build', () => {
    const c = warrior();
    const truth = computePresetStats(c, 'p1', { realm: 'oblivion' }).computed;
    c.oblivion.sheet = { values: truth, enteredAt: 'now', presetId: 'p1', inputsKey: sheetInputsKey(c, 'p1', { realm: 'oblivion' }) };
    const cand = item({ primaryStats: { attack: 60000, hp: 0 } });
    const rows = prepareSwap(c, { slot: 'BELT', item: cand, realm: 'oblivion' });
    const by = Object.fromEntries(rows.map((r) => [r.presetId, r]));
    expect(by.p1.method).toBe('anchored');
    expect(by.p2.method).toBe('recomputed');
    expect(by.p2.source).toBe('computed');
    expect(by.p2.sheetStatus).toBe('stale');
    expect(by.p2.warnings.join(' ')).toContain('another preset');
  });

  it('an anchored row says whether its numbers are approximate', () => {
    const c = warrior();
    c.presets[0].sheet = { values: computePresetStats(c, 'p1').computed, enteredAt: 'now' };
    const [r] = prepareSwap(c, { slot: 'WEAPON', item: upgrade(), presetIds: ['p1'] });
    expect(r.method).toBe('anchored');
    expect(typeof r.approx).toBe('boolean');
    expect(r.errors).toBeTypeOf('object');
  });
});
