// Test-only hand transcription of the 2.7.0 client's sigil scaling (module with SIGIL_CONSTANTS).
// Statement and floating-point order follow the decompiled bytecode; constants are the client's
// literals. Never imported by app code.

// transcribed from L1068802 (SIGIL_CONSTANTS) and L1068838 (SIGIL_ALTAR_CONSTANTS)
export const STAT_GROWTH_PER_LEVEL = 0.1;
export const SPELL_GROWTH_PER_LEVEL = 0.08;
export const TIER_STAT_MULT = 3;

// transcribed from L1066773-1066807
export function sigilTierStatMult(...args) {
  let r0 = 1;
  if (args.length > 0 && args[0] !== undefined) r0 = args[0];
  if (!r0) r0 = 1;
  return Math.pow(TIER_STAT_MULT, Math.max(0, r0 - 1));
}

// transcribed from L1067546-1067583
export function getSigilBonusAttack(a0, a1, ...rest) {
  const r4 = rest.length > 0 && rest[0] !== undefined ? rest[0] : 1;
  let r3 = (a1 - 1) * STAT_GROWTH_PER_LEVEL;
  r3 = 1 + r3;
  r3 = a0.baseAttack * r3;
  return Math.floor(r3 * sigilTierStatMult(r4));
}

// transcribed from L1067584-1067621
export function getSigilBonusHp(a0, a1, ...rest) {
  const r4 = rest.length > 0 && rest[0] !== undefined ? rest[0] : 1;
  let r3 = (a1 - 1) * STAT_GROWTH_PER_LEVEL;
  r3 = 1 + r3;
  r3 = a0.baseHp * r3;
  return Math.floor(r3 * sigilTierStatMult(r4));
}

const fix = (v, d) => parseFloat(v.toFixed(d));
const orInf = (m) => (m == null ? Infinity : m);

