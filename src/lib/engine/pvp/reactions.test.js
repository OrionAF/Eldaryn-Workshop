import { describe, it, expect, vi } from 'vitest';
import {
  createReactions, createDuelState, shieldBaseFor, initEntityShield,
  ATTACKER_DAMAGE_EVENTS, DEFENDER_DAMAGE_EVENTS,
} from './reactions.js';
import { createStackCombat } from '../core/stacks.js';
import { applyDebuff, initDebuffState } from '../core/debuffs.js';
import { summonMinion } from '../core/minions.js';
import { scripted } from '../rng.js';

const WAR = { playerClass: 'WARRIOR', activeSpec: 'WARRIOR_TANK' };
const SEN = { playerClass: 'SENTINEL', activeSpec: 'SENTINEL_RANGER' };

const sheet = (o = {}) => ({
  totalHp: 1000, pvpBaseHp: 1000, totalAttack: 100, totalAttackSpeed: 2, totalDoubleHit: 0, totalCritChance: 10,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 20, totalBlockChance: 20,
  totalMissChance: 10, totalBlindChance: 30, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0,
  totalPvpDefense: 0, ...o,
});
const summon = { species: 'SKELETON', name: 'Skeleton', icon: 'x', minion: 'MELEE', hpPercent: 50, attackPercent: 50, respawnCooldownMs: 5000, summonCastMs: 0 };

// Fake pieces of modules this file does not import (spells.js, pvp/attack.js).
const deps = (o = {}) => ({
  isSpellBuffActive: () => true,
  activeBuffThornsPercent: () => 0,
  pvpRatingToFraction: (r) => r / (r + 100),
  ...o,
});

function duel(o = {}) {
  const s = createDuelState({
    attackerStats: sheet(), defenderStats: sheet(), attackerEquipped: [], defenderEquipped: [],
    attackerStackCtx: WAR, defenderStackCtx: WAR, rng: () => 0.5, ...o,
  });
  s.timestamp = 70;
  return s;
}

// A recording fake of a createStackCombat bundle.
const fakeStack = (o = {}) => ({
  active: true,
  calls: [],
  onHitLanded() { this.calls.push('hitLanded'); },
  onEvaded() { this.calls.push('evaded'); },
  blockReflect(d) { this.calls.push(['block', d]); return o.block ?? 0; },
  hitTakenReflect(d) { this.calls.push(['taken', d]); return o.taken ?? 0; },
  ...o.extra,
});

describe('shieldBaseFor (L1455714-1455733)', () => {
  it('raw max HP unless max HP is buffed above it, then x PVP_SHIELD_BASE_MULTIPLIER (2)', () => {
    expect(shieldBaseFor({ maxHp: 100, rawMaxHp: 100 })).toBe(100);
    expect(shieldBaseFor({ maxHp: 800, rawMaxHp: 100 })).toBe(200);
    expect(shieldBaseFor({ maxHp: 50, rawMaxHp: 100 })).toBe(100);
  });
});

