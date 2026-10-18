// Test-only hand transcription of the 2.7.0 client's PVE combat helpers and processCombatTick
// (module 3963). Statement order, rng draw order and floating-point operation order follow the
// decompiled bytecode. The one change: every `Math.random()` is the injected `rng()`, so a seeded run
// can be compared draw for draw with the engine. Never imported by app code.
import * as M from './minions.client.js';

// transcribed from L1089572-1089584 (module 3963 closure slots 7-13)
export const SILENCE_MS = 3000; // slot7
export const STAGGER_STACKS_TO_STUN = 3; // slot8 (r1 = 3, L1089556)
export const STAGGER_STUN_MS = 2000; // slot9
export const FEAR_MS = 1000; // slot10
export const PARALYZE_MS = 1000; // slot11
export const REGEN_INTERVAL_MS = 100; // slot12
export const REGEN_PULSES_PER_SEC = 10; // slot13

// transcribed from L1085790-1085856
export function absorbWithShield(a0, a1, a2) {
  const r2 = a0;
  const r1 = a1;
  const r3 = a2 !== undefined ? a2 : 0;
  if (r2 <= 0 || r1 <= 0) return { shieldHp: r2, hpDamage: r1, effectiveDamage: r1 };
  if (r3 <= 0) {
    const absorbed = Math.min(r2, r1);
    return { shieldHp: r2 - absorbed, hpDamage: r1 - absorbed, effectiveDamage: r1 };
  }
  const r0 = 1 - r3;
  const cost = r1 * r0;
  if (r2 >= cost) return { shieldHp: r2 - cost, hpDamage: 0, effectiveDamage: cost };
  const hpDamage = r1 - r2 / r0;
  return { shieldHp: 0, hpDamage, effectiveDamage: r2 + hpDamage };
}

// transcribed from L1085885-1085899
export function regenShieldRefillAmount(a0, a1, a2) {
  let r0 = a0;
  if (!a2) r0 = a0 - a1;
  return r0;
}

// transcribed from L1085937-1085969
export function spendHealBudget(a0, a1) {
  const r3 = a0;
  const r5 = a1;
  if (r5 <= 0) return 0;
  if (!r3) return r5;
  const r1 = Math.min(r5, Math.floor(r3.remaining));
  if (r1 <= 0) return 0;
  r3.remaining = r3.remaining - r1;
  return r1;
}

// transcribed from L1085970-1085997
export function applyDamageReduction(a0, a1) {
  const r0 = a0;
  const r2 = a1;
  if (r2 <= 0) return r0;
  if (r0 <= 0) return r0;
  return Math.max(1, Math.round(r0 * (1 - r2 / 100)));
}

// transcribed from L1085998-1086047
export function rollAttackDamage(a0, rng) {
  const r2 = a0;
  const r4 = rng() * 100 < r2.critChance;
  const r5 = r4 ? Math.round(r2.attack * r2.critDamage) : r2.attack;
  let r3 = r2.doubleHit > 0;
  if (r3) r3 = rng() * 100 < r2.doubleHit;
  return { damage: r5, isCrit: r4, isDoubleHit: r3, doubleHitDamage: r3 ? r2.attack : 0 };
}

// transcribed from L1086048-1086072
export function rollPenetrationCritMult(a0, rng) {
  const r0 = a0;
  if (!(r0.critChance > 0)) return 1;
  if (!(rng() * 100 < r0.critChance)) return 1;
  return r0.critDamage;
}

// transcribed from L1086073-1086166
export function rollDisruption(a0, a1, a2, a3, rng) {
  const r8 = a0;
  const r9 = a1;
  const r4 = a2;
  const r3 = a3;
  const r0 = { procced: null, silencedMs: r9, staggerStacks: r4, fearedMs: r3, staggerStunned: false };
  if (r8.disruptionChance <= 0) return r0;
  const r1 = r8.disruptionEffect;
  if (r1 === 'SILENCE' && r9 > 0) return r0;
  if (r1 === 'FEAR' && r3 > 0) return r0;
  if (rng() * 100 >= r8.disruptionChance) return r0;
  if (r1 === 'SILENCE') {
    return { procced: 'SILENCE', silencedMs: SILENCE_MS, staggerStacks: r4, fearedMs: r3, staggerStunned: false };
  }
  if (r1 === 'STAGGER') {
    const stacks = r4 + 1;
    const stunned = stacks >= STAGGER_STACKS_TO_STUN;
    return { procced: 'STAGGER', silencedMs: r9, staggerStacks: stunned ? 0 : stacks, fearedMs: r3, staggerStunned: stunned };
  }
  if (r1 === 'FEAR') {
    return { procced: 'FEAR', silencedMs: r9, staggerStacks: r4, fearedMs: FEAR_MS, staggerStunned: false };
  }
  return undefined;
}

