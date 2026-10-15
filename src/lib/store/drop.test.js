import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';

const item = { rarity: 'EPIC', itemLevel: 50, quality: 60, primaryStats: { attack: 1000, hp: 5000 }, secondaryStats: [{ type: 'CRIT_CHANCE', value: 2 }], conduit: null };

beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Drop Test', 'WARRIOR');
});

describe('drop store', () => {
  it('startDrop makes an empty drop and keeps slot and realm when omitted', () => {
    expect(rosterStore.current.drop).toBeNull();
    expect(rosterStore.startDrop('RING')).toBe(true);
    expect(rosterStore.current.drop).toMatchObject({ realm: 'base', slot: 'RING' });
    rosterStore.setDropItem(item);
    rosterStore.startDrop();
    expect(rosterStore.current.drop.slot).toBe('RING');
    expect(rosterStore.current.drop.item.primaryStats.attack).toBe(0);
    expect(rosterStore.startDrop('BELT')).toBe(false); // not a base slot
    expect(rosterStore.current.drop.slot).toBe('RING');
  });

  it('setDropItem normalises, and works before any drop exists', () => {
    rosterStore.setDropItem({ ...item, itemLevel: 9999 });
    expect(rosterStore.current.drop.slot).toBe('WEAPON');
    expect(rosterStore.current.drop.item.itemLevel).toBe(100); // no Ascension bought: step 1 (gear.md §6)
  });

  it('setDropSlot starts a fresh item only when the slot changes', () => {
    rosterStore.startDrop('HEAD');
    rosterStore.setDropItem(item);
    rosterStore.setDropSlot('HEAD');
    expect(rosterStore.current.drop.item.primaryStats.attack).toBe(1000);
    rosterStore.setDropSlot('CHEST');
    expect(rosterStore.current.drop).toMatchObject({ slot: 'CHEST' });
    expect(rosterStore.current.drop.item.primaryStats.attack).toBe(0);
  });

  it('setDropRealm keeps the slot when the realm has it, else falls back to WEAPON', () => {
    rosterStore.startDrop('RING');
    rosterStore.setDropItem(item);
    rosterStore.setDropRealm('oblivion');
    expect(rosterStore.current.drop).toMatchObject({ realm: 'oblivion', slot: 'RING' });
    expect(rosterStore.current.drop.item.primaryStats.attack).toBe(1000);
    rosterStore.startDrop('BELT');
    rosterStore.setDropRealm('base');
    expect(rosterStore.current.drop).toMatchObject({ realm: 'base', slot: 'WEAPON' });
  });

  it('discardDrop empties the item but keeps slot and realm', () => {
    rosterStore.startDrop('HEAD');
    rosterStore.setDropItem(item);
    rosterStore.discardDrop();
    expect(rosterStore.current.drop).toMatchObject({ realm: 'base', slot: 'HEAD' });
    expect(rosterStore.current.drop.item.primaryStats.attack).toBe(0);
  });

  it('applyDropToSet writes the item into the chosen set only, and keeps the drop', () => {
    rosterStore.startDrop('WEAPON');
    rosterStore.setDropItem(item);
    expect(rosterStore.applyDropToSet('set2')).toBe(true);
    expect(rosterStore.current.equipment.set2.items.WEAPON.primaryStats.attack).toBe(1000);
    expect(rosterStore.current.equipment.set1.items.WEAPON).toBeNull();
    expect(rosterStore.current.drop.item.primaryStats.attack).toBe(1000);
    // the applied item is a copy: editing the drop afterwards does not touch the set
    rosterStore.setDropItem({ ...item, primaryStats: { attack: 1, hp: 0 } });
    expect(rosterStore.current.equipment.set2.items.WEAPON.primaryStats.attack).toBe(1000);
  });

  it('applyDropToSet refuses a set in the other realm, an unknown set, or no drop', () => {
    expect(rosterStore.applyDropToSet('set1')).toBe(false);
    rosterStore.startDrop('WEAPON');
    rosterStore.setDropItem(item);
    expect(rosterStore.applyDropToSet('oblivion')).toBe(false);
    expect(rosterStore.applyDropToSet('set9')).toBe(false);
    rosterStore.setDropRealm('oblivion');
    expect(rosterStore.applyDropToSet('set1')).toBe(false);
    expect(rosterStore.applyDropToSet('oblivion')).toBe(true);
    expect(rosterStore.current.equipment.oblivion.items.WEAPON.primaryStats.attack).toBe(1000);
  });

  it('persists to localStorage', () => {
    rosterStore.startDrop('RING');
    rosterStore.setDropItem(item);
    const saved = JSON.parse(localStorage.getItem('eldaryn_optimiser_state_v2'));
    const c = saved.characters.find((x) => x.id === rosterStore.current.id);
    expect(c.drop).toMatchObject({ slot: 'RING' });
    expect(c.drop.item.primaryStats.hp).toBe(5000);
  });
});