describe('initEntityShield / createDuelState (L1455734-1455812, argument mapping L1454718-1456045)', () => {
  it('shieldMax = floor(base * hpPercent / 100), starts full; flags copied; none when hpPercent <= 0 or no config', () => {
    const e = { maxHp: 800, rawMaxHp: 100 }; // base 200
    initEntityShield(e, { hpPercent: 12.5, vampAlwaysRefills: true });
    expect(e).toMatchObject({ shieldMax: 25, shieldHp: 25, shieldVampAlwaysRefills: true, shieldRegenAlwaysRefills: undefined });
    initEntityShield(e, { hpPercent: 0 });
    expect(e.shieldMax).toBe(0);
    initEntityShield(e, null);
    expect(e).toMatchObject({ shieldMax: 0, shieldHp: 0, shieldVampAlwaysRefills: undefined });
  });
  it('builds entities, shields (x8 HP buff uses the doubled raw base), a dead minion and the flags', () => {
    const s = duel({
      attackerStats: sheet({ totalHp: 8000, pvpBaseHp: 1000 }),
      attackerShield: { hpPercent: 10, regenAlwaysRefills: true },
      defenderSummon: summon,
    });
    expect(s.attacker).toMatchObject({ maxHp: 8000, rawMaxHp: 1000, shieldMax: 200, shieldHp: 200, shieldRegenAlwaysRefills: true });
    expect(s.defender.shieldMax).toBe(0);
    expect(s.attackerMinion).toBeNull();
    expect(s.defenderMinion).toMatchObject({ alive: false, hp: 0, attack: 50, maxHp: 500 });
    expect(s).toMatchObject({ hasShields: true, hasMinions: true, stacksActive: false, tickMs: 10, attackerIronBastionPercent: 0 });
  });
  it('reads Iron Bastion percent and stack overrides from the glyph combat object; sunder alone activates stacks', () => {
    const s = duel({
      attackerEquipped: ['SUNDER_MARK'], attackerGlyphCombat: { stack: null, ironBastionThornsPercent: 12 },
    });
    expect(s.attackerIronBastionPercent).toBe(12);
    expect(s.attackerStack.active).toBe(true);
    expect(s.stacksActive).toBe(true);
  });
});

describe('applyStackToTarget (L1454739-1454814)', () => {
  it('no-op without active stacks', () => {
    const s = duel();
    const r = createReactions(s, deps());
    const t = { damageReduction: 20, blindChance: 5, blockChance: 5, missChance: 5, hpRegen: 0 };
    r.applyStackToTarget(t, s.defenderStack, s.attackerStack)();
    expect(t).toMatchObject({ damageReduction: 20, blindChance: 5 });
  });
  it('own Bulwark DR (+4 per stack) then foe Sunder (-4 per stack on DR/blind/block/miss, floored at 0); undo restores', () => {
    const s = duel({ defenderEquipped: ['BULWARK_OF_THORNS'], attackerEquipped: ['SUNDER_MARK'] });
    const r = createReactions(s, deps());
    s.defenderStack.blockReflect(0); s.defenderStack.blockReflect(0); // Bulwark 2 stacks: +8 DR
    for (let i = 0; i < 3; i++) s.attackerStack.onHitLanded(); // Sunder 3 stacks: -12
    const t = s.defender;
    const undo = r.applyStackToTarget(t, s.defenderStack, s.attackerStack);
    // DR 20 + 8 = 28, - 12 = 16; blind 30 -> 18; block 20 -> 8; miss 10 -> max(0, -2) = 0
    expect([t.damageReduction, t.blindChance, t.blockChance, t.missChance]).toEqual([16, 18, 8, 0]);
    undo();
    expect([t.damageReduction, t.blindChance, t.blockChance, t.missChance]).toEqual([20, 30, 20, 10]);
  });
});

describe('applyElusiveToSwinger (L1454816-1454895)', () => {
  it('no-op at zero stacks; with stacks adds the Elusive buff and undo restores exactly', () => {
    const s = duel({ attackerEquipped: ['ELUSIVE_SUPREMACY'], attackerStackCtx: SEN });
    const r = createReactions(s, deps());
    const a = s.attacker;
    const before = { attack: a.attack, critChance: a.critChance, lifesteal: a.lifesteal, attackSpeed: a.attackSpeed };
    r.applyElusiveToSwinger(a, s.attackerStack)();
    expect(a).toMatchObject(before);
    s.attackerStack.onEvaded(); s.attackerStack.onEvaded();
    const undo = r.applyElusiveToSwinger(a, s.attackerStack);
    const m = s.attackerStack.elusiveSelfModifiers();
    expect(m.attackPercent).toBeGreaterThan(0);
    expect(a.attack).toBe(Math.round(100 * (1 + m.attackPercent / 100)));
    expect(a.critChance).toBe(before.critChance + m.critChancePercent);
    undo();
    expect(a).toMatchObject(before);
  });
  it('no-op when stacks are globally off or the bundle is inactive', () => {
    const s = duel();
    const r = createReactions(s, deps());
    const a = { attack: 100, critChance: 10, lifesteal: 0, attackSpeed: 2 };
    r.applyElusiveToSwinger(a, { active: true, elusiveSelfModifiers: () => ({ attackPercent: 50, critChancePercent: 0, lifestealPercent: 0, attackSpeedPercent: 0 }) })();
    expect(a.attack).toBe(100); // stacksActive false
  });
});

