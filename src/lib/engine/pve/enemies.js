// L2 engine: PVE enemy construction. Pure; reads only the L1 catalogues.
// Facts (formulas, constants) live in docs/Reference/Game/combat-pve.md and pve-content.md.
import {
  PVE_PROGRESS_CONSTANTS, PVE_HARD_LEVEL_MULTIPLIERS, PVE_HARD_CHAPTER_OFFSET, PVE_CHAPTERS,
  PVE_HARD_CHAPTERS, pveChapter, pveHardChapter,
} from '../../game/combatPve.js';
import { OBLIVION_FLOORS, classicDungeon } from '../../game/pveContent.js';
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

/** Normalise a built mob to the MobSpec contract. */
function toMobSpec(m) {
  const spec = { id: m.id, hp: m.hp, attack: m.attack, attackSpeed: m.attackSpeed };
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
  return buildChapterLevels(chapter, ch.mobTemplates, mults, [])[level - 1].mobs.map(toMobSpec);
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

/**
 * Classic dungeon steps (8 per dungeon, 3 mobs each; step 8 = last three roster entries).
 * Roster rule is [DERIVED] (pve-content.md); hard variants are [UNRESOLVED] there, so not built.
 * Roster entries may carry optional blockChance/penetration, passed through.
 * @param {string} id e.g. 'dungeon_1'
 * @returns {Array<{step:number, coins:number, multiplier:number, mobs:MobSpec[]}>|null}
 */
export function dungeonSteps(id) {
  const d = classicDungeon(id);
  if (!d) return null;
  const roster = d.mobRoster;
  const n = roster.length;
  return d.stepMultipliers.map((mult, s) => {
    const idxs = s === d.stepMultipliers.length - 1
      ? [n - 3, n - 2, n - 1]
      : [(3 * s) % (n - 1), (3 * s + 1) % (n - 1), (3 * s + 2) % (n - 1)];
    const mobs = idxs.map((i) => {
      const r = roster[i];
      return toMobSpec({
        id: r.id ?? `${id}_${i}`, name: r.name,
        hp: Math.round(r.baseHp * mult), attack: Math.round(r.baseAtk * mult),
        attackSpeed: r.baseSpd, blockChance: r.blockChance, penetration: r.penetration,
      });
    });
    return { step: s + 1, coins: d.stepCoins[s], multiplier: mult, mobs };
  });
}

export const dungeonMobs = (id, step) => dungeonSteps(id)?.[step - 1]?.mobs ?? null;

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
    id: `oblivion_floor_${floor}`, hp, attack, attackSpeed: OBLIVION_ATTACK_SPEED,
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
    id: boss.id, name: boss.name, hp: boss.hp, attack: 0,
    attackSpeed: aff.baseAttackSpeed, blockChance: aff.blockChance,
    stats: { spellResist: aff.bossSpellResist },
    affinity: aff,
    fightDurationMs: aff.maxFightDurationMs ?? WORLD_BOSS_CONSTANTS.fightDurationMs,
  };
}
