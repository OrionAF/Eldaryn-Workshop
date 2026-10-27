import { describe, it, expect } from 'vitest';
import { processCombatTick, routeSpellHealToMinion, REGEN_INTERVAL_MS } from './tick.js';
import { createMobEntity } from '../core/entity.js';
import { createMinion, summonMinion } from '../core/minions.js';
import { createHealBudget } from '../core/shield.js';
import { scripted } from '../rng.js';

// Scripted values: a draw v means `v * 100 < chance` is the success test, so 0.0 passes any chance > 0
// and 0.99 fails any chance < 99.
const PASS = 0.0;
const FAIL = 0.99;

/** Player entity with every field the tick reads; overrides win. */
const player = (o = {}) => ({
  maxHp: 1000, hp: 1000, attack: 100, attackSpeed: 1, doubleHit: 0, critChance: 0, critDamage: 2,
  lifesteal: 0, hpRegen: 0, damageReduction: 0, blockChance: 0, missChance: 0, blindChance: 0,
  paralyzeChance: 0, penetration: 0, disruptionChance: 0, disruptionEffect: 'SILENCE',
  shieldHp: 0, shieldMax: 0, ...o,
});
const mob = (o = {}) => ({ ...createMobEntity({ hp: 1000, attack: 100, attackSpeed: 1 }), ...o });

// Timers that make the player swing (and, with E_DUE, the enemy) on a 100 ms tick at attack speed 1.
const P_DUE = { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 };
const BOTH_DUE = { attackerTimer: 900, defenderTimer: 900, regenTimer: 0 };
const E_DUE = { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 };
const IDLE = { attackerTimer: 0, defenderTimer: 0, regenTimer: 0 };
const DT = 100;

const run = (p, e, { php = 1000, ehp = 1000, timers = IDLE, dt = DT, opts = {}, rng = scripted([]) } = {}) => {
  const r = processCombatTick(p, e, php, ehp, timers, dt, 5000, opts, rng);
  return { r, rng, types: r.events.map((ev) => ev.type) };
};

const minionFor = (o = {}) => {
  const m = createMinion(
    { species: 'skeleton', name: 'Skel', icon: 'i', minion: 'SKELETON', hpPercent: 10, attackPercent: 50,
      respawnCooldownMs: 10000, summonCastMs: 0 },
    { maxHp: 1000, attack: 100, attackSpeed: 1, critDamage: 2 }, {},
  );
  summonMinion(m);
  Object.assign(m, o);
  return m;
};

describe('regen pulse (L1086337-1086420)', () => {
  // pulse = max(1, round(1000 * 5 / 100 / 10)) = 5
  it('fires when the regen timer reaches 100 and keeps the remainder', () => {
    const { r, rng } = run(player({ hpRegen: 5 }), mob(), { php: 500, timers: { attackerTimer: 0, defenderTimer: 0, regenTimer: 40 }, dt: 80 });
    expect(r.attackerHp).toBe(505);
    expect(r.timers.regenTimer).toBe(20);
    expect(r.events).toEqual([{ timestamp: 5000, type: 'attacker_regen', damage: 0, attackerHp: 505, defenderHp: 1000 }]);
    expect(rng.draws).toBe(0);
    expect(REGEN_INTERVAL_MS).toBe(100);
  });
  it('does not fire below 100 ms; the timer accumulates', () => {
    const { r } = run(player({ hpRegen: 5 }), mob(), { php: 500, dt: 60 });
    expect(r.attackerHp).toBe(500);
    expect(r.timers.regenTimer).toBe(60);
    expect(r.events).toEqual([]);
  });
  it('a full-HP player gets no heal and no event, but the timer still advances', () => {
    const { r } = run(player({ hpRegen: 5 }), mob(), { php: 1000 });
    expect(r.events).toEqual([]);
    expect(r.timers.regenTimer).toBe(0);
  });
  it('the pulse is at least 1', () => {
    const { r } = run(player({ hpRegen: 0.01 }), mob(), { php: 500 });
    expect(r.attackerHp).toBe(501);
  });
  it('amount reads player.maxHp, the clamp reads attackerMaxHp', () => {
    // pulse 5, missing = 502 - 500 = 2
    const { r } = run(player({ hpRegen: 5 }), mob(), { php: 500, opts: { attackerMaxHp: 502 } });
    expect(r.attackerHp).toBe(502);
  });
  it('the heal budget limits the pulse', () => {
    const budget = createHealBudget(30, 10); // 3 HP
    const { r } = run(player({ hpRegen: 5 }), mob(), { php: 500, opts: { healBudget: budget } });
    expect(r.attackerHp).toBe(503);
    expect(budget.remaining).toBe(0);
  });
  it('overflow refills the shield; always-refills refills the whole pulse; blocksShieldOverflow stops it', () => {
    // hp 998: applied 2, pulse 5. overflow-only refill = 3, always = 5
    const base = { hpRegen: 5, shieldMax: 100 };
    const a = run(player(base), mob(), { php: 998, opts: { attackerShieldHp: 10 } });
    expect(a.r.attackerShieldHp).toBe(13);
    const b = run(player({ ...base, shieldRegenAlwaysRefills: true }), mob(), { php: 998, opts: { attackerShieldHp: 10 } });
    expect(b.r.attackerShieldHp).toBe(15);
    const c = run(player({ ...base, shieldRegenAlwaysRefills: true }), mob(), { php: 998, opts: { attackerShieldHp: 10, blocksShieldOverflow: true } });
    expect(c.r.attackerShieldHp).toBe(10);
    const d = run(player({ ...base, shieldRegenAlwaysRefills: true }), mob(), { php: 998, opts: { attackerShieldHp: 98 } });
    expect(d.r.attackerShieldHp).toBe(100);
  });
  it('no shield, no refill', () => {
    const { r } = run(player({ hpRegen: 5, shieldMax: 0 }), mob(), { php: 998, opts: { attackerShieldHp: 0 } });
    expect(r.attackerShieldHp).toBe(0);
  });
});