describe('applyCritDownToSwinger (L1454896-1454928)', () => {
  it('lowers crit chance by the CRIT_DOWN reduction and undoes; no debuff = no change', () => {
    const s = duel();
    const r = createReactions(s, deps());
    const state = initDebuffState();
    r.applyCritDownToSwinger(s.attacker, state)();
    expect(s.attacker.critChance).toBe(10);
    applyDebuff(state, { type: 'CRIT_DOWN', config: { durationMs: 0, maxStacks: 3, critChanceReduction: 4 } }, 0);
    const undo = r.applyCritDownToSwinger(s.attacker, state);
    expect(s.attacker.critChance).toBe(6);
    undo();
    expect(s.attacker.critChance).toBe(10);
  });
});

describe('reactToAttack (L1454929-1455279)', () => {
  const hit = (type, damage) => ({ type, damage });

  it('returns before touching any bundle when nothing can react', () => {
    const s = duel();
    s.attackerStack = fakeStack(); s.defenderStack = fakeStack();
    createReactions(s, deps()).reactToAttack([hit('attacker_hit', 50)]);
    expect(s.attackerStack.calls).toEqual([]);
    expect(s.defenderStack.calls).toEqual([]);
    expect(s.events).toEqual([]);
  });

  it('dispatches each event type to the right bundle method', () => {
    const s = duel();
    s.stacksActive = true;
    s.attackerStack = fakeStack(); s.defenderStack = fakeStack();
    createReactions(s, deps()).reactToAttack([
      hit('attacker_hit', 1), hit('attacker_crit', 2), hit('defender_hit', 3), hit('defender_crit', 4),
      hit('attacker_block', 5), hit('attacker_miss', 6), hit('defender_block', 7), hit('defender_miss', 8),
      hit('attacker_blind', 9), hit('defender_blind', 10), hit('defender_regen', 11),
    ]);
    expect(s.attackerStack.calls).toEqual([
      'hitLanded', 'hitLanded', ['taken', 3], ['taken', 4], ['block', 5], ['block', 6], 'evaded', 'evaded',
    ]);
    // [attacker_hit 1, attacker_crit 2] hit the defender; [defender_block 7, defender_miss 8] block-reflect it
    expect(s.defenderStack.calls).toEqual([
      ['taken', 1], ['taken', 2], 'hitLanded', 'hitLanded', ['block', 7], ['block', 8], 'evaded', 'evaded',
    ]);
  });

  it('stack thorns: defender thorns hit the attacker, absorbed by shield first, logged defender_thorns_reflect', () => {
    const s = duel({ attackerShield: { hpPercent: 1 } }); // shield 10
    s.stacksActive = true;
    s.attackerStack = fakeStack(); s.defenderStack = fakeStack({ taken: 14 });
    createReactions(s, deps()).reactToAttack([hit('attacker_hit', 100)]);
    expect(s.attacker.shieldHp).toBe(0);
    expect(s.attacker.hp).toBe(996); // 14 - 10 shield
    expect(s.events).toEqual([{ timestamp: 70, type: 'defender_thorns_reflect', damage: 14, attackerHpAfter: 996, defenderHpAfter: 1000 }]);
  });

  it('Iron Bastion and active-buff thorns each round separately and add to the stack thorns', () => {
    const s = duel();
    s.defenderIronBastionPercent = 15;
    s.defenderSpellRuntimes = [{}];
    s.attackerStack = fakeStack(); s.defenderStack = fakeStack({ taken: 7 });
    const isSpellBuffActive = vi.fn(() => true);
    const r = createReactions(s, deps({ isSpellBuffActive, activeBuffThornsPercent: () => 10 }));
    r.reactToAttack([hit('attacker_hit', 33)]);
    // 7 + round(33*15/100 = 4.95) + round(33*10/100 = 3.3) = 7 + 5 + 3
    expect(s.events[0]).toMatchObject({ type: 'defender_thorns_reflect', damage: 15 });
    expect(isSpellBuffActive).toHaveBeenCalledWith(s.defenderSpellRuntimes, 'IRON_BASTION');
    expect(s.attacker.hp).toBe(985);
  });

  it('Iron Bastion needs its buff up; an inactive buff reflects nothing', () => {
    const s = duel();
    s.attackerIronBastionPercent = 50;
    s.attackerSpellRuntimes = [{}];
    createReactions(s, deps({ isSpellBuffActive: () => false })).reactToAttack([hit('defender_hit', 100)]);
    expect(s.events).toEqual([]);
  });

  it('attacker thorns are applied first (to the defender); block reflect feeds the same sum', () => {
    const s = duel({ defenderShield: { hpPercent: 1 } });
    s.stacksActive = true;
    s.attackerStack = fakeStack({ block: 6, taken: 4 }); s.defenderStack = fakeStack({ block: 9 });
    createReactions(s, deps()).reactToAttack([hit('attacker_block', 20), hit('defender_hit', 30), hit('defender_block', 20)]);
    expect(s.events.map((e) => [e.type, e.damage])).toEqual([['attacker_thorns_reflect', 10], ['defender_thorns_reflect', 9]]);
    expect(s.defender.hp).toBe(1000); // 10 fully absorbed by the 10 shield
    expect(s.attacker.hp).toBe(991);
  });

  it('reflects nothing once either side is dead', () => {
    const s = duel();
    s.stacksActive = true;
    s.attacker.hp = 0;
    s.attackerStack = fakeStack({ taken: 5 }); s.defenderStack = fakeStack({ taken: 5 });
    createReactions(s, deps()).reactToAttack([hit('attacker_hit', 10), hit('defender_hit', 10)]);
    expect(s.events).toEqual([]);
    expect(s.defender.hp).toBe(1000);
  });

  it('real Bulwark: thorns read before the stack change (block then hit taken)', () => {
    const s = duel({ defenderEquipped: ['BULWARK_OF_THORNS'] });
    const r = createReactions(s, deps());
    s.defenderStack.blockReflect(0); // 1 stack: thorns 7%
    r.reactToAttack([hit('attacker_hit', 100)]); // thorns round(100*7/100) = 7, then the stack drops to 0
    expect(s.events[0]).toMatchObject({ type: 'defender_thorns_reflect', damage: 7 });
    r.reactToAttack([hit('attacker_hit', 100)]);
    expect(s.events).toHaveLength(1);
  });
});

