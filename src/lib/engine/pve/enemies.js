// L2 engine: PVE enemy construction. Pure; reads only the L1 catalogues.
// Facts (formulas, constants) live in docs/Reference/Game/combat-pve.md and pve-content.md.
import {
  PVE_PROGRESS_CONSTANTS, PVE_HARD_LEVEL_MULTIPLIERS, PVE_HARD_CHAPTER_OFFSET, PVE_CHAPTERS,
  PVE_HARD_CHAPTERS, pveChapter, pveHardChapter,
} from '../../game/combatPve.js';
import {
  OBLIVION_FLOORS, CLASSIC_DUNGEONS, CLASSIC_DUNGEON_HARD, classicDungeon,
} from '../../game/pveContent.js';
import { raidById } from '../../game/fortress.js';
import {
  WORLD_BOSS_AFFINITIES, WORLD_BOSS_AFFINITY_CYCLE, WORLD_BOSS_SEASON, WORLD_BOSSES,
  WORLD_BOSS_CONSTANTS,
} from '../../game/worldBoss.js';

/** @typedef {import('../types.js').MobSpec} MobSpec */

const LEVELS_PER_CHAPTER = PVE_PROGRESS_CONSTANTS.levelsPerChapter;
const GLOBAL_MULTIPLIER = PVE_PROGRESS_CONSTANTS.globalMultiplier;

// port of makeMob L1084790-1084839
/** One campaign mob: round(base * levelMultiplier * GLOBAL_MULTIPLIER); penetration only when set. */
export function makeMob(template, levelMultiplier) {
  const mob = {
    id: template.id,
    name: template.name,
    hp: Math.round(template.baseHp * levelMultiplier * GLOBAL_MULTIPLIER),
    attack: Math.round(template.baseAtk * levelMultiplier * GLOBAL_MULTIPLIER),
    attackSpeed: template.baseSpd,
  };
  if (template.penetration != null) mob.penetration = template.penetration;
  return mob;
}

// port of buildChapterLevels L1084840-1084931
/**
 * 10 levels of 3 mobs. Level i (0-based) fights templates [i%3, (i+1)%3, (i+2)%3].
 * @param {number} chapter @param {Array} templates 3 mob templates
 * @param {number[]} multipliers per-level multiplier (missing entries default to 1)
 * @param {number[]} influence per-level influence reward (missing entries default to 1)
 */
export function buildChapterLevels(chapter, templates, multipliers, influence) {
  return Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => ({
    chapter,
    level: i + 1,
    mobs: [i % 3, (i + 1) % 3, (i + 2) % 3].map((t) => makeMob(templates[t], multipliers[i] ?? 1)),
    influenceReward: influence[i] ?? 1,
  }));
}

// port of hardInfluence L1084932-1084971
/** Influence per level of hard chapter index `idx` (0-based): 500 + 5*(idx*10 + level), +25 on the last. */
export const hardInfluence = (idx) =>
  Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => {
    const v = 500 + (idx * LEVELS_PER_CHAPTER + i) * 5;
    return i === LEVELS_PER_CHAPTER - 1 ? v + 25 : v;
  });

// port of hardChapterVariant L1084972-1085017
/** Scale a normal chapter's templates into hard ones: ids get `_hard`, round(base*scale), penetration. */
export const hardChapterVariant = (templates, { hpScale, atkScale, penetration }) =>
  templates.map((t) => ({
    ...t,
    id: `${t.id}_hard`,
    baseHp: Math.round(t.baseHp * hpScale),
    baseAtk: Math.round(t.baseAtk * atkScale),
    penetration,
  }));

/**
 * Normalise a built mob to the MobSpec contract, stamped with the content `mode` it comes from
 * (campaign, dungeon, raid, oblivion, worldBoss) for the fight driver.
 */
function toMobSpec(m, mode) {
  const spec = { id: m.id, hp: m.hp, attack: m.attack, attackSpeed: m.attackSpeed, mode };
  if (m.name != null) spec.name = m.name;
  if (m.penetration != null) spec.penetration = m.penetration;
  if (m.blockChance != null) spec.blockChance = m.blockChance;
  if (m.damageReduction != null) spec.damageReduction = m.damageReduction;
  return spec;
}