describe('player swing: hit resolution (L1086422-1086575)', () => {
  it('plain hit: 1 draw (crit), timer remainder carried', () => {
    const rng = scripted([FAIL]);
    const { r } = run(player(), mob(), { timers: { attackerTimer: 950, defenderTimer: 0, regenTimer: 0 }, rng });
    expect(r.defenderHp).toBe(900);
    expect(r.attackerDamageDealt).toBe(100);
    expect(r.events).toEqual([{ timestamp: 5000, type: 'attacker_hit', damage: 100, attackerHp: 1000, defenderHp: 900 }]);
    expect(r.timers.attackerTimer).toBe(50); // 950 + 100 - 1000
    expect(rng.draws).toBe(1);
  });
  it('does not swing below the interval', () => {
    const { r, rng } = run(player(), mob(), { timers: { attackerTimer: 500, defenderTimer: 0, regenTimer: 0 } });
    expect(r.events).toEqual([]);
    expect(r.timers.attackerTimer).toBe(600);
    expect(rng.draws).toBe(0);
  });
  it('interval is round(1000/attackSpeed): 1.3 -> 769', () => {
    const p = player({ attackSpeed: 1.3 });
    const no = run(p, mob(), { timers: { attackerTimer: 668, defenderTimer: 0, regenTimer: 0 }, rng: scripted([]) });
    expect(no.r.events).toEqual([]);
    const yes = run(p, mob(), { timers: { attackerTimer: 669, defenderTimer: 0, regenTimer: 0 }, rng: scripted([FAIL]) });
    expect(yes.r.timers.attackerTimer).toBe(0);
  });
  it('attack speed 0 never swings', () => {
    const { r } = run(player({ attackSpeed: 0 }), mob(), { timers: { attackerTimer: 99999, defenderTimer: 0, regenTimer: 0 } });
    expect(r.events).toEqual([]);
  });
  it('crit: round(attack * critDamage), event attacker_crit', () => {
    const rng = scripted([PASS]);
    const { r } = run(player({ critChance: 50, critDamage: 1.55 }), mob(), { timers: P_DUE, rng });
    expect(r.events[0]).toMatchObject({ type: 'attacker_crit', damage: 155 });
    expect(r.defenderHp).toBe(845);
    expect(rng.draws).toBe(1);
  });
  it('double hit: crit then double draw; the follow-up is the plain attack and never a crit', () => {
    const rng = scripted([PASS, PASS]);
    const { r } = run(player({ critChance: 50, doubleHit: 50 }), mob(), { timers: P_DUE, rng });
    expect(r.events.map((e) => [e.type, e.damage, e.doubleHit])).toEqual([
      ['attacker_crit', 200, undefined],
      ['attacker_hit', 100, true],
    ]);
    expect(r.defenderHp).toBe(700);
    expect(r.attackerDamageDealt).toBe(300);
    expect(rng.draws).toBe(2);
  });
  it('double hit is still rolled (2 draws) but not applied when the first hit kills', () => {
    const rng = scripted([FAIL, PASS]);
    const { r, types } = run(player({ doubleHit: 50 }), mob(), { timers: P_DUE, ehp: 100, rng });
    expect(types).toEqual(['attacker_hit', 'defender_dead']);
    expect(rng.draws).toBe(2);
    expect(r.defenderHp).toBe(0);
  });
  it('damage reduction applies to hit and follow-up separately', () => {
    const rng = scripted([FAIL, PASS]);
    const { r } = run(player({ doubleHit: 50 }), mob({ damageReduction: 25 }), { timers: P_DUE, rng });
    expect(r.events.map((e) => e.damage)).toEqual([75, 75]);
    expect(r.defenderHp).toBe(850);
  });
  it('the enemy shield absorbs; the event and damage dealt are pre-shield', () => {
    const { r } = run(player(), mob(), { timers: P_DUE, rng: scripted([FAIL]), opts: { defenderShieldHp: 60 } });
    expect(r.defenderShieldHp).toBe(0);
    expect(r.defenderHp).toBe(960);
    expect(r.events[0].damage).toBe(100);
    expect(r.attackerDamageDealt).toBe(100);
  });
  it('lifesteal: floor(dmg * ls / 100), after DR, clamped to missing HP', () => {
    const p = player({ lifesteal: 10 });
    const a = run(p, mob({ damageReduction: 50 }), { php: 500, timers: P_DUE, rng: scripted([FAIL]) });
    expect(a.r.events[0]).toMatchObject({ damage: 50, attackerHp: 505 });
    const b = run(p, mob(), { php: 995, timers: P_DUE, rng: scripted([FAIL]) });
    expect(b.r.attackerHp).toBe(1000);
    const full = run(p, mob(), { php: 1000, timers: P_DUE, rng: scripted([FAIL]) });
    expect(full.r.attackerHp).toBe(1000);
  });
  it('lifesteal on the follow-up uses the follow-up damage', () => {
    const { r } = run(player({ lifesteal: 10, doubleHit: 50 }), mob(), { php: 500, timers: P_DUE, rng: scripted([FAIL, PASS]) });
    expect(r.events.map((e) => e.attackerHp)).toEqual([510, 520]);
  });
  it('lifesteal draws on the heal budget', () => {
    const budget = createHealBudget(1000, 0.4); // 4 HP
    const { r } = run(player({ lifesteal: 10 }), mob(), { php: 500, timers: P_DUE, rng: scripted([FAIL]), opts: { healBudget: budget } });
    expect(r.attackerHp).toBe(504);
  });
});

