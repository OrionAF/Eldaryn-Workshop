// PvP balance configs (2.8.2 module 5735) and the damage ramp helpers of module 5734. Pure; no rng.
// Rules: Game/updates-2.8.2.md §1-§2.
import { PVP_BALANCE } from '../../game/combatPvp.js';

/** Flat x8 HP, no late-fight rule: simulateArenaPvP's default (the pre-2.8.2 arena). */
export const LEGACY_PVP_BALANCE = PVP_BALANCE.LEGACY;
/** The live Arena / Clan War config: level-curve HP and double damage after 40 s. */
export const DEFAULT_PVP_BALANCE = PVP_BALANCE.DEFAULT;
/** Flat x1 HP, no late-fight rule. */
export const FORTRESS_PVP_BALANCE = PVP_BALANCE.FORTRESS;

// port of pvpFightLevel L1610891-1610903
/** `level`, or `fallback` when level is null or undefined. */
export function pvpFightLevel(level, fallback) {
  return level == null ? fallback : level;
}

// port of pvpHpMultiplierFor L1610905-1610997
/**
 * HP multiplier of a balance config at a fight level. `flat` returns its value. `levelCurve` sorts its
 * points by level and interpolates linearly between neighbours, clamping to the end points; an
 * undefined level takes the last (highest) point, an empty curve 1.
 */
export function pvpHpMultiplierFor(balance, level) {
  const hp = balance.hpMultiplier;
  if (hp.kind === 'flat') return hp.value;
  const pts = [...hp.points].sort((a, b) => a.level - b.level);
  if (pts.length === 0) return 1;
  const last = pts[pts.length - 1];
  if (level === undefined) return last.multiplier;
  if (level <= pts[0].level) return pts[0].multiplier;
  if (level >= last.level) return last.multiplier;
  for (let i = 1; i < pts.length; i++) {
    if (level <= pts[i].level) {
      const lo = pts[i - 1];
      const hi = pts[i];
      return lo.multiplier + (hi.multiplier - lo.multiplier) * ((level - lo.level) / (hi.level - lo.level));
    }
  }
  return last.multiplier;
}

// port of pvpDamageRampMult L1610998-1611029
/** Early-fight damage ramp: startMult rising linearly to 1 over rampMs. 1 without a ramp (all three configs). */
export function pvpDamageRampMult(ramp, elapsedMs) {
  if (!ramp) return 1;
  if (!(elapsedMs < ramp.rampMs)) return 1;
  return ramp.startMult + (1 - ramp.startMult) * (Math.max(0, elapsedMs) / ramp.rampMs);
}

// port of pvpLateFightDamageMult L1611065-1611104
/**
 * Late-fight damage: 1 up to and including `startMs`, then `multiplier` (rising linearly over `rampMs`
 * when rampMs > 0). `elapsedMs` counts from the end of the minion opening.
 */
export function pvpLateFightDamageMult(late, elapsedMs) {
  if (!late || late.multiplier === 1 || !(elapsedMs > late.startMs)) return 1;
  if (!(late.rampMs > 0) || elapsedMs >= late.startMs + late.rampMs) return late.multiplier;
  return 1 + (late.multiplier - 1) * ((elapsedMs - late.startMs) / late.rampMs);
}

// port of rampDamage L1603749-1603773 (also processSpellsTick's rampSpellDmg L1101448-1101475)
/** `max(1, round(damage * mult))` for positive damage when mult is not 1; otherwise `damage`. */
export function rampDamage(damage, mult) {
  if (mult === 1 || !(damage > 0)) return damage;
  return Math.max(1, Math.round(damage * mult));
}

// port of rampDebuffTick L1603775-1603850
/**
 * Ramps every positive `debuff_tick` event of a processDebuffsTick result (value and damagePerTick)
 * and moves `targetHpDelta` by the difference. Returns the result itself when mult is 1.
 */
export function rampDebuffTick(result, mult) {
  if (mult === 1) return result;
  let targetHpDelta = result.targetHpDelta;
  const events = result.events.map((ev) => {
    if (ev.type !== 'debuff_tick' || !(ev.value > 0)) return ev;
    const value = rampDamage(ev.value, mult);
    targetHpDelta += ev.value - value;
    return { ...ev, value, damagePerTick: value };
  });
  return { ...result, events, targetHpDelta };
}
