import { describe, it, expect } from 'vitest';
import { PVE_CHAPTERS, PVE_HARD_CHAPTERS, pveChapter, pveHardChapter, chapterLabel, PVE_PROGRESS_CONSTANTS } from './combatPve.js';
import {
  OBLIVION_XP_CURVE, OBLIVION_FLOORS, CLASSIC_DUNGEONS, PROGRESS_CHAPTERS, oblivionFloor, classicDungeon,
  crusadePowerRequirement,
} from './pveContent.js';
import {
  ARENA_RANKS, PVP_RATING_K, PVP_COMBAT_CEILINGS, STACK_SIGIL_DEFS, arenaRank,
} from './combatPvp.js';

describe('game/combatPve catalogue', () => {
  it('11 normal chapters of 10 levels, 11 hard chapters', () => {
    expect(PVE_CHAPTERS).toHaveLength(11);
    expect(PVE_HARD_CHAPTERS).toHaveLength(11);
    expect(pveChapter(1).name).toBe('Rat Warrens');
    expect(pveChapter(1).levels).toHaveLength(10);
    expect(pveChapter(12)).toBeNull();
    expect(pveHardChapter(12).basedOnChapter).toBe(1);
    expect(PVE_PROGRESS_CONSTANTS.globalMultiplier).toBe(2);
  });

  it('chapterLabel names hard chapters after their base chapter (they carry no name of their own)', () => {
    expect(chapterLabel(1)).toBe('1. Rat Warrens');
    expect(chapterLabel(12)).toBe('Hard 1. Rat Warrens');
    expect(chapterLabel(22)).toBe('Hard 11. Chrono Sanctum');
    for (const c of [...PVE_CHAPTERS, ...PVE_HARD_CHAPTERS]) expect(chapterLabel(c.chapter)).not.toMatch(/undefined/);
    expect(chapterLabel(99)).toBe('Chapter 99');
  });
});

describe('game/pveContent catalogue', () => {
  it('Oblivion XP curve runs from level 2 to 100', () => {
    expect(OBLIVION_XP_CURVE).toHaveLength(99);
    expect(OBLIVION_XP_CURVE[0]).toMatchObject({ toLevel: 2, xpCost: 170000 });
  });
  it('Oblivion floors and classic dungeons', () => {
    expect(OBLIVION_FLOORS).toHaveLength(60);
    expect(oblivionFloor(1)).toMatchObject({ mobHp: 20000000, mobAttack: 34000 });
    expect(CLASSIC_DUNGEONS.length).toBeGreaterThan(0);
    expect(classicDungeon('dungeon_1').name).toBe('Forsaken Mines');
    expect(PROGRESS_CHAPTERS).toHaveLength(22);
  });
});

describe('game/combatPvp catalogue', () => {
  it('ladder, rating constant and ceilings', () => {
    expect(ARENA_RANKS[0].rank).toBe('INITIATE');
    expect(arenaRank('VANGUARD')).not.toBeNull();
    expect(PVP_RATING_K).toBe(200);
    expect(PVP_COMBAT_CEILINGS.CRIT_CHANCE).toBe(95);
    expect(STACK_SIGIL_DEFS.length).toBeGreaterThan(0);
  });
});

describe('Hell Crusade Combat Power gates (pve-content.md §5)', () => {
  it('Normal 0, Hard 11 000, Mythic 13 000 and Mythic+L = round(13 000 * 1.18^L)', () => {
    expect([crusadePowerRequirement('NORMAL'), crusadePowerRequirement('HARD'), crusadePowerRequirement('MYTHIC')]).toEqual([0, 11000, 13000]);
    expect(crusadePowerRequirement('MYTHIC', 1)).toBe(15340);
    expect(crusadePowerRequirement('MYTHIC', 10)).toBe(Math.round(13000 * 1.18 ** 10));
    expect(crusadePowerRequirement('HARD', 3)).toBe(11000); // the plus level applies to Mythic only
    expect(crusadePowerRequirement('NOPE')).toBe(0);
  });
});
