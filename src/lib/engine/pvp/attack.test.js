import { describe, it, expect } from 'vitest';
import { scripted, mulberry32 } from '../rng.js';
import { createMobEntity, createPlayerEntity } from '../core/entity.js';
import { applyRegen, processAttack, pvpRatingToFraction, REGEN_PULSE_MS } from './attack.js';
import { applyPvpHpBuff, getPvpHpMultiplier } from './hpBuff.js';

const ent = (over = {}) => Object.assign(createMobEntity({ hp: 1000, attack: 100, attackSpeed: 1 }), over);
const minion = (over = {}) => ({ alive: true, hp: 50, maxHp: 50, respawnCooldownMs: 0, respawnMs: 0, ...over });
// rng value v makes `rng()*100 < p` true iff v*100 < p; HIT = always succeeds, MISS = always fails.
const HIT = 0.0;
const MISS = 0.999;

describe('pvpRatingToFraction (L1452748-1452763)', () => {
  it('r<=0 is 0; r/(r+200) otherwise', () => {
    expect(pvpRatingToFraction(0)).toBe(0);
    expect(pvpRatingToFraction(-10)).toBe(0);
    expect(pvpRatingToFraction(200)).toBe(0.5); // 200/400
    expect(pvpRatingToFraction(300)).toBeCloseTo(0.6, 12); // 300/500
    expect(pvpRatingToFraction(1e9)).toBeLessThan(1);
  });
});

describe('getPvpHpMultiplier / applyPvpHpBuff (L1452741-1452746, L1454678-1454717)', () => {
  it('multiplier is 8', () => expect(getPvpHpMultiplier()).toBe(8));
  it('floor(totalHp*8) with pre-multiplier HP in pvpBaseHp; input untouched', () => {
    const s = { totalHp: 1000.5, totalAttack: 7 };
    const b = applyPvpHpBuff(s); // floor(8004) = 8004
    expect(b).toEqual({ totalHp: 8004, totalAttack: 7, pvpBaseHp: 1000.5 });
    expect(s).toEqual({ totalHp: 1000.5, totalAttack: 7 });
    expect(applyPvpHpBuff({ totalHp: 1001.3 }).totalHp).toBe(8010); // floor(8010.4)
  });
  it('already-buffed (pvpBaseHp defined) or mult 1 returns the same object', () => {
    const buffed = { totalHp: 8000, pvpBaseHp: 1000 };
    expect(applyPvpHpBuff(buffed)).toBe(buffed);
    const s = { totalHp: 500 };
    expect(applyPvpHpBuff(s, 1)).toBe(s);
  });
  it('mult override (36x Final Battle shape)', () => {
    expect(applyPvpHpBuff({ totalHp: 100 }, 36)).toEqual({ totalHp: 3600, pvpBaseHp: 100 });
  });
  it('feeds createPlayerEntity: maxHp = hp = x8 pool, rawMaxHp = pre-x8 HP', () => {
    const e = createPlayerEntity(applyPvpHpBuff({ totalHp: 1000 }));
    expect([e.maxHp, e.hp, e.rawMaxHp]).toEqual([8000, 8000, 1000]);
  });
});

