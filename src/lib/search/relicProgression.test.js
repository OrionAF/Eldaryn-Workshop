import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { relicsForClass, RELIC_CONSTANTS } from '../game/relics.js';
import { BLOCKS, SPACE_DEFAULTS, createBuildSpace, materialise, candidateOf } from './space.js';
import { relicCost, relicSpend, normaliseRelicBudget, relicProgressionAllowed } from './relicProgression.js';
import { legalityOf } from './legality.js';
import { changesOf, writesOf, addChange, revert, canonicalise } from './effect.js';
import { applyPlan } from '../ui/optimiserView.js';
import { defaultSetup, normaliseSetup, requestOf, setupFromRun } from '../ui/optimiserSetup.js';
import { prepare, optimize, optimizeMore, enumerateJoint } from './search.js';
import { estimateRun } from './estimate.js';
import { runFromResult, normaliseRun } from '../model/runs.js';

const pool = relicsForClass('WARRIOR');
const a = pool.find((r) => r.tier === 'bronze');
const b = pool.find((r) => r.tier === 'bronze' && r.id !== a.id);
const rich = { bronze: 10000, silver: 10000, gold: 10000 };
const toggles = (upgrades = true, purchases = true) => Object.fromEntries(BLOCKS.map((id) => [id,
  id === 'relicUpgrades' ? upgrades : id === 'relicPurchases' ? purchases : false]));
function fixture() {
  const c = structuredClone(fixtureCharacter('WARRIOR'));
  c.level = 100;
  c.relics = { [a.id]: 1 };
  c.extraRelicSlots = 0;
  c.presets.forEach((p) => { p.relicIds = [a.id]; });
  return normaliseCharacter(c);
}
const makeSpace = (c = fixture(), opts = {}) => createBuildSpace(c, 'p1', { toggles: toggles(), relicBudget: rich, ...opts });
const domain = (s, id, c = s.start) => s.blocks.find((b) => b.id === id).domain(c);

