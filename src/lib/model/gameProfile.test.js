import { describe, it, expect } from 'vitest';
import { isGameProfile, gameProfileToCharacter, importedCharacterName, altarLevelFromXp } from './gameProfile.js';
import { normaliseCharacter, normaliseRoster, newRoster, SCHEMA_VERSION } from './index.js';
import { resolveTranscendencePreset, checkPreset } from './legality.js';
import { prepare } from '../search/search.js';
import { legalityOf } from '../search/legality.js';
import { buildFighter } from '../build/fighter.js';

it('2.7.4 profile imports preserve all four Warrior stance utility picks and old auras', () => {
  for (const species of ['BATTLE_STANCE', 'GUARDIAN_STANCE', 'WARBREAKER_STANCE', 'JUGGERNAUT_STANCE']) {
    const f = fixture();
    f.sigilState.ownedSigils.push({ species, level: 8 });
    f.sigilState.utilitySlotSpecies = species;
    f.presets = [];
    const c = normaliseCharacter(gameProfileToCharacter(f));
    const p = c.presets.find((p) => p.id === c.activePresetId);
    expect(p.utilitySigilSpecies).toBe(species);
    const base = buildFighter(c, p.id);
    const oblivion = buildFighter(c, p.id, { realm: 'oblivion' });
    expect(base.utility.species).toBe(species);
    expect(oblivion.utility).toEqual(base.utility);
    expect(base.stats.stanceDazeChance ?? base.stats.stanceShieldBashChance).toBeGreaterThan(0);
    expect(normaliseCharacter(JSON.parse(JSON.stringify(c))).presets).toEqual(c.presets);
  }
});

