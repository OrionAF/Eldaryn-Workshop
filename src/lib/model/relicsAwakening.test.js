import { describe, it, expect } from 'vitest';
import { normaliseRelics, migrateRelicsFromV1, reconcileRelics, relicStatAt, formatRelicStat } from './relics.js';
import { normaliseAwakening, migrateAwakeningFromV1, awakeningBundle, awakeningBonuses } from './awakening.js';
import { normaliseCharacter, migrateCharacterFromV1, newCharacter } from './index.js';
import { relicsForClass } from '../game/relics.js';

const war = relicsForClass('WARRIOR');
const myst = relicsForClass('MYSTIC');

describe('relics model', () => {
  it('keeps legal relics, clamps levels, drops other classes and zeros', () => {
    const raw = { relics: { [war[0].id]: 99, [war[1].id]: 0, [myst[0].id]: 3, nope: 2, [war[2].id]: 2.7 } };
    const { relics } = normaliseRelics(raw, { class: 'WARRIOR' });
    expect(relics).toEqual({ [war[0].id]: war[0].maxLevel, [war[2].id]: 2 });
  });
  it('is idempotent', () => {
    const once = normaliseRelics({ relics: { [war[0].id]: 4 } }, { class: 'WARRIOR' });
    expect(normaliseRelics(once, { class: 'WARRIOR' })).toEqual(once);
  });
  it('v1 Sentinel ids are renamed and idMap keeps preset relicIds', () => {
    const v1 = { class: 'Sentinel', relicLevels: { relic_iron_heart: 5 }, presets: [{ id: 'a', name: 'A', relicIds: ['relic_iron_heart', 'relic_war_charm'] }] };
    const { value, idMap } = migrateRelicsFromV1(v1);
    expect(value.relics).toEqual({ relic_falcons_eye: 5 });
    expect(idMap.relic_iron_heart).toBe('relic_falcons_eye');
    const c = migrateCharacterFromV1(v1);
    expect(c.presets[0].relicIds).toEqual(['relic_falcons_eye', 'relic_hunters_mark']);
  });
  it('v1 Warrior ids are kept; preset relicIds capped at 4', () => {
    const ids = war.slice(0, 6).map((r) => r.id);
    const v1 = { class: 'Warrior', relicLevels: { [ids[0]]: 2 }, presets: [{ id: 'a', relicIds: ids }, { id: 'b' }] };
    const c = migrateCharacterFromV1(v1);
    expect(c.relics).toEqual({ [ids[0]]: 2 });
    expect(c.presets[0].relicIds).toEqual(ids.slice(0, 4));
  });
  it('reconcile drops preset relics illegal for the class', () => {
    const c = newCharacter('t', 'WARRIOR');
    c.presets[0].relicIds = [war[0].id, myst[0].id];
    reconcileRelics(c);
    expect(c.presets[0].relicIds).toEqual([war[0].id]);
  });
  it('class change wipes relic levels via normaliseCharacter', () => {
    const c = newCharacter('t', 'WARRIOR');
    c.relics[war[0].id] = 3;
    c.presets[0].relicIds = [war[0].id];
    c.class = 'MYSTIC';
    const n = normaliseCharacter(JSON.parse(JSON.stringify(c)));
    expect(n.relics).toEqual({});
    expect(n.presets[0].relicIds).toEqual([]);
  });
  it('level scaling is linear and formatted per relics.md §7', () => {
    const b = { base: 6, max: 26 };
    expect(relicStatAt(b, 1, 10)).toBe(6);
    expect(relicStatAt(b, 10, 10)).toBe(26);
    expect(relicStatAt(b, 5, 10)).toBeCloseTo(6 + (20 * 4) / 9);
    expect(formatRelicStat('CRIT_DAMAGE', 0.4)).toBe('+40%');
    expect(formatRelicStat('ATTACK_SPEED', 0.08)).toBe('+0.08');
  });
});

describe('awakening model', () => {
  it('normalises path and clamps level to 15', () => {
    expect(normaliseAwakening({ awakening: { path: 'shadow', level: 99 } }).awakening).toEqual({ path: 'SHADOW', level: 15 });
    expect(normaliseAwakening({ awakening: { path: 'BOGUS', level: 5 } }).awakening).toEqual({ path: null, level: 0 });
    expect(normaliseAwakening({}).awakening).toEqual({ path: null, level: 0 });
  });
  it('migrates v1 points to level', () => {
    expect(migrateAwakeningFromV1({ awakening: { path: 'RADIANT', points: 7 } }).value.awakening).toEqual({ path: 'RADIANT', level: 7 });
  });
  it('override precedence spec > class > path', () => {
    expect(awakeningBundle('SHADOW', 'MYSTIC', 'MYSTIC_MAGE').source).toBe('spec');
    expect(awakeningBundle('SHADOW', 'NECROMANCER', null).source).toBe('class');
    expect(awakeningBundle('SHADOW', 'WARRIOR', null).source).toBe('path');
    expect(awakeningBundle('RADIANT', 'SENTINEL', null).source).toBe('class');
    expect(awakeningBonuses('SHADOW', 10, 'WARRIOR', null)).toEqual({ attackPercent: 20, critChanceFlat: 5, critDamageFlat: 20, penetrationFlat: 6 });
    expect(awakeningBonuses('SHADOW', 0, 'WARRIOR', null)).toEqual({});
  });
});
