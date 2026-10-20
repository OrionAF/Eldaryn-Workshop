import { describe, it, expect } from 'vitest';
import {
  defaultSigils,
  normaliseSigils,
  migrateSigilsFromV1,
  reconcileSigils,
  maxSigilSlots,
  slotUnlockLevel,
  sigilSpeciesFromV1Id,
  sigilConditionOptions,
  genericSigils,
  utilitySigils,
  ancientSigils,
} from './sigils.js';
import { newCharacter, normaliseCharacter, migrateCharacterFromV1 } from './index.js';

const W = { class: 'WARRIOR', spec: null };

describe('maxSigilSlots (getMaxSigilSlots L1067168-1067210; sigils.md §2)', () => {
  it('Warrior/Sentinel: 0 below 25, then 1 at 25, 2 at 28, 3 at 32', () => {
    expect([24, 25, 27, 28, 31, 32, 100].map((l) => maxSigilSlots(l, 'WARRIOR'))).toEqual([0, 1, 1, 2, 2, 3, 3]);
    expect(maxSigilSlots(25, 'SENTINEL')).toBe(1);
  });
  it('Mystic/Necromancer: first slot at 17', () => {
    expect([16, 17, 28, 32].map((l) => maxSigilSlots(l, 'MYSTIC'))).toEqual([0, 1, 2, 3]);
    expect(maxSigilSlots(17, 'NECROMANCER')).toBe(1);
  });
  it('slotUnlockLevel gives the level slot n opens at', () => {
    expect([1, 2, 3].map((n) => slotUnlockLevel(n, 'WARRIOR'))).toEqual([25, 28, 32]);
    expect(slotUnlockLevel(1, 'MYSTIC')).toBe(17);
  });
});

describe('normaliseSigils', () => {
  it('defaults', () => {
    expect(normaliseSigils({}, W)).toEqual(defaultSigils());
    expect(normaliseSigils(null, W)).toEqual(defaultSigils());
  });

  it('clamps level and tier, keeps only class species, Ancients stay level 1', () => {
    const out = normaliseSigils(
      {
        sigils: {
          altarTier: 99,
          owned: {
            CATACLYSM: { level: 31 },
            DEFENSE_STANCE: { level: '7' },
            HAWK_FOCUS: { level: 5 }, // Sentinel only
            NOT_A_SIGIL: { level: 3 },
            BLADE_OF_JUDGMENT: { level: 0 },
            WARBORN_FURY: { level: 'x' },
            EARTHWARDEN: { level: 12 },
            FLAMEBORN: { level: 1 },
          },
        },
      },
      W,
    ).sigils;
    expect(out.altarTier).toBe(8);
    expect(out.owned).toEqual({
      DEFENSE_STANCE: { level: 7 },
      CATACLYSM: { level: 30 },
      EARTHWARDEN: { level: 1 },
      FLAMEBORN: { level: 1 },
    });
  });

  it('is idempotent', () => {
    const raw = { sigils: { altarTier: 2, owned: { CATACLYSM: { level: 9 }, FLAMEBORN: { level: 4 } } } };
    const once = normaliseSigils(raw, W);
    expect(normaliseSigils(once, W)).toEqual(once);
  });

  it('a class change drops species the new class cannot own', () => {
    const raw = { sigils: { altarTier: 1, owned: { CATACLYSM: { level: 9 } } } };
    expect(normaliseSigils(raw, { class: 'SENTINEL', spec: null }).sigils.owned).toEqual({});
    expect(normaliseSigils(raw, { class: null, spec: null }).sigils.owned).toEqual({});
  });
});