// A small hand-written profile in the shape of the player-profile response. Every value is invented.
// Ids and secrets (player id, clan, shop, economy) exist only to prove they are never copied.
function fixture() {
  return {
    player: {
      playerId: 'PLAYER-SECRET-ID',
      name: 'Testhero',
      server: 9,
      class: 'WARRIOR',
      level: 80,
      gems: 777001,
      glyphs: [
        { id: 'gl-minor-a', tier: 'MINOR', rarity: 'RARE', glyphType: 'g-tough', sealed: false, secondary: { stat: 'BLOCK_CHANCE', quality: 0.5 } },
        { id: 'gl-minor-b', tier: 'MINOR', rarity: 'COMMON', glyphType: 'g-swift', sealed: false, secondary: { stat: 'PENETRATION', quality: 0.15 } },
        { id: 'gl-major', tier: 'MAJOR', rarity: 'EPIC', glyphType: 'sg-bastion-cd', sealed: false, secondary: null },
        { id: 'gl-sealed', tier: 'MINOR', rarity: 'RARE', glyphType: 'g-tough', sealed: true, secondary: null },
      ],
    },
    clan: { id: 'CLAN-SECRET', name: 'Secret Clan' },
    shop: { offers: [1, 2, 3] },
    questState: { done: ['QUEST-SECRET'] },

    equipment: {
      BELT: { rarity: 'MYTHIC', itemLevel: 50, primaryStats: { attack: 1, hp: 1 }, secondaryStats: [] },
      GLOVES: null,
      RIFT_CORE: null,
      HEAD: {
        id: 'item-1', name: 'Test Helm', rarity: 'MYTHIC', itemLevel: 100, qualityBonus: 7,
        primaryStats: { attack: 1200, hp: 9000 },
        secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.05 }, { type: 'CRIT_CHANCE', value: 2.5 }],
      },
      CHEST: {
        rarity: 'ETERNAL', itemLevel: 120, primaryStats: { attack: 2000, hp: 15000 },
        secondaryStats: [{ type: 'HEALTH_PERCENT', value: 6.5 }],
        conduit: { type: 'FLAME', value: 33 },
      },
    },
    equipment2: {
      WEAPON: { rarity: 'LEGENDARY', itemLevel: 60, primaryStats: { attack: 5000, hp: 800 }, secondaryStats: [{ type: 'DOUBLE_HIT', value: 3 }] },
    },
    activeEquipmentSet: 2, // live loadout = preset-2 (DPS), so the profile is clean
    enchantSlots: { HEAD: 'stone-a', CHEST: 'stone-missing', BELT: null },
    enchantSlots2: { WEAPON: 'stone-b' },
    enchantStones: [
      { id: 'stone-a', type: 'PVE_ATTACK', activated: true, quality: 55, qualityBonus: 9, amplifyLevel: 3, stats: [{ type: 'ATTACK_SPEED', value: 0.04 }, { type: 'LIFESTEAL', value: 2.5 }] },
      { id: 'stone-b', type: 'MYTHIC', activated: true, quality: 90, stats: [{ type: 'PVP_ATTACK', value: 20 }, { type: 'PVP_DEFENSE', value: 15 }, { type: 'BLOCK_CHANCE', value: 1.5 }, { type: 'HP_REGEN', value: 1.2 }] },
    ],

    talentState: { specialization: 'WARRIOR_DPS', allocation: { dps_t1_sharpened_blade: 2 } },
    talentState2: { specialization: 'WARRIOR_TANK', allocation: { tank_t1_fortitude: 4, tank_t1_thick_skin: 3 } },
    activeTalentSet: 1,

    presets: [
      {
        id: 'default', name: 'TANK', equipmentSet: 1, talentSet: 2, petId: 'pet-2', mountId: 'mount-a',
        relicIds: ['relic_swift_emblem', 'relic_guardian_signet'],
        sigilSpecies: ['IRON_BASTION', 'CATACLYSM', 'EARTHWARDEN'], utilitySigilSpecies: null,
        transcendencePresetId: 'tp2',
      },
      {
        id: 'preset-2', name: 'DPS', equipmentSet: 2, talentSet: 1, petId: null, mountId: 'mount-b',
        relicIds: [], sigilSpecies: ['ARROWSTORM'], utilitySigilSpecies: null, transcendencePresetId: 'tp2',
      },
    ],
    activePresetId: 'preset-2',

    petState: {
      ownedPets: [
        { id: 'pet-1', species: 'FLAME_TOAD', rarity: 'COMMON', level: 1, xp: 0, secondaryStats: [{ type: 'CRIT_DAMAGE', value: 0.2 }] },
        { id: 'pet-2', species: 'THORNBACK_LIZARD', rarity: 'UNCOMMON', secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.12 }, { type: 'HEALTH_PERCENT', value: 5.5 }] },
      ],
      equippedPetId: null,
      altar: { totalXp: 500, tier: 1 },
    },
    mountState: {
      ownedMounts: [
        { id: 'mount-a', species: 'night_wolf', rarity: 'COMMON', baseHp: 7, baseAtk: 8, level: 3, glyphs: { minor: ['gl-minor-a', 'gl-minor-b', null], major: ['gl-major', null], mythic: [null] } },
        { id: 'mount-b', species: 'scorpion_hound', rarity: 'UNCOMMON', baseHp: 16, baseAtk: 12, level: 2, glyphs: { minor: ['gl-minor-a', 'gl-sealed', null], major: [null, null], mythic: [null] } },
        { id: 'mount-x', species: 'not_a_mount', baseHp: 1, baseAtk: 1, level: 1, glyphs: {} },
      ],
      activeMountId: 'mount-b',
    },
    sigilState: {
      ownedSigils: [
        { species: 'IRON_BASTION', rarity: 'RARE', level: 7, activationCondition: 'MY_HP_BELOW_60' },
        { species: 'CATACLYSM', rarity: 'RARE', level: 9, activationCondition: 'ENEMY_HP_BELOW_40' },
        { species: 'ARROWSTORM', rarity: 'UNCOMMON', level: 4, activationCondition: 'ON_COOLDOWN' },
        { species: 'REJUVENATION', rarity: 'UNCOMMON', level: 2, activationCondition: 'MY_HP_BELOW_80' },
        { species: 'EARTHWARDEN', rarity: 'ANCIENT', level: 1 },
      ],
      equippedSpecies: ['ARROWSTORM'],
      utilitySlotSpecies: null,
      altarTier: 3,
    },
    relicState: {
      ownedRelics: [
        { relicId: 'relic_swift_emblem', level: 6, acquiredAt: 1 },
        { relicId: 'relic_guardian_signet', level: 3, acquiredAt: 2 },
      ],
      equippedRelicIds: [],
      extraSlotsPurchased: 1,
    },
    awakeningState: { path: 'RADIANT', level: 9 },
    transcendencePresets: [
      { id: 'default', name: 'DEFAULT', allocatedNodeIds: ['n_0,-1'] },
      { id: 'tp2', name: 'Second', allocatedNodeIds: ['n_0,-1', 'n_0,-2'] },
    ],
    activeTranscendencePresetId: 'tp2',
    skills: {
      huntingLevel: 8, luckLevel: 5, vitalityLevel: 2, petDiscountLevel: 3, masteryLevel: 4, sigilDiscountLevel: 1,
      miningChargesLevel: 4, crusadeDiscountLevel: 6, midasTouchLevel: 3, artisanLevel: 2, summonLuckLevel: 5,
      ascensionLevel: 2, attunementLevel: 3, keySaveLevel: 1,
    },
    excludedDropStats: ['SPELL_DAMAGE', 'SPELL_RESIST'],
    fortressBuffs: { ownedFortressIds: ['TOP_1', 'TOP_2', 'CORE'] },
    oblivionPrestige: {
      unlocked: false,
      activeRealm: 'BASE',
      oblivion: null,
    },
    computedStats: {
      totalAttack: 123456, totalHp: 654321, totalBlockChance: 20.5, rawDamageReduction: 41.2,
      disruptionEffect: 'SILENCE', totalNegative: -4, totalNaN: Number.NaN, somethingElse: 12,
    },
  };
}

