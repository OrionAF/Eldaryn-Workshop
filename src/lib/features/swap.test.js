import { describe, it, expect, beforeEach } from 'vitest';
import {
  itemRawDelta, autoAttackDps, prepareSwap, groupBySet, buildEnemy, opponentFighter, runSwapMetrics,
  signalOf, verdictFor, aggregateVerdict, statDeltas, secondaryKey, NEUTRAL_PCT,
} from './swap.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { computePresetStats } from '../build/stats.js';
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

describe('enemies and opponents', () => {
  it('buildEnemy: campaign, hard campaign, dungeon and Oblivion floor', () => {
    const c = buildEnemy({ kind: 'campaign', chapter: 3, level: 5 });
    expect(c.label).toBe('Chapter 3, level 5');
    expect(c.mobs.length).toBeGreaterThan(0);
    expect(c.oblivion).toBe(false);
    expect(buildEnemy({ kind: 'campaign', chapter: 13, level: 1 }).label).toMatch(/^Hard Chapter/);
    expect(buildEnemy({ kind: 'dungeon', id: 'dungeon_1', step: 2 }).mobs).toHaveLength(3);
    const r = buildEnemy({ kind: 'raid', id: 'raid_2', step: 3 });
    expect(r.mobs).toHaveLength(5);
    expect(r.label).toBe('Village raid Fortified Stronghold, step 3');
    expect(buildEnemy({ kind: 'raid', id: 'raid_2', step: 9 })).toBeNull();
    const o = buildEnemy({ kind: 'oblivion', floor: 10 });
    expect(o.oblivion).toBe(true);
    expect(o.mobs[0].instability).toBeGreaterThan(0);
    expect(buildEnemy({ kind: 'campaign', chapter: 99, level: 1 })).toBeNull();
    expect(buildEnemy(null)).toBeNull();
  });

  it('opponentFighter needs a sheet', () => {
    expect(opponentFighter({ class: 'WARRIOR' })).toBeNull();
    const f = opponentFighter({ class: 'WARRIOR', spec: 'WARRIOR_DPS', sheet: { values: { totalAttack: 5 } }, majorGlyphs: [{ glyphType: 'x', rarity: 'Common' }] });
    expect(f.stats.totalAttack).toBe(5);
    expect(f.glyphMods).toHaveLength(1);
    expect(f.altarTier).toBe(1);
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

  it('reports a paired DPS delta that is significant for a clear upgrade', async () => {
    const { results, aborted } = await runSwapMetrics(items, { nSim: 16, seconds: 20, seed: 3 });
    expect(aborted).toBe(false);
    const sim = results[0].sim;
    expect(sim.delta.delta).toBeGreaterThan(0);
    expect(sim.delta.significant).toBe(true);
    expect(sim.after.mean / sim.before.mean).toBeGreaterThan(1.15);
    expect(sim.before.n).toBe(16);
    expect(sim.delta.n).toBe(16);
  });

  it('common random numbers: a no-op swap has an exactly zero delta even with crits', async () => {
    const same = [{ presetId: 'p1', before: plain(1000), after: plain(1000) }];
    const { results } = await runSwapMetrics(same, { nSim: 16, seconds: 20, seed: 3 });
    expect(results[0].sim.delta.delta).toBe(0);
    expect(results[0].sim.delta.lo).toBe(0);
    expect(results[0].sim.delta.hi).toBe(0);
  });

  it('adds survival against an enemy and PVP against opponents when asked, and skips what is off', async () => {
    const enemy = buildEnemy({ kind: 'campaign', chapter: 1, level: 2 });
    const opp = { id: 'o1', name: 'Rival', fighter: plain(900) };
    const { results } = await runSwapMetrics(items, { sim: false, enemy, nSurvival: 10, survivalSeconds: 30, opponents: [opp], nPvp: 8, seed: 2 });
    const r = results[0];
    expect(r.sim).toBeUndefined();
    expect(r.survival.before.n).toBe(10);
    expect(r.survival.delta.n).toBe(10);
    expect(r.pvp).toHaveLength(1);
    expect(r.pvp[0].opponentId).toBe('o1');
    expect(r.pvp[0].after.mean).toBeGreaterThanOrEqual(r.pvp[0].before.mean);
  });

  it('reports progress per finished metric', async () => {
    const seen = [];
    await runSwapMetrics(items, { nSim: 4, seconds: 5, enemy: buildEnemy({ kind: 'campaign', chapter: 1, level: 1 }), nSurvival: 4 }, { onProgress: (p) => seen.push(p) });
    expect(seen).toEqual([{ done: 1, total: 2 }, { done: 2, total: 2 }]);
  });

  it('cancel returns the presets that finished and aborted: true', async () => {
    const two = [...items, { presetId: 'p2', before: plain(1000), after: plain(1100) }];
    const ctl = new AbortController();
    let fired = false;
    const { results, aborted } = await runSwapMetrics(two, { nSim: 8, seconds: 5 }, {
      signal: ctl.signal,
      onProgress: () => { if (!fired) { fired = true; ctl.abort(); } },
    });
    expect(aborted).toBe(true);
    expect(results[0].sim).toBeDefined();
    expect(results.find((r) => r.presetId === 'p2')?.sim).toBeUndefined();
  });
});

describe('verdict', () => {
  const row = (pct) => ({ closed: { pct } });
  const ci = (delta, lo, hi) => ({ delta, lo, hi, n: 32, significant: lo > 0 || hi < 0 });
  const sim = (base, d) => ({ sim: { before: { mean: base }, after: { mean: base + d.delta }, delta: d } });

  it('signalOf needs the interval to exclude zero and the change to clear the floor', () => {
    expect(signalOf(ci(5, 1, 9))).toBe('up');
    expect(signalOf(ci(-5, -9, -1))).toBe('down');
    expect(signalOf(ci(5, -1, 11))).toBe('flat');
    expect(signalOf(ci(0.1, 0.05, 0.15), 1)).toBe('flat');
    expect(signalOf(null)).toBe('flat');
  });

  it('without a sim the closed form decides, with a sidegrade band', () => {
    expect(verdictFor(row(3)).verdict).toBe('upgrade');
    expect(verdictFor(row(-3)).verdict).toBe('downgrade');
    expect(verdictFor(row(NEUTRAL_PCT / 2)).verdict).toBe('sidegrade');
    expect(verdictFor(row(null)).verdict).toBe('sidegrade');
    expect(verdictFor(row(3)).basis).toBe('closed');
  });

  it('with a sim the interval decides, not the closed form', () => {
    expect(verdictFor(row(5), sim(1000, ci(40, 10, 70))).verdict).toBe('upgrade');
    expect(verdictFor(row(5), sim(1000, ci(2, -30, 34))).verdict).toBe('sidegrade');
    expect(verdictFor(row(5), sim(1000, ci(-40, -70, -10))).verdict).toBe('downgrade');
    expect(verdictFor(row(5), sim(1000, ci(40, 10, 70))).basis).toBe('sim');
  });

  it('is mixed when one metric improves and another worsens', () => {
    const r = { ...sim(1000, ci(40, 10, 70)), survival: { delta: ci(-0.1, -0.2, -0.02) } };
    expect(verdictFor(row(5), r).verdict).toBe('mixed');
    const p = { ...sim(1000, ci(0, -5, 5)), pvp: [{ delta: ci(0.2, 0.1, 0.3) }] };
    expect(verdictFor(row(0), p).verdict).toBe('upgrade');
  });

  it('aggregateVerdict combines presets sharing a set', () => {
    expect(aggregateVerdict([])).toBe('empty');
    expect(aggregateVerdict(['upgrade', 'sidegrade'])).toBe('upgrade');
    expect(aggregateVerdict(['upgrade', 'downgrade'])).toBe('mixed');
    expect(aggregateVerdict(['downgrade', 'sidegrade'])).toBe('downgrade');
    expect(aggregateVerdict(['mixed'])).toBe('mixed');
  });
});
