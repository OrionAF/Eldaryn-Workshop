import { describe, it, expect } from 'vitest';
import { calculateSigilBonuses, emptySigilBonuses, getActiveEquippedSpecies } from './sigilPassive.js';

const own = (species, level) => ({ species, level });

describe('calculateSigilBonuses (L1095765-1096023)', () => {
  it('no equipped sigils returns zeros', () => {
    expect(calculateSigilBonuses({ ownedSigils: [own('BERSERK_STANCE', 5)], equippedSpecies: [] }, 'WARRIOR', 'WARRIOR_TANK'))
      .toEqual(emptySigilBonuses());
  });

  it('Warrior: flat Attack/HP sum plus AURA percent (Common L5 Health 1819, Attack% 5.3)', () => {
    const state = {
      ownedSigils: [own('BERSERK_STANCE', 5), own('DEFENSE_STANCE', 5), own('BLADE_OF_JUDGMENT', 1)],
      equippedSpecies: ['BERSERK_STANCE', 'DEFENSE_STANCE', 'BLADE_OF_JUDGMENT'],
    };
    const out = calculateSigilBonuses(state, 'WARRIOR', 'WARRIOR_TANK');
    // Common x3 with levels 5, 5, 1: attack floor(232.4)=232 twice + 166; hp 1819 twice + 1300
    expect(out.flatAttack).toBe(232 + 232 + 166);
    expect(out.flatHp).toBe(1819 + 1819 + 1300);
    expect(out.attackPercent).toBe(5.3); // Berserk 4 * 1.32
    expect(out.hpPercent).toBe(10.6); // Defense 8 * 1.32 = 10.56 -> 10.6
    // the damage spell is not an aura: nothing else moves
    expect(out.attackSpeed + out.missChance + out.hpRegen + out.spellDamage).toBe(0);
  });

  it('Altar tier multiplies the flat part only (x3 at tier 2), never the aura value', () => {
    const state = { ownedSigils: [own('BERSERK_STANCE', 5)], equippedSpecies: ['BERSERK_STANCE'], altarTier: 2 };
    const out = calculateSigilBonuses(state, 'WARRIOR', null);
    expect(out.flatHp).toBe(5459);
    expect(out.flatAttack).toBe(Math.floor(166 * 1.4 * 3));
    expect(out.attackPercent).toBe(5.3);
  });

  it('missing altarTier defaults to 1; an equipped but unowned sigil is skipped', () => {
    const state = { ownedSigils: [own('BERSERK_STANCE', 1)], equippedSpecies: ['BERSERK_STANCE', 'HEMORRHAGE'] };
    const out = calculateSigilBonuses(state, 'WARRIOR', null);
    expect(out.flatAttack).toBe(166);
    expect(out.flatHp).toBe(1300);
  });

  it('Sentinel auras fill attackSpeed (2 decimals), missChance and hpRegen', () => {
    const state = {
      ownedSigils: [own('HAWK_FOCUS', 5), own('MIST_VEIL', 5), own('WILD_RENEWAL', 5)],
      equippedSpecies: ['HAWK_FOCUS', 'MIST_VEIL', 'WILD_RENEWAL'],
    };
    const out = calculateSigilBonuses(state, 'SENTINEL', 'SENTINEL_HUNTER');
    expect(out.attackSpeed).toBe(0.13);
    expect(out.missChance).toBe(10.6); // 8*1.32 = 10.56
    expect(out.hpRegen).toBe(6.6); // 5*1.32
    expect(out.flatHp).toBe(1819 * 3);
  });

  it('non-aura sigils contribute flat stats only (Legendary stack sigil)', () => {
    const state = { ownedSigils: [own('BULWARK_OF_THORNS', 10)], equippedSpecies: ['BULWARK_OF_THORNS'] };
    const out = calculateSigilBonuses(state, 'WARRIOR', null);
    expect(out.flatAttack).toBe(Math.floor(9000 * 1.9));
    expect(out.flatHp).toBe(Math.floor(58000 * 1.9));
    expect(out.attackPercent).toBe(0);
  });

  it('the Ancient counts like any equipped sigil: 6000 / 40000 at tier 1, x9 at tier 3', () => {
    const base = { ownedSigils: [own('EARTHWARDEN', 1)], equippedSpecies: ['EARTHWARDEN'] };
    expect(calculateSigilBonuses(base, 'WARRIOR', null)).toMatchObject({ flatAttack: 6000, flatHp: 40000 });
    expect(calculateSigilBonuses({ ...base, altarTier: 3 }, 'WARRIOR', null)).toMatchObject({ flatAttack: 54000, flatHp: 360000 });
  });

  it('the utility slot is added to the generic list (Necromancer Summon, Mage Shield)', () => {
    const necro = { ownedSigils: [own('BONE_SERVANT', 1)], equippedSpecies: [], utilitySlotSpecies: 'BONE_SERVANT' };
    expect(calculateSigilBonuses(necro, 'NECROMANCER', 'NECROMANCER_SUMMONER').flatAttack).toBe(166);
    const mage = { ownedSigils: [own('ARCANE_BARRIER', 1)], equippedSpecies: [], utilitySlotSpecies: 'ARCANE_BARRIER' };
    expect(calculateSigilBonuses(mage, 'MYSTIC', 'MYSTIC_MAGE').flatHp).toBe(1300);
  });

  it('Mystic Mage ignores a Druid-only sigil (isSigilSpeciesActiveForSpec)', () => {
    const state = { ownedSigils: [own('PRIMAL_AWAKENING', 1)], equippedSpecies: ['PRIMAL_AWAKENING'] };
    expect(calculateSigilBonuses(state, 'MYSTIC', 'MYSTIC_MAGE')).toEqual(emptySigilBonuses());
  });

  it('Druid: reads druidEquippedSpecies and druidUtilitySlotSpecies, not the Mage lists', () => {
    const state = {
      ownedSigils: [own('ARCANE_EMPOWERMENT', 1), own('URSINE_FORM', 1)],
      equippedSpecies: ['ARCANE_EMPOWERMENT'],
      druidEquippedSpecies: [],
      utilitySlotSpecies: 'URSINE_FORM',
      druidUtilitySlotSpecies: null,
    };
    expect(calculateSigilBonuses(state, 'MYSTIC', 'MYSTIC_DRUID')).toEqual(emptySigilBonuses());
    expect(getActiveEquippedSpecies(state, 'MYSTIC', 'MYSTIC_DRUID')).toEqual([]);
    expect(getActiveEquippedSpecies(state, 'MYSTIC', 'MYSTIC_MAGE')).toEqual(['ARCANE_EMPOWERMENT']);
    const druid = { ...state, druidEquippedSpecies: ['ARCANE_EMPOWERMENT'], druidUtilitySlotSpecies: 'URSINE_FORM' };
    expect(calculateSigilBonuses(druid, 'MYSTIC', 'MYSTIC_DRUID', 'BEAR').flatAttack).toBe(166 + 166);
  });

  it('Druid aura is form-conditional: skipped without a form kind, BEAR HP% / WOLF Attack% with one (L1095886-1095895)', () => {
    const state = { ownedSigils: [own('ARCANE_EMPOWERMENT', 1)], druidEquippedSpecies: ['ARCANE_EMPOWERMENT'] };
    const none = calculateSigilBonuses(state, 'MYSTIC', 'MYSTIC_DRUID', null);
    expect(none.flatAttack).toBe(166); // flat stats still count
    expect(none.hpPercent + none.attackPercent + none.spellDamage).toBe(0);
    expect(calculateSigilBonuses(state, 'MYSTIC', 'MYSTIC_DRUID', 'BEAR')).toMatchObject({ hpPercent: 8, attackPercent: 0 });
    expect(calculateSigilBonuses(state, 'MYSTIC', 'MYSTIC_DRUID', 'WOLF')).toMatchObject({ hpPercent: 0, attackPercent: 4 });
  });

  it('Mage reads the base Spell Damage aura', () => {
    const state = { ownedSigils: [own('ARCANE_EMPOWERMENT', 5)], equippedSpecies: ['ARCANE_EMPOWERMENT'] };
    expect(calculateSigilBonuses(state, 'MYSTIC', 'MYSTIC_MAGE').spellDamage).toBe(10.6); // 8*1.32
  });

  it('does not mutate its input lists', () => {
    const state = { ownedSigils: [own('BONE_SERVANT', 1)], equippedSpecies: ['BONE_SERVANT'], utilitySlotSpecies: 'BONE_SERVANT' };
    calculateSigilBonuses(state, 'NECROMANCER', null);
    expect(state.equippedSpecies).toEqual(['BONE_SERVANT']);
  });
});