const RAW_SECRETS = ['PLAYER-SECRET-ID', 'CLAN-SECRET', 'Secret Clan', '777001', 'QUEST-SECRET'];

describe('isGameProfile', () => {
  it('detects a profile and nothing else', () => {
    expect(isGameProfile(fixture())).toBe(true);
    expect(isGameProfile(null)).toBe(false);
    expect(isGameProfile([])).toBe(false);
    expect(isGameProfile({})).toBe(false);
    expect(isGameProfile(newRoster())).toBe(false);
    expect(isGameProfile({ characters: [{ id: 'a' }], player: fixture().player, equipment: {} })).toBe(false);
    expect(isGameProfile({ ...fixture(), player: { ...fixture().player, class: 'PALADIN' } })).toBe(false);
    expect(isGameProfile({ ...fixture(), player: { ...fixture().player, level: '80' } })).toBe(false);
    expect(isGameProfile({ ...fixture(), equipment: undefined })).toBe(false);
  });
});

describe('importedCharacterName', () => {
  it('keeps a free name and suffixes a taken one (case-insensitive)', () => {
    expect(importedCharacterName('Oria', ['Other'])).toBe('Oria');
    expect(importedCharacterName('Oria', ['oria'])).toBe('Oria (imported)');
    expect(importedCharacterName('  ', [])).toBe('Imported character');
    expect(importedCharacterName(undefined, ['Imported character'])).toBe('Imported character (imported)');
  });
});

describe('altarLevelFromXp (Game/pets.md section 6)', () => {
  it('walks the per-tier XP table', () => {
    expect(altarLevelFromXp(0, 1)).toBe(1);
    expect(altarLevelFromXp(174, 1)).toBe(1);
    expect(altarLevelFromXp(175, 1)).toBe(2); // need(1, tier 1) = 175
    expect(altarLevelFromXp(174, 2)).toBe(1); // the need doubles per tier
    expect(altarLevelFromXp(349, 2)).toBe(1);
    expect(altarLevelFromXp(350, 2)).toBe(2);
    expect(altarLevelFromXp(1e12, 1)).toBe(50);
    expect(altarLevelFromXp(-5, 99)).toBe(1);
  });
});

