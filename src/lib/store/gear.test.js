import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';

const item = { rarity: 'EPIC', itemLevel: 50, quality: 60, primaryStats: { attack: 1000, hp: 5000 }, secondaryStats: [{ type: 'CRIT_CHANCE', value: 2 }], conduit: null };

let id;
beforeEach(() => {
  localStorage.clear();
  id = rosterStore.addCharacter('Gear Test', 'WARRIOR');
});

describe('gear store', () => {
  it('sets, normalises and clears an item', () => {
    expect(rosterStore.setEquipmentItem('set1', 'WEAPON', { ...item, itemLevel: 9999 })).toBe(true);
    expect(rosterStore.current.equipment.set1.items.WEAPON.itemLevel).toBe(240);
    expect(rosterStore.clearEquipmentItem('set1', 'WEAPON')).toBe(true);
    expect(rosterStore.current.equipment.set1.items.WEAPON).toBeNull();
  });

  it('refuses a slot the set does not have, and unknown sets', () => {
    expect(rosterStore.setEquipmentItem('set1', 'BELT', item)).toBe(false);
    expect(rosterStore.setEquipmentItem('oblivion', 'BELT', item)).toBe(true);
    expect(rosterStore.current.equipment.oblivion.items.BELT.rarity).toBe('EPIC');
    expect(rosterStore.setEquipmentItem('set9', 'HEAD', item)).toBe(false);
  });

  it('persists to localStorage', () => {
    rosterStore.setEquipmentItem('set2', 'RING', item);
    expect(localStorage.getItem('eldaryn_optimiser_state_v2')).toContain('"RING"');
    expect(JSON.parse(localStorage.getItem('eldaryn_optimiser_state_v2')).characters.find((c) => c.id === id).equipment.set2.items.RING.primaryStats.hp).toBe(5000);
  });

  it('a class change re-gates secondaries (Warrior -> Mystic keeps pool stats, drops none that are shared)', () => {
    rosterStore.setCharacterClass(id, 'SENTINEL');
    rosterStore.setEquipmentItem('set1', 'WEAPON', { ...item, secondaryStats: [{ type: 'MISS_CHANCE', value: 3 }] });
    expect(rosterStore.current.equipment.set1.items.WEAPON.secondaryStats).toHaveLength(1);
    rosterStore.setCharacterClass(id, 'WARRIOR');
    expect(rosterStore.current.equipment.set1.items.WEAPON.secondaryStats).toHaveLength(0);
  });
});

describe('stone store', () => {
  const stone = { type: 'PVE_ATTACK', quality: 55, stats: [{ type: 'CRIT_CHANCE', value: 1.5 }] };

  it('adds, updates (amplify, quality) and removes stones in the right pool', () => {
    const a = rosterStore.addEnchantStone('base', stone);
    const o = rosterStore.addEnchantStone('oblivion', { type: 'OBLIVION', quality: 90, oblivionLevel: 3, stats: [] });
    expect(rosterStore.current.enchantStones.map((s) => s.id)).toEqual([a]);
    expect(rosterStore.current.oblivionEnchantStones.map((s) => s.id)).toEqual([o]);
    expect(rosterStore.updateEnchantStone('base', a, { amplifyLevel: 10, quality: 80, type: 'MYTHIC' })).toBe(true);
    expect(rosterStore.current.enchantStones[0]).toMatchObject({ id: a, type: 'PVE_ATTACK', amplifyLevel: 10, quality: 80 });
    expect(rosterStore.updateEnchantStone('oblivion', o, { oblivionLevel: 5 })).toBe(true);
    expect(rosterStore.current.oblivionEnchantStones[0].oblivionLevel).toBe(5);
    expect(rosterStore.updateEnchantStone('base', 'nope', {})).toBe(false);
    expect(rosterStore.addEnchantStone('base', { type: 'BOGUS' })).toBeNull();
    expect(rosterStore.removeEnchantStone('base', a)).toBe(true);
    expect(rosterStore.current.enchantStones).toHaveLength(0);
  });

  it('socket: same stone in both base sets, one slot per set, Oblivion pool separate', () => {
    const a = rosterStore.addEnchantStone('base', stone);
    const o = rosterStore.addEnchantStone('oblivion', { type: 'OBLIVION', stats: [] });
    expect(rosterStore.socketStone('set1', 'HEAD', a)).toBe(true);
    expect(rosterStore.socketStone('set2', 'HEAD', a)).toBe(true);
    expect(rosterStore.socketStone('set1', 'RING', a)).toBe(true); // moves within set1
    const eq = rosterStore.current.equipment;
    expect(eq.set1.enchantSlots.HEAD).toBeNull();
    expect(eq.set1.enchantSlots.RING).toBe(a);
    expect(eq.set2.enchantSlots.HEAD).toBe(a);
    expect(rosterStore.socketStone('oblivion', 'HEAD', a)).toBe(false); // base stone in the Oblivion set
    expect(rosterStore.socketStone('set1', 'HEAD', o)).toBe(false); // Oblivion stone in a base set
    expect(rosterStore.socketStone('oblivion', 'HEAD', o)).toBe(true);
    expect(rosterStore.socketStone('set1', 'BELT', a)).toBe(false); // sockets exist on the 9 base slots only
  });

  it('removing a stone clears every socket that held it', () => {
    const a = rosterStore.addEnchantStone('base', stone);
    rosterStore.socketStone('set1', 'HEAD', a);
    rosterStore.socketStone('set2', 'CHEST', a);
    rosterStore.removeEnchantStone('base', a);
    expect(rosterStore.current.equipment.set1.enchantSlots.HEAD).toBeNull();
    expect(rosterStore.current.equipment.set2.enchantSlots.CHEST).toBeNull();
  });

  it('unsocketStone empties a socket', () => {
    const a = rosterStore.addEnchantStone('base', stone);
    rosterStore.socketStone('set1', 'HEAD', a);
    expect(rosterStore.unsocketStone('set1', 'HEAD')).toBe(true);
    expect(rosterStore.current.equipment.set1.enchantSlots.HEAD).toBeNull();
  });
});
