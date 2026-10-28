import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { BASE_SLOTS } from '../game/gear.js';
import { candidateOf, createBuildSpace, materialise, BLOCKS } from './space.js';
import { legalityOf } from './legality.js';
import { changesOf, writesOf, revert, addChange, canonicalise } from './effect.js';
import { applyPlan } from '../ui/optimiserView.js';
import { enumerateJoint, optimize } from './search.js';
import { canonicalStoneAssignment, stoneAssignmentNeighbours } from './stoneAssignments.js';
import { estimateRun } from './estimate.js';
import { normaliseSetup, defaultSetup } from '../ui/optimiserSetup.js';

const [first, second] = BASE_SLOTS;
function fixture() {
  const raw = structuredClone(fixtureCharacter('WARRIOR'));
  const template = raw.enchantStones[0];
  if (!template) throw new Error('Fixture must include a regular stone');
  raw.enchantStones = [
    { ...template, id: 'stone-a' },
    { ...template, id: 'stone-b', stats: template.stats.map((s) => ({ ...s, value: 0 })) },
    { ...template, id: 'inactive', activated: false },
  ];
  for (const set of Object.values(raw.equipment)) set.enchantSlots = Object.fromEntries(BASE_SLOTS.map((slot) => [slot, null]));
  raw.equipment.set1.enchantSlots[first] = 'stone-a';
  raw.equipment.set1.enchantSlots[second] = 'stone-b';
  raw.equipment.set2.enchantSlots[first] = 'stone-a';
  raw.presets[0].equipmentSet = 1;
  raw.presets[1].equipmentSet = 1;
  return normaliseCharacter(raw);
}
const onlyStones = Object.fromEntries(BLOCKS.map((id) => [id, id === 'stones']));