describe('migrateSigilsFromV1', () => {
  it('maps v1 ids to species, including the persisted typo', () => {
    expect(sigilSpeciesFromV1Id('berserkt-stance')).toBe('BERSERK_STANCE');
    expect(sigilSpeciesFromV1Id('blade-of-judgment')).toBe('BLADE_OF_JUDGMENT');
    expect(sigilSpeciesFromV1Id('nope')).toBeNull();
  });

  it('keeps levels > 0 and the forge tier, drops typed damage values, maps preset-only ids too', () => {
    const { value, idMap } = migrateSigilsFromV1({
      sigilForgeTier: 2,
      sigilValues: {
        cataclysm: { level: 12, damage: 5000 },
        'berserkt-stance': { level: 3 },
        rejuvenation: { level: 0 },
      },
      presets: [{ sigilIds: ['cataclysm', 'hemorrhage', 'bogus'] }],
    });
    expect(value.sigils).toEqual({ altarTier: 2, owned: { CATACLYSM: { level: 12 }, BERSERK_STANCE: { level: 3 } } });
    expect(idMap).toEqual({
      cataclysm: 'CATACLYSM',
      'berserkt-stance': 'BERSERK_STANCE',
      rejuvenation: 'REJUVENATION',
      hemorrhage: 'HEMORRHAGE',
    });
  });

  it('a v1 preset keeps its sigils through model/index.js; Ancients move to their own slot', () => {
    const v1 = {
      id: 'c1',
      name: 'Old',
      class: 'Warrior',
      sigilForgeTier: 2,
      sigilValues: { cataclysm: { level: 10 }, 'iron-bastion': { level: 4 }, earthwarden: { level: 1 }, hemorrhage: { level: 0 } },
      presets: [
        { id: 'a', name: 'A', loadout: 0, talentSet: 0, sigilIds: ['cataclysm', 'earthwarden', 'iron-bastion'] },
        { id: 'b', name: 'B', loadout: 1, talentSet: 1, sigilIds: ['hemorrhage', 'bogus'] },
      ],
      activePresetId: 'a',
    };
    const c = migrateCharacterFromV1(v1);
    expect(c.sigils.altarTier).toBe(2);
    expect(c.sigils.owned.CATACLYSM.level).toBe(10);
    const a = c.presets.find((p) => p.id === 'a');
    expect(a.sigilSpecies).toEqual(['CATACLYSM', 'IRON_BASTION']);
    expect(a.ancientSigilSpecies).toBe('EARTHWARDEN');
    // hemorrhage had level 0 (not owned), so it cannot stay equipped
    expect(c.presets.find((p) => p.id === 'b').sigilSpecies).toEqual([]);
  });
});

describe('reconcileSigils', () => {
  function warrior(over = {}) {
    const c = newCharacter('T', 'WARRIOR');
    c.sigils = {
      altarTier: 1,
      owned: { CATACLYSM: { level: 5 }, IRON_BASTION: { level: 5 }, ARROWSTORM: { level: 5 }, REJUVENATION: { level: 5 }, FLAMEBORN: { level: 1 } },
    };
    Object.assign(c, over);
    return c;
  }

  it('drops unowned, wrong-class and duplicate picks, and trims to the unlocked slots', () => {
    const c = warrior({ level: 28 }); // 2 slots
    c.presets[0].sigilSpecies = ['CATACLYSM', 'CATACLYSM', 'HAWK_FOCUS', 'DEFENSE_STANCE', 'IRON_BASTION', 'ARROWSTORM'];
    // normalisePresets caps at 3 in the real flow; mimic that
    c.presets[0].sigilSpecies = c.presets[0].sigilSpecies.slice(0, 3);
    reconcileSigils(c);
    expect(c.presets[0].sigilSpecies).toEqual(['CATACLYSM']);
    c.presets[0].sigilSpecies = ['CATACLYSM', 'IRON_BASTION', 'ARROWSTORM'];
    reconcileSigils(c);
    expect(c.presets[0].sigilSpecies).toEqual(['CATACLYSM', 'IRON_BASTION']);
  });

  it('clears everything below the unlock level', () => {
    const c = warrior({ level: 24 });
    c.presets[0].sigilSpecies = ['CATACLYSM'];
    c.presets[0].ancientSigilSpecies = 'FLAMEBORN';
    reconcileSigils(c);
    expect(c.presets[0].sigilSpecies).toEqual([]);
    expect(c.presets[0].ancientSigilSpecies).toBeNull();
  });

  it('a Warrior has no utility slot; the Ancient must be a real owned Ancient', () => {
    const c = warrior();
    c.presets[0].utilitySigilSpecies = 'CATACLYSM';
    c.presets[0].ancientSigilSpecies = 'CATACLYSM';
    c.presets[1].ancientSigilSpecies = 'EARTHWARDEN'; // not owned
    reconcileSigils(c);
    expect(c.presets[0].utilitySigilSpecies).toBeNull();
    expect(c.presets[0].ancientSigilSpecies).toBeNull();
    expect(c.presets[1].ancientSigilSpecies).toBeNull();
  });

  it('keeps legal character-wide conditions (enemy-HP for damage, own-HP for heal), drops illegal ones', () => {
    const c = warrior();
    c.presets[0].sigilSpecies = ['CATACLYSM', 'REJUVENATION', 'IRON_BASTION'];
    c.sigils.owned.CATACLYSM.condition = 'ENEMY_HP_BELOW_40';
    c.sigils.owned.REJUVENATION.condition = 'ENEMY_HP_BELOW_40'; // heal takes MY_HP only
    c.sigils.owned.IRON_BASTION.condition = 'MY_HP_BELOW_60';
    reconcileSigils(c);
    expect(c.sigils.owned.CATACLYSM.condition).toBe('ENEMY_HP_BELOW_40');
    expect(c.sigils.owned.REJUVENATION.condition).toBeUndefined();
    expect(c.sigils.owned.IRON_BASTION.condition).toBe('MY_HP_BELOW_60');
  });

  it('survives a full normaliseCharacter round trip', () => {
    const c = warrior();
    c.presets[0].sigilSpecies = ['CATACLYSM', 'IRON_BASTION'];
    c.presets[0].ancientSigilSpecies = 'FLAMEBORN';
    expect(normaliseCharacter(JSON.parse(JSON.stringify(c))).presets[0]).toMatchObject({
      sigilSpecies: ['CATACLYSM', 'IRON_BASTION'],
      ancientSigilSpecies: 'FLAMEBORN',
    });
  });
});