const arg = (v, dflt) => (v !== undefined ? v : dflt);

// transcribed from L1086167-1087434. Positional arguments as the client takes them:
// (player, enemy, attackerHp, defenderHp, timers, dtMs, timestamp, attackerMaxHp, defenderBlinded,
//  defenderParalyzedMs, defenderSilencedMs, defenderStaggerStacks, defenderFearedMs, attackerShieldHp,
//  defenderShieldHp, healBudget, blocksShieldOverflow, minion), then the injected rng.
export function processCombatTick(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11, a12, a13, a14, a15, a16, a17, rng, defenderDazedMs = 0) {
  let dazed = Math.max(0, defenderDazedMs - a5);
  const P = a0; // r44
  const E = a1; // r39
  const dt = a5; // r27
  const ts = a6; // r16
  const blinded0 = arg(a8, false); // r35
  const paralyzedIn = arg(a9, 0);
  const silencedIn = arg(a10, 0);
  const stacks0 = arg(a11, 0); // r30
  const fearedIn = arg(a12, 0);
  const atkShield0 = arg(a13, 0); // r13
  const defShield0 = arg(a14, 0); // r48
  const budget = arg(a15, null); // r52
  const blocksOverflow = arg(a16, false); // r6
  const minion = arg(a17, null); // r37
  const maxHp = a7 == null ? P.maxHp : a7; // r53

  // L1086332-1086380
  const paralyzed0 = Math.max(0, paralyzedIn - dt); // r34
  const silenced0 = Math.max(0, silencedIn - dt); // r31
  const feared0 = Math.max(0, fearedIn - dt); // r29
  const atkTimerAcc = a4.attackerTimer + dt; // r2
  const defTimerAcc = a4.defenderTimer + dt; // r12
  const regenAcc = a4.regenTimer + dt; // r5
  const events = []; // r9
  const pInterval = Math.round(1000 / P.attackSpeed); // r1
  const eInterval = Math.round(1000 / E.attackSpeed); // r0
  const regenDue = regenAcc >= REGEN_INTERVAL_MS; // r4
  const regenTimer = regenDue ? regenAcc - REGEN_INTERVAL_MS : regenAcc; // r11

  // regen L1086381-1086420
  let atkShield = atkShield0; // r3
  let hp = a2; // r54
  if (regenDue && P.hpRegen > 0) {
    const pulse = Math.max(1, Math.round(P.maxHp * P.hpRegen / 100 / REGEN_PULSES_PER_SEC)); // r15
    let applied = 0; // r4 -> r14
    if (a2 < maxHp) applied = Math.min(maxHp - a2, pulse);
    const granted = spendHealBudget(budget, applied);
    let hpAfter = a2;
    if (granted > 0) {
      hpAfter = a2 + granted;
      events.push({ timestamp: ts, type: 'attacker_regen', damage: 0, attackerHp: hpAfter, defenderHp: a3 });
    }
    let refill = 0;
    if (!blocksOverflow) refill = spendHealBudget(budget, regenShieldRefillAmount(pulse, applied, P.shieldRegenAlwaysRefills));
    if (refill > 0 && P.shieldMax > 0 && atkShield0 < P.shieldMax) atkShield = Math.min(P.shieldMax, atkShield0 + refill);
    hp = hpAfter;
  }

  // state carried out of the player swing (L1086813-1086850 register moves)
  let dealt = 0; // r15
  let defShield = defShield0; // r26
  let blinded = blinded0; // r22
  let paralyzed = paralyzed0; // r21
  let silenced = silenced0; // r20
  let stacks = stacks0; // r19
  let feared = feared0; // r18
  let atkHp = hp; // r23
  let defHp = a3; // r33
  let atkTimer = atkTimerAcc; // r24

  const lifesteal = (hpNow, d) => {
    if (!(P.lifesteal > 0)) return hpNow;
    if (!(hpNow < maxHp)) return hpNow;
    const want = Math.min(Math.floor(d * P.lifesteal / 100), maxHp - hpNow);
    const g = spendHealBudget(budget, want);
    if (!(g > 0)) return hpNow;
    return Math.min(maxHp, hpNow + g);
  };

  if (atkTimerAcc >= pInterval) {
    atkTimer = atkTimerAcc - pInterval; // r13
    const miss = E.missChance > 0 && dazed > 0 && P.stanceDazePenFactor > 0 && P.penetration > 0
      ? E.missChance * (1 - Math.min(1, P.stanceDazePenFactor * P.penetration / 100)) : E.missChance;
    const negateP = E.blockChance + miss; // r4
    let negated = negateP > 0;
    if (negated) negated = rng() * 100 < negateP;
    if (!negated) {
      // L1086458-1086760
      const roll = rollAttackDamage(P, rng);
      const d1 = applyDamageReduction(roll.damage, E.damageReduction); // r17
      const d2 = applyDamageReduction(roll.doubleHitDamage, E.damageReduction); // r8
      const s1 = absorbWithShield(defShield0, d1);
      let sh = s1.shieldHp; // r4
      let dh = Math.max(0, a3 - s1.hpDamage); // r7
      let dl = 0 + d1; // r2
      let ah = lifesteal(hp, d1); // r40
      events.push({ timestamp: ts, type: roll.isCrit ? 'attacker_crit' : 'attacker_hit', damage: d1, attackerHp: ah, defenderHp: dh });
      if (roll.isDoubleHit && dh > 0) {
        const s2 = absorbWithShield(sh, d2);
        sh = s2.shieldHp;
        dh = Math.max(0, dh - s2.hpDamage);
        dl = dl + d2;
        ah = lifesteal(ah, d2);
        events.push({ timestamp: ts, type: 'attacker_hit', damage: d2, attackerHp: ah, defenderHp: dh, doubleHit: true });
      }
      let bl = blinded0; // r47
      if (P.blindChance > 0 && !blinded0 && dh > 0 && rng() * 100 < P.blindChance) {
        events.push({ timestamp: ts, type: 'defender_blinded', damage: 0, attackerHp: ah, defenderHp: dh });
        bl = true;
      }
      let pz = paralyzed0; // r45
      if (P.paralyzeChance > 0 && paralyzed0 <= 0 && dh > 0 && rng() * 100 < P.paralyzeChance) {
        pz = PARALYZE_MS;
        events.push({ timestamp: ts, type: 'defender_paralyzed', damage: 0, attackerHp: ah, defenderHp: dh });
      }
      let si = silenced0;
      let st = stacks0;
      let fe = feared0;
      if (P.disruptionChance > 0 && dh > 0) {
        const rd = rollDisruption(P, silenced0, stacks0, feared0, rng);
        if (rd.procced) {
          si = rd.silencedMs;
          st = rd.staggerStacks;
          fe = rd.fearedMs;
          if (rd.procced === 'SILENCE') {
            events.push({ timestamp: ts, type: 'defender_silenced', damage: 0, attackerHp: ah, defenderHp: dh });
          } else if (rd.procced === 'STAGGER') {
            events.push({ timestamp: ts, type: 'defender_staggered', damage: 0, attackerHp: ah, defenderHp: dh, staggerStacks: rd.staggerStacks });
            if (rd.staggerStunned) {
              pz = Math.max(pz, STAGGER_STUN_MS);
              events.push({ timestamp: ts, type: 'defender_paralyzed', damage: 0, attackerHp: ah, defenderHp: dh, paralyzeMs: STAGGER_STUN_MS });
            }
          } else {
            events.push({ timestamp: ts, type: 'defender_feared', damage: 0, attackerHp: ah, defenderHp: dh, fearMs: FEAR_MS });
          }
        }
      }
      dealt = dl; defShield = sh; blinded = bl; paralyzed = pz; silenced = si; stacks = st; feared = fe;
      atkHp = ah; defHp = dh;
    } else {
      // penetration path L1086762-1086884
      let dl = 0; // r42
      let sh = defShield0; // r40
      let ah = hp; // r28
      let dh = a3; // r25
      let shown = 0; // r47
      if (P.penetration > 0 && miss === 0) {
        const base = Math.round(P.attack * P.penetration / 100); // r50
        const r58 = Math.round(base * rollPenetrationCritMult(P, rng));
        let d = r58;
        if (E.damageReduction > 0) d = Math.max(1, Math.round(r58 * (1 - E.damageReduction / 100)));
        const s = absorbWithShield(defShield0, d);
        sh = s.shieldHp;
        dh = Math.max(0, a3 - s.hpDamage);
        dl = 0 + d;
        shown = d;
        ah = lifesteal(hp, d);
      }
      events.push({ timestamp: ts, type: miss > 0 ? 'defender_miss' : 'defender_block', damage: shown, attackerHp: ah, defenderHp: dh });
      dealt = dl; defShield = sh; atkHp = ah; defHp = dh;
    }
    // 2.7.4 L1093800+: after all swing paths, before death/minion processing.
    if (defHp > 0 && P.stanceDazeChance > 0 && P.stanceDazeDurationMs > 0 && rng() * 100 < P.stanceDazeChance) {
      dazed = Math.max(dazed, P.stanceDazeDurationMs);
      events.push({ timestamp: ts, type: 'defender_dazed', damage: 0, attackerHp: atkHp, defenderHp: defHp, dazeMs: P.stanceDazeDurationMs });
    }
    // L1086886-1086896
    if (defHp <= 0) {
      events.push({ timestamp: ts, type: 'defender_dead', damage: 0, attackerHp: atkHp, defenderHp: 0 });
      return {
        attackerHp: atkHp, defenderHp: 0,
        timers: { attackerTimer: atkTimer, defenderTimer: defTimerAcc, regenTimer },
        events, defenderDazedMs: dazed, defenderBlinded: blinded, defenderParalyzedMs: paralyzed, defenderSilencedMs: silenced,
        defenderStaggerStacks: stacks, defenderFearedMs: feared, attackerShieldHp: atkShield,
        defenderShieldHp: defShield, attackerDamageDealt: dealt,
      };
    }
  }

  // minion swing L1086897-1086950
  if (minion && minion.alive && defHp > 0) {
    const sw = M.minionSwing(minion, dt, rng);
    if (sw) {
      const dmg = M.mitigateMinionHit(sw.damage, E.damageReduction); // r29
      const s = absorbWithShield(defShield, dmg);
      defShield = s.shieldHp;
      defHp = Math.max(0, defHp - s.hpDamage);
      M.healMinionLifesteal(minion, dmg);
      events.push({ timestamp: ts, type: sw.isCrit ? 'minion_crit' : 'minion_hit', damage: dmg, attackerHp: atkHp, defenderHp: defHp });
      if (defHp <= 0) {
        // L1087374-1087400
        events.push({ timestamp: ts, type: 'defender_dead', damage: 0, attackerHp: atkHp, defenderHp: 0 });
        return {
          attackerHp: atkHp, defenderHp: 0,
          timers: { attackerTimer: atkTimer, defenderTimer: defTimerAcc, regenTimer },
          events, defenderDazedMs: dazed, defenderBlinded: blinded, defenderParalyzedMs: paralyzed, defenderSilencedMs: silenced,
          defenderStaggerStacks: stacks, defenderFearedMs: feared, attackerShieldHp: atkShield,
          defenderShieldHp: defShield, attackerDamageDealt: dealt,
        };
      }
    }
  }

  // enemy swing L1086951-1087373
  let defTimer = defTimerAcc; // r29
  let outAtkShield = atkShield; // r26
  let outBlinded = blinded; // r27
  let outAtkHp = atkHp; // r30
  let outDefHp = defHp; // r28
  const enemyLifesteal = (hpNow, d) => {
    if (!(E.lifesteal > 0)) return hpNow;
    if (!(hpNow < E.maxHp)) return hpNow;
    const h = Math.floor(d * E.lifesteal / 100);
    if (!(h > 0)) return hpNow;
    return Math.min(E.maxHp, hpNow + h);
  };
  const deadReturn = (shieldNow, defHpNow) => ({
    attackerHp: 0, defenderHp: defHpNow,
    timers: { attackerTimer: atkTimer, defenderTimer: defTimer, regenTimer },
    events, defenderDazedMs: dazed, defenderBlinded: blinded, defenderParalyzedMs: paralyzed, defenderSilencedMs: silenced,
    defenderStaggerStacks: stacks, defenderFearedMs: feared, attackerShieldHp: shieldNow,
    defenderShieldHp: defShield, attackerDamageDealt: dealt,
  });
  if (defTimerAcc >= eInterval) {
    defTimer = defTimerAcc - eInterval;
    if (paralyzed > 0) {
      events.push({ timestamp: ts, type: 'defender_paralyze', damage: 0, attackerHp: atkHp, defenderHp: defHp });
    } else if (feared > 0) {
      events.push({ timestamp: ts, type: 'defender_fear', damage: 0, attackerHp: atkHp, defenderHp: defHp });
    } else if (blinded) {
      events.push({ timestamp: ts, type: 'defender_blind', damage: 0, attackerHp: atkHp, defenderHp: defHp });
      outBlinded = false;
    } else if (minion && minion.alive) {
      // L1087238-1087328
      const isCrit = rng() * 100 < E.critChance; // r40
      const raw = isCrit ? Math.round(E.attack * E.critDamage) : E.attack;
      const r = M.damageMinion(minion, raw);
      const dh = enemyLifesteal(defHp, r.dealt); // r33
      const ev = { timestamp: ts, type: 'minion_damaged', damage: r.dealt, attackerHp: atkHp, defenderHp: dh };
      if (isCrit) Object.assign(ev, { isCrit: true });
      events.push(ev);
      if (r.died) {
        events.push(Object.assign({ timestamp: ts, type: 'minion_dead', damage: 0, attackerHp: atkHp, defenderHp: dh }, M.minionDeathMeta(minion)));
      }
      outDefHp = dh;
    } else {
      const negateE = P.blockChance + P.missChance; // r35
      let negated = negateE > 0;
      if (negated) negated = rng() * 100 < negateE;
      if (!negated) {
        // L1087024-1087099
        const raw = rng() * 100 < E.critChance ? Math.round(E.attack * E.critDamage) : E.attack; // r48
        let d = raw;
        if (P.damageReduction > 0) d = Math.max(1, Math.round(raw * (1 - P.damageReduction / 100)));
        const mit = P.shieldMitigation == null ? 0 : P.shieldMitigation;
        const s = absorbWithShield(atkShield, d, mit);
        const newShield = s.shieldHp; // r34
        const newHp = Math.max(0, atkHp - s.hpDamage); // r33
        const shown = Math.round(s.effectiveDamage); // r43
        const dh = enemyLifesteal(defHp, shown); // r35
        events.push({ timestamp: ts, type: newHp <= 0 ? 'attacker_dead' : 'defender_hit', damage: shown, attackerHp: newHp, defenderHp: dh });
        if (newHp <= 0) return deadReturn(newShield, dh);
        outAtkShield = newShield; outAtkHp = newHp; outDefHp = dh;
      } else {
        // L1087100-1087236
        let newShield = atkShield; // r34
        let newHp = atkHp; // r33
        let dh = defHp; // r35
        let shown = 0; // r43
        if (E.penetration > 0 && P.missChance === 0) {
          const base = Math.round(E.attack * E.penetration / 100); // r47
          const r52 = Math.round(base * rollPenetrationCritMult(E, rng));
          let d = r52;
          if (P.damageReduction > 0) d = Math.max(1, Math.round(r52 * (1 - P.damageReduction / 100)));
          const mit = P.shieldMitigation == null ? 0 : P.shieldMitigation;
          const s = absorbWithShield(atkShield, d, mit);
          newShield = s.shieldHp;
          newHp = Math.max(0, atkHp - s.hpDamage);
          shown = Math.round(s.effectiveDamage);
          dh = enemyLifesteal(defHp, shown);
        }
        events.push({ timestamp: ts, type: P.missChance > 0 ? 'attacker_miss' : 'attacker_block', damage: shown, attackerHp: newHp, defenderHp: dh });
        if (P.missChance === 0 && newHp > 0 && P.stanceShieldBashChance > 0 && P.stanceShieldBashStunMs > 0 && rng() * 100 < P.stanceShieldBashChance) {
          paralyzed = Math.max(paralyzed, P.stanceShieldBashStunMs);
          events.push({ timestamp: ts, type: 'defender_paralyzed', damage: 0, attackerHp: newHp, defenderHp: dh,
            paralyzeMs: P.stanceShieldBashStunMs, stunSource: 'SHIELD_BASH', shieldBash: true });
        }
        if (newHp <= 0) return deadReturn(newShield, dh);
        outAtkShield = newShield; outAtkHp = newHp; outDefHp = dh;
      }
    }
  }

  // L1087330-1087372 (case 4568)
  return {
    attackerHp: outAtkHp, defenderHp: outDefHp,
    timers: { attackerTimer: atkTimer, defenderTimer: defTimer, regenTimer },
    events, defenderDazedMs: dazed, defenderBlinded: outBlinded, defenderParalyzedMs: paralyzed, defenderSilencedMs: silenced,
    defenderStaggerStacks: stacks, defenderFearedMs: feared, attackerShieldHp: outAtkShield,
    defenderShieldHp: defShield, attackerDamageDealt: dealt,
  };
}
