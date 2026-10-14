import { describe, it, expect } from 'vitest';
import {
  makeMob, chapterMobs, chapterLevels, hardInfluence, hardChapterVariant, dungeonSteps, dungeonMobs,
  oblivionFloorMob, oblivionInstability, oblivionEffectiveInstability, worldBossMob,
  worldBossAffinityForCycle, worldBossAffinityAt, isWorldBossActive, CHAPTER_COUNT,
} from './enemies.js';
import { PVE_CHAPTERS, PVE_HARD_CHAPTERS, PVE_HARD_LEVEL_MULTIPLIERS } from '../../game/combatPve.js';
import { OBLIVION_FLOORS } from '../../game/pveContent.js';
import { createMobEntity } from '../core/entity.js';

describe('campaign', () => {
  it('rebuilds every normal and hard level exactly as the catalogue lists it', () => {
    expect(CHAPTER_COUNT).toBe(22);
    for (const ch of [...PVE_CHAPTERS, ...PVE_HARD_CHAPTERS]) {
      for (const lv of ch.levels) {
        const got = chapterMobs(ch.chapter, lv.level);
        expect(got).toHaveLength(3);
        got.forEach((m, i) => {
          const want = lv.mobs[i];
          expect([m.id, m.name, m.hp, m.attack, m.attackSpeed, m.penetration])
            .toEqual([want.id, want.name, want.hp, want.attack, want.attackSpeed, want.penetration]);
        });
      }
    }
  });
  it('hard variants and influence match the catalogue', () => {
    PVE_HARD_CHAPTERS.forEach((h, idx) => {
      const base = PVE_CHAPTERS.find((c) => c.chapter === h.basedOnChapter);
      expect(hardChapterVariant(base.mobTemplates, h)).toEqual(h.mobTemplates);
      expect(hardInfluence(idx)).toEqual(h.levels.map((l) => l.influenceReward));
      expect(h.levels.map((l) => l.levelMultiplier)).toEqual(PVE_HARD_LEVEL_MULTIPLIERS);
    });
  });
  it('makeMob, bounds, entity compatibility', () => {
    expect(makeMob({ id: 'x', name: 'X', baseHp: 60, baseAtk: 5, baseSpd: 1.3 }, 1.1))
      .toEqual({ id: 'x', name: 'X', hp: 132, attack: 11, attackSpeed: 1.3 });
    expect(chapterMobs(0, 1)).toBeNull();
    expect(chapterMobs(1, 11)).toBeNull();
    expect(chapterLevels(12)).toHaveLength(10);
    const e = createMobEntity(chapterMobs(12, 1)[0]);
    expect(e.penetration).toBe(50);
    expect(e.hp).toBe(36480000);
  });
});

describe('classic dungeons', () => {
  it('8 steps of 3 mobs; step 8 is the last three roster entries', () => {
    const steps = dungeonSteps('dungeon_1');
    expect(steps).toHaveLength(8);
    expect(steps[0].mobs.map((m) => m.name)).toEqual(['Giant Rat', 'Sewer Slime', 'Sewer Crocodile']);
    expect(steps[0].mobs[0].hp).toBe(1000);
    expect(steps[1].mobs.map((m) => m.name)).toEqual(['Cave Troll', 'Giant Rat', 'Sewer Slime']);
    expect(steps[7].mobs.map((m) => m.name)).toEqual(['Sewer Crocodile', 'Cave Troll', 'Mine Wraith']);
    expect(steps[7].mobs[2].hp).toBe(48000);
    expect(steps[7].coins).toBe(105);
    expect(dungeonMobs('dungeon_7', 8)).toHaveLength(3);
    expect(dungeonSteps('nope')).toBeNull();
  });
});

describe('oblivion', () => {
  it('table floors and closed form agree', () => {
    for (const f of OBLIVION_FLOORS) {
      const m = oblivionFloorMob(f.floor);
      expect(Math.abs(m.hp - Math.round(20000000 * 1.13 ** (f.floor - 1))) / m.hp).toBeLessThan(1e-6);
      // Table rounds .5 to even (floors 9,10,17,18...); the client's Math.round rounds up.
      expect(m.instability - f.instability).toBeGreaterThanOrEqual(0);
      expect(m.instability - f.instability).toBeLessThanOrEqual(1);
    }
  });
  it('floor 10: power cancels instability; beyond 60 extrapolates', () => {
    const m = oblivionFloorMob(10);
    expect([m.attackSpeed, m.blockChance, m.penetration]).toEqual([1, 20, 12]);
    expect(m.instability).toBe(171);
    expect(oblivionEffectiveInstability(m.instability, 171)).toBe(0);
    expect(oblivionEffectiveInstability(m.instability, 100)).toBe(71);
    expect(oblivionFloorMob(61).hp).toBeGreaterThan(oblivionFloorMob(60).hp);
    expect(oblivionFloorMob(0)).toBeNull();
    expect(createMobEntity(m).blockChance).toBe(20);
  });
});

describe('world boss', () => {
  it('affinity cycle', () => {
    expect(['NONE', 'FORTIFIED', 'ENRAGED']).toContain(worldBossAffinityForCycle(0));
    expect(worldBossAffinityForCycle(40)).toBe('ENRAGED');
    for (let c = 1; c < 80; c++) {
      if (c === 40 || c === 41) continue;
      expect(worldBossAffinityForCycle(c)).not.toBe(worldBossAffinityForCycle(c - 1));
    }
    expect(worldBossAffinityForCycle(-5)).toBe(worldBossAffinityForCycle(0));
  });
  it('season clock', () => {
    const anchor = 1768953600000;
    expect(isWorldBossActive(anchor)).toBe(true);
    expect(isWorldBossActive(anchor + 3 * 86400000)).toBe(false);
    expect(worldBossAffinityAt(anchor + 3 * 86400000)).toBe(worldBossAffinityForCycle(1));
  });
  it('mob per affinity', () => {
    const n = worldBossMob('NONE');
    expect([n.hp, n.blockChance, n.fightDurationMs]).toEqual([20000000000, 0, 60000]);
    const f = worldBossMob('FORTIFIED');
    expect([f.blockChance, f.stats.spellResist]).toEqual([80, 30]);
    const e = worldBossMob('ENRAGED');
    expect([e.attackSpeed, e.fightDurationMs, e.affinity.lethal]).toEqual([1, 300000, true]);
    expect(worldBossMob('x')).toBeNull();
    expect(createMobEntity(f).blockChance).toBe(80);
  });
});