describe('player swing: negate and penetration (L1086436-1086449, L1086762-1086884)', () => {
  it('block+miss is ONE roll, then the crit roll when not negated', () => {
    const rng = scripted([FAIL, FAIL]);
    const { r } = run(player(), mob({ blockChance: 20, missChance: 10 }), { timers: P_DUE, rng });
    expect(r.events[0].type).toBe('attacker_hit');
    expect(rng.draws).toBe(2);
  });
  it('no negate draw when block+miss is 0', () => {
    const rng = scripted([FAIL]);
    run(player(), mob(), { timers: P_DUE, rng });
    expect(rng.draws).toBe(1);
  });
  it('negated with no penetration: 1 draw, defender_block / defender_miss by the defender Miss, 0 damage', () => {
    const rng = scripted([0.05]);
    const a = run(player(), mob({ blockChance: 30 }), { timers: P_DUE, rng });
    expect(a.r.events).toEqual([{ timestamp: 5000, type: 'defender_block', damage: 0, attackerHp: 1000, defenderHp: 1000 }]);
    expect(rng.draws).toBe(1);
    const b = run(player(), mob({ blockChance: 10, missChance: 20 }), { timers: P_DUE, rng: scripted([0.05]) });
    expect(b.types).toEqual(['defender_miss']);
  });
  it('negated: no blind/paralyze/disruption rolls even at 100%', () => {
    const rng = scripted([0.05]);
    const p = player({ blindChance: 100, paralyzeChance: 100, disruptionChance: 100 });
    const { r } = run(p, mob({ blockChance: 30 }), { timers: P_DUE, rng });
    expect(rng.draws).toBe(1);
    expect(r.defenderBlinded).toBe(false);
    expect(r.defenderParalyzedMs).toBe(0);
  });
  it('penetration pierces when the defender Miss is exactly 0: round(attack*pen/100); no crit draw at 0% crit', () => {
    const rng = scripted([0.05]);
    const { r } = run(player({ penetration: 33 }), mob({ blockChance: 30 }), { timers: P_DUE, rng });
    expect(r.events[0]).toMatchObject({ type: 'defender_block', damage: 33, defenderHp: 967 });
    expect(r.attackerDamageDealt).toBe(33);
    expect(rng.draws).toBe(1);
  });
  it('pierced damage can crit (second draw) and takes DR then shield', () => {
    const rng = scripted([0.05, PASS]);
    const { r } = run(player({ penetration: 20, critChance: 50 }), mob({ blockChance: 30, damageReduction: 50 }), { timers: P_DUE, rng });
    // base 20, crit x2 = 40, DR 50 -> 20
    expect(r.events[0].damage).toBe(20);
    expect(rng.draws).toBe(2);
  });
  it('a defender with any Miss fully avoids: no pierce', () => {
    const { r } = run(player({ penetration: 50 }), mob({ blockChance: 5, missChance: 25 }), { timers: P_DUE, rng: scripted([0.05]) });
    expect(r.events[0]).toMatchObject({ type: 'defender_miss', damage: 0 });
    expect(r.defenderHp).toBe(1000);
  });
  it('pierce lifesteal and shield', () => {
    const { r } = run(player({ penetration: 50, lifesteal: 10 }), mob({ blockChance: 30 }), {
      php: 500, timers: P_DUE, rng: scripted([0.05]), opts: { defenderShieldHp: 20 },
    });
    // dmg 50: shield takes 20, hp 30; lifesteal floor(50*10/100) = 5
    expect(r.defenderHp).toBe(970);
    expect(r.defenderShieldHp).toBe(0);
    expect(r.attackerHp).toBe(505);
  });
  it('the DR step on a pierce has no d>0 guard: base 0 becomes 1 (L1086793-1086807)', () => {
    const { r } = run(player({ attack: 1, penetration: 10 }), mob({ blockChance: 30, damageReduction: 10 }), { timers: P_DUE, rng: scripted([0.05]) });
    expect(r.events[0].damage).toBe(1);
  });
});

