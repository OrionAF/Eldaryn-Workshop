import { describe, it, expect } from 'vitest';
import profile from '../__fixtures__/real/profile-warrior-l72.json';
import { mergeProfileIntoCharacter, describeProfileUpdate, KEPT_ON_UPDATE } from './merge.js';
import { gameProfileToCharacter } from './gameProfile.js';
import { normaliseCharacter, newCharacter } from './index.js';

const incoming = () => normaliseCharacter(gameProfileToCharacter(profile, { now: '2026-10-15T00:00:00.000Z' }));

/** An existing character with its own presets, an opponent and a run, so "kept" is observable. */
function existing() {
  const c = newCharacter('My Warrior', 'WARRIOR');
  c.level = 60;
  c.presets[0].name = 'Farm build';
  c.presets[1].name = 'Boss build';
  c.opponents = [{ id: 'opp1', name: 'Rival', class: 'MYSTIC', spec: null, sheet: { values: { totalAttack: 1 }, enteredAt: 'x' }, sigils: [] }];
  c.baseResidual = { attack: 5, hp: 0, attackSpeed: 0, critChance: 0, critDamage: 0 };
  return normaliseCharacter(c);
}

describe('mergeProfileIntoCharacter', () => {
  it('keeps id, name, presets (names and ids), opponents and base residual', () => {
    const before = existing();
    const merged = mergeProfileIntoCharacter(before, incoming());
    expect(merged.id).toBe(before.id);
    expect(merged.name).toBe('My Warrior');
    expect(merged.presets.map((p) => [p.id, p.name])).toEqual(before.presets.map((p) => [p.id, p.name]));
    expect(merged.opponents).toEqual(before.opponents);
    expect(merged.baseResidual).toEqual(before.baseResidual);
    expect(KEPT_ON_UPDATE).toContain('runs');
  });

  it('takes the game-owned data from the profile', () => {
    const inc = incoming();
    const merged = mergeProfileIntoCharacter(existing(), inc);
    expect(merged.level).toBe(inc.level);
    expect(merged.equipment).toEqual(inc.equipment);
    expect(merged.enchantStones).toEqual(inc.enchantStones);
    expect(merged.relics).toEqual(inc.relics);
  });

  it('puts the profile sheet on the active preset and leaves the other preset untouched', () => {
    const before = existing();
    const inc = incoming();
    const merged = mergeProfileIntoCharacter(before, inc);
    const active = merged.presets.find((p) => p.id === before.activePresetId);
    const other = merged.presets.find((p) => p.id !== before.activePresetId);
    expect(active.sheet).toEqual(inc.presets.find((p) => p.sheet).sheet);
    expect(other.sheet).toBe(before.presets.find((p) => p.id === other.id).sheet);
  });

  it('does not mutate its inputs', () => {
    const before = existing();
    const inc = incoming();
    const a = JSON.stringify(before);
    const b = JSON.stringify(inc);
    mergeProfileIntoCharacter(before, inc);
    expect(JSON.stringify(before)).toBe(a);
    expect(JSON.stringify(inc)).toBe(b);
  });

  it('repairs a preset reference the new data no longer holds (pet gone from the collection)', () => {
    const before = existing();
    before.presets[0].petId = 'pet-that-the-profile-does-not-have';
    const merged = mergeProfileIntoCharacter(before, incoming());
    expect(merged.presets[0].petId).toBeNull();
  });
});

describe('describeProfileUpdate', () => {
  it('lists changed gear slots, stones, level and the sheet target', () => {
    const { lines, unchanged } = describeProfileUpdate(existing(), incoming());
    expect(unchanged).toBe(false);
    expect(lines.some((l) => /^gear changed in Set 1: \d+ slots?$/.test(l))).toBe(true);
    expect(lines.some((l) => /stones?$/.test(l))).toBe(true);
    expect(lines).toContain('sheet updated for preset Farm build');
    expect(lines.some((l) => l.startsWith('level 60 to '))).toBe(true);
  });

  it('reports a profile identical to the character as having no changes beyond the sheet', () => {
    const inc = incoming();
    const same = mergeProfileIntoCharacter(inc, inc);
    const { lines } = describeProfileUpdate(same, inc);
    expect(lines.filter((l) => !l.startsWith('sheet updated'))).toEqual([]);
  });
});
