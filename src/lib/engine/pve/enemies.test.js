import { describe, it, expect } from 'vitest';
import {
  makeMob, chapterMobs, chapterLevels, hardInfluence, hardChapterVariant, dungeonSteps, dungeonMobs, raidSteps, raidMobs,
  oblivionFloorMob, oblivionInstability, oblivionEffectiveInstability, worldBossMob,
  worldBossAffinityForCycle, worldBossAffinityAt, isWorldBossActive, CHAPTER_COUNT,
} from './enemies.js';
import { PVE_CHAPTERS, PVE_HARD_CHAPTERS, PVE_HARD_LEVEL_MULTIPLIERS } from '../../game/combatPve.js';
import { RAIDS } from '../../game/fortress.js';
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

describe('village raids', () => {
  it('raid_1 step 1: roster [0..4] x 1.8 (buildBanditVillageSteps L1064959, makeRaidMob L1064597)', () => {
    const m = raidMobs('raid_1', 1);
    expect(m.map((x) => x.name)).toEqual(['Villager', 'Militia', 'Bowman', 'Healer', 'Guard Captain']);
    expect(m.map((x) => x.hp)).toEqual([4500, 6300, 3600, 3960, 9000]);
    expect(m.map((x) => x.attack)).toEqual([126, 162, 198, 144, 234]);
    expect(m.map((x) => x.attackSpeed)).toEqual([0.8, 0.7, 1.1, 0.6, 0.5]);
  });
  it('raid_1 step 8 uses roster [1..5] x 3.9 so the Village Elder appears', () => {
    const m = raidMobs('raid_1', 8);
    expect(m.map((x) => x.id)).toEqual(['militia', 'bowman', 'healer', 'guard_captain', 'village_elder']);
    expect(m.map((x) => x.hp)).toEqual([13650, 7800, 8580, 19500, 27300]);
    expect(m[4].attack).toBe(624);
  });
  it('raid_2 rotates by k=2 (step 2 starts at index 2) with the x5.8 multiplier', () => {
    const m = raidSteps('raid_2')[1];
    expect(m.multiplier).toBe(5.8);
    expect(m.mobs).toHaveLength(5);
    expect(m.mobs[0].hp).toBe(Math.round(RAIDS[1].roster[2].baseHp * 5.8));
  });
  it('rebuilds every step of every raid exactly as the extracted table lists it', () => {
    expect(RAIDS).toHaveLength(5);
    for (const raid of RAIDS) {
      const steps = raidSteps(raid.id);
      expect(steps).toHaveLength(8);
      for (const st of steps) {
        const want = raid.steps[st.step - 1];
        expect(st.mobs.map((x) => x.id)).toEqual(want.mobIds);
        expect(st.mobs.map((x) => x.hp)).toEqual(want.mobHp);
        expect(st.mobs.map((x) => x.attack)).toEqual(want.mobAttack);
      }
    }
  });
  it('unknown raid or step is null', () => {
    expect(raidSteps('nope')).toBeNull();
    expect(raidMobs('raid_1', 9)).toBeNull();
  });
});

// Client literals transcribed from decompiled.js L1062720-1062803 (rosters) and L1062838-1062916
// (step multipliers, coins), rebuilt with an independent copy of buildSteps/makeMob/hardVariant
// (L1062174-1062526) so both the catalogue and the port are checked against the client.
const R = (id, name, baseHp, baseAtk, baseSpd, blockChance, penetration) =>
  ({ id, name, baseHp, baseAtk, baseSpd, blockChance, penetration });