describe('applyRegen (L1452765-1452839)', () => {
  it('below 100 ms: nothing, timer unchanged', () => {
    const e = ent({ hp: 10, rawMaxHp: 1000, hpRegen: 5 });
    expect(applyRegen(e, 99)).toEqual({ timer: 99, healed: 0, overflow: 0 });
    expect(e.hp).toBe(10);
  });
  it('hpRegen <= 0: timer still drops by 100', () => {
    const e = ent({ hp: 10, hpRegen: 0 });
    expect(applyRegen(e, 250)).toEqual({ timer: 150, healed: 0, overflow: 0 });
  });
  it('pulse = round(rawMaxHp * regen/100 / 10): 1000*5/100/10 = 5', () => {
    const e = ent({ hp: 10, maxHp: 8000, rawMaxHp: 1000, hpRegen: 5 });
    expect(applyRegen(e, REGEN_PULSE_MS)).toEqual({ timer: 0, healed: 5, overflow: 0 });
    expect(e.hp).toBe(15);
  });
  it('sized off rawMaxHp, not the x8 pool', () => {
    const e = ent({ hp: 10, maxHp: 80000, rawMaxHp: 10000, hpRegen: 1 }); // 10000*0.01/10 = 10
    expect(applyRegen(e, 100).healed).toBe(10);
  });
  it('minimum pulse is 1 (10*1/100/10 = 0.01 rounds to 0)', () => {
    const e = ent({ hp: 1, maxHp: 10, rawMaxHp: 10, hpRegen: 1 });
    expect(applyRegen(e, 100).healed).toBe(1);
  });
  it('near max: heal clamps, remainder is the shield overflow (5 - 2 = 3); always-refills gives 5', () => {
    const e = ent({ hp: 998, maxHp: 1000, rawMaxHp: 1000, hpRegen: 5 });
    expect(applyRegen(e, 100)).toEqual({ timer: 0, healed: 2, overflow: 3 });
    const f = ent({ hp: 998, maxHp: 1000, rawMaxHp: 1000, hpRegen: 5, shieldRegenAlwaysRefills: true });
    expect(applyRegen(f, 100)).toEqual({ timer: 0, healed: 2, overflow: 5 });
  });
  it('at max HP: no heal, overflow is the whole pulse even without the always-refills switch', () => {
    const e = ent({ hp: 1000, maxHp: 1000, rawMaxHp: 1000, hpRegen: 5 });
    expect(applyRegen(e, 100)).toEqual({ timer: 0, healed: 0, overflow: 5 });
  });
  it('buffedMaxHp overrides maxHp', () => {
    const e = ent({ hp: 1000, maxHp: 1000, rawMaxHp: 1000, hpRegen: 5 });
    expect(applyRegen(e, 100, 1200)).toEqual({ timer: 0, healed: 5, overflow: 0 });
    expect(e.hp).toBe(1005);
  });
});