describe('player swing: status procs (L1086577-1086860)', () => {
  const procP = (o) => player({ critChance: 0, ...o });
  it('blind: rolled after the hit, flag set, event; no draw when already blinded', () => {
    const rng = scripted([FAIL, PASS]);
    const { r, types } = run(procP({ blindChance: 10 }), mob(), { timers: P_DUE, rng });
    expect(types).toEqual(['attacker_hit', 'defender_blinded']);
    expect(r.defenderBlinded).toBe(true);
    expect(rng.draws).toBe(2);
    const again = run(procP({ blindChance: 10 }), mob(), { timers: P_DUE, rng: scripted([FAIL]), opts: { defenderBlinded: true } });
    expect(again.rng.draws).toBe(1);
    expect(again.r.defenderBlinded).toBe(true);
  });
  it('blind and paralyze are not rolled when the hit killed the enemy', () => {
    const rng = scripted([FAIL]);
    const { types } = run(procP({ blindChance: 100, paralyzeChance: 100, disruptionChance: 100 }), mob(), { timers: P_DUE, ehp: 50, rng });
    expect(types).toEqual(['attacker_hit', 'defender_dead']);
    expect(rng.draws).toBe(1);
  });
  it('paralyze: 1000 ms, needs paralyzedMs <= 0 after the dt countdown', () => {
    const rng = scripted([FAIL, PASS]);
    const { r, types } = run(procP({ paralyzeChance: 10 }), mob(), { timers: P_DUE, rng });
    expect(types).toEqual(['attacker_hit', 'defender_paralyzed']);
    expect(r.defenderParalyzedMs).toBe(1000);
    // 150 - 100 > 0 -> still paralyzed -> no draw
    const held = run(procP({ paralyzeChance: 10 }), mob(), { timers: P_DUE, rng: scripted([FAIL]), opts: { defenderParalyzedMs: 150 } });
    expect(held.rng.draws).toBe(1);
    expect(held.r.defenderParalyzedMs).toBe(50);
    // 80 - 100 -> 0 -> a new proc is allowed
    const free = run(procP({ paralyzeChance: 10 }), mob(), { timers: P_DUE, rng: scripted([FAIL, PASS]), opts: { defenderParalyzedMs: 80 } });
    expect(free.r.defenderParalyzedMs).toBe(1000);
  });
  it('draw order: negate, crit, double, blind, paralyze, disruption', () => {
    // negate FAIL(not negated) crit FAIL double PASS blind PASS paralyze PASS disruption PASS
    const rng = scripted([FAIL, FAIL, PASS, PASS, PASS, PASS]);
    const p = procP({ doubleHit: 10, blindChance: 10, paralyzeChance: 10, disruptionChance: 10, disruptionEffect: 'SILENCE', critChance: 10 });
    const { r, types } = run(p, mob({ blockChance: 5 }), { timers: P_DUE, rng });
    expect(rng.draws).toBe(6);
    expect(types).toEqual(['attacker_hit', 'attacker_hit', 'defender_blinded', 'defender_paralyzed', 'defender_silenced']);
    expect(r.defenderSilencedMs).toBe(3000);
  });
  it('disruption SILENCE: 3000 ms, no draw while silenced (after the dt countdown)', () => {
    const p = procP({ disruptionChance: 10, disruptionEffect: 'SILENCE' });
    const a = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL, PASS]) });
    expect(a.r.defenderSilencedMs).toBe(3000);
    const held = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL]), opts: { defenderSilencedMs: 2000 } });
    expect(held.r.defenderSilencedMs).toBe(1900);
    expect(held.rng.draws).toBe(1);
  });
  it('disruption miss still draws', () => {
    const p = procP({ disruptionChance: 10 });
    const { r, rng } = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL, FAIL]) });
    expect(rng.draws).toBe(2);
    expect(r.defenderSilencedMs).toBe(0);
  });
  it('disruption STAGGER: stacks build, the third stuns for 2000 ms and resets', () => {
    const p = procP({ disruptionChance: 10, disruptionEffect: 'STAGGER' });
    const one = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL, PASS]), opts: { defenderStaggerStacks: 1 } });
    expect(one.r.defenderStaggerStacks).toBe(2);
    expect(one.r.events[1]).toMatchObject({ type: 'defender_staggered', staggerStacks: 2 });
    expect(one.r.defenderParalyzedMs).toBe(0);
    const stun = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL, PASS]), opts: { defenderStaggerStacks: 2 } });
    expect(stun.types).toEqual(['attacker_hit', 'defender_staggered', 'defender_paralyzed']);
    expect(stun.r.events[1].staggerStacks).toBe(0);
    expect(stun.r.events[2].paralyzeMs).toBe(2000);
    expect(stun.r.defenderParalyzedMs).toBe(2000);
    expect(stun.r.defenderStaggerStacks).toBe(0);
  });
  it('a stagger stun keeps a longer existing paralysis', () => {
    const p = procP({ disruptionChance: 10, disruptionEffect: 'STAGGER' });
    const { r } = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL, PASS]), opts: { defenderStaggerStacks: 2, defenderParalyzedMs: 5100 } });
    expect(r.defenderParalyzedMs).toBe(5000);
  });
  it('disruption FEAR: 1000 ms, no draw while feared', () => {
    const p = procP({ disruptionChance: 10, disruptionEffect: 'FEAR' });
    const a = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL, PASS]) });
    expect(a.r.defenderFearedMs).toBe(1000);
    expect(a.r.events[1]).toMatchObject({ type: 'defender_feared', fearMs: 1000 });
    const held = run(p, mob(), { timers: P_DUE, rng: scripted([FAIL]), opts: { defenderFearedMs: 500 } });
    expect(held.rng.draws).toBe(1);
    expect(held.r.defenderFearedMs).toBe(400);
  });
});

describe('player kills the enemy (L1087410-1087433)', () => {
  it('defender_dead ends the tick: no minion or enemy swing, enemy timer not consumed', () => {
    const m = minionFor({ timer: 5000 });
    const rng = scripted([FAIL]);
    const { r, types } = run(player(), mob(), { timers: BOTH_DUE, ehp: 100, rng, opts: { minion: m } });
    expect(types).toEqual(['attacker_hit', 'defender_dead']);
    expect(r.events[1]).toEqual({ timestamp: 5000, type: 'defender_dead', damage: 0, attackerHp: 1000, defenderHp: 0 });
    expect(r.defenderHp).toBe(0);
    expect(r.timers).toEqual({ attackerTimer: 0, defenderTimer: 1000, regenTimer: 0 });
    expect(rng.draws).toBe(1);
    expect(m.timer).toBe(5000);
  });

  it('the dead check sits inside the player-swing branch: a no-swing tick at defenderHp 0 runs the enemy swing', () => {
    // L1086433 jumps past the check at L1086896 when the player does not swing
    const rng = scripted([FAIL, FAIL]);
    const { r, types } = run(player(), mob({ attack: 50 }), {
      ehp: 0, timers: { attackerTimer: 0, defenderTimer: 950, regenTimer: 0 }, rng,
    });
    expect(types).toEqual(['defender_hit']);
    expect(r.attackerHp).toBe(950);
    expect(r.defenderHp).toBe(0);
    expect(r.timers).toEqual({ attackerTimer: 100, defenderTimer: 50, regenTimer: 0 });
  });
});