describe('budgeted relic progression', () => {
  it('defaults paid writes off, including older settings; budgets require nonnegative whole safe numbers', () => {
    expect(SPACE_DEFAULTS).toMatchObject({ relicUpgrades: false, relicPurchases: false });
    expect(defaultSetup().relicBudget).toEqual({ bronze: 0, silver: 0, gold: 0 });
    expect(normaliseSetup({ space: { relics: true } }, fixture()).space).toMatchObject({ relicUpgrades: false, relicPurchases: false });
    expect(normaliseRelicBudget({ bronze: -1, silver: 1.5, gold: Infinity })).toEqual({ bronze: 0, silver: 0, gold: 0 });
  });
  it.each(['bronze', 'silver', 'gold'])('sums every upgrade step and adds the purchase for %s', (tier) => {
    const def = pool.find((r) => r.tier === tier);
    const sum = Array.from({ length: def.maxLevel - 1 }, (_, i) => RELIC_CONSTANTS.upgradeBaseCost[tier] + (i + 1) * RELIC_CONSTANTS.upgradeCostPerLevel[tier]).reduce((x, y) => x + y, 0);
    expect(relicCost({ relics: { [def.id]: 1 } }, def.id, def.maxLevel).amount).toBe(sum);
    expect(relicCost({ relics: {} }, def.id, def.maxLevel).amount).toBe(sum + def.cost);
  });
  it('does not buy or upgrade with zero budget', () => {
    const s = makeSpace(fixture(), { relicBudget: {} });
    expect(domain(s, 'relicUpgrades')).toEqual([]);
    expect(domain(s, 'relicPurchases')).toEqual([]);
  });
  it('upgrades only equipped relics, preserving original ownership and respecting max levels', () => {
    const c = fixture();
    c.relics[b.id] = 1;
    const s = makeSpace(c, { toggles: toggles(true, false) });
    const values = domain(s, 'relicUpgrades');
    expect(values.length).toBe(a.maxLevel - 1);
    for (const cand of values) {
      expect(Object.keys(cand.relicLevels)).toEqual([a.id]);
      expect(legalityOf(c, 'p1', cand).ok).toBe(true);
    }
    expect(domain(s, 'relicPurchases')).toEqual([]);
  });
  it('combines purchase with equipping at level one when upgrades are off, including full slots', () => {
    const c = fixture();
    c.presets[0].relicIds = [a.id, b.id];
    c.relics[b.id] = 1;
    const s = makeSpace(c, { toggles: toggles(false, true) });
    const values = domain(s, 'relicPurchases');
    expect(values.length).toBeGreaterThan(0);
    for (const cand of values) {
      expect(cand.relicIds).toHaveLength(2);
      expect(Object.values(cand.relicLevels)).toEqual([1]);
      expect(legalityOf(c, 'p1', cand)).toMatchObject({ ok: true });
    }
  });
  it('can purchase and upgrade in one move, without exceeding total per-tier budgets', () => {
    const c = fixture(), s = makeSpace(c);
    const purchased = domain(s, 'relicPurchases').find((x) => x.relicLevels?.[b.id] === 3);
    expect(purchased).toBeTruthy();
    const cost = relicCost(c, b.id, 3).amount;
    const limited = makeSpace(c, { relicBudget: { bronze: cost } });
    expect(domain(limited, 'relicPurchases').some((x) => x.relicLevels?.[b.id] === 3)).toBe(true);
    const spent = limited.legalise({ ...purchased, relicLevels: { ...purchased.relicLevels, [a.id]: 2 } });
    expect(relicProgressionAllowed(c, spent, toggles(), limited.relicBudget)).toBe(false);
    expect(limited.admissible(spent)).toBe(false);
    for (const x of domain(limited, 'relicUpgrades', purchased)) expect(relicSpend(c, x).bronze).toBeLessThanOrEqual(cost);
  });
  it('rejects downgrades, cross-class purchases, fractional or excessive levels and malformed maps', () => {
    const c = fixture();
    c.relics[a.id] = 3;
    const B = candidateOf(c, 'p1');
    const other = relicsForClass('MYSTIC')[0];
    for (const relicLevels of [{ [a.id]: 2 }, { [a.id]: 1.5 }, { [a.id]: a.maxLevel + 1 }, { [other.id]: 1 }, [], 'bad']) {
      expect(legalityOf(c, 'p1', { ...B, relicLevels }).ok).toBe(false);
    }
  });
  it('uses existing slot and level gates and never buys a slot', () => {
    const c = fixture();
    c.level = 1;
    const s = makeSpace(c);
    expect(domain(s, 'relicPurchases')).toEqual([]);
    expect(domain(s, 'relicUpgrades')).toEqual([]);
  });
  it('materialises shared levels immutably, in both realms, with increased stats and explicit side effects', () => {
    const c = fixture();
    const before = structuredClone(c);
    for (const realm of ['base', 'oblivion']) {
      const s = makeSpace(c, { realm });
      const X = domain(s, 'relicUpgrades').find((x) => x.relicLevels[a.id] === a.maxLevel);
      const next = materialise(c, 'p1', X);
      expect(next.relics[a.id]).toBe(a.maxLevel);
      expect(next.extraRelicSlots).toBe(c.extraRelicSlots);
      expect(s.fighterOf(X).stats).not.toEqual(s.fighterOf(s.start).stats);
      const change = changesOf(s, s.start, X)[0];
      expect(change.sideEffects).toContainEqual(expect.objectContaining({ presetId: c.presets[1].id }));
      expect(change.medalCost).toEqual(relicCost(c, a.id, a.maxLevel));
      expect(s.key(revert(s, s.start, X, change))).toBe(s.key(s.start));
      expect(s.key(addChange(s, s.start, X, change))).toBe(s.key(X));
    }
    expect(c).toEqual(before);
  });
  it('drops unused progression and keeps purchase/equip dependencies during effect analysis', () => {
    const s = makeSpace();
    const X = domain(s, 'relicPurchases').find((x) => x.relicLevels?.[b.id] === 1);
    const changes = changesOf(s, s.start, X);
    const purchase = changes.find((x) => x.dimension === 'relicPurchases');
    expect(purchase.bundle).toContain('relics');
    expect(legalityOf(s.character, 'p1', s.legalise(addChange(s, s.start, X, purchase))).ok).toBe(true);
    expect(canonicalise(s, s.start, X).candidate.relicLevels?.[b.id]).toBe(1);
    expect(s.legalise({ ...X, relicIds: [a.id] }).relicLevels).toBeUndefined();
  });
  it('keeps Apply groups independent and refuses splitting purchase from equipment changes', () => {
    const s = makeSpace();
    const X = domain(s, 'relicPurchases').find((x) => x.relicLevels?.[b.id] === 1);
    const changes = changesOf(s, s.start, X), writes = writesOf(s, s.start, X, changes);
    const row = { candidate: X, changes, writes };
    const i = writes.findIndex((g) => g.owner.relicId === b.id);
    expect(applyPlan(row).blockReason).toBeUndefined();
    expect(applyPlan(row, [i]).blockReason).toMatch(/together/);
    expect(applyPlan(row, writes.map((_, i) => i)).blockReason).toBeUndefined();
    expect(row.candidate.relicLevels[b.id]).toBe(1);
    const upgrade = domain(s, 'relicUpgrades')[0];
    const cs = changesOf(s, s.start, upgrade);
    expect(applyPlan({ candidate: upgrade, changes: cs, writes: writesOf(s, s.start, upgrade, cs) }, [0]).cand.relicLevels).toBeUndefined();
  });
  it('echoes budgets into signatures, reruns, saved history and requests', () => {
    const c = fixture();
    const setup = normaliseSetup({ ...defaultSetup(), space: toggles(), relicBudget: rich }, c);
    const req = requestOf(setup, c);
    const prep = prepare(req);
    expect(prep.requestEcho.relicBudget).toEqual(rich);
    expect(prepare({ ...req, relicBudget: { ...rich, bronze: 1 } }).requestKey).not.toBe(prep.requestKey);
    const s = prep.space, X = domain(s, 'relicPurchases')[0];
    const changes = changesOf(s, s.start, X);
    const run = runFromResult({ schema: 'optimiser-result/2', request: prep.requestEcho, rows: [{ candidate: X, changes, writes: writesOf(s, s.start, X, changes) }] });
    expect(normaliseRun(run).relicBudget).toEqual(rich);
    expect(run.detail.rows[0].changes.find((x) => x.medalCost).medalCost.estimated).toBe(true);
    expect(setupFromRun(run, c).relicBudget).toEqual(rich);
  });
  it('runs the real optimiser and estimate locally and reports only affordable legal candidates', async () => {
    const c = fixture();
    const req = { character: c, presetId: 'p1', target: { kind: 'dummy', seconds: 2 }, space: toggles(true, false),
      relicBudget: { bronze: relicCost(c, a.id, 2).amount }, effort: { level: 'quick', n0: 4, maxN: 16, randomStarts: 0 }, seed: 1 };
    expect(enumerateJoint(makeSpace(c), candidateOf(c, 'p1'), new Set(['relicUpgrades']))).toBeNull();
    expect(estimateRun(req).strategy).toBe('local');
    const result = await optimize(req);
    expect(result.status).toBe('done');
    expect(result.search.strategy).toBe('local');
    expect(result.request.relicBudget.bronze).toBe(req.relicBudget.bronze);
    for (const row of result.rows) {
      expect(legalityOf(c, 'p1', row.candidate).ok).toBe(true);
      expect(relicSpend(c, row.candidate).bronze).toBeLessThanOrEqual(req.relicBudget.bronze);
    }
  });
  it('confirms a real purchase result, retains its cost on Run more, and keeps it within budget', async () => {
    const c = fixture();
    c.relics = {};
    c.presets.forEach((p) => { p.relicIds = []; });
    const req = { character: c, presetId: 'p1', target: { kind: 'dummy', seconds: 2 }, space: toggles(false, true),
      relicBudget: { bronze: 1000 }, effort: { level: 'quick', n0: 4, maxN: 16, randomStarts: 0 }, seed: 1 };
    const result = await optimize(req);
    expect(result.status).toBe('done');
    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.search.steps.find((s) => s.id === 'relicPurchases').tried).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(legalityOf(c, 'p1', row.candidate).ok).toBe(true);
      expect(row.changes.some((c) => c.dimension === 'relicPurchases' && c.medalCost)).toBe(true);
      expect(relicSpend(c, row.candidate).bronze).toBeLessThanOrEqual(1000);
      const plan = applyPlan(row);
      expect(plan.blockReason).toBeUndefined();
      expect(materialise(c, 'p1', plan.cand).relics).toEqual(row.candidate.relicLevels);
    }
    const more = await optimizeMore({ character: c, result, rowKeys: [result.rows[0].key], targetN: 32 });
    expect(more.request.relicBudget).toEqual(result.request.relicBudget);
    expect(more.rows[0].changes.some((c) => c.medalCost)).toBe(true);
  });
});
