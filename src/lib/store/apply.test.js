import { it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { applyCandidate } from '../search/patch.js';
import { candidateOf } from '../search/space.js';
import { relicsForClass } from '../game/relics.js';

let fixture;
beforeEach(() => {
  localStorage.clear();
  fixture = fixtureCharacter('WARRIOR');
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: 2, characters: [fixture], currentId: fixture.id }));
});

const plain = () => JSON.parse(JSON.stringify(rosterStore.current));

it('applies a relic purchase locally and rejects equipment-only purchases or partial downgrades', () => {
  const c = plain();
  const def = relicsForClass(c.class).find((r) => !c.relics[r.id]);
  expect(def).toBeTruthy();
  const cand = { ...candidateOf(c, 'p1'), relicIds: [def.id], relicLevels: { [def.id]: 2 } };
  expect(rosterStore.applyCandidate('p1', cand, { include: ['preset'] }).ok).toBe(false);
  expect(plain()).toEqual(c);
  expect(rosterStore.applyCandidate('p1', cand).ok).toBe(true);
  expect(plain().relics[def.id]).toBe(2);
  expect(plain().presets[0].relicIds).toEqual([def.id]);
  const bought = plain();
  expect(rosterStore.applyCandidate('p1', { ...candidateOf(bought, 'p1'), relicLevels: { [def.id]: 1 } }, { include: ['character'] }).ok).toBe(false);
  expect(plain()).toEqual(bought);
});

it('writes the same character as the pure patch plus normalise, and persists', () => {
  const g = fixture.mounts[0].glyphs;
  const cand = {
    ...candidateOf(fixture, 'p1'),
    petId: null,
    talentAllocation: {},
    sigilConditions: { WARBORN_FURY: 'MY_HP_BELOW_40' },
    mountGlyphs: { ...g, minor: [g.minor[0], null, null] },
  };
  const expected = normaliseCharacter(applyCandidate(fixture, 'p1', cand));
  expect(rosterStore.applyCandidate('p1', cand)).toEqual({ ok: true, violations: [] });
  expect(plain()).toEqual(JSON.parse(JSON.stringify(expected)));
  expect(localStorage.getItem('eldaryn_optimiser_state_v2')).toContain('MY_HP_BELOW_40');
});

it('refuses an illegal candidate and writes nothing', () => {
  const before = plain();
  const r = rosterStore.applyCandidate('p1', { ...candidateOf(fixture, 'p1'), petId: 'nope' });
  expect(r.ok).toBe(false);
  expect(r.violations.map((v) => v.gate)).toContain('owned');
  expect(plain()).toEqual(before);
});

it('applies only the included groups', () => {
  const cand = { ...candidateOf(fixture, 'p1'), petId: null, talentAllocation: {} };
  expect(rosterStore.applyCandidate('p1', cand, { include: ['preset'] }).ok).toBe(true);
  expect(rosterStore.current.presets[0].petId).toBeNull();
  expect(plain().talentSets[0].allocation).toEqual(fixture.talentSets[0].allocation);
});

it('an unknown preset is refused', () => {
  expect(rosterStore.applyCandidate('nope', candidateOf(fixture, 'p1')).ok).toBe(false);
});
