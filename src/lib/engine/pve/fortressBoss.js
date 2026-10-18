// engine/pve/fortressBoss.js: the clan-war Fortress boss fight and its credit (clan-fortress.md §1.4, §2.5, §3.1).
// The fight is the arena duel (pvp/resolver.js simulateArenaPvP) with the player as the attacker and the
// boss as the defender, under the Fortress rules the 2026-10-15 server log shows (clan-fortress.md §1.4).
// Each departure from the arena is a named FORTRESS_FIGHT_RULES entry applied to the inputs here, so the
// arena duel itself is untouched. The clan's credit multipliers (shield, contribution bonus, star
// vulnerability) are constant within a run, so they are display-only and never enter a score.
import {
  FORTRESS_BOSSES, FORTRESS_CONSTANTS, BOSS_SHIELD_CONTROL_POINTS, FORTRESS_STARS, CONTRIBUTION_BONUS,
} from '../../game/fortress.js';
import { simulateArenaPvP, fighterDuelArgs, completeDuelStats } from '../pvp/resolver.js';
import { STANCE_FIELDS } from '../core/stances.js';

export const FORTRESS_BOSS_GROUPS = Object.freeze(Object.keys(FORTRESS_BOSSES));
export const MAX_SHIELD_PERCENT = 60;

/** The boss as a target: its table HP, attack and speed, and the 60 s window (`fightDurationMs`). */
export function fortressBossMob(group) {
  const b = FORTRESS_BOSSES[group];
  if (!b) return null;
  return {
    id: `fortress_boss_${group}`, name: b.name, hp: b.baseHp, attack: b.attack,
    attackSpeed: b.attackSpeed, fightDurationMs: FORTRESS_CONSTANTS.bossFightDurationMs,
  };
}

/**
 * How the Fortress fight departs from the arena duel. Each value is read off the 2026-10-15 server log
 * ([DERIVED], clan-fortress.md §1.4) unless its note says it is assumed; `true` keeps the arena rule.
 */
export const FORTRESS_FIGHT_RULES = Object.freeze({
  /** no x8 arena HP (applyPvpHpBuff): the player starts at the sheet HP */
  pvpHpBuff: false,
  /** neither side's PVP Attack / PVP Defense applies: hits are the sheet attack, boss hits are unreduced */
  pvpRatings: false,
  /** stack sigils never stack (Elusive Supremacy is refuted; the other stack sigils are assumed the same) */
  stackSigils: false,
  /** the boss is never blinded: the player's Blind Chance and blind buffs are dropped */
  bossBlindable: false,
  /** each boss swing is its attack times a draw in [0.85, 1.15], rounded (uniform is assumed) */
  bossDamageVariance: 0.15,
  /** the boss's spell resist (the log's `bossSpellResist`; TOP only, the other groups assumed the same) */
  bossSpellResist: 20,
  /** the log ends at `time_up` with no death row after it */
  timeUpDeadRow: false,
  /** a double hit's first row carries the boss HP after that strike, not after the whole swing */
  perStrikeBossHp: true,
});

/** The Fortress model's labelled assumption, shown with the target (objectives.js resolveTarget). */
export const FORTRESS_ASSUMPTIONS = Object.freeze([
  Object.freeze({
    key: 'fortress-boss-model',
    text: 'The Fortress boss fight is server-run. It is played as the arena duel (the player attacks, the boss defends) '
      + 'with the rules one server log shows: no x8 HP, no PVP Attack or Defense, no sigil stacks, the boss cannot be '
      + `blinded, boss hits vary ±${FORTRESS_FIGHT_RULES.bossDamageVariance * 100}% and the boss has ${FORTRESS_FIGHT_RULES.bossSpellResist} spell resist.`,
  }),
]);

/** The boss as the duel's defender (fighterDuelArgs shape): the table's numbers, no spells, sigils or shield. */
export function fortressBossDuelArgs(group, rules = FORTRESS_FIGHT_RULES) {
  const b = FORTRESS_BOSSES[group];
  if (!b) throw new Error(`unknown Fortress boss group '${group}'`);
  const { stats } = completeDuelStats({
    totalHp: b.baseHp, totalAttack: b.attack, totalAttackSpeed: b.attackSpeed, totalSpellResist: rules.bossSpellResist,
  });
  return { stats, spells: null, equipped: [], glyphCombat: null, shield: null, stackCtx: {}, summon: null };
}

const dropBlindBuff = (cfg) => {
  const sp = cfg.spell;
  if (!sp || sp.spellType !== 'BUFF' || !(sp.effects ?? []).some((e) => e.stat === 'BLIND_CHANCE')) return cfg;
  return { ...cfg, spell: { ...sp, effects: sp.effects.filter((e) => e.stat !== 'BLIND_CHANCE') } };
};

/** The player as the duel's attacker: fighterDuelArgs with the Fortress rules applied to its inputs. */
export function fortressPlayerDuelArgs(fighter, rules = FORTRESS_FIGHT_RULES) {
  const args = fighterDuelArgs(fighter);
  let stats = rules.pvpHpBuff ? args.stats : completeDuelStats(fighter.stats, fighter.class, args.stackCtx.form).stats;
  if (!rules.pvpHpBuff) for (const key of STANCE_FIELDS) if (args.stats[key] != null) stats[key] = args.stats[key];
  if (!rules.pvpRatings) stats = { ...stats, totalPvpAttack: 0, totalPvpDefense: 0 };
  let spells = args.spells;
  if (!rules.bossBlindable) {
    stats = { ...stats, totalBlindChance: 0 };
    spells = spells?.map(dropBlindBuff) ?? spells;
  }
  return { ...args, stats, spells, equipped: rules.stackSigils ? args.equipped : [] };
}

