import { describe, it, expect } from 'vitest';
import { fixtureCharacter, FIXTURE_SPECS } from './fixtures.js';
import { buildPresetInputs, equippedStones } from './presetInputs.js';
import { computePresetStats } from './stats.js';
import { calculateTotalStats } from '../engine/pipeline/totals.js';
import { calculateFortressBonuses } from '../engine/sources/fortress.js';
import { newCharacter, normaliseCharacter } from '../model/index.js';

const CLASSES = ['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'];

describe('golden totals per class (fixture characters)', () => {
  for (const cls of CLASSES) {
    it(`${cls}: both presets and the Oblivion realm`, () => {
      const c = fixtureCharacter(cls);
      expect({
        p1: computePresetStats(c, 'p1').computed,
        p2: computePresetStats(c, 'p2').computed,
        oblivion: computePresetStats(c, 'p1', { realm: 'oblivion' }).computed,
      }).toMatchSnapshot();
    });
  }

  it('the Mage and Tank variants build too (spec drives talents, sigils and the board)', () => {
    expect(computePresetStats(fixtureCharacter('MYSTIC', { spec: 'MYSTIC_MAGE' }), 'p1').computed).toMatchSnapshot();
    expect(computePresetStats(fixtureCharacter('WARRIOR', { spec: 'WARRIOR_TANK' }), 'p1').computed).toMatchSnapshot();
  });
});

describe('persistence round trip', () => {
  it('a JSON round trip through normaliseCharacter leaves the totals unchanged', () => {
    for (const cls of CLASSES) {
      const c = fixtureCharacter(cls);
      const again = normaliseCharacter(JSON.parse(JSON.stringify(c)));
      expect(computePresetStats(again, 'p1').computed).toEqual(computePresetStats(c, 'p1').computed);
      expect(computePresetStats(again, 'p1', { realm: 'oblivion' }).computed).toEqual(
        computePresetStats(c, 'p1', { realm: 'oblivion' }).computed,
      );
    }
  });
});

describe('buildPresetInputs wiring', () => {
  const c = fixtureCharacter('WARRIOR');

  it('feeds the persisted base, the preset gear set and the right talents', () => {
    const inp = buildPresetInputs(c, 'p2');
    expect(inp.args[0]).toBe(c.baseResidual);
    expect(inp.setKey).toBe('set2');
    expect(inp.args[1]).toBe(c.equipment.set2.items);
    expect(inp.spec).toBe('WARRIOR_TANK');
    expect(inp.args[7]).toBeUndefined(); // a7 is never populated
  });

  it('converts pet Attack Speed and Crit Damage from percent points to multipliers', () => {
    const pet = buildPresetInputs(c, 'p1').args[3];
    // level 30: x(1 + 29 * 0.02) = 1.58; stored 8 and 20 percent points
    expect(pet.attackSpeed).toBeCloseTo(0.08 * 1.58, 2);
    expect(pet.critDamage).toBeCloseTo(0.2 * 1.58, 2);
    expect(pet.attackPercent).toBeCloseTo(12.5 * 1.58, 2);
    expect(pet.flatAttack).toBeGreaterThan(0);
  });

  it('a preset without a pet or mount gets zero bundles', () => {
    const [, , , pet, , , , , , , mounts] = buildPresetInputs(c, 'p2').args;
    expect(pet.flatAttack).toBe(0);
    expect(mounts.attackPercent).toBe(0);
  });

  it('the ridden mount feeds the percent buckets and its minor glyph secondaries', () => {
    const mounts = buildPresetInputs(c, 'p1').args[10];
    // level 3: factor 1.2, base 7 -> round(8.4) = 8 on both buckets, plus the Keen glyph's attackPercent
    expect(mounts.hpPercent).toBe(8);
    expect(mounts.attackPercent).toBeGreaterThan(8);
    expect(mounts.critChance).toBeGreaterThan(0);
  });

  it('relics ride in the stones argument; stones come only from the set sockets', () => {
    const stones = buildPresetInputs(c, 'p1').args[5];
    const noRelics = fixtureCharacter('WARRIOR');
    noRelics.presets[0].relicIds = [];
    const bare = buildPresetInputs(noRelics, 'p1').args[5];
    const sum = (b) => Object.values(b).reduce((s, v) => s + v, 0);
    expect(sum(stones)).toBeGreaterThan(sum(bare));
    expect(equippedStones(c, 'set1').map((s) => s.id).sort()).toEqual(['st-atk', 'st-atk2', 'st-def']);
    expect(equippedStones(c, 'set2').map((s) => s.id)).toEqual(['st-atk']);
  });

  it('fortress groups map to catalogue ids, each group once', () => {
    const f = buildPresetInputs(c, 'p1').args[8];
    expect(f).toEqual(calculateFortressBonuses(['TOP_1', 'CORE'], 'WARRIOR'));
    expect(f.attackPercent + f.hpPercent).toBeGreaterThan(0);
  });

  it('transcendence falls back to the default preset when the link is null', () => {
    const t1 = buildPresetInputs(c, 'p1').args[9];
    const t2 = buildPresetInputs(c, 'p2').args[9]; // p2.transcendencePresetId is null
    expect(t2).toEqual(t1);
    expect(Object.values(t1).some((v) => v > 0)).toBe(true);
  });

  it('the Oblivion realm swaps in the Oblivion set and pool, keeping the rest of the preset', () => {
    const inp = buildPresetInputs(c, 'p1', { realm: 'oblivion' });
    expect(inp.setKey).toBe('oblivion');
    expect(Object.keys(inp.args[1])).toHaveLength(12);
    const base = buildPresetInputs(c, 'p1');
    expect(inp.args[2]).toEqual(base.args[2]); // talents unchanged
    expect(inp.args[3]).toEqual(base.args[3]); // pet unchanged
    const stats = computePresetStats(c, 'p1', { realm: 'oblivion' }).computed;
    // quality 80 -> round(8 + 22 * 79 / 99) = 26, grade 3 -> x1.5^2
    expect(stats.totalOblivionPower).toBe(Math.round(26 * 2.25));
    expect(computePresetStats(c, 'p1').computed.totalOblivionPower).toBe(0);
  });

  it('a Druid with a Form sigil passes its formConfig; a Mage and other classes pass none', () => {
    const druid = fixtureCharacter('MYSTIC');
    const inp = buildPresetInputs(druid, 'p1');
    expect(inp.ctx.formConfig.form).toBe('BEAR');
    expect(inp.formKind).toBe('BEAR');
    const stats = calculateTotalStats(...inp.args, inp.ctx);
    expect(stats.disruptionEffect).toBe('STAGGER');
    expect(buildPresetInputs(fixtureCharacter('MYSTIC', { spec: 'MYSTIC_MAGE' }), 'p1').ctx.formConfig).toBeNull();
    expect(buildPresetInputs(c, 'p1').ctx.formConfig).toBeNull();
  });

  it('unowned relics add nothing', () => {
    const x = fixtureCharacter('WARRIOR');
    x.relics = {};
    const none = buildPresetInputs(x, 'p1').args[5];
    expect(Object.values(none).reduce((s, v) => s + v, 0)).toBeLessThan(
      Object.values(buildPresetInputs(c, 'p1').args[5]).reduce((s, v) => s + v, 0),
    );
  });
});

