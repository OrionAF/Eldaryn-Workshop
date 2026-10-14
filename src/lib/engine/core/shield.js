// Shield absorption and the heal budget. Pure functions; the heal budget is a mutable
// {remaining, perMs, max} record updated in place, as in the client.

// port of absorbWithShield L1085790-1085856
/**
 * Damage taken by a shield. `mitigation` is a fraction set by the fight's caller, per mode
 * (combat-pve.md §13): each point of damage costs `1 - mitigation` shield, so at 0.5 a shield point
 * absorbs 2 damage, at 0 one. No absorb when damage <= 0 or shield <= 0.
 * @returns {{shieldHp:number, hpDamage:number, effectiveDamage:number}}
 */
export function absorbWithShield(shieldHp, damage, mitigation = 0) {
  if (shieldHp <= 0 || damage <= 0) return { shieldHp, hpDamage: damage, effectiveDamage: damage };
  if (mitigation > 0) {
    const cost = damage * (1 - mitigation);
    if (shieldHp >= cost) return { shieldHp: shieldHp - cost, hpDamage: 0, effectiveDamage: cost };
    const hpDamage = damage - shieldHp / (1 - mitigation);
    return { shieldHp: 0, hpDamage, effectiveDamage: shieldHp + hpDamage };
  }
  const absorbed = Math.min(shieldHp, damage);
  return { shieldHp: shieldHp - absorbed, hpDamage: damage - absorbed, effectiveDamage: damage };
}

// port of shieldRefillAmount L1085857-1085884
/**
 * Shield refill from a heal event. `appliedHpGain` is the HP actually gained (after the max-HP clamp);
 * the overflow `ownerHpDelta - appliedHpGain` refills the shield. With `vampAlwaysRefills`, a vamp
 * heal refills at least its full amount. `ownerShieldRefill` (default 0) is added on top.
 * @param {{ownerHpDelta:number, ownerVampHeal?:number, ownerShieldRefill?:number}} ev
 */
export function shieldRefillAmount(ev, appliedHpGain, vampAlwaysRefills) {
  const overflow = ev.ownerHpDelta - appliedHpGain;
  const base = vampAlwaysRefills ? Math.max(ev.ownerVampHeal, overflow) : overflow;
  return base + (ev.ownerShieldRefill == null ? 0 : ev.ownerShieldRefill);
}

// port of regenShieldRefillAmount L1085885-1085899
/** Regen shield refill: the whole regen heal when `regenAlwaysRefills`, else only the overflow. */
export function regenShieldRefillAmount(regenHeal, appliedHpGain, regenAlwaysRefills) {
  return regenAlwaysRefills ? regenHeal : regenHeal - appliedHpGain;
}

// port of createHealBudget L1085900-1085919
/** Heal budget: `maxHp * percent / 100` (floored at 0), refilling over 1000 ms. */
export function createHealBudget(maxHp, percent) {
  const remaining = Math.max(0, (maxHp * percent) / 100);
  return { remaining, perMs: remaining / 1000, max: remaining };
}

// port of refillHealBudget L1085920-1085936
/** Adds `perMs * dtMs`, capped at `max`. Mutates `budget`. */
export function refillHealBudget(budget, dtMs) {
  budget.remaining = Math.min(budget.max, budget.remaining + budget.perMs * dtMs);
}

// port of spendHealBudget L1085937-1085969
/**
 * Spends up to `want` whole HP from the budget and returns the amount granted
 * (min(want, floor(remaining))). A missing budget grants `want`; `want <= 0` grants 0.
 */
export function spendHealBudget(budget, want) {
  if (want <= 0) return 0;
  if (!budget) return want;
  const granted = Math.min(want, Math.floor(budget.remaining));
  if (granted > 0) {
    budget.remaining -= granted;
    return granted;
  }
  return 0;
}
