import { describe, expect, it } from 'vitest';
import { orderStats, orderedStatLabel } from './statOrder.js';
import { sheetKeysForClass, sheetKeyMeta } from '../engine/pipeline/sheet.js';

const EXPECTED = {
  MYSTIC: 'Attack|Attack %|Health|Health %|Attack Speed|Crit Chance|Crit Spell %|Crit Damage|Spell Damage|Lifesteal|Spell Vamp|HP Regen|DMG Reduction|Block Chance|Disruption|Penetration|Spell Resist|PVP Attack|PVP Defense|Flame Conduit|Earthen Conduit|Dark Conduit',
  SENTINEL: 'Attack|Attack %|Health|Health %|Attack Speed|Crit Chance|Crit Damage|Double Hit|Spell Damage|Lifesteal|HP Regen|Miss Chance|Blind Chance|Paralyze Chance|Penetration|Spell Resist|PVP Attack|PVP Defense|Flame Conduit|Earthen Conduit|Dark Conduit',
  WARRIOR: 'Attack|Attack %|Health|Health %|Attack Speed|Crit Chance|Crit Damage|Double Hit|Spell Damage|Lifesteal|HP Regen|DMG Reduction|Block Chance|Penetration|Spell Resist|PVP Attack|PVP Defense|Flame Conduit|Earthen Conduit|Dark Conduit',
  NECROMANCER: 'Attack|Attack %|Health|Health %|Attack Speed|Crit Spell %|Crit Damage|Spell Damage|Spell Vamp|HP Regen|Fear Chance|Spell Resist|Dominion|Minion Attack|Minion Health|Minion Attack Speed|Minion Crit|Minion Lifesteal|Soul Link|PVP Attack|PVP Defense|Flame Conduit|Earthen Conduit|Dark Conduit',
};

describe('class stat display order', () => {
  for (const [cls, expected] of Object.entries(EXPECTED)) {
    it(`matches the complete ${cls} sheet order`, () => {
      const keys = sheetKeysForClass(cls, 'base');
      const sorted = orderStats([...keys].reverse(), cls);
      expect(sorted.map((key) => orderedStatLabel(key, sheetKeyMeta(key).label, cls))).toEqual(expected.split('|'));
      expect(new Set(sorted)).toEqual(new Set(keys));
    });
  }

  it('handles gear enums, glyph keys, board stats and raw sheet keys consistently', () => {
    expect(orderStats(['PENETRATION', 'HEALTH_PERCENT', 'ATTACK_PERCENT', 'ATTACK_SPEED'], 'MYSTIC'))
      .toEqual(['ATTACK_PERCENT', 'HEALTH_PERCENT', 'ATTACK_SPEED', 'PENETRATION']);
    expect(orderStats(['spellDamage', 'critDamage', 'spellCritChance', 'critChance'], 'MYSTIC'))
      .toEqual(['critChance', 'spellCritChance', 'critDamage', 'spellDamage']);
    expect(orderStats(['hpRegenFlat', 'hpPercent', 'attackPercent'], 'WARRIOR'))
      .toEqual(['attackPercent', 'hpPercent', 'hpRegenFlat']);
    expect(orderStats(['rawPenetration', 'rawCritChance', 'totalAttack'], 'SENTINEL'))
      .toEqual(['totalAttack', 'rawCritChance', 'rawPenetration']);
  });

  it('keeps unknown/realm-only rows in stable order and does not mutate saved objects', () => {
    const items = [{ type: 'future' }, { type: 'PVP_DEFENSE' }, { type: 'totalOblivionPower' }, { type: 'ATTACK_SPEED' }];
    const snapshot = structuredClone(items);
    expect(orderStats(items, 'WARRIOR', (row) => row.type).map((row) => row.type))
      .toEqual(['ATTACK_SPEED', 'PVP_DEFENSE', 'future', 'totalOblivionPower']);
    expect(items).toEqual(snapshot);
    expect(orderStats(items, null)).toEqual(items);
  });

  it('labels Necromancer Fear without changing the underlying shared stat key', () => {
    expect(orderedStatLabel('totalDisruptionChance', 'Disruption', 'NECROMANCER')).toBe('Fear Chance');
    expect(orderedStatLabel('totalDisruptionChance', 'Disruption', 'MYSTIC')).toBe('Disruption');
  });
});
