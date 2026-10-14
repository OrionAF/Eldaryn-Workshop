import { describe, it, expect } from 'vitest';
import {
  getActiveCombatSpells, buildCombatSpells, getEquippedShieldConfig, getEquippedShieldHpPercent,
  classifyShieldVariant, getEquippedSummonConfig, getEquippedFormConfig, getSpellDotDurationMs,
} from './spellConfig.js';
import { emptySigilGlyphMods } from './glyphMods.js';
import { initSpellRuntimes } from './spells.js';

const owned = (...list) => list.map(([species, level, activationCondition]) => ({ species, level, activationCondition }));

describe('getActiveCombatSpells (L1096025-1096224)', () => {
  const state = {
    ownedSigils: owned(['BERSERK_STANCE', 1], ['BLADE_OF_JUDGMENT', 5, 'ENEMY_HP_BELOW_60'], ['BULWARK_OF_THORNS', 1], ['WARBORN_FURY', 1], ['FLAMEBORN', 1]),
    equippedSpecies: ['BERSERK_STANCE', 'BLADE_OF_JUDGMENT', 'BULWARK_OF_THORNS', 'ARROWSTORM', 'WARBORN_FURY', 'FLAMEBORN'],
  };
  it('keeps owned castable sigils in equip order, scaled, with spellType and the owned condition', () => {
    const spells = getActiveCombatSpells(state, 'WARRIOR', 'WARRIOR_DPS');
    expect(spells.map((s) => s.species)).toEqual(['BLADE_OF_JUDGMENT', 'WARBORN_FURY', 'FLAMEBORN']);
    // L5: 80 * (1 + 4*0.08) = 105.6 (cap 120)
    expect(spells[0]).toMatchObject({
      name: 'Blade of Judgment', activationCondition: 'ENEMY_HP_BELOW_60',
      spell: { spellType: 'DAMAGE', attackPercent: 105.6, cooldownMs: 8000 },
    });
    expect(spells[1].spell.spellType).toBe('BUFF');
    expect(spells[2].spell.spellType).toBe('TRANSFORM');
  });
  it('a Druid without a form skips form-conditional sigils; with a form gets the form spell', () => {
    const druid = { ownedSigils: owned(['ARCANE_BURST', 1], ['ARCANE_SHARD', 1]), druidEquippedSpecies: ['ARCANE_BURST', 'ARCANE_SHARD'] };
    expect(getActiveCombatSpells(druid, 'MYSTIC', 'MYSTIC_DRUID', null).map((s) => s.species)).toEqual(['ARCANE_SHARD']);
    const wolf = getActiveCombatSpells(druid, 'MYSTIC', 'MYSTIC_DRUID', 'WOLF');
    expect(wolf[0]).toMatchObject({ species: 'ARCANE_BURST', name: 'Bestial Dominance', spell: { spellType: 'DAMAGE', cooldownMs: 11000, fearMs: 1000 } });
    expect(wolf[1]).toMatchObject({ species: 'ARCANE_SHARD', name: 'Primal Strike', spell: { cooldownMs: 4000 } });
  });
  it('buildCombatSpells applies glyph mods that key on spell.spellType', () => {
    const mods = { ...emptySigilGlyphMods(), cooldownReductionMs: 2000, damageBonusPercent: 10 };
    const spells = buildCombatSpells(state, 'WARRIOR', 'WARRIOR_DPS', null, new Map([['BLADE_OF_JUDGMENT', mods]]));
    expect(spells[0].spell).toMatchObject({ cooldownMs: 6000, attackPercent: 116 }); // round(105.6*1.1)
    expect(initSpellRuntimes(spells).map((r) => r.config.species)).toEqual(['WARBORN_FURY', 'BLADE_OF_JUDGMENT', 'FLAMEBORN']);
  });
});

