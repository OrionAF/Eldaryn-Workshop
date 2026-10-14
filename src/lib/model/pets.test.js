import { describe, it, expect } from 'vitest';
import { defaultPets, normalisePets, migratePetsFromV1, reconcilePets, secondaryTypesFor, clampSecondaryValue, MAX_OWNED_PETS } from './pets.js';
import { migrateCharacterFromV1, normaliseCharacter, newCharacter } from './index.js';

const norm = (pets, cls = 'WARRIOR') => normalisePets({ pets }, { class: cls }).pets;

describe('normalisePets', () => {
  it('defaults and is idempotent', () => {
    expect(normalisePets({}, {})).toEqual(defaultPets());
    const raw = { altar: { level: 12, tier: 3 }, owned: [{ id: 'a', species: 'EMBER_FOX', secondaries: [{ type: 'ATTACK_PERCENT', value: 5.04 }] }] };
    const once = norm(raw);
    expect(norm(once)).toEqual(once);
    expect(once.owned[0]).toEqual({ id: 'a', species: 'EMBER_FOX', rarity: 'Uncommon', secondaries: [{ type: 'ATTACK_PERCENT', value: 5 }] });
  });

  it('clamps the altar and drops junk pets', () => {
    const out = norm({
      altar: { level: 999, tier: 0 },
      owned: [null, { id: '', species: 'FLAME_TOAD' }, { id: 'x', species: 'NOPE' }, { id: 'a', species: 'FLAME_TOAD' }, { id: 'a', species: 'DUST_MITE' }],
    });
    expect(out.altar).toEqual({ level: 50, tier: 1 });
    expect(out.owned.map((p) => p.id)).toEqual(['a']);
    expect(norm({ altar: { tier: 99 } }).altar.tier).toBe(8);
  });

  it('caps secondaries at the species slot count, dedupes, rejects unknown types', () => {
    const sec = [
      { type: 'ATTACK_PERCENT', value: 3 }, { type: 'ATTACK_PERCENT', value: 4 }, { type: 'WAT', value: 1 },
      { type: 'HEALTH_PERCENT', value: 3 }, { type: 'CRIT_DAMAGE', value: 3 },
    ];
    const common = norm({ owned: [{ id: 'c', species: 'FLAME_TOAD', secondaries: sec }] }).owned[0];
    expect(common.secondaries.map((s) => s.type)).toEqual(['ATTACK_PERCENT']);
    const ancient = norm({ owned: [{ id: 'c', species: 'ANCIENT_DRAKE', secondaries: sec }] }).owned[0];
    expect(ancient.secondaries.map((s) => s.type)).toEqual(['ATTACK_PERCENT', 'HEALTH_PERCENT', 'CRIT_DAMAGE']);
  });

  it('gates secondaries by class and forces the catalogue rarity', () => {
    const raw = { owned: [{ id: 'p', species: 'GLOOM_BAT', rarity: 'Mythic', secondaries: [{ type: 'CRIT_CHANCE', value: 3 }, { type: 'LIFESTEAL', value: 3 }] }] };
    expect(norm(raw, 'NECROMANCER').owned[0].secondaries).toEqual([]);
    expect(norm(raw, 'WARRIOR').owned[0]).toMatchObject({ rarity: 'Uncommon', secondaries: [{ type: 'CRIT_CHANCE' }, { type: 'LIFESTEAL' }] });
    expect(secondaryTypesFor('NECROMANCER')).not.toContain('CRIT_CHANCE');
    expect(secondaryTypesFor('WARRIOR')).toContain('BLOCK_CHANCE');
    expect(secondaryTypesFor('SENTINEL')).not.toContain('BLOCK_CHANCE');
  });

  it('caps the collection at 100', () => {
    const owned = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, species: 'FLAME_TOAD' }));
    expect(norm({ owned }).owned).toHaveLength(MAX_OWNED_PETS);
  });

  it('clampSecondaryValue snaps to step and range; manual types are only floored', () => {
    expect(clampSecondaryValue('ATTACK_PERCENT', 99)).toBe(21);
    expect(clampSecondaryValue('ATTACK_PERCENT', 'x')).toBe(0.1);
    expect(clampSecondaryValue('CRIT_DAMAGE', 7.4)).toBe(7);
    expect(clampSecondaryValue('PENETRATION', 45.55)).toBe(45.55);
    expect(clampSecondaryValue('PENETRATION', -3)).toBe(0);
  });

  it('reconcile drops secondaries the class cannot roll', () => {
    const c = { class: 'NECROMANCER', pets: { owned: [{ id: 'a', secondaries: [{ type: 'LIFESTEAL', value: 1 }, { type: 'SOUL_LINK', value: 2 }] }, { id: 'b' }] } };
    reconcilePets(c);
    expect(c.pets.owned[0].secondaries).toEqual([{ type: 'SOUL_LINK', value: 2 }]);
  });
});

describe('migratePetsFromV1', () => {
  const v1 = {
    petAltar: { tier: 10, level: 33 },
    pets: [
      { id: 'pet1', companionId: 'pyretoad', secondaries: [{ statKey: 'speed', value: 4.5 }, { statKey: 'bogus', value: 1 }] },
      { id: 'pet2', companionId: 'ancientdrake', secondaries: [{ statKey: 'attack_pct', value: 9 }] },
      { id: 'pet3', companionId: null, stats: { attack: 5 } },
    ],
  };

  it('maps companions to species (evolved or base), clamps the altar, drops custom pets', () => {
    const { value, idMap } = migratePetsFromV1(v1);
    expect(value.pets.altar).toEqual({ level: 33, tier: 8 });
    expect(value.pets.owned.map((p) => [p.id, p.species])).toEqual([['pet1', 'FLAME_TOAD'], ['pet2', 'ANCIENT_DRAKE']]);
    expect(value.pets.owned[0].secondaries).toEqual([{ type: 'ATTACK_SPEED', value: 4.5 }]);
    expect(idMap).toEqual({ pet1: 'pet1', pet2: 'pet2' });
  });

  it('a v1 preset petId survives the full character migration', () => {
    const c = migrateCharacterFromV1({
      id: 'old', name: 'A', class: 'Warrior', ...v1,
      presets: [{ id: 'a', name: 'Arms', petId: 'pet1' }, { id: 'b', name: 'Prot', petId: 'pet3' }],
    });
    expect(c.presets[0].petId).toBe('pet1');
    expect(c.presets[1].petId).toBeNull();
    expect(c.pets.owned.find((p) => p.id === 'pet1')).toMatchObject({ species: 'FLAME_TOAD', rarity: 'Common' });
    expect(normaliseCharacter(JSON.parse(JSON.stringify(c)))).toEqual(c);
  });

  it('tolerates garbage', () => {
    expect(migratePetsFromV1(null).value).toEqual(defaultPets());
    expect(migratePetsFromV1({ pets: 'x' }).idMap).toEqual({});
    expect(newCharacter('X', 'MYSTIC').pets).toEqual(defaultPets().pets);
  });
});
