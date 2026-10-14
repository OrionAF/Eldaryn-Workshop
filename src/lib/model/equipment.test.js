import { describe, it, expect } from 'vitest';
import {
  defaultEquipment,
  normaliseEquipment,
  normaliseItem,
  migrateEquipmentFromV1,
  reconcileEquipment,
  maxItemLevel,
  conduitAllowed,
  conduitTypesFor,
  secondaryStatMaxValue,
  itemWarnings,
  emptyItem,
} from './equipment.js';
import { newCharacter, normaliseCharacter, normaliseRoster, migrateCharacterFromV1 } from './index.js';
import { BASE_SLOTS, slotsForRealm } from '../game/gear.js';

const legendary = {
  rarity: 'LEGENDARY',
  itemLevel: 100,
  quality: 80,
  primaryStats: { attack: 2750, hp: 8230 },
  secondaryStats: [
    { type: 'CRIT_CHANCE', value: 3.2 },
    { type: 'ATTACK_PERCENT', value: 9.5 },
  ],
  conduit: null,
};

describe('equipment shape', () => {
  it('has three sets with 9/9/12 item slots and 9 sockets each', () => {
    const { equipment } = defaultEquipment();
    expect(Object.keys(equipment.set1.items)).toEqual(BASE_SLOTS);
    expect(Object.keys(equipment.set2.items)).toEqual(BASE_SLOTS);
    expect(Object.keys(equipment.oblivion.items)).toEqual(slotsForRealm('oblivion'));
    expect(Object.keys(equipment.oblivion.items)).toHaveLength(12);
    for (const k of ['set1', 'set2', 'oblivion']) expect(Object.keys(equipment[k].enchantSlots)).toEqual(BASE_SLOTS);
  });

  it('normalise is idempotent and drops slots that do not exist in the set', () => {
    const raw = defaultEquipment();
    raw.equipment.set1.items.WEAPON = legendary;
    raw.equipment.set1.items.BELT = legendary; // oblivion-only slot
    const once = normaliseEquipment(raw, { class: 'WARRIOR' });
    expect(once.equipment.set1.items.BELT).toBeUndefined();
    expect(once.equipment.set1.items.WEAPON).toEqual(legendary);
    expect(normaliseEquipment(once, { class: 'WARRIOR' })).toEqual(once);
  });

  it('survives junk input', () => {
    expect(normaliseEquipment({ equipment: 'x' }, { class: 'WARRIOR' })).toEqual(defaultEquipment());
    expect(normaliseEquipment(null, null)).toEqual(defaultEquipment());
  });
});