describe('getEquippedShieldConfig (L1095542-1095712)', () => {
  const mage = { ownedSigils: owned(['VOID_AEGIS', 1], ['ABYSSAL_WARD', 6]), utilitySlotSpecies: 'VOID_AEGIS', equippedSpecies: ['ABYSSAL_WARD'] };
  it('utility slot first; level-scaled hpPercent; refill flags from the catalogue', () => {
    expect(getEquippedShieldConfig(mage, 'MYSTIC_MAGE')).toEqual({ hpPercent: 120, vampAlwaysRefills: true, regenAlwaysRefills: false });
    expect(getEquippedShieldHpPercent(mage, 'MYSTIC_MAGE')).toBe(120);
    const generic = { ...mage, utilitySlotSpecies: null };
    // L6: 180 * 1.4 = 252 (cap 280)
    expect(getEquippedShieldConfig(generic, 'MYSTIC_MAGE')).toEqual({ hpPercent: 252, vampAlwaysRefills: true, regenAlwaysRefills: true });
  });
  it('SHIELD_POWER glyph multiplies hpPercent; a Druid or no shield gives zero', () => {
    const mods = new Map([['VOID_AEGIS', { ...emptySigilGlyphMods(), shieldPowerPercent: 25 }]]);
    expect(getEquippedShieldConfig(mage, 'MYSTIC_MAGE', mods).hpPercent).toBe(150);
    const zero = { hpPercent: 0, vampAlwaysRefills: false, regenAlwaysRefills: false };
    expect(getEquippedShieldConfig(mage, 'MYSTIC_DRUID')).toEqual(zero);
    expect(getEquippedShieldConfig({ ownedSigils: [], equippedSpecies: ['VOID_AEGIS'] }, 'MYSTIC_MAGE')).toEqual(zero);
  });
  it('classifyShieldVariant (L1096305-1096336)', () => {
    expect(classifyShieldVariant({ regenAlwaysRefills: true, vampAlwaysRefills: true })).toBe('abyssal');
    expect(classifyShieldVariant({ vampAlwaysRefills: true })).toBe('void');
    expect(classifyShieldVariant(null)).toBe('arcane');
  });
});

describe('summon / form / DoT duration builders', () => {
  it('getEquippedSummonConfig: scaled SUMMON in the utility slot (L1096227-1096303)', () => {
    const necro = { ownedSigils: owned(['BONE_SERVANT', 1]), utilitySlotSpecies: 'BONE_SERVANT' };
    expect(getEquippedSummonConfig(necro)).toEqual({
      species: 'BONE_SERVANT', name: 'Bone Servant', icon: null, minion: 'SKELETON',
      attackPercent: 20, hpPercent: 60, respawnCooldownMs: 10000, summonCastMs: 1500,
    });
    expect(getEquippedSummonConfig({ ownedSigils: [], utilitySlotSpecies: 'BONE_SERVANT' })).toBeNull();
    expect(getEquippedSummonConfig({ ownedSigils: owned(['VOID_AEGIS', 1]), utilitySlotSpecies: 'VOID_AEGIS' })).toBeNull();
  });
  it('getEquippedFormConfig: Druid only, owned FORM sigil spell (L1096348-1096410)', () => {
    const s = { ownedSigils: owned(['DIRE_URSINE', 1]), druidUtilitySlotSpecies: 'DIRE_URSINE' };
    expect(getEquippedFormConfig(s, 'MYSTIC', 'MYSTIC_DRUID').form).toBe('BEAR');
    expect(getEquippedFormConfig(s, 'MYSTIC', 'MYSTIC_MAGE')).toBeNull();
  });
  it('getSpellDotDurationMs (L1095723-1095763)', () => {
    expect(getSpellDotDurationMs('ARROWSTORM', 'WARRIOR_DPS', null)).toBe(6000);
    expect(getSpellDotDurationMs('BLADE_OF_JUDGMENT', 'WARRIOR_DPS', null)).toBe(0);
    expect(getSpellDotDurationMs('WARBORN_FURY', 'WARRIOR_DPS', null)).toBe(0);
  });
});
