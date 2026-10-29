import { describe, it, expect } from 'vitest';
import {
  GUIDE_SPECS, GUIDE_BANDS, expectedRoll, rollSteps, referenceCharacter, talentPointsAt, guideRanking, presetRanking,
  guideText, guideSpec, guideSpecLabel, runSpecGuide, calibrateTimeAlive, PRESSURE_ENEMY, TIME_ALIVE,
} from './specGuide.js';
import { SECONDARY_STAT_POOL, secondaryStatCount } from '../game/gear.js';
import { buildFighter } from '../build/fighter.js';
import { preparePveFighter } from '../engine/pve/fight.js';
import guide from '../../data/specGuide.json';

const def = (type) => SECONDARY_STAT_POOL.find((d) => d.type === type);

describe('roll sizes (gear.md §4: the mean of min + (ceiling - min) * random^2)', () => {
  it('is a third of the way from the minimum to the level ceiling', () => {
    // level 100: the ceiling is the table max
    expect(expectedRoll(def('ATTACK_PERCENT'), 100)).toBe(Number((1.8 + (14 - 1.8) / 3).toFixed(1)));
    expect(expectedRoll(def('ATTACK_SPEED'), 100)).toBe(Number((0.03 + (0.2 - 0.03) / 3).toFixed(2)));
    // level 0: the ceiling is half way
    expect(expectedRoll(def('CRIT_CHANCE'), 0)).toBe(Number((0.6 + (4.4 * 0.5) / 3).toFixed(1)));
  });

  it('probes only what a gear line can roll for the class: no flat Attack or Health, no other class\'s stats', () => {
    const war = rollSteps('WARRIOR', 80).map((s) => s.key);
    expect(war).not.toContain('totalAttack');
    expect(war).not.toContain('totalHp');
    expect(war).toContain('totalAttackPercent');
    expect(war.some((k) => k.startsWith('totalMinion'))).toBe(false);
    const necro = rollSteps('NECROMANCER', 80).map((s) => s.key);
    expect(necro).toContain('totalMinionAttack');
    for (const s of rollSteps('MYSTIC', 60)) expect(s.step).toBeGreaterThan(0);
  });
});

describe('reference builds', () => {
  it('every spec and band builds a valid character with gear of the band, spec talents and sigils', () => {
    for (const g of GUIDE_SPECS) {
      for (const b of GUIDE_BANDS) {
        const c = referenceCharacter(g, b.level);
        expect(c.level).toBe(b.level);
        const items = Object.values(c.equipment.set1.items).filter(Boolean);
        expect(items).toHaveLength(9);
        for (const it of items) {
          expect(it.rarity).toBe(b.rarity);
          expect(it.secondaryStats).toHaveLength(secondaryStatCount(b.rarity));
        }
        expect(c.talentSets[0].spec).toBe(g.spec);
        const spent = Object.values(c.talentSets[0].allocation).reduce((a, x) => a + x, 0);
        expect(spent).toBeLessThanOrEqual(talentPointsAt(b.level));
        expect(spent).toBeGreaterThan(0);
        const p = c.presets.find((x) => x.id === 'ref');
        expect(p.utilitySigilSpecies ?? null).toBe(g.utility !== undefined ? g.utility : p.utilitySigilSpecies ?? null);
        const f = buildFighter(c, 'ref');
        expect(f.stats.totalHp).toBeGreaterThan(0);
        expect(Number.isFinite(f.stats.totalAttack)).toBe(true);
      }
    }
  });

  it('labels a Druid by its form', () => {
    expect(guideSpecLabel(guideSpec('MYSTIC_DRUID_WOLF'))).toBe('Mystic · Druid (Wolf)');
    expect(guideSpecLabel(guideSpec('MYSTIC_MAGE'))).toBe('Mystic · Mage');
  });
});

