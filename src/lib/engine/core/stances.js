// 2.7.4 shared combat helpers L1096801-1096950; Game/combat-pve.md §22.
export const SHIELD_BASH_STUN_SOURCE = 'SHIELD_BASH';

export const STANCE_FIELDS = Object.freeze([
  'stanceDazeChance', 'stanceDazeDurationMs', 'stanceDazePenFactor',
  'stanceShieldBashChance', 'stanceShieldBashStunMs',
]);

export function rollStanceDaze(attacker, dazedMs, rng) {
  const chance = attacker.stanceDazeChance ?? 0;
  const durationMs = attacker.stanceDazeDurationMs ?? 0;
  if (chance > 0 && durationMs > 0 && rng() * 100 < chance) {
    return { procced: true, dazedMs: Math.max(dazedMs, durationMs), durationMs };
  }
  return { procced: false, dazedMs, durationMs: 0 };
}

export function dazedMissChance(miss, dazedMs, attacker) {
  const factor = attacker.stanceDazePenFactor ?? 0;
  if (miss <= 0 || dazedMs <= 0 || factor <= 0 || attacker.penetration <= 0) return miss;
  return miss * (1 - Math.min(1, factor * attacker.penetration / 100));
}

export function rollShieldBash(defender, rng) {
  const chance = defender.stanceShieldBashChance ?? 0;
  const stun = defender.stanceShieldBashStunMs ?? 0;
  return chance > 0 && stun > 0 && rng() * 100 < chance ? stun : 0;
}

export const tickDazedMs = (ms, dtMs) => ms > 0 ? Math.max(0, ms - dtMs) : 0;
export const castLockoutMs = (entity) => Math.max(entity.silencedMs ?? 0, entity.paralyzedMs ?? 0, entity.fearedMs ?? 0);