describe('minion swing (L1086910-1086950)', () => {
  it('hits after the player and before the enemy; DR and the enemy shield apply; minion lifesteal heals it', () => {
    const m = minionFor({ timer: 900, hp: 50, lifesteal: 20 }); // attack 50, speed 1, maxHp 100
    const { r, types } = run(player(), mob({ damageReduction: 20 }), { timers: P_DUE, rng: scripted([FAIL]), opts: { minion: m, defenderShieldHp: 10 } });
    // player 100 -> 80 (DR); minion 50 -> 40 (DR), shield takes 10 -> 30 hp
    expect(types.slice(0, 2)).toEqual(['attacker_hit', 'minion_hit']);
    expect(r.events[1].damage).toBe(40);
    expect(r.defenderShieldHp).toBe(0);
    expect(r.attackerDamageDealt).toBe(80); // minion damage is not counted
    expect(r.events[1].defenderHp).toBe(1000 - 80 - 30);
    expect(m.timer).toBe(0);
    expect(m.hp).toBe(58); // lifesteal floor(40*20/100) = 8
  });
  it('minion crit draws once (only when its crit chance > 0) and reports minion_crit', () => {
    const m = minionFor({ timer: 900, critChance: 10 });
    const rng = scripted([FAIL, PASS]);
    const { r, types } = run(player(), mob(), { timers: P_DUE, rng, opts: { minion: m } });
    expect(types).toEqual(['attacker_hit', 'minion_crit']);
    expect(r.events[1].damage).toBe(100); // round(50 * 2)
    expect(rng.draws).toBe(2);
  });
  it('a dead minion does not swing and draws nothing', () => {
    const m = minionFor({ timer: 900, alive: false, hp: 0 });
    const { types, rng } = run(player(), mob(), { timers: P_DUE, rng: scripted([FAIL]), opts: { minion: m } });
    expect(types).toEqual(['attacker_hit']);
    expect(rng.draws).toBe(1);
  });
  it('the minion can kill the enemy: defender_dead, enemy does not swing, timers keep the player remainder', () => {
    const m = minionFor({ timer: 900 });
    const { r, types } = run(player(), mob(), { timers: BOTH_DUE, ehp: 120, rng: scripted([FAIL]), opts: { minion: m } });
    expect(types).toEqual(['attacker_hit', 'minion_hit', 'defender_dead']);
    expect(r.defenderHp).toBe(0);
    expect(r.timers).toEqual({ attackerTimer: 0, defenderTimer: 1000, regenTimer: 0 });
  });
});

describe('enemy swing against the player (L1086957-1087236)', () => {
  it('hit: crit draw always happens, even at 0% mob crit', () => {
    const rng = scripted([FAIL]);
    const { r } = run(player(), mob(), { timers: E_DUE, rng });
    expect(r.events).toEqual([{ timestamp: 5000, type: 'defender_hit', damage: 100, attackerHp: 900, defenderHp: 1000 }]);
    expect(r.attackerHp).toBe(900);
    expect(r.timers.defenderTimer).toBe(0);
    expect(rng.draws).toBe(1);
  });
  it('negate roll first when block+miss > 0, then the crit draw', () => {
    const rng = scripted([FAIL, FAIL]);
    run(player({ blockChance: 10 }), mob(), { timers: E_DUE, rng });
    expect(rng.draws).toBe(2);
  });
  it('crit: round(attack * critDamage)', () => {
    const { r } = run(player(), mob({ critChance: 50, critDamage: 1.5 }), { timers: E_DUE, rng: scripted([PASS]) });
    expect(r.attackerHp).toBe(850);
  });
  it('the event damage is the DR-reduced hit; the max(1) floor applies with no d>0 guard', () => {
    const a = run(player({ damageReduction: 40 }), mob(), { timers: E_DUE, rng: scripted([FAIL]) });
    expect(a.r.events[0].damage).toBe(60);
    const b = run(player({ damageReduction: 40 }), mob({ attack: 0 }), { timers: E_DUE, rng: scripted([FAIL]) });
    expect(b.r.events[0].damage).toBe(1);
  });
  it('shield with mitigation 0.5: 100 dmg costs 50 shield, event damage is round(effective)', () => {
    const p = player({ shieldMitigation: 0.5 });
    const { r } = run(p, mob(), { timers: E_DUE, rng: scripted([FAIL]), opts: { attackerShieldHp: 80 } });
    expect(r.attackerShieldHp).toBe(30);
    expect(r.attackerHp).toBe(1000);
    expect(r.events[0]).toMatchObject({ type: 'defender_hit', damage: 50, attackerHp: 1000 });
  });
  it('shield without mitigation absorbs 1:1 and overflows to HP', () => {
    const { r } = run(player(), mob(), { timers: E_DUE, rng: scripted([FAIL]), opts: { attackerShieldHp: 30 } });
    expect(r.attackerShieldHp).toBe(0);
    expect(r.attackerHp).toBe(930);
    expect(r.events[0].damage).toBe(100);
  });
  it('lethal hit: attacker_dead, attackerHp 0', () => {
    const { r, types } = run(player(), mob({ attack: 5000 }), { timers: E_DUE, rng: scripted([FAIL]) });
    expect(types).toEqual(['attacker_dead']);
    expect(r.attackerHp).toBe(0);
    expect(r.events[0].attackerHp).toBe(0);
  });
  it('enemy lifesteal heals the enemy up to its max HP', () => {
    const e = mob({ lifesteal: 10 });
    const a = run(player(), e, { timers: E_DUE, ehp: 500, rng: scripted([FAIL]) });
    expect(a.r.defenderHp).toBe(510);
    const b = run(player(), e, { timers: E_DUE, ehp: 995, rng: scripted([FAIL]) });
    expect(b.r.defenderHp).toBe(1000);
  });
  it('negated: attacker_block / attacker_miss by the player Miss, 1 draw, no pierce without enemy penetration', () => {
    const a = run(player({ blockChance: 40 }), mob(), { timers: E_DUE, rng: scripted([0.05]) });
    expect(a.r.events).toEqual([{ timestamp: 5000, type: 'attacker_block', damage: 0, attackerHp: 1000, defenderHp: 1000 }]);
    expect(a.rng.draws).toBe(1);
    const b = run(player({ blockChance: 10, missChance: 30 }), mob({ penetration: 50 }), { timers: E_DUE, rng: scripted([0.05]) });
    expect(b.types).toEqual(['attacker_miss']);
    expect(b.r.attackerHp).toBe(1000);
  });
  it('enemy penetration pierces only when the player Miss is exactly 0; DR and shield apply; the event stays attacker_block even if lethal', () => {
    const a = run(player({ blockChance: 40, damageReduction: 50 }), mob({ penetration: 40 }), { timers: E_DUE, rng: scripted([0.05]) });
    // base 40, DR 50 -> 20
    expect(a.r.events[0]).toMatchObject({ type: 'attacker_block', damage: 20, attackerHp: 980 });
    const lethal = run(player({ blockChance: 40 }), mob({ attack: 5000, penetration: 100 }), { timers: E_DUE, rng: scripted([0.05]) });
    expect(lethal.types).toEqual(['attacker_block']);
    expect(lethal.r.attackerHp).toBe(0);
  });
  it('enemy penetration crit draws only when the enemy has crit chance', () => {
    const rng = scripted([0.05, PASS]);
    const { r } = run(player({ blockChance: 40 }), mob({ penetration: 50, critChance: 10, critDamage: 2 }), { timers: E_DUE, rng });
    expect(r.events[0].damage).toBe(100); // base 50 * 2
    expect(rng.draws).toBe(2);
  });
});

