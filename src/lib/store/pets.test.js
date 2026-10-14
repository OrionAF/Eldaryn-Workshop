import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore as store } from '../rosterStore.svelte.js';
import { KEY } from '../storage.js';

function reset() {
  const id = store.addCharacter('Test', 'WARRIOR');
  for (const c of [...store.roster.characters]) if (c.id !== id) store.deleteCharacter(c.id);
  localStorage.clear();
}
const saved = () => JSON.parse(localStorage.getItem(KEY)).characters.find((c) => c.id === store.current.id);

describe('pets store', () => {
  beforeEach(reset);

  it('add / remove persists, and remove clears presets using the pet', () => {
    const id = store.addPet('EMBER_FOX');
    expect(store.current.pets.owned[0]).toMatchObject({ id, species: 'EMBER_FOX', rarity: 'Uncommon' });
    expect(saved().pets.owned).toHaveLength(1);
    const preset = store.current.presets[0].id;
    store.setPresetPet(preset, id);
    expect(store.current.presets[0].petId).toBe(id);
    expect(store.removePet(id)).toBe(true);
    expect(store.current.presets[0].petId).toBeNull();
    expect(store.addPet('NOPE')).toBeNull();
  });

  it('secondaries: slot limit, no duplicates, class gating, value clamp', () => {
    const id = store.addPet('FLAME_TOAD'); // 1 slot
    expect(store.setPetSecondaryType(id, 0, 'ATTACK_PERCENT')).toBe(true);
    expect(store.setPetSecondaryType(id, 1, 'HEALTH_PERCENT')).toBe(false);
    store.setPetSecondaryValue(id, 0, 500);
    expect(store.current.pets.owned[0].secondaries[0].value).toBe(21);
    expect(store.setPetSecondaryType(id, 0, 'SOUL_LINK')).toBe(false); // Warrior cannot roll it
    const big = store.addPet('ANCIENT_DRAKE');
    store.setPetSecondaryType(big, 0, 'CRIT_CHANCE');
    expect(store.setPetSecondaryType(big, 1, 'CRIT_CHANCE')).toBe(false);
    store.setPetSecondaryType(big, 1, 'LIFESTEAL');
    store.removePetSecondary(big, 0);
    expect(store.current.pets.owned[1].secondaries.map((s) => s.type)).toEqual(['LIFESTEAL']);
  });

  it('changing species trims secondaries to the new slot count', () => {
    const id = store.addPet('ANCIENT_DRAKE');
    store.setPetSecondaryType(id, 0, 'CRIT_CHANCE');
    store.setPetSecondaryType(id, 1, 'LIFESTEAL');
    store.setPetSpecies(id, 'FLAME_TOAD');
    expect(store.current.pets.owned[0]).toMatchObject({ rarity: 'Common' });
    expect(store.current.pets.owned[0].secondaries).toHaveLength(1);
  });

  it('altar level clamps; tier change wipes the collection and nulls preset pets', () => {
    store.setPetAltarLevel(80);
    expect(store.current.pets.altar.level).toBe(50);
    const id = store.addPet('DUST_MITE');
    store.setPresetPet(store.current.presets[1].id, id);
    expect(store.setPetAltarTier(1)).toBe(false);
    expect(store.current.pets.owned).toHaveLength(1);
    expect(store.setPetAltarTier(3)).toBe(true);
    expect(store.current.pets).toMatchObject({ altar: { tier: 3, level: 50 }, owned: [] });
    expect(store.current.presets.every((p) => p.petId === null)).toBe(true);
    expect(saved().pets.altar.tier).toBe(3);
    store.setPetAltarTier(99);
    expect(store.current.pets.altar.tier).toBe(8);
  });
});