describe('gameProfileToCharacter', () => {
  const now = '2026-01-02T03:04:05.000Z';
  const raw = gameProfileToCharacter(fixture(), { now });
  const c = normaliseCharacter(raw);

  it('core: name, class, level; no id is carried over', () => {
    expect(c).toMatchObject({ name: 'Testhero', class: 'WARRIOR', level: 80 });
    expect(raw.id).toBeUndefined();
    expect(c.id).toBeTruthy();
  });

  it('never carries the player id, clan, shop, quests or economy fields', () => {
    const text = JSON.stringify(raw) + JSON.stringify(c);
    for (const secret of RAW_SECRETS) expect(text).not.toContain(secret);
    for (const key of ['playerId', 'clan', 'shop', 'questState', 'gems']) expect(text).not.toContain(`"${key}"`);
    expect(c.server).toBe(9);
  });

  it('equipment: both sets, secondaries and conduit kept, Oblivion-only slots left out of base sets', () => {
    const { set1, set2 } = c.equipment;
    expect(set1.items.HEAD).toMatchObject({
      rarity: 'MYTHIC', itemLevel: 100, quality: null,
      primaryStats: { attack: 1200, hp: 9000 },
      secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.05 }, { type: 'CRIT_CHANCE', value: 2.5 }],
      conduit: null,
    });
    expect(set1.items.CHEST.conduit).toEqual({ type: 'FLAME', value: 33 });
    expect(set1.items.BELT).toBeUndefined();
    expect(set2.items.WEAPON).toMatchObject({ rarity: 'LEGENDARY', itemLevel: 60 });
    expect(set2.items.HEAD).toBeNull();
  });

  it('stones and both socket maps; a socket naming a missing stone is cleared', () => {
    expect(c.enchantStones).toHaveLength(2);
    expect(c.enchantStones[0]).toEqual({
      id: 'stone-a', type: 'PVE_ATTACK', activated: true, quality: 55, amplifyLevel: 3, oblivionLevel: null,
      stats: [{ type: 'ATTACK_SPEED', value: 0.04 }, { type: 'LIFESTEAL', value: 2.5 }],
    });
    expect(c.enchantStones[1]).toMatchObject({ id: 'stone-b', type: 'MYTHIC', amplifyLevel: 0 });
    expect(c.equipment.set1.enchantSlots.HEAD).toBe('stone-a');
    expect(c.equipment.set1.enchantSlots.CHEST).toBeNull();
    expect(c.equipment.set2.enchantSlots.WEAPON).toBe('stone-b');
  });

  it('talents: client sets 1|2 become 0|1, presets point at the renumbered set', () => {
    expect(c.talentSets[0]).toEqual({ spec: 'WARRIOR_DPS', allocation: { dps_t1_sharpened_blade: 2 } });
    expect(c.talentSets[1]).toEqual({ spec: 'WARRIOR_TANK', allocation: { tank_t1_fortitude: 4, tank_t1_thick_skin: 3 } });
    expect(c.presets.map((p) => p.talentSet)).toEqual([1, 0]);
  });

  it('presets: references, relics, sigils (Ancient split out), conditions, active preset', () => {
    expect(c.presets).toHaveLength(2);
    expect(c.activePresetId).toBe('preset-2');
    const [tank, dps] = c.presets;
    expect(tank).toMatchObject({
      id: 'default', name: 'TANK', equipmentSet: 1, talentSet: 1, petId: 'pet-2', mountId: 'mount-a',
      relicIds: ['relic_swift_emblem', 'relic_guardian_signet'],
      sigilSpecies: ['IRON_BASTION', 'CATACLYSM'], ancientSigilSpecies: 'EARTHWARDEN',
      transcendencePresetId: 'tp2',
    });
    // conditions are character-wide: they ride on the owned sigils, never ON_COOLDOWN
    expect(tank.sigilConditions).toBeUndefined();
    const owned = c.sigils.owned;
    expect(owned.IRON_BASTION.condition).toBe('MY_HP_BELOW_60');
    expect(owned.CATACLYSM.condition).toBe('ENEMY_HP_BELOW_40');
    expect(owned.ARROWSTORM.condition).toBeUndefined();
    expect(dps).toMatchObject({ id: 'preset-2', equipmentSet: 2, talentSet: 0, petId: null, mountId: 'mount-b', sigilSpecies: ['ARROWSTORM'] });
  });

  it('pets: multiplier secondaries become percent points, altar level comes from totalXp and tier', () => {
    expect(c.pets.owned).toEqual([
      { id: 'pet-1', species: 'FLAME_TOAD', rarity: 'Common', secondaries: [{ type: 'CRIT_DAMAGE', value: 20 }] },
      { id: 'pet-2', species: 'THORNBACK_LIZARD', rarity: 'Uncommon', secondaries: [{ type: 'ATTACK_SPEED', value: 12 }, { type: 'HEALTH_PERCENT', value: 5.5 }] },
    ]);
    // tier 1: 175 + need(2) <= 500 < 175 + need(2) + need(3)
    expect(c.pets.altar.tier).toBe(1);
    expect(c.pets.altar.level).toBe(altarLevelFromXp(500, 1));
    expect(c.pets.altar.level).toBeGreaterThan(2);
  });

  it('mounts: species case, level, rolls, sockets; a glyph used on two mounts keeps its id', () => {
    expect(c.mounts.map((m) => [m.id, m.species, m.rarity, m.level, m.baseHp, m.baseAtk])).toEqual([
      ['mount-a', 'NIGHT_WOLF', 'Common', 3, 7, 8],
      ['mount-b', 'SCORPION_HOUND', 'Uncommon', 2, 16, 12],
    ]);
    const [a, b] = c.mounts;
    expect(a.glyphs).toEqual({ minor: ['gl-minor-a', 'gl-minor-b', null], major: ['gl-major', null], mythic: [null] });
    expect(b.glyphs.minor[0]).toBe('gl-minor-a');
    expect(b.glyphs.minor[1]).toBeNull(); // sealed glyphs cannot be socketed
    expect(c.glyphs.some((g) => g.id.includes('~'))).toBe(false);
    expect(c.glyphs.find((g) => g.id === 'gl-minor-a')).toMatchObject({ glyphType: 'g-tough', secondary: { stat: 'blockChance', quality: 0.5 } });
  });

  it('glyph inventory: Title-case rarity, secondary stat enum becomes the pool key', () => {
    const byId = Object.fromEntries(c.glyphs.map((g) => [g.id, g]));
    expect(byId['gl-minor-a']).toEqual({ id: 'gl-minor-a', glyphType: 'g-tough', rarity: 'Rare', sealed: false, secondary: { stat: 'blockChance', quality: 0.5 } });
    expect(byId['gl-minor-b'].secondary).toEqual({ stat: 'penetration', quality: 0.15 });
    expect(byId['gl-major']).toMatchObject({ glyphType: 'sg-bastion-cd', rarity: 'Epic', secondary: null });
    expect(byId['gl-sealed']).toMatchObject({ sealed: true, secondary: null });
  });

  it('sigils, relics, awakening', () => {
    expect(c.sigils.altarTier).toBe(3);
    expect(c.sigils.owned).toMatchObject({ IRON_BASTION: { level: 7 }, CATACLYSM: { level: 9 }, ARROWSTORM: { level: 4 }, EARTHWARDEN: { level: 1 } });
    expect(c.relics).toEqual({ relic_swift_emblem: 6, relic_guardian_signet: 3 });
    expect(c.awakening).toEqual({ path: 'RADIANT', level: 9 });
  });

  it('transcendence presets and the one each preset uses', () => {
    expect(c.transcendence.presets.map((p) => [p.id, p.name, p.allocatedNodeIds])).toEqual([
      ['default', 'DEFAULT', ['n_0,-1']],
      ['tp2', 'Second', ['n_0,-1', 'n_0,-2']],
    ]);
    expect(c.transcendence.activePresetId).toBe('tp2');
    expect(c.presets[0].transcendencePresetId).toBe('tp2');
  });

  it('skills: the <id>Level keys become skill ids; attunement bans; fortress groups', () => {
    expect(c.skills).toEqual({
      hunting: 8, luck: 5, vitality: 2, petDiscount: 3, mastery: 4, sigilDiscount: 1, miningCharges: 4,
      crusadeDiscount: 6, midasTouch: 3, artisan: 2, summonLuck: 5, ascension: 2, attunement: 3, keySave: 1,
    });
    expect(c.attunementBans).toEqual(['SPELL_DAMAGE', 'SPELL_RESIST']);
    expect(c.fortress.owned).toEqual(['TOP', 'CORE']);
  });

  it('fortress: null buffs mean none', () => {
    const none = normaliseCharacter(gameProfileToCharacter({ ...fixture(), fortressBuffs: null }));
    expect(none.fortress.owned).toEqual([]);
  });

  it('computedStats becomes the ACTIVE preset sheet, keeping only total*/raw* finite numbers', () => {
    expect(c.presets[0].sheet).toBeNull();
    expect(c.presets[1].sheet).toEqual({
      values: { totalAttack: 123456, totalHp: 654321, totalBlockChance: 20.5, rawDamageReduction: 41.2 },
      enteredAt: now,
      inputsKey: null, // unverified until the user confirms it
    });
    expect(c.oblivion.sheet).toBeNull();
  });

  it('oblivion locked: realm stays base', () => {
    expect(c.oblivion).toEqual({ unlocked: false, level: 0, activeRealm: 'base', sheet: null });
  });
});