describe('normaliseItem', () => {
  it('limits secondary rows to the rarity count (gear.md §2)', () => {
    const many = ['CRIT_CHANCE', 'ATTACK_PERCENT', 'LIFESTEAL', 'DOUBLE_HIT'].map((type) => ({ type, value: 2 }));
    expect(normaliseItem({ ...legendary, secondaryStats: many }, { cls: 'WARRIOR' }).secondaryStats).toHaveLength(2);
    expect(normaliseItem({ ...legendary, rarity: 'DIVINE', secondaryStats: many }, { cls: 'WARRIOR' }).secondaryStats).toHaveLength(3);
    expect(normaliseItem({ ...legendary, rarity: 'EPIC', secondaryStats: many }, { cls: 'WARRIOR' }).secondaryStats).toHaveLength(1);
    expect(normaliseItem({ ...legendary, rarity: 'UNCOMMON', secondaryStats: many }, { cls: 'WARRIOR' }).secondaryStats).toHaveLength(0);
  });

  it('gates the secondary pool by class (Miss Chance is not a Warrior stat)', () => {
    const it1 = { ...legendary, secondaryStats: [{ type: 'MISS_CHANCE', value: 2 }, { type: 'CRIT_CHANCE', value: 2 }] };
    expect(normaliseItem(it1, { cls: 'WARRIOR' }).secondaryStats.map((s) => s.type)).toEqual(['CRIT_CHANCE']);
    expect(normaliseItem(it1, { cls: 'SENTINEL' }).secondaryStats.map((s) => s.type)).toEqual(['MISS_CHANCE', 'CRIT_CHANCE']);
  });

  it('drops duplicate, negative and non-finite secondaries and unknown types', () => {
    const got = normaliseItem(
      { ...legendary, secondaryStats: [{ type: 'CRIT_CHANCE', value: -1 }, { type: 'CRIT_CHANCE', value: 3 }, { type: 'CRIT_CHANCE', value: 4 }, { type: 'NOPE', value: 1 }] },
      { cls: 'WARRIOR' },
    );
    expect(got.secondaryStats).toEqual([{ type: 'CRIT_CHANCE', value: 3 }]);
  });

  it('clamps item level per realm and quality to 1..100', () => {
    expect(maxItemLevel('base')).toBe(240);
    expect(maxItemLevel('oblivion')).toBe(480);
    expect(normaliseItem({ ...legendary, itemLevel: 999 }, { realm: 'base' }).itemLevel).toBe(240);
    expect(normaliseItem({ ...legendary, itemLevel: 999 }, { realm: 'oblivion' }).itemLevel).toBe(480);
    expect(normaliseItem({ ...legendary, itemLevel: 0, quality: 500 }).itemLevel).toBe(1);
    expect(normaliseItem({ ...legendary, quality: 500 }).quality).toBe(100);
    expect(normaliseItem({ ...legendary, itemLevel: '', quality: null })).toMatchObject({ itemLevel: null, quality: null });
  });

  it('keeps a conduit only on Eternal+ gear (or Divine+ in the Oblivion realm, gear.md §7)', () => {
    const conduit = { type: 'FLAME', value: 45 };
    expect(normaliseItem({ ...legendary, conduit }).conduit).toBeNull();
    expect(normaliseItem({ ...legendary, rarity: 'ETERNAL', conduit }).conduit).toEqual(conduit);
    expect(normaliseItem({ ...legendary, rarity: 'DIVINE', conduit: { type: 'DARK', value: 50 } }, { realm: 'base' }).conduit).toBeNull();
    expect(normaliseItem({ ...legendary, rarity: 'DIVINE', conduit: { type: 'DARK', value: 50 } }, { realm: 'oblivion' }).conduit).toEqual({ type: 'DARK', value: 50 });
    expect(conduitAllowed('MYTHIC', 'oblivion')).toBe(false);
    expect(normaliseItem({ ...legendary, rarity: 'ETERNAL', conduit: { type: 'WIND', value: 5 } }).conduit).toBeNull();
  });

  it('conduit type must match rarity and realm (M2 #99 #123, rollConduitForRarity L677825)', () => {
    const at = (rarity, type, realm) => normaliseItem({ ...legendary, rarity, conduit: { type, value: 45 } }, { realm }).conduit?.type ?? null;
    expect(at('ETERNAL', 'DARK', 'base')).toBeNull();
    expect(at('ETERNAL', 'EARTHEN', 'base')).toBe('EARTHEN');
    expect(at('DIVINE', 'FLAME', 'oblivion')).toBeNull();
    expect(at('DIVINE', 'DARK', 'oblivion')).toBe('DARK');
    expect(at('OBLIVION', 'DARK', 'base')).toBe('DARK');
    expect(at('OBLIVION', 'FLAME', 'base')).toBeNull();
    expect(conduitTypesFor('ETERNAL', 'base')).toEqual(['FLAME', 'EARTHEN']);
    expect(conduitTypesFor(null, 'base')).toHaveLength(3); // unknown rarity stays permissive
  });

  it('reports dropped conduits and clamped secondaries', () => {
    const report = [];
    const item = normaliseItem({ ...legendary, rarity: 'ETERNAL', itemLevel: 100, secondaryStats: [{ type: 'CRIT_CHANCE', value: 9 }], conduit: { type: 'DARK', value: 45 } }, { realm: 'base', report, slot: 'HEAD' });
    expect(item.conduit).toBeNull();
    expect(item.secondaryStats[0].value).toBe(5); // CRIT_CHANCE table max at level 100
    expect(report.map((r) => r.kind).sort()).toEqual(['conduitDropped', 'secondaryClamped']);
  });

  it('secondary ceiling follows the item stat level (gear.md §4)', () => {
    expect(secondaryStatMaxValue('CRIT_CHANCE', 1)).toBe(2.8); // min + 50.5% of the range
    expect(secondaryStatMaxValue('CRIT_CHANCE', 100)).toBe(5);
    expect(secondaryStatMaxValue('CRIT_CHANCE', 200)).toBe(7); // 5 x 1.4
    expect(secondaryStatMaxValue('NOPE', 100)).toBeNull();
    const low = normaliseItem({ ...legendary, itemLevel: 1, secondaryStats: [{ type: 'CRIT_CHANCE', value: 5 }] }).secondaryStats[0].value;
    expect(low).toBe(2.8);
    // Oblivion halves the item level: level 400 -> stat level 200
    const ob = normaliseItem({ ...legendary, itemLevel: 400, secondaryStats: [{ type: 'CRIT_CHANCE', value: 99 }] }, { realm: 'oblivion' });
    expect(ob.secondaryStats[0].value).toBe(7);
  });

  it('the item-level cap follows the Ascension step; owned items above it only warn', () => {
    expect(maxItemLevel('base', 1)).toBe(100);
    expect(maxItemLevel('base', 3)).toBe(160);
    expect(maxItemLevel('oblivion', 2)).toBe(260);
    expect(maxItemLevel('base', 99)).toBe(240);
    expect(maxItemLevel('base')).toBe(240);
    const item = normaliseItem({ ...legendary, itemLevel: 200 });
    expect(item.itemLevel).toBe(200);
    expect(itemWarnings(item, { realm: 'base', ascension: 1 })).toEqual([{ kind: 'itemLevelAboveAscension', itemLevel: 200, cap: 100 }]);
    expect(itemWarnings(item, { realm: 'base', ascension: 5 })).toEqual([]);
  });

  it('rejects non-objects and cleans a bad rarity to null', () => {
    expect(normaliseItem(null)).toBeNull();
    expect(normaliseItem('x')).toBeNull();
    expect(normaliseItem({ rarity: 'SHINY' }).rarity).toBeNull();
    expect(normaliseItem({})).toEqual(emptyItem());
  });

  it('is idempotent', () => {
    const once = normaliseItem({ ...legendary, itemLevel: 12.7 }, { cls: 'WARRIOR' });
    expect(normaliseItem(once, { cls: 'WARRIOR' })).toEqual(once);
  });
});

