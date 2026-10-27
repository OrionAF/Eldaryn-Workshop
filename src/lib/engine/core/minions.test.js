import { describe, it, expect } from 'vitest';
import {
  createMinion, minionSwing, minionAttackSpeed, minionSwingIntervalMs, minionCurrentAttack,
  advanceMinionRespawn, elapseMinionRespawn, resummonIfDead, damageMinion, killMinion, summonMinion,
  soulLinkHeal, healMinionLifesteal, endMinionEmpower, carryMinionIntoNewFight, minionMsUntilSwing,
  mitigateMinionHit, openingSummonWindowMs, openingSwingTimerStart, minionCurrentLifesteal, currentSoulLink,
  minionDeathMeta, minionDeathWardLeft, expireMinionDeathWard, rollMinionReap, endMinionBastion,
} from './minions.js';
import { applyCombatCeiling, capConfig, softCapGainFromSheet } from './caps.js';
import { scripted } from '../rng.js';

const d = { species: 'skeleton', name: 'Skel', icon: 'i', minion: 'SKELETON', hpPercent: 60, attackPercent: 20,
  respawnCooldownMs: 10000, summonCastMs: 1500 };
const p = { maxHp: 1000, attack: 500, attackSpeed: 1.2, critDamage: 1.5 };
const mk = (s = {}) => createMinion(d, p, s);

describe('createMinion', () => {
  it('null without config', () => expect(createMinion(null, p, {})).toBeNull());
  it('scales hp/attack from the summon percents and totals', () => {
    const m = mk({ totalMinionAttack: 50, totalMinionHealth: 25, totalMinionCritChance: 10, totalMinionLifesteal: 5, totalSoulLink: 7 });
    expect(m.maxHp).toBe(750);
    expect(m.attack).toBe(150);
    expect(m).toMatchObject({ hp: 0, alive: false, critChance: 10, critDamage: 1.5, lifesteal: 5, soulLink: 7,
      respawnCooldownMs: 10000, summonCastMs: 1500, kind: 'SKELETON' });
  });
  it('floors at 1', () => {
    const m = createMinion({ ...d, hpPercent: 0, attackPercent: 0 }, p, {});
    expect([m.maxHp, m.attack]).toEqual([1, 1]);
  });
  it('attack speed: unchanged with no bonus, not below player with bonus', () => {
    expect(minionAttackSpeed(1.2, 0)).toBe(1.2);
    expect(minionAttackSpeed(1.2, 30)).toBeGreaterThanOrEqual(1.2);
  });
});

describe('minionSwing', () => {
  it('dead or zero speed returns null with no draws', () => {
    const r = scripted([]);
    expect(minionSwing(mk(), 5000, r)).toBeNull();
    const m = mk(); summonMinion(m); m.attackSpeed = 0;
    expect(minionSwing(m, 5000, r)).toBeNull();
    expect(r.draws).toBe(0);
  });
  it('waits for the interval, then swings once, no draw without crit chance', () => {
    const m = mk(); m.attackSpeed = 2; summonMinion(m);
    const r = scripted([]);
    expect(minionSwingIntervalMs(m)).toBe(500);
    expect(minionSwing(m, 400, r)).toBeNull();
    expect(m.timer).toBe(400);
    expect(minionSwing(m, 200, r)).toEqual({ damage: 100, isCrit: false });
    expect(m.timer).toBe(100);
    expect(r.draws).toBe(0);
  });
  it('crit: exactly one draw, rounded multiplier', () => {
    const m = mk(); m.attackSpeed = 1; m.critChance = 50; summonMinion(m);
    const r = scripted([0.49]);
    expect(minionSwing(m, 1000, r)).toEqual({ damage: 150, isCrit: true });
    expect(r.draws).toBe(1);
    const r2 = scripted([0.5]);
    expect(minionSwing(m, 1000, r2)).toEqual({ damage: 100, isCrit: false });
    expect(r2.draws).toBe(1);
  });
  it('frenzy raises damage and shortens the interval', () => {
    const m = mk(); m.attackSpeed = 1; summonMinion(m);
    m.frenzy = { attackPercent: 50, attackSpeedPercent: 100, lifesteal: 0 };
    expect(minionCurrentAttack(m)).toBe(150);
    expect(minionSwingIntervalMs(m)).toBe(500);
    expect(minionMsUntilSwing(m)).toBe(minionSwingIntervalMs(m));
  });
});