describe('processAttack: hit path (L1452929-1453141)', () => {
  it('plain hit: 1 draw (crit) only, event labelled by the swinger', () => {
    const atk = ent({ attack: 100 });
    const def = ent({ hp: 500 });
    const rng = scripted([MISS]);
    const ev = processAttack(atk, def, 10, true, null, null, rng);
    expect(rng.draws).toBe(1);
    expect(def.hp).toBe(400);
    expect(ev).toEqual([{ timestamp: 10, type: 'attacker_hit', damage: 100, attackerHpAfter: 1000, defenderHpAfter: 400 }]);
    const ev2 = processAttack(def, atk, 20, false, null, null, scripted([MISS]));
    expect(ev2[0].type).toBe('defender_hit');
  });
  it('crit multiplies before mitigation: round(100*1.5)=150', () => {
    const atk = ent({ attack: 100, critChance: 50, critDamage: 1.5 });
    const def = ent({ hp: 500 });
    const ev = processAttack(atk, def, 0, true, null, null, scripted([0.1])); // 10 < 50
    expect(ev[0]).toMatchObject({ type: 'attacker_crit', damage: 150 });
    expect(def.hp).toBe(350);
  });
  it('mitigate order DR -> PVP Attack -> PVP Defense, integer each step: 100 -> 80 -> 120 -> 60', () => {
    // DR 20: round(100*0.8)=80; pvpAttack 200: frac 0.5, round(80*1.5)=120; pvpDefense 200: round(120*0.5)=60
    const atk = ent({ attack: 100, pvpAttack: 200 });
    const def = ent({ hp: 500, damageReduction: 20, pvpDefense: 200 });
    const ev = processAttack(atk, def, 0, true, null, null, scripted([MISS]));
    expect(ev[0].damage).toBe(60);
    expect(def.hp).toBe(440);
  });
  it('DR and PVP Defense floor at 1; PVP Attack has no floor', () => {
    const def = ent({ hp: 500, damageReduction: 90 });
    expect(processAttack(ent({ attack: 1 }), def, 0, true, null, null, scripted([MISS]))[0].damage).toBe(1); // round(0.1)=0 -> 1
    const def2 = ent({ hp: 500, pvpDefense: 1e9 });
    expect(processAttack(ent({ attack: 5 }), def2, 0, true, null, null, scripted([MISS]))[0].damage).toBe(1);
    // attack 0 with DR: client floors to 1 even for 0 damage
    const def3 = ent({ hp: 500, damageReduction: 10 });
    expect(processAttack(ent({ attack: 0 }), def3, 0, true, null, null, scripted([MISS]))[0].damage).toBe(1);
  });
  it('shield absorbs 1:1 first; remainder to HP', () => {
    const def = ent({ hp: 500, shieldHp: 40 });
    processAttack(ent({ attack: 100 }), def, 0, true, null, null, scripted([MISS]));
    expect([def.shieldHp, def.hp]).toEqual([0, 440]);
  });
  it('lifesteal heals floor(dmg*ls/100) of the post-mitigation damage, shield-absorbed part included', () => {
    const atk = ent({ attack: 100, lifesteal: 15, hp: 500, maxHp: 1000 });
    const def = ent({ hp: 500, shieldHp: 1000 });
    processAttack(atk, def, 0, true, null, null, scripted([MISS]));
    expect(atk.hp).toBe(515); // floor(15)
    expect(def.hp).toBe(500);
  });
  it('lifesteal: capped at the maxHp argument, skipped at full HP or dead, floor(0.9) = 0 heals nothing', () => {
    const atk = ent({ attack: 100, lifesteal: 50, hp: 990, maxHp: 99999 });
    processAttack(atk, ent({ hp: 500 }), 0, true, 1000, null, scripted([MISS]));
    expect(atk.hp).toBe(1000); // min(1000, 990+50)
    const full = ent({ attack: 100, lifesteal: 50, hp: 1000, maxHp: 1000 });
    processAttack(full, ent({ hp: 500 }), 0, true, null, null, scripted([MISS]));
    expect(full.hp).toBe(1000);
    const tiny = ent({ attack: 1, lifesteal: 50, hp: 10, maxHp: 1000 });
    processAttack(tiny, ent({ hp: 500 }), 0, true, null, null, scripted([MISS])); // floor(0.5)=0
    expect(tiny.hp).toBe(10);
  });
  it('double hit: 2 draws (crit, double), second strike uses plain attack, flagged doubleHit', () => {
    const atk = ent({ attack: 100, critChance: 50, critDamage: 2, doubleHit: 100 });
    const def = ent({ hp: 1000 });
    const rng = scripted([0.1, 0.5]); // crit yes; double yes
    const ev = processAttack(atk, def, 5, true, null, null, rng);
    expect(rng.draws).toBe(2);
    expect(ev.map((e) => [e.type, e.damage, e.doubleHit])).toEqual([
      ['attacker_crit', 200, undefined],
      ['attacker_hit', 100, true],
    ]);
    expect(def.hp).toBe(700);
  });
  it('double hit is skipped when the first strike killed, but both draws were already spent', () => {
    const atk = ent({ attack: 100, doubleHit: 100 });
    const def = ent({ hp: 100 });
    const rng = scripted([MISS, 0.5]);
    const ev = processAttack(atk, def, 0, true, null, null, rng);
    expect(rng.draws).toBe(2);
    expect(ev).toHaveLength(1);
    expect(def.hp).toBe(0);
  });
  it('draw 2 only when doubleHit > 0', () => {
    const rng = scripted([MISS]);
    processAttack(ent({ doubleHit: 0 }), ent(), 0, true, null, null, rng);
    expect(rng.remaining).toBe(0);
  });
});