describe('enemy swing consumed by a status (L1086957-1087366)', () => {
  const statusRun = (opts, pOver = {}) => run(player(pOver), mob(), { timers: E_DUE, opts, rng: scripted([]) });
  it('paralyzed: defender_paralyze, no draws, timer consumed, player unharmed', () => {
    const { r, rng } = statusRun({ defenderParalyzedMs: 1000 });
    expect(r.events).toEqual([{ timestamp: 5000, type: 'defender_paralyze', damage: 0, attackerHp: 1000, defenderHp: 1000 }]);
    expect(r.defenderParalyzedMs).toBe(900);
    expect(r.timers.defenderTimer).toBe(0);
    expect(rng.draws).toBe(0);
  });
  it('feared: defender_fear', () => {
    const { r, types } = statusRun({ defenderFearedMs: 1000 });
    expect(types).toEqual(['defender_fear']);
    expect(r.defenderFearedMs).toBe(900);
  });
  it('blinded: defender_blind and the flag clears', () => {
    const { r, types } = statusRun({ defenderBlinded: true });
    expect(types).toEqual(['defender_blind']);
    expect(r.defenderBlinded).toBe(false);
  });
  it('precedence: paralyze, then fear, then blind (blind stays set)', () => {
    const a = statusRun({ defenderParalyzedMs: 1000, defenderFearedMs: 1000, defenderBlinded: true });
    expect(a.types).toEqual(['defender_paralyze']);
    expect(a.r.defenderBlinded).toBe(true);
    const b = statusRun({ defenderFearedMs: 1000, defenderBlinded: true });
    expect(b.types).toEqual(['defender_fear']);
    expect(b.r.defenderBlinded).toBe(true);
  });
  it('a status that expires this tick (counted down by dt) lets the enemy swing', () => {
    const { r, types } = run(player(), mob(), { timers: E_DUE, opts: { defenderParalyzedMs: 100 }, rng: scripted([FAIL]) });
    expect(types).toEqual(['defender_hit']);
    expect(r.defenderParalyzedMs).toBe(0);
  });
  it('status counters floor at 0 and untouched stagger stacks persist', () => {
    const { r } = run(player(), mob(), { opts: { defenderSilencedMs: 40, defenderFearedMs: 40, defenderParalyzedMs: 40, defenderStaggerStacks: 2 } });
    expect([r.defenderSilencedMs, r.defenderFearedMs, r.defenderParalyzedMs, r.defenderStaggerStacks]).toEqual([0, 0, 0, 2]);
  });
  it('no enemy swing below the interval: timer accumulates, no events', () => {
    const { r, rng } = run(player(), mob(), { timers: { attackerTimer: 0, defenderTimer: 100, regenTimer: 0 } });
    expect(r.timers.defenderTimer).toBe(200);
    expect(r.events).toEqual([]);
    expect(rng.draws).toBe(0);
  });
});