describe('Oblivion hero', () => {
  function oblivionFixture(activeRealm) {
    const f = fixture();
    f.oblivionPrestige = {
      unlocked: true,
      activeRealm,
      oblivion: {
        level: 12,
        equipment: {
          BELT: { rarity: 'MYTHIC', itemLevel: 40, primaryStats: { attack: 300, hp: 900 }, secondaryStats: [{ type: 'CRIT_CHANCE', value: 1.5 }] },
          RIFT_CORE: { rarity: 'DIVINE', itemLevel: 200, primaryStats: { attack: 500, hp: 1500 }, secondaryStats: [], conduit: { type: 'DARK', value: 25 } },
          HEAD: { rarity: 'MYTHIC', itemLevel: 300, primaryStats: { attack: 400, hp: 1000 }, secondaryStats: [] },
        },
        enchantSlots: { HEAD: 'ob-stone' },
        enchantStones: [
          { id: 'ob-stone', type: 'OBLIVION', quality: 70, oblivionLevel: 2, stats: [{ type: 'OBLIVION_POWER', value: 99 }, { type: 'PVP_ATTACK', value: 10 }] },
        ],
      },
    };
    return f;
  }

  it('maps the rift loadout, its stone pool and level; an active rift takes the sheet', () => {
    const c = normaliseCharacter(gameProfileToCharacter(oblivionFixture('OBLIVION'), { now: 'T' }));
    expect(c.oblivion).toMatchObject({ unlocked: true, level: 12, activeRealm: 'oblivion' });
    expect(c.oblivion.sheet.values.totalAttack).toBe(123456);
    expect(c.presets.every((p) => p.sheet === null)).toBe(true);
    const items = c.equipment.oblivion.items;
    expect(Object.keys(items)).toHaveLength(12);
    expect(items.BELT).toMatchObject({ rarity: 'MYTHIC', itemLevel: 40 });
    expect(items.RIFT_CORE.conduit).toEqual({ type: 'DARK', value: 25 });
    expect(items.HEAD.itemLevel).toBe(300); // above the base cap of 240: the Oblivion cap applies
    expect(c.oblivionEnchantStones).toEqual([
      { id: 'ob-stone', type: 'OBLIVION', activated: true, quality: 70, amplifyLevel: 0, oblivionLevel: 2, stats: [{ type: 'PVP_ATTACK', value: 10 }] }, // Oblivion Power is derived, not stored
    ]);
    expect(c.equipment.oblivion.enchantSlots.HEAD).toBe('ob-stone');
    expect(c.enchantStones.some((s) => s.id === 'ob-stone')).toBe(false);
  });

  it('a base-realm profile with an unlocked rift keeps the sheet on the preset', () => {
    const c = normaliseCharacter(gameProfileToCharacter(oblivionFixture('BASE')));
    expect(c.oblivion).toMatchObject({ unlocked: true, activeRealm: 'base', sheet: null });
    expect(c.presets[1].sheet.values.totalHp).toBe(654321);
  });
});

