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

  it('add / remove persists, and remove clears presets using the core', () => {
    const id = store.addCore('UNCOMMON');
    expect(store.current.pets.cores[0]).toEqual({ id, rarity: 'Uncommon', baseAttack: 390, baseHp: 1180, secondaries: [] });
    expect(saved().pets.cores).toHaveLength(1);
    const preset = store.current.presets[0].id;
    store.setPresetPet(preset, id);
    expect(store.current.presets[0].petId).toBe(id);
    expect(store.removeCore(id)).toBe(true);
    expect(store.current.presets[0].petId).toBeNull();
    expect(store.addCore('NOPE')).toBeNull();
  });

  it('base stats: whole numbers >= 0', () => {
    const id = store.addCore('Common');
    expect(store.setCoreBase(id, 'attack', 191.6)).toBe(true);
    expect(store.setCoreBase(id, 'hp', 500)).toBe(true);
    expect(store.setCoreBase(id, 'hp', -1)).toBe(false);
    expect(store.setCoreBase(id, 'speed', 1)).toBe(false);
    expect(store.current.pets.cores[0]).toMatchObject({ baseAttack: 192, baseHp: 500 });
  });

  it('secondaries: slot limit, no duplicates, class gating, value clamp', () => {
    const id = store.addCore('Common'); // 1 slot
    expect(store.setCoreSecondaryType(id, 0, 'ATTACK_PERCENT')).toBe(true);
    expect(store.setCoreSecondaryType(id, 1, 'HEALTH_PERCENT')).toBe(false);
    store.setCoreSecondaryValue(id, 0, 500);
    expect(store.current.pets.cores[0].secondaries[0].value).toBe(10.9);
    expect(store.setCoreSecondaryType(id, 0, 'SOUL_LINK')).toBe(false); // Warrior cannot roll it
    const big = store.addCore('Legendary');
    store.setCoreSecondaryType(big, 0, 'CRIT_CHANCE');
    expect(store.setCoreSecondaryType(big, 1, 'CRIT_CHANCE')).toBe(false);
    store.setCoreSecondaryType(big, 1, 'LIFESTEAL');
    store.removeCoreSecondary(big, 0);
    expect(store.current.pets.cores[1].secondaries.map((s) => s.type)).toEqual(['LIFESTEAL']);
  });

  it('changing rarity resets the bases to its middle and trims secondaries to the new slot count', () => {
    const id = store.addCore('Legendary');
    store.setCoreSecondaryType(id, 0, 'CRIT_CHANCE');
    store.setCoreSecondaryType(id, 1, 'LIFESTEAL');
    expect(store.setCoreRarity(id, 'Legendary')).toBe(false);
    expect(store.setCoreRarity(id, 'COMMON')).toBe(true);
    expect(store.current.pets.cores[0]).toMatchObject({ rarity: 'Common', baseAttack: 180, baseHp: 530 });
    expect(store.current.pets.cores[0].secondaries).toHaveLength(1);
  });

  it('altar level clamps; tier change wipes the collection and nulls preset pets', () => {
    store.setPetAltarLevel(80);
    expect(store.current.pets.altar.level).toBe(50);
    const id = store.addCore('Rare');
    store.setPresetPet(store.current.presets[1].id, id);
    expect(store.setPetAltarTier(1)).toBe(false);
    expect(store.current.pets.cores).toHaveLength(1);
    expect(store.setPetAltarTier(3)).toBe(true);
    expect(store.current.pets).toMatchObject({ altar: { tier: 3, level: 50 }, cores: [] });
    expect(store.current.presets.every((p) => p.petId === null)).toBe(true);
    expect(saved().pets.altar.tier).toBe(3);
    store.setPetAltarTier(99);
    expect(store.current.pets.altar.tier).toBe(20);
  });
});