describe('owned stone assignment', () => {
  it('enables stones for new setups but preserves the allowed writes of older saved setups', () => {
    const c = fixture();
    expect(defaultSetup().space.stones).toBe(true);
    expect(normaliseSetup({ space: { pet: true } }, c).space.stones).toBe(false);
    expect(normaliseSetup({ space: { stones: true } }, c).space.stones).toBe(true);
  });

  it('runs the real search and estimate as local, carrying legal stone changes into Apply review', async () => {
    const c = fixture();
    c.equipment.set1.enchantSlots = Object.fromEntries(BASE_SLOTS.map((slot) => [slot, null]));
    const request = { character: c, presetId: 'p1', target: { kind: 'dummy', seconds: 2 },
      space: onlyStones, effort: { level: 'quick', n0: 4, maxN: 16, randomStarts: 0 }, seed: 1 };
    const result = await optimize(request);
    expect(result.status).toBe('done');
    expect(result.search.strategy).toBe('local');
    expect(result.search.steps.find((step) => step.id === 'stones').tried).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(legalityOf(c, 'p1', row.candidate).ok).toBe(true);
      for (const change of row.changes) expect(change.dimension).toBe('stones');
    }
    expect(estimateRun(request).strategy).toBe('local');
  });
  it('canonicalises saved assignments away and swaps stones without duplicating instances', () => {
    const c = fixture(), B = candidateOf(c, 'p1');
    expect(canonicalStoneAssignment(c, { setKey: 'set1', slots: c.equipment.set1.enchantSlots })).toBeNull();
    const swap = stoneAssignmentNeighbours(c, B).find((v) => v.stoneAssignment.slots[first] === 'stone-b');
    expect(swap.stoneAssignment.slots[second]).toBe('stone-a');
    for (const cand of stoneAssignmentNeighbours(c, B)) {
      const used = Object.values(cand.stoneAssignment.slots).filter(Boolean);
      expect(new Set(used).size).toBe(used.length);
      expect(used).not.toContain('inactive');
    }
  });

  it('uses only the matching realm pool and targets the selected set', () => {
    const c = fixture(), B = candidateOf(c, 'p1');
    for (const cand of stoneAssignmentNeighbours(c, { ...B, equipmentSet: 2 })) expect(cand.stoneAssignment.setKey).toBe('set2');
    const owned = new Set(c.oblivionEnchantStones.map((s) => s.id));
    for (const cand of stoneAssignmentNeighbours(c, B, 'oblivion')) {
      expect(cand.stoneAssignment.setKey).toBe('oblivion');
      for (const id of Object.values(cand.stoneAssignment.slots).filter(Boolean)) expect(owned.has(id)).toBe(true);
    }
  });

  it('round trips every neighbour and writes only its equipment set without mutating the original', () => {
    const c = fixture(), before = JSON.stringify(c), B = candidateOf(c, 'p1');
    for (const cand of stoneAssignmentNeighbours(c, B)) {
      expect(legalityOf(c, 'p1', cand)).toMatchObject({ ok: true });
      const next = materialise(c, 'p1', cand);
      expect(next.equipment.set2).toBe(c.equipment.set2);
      expect(next.equipment.oblivion).toBe(c.equipment.oblivion);
      expect(next.equipment.set1.enchantSlots).toEqual(cand.stoneAssignment.slots);
    }
    expect(JSON.stringify(c)).toBe(before);
  });

  it('rejects duplicate, unknown, cross-realm stones and invalid socket names instead of silently repairing', () => {
    const c = fixture(), B = candidateOf(c, 'p1');
    const bad = [
      { ...c.equipment.set1.enchantSlots, [second]: 'stone-a' },
      { ...c.equipment.set1.enchantSlots, [first]: 'not-owned' },
      { ...c.equipment.set1.enchantSlots, bogus: 'stone-a' },
    ];
    for (const slots of bad) expect(legalityOf(c, 'p1', { ...B, stoneAssignment: { setKey: 'set1', slots } }).ok).toBe(false);
    expect(legalityOf(c, 'p1', { ...B, stoneAssignment: { setKey: 'oblivion', slots: { [first]: 'stone-a' } } }).ok).toBe(false);
  });

  it('reports one set-owned write with shared-preset effects and supports add/revert and excluded Apply groups', () => {
    const c = fixture(), space = createBuildSpace(c, 'p1', { toggles: onlyStones }), B = space.start;
    // a removal neighbour; the block's domain prunes it as dominated, so take it from the neighbourhood
    const X = space.legalise(stoneAssignmentNeighbours(c, B).find((v) => v.stoneAssignment?.slots[first] == null));
    const changes = changesOf(space, B, X);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ id: 'stones:set1', dimension: 'stones', scope: 'character', owner: { setKey: 'set1' } });
    expect(changes[0].sideEffects.map((s) => s.presetId)).toContain('p2');
    expect(changes[0].from).not.toContain('stone-a');
    expect(changes[0].from).toContain('Amplify');
    expect(changes[0].toLines).toEqual([expect.stringMatching(/: Empty$/)]);
    expect(revert(space, B, X, changes[0])).toEqual(B);
    expect(addChange(space, B, X, changes[0])).toEqual(X);
    const writes = writesOf(space, B, X, changes);
    expect(writes[0].title).toBe('Set 1 stones');
    expect(applyPlan({ candidate: X, writes }, [0]).cand.stoneAssignment).toBeUndefined();
  });

  it('bundles a set switch when adding a stone assignment belonging to the other gear set', () => {
    const c = fixture(), space = createBuildSpace(c, 'p1', { toggles: onlyStones }), B = space.start;
    const slots = { ...c.equipment.set2.enchantSlots, [first]: 'stone-b' };
    const X = space.canonical({ ...B, equipmentSet: 2, stoneAssignment: { setKey: 'set2', slots } });
    const change = changesOf(space, B, X).find((entry) => entry.id === 'stones:set2');
    expect(change.bundle).toContain('equipmentSet');
    expect(space.legalise(addChange(space, B, X, change))).toEqual(X);
    const reverted = space.legalise(revert(space, B, X, change));
    expect(reverted.equipmentSet).toBe(2);
    expect(reverted.stoneAssignment).toBeUndefined();
  });

  it('prunes a stone that is no better on every stat than another candidate or the incumbent', () => {
    const raw = structuredClone(fixture());
    const template = raw.enchantStones[0];
    raw.enchantStones = [
      { ...template, id: 'full' },
      { ...template, id: 'half', stats: template.stats.map((s) => ({ ...s, value: s.value / 2 })) },
    ];
    for (const set of Object.values(raw.equipment)) set.enchantSlots = Object.fromEntries(BASE_SLOTS.map((slot) => [slot, null]));
    const c = normaliseCharacter(raw), space = createBuildSpace(c, 'p1', { toggles: onlyStones });
    const used = (v) => Object.values(v.stoneAssignment.slots).filter(Boolean);
    expect(stoneAssignmentNeighbours(c, space.start).some((v) => used(v).includes('half'))).toBe(true);
    const domain = space.blocks.find((b) => b.id === 'stones').domain(space.start);
    expect(domain.length).toBeGreaterThan(0);
    expect(domain.every((v) => used(v).includes('full') && !used(v).includes('half'))).toBe(true);
  });

  it('is a local neighbourhood, respects the toggle and merges stat-identical permutations', () => {
    const c = fixture(), space = createBuildSpace(c, 'p1', { toggles: onlyStones });
    const stones = space.blocks.find((b) => b.id === 'stones');
    // removals only lose stats and the swap is stat-identical, so dominance leaves nothing to race
    expect(stoneAssignmentNeighbours(c, space.start).some((v) => v.stoneAssignment.slots[first] == null)).toBe(true);
    expect(stones.domain(space.start)).toEqual([]);
    expect(enumerateJoint(space, space.start, new Set(['stones']))).toEqual([space.start]);
    const swap = stoneAssignmentNeighbours(c, space.start).find((v) => v.stoneAssignment.slots[first] === 'stone-b');
    expect(canonicalise(space, space.start, swap).candidate).toEqual(space.start);
    const disabled = createBuildSpace(c, 'p1', { toggles: { ...onlyStones, stones: false } });
    expect(disabled.blocks.find((b) => b.id === 'stones').domain(disabled.start)).toEqual([]);
  });
});