describe('rankings', () => {
  const steps = [
    { key: 'a', step: 2, unit: '+2%', cap: null }, { key: 'b', step: 1, unit: '+1%', cap: null },
    { key: 'c', step: 1, unit: '+1%', cap: { soft: 50, hard: 90 } },
  ];
  const bar = (key, pct, measurable, delta = pct) => ({ key, label: key.toUpperCase(), pct, pctLo: pct - 0.1, pctHi: pct + 0.1, delta, measurable });

  it('puts the best measurable stat at 100, the rest relative to it; no clear effect has no score', () => {
    const rows = guideRanking([bar('b', 1, true), bar('a', 4, true), bar('c', 0.02, false)], steps);
    expect(rows.map((r) => [r.key, r.score])).toEqual([['a', 100], ['b', 25], ['c', null]]);
    expect(rows[2].cap).toEqual({ soft: 50, hard: 90 });
    expect(rows[0]).toMatchObject({ roll: 2, unit: '+2%', value: 4 });
  });

  it('a measurable loss scores nothing', () => {
    const rows = guideRanking([bar('a', 2, true), bar('b', -1, true)], steps);
    expect(rows.find((r) => r.key === 'b').score).toBeNull();
  });

  it('rescales a preset\'s Stat weights bars from their step to one roll', () => {
    const roll = rollSteps('WARRIOR', 80).find((s) => s.key === 'totalCritChance').step;
    const as = rollSteps('WARRIOR', 80).find((s) => s.key === 'totalAttackSpeed').step;
    const result = {
      damage: {
        bars: [
          { key: 'totalCritChance', label: 'Crit', pct: 1, pctLo: 0.9, pctHi: 1.1, delta: 100, measurable: true },
          { key: 'totalAttackSpeed', label: 'AS', pct: 8, pctLo: 7.9, pctHi: 8.1, delta: 800, measurable: true },
        ],
      },
    };
    const rows = presetRanking(result, 'WARRIOR', 80);
    const crit = rows.find((r) => r.key === 'totalCritChance');
    const speed = rows.find((r) => r.key === 'totalAttackSpeed');
    expect(crit.value).toBeCloseTo(1 * roll, 9); // step 1 point
    expect(speed.value).toBeCloseTo(8 * (as / 0.1), 9); // step 0.1
    expect(presetRanking({ damage: null }, 'WARRIOR', 80)).toBeNull();
  });
});

describe('time alive', () => {
  it('calibrates the pressure enemy into the band and the run gives both lists', async () => {
    const g = guideSpec('WARRIOR_DPS');
    const c = referenceCharacter(g, 40);
    const prepared = preparePveFighter(buildFighter(c, 'ref'));
    const cal = calibrateTimeAlive(prepared, c.level * 10);
    expect(cal.inBand).toBe(true);
    expect(cal.seconds).toBeGreaterThanOrEqual(TIME_ALIVE.band[0]);
    expect(cal.seconds).toBeLessThanOrEqual(TIME_ALIVE.band[1]);
    expect(PRESSURE_ENEMY.attackSpeed).toBe(10);

    const e = await runSpecGuide(g, 40, { precision: 'quick' });
    expect(e).toMatchObject({ id: 'WARRIOR_DPS', level: 40, cls: 'WARRIOR', spec: 'WARRIOR_DPS' });
    expect(e.damage.some((r) => r.score === 100)).toBe(true);
    expect(e.survival.length).toBeGreaterThan(0);
    expect(guideText(e)).toContain('Warrior · Arms, level 40');
  }, 60000);
});

describe('src/data/specGuide.json (npm run gen:spec-guide)', () => {
  it('has every spec at every band, ranked best first, the best at 100', () => {
    expect(guide.levels).toEqual(GUIDE_BANDS.map((b) => b.level));
    for (const g of GUIDE_SPECS) {
      for (const b of GUIDE_BANDS) {
        const e = guide.entries.find((x) => x.id === g.id && x.level === b.level);
        expect(e, `${g.id} L${b.level}`).toBeTruthy();
        expect(e.damage[0].score).toBe(100);
        for (const list of [e.damage, e.survival]) {
          const scores = list.map((r) => r.score ?? -1);
          expect([...scores].sort((x, y) => y - x)).toEqual(scores);
        }
      }
    }
  });

  it('was generated with the current roll sizes (re-run the generator when they change)', () => {
    for (const e of guide.entries) {
      const rolls = new Map(rollSteps(e.cls, e.level).map((s) => [s.key, s.step]));
      for (const r of [...e.damage, ...e.survival]) expect(r.roll, `${e.id} L${e.level} ${r.key}`).toBe(rolls.get(r.key));
    }
  });
});