describe('processAttack: avoid path (L1452914-1452927, L1453403-1453569)', () => {
  it('ONE roll against block+miss (50): 0.49 avoids, 0.50 hits; label miss when def has any Miss', () => {
    const def = ent({ hp: 500, blockChance: 30, missChance: 20 });
    const rng = scripted([0.49]);
    const ev = processAttack(ent({ attack: 100 }), def, 0, true, null, null, rng);
    expect(rng.draws).toBe(1); // no separate miss then block roll
    expect(ev).toEqual([{ timestamp: 0, type: 'defender_miss', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 500 }]);
    expect(def.hp).toBe(500);
    const rng2 = scripted([0.5, MISS]);
    const ev2 = processAttack(ent({ attack: 100 }), def, 0, true, null, null, rng2);
    expect(rng2.draws).toBe(2); // avoid roll + crit roll
    expect(ev2[0].type).toBe('attacker_hit');
  });
  it('no avoid draw when block+miss is 0', () => {
    const rng = scripted([MISS]);
    processAttack(ent(), ent(), 0, true, null, null, rng);
    expect(rng.draws).toBe(1);
  });
  it('label block when Miss is 0; target-side naming flips with the swinger', () => {
    const def = ent({ blockChance: 100 });
    expect(processAttack(ent(), def, 0, true, null, null, scripted([0]))[0].type).toBe('defender_block');
    expect(processAttack(ent(), def, 0, false, null, null, scripted([0]))[0].type).toBe('attacker_block');
  });
  it('penetration works when Miss is exactly 0: round(100*30/100)=30, no crit draw at critChance 0', () => {
    const atk = ent({ attack: 100, penetration: 30 });
    const def = ent({ hp: 500, blockChance: 40 });
    const rng = scripted([0.39]);
    const ev = processAttack(atk, def, 0, true, null, null, rng);
    expect(rng.draws).toBe(1);
    expect(ev[0]).toMatchObject({ type: 'defender_block', damage: 30 });
    expect(def.hp).toBe(470);
  });
  it('penetration crit: 1 extra draw only when critChance > 0; round(30*2)=60, then DR 50% -> 30', () => {
    const atk = ent({ attack: 100, penetration: 30, critChance: 50, critDamage: 2 });
    const def = ent({ hp: 500, blockChance: 40, damageReduction: 50 });
    const rng = scripted([0.1, 0.1]); // avoid, pen crit
    const ev = processAttack(atk, def, 0, true, null, null, rng);
    expect(rng.draws).toBe(2);
    expect(ev[0].damage).toBe(30);
  });
  it('penetration is dead when the defender has ANY Miss: zero damage, only the avoid draw', () => {
    const atk = ent({ attack: 100, penetration: 100, critChance: 50 });
    const def = ent({ hp: 500, blockChance: 40, missChance: 1 });
    const rng = scripted([0.1]);
    const ev = processAttack(atk, def, 0, true, null, null, rng);
    expect(rng.draws).toBe(1);
    expect(ev[0]).toMatchObject({ type: 'defender_miss', damage: 0 });
    expect(def.hp).toBe(500);
  });
  it('penetration damage goes through PVP Attack/Defense, shield, lifesteal; no double hit or procs', () => {
    const atk = ent({ attack: 100, penetration: 50, pvpAttack: 200, lifesteal: 20, hp: 100, maxHp: 1000,
      doubleHit: 100, blindChance: 100, paralyzeChance: 100, disruptionChance: 100 });
    const def = ent({ hp: 500, blockChance: 100, shieldHp: 10 });
    const rng = scripted([0]); // only the avoid roll: pen base 50, no crit draw (critChance 0)
    const ev = processAttack(atk, def, 0, true, null, null, rng);
    // 50 -> pvpAttack 0.5 -> round(75) = 75; shield 10 -> hp 435
    expect(ev[0].damage).toBe(75);
    expect([def.shieldHp, def.hp]).toEqual([0, 435]);
    expect(atk.hp).toBe(115); // floor(75*0.2)=15
    expect(rng.draws).toBe(1);
    expect(def.blinded).toBeFalsy();
  });
});