const CLIENT_DUNGEONS = [
  [[1, 1.2, 2, 3.2, 4.4, 6.4, 7.8, 9.6], [45, 60, 78, 86, 90, 95, 100, 105], [
    R('mine_rat', 'Giant Rat', 1000, 60, 1.3), R('mine_slime', 'Sewer Slime', 1400, 80, 1),
    R('mine_croc', 'Sewer Crocodile', 2000, 100, 0.8), R('mine_troll', 'Cave Troll', 3000, 130, 0.5),
    R('mine_boss', 'Mine Wraith', 5000, 110, 0.7)]],
  [[4.2, 4.6, 5.2, 5.6, 6.2, 6.8, 7.2, 7.6], [110, 120, 130, 138, 146, 155, 164, 174], [
    R('ruins_ghoul', 'Crypt Ghoul', 10100, 430, 1.2), R('ruins_skeleton', 'Skeleton', 14200, 630, 0.9),
    R('ruins_wolf', 'Dire Wolf', 16600, 860, 0.7), R('ruins_golem', 'Stone Golem', 22300, 1020, 0.6),
    R('ruins_boss', 'Ruin Drake', 28000, 1600, 0.8)]],
  [[1.6, 1.8, 2, 2.8, 3.4, 4, 4.2, 4.4], [180, 195, 210, 228, 245, 260, 276, 295], [
    R('cata_skeleton', 'Frost Skeleton', 53200, 4620, 1, 5, 6), R('cata_witch', 'Ice Witch', 80200, 3400, 1.1, 5, 6),
    R('cata_revenant', 'Frozen Revenant', 102000, 5600, 0.8, 5, 6),
    R('cata_beast', 'Glacial Beast', 164000, 7800, 0.5, 5, 6), R('cata_boss', 'Ice Lich', 204000, 12300, 0.8, 5, 8)]],
  [[1, 1.4, 2, 2.8, 3.8, 5.2, 5.8, 6.2], [320, 360, 400, 450, 500, 530, 600, 620], [
    R('temple_drake', 'Fire Drake', 480000, 32000, 1.1, 10, 10),
    R('temple_demon', 'Infernal Demon', 680000, 42000, 0.9, 10, 10),
    R('temple_sentinel', 'Obsidian Sentinel', 900000, 30000, 0.6, 10, 10),
    R('temple_colossus', 'Iron Colossus', 1100000, 50000, 0.4, 10, 10),
    R('temple_boss', 'Elder Dragon', 1400000, 63000, 0.7, 10, 12)]],
  [[1, 1.4, 1.9, 2.5, 3, 3.4, 4, 5.1], [640, 720, 800, 900, 1000, 1100, 1200, 1300], [
    R('rift_stalker', 'Abyss Stalker', 6000000, 240000, 1.1, 15, 32),
    R('rift_wraith', 'Rift Wraith', 7000000, 340000, 0.9, 15, 32),
    R('rift_challenger', 'Rift Challenger', 8500000, 280000, 0.6, 15, 32),
    R('rift_devourer', 'Void Devourer', 10500000, 400000, 0.4, 15, 32),
    R('rift_warden', 'Crystal Warden', 13000000, 320000, 0.5, 15, 32),
    R('rift_boss', "Zar'keth", 19000000, 700000, 0.7, 15, 32)]],
  [[1, 1.3, 1.7, 2.2, 2.4, 3, 3.4, 4], [1400, 1500, 1600, 1750, 1900, 2050, 2200, 2400], [
    R('divine_warden', 'Sanctum Warden', 28600000, 231000, 0.7, 18, 40),
    R('divine_stalker', 'Halo Stalker', 36400000, 275000, 1.3, 18, 40),
    R('divine_seer', 'Radiant Seer', 45500000, 248000, 1, 18, 40),
    R('divine_archon', 'Crystal Archon', 57200000, 311000, 0.9, 18, 40),
    R('divine_devourer', 'Seraphic Devourer', 71500000, 337000, 0.6, 18, 40),
    R('divine_boss', 'Empyrean Gatekeeper', 97500000, 578000, 0.9, 18, 44)]],
  [[1, 1.35, 1.75, 2.2, 2.7, 3.2, 3.8, 4.4], [2450, 2530, 2610, 2690, 2765, 2845, 2925, 3000], [
    R('chrono_wraith', 'Chrono Wraith', 52000000, 358000, 1.5, 20, 48),
    R('chrono_harbinger', 'Paradox Harbinger', 65000000, 413000, 1.35, 20, 48),
    R('chrono_sear', 'Fractured Sear', 80600000, 495000, 1, 20, 48),
    R('chrono_sentinel', 'Timeworn Sentinel', 123500000, 715000, 0.5, 20, 48),
    R('chrono_colossus', 'Eonbound Colossus', 156000000, 853000, 0.4, 20, 48),
    R('chrono_boss', 'Kairon, the Timeless', 208000000, 660000, 0.85, 20, 52)]],
];
const CLIENT_HARD_CFG = [[216000, 63000, 20, 50, 0], [46500, 17800, 21, 52, 0], [16100, 4670, 22, 54, 30],
  [3690, 1320, 23, 56, 30], [707, 325, 24, 58, 30], [275, 625, 25, 60, 30], [308, 604, 26, 62, 30]]
  .map(([hpScale, atkScale, blockChance, penetration, damageReduction]) =>
    ({ hpScale, atkScale, blockChance, penetration, damageReduction }));
