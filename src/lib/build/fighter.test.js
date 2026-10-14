import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { buildFighter } from './fighter.js';
import { computePresetStats } from './stats.js';
import { newCharacter } from '../model/index.js';

const CLASSES = ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'];

describe('buildFighter', () => {
  for (const cls of CLASSES) {
    it(`${cls}: stats are the effective sheet and the sigil config is complete`, () => {
      const c = fixtureCharacter(cls);
      const f = buildFighter(c, 'p1');
      expect(f.class).toBe(cls);
      expect(f.level).toBe(100);
      expect(f.stats).toEqual(computePresetStats(c, 'p1').effective);
      expect(f.sigils).toHaveLength(3);
      expect(f.sigils.every((s) => s.level === 12)).toBe(true);
      expect(Object.keys(f.conditions).sort()).toEqual(
        [...f.sigils, f.utility, f.ancient].filter(Boolean).map((s) => s.species).sort(),
      );
      expect(f.altarTier).toBe(2);
      expect(f.presetId).toBe('p1');
      expect(f.realm).toBe('base');
    });
  }

  it('is plain data: survives a structured clone unchanged (worker boundary)', () => {
    for (const cls of CLASSES) {
      const f = buildFighter(fixtureCharacter(cls), 'p1');
      expect(structuredClone(f)).toEqual(f);
      expect(JSON.parse(JSON.stringify(f))).toEqual(f);
    }
  });

  it('Warrior: ancient and glyphMods; utility is empty', () => {
    const f = buildFighter(fixtureCharacter('WARRIOR'), 'p1');
    expect(f.ancient).toEqual({ species: 'FLAMEBORN', level: 1 });
    expect(f.utility).toBeNull();
    expect(f.glyphMods).toEqual([{ glyphType: 'sg-warborn-cd', rarity: 'Rare' }]);
    expect(f.formKind).toBeNull();
  });

  it('a major glyph is inert when its sigil is not equipped', () => {
    const c = fixtureCharacter('WARRIOR');
    c.presets[0].sigilSpecies = ['BERSERK_STANCE', 'CATACLYSM']; // WARBORN_FURY dropped
    expect(buildFighter(c, 'p1').glyphMods).toEqual([]);
  });

  it('no mount means no glyph mods', () => {
    expect(buildFighter(fixtureCharacter('WARRIOR'), 'p2').glyphMods).toEqual([]);
  });

  it('Druid: the Form sigil gives formKind and formConfig; the stats use the form multipliers', () => {
    const f = buildFighter(fixtureCharacter('MYSTIC'), 'p1');
    expect(f.utility).toEqual({ species: 'DIRE_URSINE', level: 1 }); // Form sigils stay at level 1 (M1)
    expect(f.formKind).toBe('BEAR');
    expect(f.formConfig.gearHpMult).toBe(1.6);
    expect(f.stats.disruptionEffect).toBe('STAGGER');
    const mage = buildFighter(fixtureCharacter('MYSTIC', { spec: 'MYSTIC_MAGE' }), 'p1');
    expect(mage.formKind).toBeNull();
    expect(mage.utility.species).toBe('ARCANE_BARRIER');
  });

  it('Necromancer: the Summon utility sigil and the pipeline Dominion', () => {
    const f = buildFighter(fixtureCharacter('NECROMANCER'), 'p1');
    expect(f.utility.species).toBe('BONE_SERVANT');
    expect(f.stats.totalDominion).toBeGreaterThanOrEqual(1);
  });

  it('sigil activation conditions apply from character level 54 only', () => {
    const c = fixtureCharacter('WARRIOR');
    c.sigils.owned.CATACLYSM.condition = 'ENEMY_HP_BELOW_40';
    expect(buildFighter(c, 'p1').conditions.CATACLYSM).toBe('ENEMY_HP_BELOW_40');
    expect(buildFighter(c, 'p1').conditions.BERSERK_STANCE).toBe('ON_COOLDOWN');
    c.level = 50;
    expect(buildFighter(c, 'p1').conditions.CATACLYSM).toBe('ON_COOLDOWN');
  });

  it('sheet stats win; the Oblivion realm uses the Oblivion sheet', () => {
    const c = fixtureCharacter('SENTINEL');
    c.presets[0].sheet = { values: { totalAttack: 123456 }, enteredAt: null };
    const f = buildFighter(c, 'p1');
    expect(f.stats.totalAttack).toBe(123456);
    expect(f.source).toBe('sheet');
    const o = buildFighter(c, 'p1', { realm: 'oblivion' });
    expect(o.realm).toBe('oblivion');
    expect(o.source).toBe('computed');
    expect(o.stats.totalOblivionPower).toBeGreaterThan(0);
  });

  it('builds for a bare character (no pieces, no spec)', () => {
    const f = buildFighter(newCharacter('Bare', 'WARRIOR'));
    expect(f.sigils).toEqual([]);
    expect(f.spec).toBeNull();
    expect(f.glyphMods).toEqual([]);
    expect(f.stats.totalAttack).toBeGreaterThan(0);
  });
});
