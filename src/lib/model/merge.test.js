import { describe, it, expect } from 'vitest';
import profile from '../__fixtures__/real/profile-warrior-l72.json';
import mysticBefore from '../__fixtures__/real/profile-mystic-l50.json';
import mysticNow from '../__fixtures__/real/profile-mystic-l50-presets.json';
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

const userSheet = { values: { totalAttack: 123 }, enteredAt: '2026-01-01T00:00:00.000Z' };

describe('mergeProfileIntoCharacter', () => {
  it('keeps id, name, opponents and base residual', () => {
    const before = existing();
    const merged = mergeProfileIntoCharacter(before, incoming());
    expect(merged.id).toBe(before.id);
    expect(merged.name).toBe('My Warrior');
    expect(merged.opponents).toEqual(before.opponents);
    expect(merged.baseResidual).toEqual(before.baseResidual);
    expect(KEPT_ON_UPDATE).toContain('runs');
    expect(KEPT_ON_UPDATE).not.toContain('presets');
  });

  it('fills an app preset that holds nothing with a game preset, appends the rest and keeps an app-only preset', () => {
    const before = existing();
    before.presets[1].sheet = structuredClone(userSheet); // Boss build holds a sheet the user typed
    const own = normaliseCharacter(before);
    const merged = mergeProfileIntoCharacter(own, incoming());
    expect(merged.presets.map((p) => p.name)).toEqual(['TANK', 'Boss build', 'PVP']);
    expect(merged.presets[0].id).toBe('default'); // the game's id, so the next paste matches it
    expect(merged.presets[1]).toEqual(own.presets[1]);
  });

  it('updates a preset with the same id: the game name and choices, its own saved sheet', () => {
    const inc = incoming();
    const before = structuredClone(inc);
    const pvp = before.presets.find((p) => p.name === 'PVP');
    pvp.name = 'Old name';
    pvp.petId = null;
    pvp.sheet = structuredClone(userSheet);
    const merged = mergeProfileIntoCharacter(normaliseCharacter(before), inc);
    const after = merged.presets.find((p) => p.id === pvp.id);
    expect(after.name).toBe('PVP');
    expect(after.petId).toBe(inc.presets.find((p) => p.id === pvp.id).petId);
    expect(after.sheet.values).toEqual(userSheet.values);
    expect(merged.presets).toHaveLength(inc.presets.length);
  });

  it("makes the game's selected preset the active one", () => {
    const before = existing();
    const merged = mergeProfileIntoCharacter(before, incoming());
    expect(merged.activePresetId).toBe(profile.activePresetId);
  });

  it('is stable: a second paste of the same profile changes no preset', () => {
    const once = mergeProfileIntoCharacter(existing(), incoming());
    const twice = mergeProfileIntoCharacter(once, incoming());
    expect(twice.presets).toEqual(once.presets);
  });

  it('drops a game preset that does not fit in 8 and reports it', () => {
    const before = existing();
    while (before.presets.length < 8) before.presets.push({ ...structuredClone(before.presets[0]), id: `own${before.presets.length}`, sheet: structuredClone(userSheet) });
    for (const p of before.presets) p.sheet = structuredClone(userSheet);
    const report = [];
    const merged = mergeProfileIntoCharacter(normaliseCharacter(before), incoming(), { report });
    expect(merged.presets).toHaveLength(8);
    expect(report).toContainEqual(expect.objectContaining({ kind: 'dropped', what: 'presets', count: 2 }));
    expect(merged.presets.every((p) => p.sheet.values.totalAttack === 123)).toBe(true); // the worn preset did not fit, so the sheet has no owner
  });

  it('takes the game-owned data from the profile', () => {
    const inc = incoming();
    const merged = mergeProfileIntoCharacter(existing(), inc);
    expect(merged.level).toBe(inc.level);
    expect(merged.equipment).toEqual(inc.equipment);
    expect(merged.enchantStones).toEqual(inc.enchantStones);
    expect(merged.relics).toEqual(inc.relics);
  });

  it('puts the profile sheet on the preset the game wears, not on the one open in the app', () => {
    const before = existing();
    before.presets[1].sheet = structuredClone(userSheet);
    before.activePresetId = before.presets[1].id; // the app has Boss build open
    const inc = incoming();
    const merged = mergeProfileIntoCharacter(normaliseCharacter(before), inc);
    const worn = inc.presets.find((p) => p.sheet);
    expect(merged.presets.find((p) => p.id === worn.id).sheet).toEqual(worn.sheet);
    expect(merged.presets.find((p) => p.name === 'Boss build').sheet.values).toEqual(userSheet.values);
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

describe('mergeProfileIntoCharacter: a character imported before the game gained a second preset', () => {
  // the same Mystic twice: one preset (DEFAULT) at the first import; MAGE + CAT FORM (Druid) now
  const NOW = '2026-10-15T00:00:00.000Z';
  const fromProfile = (p) => normaliseCharacter(gameProfileToCharacter(p, { now: NOW }));
  const choices = ({ id, sheet, ...rest }) => rest;

  it('lands every game preset, with its name and choices', () => {
    const before = fromProfile(mysticBefore);
    expect(before.presets.map((p) => p.name)).toEqual(['DEFAULT', 'Preset 2']);
    const inc = fromProfile(mysticNow);
    const merged = mergeProfileIntoCharacter(before, inc);
    for (const p of inc.presets) expect(merged.presets.map(choices)).toContainEqual(choices(p));
    const cat = merged.presets.find((p) => p.name === 'CAT FORM');
    expect(cat).toMatchObject({ equipmentSet: 2, talentSet: 1, utilitySigilSpecies: 'LUPINE_FORM', relicIds: ['relic_runic_focus', 'relic_siphon_fang'] });
    expect(merged.presets.find((p) => p.name === 'MAGE').sheet).toEqual(inc.presets.find((p) => p.sheet).sheet);
    expect(merged.presets.map((p) => p.id)).toEqual(inc.presets.map((p) => p.id));
  });

  it("does not add the padding of a one-preset profile as another preset", () => {
    const now = mergeProfileIntoCharacter(fromProfile(mysticBefore), fromProfile(mysticNow));
    const back = mergeProfileIntoCharacter(now, fromProfile(mysticBefore));
    expect(back.presets.map((p) => p.name)).toEqual(['DEFAULT', 'CAT FORM']);
  });

  it('lists the preset changes in the update summary', () => {
    const { lines } = describeProfileUpdate(fromProfile(mysticBefore), fromProfile(mysticNow));
    expect(lines).toEqual(expect.arrayContaining(['preset DEFAULT renamed MAGE', 'preset Preset 2 becomes CAT FORM', 'sheet updated for preset MAGE']));
  });
});

describe('describeProfileUpdate', () => {
  it('lists changed gear slots, stones, level and the sheet target', () => {
    const { lines, unchanged } = describeProfileUpdate(existing(), incoming());
    expect(unchanged).toBe(false);
    expect(lines.some((l) => /^gear changed in Set 1: \d+ slots?$/.test(l))).toBe(true);
    expect(lines.some((l) => /stones?$/.test(l))).toBe(true);
    expect(lines).toContain('preset Farm build becomes TANK');
    expect(lines).toContain('sheet updated for preset TANK');
    expect(lines.some((l) => l.startsWith('level 60 to '))).toBe(true);
  });

  it('reports a profile identical to the character as having no changes beyond the sheet', () => {
    const inc = incoming();
    const same = mergeProfileIntoCharacter(inc, inc);
    const { lines } = describeProfileUpdate(same, inc);
    expect(lines.filter((l) => !l.startsWith('sheet updated'))).toEqual([]);
  });
});