describe('through the character', () => {
  it('re-gating on a class change drops class-invalid secondaries', () => {
    const c = newCharacter('A', 'SENTINEL');
    c.equipment.set1.items.WEAPON = { ...legendary, secondaryStats: [{ type: 'MISS_CHANCE', value: 2 }, { type: 'CRIT_CHANCE', value: 2 }] };
    expect(normaliseCharacter(c).equipment.set1.items.WEAPON.secondaryStats).toHaveLength(2);
    const asWarrior = normaliseCharacter({ ...JSON.parse(JSON.stringify(c)), class: 'WARRIOR' });
    expect(asWarrior.equipment.set1.items.WEAPON.secondaryStats).toEqual([{ type: 'CRIT_CHANCE', value: 2 }]);
  });

  it('a socketed stone must exist in the set pool; one stone fills one slot per set; both sets may share it', () => {
    const c = newCharacter('A', 'WARRIOR');
    c.enchantStones = [{ id: 's1', type: 'PVE_ATTACK', quality: 50, amplifyLevel: 0, oblivionLevel: null, stats: [] }];
    c.oblivionEnchantStones = [{ id: 'o1', type: 'OBLIVION', quality: 50, amplifyLevel: 0, oblivionLevel: 1, stats: [] }];
    c.equipment.set1.enchantSlots.HEAD = 's1';
    c.equipment.set1.enchantSlots.CHEST = 's1'; // duplicate within a set
    c.equipment.set2.enchantSlots.HEAD = 's1'; // shared across sets is fine
    c.equipment.set2.enchantSlots.RING = 'ghost';
    c.equipment.oblivion.enchantSlots.HEAD = 's1'; // base-pool stone in the Oblivion set
    c.equipment.oblivion.enchantSlots.CHEST = 'o1';
    reconcileEquipment(c);
    expect(c.equipment.set1.enchantSlots.HEAD).toBe('s1');
    expect(c.equipment.set1.enchantSlots.CHEST).toBeNull();
    expect(c.equipment.set2.enchantSlots.HEAD).toBe('s1');
    expect(c.equipment.set2.enchantSlots.RING).toBeNull();
    expect(c.equipment.oblivion.enchantSlots.HEAD).toBeNull();
    expect(c.equipment.oblivion.enchantSlots.CHEST).toBe('o1');
  });

  it('a character round-trips through normaliseRoster unchanged', () => {
    const c = newCharacter('A', 'WARRIOR');
    c.equipment.oblivion.items.RIFT_CORE = { ...legendary, rarity: 'OBLIVION', itemLevel: 300, conduit: { type: 'DARK', value: 60 } };
    const roster = { schemaVersion: 2, characters: [c], currentId: c.id };
    expect(normaliseRoster(JSON.parse(JSON.stringify(roster)))).toEqual(roster);
  });
});