describe('computePresetStats', () => {
  it('equals calculateTotalStats on the built inputs and defaults to the active preset', () => {
    const c = fixtureCharacter('SENTINEL');
    const inp = buildPresetInputs(c, 'p1');
    const direct = calculateTotalStats(...inp.args, inp.ctx);
    const r = computePresetStats(c);
    expect(r.computed).toEqual(direct);
    expect(r.effective).toEqual(direct);
    expect(r.source).toBe('computed');
    expect(r.sheet).toBeNull();
    expect(r.residual).toEqual({});
    expect(r.spec).toBe(FIXTURE_SPECS.SENTINEL);
  });

  it('the Necromancer Dominion comes from the pipeline and counts talents + transcendence + 1', () => {
    const r = computePresetStats(fixtureCharacter('NECROMANCER'), 'p1');
    expect(r.computed.totalDominion).toBeGreaterThanOrEqual(1);
    expect(computePresetStats(fixtureCharacter('WARRIOR'), 'p1').computed.totalDominion).toBe(0);
  });

  it('a user sheet is used verbatim; Dominion stays derived; computed raw keys the sheet omits are dropped', () => {
    const c = fixtureCharacter('NECROMANCER');
    const comp = computePresetStats(c, 'p1').computed;
    c.presets[0].sheet = { values: { totalAttack: 200000, totalHp: 900000, totalCritDamage: 3.1, totalDominion: 99, bogus: 1 }, enteredAt: 'x' };
    const r = computePresetStats(c, 'p1');
    expect(r.source).toBe('sheet');
    expect(r.effective.totalAttack).toBe(200000);
    expect(r.effective.totalCritDamage).toBe(3.1);
    expect(r.effective.totalDominion).toBe(comp.totalDominion);
    expect(r.effective.rawCritDamage).toBeUndefined();
    expect(r.effective.totalAttackSpeed).toBe(comp.totalAttackSpeed); // keys the sheet lacks fall back to computed
    expect(r.effective.disruptionEffect).toBe(comp.disruptionEffect);
    expect(r.sheet.values.bogus).toBeUndefined();
    expect(r.computed).toEqual(comp);
    expect(r.residual.totalAttack).toBe(200000 - comp.totalAttack);
    expect(r.residual.totalDominion).toBeUndefined();
  });

  it('the Oblivion realm reads oblivion.sheet, not the preset sheet', () => {
    const c = fixtureCharacter('WARRIOR');
    c.presets[0].sheet = { values: { totalAttack: 1 }, enteredAt: null };
    c.oblivion.sheet = { values: { totalAttack: 300000 }, enteredAt: null };
    expect(computePresetStats(c, 'p1').effective.totalAttack).toBe(1);
    expect(computePresetStats(c, 'p1', { realm: 'oblivion' }).effective.totalAttack).toBe(300000);
  });

  it('survives an empty character (no class, no spec, no pieces)', () => {
    for (const cls of [null, 'WARRIOR', 'MYSTIC', 'NECROMANCER']) {
      const r = computePresetStats(newCharacter('Empty', cls));
      expect(r.computed.totalAttack).toBeGreaterThan(0);
    }
  });
});
