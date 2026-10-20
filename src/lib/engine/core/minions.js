// Necromancer minion state and swings. Formulas: docs/Reference/Game/classes.md §7.
// All functions mutate the passed minion in place, as the client does, unless noted.
import { applyCombatCeiling, ceilingFor, capConfig, softCapGainFromSheet } from './caps.js';
import { sigilBySpecies } from '../../game/sigils.js';

/** OPENING_FIRST_SWING_MIN_MS (module 3968 closure constant). */
export const OPENING_FIRST_SWING_MIN_MS = 400;

const CEIL_ATK_SPEED = () => ceilingFor('MINION_ATTACK_SPEED');

// port of minionAttackSpeed L1094192-1094240
/** Player attack speed plus the soft-capped minion attack-speed gain, then ceilinged. */
export function minionAttackSpeed(playerAttackSpeed, totalMinionAttackSpeed) {
  if (!(totalMinionAttackSpeed > 0)) return playerAttackSpeed;
  const cfg = capConfig('MINION_ATTACK_SPEED');
  const gain = cfg ? softCapGainFromSheet(playerAttackSpeed, totalMinionAttackSpeed, cfg) : 0;
  return applyCombatCeiling(playerAttackSpeed + gain, CEIL_ATK_SPEED());
}

// port of createMinion L1094500-1094612
/**
 * Build a (dead, hp 0) minion from the summon config `d` and player combat stats `p`.
 * @param {{species?,name?,icon?,minion?,hpPercent:number,attackPercent:number,respawnCooldownMs?:number,summonCastMs?:number}|null} d
 * @param {{maxHp:number, attack:number, attackSpeed:number, critDamage:number}} p
 * @param {object} stats ComputedStats-shaped (`total*` keys)
 * @returns {object|null} null when there is no summon config
 */
export function createMinion(d, p, stats) {
  if (!d) return null;
  const tiers = sigilBySpecies(d.species)?.dominionTiers;
  const level = Number.isFinite(stats.totalDominion) ? Math.max(1, Math.min(tiers?.length ?? 1, Math.floor(stats.totalDominion))) : 1;
  const dominion = tiers?.[level - 1];
  const atk = (stats.totalMinionAttack ?? 0) / 100;
  const hpb = (stats.totalMinionHealth ?? 0) / 100;
  return {
    species: d.species,
    name: d.name,
    icon: d.icon,
    kind: d.minion,
    attack: Math.max(1, Math.floor(((p.attack * d.attackPercent) / 100) * (1 + atk))),
    maxHp: Math.max(1, Math.floor(((p.maxHp * d.hpPercent) / 100) * (1 + hpb))),
    hp: 0,
    attackSpeed: minionAttackSpeed(p.attackSpeed, stats.totalMinionAttackSpeed ?? 0),
    critChance: stats.totalMinionCritChance ?? 0,
    critDamage: p.critDamage,
    lifesteal: stats.totalMinionLifesteal ?? 0,
    soulLink: stats.totalSoulLink ?? 0,
    timer: 0,
    alive: false,
    respawnCooldownMs: d.respawnCooldownMs ?? 0,
    respawnMs: 0,
    summonCastMs: d.summonCastMs ?? 0,
    ...(dominion && (dominion.blockChance > 0 || dominion.damageReduction > 0 || dominion.thornsPercent > 0) ? { dominion } : {}),
  };
}

// port of summonMinion (module 3968 closure slot 3)
export function summonMinion(m) {
  m.hp = m.maxHp;
  m.timer = 0;
  m.alive = true;
  m.respawnMs = 0;
}

// port of advanceMinionRespawn: counts down; summons at <= 0. Returns true when it summoned.
export function advanceMinionRespawn(m, dtMs) {
  if (!m || m.alive || !(m.respawnMs > 0)) return false;
  m.respawnMs -= dtMs;
  if (m.respawnMs > 0) return false;
  summonMinion(m);
  return true;
}

// port of elapseMinionRespawn: counts down, floored at 0, never summons.
export function elapseMinionRespawn(m, dtMs) {
  if (!m || m.alive || !(m.respawnMs > 0)) return;
  m.respawnMs = Math.max(0, m.respawnMs - dtMs);
}