describe('ceilings (MINION_ATTACK_SPEED 4.5, MINION_LIFESTEAL 80, SOUL_LINK 80)', () => {
  it('a frenzied swing interval is ceilinged at 4.5 attacks/s; no frenzy skips the ceiling', () => {
    expect(minionSwingIntervalMs({ attackSpeed: 3.5, frenzy: { attackSpeedPercent: 50 } })).toBe(222);
    expect(minionSwingIntervalMs({ attackSpeed: 3.5 })).toBe(286);
  });
  it('frenzy lifesteal and the soul-link bonus are ceilinged at 80; with no bonus the base passes through', () => {
    expect(minionCurrentLifesteal({ lifesteal: 70, frenzy: { lifesteal: 20 } })).toBe(80);
    expect(minionCurrentLifesteal({ lifesteal: 70, frenzy: { lifesteal: 0 } })).toBe(70);
    expect(currentSoulLink({ soulLink: 75, soulLinkBonus: 20 })).toBe(80);
    expect(currentSoulLink({ soulLink: 75 })).toBe(75);
  });
  it('minion attack speed adds the soft-capped gain, then the 4.5 ceiling', () => {
    const cfg = capConfig('MINION_ATTACK_SPEED');
    expect(minionAttackSpeed(1.8, 0.5)).toBe(applyCombatCeiling(1.8 + softCapGainFromSheet(1.8, 0.5, cfg), 4.5));
    expect(minionAttackSpeed(1.8, 0.5)).toBeGreaterThan(1.8);
    // the gain is soft-capped toward 4, so only a sheet already above 4.5 meets the ceiling
    expect(minionAttackSpeed(5, 0.5)).toBe(4.5);
    expect(minionAttackSpeed(5, 0)).toBe(5);
  });
});

describe('openingSwingTimerStart (L1094757; caller L1087885 passes round(1000 / attackSpeed))', () => {
  it('a positive summon window caps the timer at swingInterval - 400', () => {
    expect(openingSwingTimerStart(300, 1500, 0)).toBe(-100);
    expect(openingSwingTimerStart(500, 1500, 0)).toBe(0);
    expect(openingSwingTimerStart(1000, 1500, 900)).toBe(600);
  });
  it('no window returns the fallback', () => {
    expect(openingSwingTimerStart(500, 0, 0)).toBe(0);
    expect(openingSwingTimerStart(500, 0, 250)).toBe(250);
    expect(openingSwingTimerStart(500, 0)).toBe(0);
  });
});

describe('respawn', () => {
  it('dies, counts down, resummons at <= 0', () => {
    const m = mk(); summonMinion(m);
    expect(damageMinion(m, 5000)).toEqual({ dealt: 600, died: true });
    expect(m).toMatchObject({ alive: false, hp: 0, respawnMs: 10000 });
    expect(advanceMinionRespawn(m, 4000)).toBe(false);
    expect(advanceMinionRespawn(m, 6000)).toBe(true);
    expect(m).toMatchObject({ alive: true, hp: 600, respawnMs: 0, timer: 0 });
  });
  it('elapse floors at 0 and does not summon; resummon only when pending', () => {
    const m = mk(); summonMinion(m); damageMinion(m, 9999);
    elapseMinionRespawn(m, 99999);
    expect(m).toMatchObject({ alive: false, respawnMs: 0 });
  });
  it('resummonIfDead summons only a dead minion with no respawn pending (L1094677-1094700)', () => {
    const fresh = mk(); // createMinion: dead, respawnMs 0
    expect(resummonIfDead(fresh)).toBe(true);
    expect(fresh).toMatchObject({ alive: true, hp: 600, timer: 0, respawnMs: 0 });
    const pending = mk(); pending.respawnMs = 5;
    expect(resummonIfDead(pending)).toBe(false);
    expect(pending.alive).toBe(false);
    const alive = mk(); summonMinion(alive); alive.hp = 10;
    expect(resummonIfDead(alive)).toBe(false);
    expect(alive.hp).toBe(10);
    expect(resummonIfDead(null)).toBe(false);
  });
  it('killMinion clears the timer', () => {
    const m = mk(); summonMinion(m);
    expect(killMinion(m)).toBe(true);
    expect(m).toMatchObject({ alive: false, respawnMs: 0 });
    expect(killMinion(m)).toBe(false);
  });
  it('partial damage does not kill; dead takes none', () => {
    const m = mk(); summonMinion(m);
    expect(damageMinion(m, 100)).toEqual({ dealt: 100, died: false });
    expect(damageMinion(mk(), 100)).toEqual({ dealt: 0, died: false });
  });
});

