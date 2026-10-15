import { describe, it, expect, beforeEach } from 'vitest';
import { parseDropBatch, prepareBatch, entryResults, judgeEntry, rankEntries } from './dropBatch.js';
import { runSwapMetrics } from './swap.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { clearMetricCache } from '../engine/metrics.js';
import real from '../__fixtures__/real/drop-batch.json';

beforeEach(() => clearMetricCache());

const warrior = () => fixtureCharacter('WARRIOR');
const bagItem = (o = {}) => ({
  name: 'Test Helm', itemType: 'CELESTIAL', slot: 'HEAD', rarity: 'MYTHIC', itemLevel: 100, qualityBonus: 0, class: 'WARRIOR',
  primaryStats: { attack: 3000, hp: 20000 }, secondaryStats: [{ type: 'ATTACK_PERCENT', value: 5 }], ...o,
});

describe('parseDropBatch', () => {
  it('reads the real loot bag: four Warrior items, base realm', () => {
    const r = parseDropBatch(real, warrior());
    expect(r.error).toBeNull();
    expect(r.source).toBe('batch');
    expect(r.skipped).toEqual([]);
    expect(r.entries.map((e) => [e.name, e.slot, e.realm])).toEqual([
      ['Celestial Helmet', 'HEAD', 'base'],
      ['Abyssal Leggings', 'LEGGINGS', 'base'],
      ['Cosmic Chestplate', 'CHEST', 'base'],
      ['Dragonforged Shoulderplates', 'SHOULDERS', 'base'],
    ]);
    const helm = r.entries[0].item;
    expect(helm).toMatchObject({ rarity: 'MYTHIC', itemLevel: 100, primaryStats: { attack: 3696, hp: 17268 } });
    expect(helm.secondaryStats).toEqual([{ type: 'HEALTH_PERCENT', value: 11.5 }, { type: 'ATTACK_PERCENT', value: 3.2 }]);
  });

  it('accepts JSON text and a full game profile (its pendingItems)', () => {
    const fromText = parseDropBatch(JSON.stringify(real), warrior());
    expect(fromText.entries).toHaveLength(4);
    const profile = {
      player: { name: 'P', class: 'WARRIOR', level: 80 }, equipment: {}, pendingItems: [bagItem()],
    };
    const r = parseDropBatch(profile, warrior());
    expect(r.source).toBe('profile');
    expect(r.entries).toHaveLength(1);
  });

  it('skips an item of another class with a note, and gates the secondaries for the current class', () => {
    const r = parseDropBatch({
      pendingItems: [bagItem({ name: 'Mage Hat', class: 'MYSTIC' }), bagItem({ name: 'Mine' })],
    }, warrior());
    expect(r.entries.map((e) => e.name)).toEqual(['Mine']);
    expect(r.skipped).toEqual([{ name: 'Mage Hat', reason: expect.stringContaining('another class (MYSTIC)') }]);
  });

  it('drops secondaries the class cannot roll and counts them', () => {
    const r = parseDropBatch({
      pendingItems: [bagItem({ secondaryStats: [{ type: 'ATTACK_PERCENT', value: 5 }, { type: 'NOT_A_STAT', value: 9 }] })],
    }, warrior());
    expect(r.entries[0].item.secondaryStats).toEqual([{ type: 'ATTACK_PERCENT', value: 5 }]);
    expect(r.entries[0].dropped).toBe(1);
  });

  it('Oblivion drops are judged in the Oblivion realm when unlocked, listed as skipped when not', () => {
    const bag = { pendingItems: [bagItem()], oblivionPendingItems: [bagItem({ name: 'Void Belt', slot: 'BELT' })] };
    const open = parseDropBatch(bag, warrior());
    expect(open.entries.map((e) => [e.name, e.realm])).toEqual([['Test Helm', 'base'], ['Void Belt', 'oblivion']]);

    const locked = warrior();
    locked.oblivion = { ...locked.oblivion, unlocked: false };
    const r = parseDropBatch(bag, locked);
    expect(r.entries.map((e) => e.name)).toEqual(['Test Helm']);
    expect(r.skipped).toEqual([{ name: 'Void Belt', reason: expect.stringContaining('not unlocked') }]);
  });

  it('a base item in an Oblivion-only slot is skipped', () => {
    const r = parseDropBatch({ pendingItems: [bagItem({ name: 'Belt', slot: 'BELT' })] }, warrior());
    expect(r.entries).toEqual([]);
    expect(r.skipped[0].reason).toContain('Unknown slot BELT');
  });

  it('reports malformed input instead of throwing', () => {
    const c = warrior();
    expect(parseDropBatch('', c).error).toMatch(/Paste/);
    expect(parseDropBatch('{nope', c).error).toMatch(/not valid JSON/);
    expect(parseDropBatch('[1,2]', c).error).toMatch(/pendingItems/);
    expect(parseDropBatch({ hello: 1 }, c).error).toMatch(/pendingItems/);
    const r = parseDropBatch({ pendingItems: [null, 'x', bagItem({ primaryStats: {}, secondaryStats: [] }), bagItem({ slot: 'NOPE' })] }, c);
    expect(r.error).toBeNull();
    expect(r.entries).toEqual([]);
    expect(r.skipped.map((s) => s.reason)).toEqual(['Not an item', 'Not an item', 'No stats', 'Unknown slot NOPE']);
  });
});