const chapterRecord = (chapter) =>
  chapter > PVE_HARD_CHAPTER_OFFSET ? pveHardChapter(chapter) : pveChapter(chapter);

/**
 * Campaign mobs for a chapter level, in fight order. Chapters 1-11 normal, 12-22 hard.
 * @returns {MobSpec[]|null} null when chapter or level is out of range
 */
export function chapterMobs(chapter, level) {
  const ch = chapterRecord(chapter);
  if (!ch || !(level >= 1 && level <= LEVELS_PER_CHAPTER)) return null;
  const mults = chapter > PVE_HARD_CHAPTER_OFFSET
    ? PVE_HARD_LEVEL_MULTIPLIERS
    : ch.levels.map((l) => l.levelMultiplier);
  return buildChapterLevels(chapter, ch.mobTemplates, mults, [])[level - 1].mobs
    .map((m) => toMobSpec(m, 'campaign'));
}

/** Every level of a chapter ({level, mobs: MobSpec[], influenceReward}), or null. */
export function chapterLevels(chapter) {
  const ch = chapterRecord(chapter);
  if (!ch) return null;
  return ch.levels.map((l) => ({
    level: l.level,
    influenceReward: l.influenceReward,
    mobs: chapterMobs(chapter, l.level),
  }));
}

export const CHAPTER_COUNT = PVE_CHAPTERS.length + PVE_HARD_CHAPTERS.length;

const HARD_SUFFIX = '_hard';
const DUNGEON_STEP_COUNT = 8;

// port of hardVariant L1062199-1062371; facts pve-content.md §4
/**
 * Hard roster of the normal dungeon at `dungeonIndex` (0-based): ids get `_hard`; hp scaled, then
 * times (1 - DR/100); the boss's attack capped by the two entries before it; speed x speedMult
 * and attack / speedMult; block, penetration (+bonus on the boss) and DR from the config.
 */
export function hardDungeonRoster(roster, cfg, dungeonIndex) {
  const H = CLASSIC_DUNGEON_HARD;
  const last = roster.length - 1;
  const prev = roster.slice(Math.max(0, last - 2), last).map((r) => r.baseAtk);
  const cap = prev.length > 0 ? Math.max(...prev) * H.bossAtkCapMult : Infinity;
  const hpShare = H.share[dungeonIndex]?.hp ?? 1;
  const atkShare = H.share[dungeonIndex]?.atk ?? 1;
  const drMult = 1 - cfg.damageReduction / 100;
  return roster.map((r, i) => ({
    ...r,
    id: `${r.id}${HARD_SUFFIX}`,
    baseHp: Math.round(r.baseHp * cfg.hpScale * hpShare * drMult),
    baseAtk: Math.round((i !== last ? r.baseAtk : Math.min(r.baseAtk, cap)) * cfg.atkScale * atkShare / H.speedMult),
    baseSpd: parseFloat((r.baseSpd * H.speedMult).toFixed(3)),
    blockChance: cfg.blockChance,
    penetration: i !== last ? cfg.penetration : cfg.penetration + H.bossPenetrationBonus,
    damageReduction: cfg.damageReduction,
  }));
}

// port of hardCoinRewards L1062174-1062198
/** Coins per step of the hard dungeon built from normal dungeon `dungeonIndex` (0-based). */
export const hardDungeonCoins = (dungeonIndex) => Array.from({ length: DUNGEON_STEP_COUNT },
  (_, i) => CLASSIC_DUNGEON_HARD.coinBase + CLASSIC_DUNGEON_HARD.coinStep * (DUNGEON_STEP_COUNT * dungeonIndex + i));

// port of makeMob L1062373-1062439 (the dungeon module's own; no GLOBAL_MULTIPLIER, unlike the campaign one)
const makeDungeonMob = (r, mult) => toMobSpec({
  id: r.id, name: r.name,
  hp: Math.round(r.baseHp * mult), attack: Math.round(r.baseAtk * mult), attackSpeed: r.baseSpd,
  blockChance: r.blockChance, penetration: r.penetration, damageReduction: r.damageReduction,
}, 'dungeon');

