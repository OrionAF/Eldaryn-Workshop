// Chrono Flux: the bar Eternal-gear conduits charge to fire an Ancient sigil's transform.
// Module 3967, L1094004-1094190. Game facts: Game/sigils.md §9, Game/gear.md §7.
//
// Units (resolves the sigils.md §9 [UNRESOLVED] note): flux is gained PER EVENT, not per damage.
// Each combat event adds `conduitValue * weight`, divided by 3^(times the transform has already
// fired this fight). The bar is clamped to 0..7000. CHRONO_FLUX_RECHARGE_FACTOR is 3, not 50.

/** Bar maximum and per-event weights (L1094180). */
export const CHRONO_FLUX = Object.freeze({
  MAX: 7000,
  FLAME_HIT: 1,
  FLAME_BLOCKED: 0.7,
  EARTHEN_HIT: 0.7,
  EARTHEN_BLOCKED: 1,
});

/** Base of the per-fire gain divisor (L1094181-1094183). */
export const CHRONO_FLUX_RECHARGE_FACTOR = 3;

// port of chronoFluxGainDivisor L1094006-1094020
/** 3 ^ max(0, fireCount): each transform already fired makes the next charge 3x slower. */
export function chronoFluxGainDivisor(fireCount) {
  return Math.pow(CHRONO_FLUX_RECHARGE_FACTOR, Math.max(0, fireCount));
}

// port of clampChronoFlux L1094039-1094065
export function clampChronoFlux(flux) {
  return Math.max(0, Math.min(CHRONO_FLUX.MAX, flux));
}

// port of chronoFluxFromEvents L1094066-1094178
/**
 * Flux gained from one tick's events.
 *  - `attacker_hit`, `attacker_crit`: flame * FLAME_HIT (the player's hit landed)
 *  - `defender_block`: flame * FLAME_BLOCKED (the enemy blocked the player's hit)
 *  - `defender_hit`: earthen * EARTHEN_HIT (the player took a hit)
 *  - `attacker_block`: earthen * EARTHEN_BLOCKED (the player blocked)
 * The Dark conduit adds to both the flame and earthen values. When flame and earthen (with dark) are
 * both <= 0 the result is 0. The sum is divided by 3^fireCount.
 * @param {Array<{type: string}>} events
 * @param {number} flame  Flame conduit value on the gear
 * @param {number} earthen  Earthen conduit value
 * @param {number} [dark=0]  Dark conduit value
 * @param {number} [fireCount=0]  transforms already fired this fight
 */
export function chronoFluxFromEvents(events, flame, earthen, dark = 0, fireCount = 0) {
  const f = flame + dark;
  const e = earthen + dark;
  if (f <= 0 && e <= 0) return 0;
  let sum = 0;
  for (const ev of events) {
    switch (ev.type) {
      case 'attacker_hit':
      case 'attacker_crit':
        sum += f * CHRONO_FLUX.FLAME_HIT;
        break;
      case 'defender_block':
        sum += f * CHRONO_FLUX.FLAME_BLOCKED;
        break;
      case 'defender_hit':
        sum += e * CHRONO_FLUX.EARTHEN_HIT;
        break;
      case 'attacker_block':
        sum += e * CHRONO_FLUX.EARTHEN_BLOCKED;
        break;
      default:
        break;
    }
  }
  return sum / chronoFluxGainDivisor(fireCount);
}