const CLIENT_HARD_LADDER = [1, 1.09, 1.19, 1.3, 1.42, 1.55, 1.69, 2.05];
const CLIENT_SHARE = [[0.5, 0.85], [0.5, 0.85], [0.5, 0.55], [1, 0.55], [1, 0.65]];

const clientMob = (r, m) => {
  const o = { id: r.id, name: r.name, hp: Math.round(r.baseHp * m), attack: Math.round(r.baseAtk * m),
    attackSpeed: r.baseSpd };
  if (r.blockChance != null) o.blockChance = r.blockChance;
  if (r.penetration != null) o.penetration = r.penetration;
  if (r.damageReduction != null) o.damageReduction = r.damageReduction;
  return o;
};
const clientSteps = (roster, mults, coins) => Array.from({ length: 8 }, (_, i) => {
  const m = mults[i] ?? 1;
  const n = roster.length - 1;
  const idx = i + 1 !== 8 ? [(3 * i) % n, (3 * i + 1) % n, (3 * i + 2) % n] : [n - 2, n - 1, n];
  return { mobs: idx.map((j) => clientMob(roster[j], m)), coins: coins[i] ?? 10 };
});
const clientHard = (roster, cfg, k) => {
  const last = roster.length - 1;
  const prev = roster.slice(Math.max(0, last - 2), last).map((r) => r.baseAtk);
  const cap = prev.length > 0 ? Math.max(...prev) * 1.05 : Infinity;
  const hpS = CLIENT_SHARE[k]?.[0] ?? 1;
  const atkS = CLIENT_SHARE[k]?.[1] ?? 1;
  const dr = 1 - cfg.damageReduction / 100;
  return roster.map((r, i) => ({
    ...r, id: `${r.id}_hard`,
    baseHp: Math.round(r.baseHp * cfg.hpScale * hpS * dr),
    baseAtk: Math.round((i !== last ? r.baseAtk : Math.min(r.baseAtk, cap)) * cfg.atkScale * atkS / 1.25),
    baseSpd: parseFloat((r.baseSpd * 1.25).toFixed(3)),
    blockChance: cfg.blockChance,
    penetration: i !== last ? cfg.penetration : cfg.penetration + 4,
    damageReduction: cfg.damageReduction,
  }));
};
const pick = (m) => [m.id, m.name, m.hp, m.attack, m.attackSpeed, m.blockChance, m.penetration, m.damageReduction];