describe('tagShieldSnapshots / tagMinionSnapshots (L1455280-1455346)', () => {
  it('stamps events from the given index, shield floored at 0', () => {
    const s = duel({ defenderSummon: summon });
    s.events.push({ type: 'a' }, { type: 'b' }, { type: 'c' });
    s.attacker.shieldHp = 5; s.defender.shieldHp = -3;
    s.defenderMinion.hp = 42;
    const r = createReactions(s, deps());
    r.tagShieldSnapshots(1);
    r.tagMinionSnapshots(2);
    expect(s.events[0]).toEqual({ type: 'a' });
    expect(s.events[1]).toEqual({ type: 'b', attackerShieldHpAfter: 5, defenderShieldHpAfter: 0 });
    expect(s.events[2]).toEqual({ type: 'c', attackerShieldHpAfter: 5, defenderShieldHpAfter: 0, defenderMinionHpAfter: 42 });
  });
});

describe('finishMinionTick / killMinionsOfDead (L1455347-1455562)', () => {
  it('event sets partition the damage events', () => {
    for (const t of ATTACKER_DAMAGE_EVENTS) expect(DEFENDER_DAMAGE_EVENTS.has(t)).toBe(false);
    expect(ATTACKER_DAMAGE_EVENTS.size).toBe(9);
    expect(DEFENDER_DAMAGE_EVENTS.size).toBe(9);
  });

  it('soul-link heals each minion from its own side\'s damage, logging the HP gained', () => {
    const s = duel({
      attackerStats: sheet({ totalSoulLink: 50 }), defenderStats: sheet({ totalSoulLink: 25 }),
      attackerSummon: summon, defenderSummon: summon,
    });
    summonMinion(s.attackerMinion); summonMinion(s.defenderMinion);
    s.attackerMinion.hp = 100; s.defenderMinion.hp = 100;
    s.events.push(
      { type: 'attacker_hit', damage: 41 }, { type: 'attacker_spell_damage', damage: 10 },
      { type: 'defender_hit', damage: 80 }, { type: 'attacker_minion_hit', damage: 999 },
    );
    createReactions(s, deps()).finishMinionTick(0);
    // attacker side dealt 51 -> floor(51*50/100) = 25; defender side dealt 80 -> floor(80*25/100) = 20
    expect(s.events.slice(4)).toEqual([
      { timestamp: 70, type: 'attacker_minion_heal', damage: 25, attackerHpAfter: 1000, defenderHpAfter: 1000 },
      { timestamp: 70, type: 'defender_minion_heal', damage: 20, attackerHpAfter: 1000, defenderHpAfter: 1000 },
    ]);
    expect(s.attackerMinion.hp).toBe(125);
    expect(s.defenderMinion.hp).toBe(120);
  });

  it('only events from the start index count; no minions = no heal events', () => {
    const s = duel({ attackerStats: sheet({ totalSoulLink: 100 }), attackerSummon: summon });
    summonMinion(s.attackerMinion);
    s.attackerMinion.hp = 10;
    s.events.push({ type: 'attacker_hit', damage: 30 }, { type: 'attacker_hit', damage: 6 });
    createReactions(s, deps()).finishMinionTick(1);
    expect(s.events[2]).toMatchObject({ type: 'attacker_minion_heal', damage: 6 });
    const t = duel();
    t.events.push({ type: 'attacker_hit', damage: 30 });
    createReactions(t, deps()).finishMinionTick(0);
    expect(t.events).toHaveLength(1);
  });

  it('kills the minion of a dead owner (no respawn) and logs <side>_minion_dead once', () => {
    const s = duel({ attackerSummon: summon, defenderSummon: summon });
    summonMinion(s.attackerMinion); summonMinion(s.defenderMinion);
    s.defender.hp = -5;
    const r = createReactions(s, deps());
    r.finishMinionTick(0);
    expect(s.defenderMinion).toMatchObject({ alive: false, hp: 0, respawnMs: 0 });
    expect(s.attackerMinion.alive).toBe(true);
    expect(s.events).toEqual([{ timestamp: 70, type: 'defender_minion_dead', damage: 0, attackerHpAfter: 1000, defenderHpAfter: 0 }]);
    r.finishMinionTick(0); // already dead: nothing more
    expect(s.events).toHaveLength(1);
  });
});