describe('processAttack: on-hit procs (L1453143-1453400)', () => {
  it('full draw order: crit, double, blind, paralyze, disruption (5 draws)', () => {
    const atk = ent({ attack: 10, doubleHit: 50, blindChance: 50, paralyzeChance: 50, disruptionChance: 50, disruptionEffect: 'SILENCE' });
    const def = ent({ hp: 1000 });
    const rng = scripted([MISS, 0.1, 0.1, 0.1, 0.1]);
    const ev = processAttack(atk, def, 7, true, null, null, rng);
    expect(rng.draws).toBe(5);
    expect(ev.map((e) => e.type)).toEqual([
      'attacker_hit', 'attacker_hit', 'defender_blinded', 'defender_paralyzed', 'defender_silenced',
    ]);
    expect(def.blinded).toBe(true);
    expect(def.paralyzedMs).toBe(1000);
    expect(def.silencedMs).toBe(3000);
  });
  it('procs are skipped (no draw) when blinded already, paralyzed already, or the target is dead', () => {
    const atk = ent({ attack: 10, blindChance: 50, paralyzeChance: 50 });
    const def = ent({ hp: 1000, blinded: true, paralyzedMs: 500 });
    const rng = scripted([MISS]);
    processAttack(atk, def, 0, true, null, null, rng);
    expect(rng.draws).toBe(1);
    expect(def.paralyzedMs).toBe(500);
    const dead = ent({ hp: 5 });
    const rng2 = scripted([MISS]);
    processAttack(ent({ attack: 10, blindChance: 50, paralyzeChance: 50, disruptionChance: 50 }), dead, 0, true, null, null, rng2);
    expect(dead.hp).toBe(-5);
    expect(rng2.draws).toBe(1);
  });
  it('a failed proc roll sets nothing', () => {
    const atk = ent({ attack: 10, blindChance: 50, paralyzeChance: 50 });
    const def = ent({ hp: 1000 });
    processAttack(atk, def, 0, true, null, null, scripted([MISS, 0.5, 0.5]));
    expect(def.blinded).toBeFalsy();
    expect(def.paralyzedMs).toBeFalsy();
  });
  it('stagger: +1 stack per proc, third stuns for 2000 ms and resets stacks; target-side labels', () => {
    const atk = ent({ attack: 10, disruptionChance: 100, disruptionEffect: 'STAGGER' });
    const def = ent({ hp: 1000 });
    const first = processAttack(atk, def, 0, false, null, null, scripted([MISS, 0]));
    expect(first.map((e) => e.type)).toEqual(['defender_hit', 'attacker_staggered']);
    expect(first[1].staggerStacks).toBe(1);
    processAttack(atk, def, 0, true, null, null, scripted([MISS, 0]));
    expect(def.staggerStacks).toBe(2);
    const third = processAttack(atk, def, 0, true, null, null, scripted([MISS, 0]));
    expect(third.map((e) => e.type)).toEqual(['attacker_hit', 'defender_staggered', 'defender_paralyzed']);
    expect(third[2].paralyzeMs).toBe(2000);
    expect(def.staggerStacks).toBe(0);
    expect(def.paralyzedMs).toBe(2000);
  });
  it('stagger stun never shortens a longer paralysis (max)', () => {
    const atk = ent({ attack: 10, disruptionChance: 100, disruptionEffect: 'STAGGER' });
    const def = ent({ hp: 1000, staggerStacks: 2, paralyzedMs: 5000 });
    processAttack(atk, def, 0, true, null, null, scripted([MISS, 0]));
    expect(def.paralyzedMs).toBe(5000);
  });
  it('fear sets 1000 ms and logs fearMs; no draw while already feared', () => {
    const atk = ent({ attack: 10, disruptionChance: 100, disruptionEffect: 'FEAR' });
    const def = ent({ hp: 1000 });
    const ev = processAttack(atk, def, 0, true, null, null, scripted([MISS, 0]));
    expect(ev[1]).toMatchObject({ type: 'defender_feared', fearMs: 1000 });
    const rng = scripted([MISS]);
    processAttack(atk, def, 0, true, null, null, rng);
    expect(rng.draws).toBe(1);
  });
  it('an unknown disruption effect draws and is treated as no proc', () => {
    const atk = ent({ attack: 10, disruptionChance: 100, disruptionEffect: 'NOPE' });
    const rng = scripted([MISS, 0]);
    expect(processAttack(atk, ent(), 0, true, null, null, rng)).toHaveLength(1);
    expect(rng.draws).toBe(2);
  });
});

describe('processAttack: lost swings (L1452886-1452905)', () => {
  it('paralyzed: no draw, no damage, swinger-labelled; blind survives', () => {
    const atk = ent({ paralyzedMs: 300, blinded: true });
    const def = ent();
    const rng = scripted([]);
    const ev = processAttack(atk, def, 33, true, null, null, rng);
    expect(ev).toEqual([{ timestamp: 33, type: 'attacker_paralyze', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 1000 }]);
    expect(atk.blinded).toBe(true);
    expect(processAttack(atk, def, 0, false, null, null, rng)[0].type).toBe('defender_paralyze');
  });
  it('feared beats blind', () => {
    const atk = ent({ fearedMs: 300, blinded: true });
    expect(processAttack(atk, ent(), 0, true, null, null, scripted([]))[0].type).toBe('attacker_fear');
    expect(atk.blinded).toBe(true);
  });
  it('blind is consumed by exactly one lost swing; the next swing connects', () => {
    const atk = ent({ blinded: true });
    const def = ent({ hp: 500 });
    const ev = processAttack(atk, def, 0, false, null, null, scripted([]));
    expect(ev[0].type).toBe('defender_blind');
    expect(atk.blinded).toBe(false);
    expect(def.hp).toBe(500);
    expect(processAttack(atk, def, 0, false, null, null, scripted([MISS]))[0].type).toBe('defender_hit');
  });
});