describe('Death Ward (2.8.2 L1105171-1105749, L1106990-1107157)', () => {
  const warded = () => { const m = createMinion({ ...d, deathWardPercent: 15 }, p, {}); summonMinion(m); return m; };
  it('death sets max(1, floor(maxHp * pct / 100)), returned and in the death meta', () => {
    const m = warded(); // maxHp 600 -> 90
    expect(damageMinion(m, 9999)).toEqual({ dealt: 600, died: true, deathWard: 90 });
    expect(minionDeathMeta(m)).toEqual({ minionRespawnMs: 10000, minionDeathWard: 90 });
    const tiny = createMinion({ ...d, hpPercent: 0, deathWardPercent: 5 }, p, {}); summonMinion(tiny);
    expect(damageMinion(tiny, 5).deathWard).toBe(1);
  });
  it('no ward without the glyph; killMinion (owner died) grants none', () => {
    const m = mk(); summonMinion(m);
    expect(damageMinion(m, 9999)).toEqual({ dealt: 600, died: true });
    expect(minionDeathMeta(m)).toEqual({ minionRespawnMs: 10000 });
    const w = warded(); killMinion(w);
    expect(minionDeathMeta(w)).toEqual({});
  });
  it('the ward left is min(ward, pool); expiry removes it from the pool once', () => {
    const m = warded(); damageMinion(m, 9999);
    expect(minionDeathWardLeft(m, 250)).toBe(90);
    expect(minionDeathWardLeft(m, 40)).toBe(40);
    expect(expireMinionDeathWard(m, 250)).toBe(160);
    expect(m.deathWard).toBe(0);
    expect(expireMinionDeathWard(m, 160)).toBe(160);
    const n = warded(); damageMinion(n, 9999);
    expect(expireMinionDeathWard(n, 30)).toBe(0); // the ward was partly spent
  });
});