// transcribed from L1067622-1068264. Dispatches on `spell.spellType`, as the client does.
export function getSigilSpellScaled(a0, a1) {
  const r1 = a0;
  const r2 = 1 + (a1 - 1) * SPELL_GROWTH_PER_LEVEL; // _closure2_slot0
  const r4 = 1;
  const t = r1.spellType;
  // 2.7.4 L1073918-1074078 (grow only when a maximum exists).
  if (t === 'STANCE') {
    function grow(value, maximum, precision) {
      if (maximum == null) return value;
      return Math.min(parseFloat((value * r2).toFixed(precision)), maximum);
    }
    const result = { ...r1 };
    result.attackMult = r1.maxAttackMult != null && r1.attackMult > r4
      ? parseFloat((r4 + grow(r1.attackMult - r4, r1.maxAttackMult - r4, 3)).toFixed(3)) : r1.attackMult;
    if (r1.hpPercent != null) result.hpPercent = grow(r1.hpPercent, r1.maxHpPercent, r4);
    if (r1.spellResist != null) result.spellResist = grow(r1.spellResist, r1.maxSpellResist, r4);
    if (r1.daze) result.daze = { ...r1.daze, chancePercent: grow(r1.daze.chancePercent, r1.daze.maxChancePercent, r4) };
    if (r1.shieldBash) {
      const bash = r1.shieldBash;
      result.shieldBash = { ...bash, chancePercent: grow(bash.chancePercent, bash.maxChancePercent, r4),
        stunMs: bash.maxStunMs != null ? Math.min(Math.round(bash.stunMs * r2 / 100) * 100, bash.maxStunMs) : bash.stunMs };
    }
    return result;
  }
  if (t === 'AURA') {
    // case 2236
    const digits = r1.bonusStat === 'ATTACK_SPEED' ? 2 : r4;
    const r0 = { ...r1 };
    r0.bonusValue = fix(r1.bonusValue * r2, digits);
    return r0;
  }
  if (t === 'DAMAGE') {
    // case 1674
    const r0 = { ...r1 };
    r0.baseDamage = Math.floor(r1.baseDamage * r2);
    r0.attackPercent = r1.attackPercent != null ? Math.min(fix(r1.attackPercent * r2, r4), orInf(r1.maxAttackPercent)) : undefined;
    r0.damagePerTick = r1.damagePerTick != null ? Math.floor(r1.damagePerTick * r2) : undefined;
    Object.assign(r0, r1.slow ? { slow: { ...r1.slow, attackSpeedReductionPercent: Math.min(fix(r1.slow.attackSpeedReductionPercent * r2, r4), r1.slow.maxAttackSpeedReductionPercent) } } : {});
    Object.assign(r0, r1.wound ? { wound: { ...r1.wound, regenReductionPercent: Math.min(fix(r1.wound.regenReductionPercent * r2, r4), r1.wound.maxRegenReductionPercent) } } : {});
    Object.assign(r0, r1.critDown ? { critDown: { ...r1.critDown, critChanceReduction: Math.min(fix(r1.critDown.critChanceReduction * r2, r4), r1.critDown.maxCritChanceReduction) } } : {});
    return r0;
  }
  if (t === 'BUFF') {
    // case 1055
    const r0 = { ...r1 };
    r0.effects = r1.effects.map((e) => ({ ...e, value: Math.min(fix(e.value * r2, 1), orInf(e.maxValue)) }));
    r0.thornsPercent = r1.thornsPercent != null ? Math.min(fix(r1.thornsPercent * r2, r4), orInf(r1.maxThornsPercent)) : undefined;
    if (r1.minionEmpower) {
      const m = r1.minionEmpower;
      Object.assign(r0, { minionEmpower: {
        ...m,
        maxHpPercent: Math.min(fix(m.maxHpPercent * r2, r4), m.maxMaxHpPercent),
        regenPercentPerTick: Math.min(fix(m.regenPercentPerTick * r2, r4), m.maxRegenPercentPerTick),
      } });
    }
    if (r1.minionFrenzy) {
      const m = r1.minionFrenzy;
      Object.assign(r0, { minionFrenzy: {
        ...m,
        attackPercent: Math.min(fix(m.attackPercent * r2, r4), m.maxAttackPercent),
        attackSpeedPercent: Math.min(fix(m.attackSpeedPercent * r2, r4), m.maxAttackSpeedPercent),
        lifesteal: Math.min(fix(m.lifesteal * r2, r4), m.maxLifesteal),
      } });
    }
    return r0;
  }
  if (t === 'HEAL') {
    // case 997
    const r0 = { ...r1 };
    r0.healPercentPerTick = fix(r1.healPercentPerTick * r2, r4);
    return r0;
  }
  if (t === 'DEBUFF') {
    // case 593
    const r0 = { ...r1 };
    r0.initialAttackPercent = r1.maxInitialAttackPercent == null
      ? fix(r1.initialAttackPercent * r2, r4)
      : Math.min(fix(r1.initialAttackPercent * r2, r4), r1.maxInitialAttackPercent);
    const r6 = { ...r1.debuff };
    r6.regenReductionPercent = r1.debuff.regenReductionPercent == null || r1.debuff.maxRegenReductionPercent == null
      ? r1.debuff.regenReductionPercent
      : Math.min(fix(r1.debuff.regenReductionPercent * r2, r4), r1.debuff.maxRegenReductionPercent);
    r6.damagePerTickPercent = r1.debuff.damagePerTickPercent == null || r1.debuff.maxDamagePerTickPercent == null
      ? r1.debuff.damagePerTickPercent
      : Math.min(fix(r1.debuff.damagePerTickPercent * r2, r4), r1.debuff.maxDamagePerTickPercent);
    r0.debuff = r6;
    return r0;
  }
  if (t === 'TRANSFORM') {
    // case 549
    const r0 = { ...r1 };
    r0.effects = r1.effects.map((e) => ({ ...e, value: Math.min(fix(e.value * r2, 1), orInf(e.maxValue)) }));
    return r0;
  }
  if (t === 'SHIELD') {
    // case 468
    const r0 = { ...r1 };
    r0.shieldHpPercent = Math.min(fix(r1.shieldHpPercent * r2, r4), r1.maxShieldHpPercent);
    return r0;
  }
  if (t === 'STACK') return { ...r1 };
  if (t === 'SUMMON') {
    // case 310
    const r0 = { ...r1 };
    r0.attackPercent = Math.min(fix(r1.attackPercent * r2, r4), r1.maxAttackPercent);
    r0.hpPercent = Math.min(fix(r1.hpPercent * r2, r4), r1.maxHpPercent);
    return r0;
  }
  if (t === 'FORM') return { ...r1 };
  if (t === 'DEFENSE') return { ...r1 };
  return undefined;
}