describe('enemy swing against the minion (L1087238-1087328)', () => {
  it('the minion is hit instead of the player: 1 crit draw, minion_damaged with the real damage dealt', () => {
    const m = minionFor({ hp: 60 }); // enemy hits for 100, only 60 dealt
    const rng = scripted([FAIL]);
    const { r, types } = run(player(), mob(), { timers: E_DUE, rng, opts: { minion: m } });
    expect(types).toEqual(['minion_damaged', 'minion_dead']);
    expect(r.events[0]).toEqual({ timestamp: 5000, type: 'minion_damaged', damage: 60, attackerHp: 1000, defenderHp: 1000 });
    expect(r.events[1]).toMatchObject({ type: 'minion_dead', minionRespawnMs: 10000 });
    expect(r.attackerHp).toBe(1000);
    expect(m.alive).toBe(false);
    expect(rng.draws).toBe(1);
  });
  it('no negate roll against the minion even if the player has Block', () => {
    const rng = scripted([FAIL]);
    run(player({ blockChance: 50 }), mob(), { timers: E_DUE, rng, opts: { minion: minionFor() } });
    expect(rng.draws).toBe(1);
  });
  it('mob crit tags the event and uses critDamage', () => {
    const m = minionFor({ hp: 100, maxHp: 500 });
    const { r } = run(player(), mob({ critChance: 50, critDamage: 1.5 }), { timers: E_DUE, rng: scripted([PASS]), opts: { minion: m } });
    expect(r.events[0]).toMatchObject({ type: 'minion_damaged', damage: 100, isCrit: true });
    expect(m.hp).toBe(0); // 150 > hp 100
  });
  it('enemy lifesteal uses the damage dealt to the minion', () => {
    const m = minionFor({ hp: 60 });
    const { r } = run(player(), mob({ lifesteal: 50 }), { timers: E_DUE, ehp: 500, rng: scripted([FAIL]), opts: { minion: m } });
    expect(r.defenderHp).toBe(530);
    expect(r.events[0].defenderHp).toBe(530);
  });
  it('a paralyzed enemy does not hit the minion', () => {
    const m = minionFor();
    const { types } = run(player(), mob(), { timers: E_DUE, rng: scripted([]), opts: { minion: m, defenderParalyzedMs: 1000 } });
    expect(types).toEqual(['defender_paralyze']);
    expect(m.hp).toBe(m.maxHp);
  });
});

describe('whole-tick order and draw sequence', () => {
  it('regen, player swing, minion swing, enemy swing; draws in that order', () => {
    const m = minionFor({ timer: 900, critChance: 10, hp: 500, maxHp: 500 });
    // player: crit draw; minion: crit draw; enemy on minion: crit draw
    const rng = scripted([FAIL, FAIL, FAIL]);
    const p = player({ hpRegen: 5 });
    const { r, types } = run(p, mob(), { php: 500, timers: { attackerTimer: 900, defenderTimer: 900, regenTimer: 0 }, rng, opts: { minion: m } });
    expect(types).toEqual(['attacker_regen', 'attacker_hit', 'minion_hit', 'minion_damaged']);
    expect(rng.draws).toBe(3);
    expect(r.attackerHp).toBe(505);
  });
  it('is deterministic for a fixed seed stream', () => {
    const vals = [0.3, 0.7, 0.1, 0.9, 0.4, 0.6, 0.2, 0.8];
    const a = run(player({ critChance: 30, doubleHit: 30 }), mob({ blockChance: 10 }), { timers: BOTH_DUE, rng: scripted(vals) });
    const b = run(player({ critChance: 30, doubleHit: 30 }), mob({ blockChance: 10 }), { timers: BOTH_DUE, rng: scripted(vals) });
    expect(a.r).toEqual(b.r);
  });
});

