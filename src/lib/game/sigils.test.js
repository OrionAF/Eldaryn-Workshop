import { describe, it, expect } from 'vitest';
import {
  SIGIL_CATALOGUE, sigilBySpecies, sigilsForClassSpec, isSigilSpeciesActiveForSpec,
  utilitySlotSpellType, SIGIL_UNLOCK_LEVEL_BY_CLASS, SIGIL_ALTAR_CONSTANTS,
} from './sigils.js';

describe('game/sigils catalogue', () => {
  it('has 62 species with unique keys', () => {
    expect(SIGIL_CATALOGUE).toHaveLength(62);
    expect(new Set(SIGIL_CATALOGUE.map((s) => s.species)).size).toBe(62);
  });
  it('spot values', () => {
    expect(sigilBySpecies('BERSERK_STANCE')).toMatchObject({ rarity: 'Common', baseAttack: 166, baseHp: 1300 });
    expect(sigilBySpecies('FLAMEBORN')).toMatchObject({ rarity: 'Ancient', unique: true });
    expect(sigilBySpecies('NOPE')).toBeNull();
  });
  it('unlock levels and altar constants', () => {
    expect(SIGIL_UNLOCK_LEVEL_BY_CLASS).toEqual({ Warrior: 25, Sentinel: 25, Mystic: 17, Necromancer: 17 });
    expect(SIGIL_ALTAR_CONSTANTS.MAX_TIER).toBe(8);
  });
  it('holds the catalogue invariants sigils.md §5 relies on', () => {
    for (const s of SIGIL_CATALOGUE.filter((x) => x.spellType === 'DAMAGE')) expect(s.spell.baseDamage, s.species).toBe(0);
    for (const s of SIGIL_CATALOGUE.filter((x) => x.spellType === 'DEBUFF')) {
      const db = s.spell.debuff ?? {};
      expect(s.spell.maxInitialAttackPercent, s.species).toBeDefined();
      if ('regenReductionPercent' in db) expect(db.maxRegenReductionPercent, s.species).toBeDefined();
      if ('damagePerTickPercent' in db) expect(db.maxDamagePerTickPercent, s.species).toBeDefined();
    }
  });
  it('utility slot spell type per class and spec', () => {
    expect(utilitySlotSpellType('NECROMANCER', 'NECROMANCER_DEATHLORD')).toBe('SUMMON');
    expect(utilitySlotSpellType('MYSTIC', 'MYSTIC_MAGE')).toBe('SHIELD');
    expect(utilitySlotSpellType('MYSTIC', 'MYSTIC_DRUID')).toBe('FORM');
    expect(utilitySlotSpellType('WARRIOR', 'WARRIOR_TANK')).toBe('STANCE');
  });
});

describe('isSigilSpeciesActiveForSpec', () => {
  it('Mage hides druid-only sigils and sees base sigils with a druid variant', () => {
    expect(isSigilSpeciesActiveForSpec('PRIMAL_INSTINCT', 'MYSTIC', 'MYSTIC_MAGE')).toBe(false);
    expect(isSigilSpeciesActiveForSpec('URSINE_FORM', 'MYSTIC', 'MYSTIC_MAGE')).toBe(false);
    expect(isSigilSpeciesActiveForSpec('ARCANE_SHARD', 'MYSTIC', 'MYSTIC_MAGE')).toBe(true);
    expect(isSigilSpeciesActiveForSpec('VOID_AEGIS', 'MYSTIC', 'MYSTIC_MAGE')).toBe(true);
  });
  it('Druid sees form sigils and druid variants', () => {
    expect(isSigilSpeciesActiveForSpec('ALPHA_LUPINE', 'MYSTIC', 'MYSTIC_DRUID')).toBe(true);
    expect(isSigilSpeciesActiveForSpec('ARCANE_SHARD', 'MYSTIC', 'MYSTIC_DRUID')).toBe(true);
    expect(isSigilSpeciesActiveForSpec('VOID_AEGIS', 'MYSTIC', 'MYSTIC_DRUID')).toBe(false);
  });
  it('Ancients and non-Mystic classes are always active', () => {
    expect(isSigilSpeciesActiveForSpec('FLAMEBORN', 'WARRIOR', 'WARRIOR_TANK')).toBe(true);
    expect(isSigilSpeciesActiveForSpec('BERSERK_STANCE', 'WARRIOR', 'WARRIOR_DPS')).toBe(true);
    expect(isSigilSpeciesActiveForSpec('BONE_SERVANT', 'NECROMANCER', 'NECROMANCER_DEATHLORD')).toBe(true);
  });
});

describe('sigilsForClassSpec', () => {
  it('per-class counts (Ancients count for their classes)', () => {
    expect(sigilsForClassSpec('WARRIOR', 'WARRIOR_DPS').map((s) => s.species)).toContain('FLAMEBORN');
    expect(sigilsForClassSpec('SENTINEL', 'SENTINEL_DISRUPTION').map((s) => s.species)).toContain('STORMCALLER');
    expect(sigilsForClassSpec('SENTINEL', 'SENTINEL_DISRUPTION').map((s) => s.species)).not.toContain('EARTHWARDEN');
    expect(sigilsForClassSpec('NECROMANCER', 'NECROMANCER_DOOMWEAVER')).toHaveLength(10);
    expect(sigilsForClassSpec('MYSTIC', 'MYSTIC_MAGE')).toHaveLength(15);
    expect(sigilsForClassSpec('MYSTIC', 'MYSTIC_DRUID')).toHaveLength(15);
  });
});
