import { describe, it, expect } from 'vitest';
import {
  defaultPets, normalisePets, migratePetsFromV1, reconcilePets, secondaryTypesFor, clampSecondaryValue, coreSecondaryRangePoints,
  coreRarityName, coreRarityEnum, coreSlots, coreName, newCore, MAX_OWNED_CORES,
} from './pets.js';
import { migrateCharacterFromV1, normaliseCharacter, newCharacter } from './index.js';

const norm = (pets, cls = 'WARRIOR') => normalisePets({ pets }, { class: cls }).pets;
const core = (over = {}) => ({ id: 'a', rarity: 'Legendary', baseAttack: 2350, baseHp: 6700, secondaries: [], ...over });

describe('normalisePets', () => {
  it('defaults and is idempotent', () => {
    expect(normalisePets({}, {})).toEqual(defaultPets());
    const raw = { altar: { level: 12, tier: 3 }, cores: [core({ secondaries: [{ type: 'ATTACK_PERCENT', value: 5.04 }] })] };
    const once = norm(raw);
    expect(norm(once)).toEqual(once);
    expect(once).toEqual({ altar: { level: 12, tier: 3 }, cores: [core({ secondaries: [{ type: 'ATTACK_PERCENT', value: 5.04 }] })] });
  });

  it('drops V1 pets (no cores array) and their altar: they predate 2.9.1', () => {
    const v1 = { altar: { level: 40, tier: 4 }, owned: [{ id: 'a', species: 'EMBER_FOX', secondaries: [] }] };
    expect(norm(v1)).toEqual(defaultPets().pets);
  });

  it('clamps the altar, drops junk cores and fills a missing base with the rarity middle', () => {
    const out = norm({
      altar: { level: 999, tier: 0 },
      cores: [null, { id: '', rarity: 'Common' }, { id: 'x', rarity: 'NOPE' }, { id: 'a', rarity: 'MYTHIC', baseAttack: -5 }, { id: 'a', rarity: 'Common' }],
    });
    expect(out.altar).toEqual({ level: 50, tier: 1 });
    expect(out.cores).toEqual([{ id: 'a', rarity: 'Mythic', baseAttack: 3850, baseHp: 9750, secondaries: [] }]);
    expect(norm({ altar: { tier: 99 }, cores: [] }).altar.tier).toBe(20);
  });

  it('caps secondaries at the rarity slot count, dedupes, rejects unknown types', () => {
    const sec = [
      { type: 'ATTACK_PERCENT', value: 3 }, { type: 'ATTACK_PERCENT', value: 4 }, { type: 'WAT', value: 1 },
      { type: 'HEALTH_PERCENT', value: 3 }, { type: 'CRIT_DAMAGE', value: 3 },
    ];
    expect(norm({ cores: [core({ rarity: 'Common', secondaries: sec })] }).cores[0].secondaries.map((s) => s.type)).toEqual(['ATTACK_PERCENT']);
    expect(norm({ cores: [core({ rarity: 'Legendary', secondaries: sec })] }).cores[0].secondaries.map((s) => s.type))
      .toEqual(['ATTACK_PERCENT', 'HEALTH_PERCENT', 'CRIT_DAMAGE']);
    expect(['Common', 'Uncommon', 'Legendary', 'Divine', 'Oblivion'].map(coreSlots)).toEqual([1, 2, 3, 4, 5]);
  });

  it('gates secondaries by class', () => {
    const raw = { cores: [core({ secondaries: [{ type: 'CRIT_CHANCE', value: 3 }, { type: 'LIFESTEAL', value: 3 }] })] };
    expect(norm(raw, 'NECROMANCER').cores[0].secondaries).toEqual([]);
    expect(norm(raw, 'WARRIOR').cores[0].secondaries.map((s) => s.type)).toEqual(['CRIT_CHANCE', 'LIFESTEAL']);
    expect(secondaryTypesFor('NECROMANCER')).not.toContain('CRIT_CHANCE');
    expect(secondaryTypesFor('WARRIOR')).toContain('BLOCK_CHANCE');
    expect(secondaryTypesFor('SENTINEL')).not.toContain('BLOCK_CHANCE');
  });

  it('caps the collection at 100', () => {
    const cores = Array.from({ length: 120 }, (_, i) => core({ id: `p${i}` }));
    expect(norm({ cores }).cores).toHaveLength(MAX_OWNED_CORES);
  });

  it('secondary envelopes are the item-level-50 roll in percent points; clampSecondaryValue snaps to them', () => {
    expect(coreSecondaryRangePoints('ATTACK_PERCENT')).toEqual({ min: 1.8, max: 10.9, step: 0.1 });
    expect(coreSecondaryRangePoints('ATTACK_SPEED')).toEqual({ min: 3, max: 16, step: 1 }); // x100: a multiplier stat
    expect(coreSecondaryRangePoints('WAT')).toBeNull();
    expect(clampSecondaryValue('ATTACK_PERCENT', 99)).toBe(10.9);
    expect(clampSecondaryValue('ATTACK_PERCENT', 'x')).toBe(1.8);
    expect(clampSecondaryValue('CRIT_DAMAGE', 7.4)).toBe(7);
  });

  it('rarity names, new cores and display names', () => {
    expect([coreRarityName('MYTHIC'), coreRarityName('mythic'), coreRarityName('nope')]).toEqual(['Mythic', 'Mythic', null]);
    expect(coreRarityEnum('Oblivion')).toBe('OBLIVION');
    expect(newCore('EPIC', 'c1')).toEqual({ id: 'c1', rarity: 'Epic', baseAttack: 1300, baseHp: 3830, secondaries: [] });
    expect(newCore('NOPE')).toBeNull();
    expect(coreName(core())).toBe('Legendary Core');
  });

  it('reconcile drops secondaries the class cannot roll', () => {
    const c = { class: 'NECROMANCER', pets: { cores: [core({ secondaries: [{ type: 'LIFESTEAL', value: 1 }, { type: 'SOUL_LINK', value: 2 }] }), core({ id: 'b' })] } };
    reconcilePets(c);
    expect(c.pets.cores[0].secondaries).toEqual([{ type: 'SOUL_LINK', value: 2 }]);
  });
});

