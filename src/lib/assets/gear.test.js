import { it, expect } from 'vitest';
import { gearImage } from './gear.js';
import { RARITIES, SLOT_ORDER, itemTypesFor } from '../game/gear.js';

it('resolves art for every rarity, material, slot and class the client draws', () => {
  for (const r of RARITIES) {
    for (const t of itemTypesFor(r.id)) {
      for (const slot of SLOT_ORDER) {
        if (['BELT', 'GLOVES', 'RIFT_CORE'].includes(slot) && r.order < 6) continue; // no low-rarity Oblivion-slot art
        for (const cls of ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER']) {
          expect(gearImage({ rarity: r.id, itemType: t.type }, slot, cls), `${r.id} ${t.type} ${slot} ${cls}`).toBeTruthy();
        }
      }
    }
  }
});

it('picks the material, the class weapon art, and falls back as the client does', () => {
  expect(gearImage({ rarity: 'RARE', itemType: 'RUNIC' }, 'HEAD')).toContain('gear_rare_runic_helmet');
  expect(gearImage({ rarity: 'RARE', itemType: null }, 'HEAD')).toContain('gear_rare_sapphire_helmet');
  expect(gearImage({ rarity: 'DIVINE' }, 'WEAPON', 'MYSTIC')).toContain('gear_divine_cosmic_mystic_weapon');
  expect(gearImage({ rarity: 'DIVINE' }, 'WEAPON', null)).toContain('gear_divine_cosmic_warrior_weapon');
  expect(gearImage({ rarity: 'COMMON' }, 'BELT')).toBeNull();
  expect(gearImage({ rarity: null }, 'HEAD')).toBeNull();
  expect(gearImage(null, 'HEAD')).toBeNull();
});