describe('routeSpellHealToMinion (L1095017-1095364)', () => {
  const sp = { name: 'S' };
  it('null minion: nothing', () => expect(routeSpellHealToMinion(null, { ownerMinionHeal: 5 }, 1000)).toEqual([]));
  it('copies the soul-link buff modifier even with nothing else to route', () => {
    const m = minionFor();
    expect(routeSpellHealToMinion(m, { buffModifiers: { soulLink: 12 } }, 1000)).toEqual([]);
    expect(m.soulLinkBonus).toBe(12);
    routeSpellHealToMinion(m, { buffModifiers: {} }, 1000);
    expect(m.soulLinkBonus).toBe(0);
  });
  it('minion-directed spell heals: scaled by minion max HP / owner max HP, removed from the owner heal and the events', () => {
    const m = minionFor({ hp: 10, maxHp: 100 });
    const ev = {
      ownerHpDelta: 250, ownerMinionHeal: 200,
      events: [{ type: 'spell_cast', timestamp: 1 }, { type: 'spell_heal_tick', value: 200, timestamp: 2, spell: sp, minionHeal: true }],
    };
    const out = routeSpellHealToMinion(m, ev, 1000);
    // floor(200 * 100 / 1000) = 20
    expect(out).toEqual([{ type: 'minion_heal', timestamp: 2, healed: 20, spell: sp }]);
    expect(m.hp).toBe(30);
    expect(ev.ownerHpDelta).toBe(50);
    expect(ev.ownerMinionHeal).toBe(0);
    expect(ev.events).toEqual([{ type: 'spell_cast', timestamp: 1 }]);
  });
  it('heal share is at least 1; healed is the HP actually gained; a full minion yields no event', () => {
    const m = minionFor({ hp: 99, maxHp: 100 });
    const ev = { ownerHpDelta: 5, ownerMinionHeal: 5, events: [{ type: 'spell_heal_tick', value: 5, timestamp: 2, spell: sp, minionHeal: true }] };
    expect(routeSpellHealToMinion(m, ev, 100000)).toEqual([{ type: 'minion_heal', timestamp: 2, healed: 1, spell: sp }]);
    const full = minionFor();
    const ev2 = { ownerHpDelta: 5, ownerMinionHeal: 5, events: [{ type: 'spell_heal_tick', value: 5, timestamp: 2, spell: sp, minionHeal: true }] };
    expect(routeSpellHealToMinion(full, ev2, 1000)).toEqual([]);
    expect(ev2.events).toEqual([]);
  });
  it('a dead minion routes nothing and leaves the owner heal alone', () => {
    const m = minionFor({ alive: false, hp: 0 });
    const ev = { ownerHpDelta: 5, ownerMinionHeal: 5, events: [{ type: 'spell_heal_tick', value: 5, minionHeal: true }] };
    expect(routeSpellHealToMinion(m, ev, 1000)).toEqual([]);
    expect(ev.ownerHpDelta).toBe(5);
    expect(ev.ownerMinionHeal).toBe(5);
    expect(ev.events).toHaveLength(1);
  });
  it("bastion start sets the minion's bastion; bastion end removes it (2.8.2)", () => {
    const m = minionFor();
    const start = { timestamp: 9, damageReduction: 20, blockChance: 15, thornsPercent: 4, spell: sp };
    expect(routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], bastionStart: start } }, 1000))
      .toEqual([{ type: 'minion_buff', timestamp: 9, healed: 0, spell: sp, minionMaxHp: m.maxHp }]);
    expect([m.bastion, m.bastionSpell]).toEqual([{ damageReduction: 20, blockChance: 15, thornsPercent: 4 }, sp]);
    expect(routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], bastionEnd: { timestamp: 12, spell: sp } } }, 1000))
      .toEqual([{ type: 'minion_buff_end', timestamp: 12, healed: 0, spell: sp, minionMaxHp: m.maxHp }]);
    expect(m.bastion).toBeUndefined();
  });
  it('empower tick heals', () => {
    const m = minionFor({ hp: 10, maxHp: 100 });
    const ev = { ownerMinionEmpower: { heals: [{ timestamp: 3, value: 100, spell: sp }, { timestamp: 4, value: 100, spell: sp }] } };
    const out = routeSpellHealToMinion(m, ev, 1000);
    expect(out.map((o) => [o.type, o.timestamp, o.healed])).toEqual([['minion_heal', 3, 10], ['minion_heal', 4, 10]]);
    expect(m.hp).toBe(30);
  });
  it('empower start: bonus = floor(maxHp * pct / 100) added to maxHp and hp; an active empower ends first', () => {
    const m = minionFor({ hp: 100, maxHp: 100 });
    const ev = { ownerMinionEmpower: { heals: [], start: { timestamp: 9, maxHpPercent: 25, spell: sp } } };
    const out = routeSpellHealToMinion(m, ev, 1000);
    expect(out).toEqual([{ type: 'minion_buff', timestamp: 9, healed: 25, spell: sp, minionMaxHp: 125 }]);
    expect([m.maxHp, m.hp, m.empowerBonusHp, m.empowerSpell]).toEqual([125, 125, 25, sp]);
    // a second start first removes the old bonus (125 -> 100), then adds 25 again
    routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], start: { timestamp: 10, maxHpPercent: 25, spell: sp } } }, 1000);
    expect([m.maxHp, m.empowerBonusHp]).toEqual([125, 25]);
  });
  it('empower end removes the bonus and reports minion_buff_end only when one was active', () => {
    const m = minionFor({ hp: 100, maxHp: 100 });
    routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], start: { timestamp: 9, maxHpPercent: 50, spell: sp } } }, 1000);
    expect(m.maxHp).toBe(150);
    const out = routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], end: { timestamp: 20, spell: sp } } }, 1000);
    expect(out).toEqual([{ type: 'minion_buff_end', timestamp: 20, healed: 0, spell: sp, minionMaxHp: 100 }]);
    expect(m.hp).toBe(100);
    const none = routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], end: { timestamp: 21, spell: sp } } }, 1000);
    expect(none).toEqual([]);
  });
  it('frenzy start and end', () => {
    const m = minionFor();
    const f = { timestamp: 4, attackPercent: 30, attackSpeedPercent: 20, lifesteal: 5, spell: sp };
    const out = routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], frenzyStart: f } }, 1000);
    expect(out).toEqual([{ type: 'minion_buff', timestamp: 4, healed: 0, spell: sp, minionMaxHp: m.maxHp }]);
    expect(m.frenzy).toEqual({ attackPercent: 30, attackSpeedPercent: 20, lifesteal: 5 });
    expect(m.frenzySpell).toBe(sp);
    const end = routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], frenzyEnd: { timestamp: 30, spell: sp } } }, 1000);
    expect(end).toEqual([{ type: 'minion_buff_end', timestamp: 30, healed: 0, spell: sp, minionMaxHp: m.maxHp }]);
    expect(m.frenzy).toBeUndefined();
  });
  it('output order: heals, empower end, frenzy end, spell-tick heals, empower start, frenzy start', () => {
    const m = minionFor({ hp: 10, maxHp: 100 });
    routeSpellHealToMinion(m, { ownerMinionEmpower: { heals: [], start: { timestamp: 1, maxHpPercent: 10, spell: sp }, frenzyStart: { timestamp: 1, attackPercent: 1, attackSpeedPercent: 1, lifesteal: 1, spell: sp } } }, 1000);
    const ev = {
      ownerHpDelta: 100, ownerMinionHeal: 100,
      events: [{ type: 'spell_heal_tick', value: 100, timestamp: 6, spell: sp, minionHeal: true }],
      ownerMinionEmpower: {
        heals: [{ timestamp: 5, value: 100, spell: sp }],
        end: { timestamp: 7, spell: sp }, frenzyEnd: { timestamp: 8, spell: sp },
        start: { timestamp: 9, maxHpPercent: 10, spell: sp }, frenzyStart: { timestamp: 10, attackPercent: 1, attackSpeedPercent: 1, lifesteal: 1, spell: sp },
      },
    };
    const out = routeSpellHealToMinion(m, ev, 1000);
    expect(out.map((o) => `${o.type}@${o.timestamp}`)).toEqual([
      'minion_heal@5', 'minion_buff_end@7', 'minion_buff_end@8', 'minion_heal@6', 'minion_buff@9', 'minion_buff@10',
    ]);
  });
});