/**
 * One Fortress boss fight. `damageDealt` is what the boss lost; the fight ends when the player dies (its
 * damage stops), the boss dies, or at the 60 s bell.
 * @param {{fighter: Object, group: 'TOP'|'BOTTOM'|'CORE', rng: () => number, log?: boolean, rules?: Object}} p
 *   `fighter` a Fighter or fortressPlayerDuelArgs output
 * @returns {{damageDealt: number, playerDied: boolean, timeMs: number, playerHpLeft: number,
 *   bossHpLeft: number, combatLog: Array<Object>}}  `combatLog` the server's row vocabulary ([] unless `log`)
 */
export function simulateFortressBoss({ fighter, group, rng, log = false, rules = FORTRESS_FIGHT_RULES }) {
  const a = fighter.stackCtx ? fighter : fortressPlayerDuelArgs(fighter, rules);
  const d = fortressBossDuelArgs(group, rules);
  const r = simulateArenaPvP(
    a.stats, d.stats, a.spells, d.spells, a.equipped, d.equipped, a.glyphCombat, d.glyphCombat,
    a.shield, d.shield, a.stackCtx, d.stackCtx, a.summon, d.summon,
    { rng, log, defenderDamageVariance: rules.bossDamageVariance },
  );
  let combatLog = r.ticks;
  if (log && !rules.timeUpDeadRow && combatLog.at(-2)?.type === 'time_up') combatLog = combatLog.slice(0, -1);
  if (log && rules.perStrikeBossHp) {
    // the boss has no shield, so its HP before the second strike is the post-swing HP plus that strike
    for (let i = 1; i < combatLog.length; i++) {
      const e = combatLog[i];
      const p = combatLog[i - 1];
      if (e.doubleHit && e.type === 'attacker_hit' && p.timestamp === e.timestamp && /^attacker_(hit|crit)$/.test(p.type) && !p.doubleHit) {
        p.defenderHpAfter = e.defenderHpAfter + e.damage;
      }
    }
  }
  return {
    damageDealt: r.defenderMaxHp - r.defenderHpRemaining,
    playerDied: r.attackerHpRemaining <= 0,
    timeMs: r.totalDuration,
    playerHpLeft: r.attackerHpRemaining,
    bossHpLeft: r.defenderHpRemaining,
    combatLog,
  };
}

/**
 * Boss shield percent (module 4305 `calculateBossShield`, clan-fortress.md §3.1): the control points
 * interpolated piecewise-linearly over alive defenders / the server's max clan size (`clanCapForServer`; confirmed by
 * two server snapshots), 0 when the cap is not positive. The client's `startingDefenders` guard is taken as met.
 */
export function calculateBossShield(aliveDefenders, clanCap) {
  if (!(clanCap > 0)) return 0;
  const ratio = Math.min(1, Math.max(0, aliveDefenders) / clanCap);
  const pts = [...BOSS_SHIELD_CONTROL_POINTS].sort((a, b) => a.ratio - b.ratio);
  for (let i = 1; i < pts.length; i++) {
    const lo = pts[i - 1];
    const hi = pts[i];
    if (ratio <= hi.ratio) {
      const t = hi.ratio === lo.ratio ? 1 : (ratio - lo.ratio) / (hi.ratio - lo.ratio);
      return Math.min(MAX_SHIELD_PERCENT, lo.shield + (hi.shield - lo.shield) * t);
    }
  }
  return Math.min(MAX_SHIELD_PERCENT, pts.at(-1).shield);
}

/** `shieldToMultiplier`: the share of damage that gets through a shield percent. */
export const shieldToMultiplier = (shieldPercent) => Math.max(0, 1 - shieldPercent / 100);

/** `calculateContributionBonus`: 1 + 0.05 per kill, at most 2. */
export const calculateContributionBonus = (kills) => Math.min(CONTRIBUTION_BONUS.max, CONTRIBUTION_BONUS.base + CONTRIBUTION_BONUS.perKill * kills);

/** `calculateStarVulnerabilityMultiplier` (§2.5): 4 stars is 6.0x. */
export function calculateStarVulnerability(stars) {
  const amp = FORTRESS_STARS.dmgAmpPercentByStars;
  const pct = stars < amp.length ? amp[Math.max(0, Math.floor(stars))] : amp.at(-1) + (stars - (amp.length - 1)) * FORTRESS_STARS.dmgAmpPerExtraStar;
  return 1 + pct / 100;
}

/**
 * The credit multipliers of a resolved fortress-boss spec (CORE has no stars: 1x). `shieldPercent`, when given
 * (read off the siege screen), is used directly instead of the alive-defenders / `clanCap` interpolation.
 */
export function fortressBossMultipliers({ group, stars, aliveDefenders, clanCap, shieldPercent: given = null, kills }) {
  const shieldPercent = given == null ? calculateBossShield(aliveDefenders, clanCap) : Math.min(MAX_SHIELD_PERCENT, Math.max(0, given));
  const shieldMultiplier = shieldToMultiplier(shieldPercent);
  const contributionBonus = calculateContributionBonus(kills);
  const starVulnerability = group === 'CORE' ? 1 : calculateStarVulnerability(stars);
  return {
    shieldPercent, shieldMultiplier, contributionBonus, starVulnerability,
    total: shieldMultiplier * contributionBonus * starVulnerability,
  };
}

/** Raw damage and the damage the clan is credited: round(raw * shield * contribution * star). */
export function fortressBossCredit(multipliers, rawDamage) {
  return { raw: Math.round(rawDamage), effective: Math.round(rawDamage * multipliers.total) };
}
