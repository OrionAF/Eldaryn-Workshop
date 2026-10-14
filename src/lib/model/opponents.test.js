import { describe, it, expect } from 'vitest';
import {
  MAX_OPPONENTS,
  defaultOpponents,
  normaliseOpponent,
  normaliseOpponents,
  newOpponent,
  migrateOpponentsFromV1,
} from './opponents.js';
import { normaliseCharacter, newCharacter } from './index.js';

describe('normaliseOpponent', () => {
  it('turns junk into a valid empty opponent', () => {
    for (const raw of [null, undefined, 5, 'x', [], {}]) {
      const o = normaliseOpponent(raw);
      expect(o).toMatchObject({ name: 'Opponent', class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [], utility: null, ancient: null, majorGlyphs: [], altarTier: 1 });
      expect(o.sheet).toEqual({ values: {}, enteredAt: null });
      expect(o.id).toBeTruthy();
    }
  });

  it('derives the class from the spec and repairs a spec that belongs to another class', () => {
    expect(normaliseOpponent({ spec: 'SENTINEL_DISRUPTION' })).toMatchObject({ class: 'SENTINEL', spec: 'SENTINEL_DISRUPTION' });
    expect(normaliseOpponent({ class: 'MYSTIC', spec: 'WARRIOR_DPS' })).toMatchObject({ class: 'MYSTIC', spec: 'MYSTIC_MAGE' });
    expect(normaliseOpponent({ class: 'nonsense', spec: 'NECROMANCER_DOOMWEAVER' }).class).toBe('NECROMANCER');
  });

  it('keeps only known non-negative sheet keys', () => {
    const o = normaliseOpponent({ sheet: { values: { totalHp: 5000, totalAttack: -1, bogus: 3, totalCritChance: 'x' }, enteredAt: 'then' } });
    expect(o.sheet).toEqual({ values: { totalHp: 5000 }, enteredAt: 'then' });
  });

  it('drops sigils the class cannot use, dedupes, caps generics at three and clamps levels', () => {
    const o = normaliseOpponent({
      spec: 'WARRIOR_DPS',
      sigils: [
        { species: 'BERSERK_STANCE', level: 99 },
        { species: 'BERSERK_STANCE', level: 2 },
        { species: 'ARCANE_BURST', level: 5 }, // Mystic only
        { species: 'WARBORN_FURY', level: 0 },
        { species: 'CATACLYSM', level: 7 },
        { species: 'DEFENSE_STANCE', level: 7 },
      ],
      ancient: { species: 'FLAMEBORN', level: 9 },
      utility: { species: 'BONE_SERVANT', level: 3 }, // Necromancer utility; Warriors have no utility slot
    });
    expect(o.sigils.map((s) => s.species)).toEqual(['BERSERK_STANCE', 'WARBORN_FURY', 'CATACLYSM']);
    expect(o.sigils[0].level).toBe(30);
    expect(o.sigils[1].level).toBe(1);
    expect(o.ancient).toEqual({ species: 'FLAMEBORN', level: 1 }); // Ancients stay level 1
    expect(o.utility).toBeNull();
  });

  it('keeps a valid condition per equipped species and defaults the rest', () => {
    const o = normaliseOpponent({
      spec: 'WARRIOR_DPS',
      sigils: [{ species: 'BERSERK_STANCE', level: 5 }],
      conditions: { BERSERK_STANCE: 'NOT_A_CONDITION', CATACLYSM: 'ON_COOLDOWN' },
    });
    expect(o.conditions).toEqual({ BERSERK_STANCE: 'ON_COOLDOWN' });
  });

  it('keeps class-legal major glyphs only, at most two, deduped', () => {
    const o = normaliseOpponent({
      spec: 'WARRIOR_DPS',
      majorGlyphs: [
        { glyphType: 'sg-warborn-cd', rarity: 'Rare' },
        { glyphType: 'sg-warborn-cd', rarity: 'Epic' },
        { glyphType: 'no-such-glyph', rarity: 'Rare' },
        { glyphType: 'sg-warborn-cd', rarity: 'Mythic' },
      ],
    });
    expect(o.majorGlyphs).toEqual([{ glyphType: 'sg-warborn-cd', rarity: 'Rare' }]);
  });

  it('is idempotent', () => {
    const once = normaliseOpponent({
      name: '  Rival  ',
      spec: 'MYSTIC_DRUID',
      sheet: { values: { totalHp: 9000 } },
      sigils: [{ species: 'ARCANE_SURGE', level: 4 }],
      utility: { species: 'DIRE_URSINE', level: 4 },
      altarTier: 99,
    });
    expect(once.name).toBe('Rival');
    expect(once.altarTier).toBeLessThanOrEqual(8);
    expect(normaliseOpponent(once)).toEqual(once);
  });
});

describe('normaliseOpponents', () => {
  it('repairs duplicate ids, drops non-objects and caps the count', () => {
    const list = [{ id: 'a' }, { id: 'a' }, null, 7, ...Array.from({ length: 20 }, (_, i) => ({ id: `x${i}` }))];
    const { opponents } = normaliseOpponents({ opponents: list });
    expect(opponents.length).toBe(MAX_OPPONENTS);
    expect(new Set(opponents.map((o) => o.id)).size).toBe(MAX_OPPONENTS);
    expect(normaliseOpponents({ opponents: 'nope' })).toEqual(defaultOpponents());
  });

  it('survives a round trip through normaliseCharacter and v1 migration drops opponents', () => {
    const c = newCharacter('X', 'WARRIOR');
    c.opponents = [newOpponent('SENTINEL_MARKSMANSHIP', 'Archer')];
    c.opponents[0].sheet.values = { totalHp: 1234 };
    const again = normaliseCharacter(JSON.parse(JSON.stringify(c)));
    expect(again.opponents).toEqual(c.opponents);
    expect(migrateOpponentsFromV1({ opponents: [{ name: 'old' }] })).toEqual({ value: { opponents: [] }, idMap: {} });
  });
});