describe('class and spec eligibility (sigils.md §2)', () => {
  const names = (list) => list.map((s) => s.species);

  it('Mystic utility slot: Shield for Mage, Form for Druid; generic excludes it', () => {
    expect(names(utilitySigils('MYSTIC', 'MYSTIC_MAGE')).sort()).toEqual(['ABYSSAL_WARD', 'ARCANE_BARRIER', 'VOID_AEGIS']);
    expect(names(utilitySigils('MYSTIC', 'MYSTIC_DRUID')).sort()).toEqual(['ALPHA_LUPINE', 'DIRE_URSINE', 'LUPINE_FORM', 'URSINE_FORM']);
    expect(names(genericSigils('MYSTIC', 'MYSTIC_MAGE'))).not.toContain('ARCANE_BARRIER');
    expect(names(genericSigils('MYSTIC', 'MYSTIC_DRUID'))).toContain('PRIMAL_INSTINCT');
    expect(names(genericSigils('MYSTIC', 'MYSTIC_MAGE'))).not.toContain('PRIMAL_INSTINCT');
  });

  it('Necromancer utility is Summon; Warrior and Sentinel have none', () => {
    expect(names(utilitySigils('NECROMANCER', null)).sort()).toEqual(['BONE_SERVANT', 'OVERLORDS_PACT', 'REAPERS_CALL']);
    expect(names(utilitySigils('WARRIOR', null))).toEqual(['BATTLE_STANCE', 'GUARDIAN_STANCE', 'WARBREAKER_STANCE', 'JUGGERNAUT_STANCE']);
    expect(utilitySigils('SENTINEL', null)).toEqual([]);
  });

  it('Ancients per class (sigils.md §8): Warrior 2, Sentinel Stormcaller + Flameborn', () => {
    expect(names(ancientSigils('WARRIOR')).sort()).toEqual(['EARTHWARDEN', 'FLAMEBORN']);
    expect(names(ancientSigils('SENTINEL')).sort()).toEqual(['FLAMEBORN', 'STORMCALLER']);
    expect(ancientSigils('MYSTIC')).toEqual([]);
  });

  it('condition options follow the spell family; Druid forms with mixed families fall back', () => {
    expect(sigilConditionOptions('CATACLYSM')).toEqual(['ON_COOLDOWN', 'ENEMY_HP_BELOW_80', 'ENEMY_HP_BELOW_60', 'ENEMY_HP_BELOW_40', 'ENEMY_HP_BELOW_20']);
    expect(sigilConditionOptions('REJUVENATION')[1]).toBe('MY_HP_BELOW_80');
    expect(sigilConditionOptions('BERSERK_STANCE')).toEqual(['ON_COOLDOWN']); // aura
    expect(sigilConditionOptions('BULWARK_OF_THORNS')).toEqual(['ON_COOLDOWN']); // stack
    // Withering Brand: Bear form is a buff, Wolf form a debuff
    expect(sigilConditionOptions('WITHERING_BRAND', 'MYSTIC_DRUID')).toEqual(['ON_COOLDOWN']);
    // Arcane Barrage: Bear damage, Wolf debuff - both enemy-HP
    expect(sigilConditionOptions('ARCANE_BARRAGE', 'MYSTIC_DRUID')[1]).toBe('ENEMY_HP_BELOW_80');
  });
});