// port of resummonIfDead L1094677-1094700: summons a dead minion that has no respawn pending (a fresh
// createMinion, or one whose countdown ran out between fights); a pending countdown is left to
// advanceMinionRespawn.
export function resummonIfDead(m) {
  if (!m || m.alive || m.respawnMs > 0) return false;
  summonMinion(m);
  return true;
}

export const isMinionAlive = (m) => m != null && m.alive;

// port of minionSummonMeta
export function minionSummonMeta(m, summonReadyMs) {
  const meta = { minionMaxHp: m.maxHp, spell: { name: m.name, icon: m.icon, species: m.species } };
  if (summonReadyMs !== undefined) meta.summonReadyMs = summonReadyMs;
  return meta;
}

// port of openingSwingTimerStart L1094757-1094789. Callers (L1087885) pass round(1000 / attackSpeed): a
// positive summon window caps the timer at swingInterval - 400, so the first swing after the window comes
// no sooner than 400 ms; no window returns the fallback.
export function openingSwingTimerStart(swingIntervalMs, windowMs, fallback = 0) {
  return windowMs > 0 ? Math.min(fallback, swingIntervalMs - OPENING_FIRST_SWING_MIN_MS) : fallback;
}

// port of openingSummonWindowMs: largest summonCastMs among the minions
export function openingSummonWindowMs(minions) {
  let w = 0;
  for (const m of minions) if (m && m.summonCastMs > w) w = m.summonCastMs;
  return w;
}

// port of minionSwingIntervalMs. The ceiling applies only when a frenzy attack-speed percent > 0.
export function minionSwingIntervalMs(m) {
  const pct = m.frenzy?.attackSpeedPercent ?? 0;
  const x = pct > 0 ? applyCombatCeiling(m.attackSpeed * (1 + pct / 100), CEIL_ATK_SPEED()) : m.attackSpeed;
  return Math.round(1000 / x);
}

// port of minionMsUntilSwing
export function minionMsUntilSwing(m) {
  if (!m.alive || !(m.attackSpeed > 0)) return Infinity;
  return Math.max(0, minionSwingIntervalMs(m) - m.timer);
}

// port of minionCurrentAttack
export function minionCurrentAttack(m) {
  const pct = m.frenzy?.attackPercent ?? 0;
  return pct > 0 ? Math.floor(m.attack * (1 + pct / 100)) : m.attack;
}

// port of minionCurrentLifesteal
export function minionCurrentLifesteal(m) {
  const pct = m.frenzy?.lifesteal ?? 0;
  return pct > 0 ? applyCombatCeiling(m.lifesteal + pct, ceilingFor('MINION_LIFESTEAL')) : m.lifesteal;
}

// port of currentSoulLink
export function currentSoulLink(m) {
  const b = m.soulLinkBonus ?? 0;
  return b > 0 ? applyCombatCeiling(m.soulLink + b, ceilingFor('SOUL_LINK')) : m.soulLink;
}

// port of minionSwing L1094420-1094480. Adds dt to the timer; when it reaches the swing interval,
// subtracts one interval and rolls a hit. Exactly 1 rng draw iff critChance > 0 (rng() * 100 < critChance),
// 0 draws otherwise. Returns null when no swing happens (dead, attackSpeed <= 0, timer short).
// At most one swing per call, as in the client.
export function minionSwing(m, dtMs, rng) {
  if (!m.alive || !(m.attackSpeed > 0)) return null;
  m.timer += dtMs;
  const interval = minionSwingIntervalMs(m);
  if (!(m.timer >= interval)) return null;
  m.timer -= interval;
  const isCrit = m.critChance > 0 ? rng() * 100 < m.critChance : false;
  const base = minionCurrentAttack(m);
  return { damage: isCrit ? Math.round(base * m.critDamage) : base, isCrit };
}

// port of mitigateMinionHit: max(1, round(damage * (1 - dr/100))) when both > 0.
export function mitigateMinionHit(damage, drPercent) {
  if (!(drPercent > 0) || !(damage > 0)) return damage;
  return Math.max(1, Math.round(damage * (1 - drPercent / 100)));
}

// port of healMinion: returns the HP actually gained.
export function healMinion(m, amount) {
  if (!(amount > 0) || !(m.hp < m.maxHp)) return 0;
  const before = m.hp;
  m.hp = Math.min(m.maxHp, m.hp + amount);
  return m.hp - before;
}