describe('robustness', () => {
  it('a bare minimal profile still yields a valid character', () => {
    const bare = { player: { class: 'MYSTIC', level: 10 }, equipment: {} };
    expect(isGameProfile(bare)).toBe(true);
    const c = normaliseCharacter(gameProfileToCharacter(bare));
    expect(c).toMatchObject({ name: 'Imported character', class: 'MYSTIC', level: 10 });
    expect(c.presets).toHaveLength(2);
    expect(c.transcendence.presets[0].id).toBe('default');
  });

  it('a profile without presets becomes one preset from the live loadout, which takes the sheet', () => {
    const f = fixture();
    delete f.presets;
    delete f.activePresetId;
    f.activeEquipmentSet = 2;
    f.activeTalentSet = 2;
    f.petState.equippedPetId = 'pet-2';
    f.mountState.activeMountId = 'mount-a';
    f.relicState.equippedRelicIds = ['relic_swift_emblem'];
    f.sigilState.equippedSpecies = ['IRON_BASTION'];
    const c = normaliseCharacter(gameProfileToCharacter(f, { now: 'T' }));
    const active = c.presets.find((p) => p.id === c.activePresetId);
    expect(active).toMatchObject({ equipmentSet: 2, talentSet: 1, petId: 'pet-2', mountId: 'mount-a', sigilSpecies: ['IRON_BASTION'] });
    expect(active.relicIds).toEqual(['relic_swift_emblem']);
    expect(active.sheet.values.totalAttack).toBe(123456);
    expect(c.presets).toHaveLength(2); // the two-preset minimum
  });

  it('unknown species, glyph types and relics are dropped, not fatal', () => {
    const f = fixture();
    f.petState.ownedPets.push({ id: 'p9', species: 'NOT_A_PET', secondaryStats: [] });
    f.player.glyphs.push({ id: 'gx', glyphType: 'g-nonexistent', rarity: 'RARE' });
    f.relicState.ownedRelics.push({ relicId: 'relic_nope', level: 3 });
    const c = normaliseCharacter(gameProfileToCharacter(f));
    expect(c.pets.owned).toHaveLength(2);
    expect(c.glyphs.some((g) => g.id === 'gx')).toBe(false);
    expect(c.relics.relic_nope).toBeUndefined();
  });

  it('presets beyond the cap of 8 are cut and the active id stays valid', () => {
    const f = fixture();
    f.presets = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, equipmentSet: 1, talentSet: 1, relicIds: [], sigilSpecies: [] }));
    f.activePresetId = 'p9';
    const c = normaliseCharacter(gameProfileToCharacter(f));
    expect(c.presets).toHaveLength(8);
    expect(c.activePresetId).toBe('p0');
  });
});

describe('round trip through normaliseRoster', () => {
  it('a mapped character survives roster normalisation and JSON unchanged', () => {
    const c = normaliseCharacter(gameProfileToCharacter(fixture(), { now: 'T' }));
    const roster = { schemaVersion: SCHEMA_VERSION, characters: [c], currentId: c.id };
    const once = normaliseRoster(JSON.parse(JSON.stringify(roster)));
    expect(once).toEqual(roster);
    expect(normaliseRoster(once)).toEqual(once);
  });

  it('the raw mapping is stable under normalisation (normaliseCharacter is idempotent on it)', () => {
    const c = normaliseCharacter(gameProfileToCharacter(fixture(), { now: 'T' }));
    expect(normaliseCharacter(c)).toEqual(c);
  });
});