describe('migratePetsFromV1', () => {
  const v1 = {
    petAltar: { tier: 10, level: 33 },
    pets: [{ id: 'pet1', companionId: 'pyretoad', secondaries: [{ statKey: 'speed', value: 4.5 }] }],
  };

  it('v1 pets predate Pet Cores: all are dropped, and presets lose their pet', () => {
    const { value, idMap } = migratePetsFromV1(v1);
    expect(value).toEqual(defaultPets());
    expect(idMap).toEqual({});
    const c = migrateCharacterFromV1({ id: 'old', name: 'A', class: 'Warrior', ...v1, presets: [{ id: 'a', name: 'Arms', petId: 'pet1' }] });
    expect(c.presets[0].petId).toBeNull();
    expect(normaliseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('tolerates garbage', () => {
    expect(migratePetsFromV1(null).value).toEqual(defaultPets());
    expect(newCharacter('X', 'MYSTIC').pets).toEqual(defaultPets().pets);
  });
});

describe('imported secondary values (M2 #109)', () => {
  it('keeps a real roll above the envelope, rounded to 3 dp', () => {
    const raw = { pets: { altar: { level: 1, tier: 1 }, cores: [core({ secondaries: [{ type: 'HEALTH_PERCENT', value: 24.3 }, { type: 'CRIT_CHANCE', value: -2 }] })] } };
    const sec = normalisePets(raw, { class: 'WARRIOR' }).pets.cores[0].secondaries;
    expect(sec[0].value).toBe(24.3);
    expect(sec[1].value).toBe(0);
  });
});