describe('prepareBatch and ranking', () => {
  const c = warrior();
  const strong = bagItem({ name: 'Big', slot: 'WEAPON', primaryStats: { attack: 20000, hp: 0 }, secondaryStats: [{ type: 'ATTACK_PERCENT', value: 20 }] });
  const weak = bagItem({ name: 'Tiny', slot: 'WEAPON', primaryStats: { attack: 1, hp: 0 }, secondaryStats: [] });
  const entries = parseDropBatch({ pendingItems: [weak, strong] }, c).entries;

  it('makes one request item per entry and preset, sharing the unchanged "before" of a preset', () => {
    const { request, rows, offsets } = prepareBatch(c, entries);
    expect(rows.map((r) => r.length)).toEqual([c.presets.length, c.presets.length]);
    expect(offsets).toEqual([0, c.presets.length]);
    expect(request.items).toHaveLength(2 * c.presets.length);
    expect(request).toMatchObject({ mode: 'dropCheck', sim: true });
    expect(request.items[0].baseKey).toBe(request.items[c.presets.length].baseKey);
  });

  it('without a simulation, ranks on the closed form: the stronger drop first', () => {
    const { rows, offsets } = prepareBatch(c, entries);
    const ranked = rankEntries(entries, rows, offsets, []);
    expect(ranked.map((r) => r.entry.name)).toEqual(['Big', 'Tiny']);
    expect(ranked[0].best).toMatchObject({ verdict: 'upgrade', basis: 'closed' });
    expect(ranked[1].best.verdict).toBe('downgrade');
  });

  it('with simulated results the best verdict carries the paired delta and its interval', async () => {
    const { request, rows, offsets } = prepareBatch(c, entries);
    const { results, aborted } = await runSwapMetrics(request.items, { ...request, nSim: 8, seconds: 10, maxN: 8 });
    expect(aborted).toBe(false);
    const ranked = rankEntries(entries, rows, offsets, results);
    expect(ranked[0].entry.name).toBe('Big');
    expect(ranked[0].best.basis).toBe('sim');
    expect(ranked[0].best.sim.delta).toMatchObject({ n: 8 });
    expect(ranked[0].best.sim.delta.lo).toBeGreaterThan(0);
    // the simulated numbers equal the single-drop view's: the same task on the same pair, no shared-before drift
    const solo = await runSwapMetrics([{ presetId: request.items[0].presetId, before: request.items[0].before, after: request.items[0].after }], { nSim: 8, seconds: 10, maxN: 8 });
    expect(results[0].sim).toEqual(solo.results[0].sim);
  });

  it('an unfinished entry (cancelled run) falls back to the closed form', () => {
    const { rows, offsets } = prepareBatch(c, entries);
    const partial = [{ presetId: rows[0][0].presetId }];
    expect(entryResults(offsets, rows, 0, partial).every((x) => x === null)).toBe(true);
    expect(judgeEntry(rows[0], entryResults(offsets, rows, 0, partial)).basis).toBe('closed');
  });
});