describe('M3 import integrity', () => {
  const now = 'T';
  const imp = (f, opts = {}) => {
    const report = [];
    const raw = gameProfileToCharacter(f, { now, report, ...opts });
    return { c: normaliseCharacter(raw), report };
  };

  it('a clean profile changes nothing', () => {
    const { c, report } = imp(fixture());
    expect(c.presets.map((p) => p.id)).toEqual(['default', 'preset-2']);
    expect(report).toEqual([]);
  });

  it('a dirty live loadout updates the selected preset in place (no Live loadout preset) and it takes the sheet', () => {
    const f = fixture();
    f.activePresetId = 'default'; // TANK: set 1, talent set 2, pet-2, mount-a ...
    // live stays DPS-like (set 2), so it differs from the selected TANK preset
    const { c, report } = imp(f);
    expect(c.presets).toHaveLength(2);
    expect(c.presets.some((p) => p.name === 'Live loadout' || p.id === 'live-loadout')).toBe(false);
    const tank = c.presets[0];
    expect(tank).toMatchObject({ id: 'default', name: 'TANK', equipmentSet: 2, talentSet: 0, petId: null, mountId: 'mount-b', sigilSpecies: ['ARROWSTORM'], relicIds: [] });
    expect(tank.sheet.values.totalAttack).toBe(123456);
    expect(c.presets[1].sheet).toBeNull();
    expect(c.activePresetId).toBe('default');
    expect(report).toHaveLength(1);
    expect(report[0]).toMatchObject({ kind: 'liveLoadoutApplied', presetId: 'default', presetName: 'TANK' });
    expect(report[0].fields).toEqual(expect.arrayContaining(['equipmentSet', 'talentSet', 'petId', 'mountId', 'relicIds', 'sigilSpecies']));
  });

  it('a selected preset missing from the profile falls back to one appended Live loadout preset', () => {
    const f = fixture();
    f.activePresetId = 'gone';
    f.presets[0].mountId = 'mount-a'; // list[0] is TANK: differs from the live loadout
    const { c, report } = imp(f);
    expect(c.presets).toHaveLength(3);
    expect(c.presets[2].name).toBe('Live loadout');
    expect(c.presets[2].sheet.values.totalAttack).toBe(123456);
    expect(report).toEqual([]);
  });

  it('at the preset cap with the selected preset present, it is still updated and keeps the sheet', () => {
    const f = fixture();
    f.presets = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, equipmentSet: 1, talentSet: 1, relicIds: [], sigilSpecies: [] }));
    f.activePresetId = 'p3';
    const { c, report } = imp(f);
    expect(c.presets).toHaveLength(8);
    expect(c.presets[3].equipmentSet).toBe(2);
    expect(c.presets[3].sheet).not.toBeNull();
    expect(report[0]).toMatchObject({ kind: 'liveLoadoutApplied', presetId: 'p3', presetName: 'P3' });
  });

  it('a Mystic Druid profile without presets keeps the live Druid sigils, not the Mage arrays (#113)', () => {
    const f = fixture();
    f.player.class = 'MYSTIC';
    delete f.presets;
    delete f.activePresetId;
    f.talentState = { specialization: 'MYSTIC_DRUID', allocation: {} };
    f.activeTalentSet = 1;
    f.sigilState = {
      ownedSigils: [{ species: 'ARCANE_SHARD', rarity: 'RARE', level: 3 }, { species: 'URSINE_FORM', rarity: 'RARE', level: 3 }],
      equippedSpecies: ['ARCANE_SHARD'],
      druidEquippedSpecies: ['ARCANE_BURST'],
      utilitySlotSpecies: null,
      druidUtilitySlotSpecies: 'URSINE_FORM',
      altarTier: 1,
    };
    const raw = gameProfileToCharacter(f, { now });
    const p = raw.presets[0];
    expect(p.sigilSpecies).toEqual(['ARCANE_BURST']);
    expect(p.utilitySigilSpecies).toBe('URSINE_FORM');
  });

  it('an imported unactivated stone stays unactivated (M2 note)', () => {
    const f = fixture();
    f.enchantStones[0].activated = false;
    const { c } = imp(f);
    expect(c.enchantStones.find((s) => s.id === 'stone-a').activated).toBe(false);
    expect(c.enchantStones.find((s) => s.id === 'stone-b').activated).toBe(true);
  });

  it('the Oblivion sheet is owned by the preset that holds the live loadout (S1)', () => {
    const f = fixture();
    f.oblivionPrestige = { unlocked: true, activeRealm: 'OBLIVION', oblivion: { level: 3, equipment: {}, enchantSlots: {}, enchantStones: [] } };
    const clean = imp(f).c;
    expect(clean.oblivion.sheet.presetId).toBe('preset-2');
    f.activePresetId = 'default';
    const dirty = imp(f).c;
    expect(dirty.oblivion.sheet.presetId).toBe('default');
    expect(dirty.presets).toHaveLength(2);
  });

  it('the active board is imported, so an unlinked preset resolves to it (#110)', () => {
    const f = fixture();
    f.transcendencePresets.push({ id: 'x', name: 'X', allocatedNodeIds: ['n_0,-1', 'n_0,-2'] });
    f.activeTranscendencePresetId = 'x';
    f.presets[1].transcendencePresetId = null;
    const { c } = imp(f);
    expect(c.transcendence.activePresetId).toBe('x');
    expect(resolveTranscendencePreset(c, c.presets[1]).id).toBe('x');
  });

  it('a linked preset whose board differs from the active one takes the live board', () => {
    const f = fixture(); // preset-2 (selected) links tp2
    f.activeTranscendencePresetId = 'default';
    const { c, report } = imp(f);
    expect(c.presets[1].transcendencePresetId).toBe('default');
    expect(report[0]).toMatchObject({ kind: 'liveLoadoutApplied', presetId: 'preset-2', fields: ['transcendencePresetId'] });
  });

  it('extraSlotsPurchased 0 caps relics at 2 per preset', () => {
    const f = fixture();
    f.relicState.extraSlotsPurchased = 0;
    f.relicState.ownedRelics.push({ relicId: 'relic_crimson_edge', level: 1 }, { relicId: 'relic_phoenix_feather', level: 1 });
    f.presets[0].relicIds = ['relic_swift_emblem', 'relic_guardian_signet', 'relic_crimson_edge', 'relic_phoenix_feather'];
    const { c } = imp(f);
    expect(c.extraRelicSlots).toBe(0);
    expect(c.presets[0].relicIds).toHaveLength(2);
  });
});

