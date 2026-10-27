import { describe, it, expect } from 'vitest';
import {
  getActiveCombatSpells, buildCombatSpells, getEquippedShieldConfig, getEquippedShieldHpPercent,
  classifyShieldVariant, getEquippedSummonConfig, getEquippedFormConfig, getSpellDotDurationMs,
} from './spellConfig.js';
import { emptySigilGlyphMods } from './glyphMods.js';
import { initSpellRuntimes } from './spells.js';
import { SIGIL_CATALOGUE } from '../../game/sigils.js';
import { getSigilDefinitionForSpec } from '../sources/sigilScale.js';

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
    // 2.8.2 glyphs (L1108119-1108256): respawn haste floors at min(4000, cd); Death Ward percent passes through
    const mods = (o) => new Map([['BONE_SERVANT', { ...emptySigilGlyphMods(), ...o }]]);
    expect(getEquippedSummonConfig(necro, mods({ respawnReductionMs: 5000 })).respawnCooldownMs).toBe(5000);
    expect(getEquippedSummonConfig(necro, mods({ respawnReductionMs: 9000 })).respawnCooldownMs).toBe(4000);
    expect(getEquippedSummonConfig(necro, mods({ deathWardPercent: 12 })).deathWardPercent).toBe(12);
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

describe('Druid variants: form spells and client spell types (sigils.md §12, L1069570-1070178)', () => {
  const druid = (species, level) => ({ ownedSigils: owned([species, level]), druidEquippedSpecies: [species] });
  const cast = (species, form, level = 1) => getActiveCombatSpells(druid(species, level), 'MYSTIC', 'MYSTIC_DRUID', form);

  it('PRIMAL_AWAKENING: WOLF casts ATTACK_PERCENT + ATTACK_SPEED, BEAR casts HP_PERCENT, no form casts nothing', () => {
    // L5 scale 1.32: 8 -> 10.6, 0.05 -> 0.1 (1 decimal, cap 0.1), 15 -> 19.8; timers r12 8000 / r22 12000
    expect(cast('PRIMAL_AWAKENING', 'WOLF', 5)).toMatchObject([{
      species: 'PRIMAL_AWAKENING',
      spell: {
        spellType: 'BUFF', durationMs: 8000, cooldownMs: 12000,
        effects: [{ stat: 'ATTACK_PERCENT', value: 10.6 }, { stat: 'ATTACK_SPEED', value: 0.1 }],
      },
    }]);
    expect(cast('PRIMAL_AWAKENING', 'BEAR', 5)).toMatchObject([{
      spell: { spellType: 'BUFF', durationMs: 8000, cooldownMs: 12000, effects: [{ stat: 'HP_PERCENT', value: 19.8 }] },
    }]);
    expect(cast('PRIMAL_AWAKENING', null, 5)).toEqual([]);
  });

  it('catalogue: no top-level formSpell; every druidVariant spell / formSpell stores its type; castable ones have timers', () => {
    const castable = new Set(['DAMAGE', 'DEBUFF', 'BUFF', 'HEAL', 'DEFENSE', 'TRANSFORM']);
    const timed = new Set(['BUFF', 'HEAL', 'DEFENSE', 'TRANSFORM']);
    const problems = [];
    for (const e of SIGIL_CATALOGUE) {
      if ('formSpell' in e) problems.push(`${e.species}: top-level formSpell`);
      const dv = e.druidVariant;
      if (!dv) continue;
      const spells = [['spell', dv.spell], ...Object.entries(dv.formSpell ?? {})].filter(([, s]) => s);
      if (spells.length === 0) problems.push(`${e.species}: empty druidVariant`);
      for (const [k, s] of spells) {
        if (!s.spellType) problems.push(`${e.species}.${k}: no spellType`);
        if (!castable.has(s.spellType)) continue;
        if (!(s.cooldownMs > 0)) problems.push(`${e.species}.${k}: no cooldownMs`);
        if (timed.has(s.spellType) && !(s.durationMs > 0)) problems.push(`${e.species}.${k}: no durationMs`);
      }
    }
    expect(problems).toEqual([]);
  });

  // client SigilSpellType per variant spell / form (L1069587-1070048); opening cooldown 0 for BUFF,
  // 1000 for DAMAGE / DEBUFF (getOpeningCastDelayMs)
  it.each([
    ['ARCANE_SHARD', 'BEAR', 'DAMAGE'],
    ['PRIMAL_AWAKENING', 'BEAR', 'BUFF'], ['PRIMAL_AWAKENING', 'WOLF', 'BUFF'],
    ['RUNIC_AFFLICTION', 'BEAR', 'DEBUFF'],
    ['ARCANE_BURST', 'BEAR', 'DAMAGE'], ['ARCANE_BURST', 'WOLF', 'DAMAGE'],
    ['ARCANE_SURGE', 'BEAR', 'BUFF'], ['ARCANE_SURGE', 'WOLF', 'BUFF'],
    ['BLINDING_AFFLICTION', 'BEAR', 'DEBUFF'],
    ['WITHERING_BRAND', 'BEAR', 'BUFF'], ['WITHERING_BRAND', 'WOLF', 'DEBUFF'],
    ['ARCANE_BARRAGE', 'BEAR', 'DAMAGE'], ['ARCANE_BARRAGE', 'WOLF', 'DEBUFF'],
    ['AETHER_RENEWAL', 'BEAR', 'BUFF'], ['AETHER_RENEWAL', 'WOLF', 'BUFF'],
  ])('%s in %s form is a %s spell with the matching opening cooldown', (species, form, type) => {
    const def = getSigilDefinitionForSpec(species, 'MYSTIC_DRUID', form);
    expect(def.spell.spellType).toBe(type); // stored in the catalogue, not inferred
    const spells = cast(species, form);
    expect(spells.map((s) => s.spell.spellType)).toEqual([type]);
    expect(initSpellRuntimes(spells)[0].cooldownRemaining).toBe(type === 'BUFF' ? 0 : 1000);
  });
});