describe('minionStrike (L1455564-1455680)', () => {
  // attack speed 2 -> swing interval 500 ms; the minion strikes for 50 (attack 100 * 50%).
  const setup = (o = {}) => {
    const s = duel({ attackerSummon: summon, ...o });
    s.tickMs = 500;
    summonMinion(s.attackerMinion);
    s.attackerMinion.critChance = o.minionCrit ?? 0;
    return s;
  };

  it('no swing before the interval, nothing for a dead minion or dead target (no rng draws)', () => {
    const s = setup();
    s.rng = scripted([]);
    s.tickMs = 100;
    const r = createReactions(s, deps());
    r.minionStrike(s.attackerMinion, 'attacker', s.defender, s.defender, s.defenderStack, s.attackerStack);
    expect(s.events).toEqual([]);
    s.tickMs = 500;
    s.defender.hp = 0;
    r.minionStrike(s.attackerMinion, 'attacker', s.defender, s.defender, s.defenderStack, s.attackerStack);
    s.defender.hp = 1000;
    s.attackerMinion.alive = false;
    r.minionStrike(s.attackerMinion, 'attacker', s.defender, s.defender, s.defenderStack, s.attackerStack);
    expect(s.events).toEqual([]);
    expect(s.rng.draws).toBe(0);
  });

  it('hit: DR mitigates (50 * 0.8 = 40), shield absorbs, event typed by side, 0 draws without crit chance', () => {
    const s = setup({ defenderShield: { hpPercent: 1 } }); // shield 10
    s.rng = scripted([]);
    createReactions(s, deps()).minionStrike(s.attackerMinion, 'attacker', s.defender, s.defender, s.defenderStack, s.attackerStack);
    expect(s.defender).toMatchObject({ shieldHp: 0, hp: 970 });
    expect(s.events).toEqual([{ timestamp: 70, type: 'attacker_minion_hit', damage: 40, attackerHpAfter: 1000, defenderHpAfter: 970 }]);
  });

  it('crit consumes exactly one draw (round(50 * 1.5) = 75, * 0.8 = 60); defender-side type name', () => {
    const s = setup({ minionCrit: 50 });
    s.rng = scripted([0.1]);
    createReactions(s, deps()).minionStrike(s.attackerMinion, 'defender', s.defender, s.defender, s.defenderStack, s.attackerStack);
    expect(s.rng.draws).toBe(1);
    expect(s.events[0]).toMatchObject({ type: 'defender_minion_crit', damage: 60 });
  });

  it('target PVP defense: round(40 * (1 - fraction)), min 1', () => {
    const s = setup({ defenderStats: sheet({ totalPvpDefense: 100 }) });
    createReactions(s, deps()).minionStrike(s.attackerMinion, 'attacker', s.defender, s.defender, s.defenderStack, s.attackerStack);
    expect(s.events[0].damage).toBe(20); // fraction 100/200 = 0.5
    const t = setup({ defenderStats: sheet({ totalPvpDefense: 1e9 }) });
    createReactions(t, deps()).minionStrike(t.attackerMinion, 'attacker', t.defender, t.defender, t.defenderStack, t.attackerStack);
    expect(t.events[0].damage).toBe(1);
  });

  it('uses Bulwark/Sunder for the DR read, restores the entity, and syncs a distinct drTarget', () => {
    const s = setup({ defenderEquipped: ['BULWARK_OF_THORNS'] });
    s.defenderStack.blockReflect(0); s.defenderStack.blockReflect(0); // +8 DR -> 28
    const copy = { ...s.defender };
    createReactions(s, deps()).minionStrike(s.attackerMinion, 'attacker', s.defender, copy, s.defenderStack, s.attackerStack);
    expect(s.events[0].damage).toBe(36); // round(50 * 0.72)
    expect(copy.damageReduction).toBe(20); // restored
    expect(copy.hp).toBe(s.defender.hp);
    expect(copy.shieldHp).toBe(s.defender.shieldHp);
  });

  it('minion lifesteal heals the minion by floor(dealt * ls / 100)', () => {
    const s = setup({ attackerStats: sheet({ totalMinionLifesteal: 50 }) });
    s.attackerMinion.hp = 100;
    createReactions(s, deps()).minionStrike(s.attackerMinion, 'attacker', s.defender, s.defender, s.defenderStack, s.attackerStack);
    expect(s.attackerMinion.hp).toBe(120); // dealt 40 -> +20
  });
});