// Invented profile in the shape the game sends below the Presets unlock (level 41): one 'default'
// preset with no board link, and one empty 'default' board that is also the active board.
function lowLevelProfile() {
  return {
    player: { name: 'Lowhero', class: 'SENTINEL', level: 38 },
    equipment: {},
    equipment2: {},
    activeEquipmentSet: 1,
    talentState: { specialization: 'SENTINEL_MARKSMANSHIP', allocation: {} },
    activeTalentSet: 1,
    presets: [{
      id: 'default', name: 'DEFAULT', equipmentSet: 1, talentSet: 1, petId: null, mountId: null,
      relicIds: [], sigilSpecies: [], utilitySigilSpecies: null, transcendencePresetId: null, isDefault: true,
    }],
    activePresetId: 'default',
    petState: { ownedPets: [], equippedPetId: null },
    mountState: { ownedMounts: [], activeMountId: null },
    sigilState: { ownedSigils: [], equippedSpecies: [], utilitySlotSpecies: null, altarTier: 1 },
    relicState: { ownedRelics: [], equippedRelicIds: [], extraSlotsPurchased: 0 },
    transcendencePresets: [{ id: 'default', name: 'DEFAULT', icon: 'core', allocatedNodeIds: [], isDefault: true }],
    activeTranscendencePresetId: 'default',
  };
}

describe('below the Presets unlock (level 41)', () => {
  it('an unlinked preset stays unlinked: the active board is not a live change', () => {
    const report = [];
    const c = normaliseCharacter(gameProfileToCharacter(lowLevelProfile(), { now: 'T', report }));
    expect(c.presets[0].transcendencePresetId).toBeNull();
    expect(resolveTranscendencePreset(c, c.presets[0]).id).toBe('default');
    expect(report).toEqual([]);
    expect(checkPreset(c, c.presets[0])).toEqual([]);
  });

  it('with no presets, the live loadout follows the active board instead of linking it', () => {
    const f = lowLevelProfile();
    delete f.presets;
    delete f.activePresetId;
    const raw = gameProfileToCharacter(f, { now: 'T' });
    expect(raw.presets[0].transcendencePresetId).toBeNull();
    const c = normaliseCharacter(raw);
    expect(resolveTranscendencePreset(c, c.presets[0]).id).toBe('default');
    expect(checkPreset(c, c.presets[0])).toEqual([]);
  });

  it('the optimiser accepts the imported preset as its baseline (no "Transcendence unlocks at level 55")', () => {
    const c = normaliseCharacter(gameProfileToCharacter(lowLevelProfile(), { now: 'T' }));
    const { space } = prepare({ character: c, presetId: c.activePresetId });
    expect(legalityOf(space.character, space.presetId, space.start)).toEqual({ ok: true, violations: [], warnings: [] });
  });
});