/** Roster, step multipliers and coins of a normal or hard (`<id>_hard`) dungeon, or null. */
function dungeonDefinition(id) {
  const hard = typeof id === 'string' && id.endsWith(HARD_SUFFIX);
  const d = classicDungeon(hard ? id.slice(0, -HARD_SUFFIX.length) : id);
  if (!d) return null;
  if (!hard) return { roster: d.mobRoster, multipliers: d.stepMultipliers, coins: d.stepCoins };
  const k = CLASSIC_DUNGEONS.indexOf(d);
  return {
    roster: hardDungeonRoster(d.mobRoster, CLASSIC_DUNGEON_HARD.configs[k], k),
    multipliers: CLASSIC_DUNGEON_HARD.stepMultipliers,
    coins: hardDungeonCoins(k),
  };
}

/** Every dungeon id in the client's order: the 7 normal ones, then their `_hard` variants. */
export const DUNGEON_IDS = [
  ...CLASSIC_DUNGEONS.map((d) => d.id),
  ...CLASSIC_DUNGEONS.map((d) => `${d.id}${HARD_SUFFIX}`),
];

// port of buildSteps L1062441-1062526; facts pve-content.md §4
/**
 * Classic dungeon steps, normal (`dungeon_N`) or hard (`dungeon_N_hard`): 8 steps of 3 mobs; steps
 * 1-7 rotate through the roster without the boss, step 8 is the last three entries (boss last).
 * @param {string} id e.g. 'dungeon_1', 'dungeon_7_hard'
 * @returns {Array<{step:number, coins:number, multiplier:number, mobs:MobSpec[]}>|null}
 */
export function dungeonSteps(id) {
  const def = dungeonDefinition(id);
  if (!def) return null;
  const { roster, multipliers, coins } = def;
  const n = roster.length - 1;
  return Array.from({ length: DUNGEON_STEP_COUNT }, (_, s) => {
    const mult = multipliers[s] ?? 1;
    const idxs = s + 1 !== DUNGEON_STEP_COUNT
      ? [(3 * s) % n, (3 * s + 1) % n, (3 * s + 2) % n]
      : [n - 2, n - 1, n];
    return { step: s + 1, coins: coins[s] ?? 10, multiplier: mult, mobs: idxs.map((i) => makeDungeonMob(roster[i], mult)) };
  });
}

export const dungeonMobs = (id, step) => dungeonSteps(id)?.[step - 1]?.mobs ?? null;

// port of buildBanditVillageSteps L1064959 and its four siblings (L1065048, L1065136, L1065224, L1065312);
// mob scaling port of makeRaidMob L1064597-1064623. Facts: clan-fortress.md §5.
/**
 * Village raid steps (8 per raid, 5 mobs each). Roster index for steps 1-7 is (i*k + j) % 5 with i = step-1,
 * j = 0..4 and k the raid's rotationK; step 8 is roster [1..5] (the boss, index 5, always appears).
 * Mob hp/attack are round(base * stepMultiplier); attack speed is unscaled.
 * @param {string} id e.g. 'raid_1'
 * @returns {Array<{step:number, multiplier:number, mobs:MobSpec[]}>|null}
 */
export function raidSteps(id) {
  const raid = raidById(id);
  if (!raid) return null;
  const k = raid.source.rotationK;
  return raid.stepMultipliers.map((mult, i) => {
    const idxs = i === raid.stepMultipliers.length - 1
      ? [1, 2, 3, 4, 5]
      : [0, 1, 2, 3, 4].map((j) => (i * k + j) % 5);
    const mobs = idxs.map((ix) => {
      const r = raid.roster[ix];
      return toMobSpec({
        id: r.id, name: r.name,
        hp: Math.round(r.baseHp * mult), attack: Math.round(r.baseAtk * mult), attackSpeed: r.baseSpd,
      }, 'raid');
    });
    return { step: i + 1, multiplier: mult, mobs };
  });
}

export const raidMobs = (id, step) => raidSteps(id)?.[step - 1]?.mobs ?? null;

// Oblivion dungeon constants: pve-content.md (Oblivion Dungeon).
const OBLIVION_ATTACK_SPEED = 1;
const OBLIVION_BLOCK = 20;
const OBLIVION_PENETRATION = 12;