describe('judging per equipment set (#97, #100)', () => {
  const sharedSet = () => {
    const c = warrior();
    c.presets[1].equipmentSet = 1; // both presets wear Set 1
    return c;
  };
  const drop = parseDropBatch({ pendingItems: [bagItem({ name: 'Ring', slot: 'WEAPON', primaryStats: { attack: 20000, hp: 0 } })] }, sharedSet()).entries;
  const res = (base, delta, verdict) => ({
    sim: {
      before: { mean: base }, after: { mean: base + delta },
      delta: { delta, lo: delta - 1, hi: delta + 1, n: 64, zone: 1, verdict, significant: true },
    },
  });

  it('presets on one set that disagree make the item mixed, not an upgrade (A +6 %, B -9 %)', () => {
    const c = sharedSet();
    const { rows, offsets } = prepareBatch(c, drop);
    expect(rows[0].map((r) => r.setKey)).toEqual(['set1', 'set1']);
    const results = [res(1000, 60, 'better'), res(1000, -90, 'worse')];
    const best = judgeEntry(rows[0], results);
    expect(best.verdict).toBe('mixed');
    expect(best.setKey).toBe('set1');
    expect(best.presetCount).toBe(2);
    expect(best.upgrades).toBe(1);
    expect(rankEntries(drop, rows, offsets, results)[0].best.verdict).toBe('mixed');
  });

  it('the best set wins: a clean upgrade for set 2 beats a mixed set 1', () => {
    const c = warrior();
    c.presets.push({ ...structuredClone(c.presets[0]), id: 'p3', name: 'Third', equipmentSet: 1 });
    const { rows } = prepareBatch(c, drop);
    expect(rows[0].map((r) => [r.presetId, r.setKey])).toEqual([['p1', 'set1'], ['p2', 'set2'], ['p3', 'set1']]);
    const best = judgeEntry(rows[0], [res(1000, 60, 'better'), res(1000, 30, 'better'), res(1000, -90, 'worse')]);
    expect(best.verdict).toBe('upgrade');
    expect(best.setKey).toBe('set2');
    expect(best.sets.map((s) => [s.setKey, s.verdict])).toEqual([['set1', 'mixed'], ['set2', 'upgrade']]);
  });

  it('carries the coverage of the verdict and the stats it did not judge', () => {
    const c = sharedSet();
    const hp = parseDropBatch({ pendingItems: [bagItem({ slot: 'WEAPON', primaryStats: { attack: 0, hp: 0 }, secondaryStats: [{ type: 'HEALTH_PERCENT', value: 20 }] })] }, c).entries;
    const { rows } = prepareBatch(c, hp);
    const best = judgeEntry(rows[0], [res(1000, 0, 'equivalent'), res(1000, 0, 'equivalent')]);
    expect(best.verdict).toBe('sidegrade');
    expect(best.coverage).toEqual(['dps']);
    expect(best.coverageLabel).toBe('DPS only: defence not measured');
    expect(best.notJudged).toContain('totalHealthPercent');
  });

  it('a metric unresolved at maxN ranks above a proven sidegrade and is labelled inconclusive', () => {
    const c = sharedSet();
    const { rows } = prepareBatch(c, drop);
    expect(judgeEntry(rows[0], [res(1000, 1, 'unresolved'), res(1000, 0, 'equivalent')]).verdict).toBe('inconclusive');
  });
});
