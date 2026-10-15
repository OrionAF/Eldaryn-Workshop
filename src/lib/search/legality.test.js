import { describe, it, expect } from 'vitest';
import { legalityOf, assertLegal } from './legality.js';
import { candidateOf } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { talentSpec } from '../game/talents.js';

function fixture(cls, edit = () => {}, opts) {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter(cls, opts)));
  edit(raw);
  return normaliseCharacter(raw);
}
const gates = (r) => r.violations.map((v) => v.gate);

describe('legalityOf', () => {
  it('every saved preset of every fixture is legal as it stands', () => {
    for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
      const c = fixtureCharacter(cls);
      for (const p of c.presets) expect(legalityOf(c, p.id, candidateOf(c, p.id))).toEqual({ ok: true, violations: [], warnings: [] });
    }
  });

  it('structural: unknown ids, bad shapes and unowned picks', () => {
    const c = fixtureCharacter('WARRIOR');
    const s = candidateOf(c, 'p1');
    expect(gates(legalityOf(c, 'p1', { ...s, equipmentSet: 3 }))).toContain('structural');
    expect(gates(legalityOf(c, 'p1', { ...s, petId: 'nope' }))).toContain('owned');
    expect(gates(legalityOf(c, 'p1', { ...s, relicIds: ['a', 'a'] }))).toContain('structural');
    expect(gates(legalityOf(c, 'p1', { ...s, sigilConditions: { CATACLYSM: 'WHENEVER' } }))).toContain('structural');
    expect(gates(legalityOf(c, 'nope', s))).toEqual(['structural']);
  });

  it('17 talent points at level 30 break the cap and do not round-trip (#48)', () => {
    const c = fixture('WARRIOR', (r) => { r.level = 30; });
    const alloc = { ...c.talentSets[0].allocation };
    const t1 = talentSpec('WARRIOR_DPS').tiers.slice(0, 2).flatMap((t) => t.talents).find((t) => (alloc[t.id] ?? 0) < t.maxRank);
    alloc[t1.id] = (alloc[t1.id] ?? 0) + 1;
    const r = legalityOf(c, 'p1', { ...candidateOf(c, 'p1'), talentAllocation: alloc });
    expect(gates(r)).toEqual(expect.arrayContaining(['roundtrip', 'talentPoints']));
  });

  it('a third relic with two slots is illegal (#49)', () => {
    const c = fixture('WARRIOR', (r) => { r.extraRelicSlots = 0; });
    const owned = Object.keys(c.relics);
    const r = legalityOf(c, 'p1', { ...candidateOf(c, 'p1'), relicIds: owned.slice(0, 3) });
    expect(gates(r)).toEqual(expect.arrayContaining(['roundtrip', 'relicSlots']));
  });

  it('a Mage shield on a Druid spec is illegal (#50)', () => {
    const c = fixtureCharacter('MYSTIC', { spec: 'MYSTIC_MAGE' });
    const r = legalityOf(c, 'p1', { ...candidateOf(c, 'p1'), talentSet: 1 });
    expect(gates(r)).toContain('utilityKind');
  });

  it('an Ancient on a board without its node is illegal for a candidate (Q3 strict, #55)', () => {
    const c = fixture('WARRIOR', (r) => { r.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] }); });
    const r = legalityOf(c, 'p1', { ...candidateOf(c, 'p1'), transcendencePresetId: 'bare' });
    expect(gates(r)).toEqual(['ancientBoard']);
  });

  it('unlock gates the model only reports: set 2 below 28, talent set 2 below 38, mounts below 40, links below 58', () => {
    const c = fixture('WARRIOR', (r) => {
      r.level = 26;
      r.presets[0].mountId = null; // mounts unlock at 40 and transcendence at 55: the fixture's choices
      r.presets[0].transcendencePresetId = null; // would be an illegal baseline
      r.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    });
    const s = candidateOf(c, 'p1');
    expect(legalityOf(c, 'p1', s).ok).toBe(true);
    expect(gates(legalityOf(c, 'p1', { ...s, equipmentSet: 2 }))).toEqual(['dualEquip']);
    expect(gates(legalityOf(c, 'p1', { ...s, talentSet: 1, ancientSigilSpecies: null, sigilSpecies: [] }))).toContain('dualTalents');
    expect(gates(legalityOf(c, 'p1', { ...s, mountId: 'mount-a' }))).toEqual(['mounts']);
    expect(gates(legalityOf(c, 'p1', { ...s, transcendencePresetId: 'bare', ancientSigilSpecies: null }))).toContain('transcendenceLink');
  });

  it('a condition below level 54 is illegal; the default is fine', () => {
    const c = fixture('WARRIOR', (r) => { r.level = 53; r.presets[0].transcendencePresetId = null; });
    const s = candidateOf(c, 'p1');
    expect(gates(legalityOf(c, 'p1', { ...s, sigilConditions: { WARBORN_FURY: 'MY_HP_BELOW_40' } }))).toContain('conditions');
    expect(legalityOf(c, 'p1', { ...s, sigilConditions: { WARBORN_FURY: 'ON_COOLDOWN' } }).ok).toBe(true);
  });

  it('a condition the spec does not offer is illegal', () => {
    const c = fixtureCharacter('WARRIOR');
    const r = legalityOf(c, 'p1', { ...candidateOf(c, 'p1'), sigilConditions: { CATACLYSM: 'MY_HP_BELOW_40' } });
    expect(gates(r)).toContain('conditionOption');
  });

  it('glyph gates: sealed, twice on one mount, wrong spec for a major', () => {
    const c = fixture('MYSTIC', (r) => {
      r.glyphs.push({ id: 'gl-s', glyphType: 'g-swift', rarity: 'Common', sealed: true, secondary: { stat: 'critChance', quality: 0.5 } });
      r.glyphs.push({ id: 'gl-m', glyphType: 'sg-m-burst-cd', rarity: 'Epic', secondary: null });
    }, { spec: 'MYSTIC_DRUID' });
    const s = candidateOf(c, 'p1');
    const g = c.mounts[0].glyphs;
    expect(gates(legalityOf(c, 'p1', { ...s, mountGlyphs: { ...g, minor: ['gl-1', 'gl-2', 'gl-s'] } }))).toContain('glyphSealed');
    expect(gates(legalityOf(c, 'p1', { ...s, mountGlyphs: { ...g, minor: ['gl-1', 'gl-1', null] } }))).toContain('glyphDuplicate');
    expect(gates(legalityOf(c, 'p1', { ...s, mountGlyphs: { ...g, major: ['gl-m', null] } }))).toContain('glyphSpec');
  });

  it('assertLegal throws with the gates named', () => {
    const c = fixtureCharacter('WARRIOR');
    expect(() => assertLegal(c, 'p1', { ...candidateOf(c, 'p1'), petId: 'nope' })).toThrow(/owned/);
  });
});