// port of healMinionLifesteal: floor(dealt * lifesteal / 100), only while alive.
export function healMinionLifesteal(m, dealt) {
  const ls = minionCurrentLifesteal(m);
  if (!m.alive || !(ls > 0) || !(dealt > 0)) return 0;
  return healMinion(m, Math.floor((dealt * ls) / 100));
}

// port of soulLinkHeal: floor(damage * soulLink / 100) heals the live minion.
export function soulLinkHeal(m, damage) {
  if (!m || !m.alive || !(damage > 0)) return 0;
  const sl = currentSoulLink(m);
  if (!(sl > 0)) return 0;
  return healMinion(m, Math.floor((damage * sl) / 100));
}

// port of endMinionEmpower: removes the empower bonus HP; true when an empower was active.
export function endMinionEmpower(m) {
  if (m) delete m.empowerSpell;
  const bonus = m?.empowerBonusHp ?? 0;
  if (!m || !(bonus > 0)) return false;
  m.maxHp -= bonus;
  m.empowerBonusHp = 0;
  if (m.hp > m.maxHp) m.hp = m.maxHp;
  return true;
}

// port of endMinionFrenzy
export function endMinionFrenzy(m) {
  if (m) delete m.frenzySpell;
  if (!m?.frenzy) return false;
  delete m.frenzy;
  return true;
}

// port of damageMinion: clamps to hp; on death ends buffs and starts the respawn timer.
export function damageMinion(m, amount, context = null, rng = null) {
  if (!m.alive || !(amount > 0)) return { dealt: 0, died: false };
  let blocked = false;
  if (m.dominion) {
    const block = applyCombatCeiling(m.dominion.blockChance, ceilingFor('BLOCK_CHANCE'));
    if (context?.swing && block > 0 && rng() * 100 < block) {
      blocked = true;
      amount = context.penetration > 0 ? Math.round(amount * context.penetration / 100) : 0;
    }
    amount = mitigateMinionHit(amount, applyCombatCeiling(m.dominion.damageReduction, ceilingFor('DAMAGE_REDUCTION')));
  }
  if (!(amount > 0)) return { dealt: 0, died: false, ...(blocked ? { blocked: true } : {}) };
  const thorns = !blocked && (context?.swing || context?.followUp) ? Math.round(amount * (m.dominion?.thornsPercent ?? 0) / 100) : 0;
  const extra = { ...(blocked ? { blocked: true } : {}), ...(thorns > 0 ? { thorns } : {}) };
  const dealt = Math.min(m.hp, amount);
  m.hp -= dealt;
  if (m.hp > 0) return { dealt, died: false, ...extra };
  endMinionEmpower(m);
  endMinionFrenzy(m);
  m.hp = 0;
  m.alive = false;
  m.respawnMs = m.respawnCooldownMs;
  return { dealt, died: true, ...extra };
}

// port of killMinion: instant kill with no respawn timer. Returns true if it was alive.
export function killMinion(m) {
  if (!m) return false;
  m.respawnMs = 0;
  endMinionEmpower(m);
  endMinionFrenzy(m);
  if (!m.alive) return false;
  m.hp = 0;
  m.alive = false;
  return true;
}

// port of minionDeathMeta
export const minionDeathMeta = (m) => (m.respawnMs > 0 ? { minionRespawnMs: m.respawnMs } : {});

// port of carryMinionIntoNewFight: returns the buff-restore records for a surviving minion, clears the
// soul-link bonus, and resets hp/timer via summonMinion. [] when dead or missing. The client calls it only
// between boss phases (L1863431); no PVE mode here uses it (combat-pve.md §14).
export function carryMinionIntoNewFight(m) {
  if (!m || !m.alive) return [];
  const out = [];
  const empower = m.empowerSpell;
  if (endMinionEmpower(m) && empower) out.push({ spell: empower, minionMaxHp: m.maxHp });
  const frenzy = m.frenzySpell;
  if (endMinionFrenzy(m) && frenzy) out.push({ spell: frenzy, minionMaxHp: m.maxHp });
  if ((m.soulLinkBonus ?? 0) !== 0) m.soulLinkBonus = 0;
  summonMinion(m);
  return out;
}
