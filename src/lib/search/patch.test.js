import { describe, it, expect } from 'vitest';
import { applyCandidate, candidateWrites, SCOPES } from './patch.js';
import { candidateOf } from './space.js';
import { fixtureCharacter } from '../build/fixtures.js';

describe('applyCandidate (pure)', () => {
  const c = fixtureCharacter('WARRIOR');
  const start = candidateOf(c, 'p1');
  const g = c.mounts[0].glyphs;
  const X = {
    ...start,
    petId: null,
    talentAllocation: {},
    sigilConditions: { WARBORN_FURY: 'MY_HP_BELOW_40' },
    mountGlyphs: { ...g, minor: [g.minor[0], null, null] },
  };

  it('writes each scope and never mutates the input', () => {
    const before = JSON.stringify(c);
    const out = applyCandidate(c, 'p1', X);
    expect(JSON.stringify(c)).toBe(before);
    expect(out.presets[0].petId).toBeNull();
    expect(out.presets[1]).toBe(c.presets[1]);
    expect(out.talentSets[0].allocation).toEqual({});
    expect(out.sigils.owned.WARBORN_FURY.condition).toBe('MY_HP_BELOW_40');
    expect(out.mounts[0].glyphs.minor).toEqual([g.minor[0], null, null]);
  });

  it('an excluded scope is left as it was', () => {
    const out = applyCandidate(c, 'p1', X, { include: SCOPES.filter((s) => s !== 'character') });
    expect(out.talentSets).toBe(c.talentSets);
    expect(out.sigils).toBe(c.sigils);
    expect(out.presets[0].petId).toBeNull();
    expect(applyCandidate(c, 'p1', X, { include: ['character'] }).presets).toBe(c.presets);
  });

  it('writing ON_COOLDOWN clears a stored condition', () => {
    const withCond = applyCandidate(c, 'p1', X);
    const back = applyCandidate(withCond, 'p1', { ...start, sigilConditions: { WARBORN_FURY: 'ON_COOLDOWN' } });
    expect(back.sigils.owned.WARBORN_FURY).toEqual({ level: c.sigils.owned.WARBORN_FURY.level });
  });

  it('keeps a null board link while the candidate keeps its board (#56)', () => {
    const p2 = candidateOf(c, 'p2');
    expect(p2.transcendencePresetId).toBe('default');
    expect(candidateWrites(c, 'p2', p2).preset.transcendencePresetId).toBeNull();
  });
});