describe('v1 migration', () => {
  const v1 = {
    id: 'v1c',
    name: 'Old',
    class: 'Warrior',
    loadouts: [
      {
        name: 'L1',
        gear: {
          Weapon: { attack: 48124, health: 9000, attack_pct: 6.2, speed: 12, crit_mult: 20, crit: 3, pvp_attack: 4 },
          Head: { attack: 0, health: 0 },
        },
        socketedStones: { Weapon: 'st1' },
      },
      { name: 'L2', gear: { Chest: { health: 12000, dmg_reduction: 2.5 } }, socketedStones: {} },
    ],
    stoneInventory: [{ id: 'st1', type: 'crimson', quality: 40, rolledKeys: ['crit', 'speed'], stats: { crit: 1.5, speed: 5 } }],
    presets: [{ id: 'p1', name: 'A', loadout: 1, talentSet: 0, relicIds: [], sigilIds: [] }, { id: 'p2', name: 'B', loadout: 0 }],
    activePresetId: 'p1',
  };

  it('maps loadout gear to sets, stat keys to SecondaryStatType, and percent points to multipliers', () => {
    const { value, idMap } = migrateEquipmentFromV1(v1);
    expect(idMap).toEqual({});
    const w = value.equipment.set1.items.WEAPON;
    expect(w.primaryStats).toEqual({ attack: 48124, hp: 9000 });
    expect(w.rarity).toBeNull();
    expect(w.itemLevel).toBeNull();
    expect(w.quality).toBeNull();
    const by = Object.fromEntries(w.secondaryStats.map((s) => [s.type, s.value]));
    expect(by.ATTACK_PERCENT).toBe(6.2);
    expect(by.ATTACK_SPEED).toBeCloseTo(0.12);
    expect(by.CRIT_DAMAGE).toBeCloseTo(0.2);
    expect(by.CRIT_CHANCE).toBe(3);
    expect(by.PVP_ATTACK).toBeUndefined();
    expect(value.equipment.set1.items.HEAD).toBeNull();
    expect(value.equipment.set2.items.CHEST.primaryStats.hp).toBe(12000);
    expect(value.equipment.oblivion.items.WEAPON).toBeNull();
    expect(value.equipment.set1.enchantSlots.WEAPON).toBe('st1');
  });

  it('through migrateCharacterFromV1: gear and stones survive, the socket still resolves', () => {
    const c = migrateCharacterFromV1(v1);
    expect(c.class).toBe('WARRIOR');
    expect(c.equipment.set1.items.WEAPON.primaryStats.attack).toBe(48124);
    // unknown rarity allows up to 3 secondaries; 5 migrated, Warrior-gated and capped
    expect(c.equipment.set1.items.WEAPON.secondaryStats).toHaveLength(3);
    expect(c.enchantStones).toHaveLength(1);
    expect(c.enchantStones[0]).toMatchObject({ id: 'st1', type: 'PVE_ATTACK', quality: 40, amplifyLevel: 0 });
    expect(c.equipment.set1.enchantSlots.WEAPON).toBe('st1');
    expect(c.presets.find((p) => p.id === 'p1').equipmentSet).toBe(2);
  });
});