/** Net strain after Oblivion Power: max(0, round(instability) - round(power)). */
export const oblivionEffectiveInstability = (instability, oblivionPower = 0) =>
  Math.max(0, Math.round(instability) - Math.round(oblivionPower));

// port of getFloorInstability L1706367-1706415
/** Instability for floor f (free floors 3). Math.round: x.5 rounds up, unlike the catalogue's table. */
export function oblivionInstability(floor) {
  const n = floor - 3;
  return n <= 0 ? 0 : Math.round(34 + 21 * (n - 1) + (0.5 * (n - 1) * n) / 2);
}

/**
 * Oblivion dungeon floor mob. Table for floors 1-60, closed form beyond.
 * @returns {MobSpec & {instability:number}|null}
 */
export function oblivionFloorMob(floor) {
  if (!Number.isInteger(floor) || floor < 1) return null;
  const row = OBLIVION_FLOORS.find((f) => f.floor === floor);
  const hp = row ? row.mobHp : Math.round(20000000 * 1.13 ** (floor - 1));
  const attack = row ? row.mobAttack : Math.round(34000 * 1.06 ** (floor - 1));
  return {
    id: `oblivion_floor_${floor}`, mode: 'oblivion', hp, attack, attackSpeed: OBLIVION_ATTACK_SPEED,
    blockChance: OBLIVION_BLOCK, penetration: OBLIVION_PENETRATION,
    instability: oblivionInstability(floor),
  };
}

// --- World boss ---------------------------------------------------------------------------

// port of hashInt L1152862-1152885
export function worldBossHashInt(n) {
  let x = (n + 2654435769) | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 569420461);
  x ^= x >>> 15;
  x = Math.imul(x, 1935289751);
  x ^= x >>> 15;
  return x >>> 0;
}

// port of affinityIndexForCycle L1152886-1152985
/** Affinity id for cycle c, per WORLD_BOSS_AFFINITY_CYCLE.rule. */
export function worldBossAffinityForCycle(cycle) {
  const { order, overrides } = WORLD_BOSS_AFFINITY_CYCLE;
  const c = Math.max(0, Math.floor(cycle));
  const resolve = (k, fallback) => (overrides[k] != null ? order.indexOf(overrides[k]) : fallback);
  let idx = resolve(0, worldBossHashInt(0) % 3);
  for (let k = 1; k <= c; k++) idx = resolve(k, (idx + 1 + (worldBossHashInt(k) % 2)) % 3);
  return order[idx];
}

/** Season session index for a timestamp (ms). Negative before the anchor. */
export const worldBossSessionIndex = (nowMs) =>
  Math.floor((nowMs - WORLD_BOSS_SEASON.anchorMs) / WORLD_BOSS_SEASON.durationMs);

/** Open on even sessions (3 days open, 3 closed). */
export const isWorldBossActive = (nowMs) => {
  const s = worldBossSessionIndex(nowMs);
  return s >= 0 && s % 2 === 0;
};

/** Affinity for a timestamp: the next season's when the current session is closed. */
export function worldBossAffinityAt(nowMs) {
  const s = Math.max(0, worldBossSessionIndex(nowMs));
  return worldBossAffinityForCycle(Math.floor((s % 2 === 0 ? s : s + 1) / 2));
}

/**
 * World boss MobSpec for an affinity. Hit/block/ramp resolution is server-side, so `attack` is 0;
 * the affinity record rides along on `affinity` for the fight driver.
 * @param {'NONE'|'FORTIFIED'|'ENRAGED'} [affinityId]
 */
export function worldBossMob(affinityId = 'NONE') {
  const aff = WORLD_BOSS_AFFINITIES[affinityId];
  if (!aff) return null;
  const boss = WORLD_BOSSES[0];
  return {
    id: boss.id, name: boss.name, mode: 'worldBoss', hp: boss.hp, attack: 0,
    attackSpeed: aff.baseAttackSpeed, blockChance: aff.blockChance,
    stats: { spellResist: aff.bossSpellResist },
    affinity: aff,
    fightDurationMs: aff.maxFightDurationMs ?? WORLD_BOSS_CONSTANTS.fightDurationMs,
  };
}