describe('Dominion tiers, Reap and Infernal Bastion (2.8.2 L1105444-1106900, L1107288-1107410)', () => {
  const reaper = { species: 'REAPERS_CALL', name: 'R', icon: 'i', minion: 'REAPER', hpPercent: 30, attackPercent: 60, respawnCooldownMs: 10000, summonCastMs: 1500 };
  const p2 = { maxHp: 1000, attack: 500, attackSpeed: 1, critDamage: 1.5 };
  it("Reaper's Call Dominion 5: +30 Minion Attack, x1.25 attack speed, +10 crit, Reap; Dominion 1 adds nothing", () => {
    const m5 = createMinion(reaper, p2, { totalDominion: 5, totalMinionAttack: 20, totalMinionCritChance: 5 });
    expect(m5.attack).toBe(450); // floor(500 * 60 / 100 * (1 + (20 + 30) / 100))
    expect(m5.attackSpeed).toBeCloseTo(1.25, 10);
    expect(m5.critChance).toBe(15);
    expect(m5).toMatchObject({ reap: { chancePercent: 6, paralyzeMs: 1000, cooldownMs: 5000 }, reapCooldownMs: 0 });
    expect(m5.dominion).toBeUndefined();
    const m1 = createMinion(reaper, p2, { totalDominion: 1 });
    expect([m1.attack, m1.attackSpeed, m1.critChance, m1.reap]).toEqual([300, 1, 0, undefined]);
  });
  it('Bone Servant and Dreadguard get the tank tiers', () => {
    expect(createMinion({ ...d, species: 'BONE_SERVANT' }, p, { totalDominion: 5 }).dominion).toEqual({ blockChance: 18, damageReduction: 18, thornsPercent: 10 });
    const dg = { ...d, species: 'DREADGUARDS_PACT', minion: 'DEMON' };
    expect(createMinion(dg, p, { totalDominion: 4 }).dominion).toEqual({ blockChance: 16, damageReduction: 16, thornsPercent: 15 });
  });
  it('rollMinionReap: one draw off cooldown, then the cooldown; minionSwing counts it down', () => {
    const m = createMinion(reaper, p2, { totalDominion: 4 });
    summonMinion(m);
    expect(rollMinionReap(m, scripted([0.07]))).toBe(0); // 7 >= 6
    expect(rollMinionReap(m, scripted([0.05]))).toBe(1000);
    expect(m.reapCooldownMs).toBe(5000);
    expect(rollMinionReap(m, scripted([]))).toBe(0); // on cooldown: no draw
    minionSwing(m, 4000, scripted([0.9])); // one crit draw (crit 10 at this tier)
    expect(m.reapCooldownMs).toBe(1000);
    expect(rollMinionReap(mk(), scripted([]))).toBe(0); // no Reap tier
  });
  it("the bastion adds its Block and DR to the tier's, and its thorns; it ends on death", () => {
    const m = createMinion({ ...d, species: 'BONE_SERVANT' }, p, { totalDominion: 2 }); // tier block 6, DR 6
    summonMinion(m);
    m.bastion = { blockChance: 15, damageReduction: 20, thornsPercent: 4 };
    m.bastionSpell = { name: 'IB' };
    // block 21: a 0.22 roll is no block; DR 26: round(100 * 0.74) = 74; thorns round(74 * 4 / 100) = 3
    expect(damageMinion(m, 100, { swing: true }, scripted([0.22]))).toEqual({ dealt: 74, died: false, thorns: 3 });
    expect(damageMinion(m, 100, { swing: true }, scripted([0.2]))).toEqual({ dealt: 0, died: false, blocked: true });
    damageMinion(m, 9999, { swing: true }, scripted([0.9]));
    expect([m.bastion, m.bastionSpell]).toEqual([undefined, undefined]);
    expect(endMinionBastion(m)).toBe(false);
  });
});

describe('heals and buffs', () => {
  it('soul link and lifesteal floor and clamp', () => {
    const m = mk({ totalSoulLink: 10, totalMinionLifesteal: 10 }); summonMinion(m); m.hp = 100;
    expect(soulLinkHeal(m, 255)).toBe(25);
    expect(healMinionLifesteal(m, 99)).toBe(9);
    m.hp = m.maxHp - 3;
    expect(soulLinkHeal(m, 1000)).toBe(3);
  });
  it('empower end removes bonus hp and clamps', () => {
    const m = mk(); summonMinion(m);
    m.maxHp += 100; m.hp += 100; m.empowerBonusHp = 100; m.empowerSpell = 's';
    expect(endMinionEmpower(m)).toBe(true);
    expect(m).toMatchObject({ maxHp: 600, hp: 600, empowerBonusHp: 0 });
    expect('empowerSpell' in m).toBe(false);
    expect(endMinionEmpower(m)).toBe(false);
  });
  it('carry into new fight', () => {
    expect(carryMinionIntoNewFight(mk())).toEqual([]);
    const m = mk(); summonMinion(m); m.hp = 10; m.soulLinkBonus = 5;
    m.frenzy = { attackPercent: 10 }; m.frenzySpell = 'f';
    expect(carryMinionIntoNewFight(m)).toEqual([{ spell: 'f', minionMaxHp: 600 }]);
    expect(m).toMatchObject({ hp: 600, soulLinkBonus: 0 });
  });
  it('mitigate and opening window', () => {
    expect(mitigateMinionHit(100, 50)).toBe(50);
    expect(mitigateMinionHit(1, 99)).toBe(1);
    expect(mitigateMinionHit(100, 0)).toBe(100);
    expect(openingSummonWindowMs([mk(), null])).toBe(1500);
  });
});