describe('processAttack: minion intercept (L1452906-1452912, L1453570-1453754)', () => {
  it('hits the minion with no avoid roll, DR or PVP; HP untouched; events are target-side', () => {
    const atk = ent({ attack: 30, pvpAttack: 500 });
    const def = ent({ hp: 500, blockChance: 100, damageReduction: 50, pvpDefense: 500 });
    const m = minion({ hp: 50 });
    const rng = scripted([MISS]); // crit only
    const ev = processAttack(atk, def, 0, true, null, m, rng);
    expect(rng.draws).toBe(1);
    expect(ev).toEqual([{ timestamp: 0, type: 'defender_minion_damaged', damage: 30, attackerHpAfter: 1000, defenderHpAfter: 500 }]);
    expect([m.hp, def.hp]).toEqual([20, 500]);
  });
  it('overkill clamps to remaining minion HP, logs a death event with the respawn meta; double hit does not carry over', () => {
    const atk = ent({ attack: 100, doubleHit: 100 });
    const m = minion({ hp: 40, respawnCooldownMs: 8000 });
    const ev = processAttack(atk, ent({ hp: 500 }), 0, false, null, m, scripted([MISS, 0]));
    expect(ev.map((e) => [e.type, e.damage])).toEqual([['attacker_minion_damaged', 40], ['attacker_minion_dead', 0]]);
    expect(ev[1].minionRespawnMs).toBe(8000);
    expect(m.alive).toBe(false);
  });
  it('crit and double-hit strikes are flagged; lifesteal heals from dealt damage', () => {
    const atk = ent({ attack: 10, critChance: 100, critDamage: 2, doubleHit: 100, lifesteal: 50, hp: 100, maxHp: 1000 });
    const m = minion({ hp: 500, maxHp: 500 });
    const rng = scripted([0, 0]);
    const ev = processAttack(atk, ent(), 0, true, null, m, rng);
    expect(ev[0]).toMatchObject({ damage: 20, isCrit: true });
    expect(ev[1]).toMatchObject({ damage: 10, doubleHit: true });
    expect(atk.hp).toBe(100 + 10 + 5);
    expect(rng.draws).toBe(2);
  });
  it('a dead minion is ignored (normal hit path)', () => {
    const def = ent({ hp: 500 });
    processAttack(ent({ attack: 100 }), def, 0, true, null, minion({ alive: false, hp: 0 }), scripted([MISS]));
    expect(def.hp).toBe(400);
  });
  it('a paralyzed swinger does not touch the minion', () => {
    const m = minion();
    processAttack(ent({ paralyzedMs: 1 }), ent(), 0, true, null, m, scripted([]));
    expect(m.hp).toBe(50);
  });
});

describe('processAttack: log=false', () => {
  it('returns no events but leaves identical state and draws the same rng values', () => {
    const run = (log) => {
      const rng = mulberry32(42);
      const atk = ent({ attack: 90, critChance: 30, critDamage: 1.7, doubleHit: 40, lifesteal: 10, hp: 300, maxHp: 1000,
        blindChance: 30, paralyzeChance: 20, disruptionChance: 30, disruptionEffect: 'STAGGER', penetration: 25, pvpAttack: 150 });
      const def = ent({ hp: 6000, blockChance: 20, missChance: 0, damageReduction: 15, pvpDefense: 100, shieldHp: 200 });
      const out = [];
      for (let i = 0; i < 40; i++) {
        out.push(...processAttack(atk, def, i * 10, true, null, null, rng, log));
        processAttack(def, atk, i * 10, false, null, null, rng, log);
      }
      return { atk, def, next: rng(), out };
    };
    const a = run(true);
    const b = run(false);
    expect(b.out).toEqual([]);
    expect(a.out.length).toBeGreaterThan(40);
    expect(b.atk).toEqual(a.atk);
    expect(b.def).toEqual(a.def);
    expect(b.next).toBe(a.next);
  });
});