describe('classic dungeons: client roster parity (D1)', () => {
  it('dungeon_7 step 8 carries block 20 and penetration 48/48/52', () => {
    const mobs = dungeonMobs('dungeon_7', 8);
    expect(mobs.map((m) => m.blockChance)).toEqual([20, 20, 20]);
    expect(mobs.map((m) => m.penetration)).toEqual([48, 48, 52]);
    expect(mobs.map((m) => m.id)).toEqual(['chrono_sentinel', 'chrono_colossus', 'chrono_boss']);
  });
  it('every normal dungeon 1-7 x step 1-8 matches the client table', () => {
    CLIENT_DUNGEONS.forEach(([mults, coins, roster], k) => {
      const want = clientSteps(roster, mults, coins);
      const got = dungeonSteps(`dungeon_${k + 1}`);
      expect(got).toHaveLength(8);
      got.forEach((s, i) => {
        expect(s.coins).toBe(want[i].coins);
        expect(s.mobs.map(pick)).toEqual(want[i].mobs.map(pick));
      });
    });
  });
  it('every hard dungeon 1-7 x step 1-8 matches the client hardVariant', () => {
    CLIENT_DUNGEONS.forEach(([, , roster], k) => {
      const coins = Array.from({ length: 8 }, (_, i) => 3010 + 10 * (8 * k + i));
      const want = clientSteps(clientHard(roster, CLIENT_HARD_CFG[k], k), CLIENT_HARD_LADDER, coins);
      const got = dungeonSteps(`dungeon_${k + 1}_hard`);
      expect(got).toHaveLength(8);
      got.forEach((s, i) => {
        expect(s.coins).toBe(want[i].coins);
        expect(s.multiplier).toBe(CLIENT_HARD_LADDER[i]);
        expect(s.mobs.map(pick)).toEqual(want[i].mobs.map(pick));
      });
    });
  });
  it('pins dungeon_1_hard step 1 and dungeon_7_hard step 8', () => {
    expect(pick(dungeonMobs('dungeon_1_hard', 1)[0]))
      .toEqual(['mine_rat_hard', 'Giant Rat', 108000000, 2570400, 1.625, 20, 50, 0]);
    expect(pick(dungeonMobs('dungeon_7_hard', 8)[2]))
      .toEqual(['chrono_boss_hard', 'Kairon, the Timeless', 91931840000, 653769600, 1.063, 26, 66, 30]);
    // boss attack cap = 1.05 x max(two roster entries before the boss): dungeon_1's Mine Wraith (110)
    // is under it; dungeon_2's Ruin Drake (1600) is capped to 1.05 x 1020
    expect(dungeonMobs('dungeon_1_hard', 8)[2].attack).toBe(Math.round(Math.round(110 * 63000 * 0.85 / 1.25) * 2.05));
    expect(dungeonMobs('dungeon_2_hard', 8)[2].attack)
      .toBe(Math.round(Math.round(1020 * 1.05 * 17800 * 0.85 / 1.25) * 2.05));
    expect(dungeonSteps('dungeon_8_hard')).toBeNull();
    expect(dungeonSteps('dungeon_1_hard_hard')).toBeNull();
  });
  it('the DR reaches the mob entity', () => {
    expect(createMobEntity(dungeonMobs('dungeon_3_hard', 1)[0]).damageReduction).toBe(30);
  });
});

describe('mode stamping (D1)', () => {
  it('each enemy builder stamps the fight mode on its mobs', () => {
    expect(chapterMobs(1, 1).map((m) => m.mode)).toEqual(['campaign', 'campaign', 'campaign']);
    expect(chapterMobs(12, 1)[0].mode).toBe('campaign');
    expect(dungeonMobs('dungeon_1', 1).every((m) => m.mode === 'dungeon')).toBe(true);
    expect(dungeonMobs('dungeon_1_hard', 1).every((m) => m.mode === 'dungeon')).toBe(true);
    expect(raidMobs(RAIDS[0].id, 1).every((m) => m.mode === 'raid')).toBe(true);
    expect(oblivionFloorMob(5).mode).toBe('oblivion');
    expect(worldBossMob('ENRAGED').mode).toBe('worldBoss');
  });
});
