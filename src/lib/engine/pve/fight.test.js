import { describe, it, expect, vi } from 'vitest';
import {
  simulateFight, simulatePve, preparePveFighter, sigilStateOf, mobEntityOf, trainingDummy,
  oblivionCombatState, worldBossHooks, FIGHT_CAP_MS, PVE_SHIELD_MITIGATION,
} from './fight.js';
import { createPlayerEntity, createMobEntity } from '../core/entity.js';
import { initSpellRuntimes } from '../core/spells.js';
import { createMinion, summonMinion } from '../core/minions.js';
import { initDebuffState, applyDebuff } from '../core/debuffs.js';
import { EMPTY_BULWARK_MODIFIERS, EMPTY_ELUSIVE_MODIFIERS, EMPTY_SUNDER_MODIFIERS } from '../core/stacks.js';
import { mulberry32, hashSeed, scripted } from '../rng.js';
import { chapterMobs, worldBossMob, oblivionFloorMob, oblivionEffectiveInstability } from './enemies.js';

// A ComputedStats-shaped sheet with every field createPlayerEntity reads.
const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const hero = (o = {}) => createPlayerEntity(stats(o));
const mob = (o = {}) => createMobEntity({ hp: 1e9, attack: 0, attackSpeed: 0, ...o });
// An rng that never succeeds a chance roll (value 0.99 -> 99 < chance fails for chances < 99).
const never = () => 0.99;
const always = () => 0;
const types = (r) => r.ticks.map((e) => e.type);

describe('simulateFight loop skeleton (L1087661-1089480)', () => {
  it('returns at once when either side starts dead (attackerWon false)', () => {
    const p = hero();
    p.hp = 0;
    const r = simulateFight(p, mob(), {}, never);
    expect(r).toMatchObject({ attackerWon: false, endTime: 0, hp: 0 });
    expect(r.ticks).toEqual([]);
    const e = mob();
    e.hp = 0;
    expect(simulateFight(hero(), e, {}, never).attackerWon).toBe(false);
  });

  it('timestamps run startMs + k * dt and the fight times out at maxMs without a win', () => {
    const r = simulateFight(hero(), mob(), { dtMs: 100, startMs: 5000, maxMs: 1000 }, never);
    expect(r.attackerWon).toBe(false);
    expect(r.endTime).toBe(6000);
    // player swings at 1000 ms (interval 1000, timers start at 0): the one hit lands on the 10th tick
    expect(r.ticks.map((e) => [e.type, e.timestamp])).toEqual([['attacker_hit', 6000]]);
    expect(r.damageDealt).toBe(1000);
  });

  it('the shared engine caps a fight at 20 minutes', () => {
    expect(FIGHT_CAP_MS).toBe(1_200_000);
    const r = simulateFight(hero({ totalAttack: 1 }), mob({ hp: 1e12 }), { dtMs: 1000, log: false }, never);
    expect(r.endTime).toBe(1_200_000);
    expect(r.attackerWon).toBe(false);
    expect(r.ticks).toEqual([]);
  });

  it('a swing kill ends the fight on that tick with the tick\'s own defender_dead', () => {
    const r = simulateFight(hero(), mob({ hp: 1000 }), { opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 } }, never);
    expect(r.attackerWon).toBe(true);
    expect(r.endTime).toBe(100);
    expect(types(r)).toEqual(['attacker_hit', 'defender_dead']);
    expect(r.enemyHp).toBe(0);
  });

  it('the player dying ends the fight: attacker_dead, hp 0, not a win', () => {
    const p = hero({ totalHp: 100 });
    const e = mob({ attack: 500, attackSpeed: 1 });
    const r = simulateFight(p, e, { opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 } }, never);
    expect(r.attackerWon).toBe(false);
    expect(r.hp).toBe(0);
    expect(r.shieldHp).toBe(0);
    expect(types(r)).toEqual(['attacker_dead']);
    expect(r.damageTaken).toBe(500);
  });

  it('opening half starts the mob swing timer at half its interval (L1074380-1074415); zero at 0', () => {
    const e = mob({ attack: 10, attackSpeed: 1 });
    const first = (opening) => simulateFight(hero(), e, { opening, maxMs: 2000, log: true }, never)
      .ticks.find((ev) => ev.type === 'defender_hit').timestamp;
    expect(first('zero')).toBe(1000);
    expect(first('half')).toBe(500);
  });

  it('does not mutate the entities it is given', () => {
    const p = hero();
    const e = mob({ hp: 50 });
    simulateFight(p, e, { opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 } }, never);
    expect(p.hp).toBe(10000);
    expect(e.hp).toBe(50);
  });
});

describe('spells step (L1088292-1088735)', () => {
  const damageSpell = (o = {}) => ({
    species: 'TESTBOLT', name: 'Bolt', icon: null,
    spell: { spellType: 'DAMAGE', baseDamage: 0, isDoT: false, attackPercent: 55, cooldownMs: 8000, ...o },
  });
  const ready = (configs) => initSpellRuntimes(configs).map((rt) => ({ ...rt, cooldownRemaining: 0 }));

  it('a spell that kills the enemy pre-empts the swing: no attacker_hit, one defender_dead, win', () => {
    // 1000 attack * 55 % = 550 damage, no resist, no spell damage
    const r = simulateFight(hero(), mob({ hp: 500 }), {
      spells: ready([damageSpell()]), opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 },
    }, never);
    expect(r.attackerWon).toBe(true);
    expect(r.endTime).toBe(100);
    expect(types(r)).toContain('spell_damage');
    expect(types(r)).not.toContain('attacker_hit');
    expect(types(r).filter((t) => t === 'defender_dead')).toHaveLength(1);
    expect(r.ticks.find((e) => e.type === 'spell_damage').damage).toBe(550);
    expect(r.damageDealt).toBe(500);
  });

  it('the spell resist is spellResist + damageReduction on the shared engine, spellResist alone on the live one', () => {
    const e = Object.assign(mob({ hp: 1e6, damageReduction: 20 }), { spellResist: 10 });
    const dmg = (liveSpellResist) => simulateFight(hero(), e, {
      spells: ready([damageSpell()]), maxMs: 100, liveSpellResist,
    }, never).ticks.find((ev) => ev.type === 'spell_damage').damage;
    // floor(550 * (1 - 0.30)) = 385 ; floor(550 * (1 - 0.10)) = 495
    expect(dmg(false)).toBe(385);
    expect(dmg(true)).toBe(495);
  });

  it('an active BUFF is laid on the player entity: Attack % multiplies the swing', () => {
    const buff = {
      species: 'TESTFURY', name: 'Fury', icon: null,
      spell: { spellType: 'BUFF', effects: [{ stat: 'ATTACK_PERCENT', value: 100 }], durationMs: 5000, cooldownMs: 15000 },
    };
    const r = simulateFight(hero(), mob(), {
      spells: initSpellRuntimes([buff]), opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 }, maxMs: 100,
    }, never);
    expect(r.ticks.find((e) => e.type === 'attacker_hit').damage).toBe(2000);
  });

  it('a heal clamps to the buffed max HP and refills the shield with the overflow', () => {
    const heal = {
      species: 'TESTHEAL', name: 'Heal', icon: null,
      spell: { spellType: 'HEAL', healPercentPerTick: 10, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 },
    };
    const p = hero({ totalHp: 1000 });
    p.hp = 950;
    p.shieldMax = 500;
    p.shieldHp = 0;
    const r = simulateFight(p, mob(), { spells: ready([heal]), maxMs: 1200 }, never);
    // first heal tick at 1100 ms: floor(1000 * 10 / 100) = 100; 50 reaches HP, the other 50 overflows into the shield
    expect(r.hp).toBe(1000);
    expect(r.shieldHp).toBe(50);
  });

  it('a DEBUFF spell puts its debuff on the enemy list and logs spell_debuff_applied', () => {
    const bleed = {
      species: 'TESTBLEED', name: 'Bleed', icon: null,
      spell: {
        spellType: 'DEBUFF', debuffType: 'BLEED', cooldownMs: 10000,
        debuff: { durationMs: 5000, maxStacks: 3, tickIntervalMs: 1000, damagePerTickPercent: 10 },
      },
    };
    const list = initDebuffState();
    const r = simulateFight(hero(), mob(), { spells: ready([bleed]), debuffs: list, maxMs: 100 }, never);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ type: 'BLEED', stacks: 1, damagePerTickFlat: 100 });
    expect(r.ticks.find((e) => e.type === 'spell_debuff_applied')).toMatchObject({
      debuffStacks: 1, debuffMaxStacks: 3, damagePerTick: 100, spell: { species: 'TESTBLEED' },
    });
  });

  it('a spell paralyze makes the enemy lose its swing and is logged once', () => {
    const stun = damageSpell({ paralyzeMs: 1000 });
    const r = simulateFight(hero(), mob({ attack: 100, attackSpeed: 1 }), {
      spells: ready([stun]), maxMs: 100, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(types(r)).toContain('defender_paralyzed');
    expect(types(r)).toContain('defender_paralyze');
    expect(types(r)).not.toContain('defender_hit');
    expect(r.ticks.find((e) => e.type === 'defender_paralyzed').paralyzeMs).toBe(1000);
  });

  it('a spell blind makes the next enemy swing a defender_blind and counts as an evade', () => {
    const rt = initSpellRuntimes([damageSpell({ isDoT: true, attackPercent: 1, durationMs: 5000, tickIntervalMs: 1000, blindOnTick: true })])
      .map((x) => ({ ...x, isEffectActive: true, effectRemaining: 5000, nextTickIn: 0 }));
    const r = simulateFight(hero(), mob({ attack: 100, attackSpeed: 1 }), {
      spells: rt, maxMs: 100, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(types(r)).toContain('defender_blinded');
    expect(types(r)).toContain('defender_blind');
    expect(types(r)).not.toContain('defender_hit');
  });
});

describe('debuff tick (L1088736) and kill', () => {
  const bleed = (list, dmg) => applyDebuff(list, {
    type: 'BLEED', config: { durationMs: 5000, maxStacks: 3, tickIntervalMs: 100 }, damagePerTickFlat: dmg, source: { name: 'Bleed' },
  }, 0);

  it('a DoT tick lowers the enemy HP and is logged as spell_debuff_tick', () => {
    const list = initDebuffState();
    bleed(list, 50);
    const r = simulateFight(hero(), mob({ hp: 1000 }), { debuffs: list, maxMs: 100 }, never);
    const tick = r.ticks.find((e) => e.type === 'spell_debuff_tick');
    expect(tick).toMatchObject({ damage: 50, defenderHp: 950, debuffStacks: 1 });
    expect(r.enemyHp).toBe(950);
    expect(r.damageDealt).toBe(50);
  });

  it('a DoT that kills ends the fight before the swing: defender_dead with the player HP', () => {
    const list = initDebuffState();
    bleed(list, 50);
    const r = simulateFight(hero(), mob({ hp: 40 }), { debuffs: list, opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 } }, never);
    expect(r.attackerWon).toBe(true);
    expect(types(r)).toEqual(['spell_debuff_tick', 'defender_dead']);
    expect(r.ticks[1]).toMatchObject({ attackerHp: 10000, defenderHp: 0 });
  });

  it('a SLOW debuff lengthens the enemy swing interval (slowedAttackSpeed)', () => {
    const list = initDebuffState();
    applyDebuff(list, { type: 'SLOW', config: { durationMs: 60000, maxStacks: 1, attackSpeedReductionPercent: 50 }, source: {} }, 0);
    const e = mob({ attack: 10, attackSpeed: 1 });
    const r = simulateFight(hero(), e, { debuffs: list, maxMs: 2500 }, never);
    // speed 0.5 -> interval 2000: first enemy swing at 2000 ms instead of 1000 ms
    expect(r.ticks.filter((ev) => ev.type === 'defender_hit').map((ev) => ev.timestamp)).toEqual([2000]);
  });
});

describe('draw order within one tick (rebuild-plan §6)', () => {
  const dot = () => {
    const list = initDebuffState();
    applyDebuff(list, {
      type: 'BLEED', config: { durationMs: 5000, maxStacks: 3, tickIntervalMs: 100 }, damagePerTickFlat: 40,
      critChance: 50, critMult: 1.5, source: {},
    }, 0);
    return list;
  };
  const run = (draws) => {
    const rng = scripted(draws);
    const r = simulateFight(hero({ totalCritChance: 50, totalCritDamage: 2 }), mob(), {
      debuffs: dot(), maxMs: 100, opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 },
    }, rng);
    return { r, rng };
  };
  it('the debuff tick draws before the player swing: [DoT crit, swing crit fail]', () => {
    const { r, rng } = run([0.1, 0.9]);
    expect(r.ticks.find((e) => e.type === 'spell_debuff_tick')).toMatchObject({ damage: 60, isCrit: true });
    expect(r.ticks.find((e) => e.type === 'attacker_hit').damage).toBe(1000);
    expect(rng.draws).toBe(2);
  });
  it('and the swing draws second: [DoT crit fail, swing crit]', () => {
    const { r, rng } = run([0.9, 0.1]);
    expect(r.ticks.find((e) => e.type === 'spell_debuff_tick').damage).toBe(40);
    expect(r.ticks.find((e) => e.type === 'attacker_crit').damage).toBe(2000);
    expect(rng.draws).toBe(2);
  });
  it('a spell crit roll is drawn before the swing draws', () => {
    const bolt = { species: 'B', name: 'B', icon: null, spell: { spellType: 'DAMAGE', baseDamage: 0, isDoT: false, attackPercent: 100, cooldownMs: 8000 } };
    const spells = () => initSpellRuntimes([bolt]).map((rt) => ({ ...rt, cooldownRemaining: 0 }));
    const p = hero();
    p.spellCritChance = 50;
    const rng = scripted([0.1, 0.9]); // spell crit succeeds; then the swing's own crit draw fails
    const r = simulateFight(p, mob(), { spells: spells(), maxMs: 100, opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 } }, rng);
    expect(r.ticks.find((e) => e.type === 'spell_damage')).toMatchObject({ damage: 1500, isCrit: true });
    expect(rng.draws).toBe(2);
  });
});

describe('stack wiring (L1089199-1089300) and thorns (L1089306-1089397)', () => {
  const fakeStacks = (over = {}) => ({
    active: true,
    selfModifiers: () => ({ ...EMPTY_BULWARK_MODIFIERS }),
    elusiveSelfModifiers: () => ({ ...EMPTY_ELUSIVE_MODIFIERS }),
    targetModifiers: () => ({ ...EMPTY_SUNDER_MODIFIERS }),
    onEvaded: vi.fn(), onHitTaken: vi.fn(), onHitLanded: vi.fn(),
    blockReflect: vi.fn(() => 0), hitTakenReflect: vi.fn(() => 0),
    tick: vi.fn(), snapshot: () => ({ bulwarkStacks: 3, sunderStacks: 4 }), resetTarget: vi.fn(),
    ...over,
  });

  it('routes each event type to its stack handler and stamps the stack counts on the events', () => {
    const s = fakeStacks();
    const r = simulateFight(hero(), mob({ attack: 100, attackSpeed: 1 }), {
      stacks: s, maxMs: 1000, opening: { attackerTimer: 900, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(s.onHitLanded).toHaveBeenCalledTimes(1); // the player's attacker_hit
    expect(s.hitTakenReflect).toHaveBeenCalledWith(100); // the enemy's defender_hit
    expect(s.tick).toHaveBeenCalledWith(100);
    expect(r.ticks.every((e) => e.bulwarkStacks === 3 && e.sunderStacks === 4)).toBe(true);
  });

  it('a dodged swing (attacker_miss) is an evade, a block pays blockReflect with the event damage', () => {
    const miss = fakeStacks();
    simulateFight(hero({ totalMissChance: 50 }), mob({ attack: 100, attackSpeed: 1 }), {
      stacks: miss, maxMs: 100, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, always);
    expect(miss.onEvaded).toHaveBeenCalledTimes(1);
    const block = fakeStacks();
    simulateFight(hero({ totalBlockChance: 50 }), mob({ attack: 100, attackSpeed: 1 }), {
      stacks: block, maxMs: 100, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, always);
    expect(block.blockReflect).toHaveBeenCalledWith(0);
  });

  it('a blinded enemy swing (defender_blind) is an evade', () => {
    const s = fakeStacks();
    const rt = initSpellRuntimes([{
      species: 'TESTBLIND', name: 'Blind', icon: null,
      spell: { spellType: 'DAMAGE', baseDamage: 0, isDoT: true, attackPercent: 1, durationMs: 5000, tickIntervalMs: 1000, cooldownMs: 8000, blindOnTick: true },
    }]).map((x) => ({ ...x, isEffectActive: true, effectRemaining: 5000, nextTickIn: 0 }));
    simulateFight(hero(), mob({ attack: 100, attackSpeed: 1 }), {
      stacks: s, spells: rt, maxMs: 100, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(s.onEvaded).toHaveBeenCalledTimes(1);
    expect(s.hitTakenReflect).not.toHaveBeenCalled();
  });

  it('thorns from the stack kill the enemy: thorns_reflect then defender_dead, in the same tick', () => {
    const s = fakeStacks({ hitTakenReflect: vi.fn(() => 80) });
    const r = simulateFight(hero(), mob({ hp: 60, attack: 100, attackSpeed: 1 }), {
      stacks: s, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(r.attackerWon).toBe(true);
    expect(types(r)).toEqual(['defender_hit', 'thorns_reflect', 'defender_dead']);
    expect(r.ticks[1]).toMatchObject({ damage: 80, defenderHp: 0, bulwarkStacks: 3, sunderStacks: 4 });
    expect(r.damageDealt).toBe(60);
  });

  it('no thorns once the player is dead', () => {
    const s = fakeStacks({ hitTakenReflect: vi.fn(() => 80), onHitTaken: vi.fn() });
    const r = simulateFight(hero({ totalHp: 50 }), mob({ hp: 60, attack: 100, attackSpeed: 1 }), {
      stacks: s, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(r.attackerWon).toBe(false);
    expect(types(r)).toEqual(['attacker_dead']);
    expect(s.onHitTaken).toHaveBeenCalledTimes(1);
  });

  it('Bulwark DR and Sunder\'s cut of the enemy defences feed the tick', () => {
    const s = fakeStacks({
      selfModifiers: () => ({ hpPercent: 0, drPercent: 50, thornsPercent: 0 }),
      targetModifiers: () => ({ ...EMPTY_SUNDER_MODIFIERS, blockReductionPercent: 100 }),
    });
    // player DR 50 % -> 100 damage becomes 50; the enemy's 100 % Block is cut to 0 so the swing connects
    const r = simulateFight(hero(), mob({ blockChance: 100, attack: 100, attackSpeed: 1 }), {
      stacks: s, maxMs: 1000, opening: { attackerTimer: 900, defenderTimer: 900, regenTimer: 0 },
    }, never);
    expect(r.ticks.find((e) => e.type === 'attacker_hit').damage).toBe(1000);
    expect(r.ticks.find((e) => e.type === 'defender_hit').damage).toBe(50);
  });

  it('Iron Bastion thorns apply only while that buff is active', () => {
    const iron = {
      species: 'IRON_BASTION', name: 'Iron', icon: null,
      spell: { spellType: 'BUFF', effects: [], durationMs: 5000, cooldownMs: 15000 },
    };
    const run = (thornsPercent) => simulateFight(hero(), mob({ hp: 1e6, attack: 100, attackSpeed: 1 }), {
      spells: initSpellRuntimes([iron]), thornsPercent, maxMs: 100,
      opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 },
    }, never);
    // 100 damage * 50 % = 50 reflected
    expect(run(50).ticks.find((e) => e.type === 'thorns_reflect')?.damage).toBe(50);
    expect(run(0).ticks.some((e) => e.type === 'thorns_reflect')).toBe(false);
  });
});

describe('Chrono Flux (L1089035-1089180)', () => {
  const flameborn = {
    species: 'FLAMEBORN', name: 'Flameborn', icon: null,
    spell: { spellType: 'TRANSFORM', durationMs: 60000, effects: [{ stat: 'ATTACK_PERCENT', value: 80 }] },
  };
  it('a landed hit charges the bar; a full bar fires the transform and empties it', () => {
    const chrono = { flux: 6999, flameConduit: 1, earthenConduit: 0, darkConduit: 0 };
    const spells = initSpellRuntimes([flameborn]);
    const r = simulateFight(hero(), mob(), {
      chrono, spells, maxMs: 100, opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 },
    }, never);
    expect(chrono.flux).toBe(0);
    expect(spells[0].isEffectActive).toBe(true);
    // the transform's events are pushed before the tick's own events (L4948-5043 before L5100)
    expect(types(r)).toEqual(['spell_cast', 'spell_buff_start', 'attacker_hit']);
    expect(r.ticks.every((e) => e.chronoFlux === 0)).toBe(true);
  });
  it('without conduits the bar is never touched', () => {
    const chrono = { flux: 0, flameConduit: 0, earthenConduit: 0, darkConduit: 0 };
    simulateFight(hero(), mob(), { chrono, maxMs: 1000 }, never);
    expect(chrono.flux).toBe(0);
  });
  it('the bar does not charge while the transform is active', () => {
    const chrono = { flux: 100, flameConduit: 5, earthenConduit: 0, darkConduit: 0 };
    const spells = initSpellRuntimes([flameborn]);
    spells[0].isEffectActive = true;
    spells[0].effectRemaining = 60000;
    simulateFight(hero(), mob(), { chrono, spells, maxMs: 1000 }, never);
    expect(chrono.flux).toBe(100);
  });
});

describe('minion (finishMinionTick L1087924-1088000, respawn L1088096-1088119)', () => {
  const makeMinion = (o = {}) => {
    const m = createMinion(
      { species: 'BONE', name: 'Bone', icon: 'i', minion: 'SKELETON', hpPercent: 10, attackPercent: 50, respawnCooldownMs: 3000, summonCastMs: 800 },
      { maxHp: 10000, attack: 1000, attackSpeed: 1, critDamage: 1.5 }, { totalSoulLink: 50 },
    );
    summonMinion(m);
    return Object.assign(m, o);
  };

  it('soul link heals the minion by a share of the damage the owner dealt this tick; events carry minionHp', () => {
    const m = makeMinion({ hp: 500 });
    const r = simulateFight(hero(), mob(), { minion: m, maxMs: 100, opening: { attackerTimer: 900, defenderTimer: 0, regenTimer: 0 } }, never);
    // swing 1000 -> floor(1000 * 50 / 100) = 500 heal, capped at the missing 500 (maxHp 500)
    const heal = r.ticks.find((e) => e.type === 'minion_heal');
    expect(heal.damage).toBe(500);
    expect(m.hp).toBe(m.maxHp);
    expect(r.ticks.every((e) => e.minionHp === m.maxHp)).toBe(true);
  });

  it('a dead minion respawns on the timer with a minion_summoned event', () => {
    const m = makeMinion({ alive: false, hp: 0, respawnMs: 250 });
    // resummonIfDead at the opening: respawn pending -> summoned before tick 1, shifting ts by the cast time
    const r = simulateFight(hero(), mob(), { minion: m, maxMs: 1000 }, never);
    expect(r.ticks[0]).toMatchObject({ type: 'minion_summoned', timestamp: 0, summonReadyMs: 800 });
    expect(m.alive).toBe(true);
    expect(r.endTime).toBeGreaterThanOrEqual(900);
  });

  it('a minion with a pending respawn timer is summoned by advanceMinionRespawn mid-fight', () => {
    const m = makeMinion();
    m.alive = false;
    m.hp = 0;
    m.respawnMs = 0; // nothing pending at the opening
    const calls = [];
    // enemy kills the minion first (enemy hits the minion while it lives), then it respawns
    const e = mob({ attack: 1500, attackSpeed: 1 });
    const r = simulateFight(hero(), e, { minion: summonMinionFresh(m), maxMs: 6000, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 } }, never);
    for (const ev of r.ticks) calls.push(ev.type);
    expect(calls).toContain('minion_damaged');
    expect(calls).toContain('minion_dead');
    expect(calls).toContain('minion_summoned');
  });

  function summonMinionFresh(m) {
    summonMinion(m);
    return m;
  }
});

describe('Oblivion (L1088127-1088208, getInstabilityCombatState L1706880-1707000)', () => {
  const state = (o = {}) => ({
    pulseMs: 500, trueDamagePercentPerPulse: 1, rampPerSecond: 0.04, rampMaxMult: 2.5, healingMult: 1, regenMult: 1,
    healCapPctPerSec: 0, blocksShieldOverflow: false, ...o,
  });

  it('pulses true damage every pulseMs, ramping by the pulse count', () => {
    const r = simulateFight(hero(), mob(), { oblivion: state(), maxMs: 1500 }, never);
    const dmg = r.ticks.filter((e) => e.type === 'attacker_instability');
    // maxHp 10000 * 1 % = 100; ramp = 1 + (n * 500 / 1000) * 0.04 = 1, 1.02, 1.04
    expect(dmg.map((e) => [e.timestamp, e.damage])).toEqual([[500, 100], [1000, 102], [1500, 104]]);
    expect(r.hp).toBe(10000 - 306);
    expect(r.damageTaken).toBe(306);
  });

  it('instability damage that kills ends the fight with attacker_dead', () => {
    const p = hero({ totalHp: 100 });
    const r = simulateFight(p, mob(), { oblivion: state({ trueDamagePercentPerPulse: 100 }) }, never);
    expect(r.attackerWon).toBe(false);
    expect(r.hp).toBe(0);
    expect(types(r)).toEqual(['attacker_instability', 'attacker_dead']);
    expect(r.endTime).toBe(500);
  });

  it('regenMult scales HP regen and healingMult scales lifesteal for the tick', () => {
    const p = hero({ totalHpRegen: 10 });
    p.hp = 5000;
    const r = simulateFight(p, mob(), {
      oblivion: state({ trueDamagePercentPerPulse: 0, regenMult: 0.5 }), maxMs: 100,
    }, never);
    // pulse = max(1, round(10000 * 5 / 100 / 10)) = 50 (instead of 100)
    expect(r.hp).toBe(5050);
  });

  it('a heal cap limits regen healing to the budget; the budget refills with time', () => {
    const p = hero({ totalHpRegen: 10 });
    p.hp = 5000;
    // 1.5 % of 10000 per second = 150; first tick: budget 150 + 15 refill -> capped at max 150
    const r = simulateFight(p, mob(), { oblivion: state({ trueDamagePercentPerPulse: 0, healCapPctPerSec: 1.5 }), maxMs: 1000 }, never);
    // pulses of 100 each tick; 10 ticks would heal 1000 but 150 + 10 * 15 refills (capped at max) = ~300 total
    expect(r.hp).toBeGreaterThan(5000);
    expect(r.hp).toBeLessThan(5400);
  });

  it('oblivionCombatState: strain 100 on a floor with instability 170', () => {
    const o = oblivionCombatState(100, 170);
    expect(o.pulseMs).toBe(500);
    expect(o.trueDamagePercentPerPulse).toBeCloseTo(6, 10); // 0.06 * 100, under the 12 % cap
    expect(o.healingMult).toBeCloseTo(1 - ((100 * 100) / 112 / 100) * 0.98, 10);
    expect(o.regenMult).toBeCloseTo(1 - ((100 * 100) / 106 / 100) * 0.99, 10);
    expect(o.playerDamageMult).toBeCloseTo(1 - (97 * 100) / 106 / 100, 10);
    expect(o.healCapPctPerSec).toBe(1.5);
    expect(o.blocksShieldOverflow).toBe(true);
    expect(o.defenceBand).toEqual({ drFloor: 35, blockCap: 15, missCap: 10, blindCap: 8 });
  });
  it('oblivionCombatState: zero strain is the identity; the true damage caps at 12 %', () => {
    const o = oblivionCombatState(0, 0);
    expect(o).toMatchObject({ trueDamagePercentPerPulse: 0, healingMult: 1, regenMult: 1, playerDamageMult: 1, healCapPctPerSec: 0, blocksShieldOverflow: false, defenceBand: null });
    expect(oblivionCombatState(1000, 900).trueDamagePercentPerPulse).toBe(12);
  });
});

describe('shield (combat-pve.md §13)', () => {
  it('the enemy swing eats the shield at mitigation 0.5: a shield point absorbs 2 damage', () => {
    const p = hero();
    p.shieldMitigation = PVE_SHIELD_MITIGATION;
    p.shieldMax = 100;
    p.shieldHp = 100;
    const r = simulateFight(p, mob({ attack: 100, attackSpeed: 1 }), { maxMs: 1000, opening: { attackerTimer: 0, defenderTimer: 900, regenTimer: 0 } }, never);
    expect(r.shieldHp).toBe(50);
    expect(r.hp).toBe(10000);
    expect(r.ticks.find((e) => e.type === 'defender_hit').attackerShieldHp).toBe(50);
  });
});

describe('world boss hooks (combat-pve.md §16)', () => {
  const enraged = worldBossMob('ENRAGED').affinity;
  it('base hit is 18 % of the max HP at speed 1; the ramp starts at the frenzy', () => {
    const h = worldBossHooks(enraged, 10000);
    expect(h.enemyAt(0)).toEqual({ attack: 1800, attackSpeed: 1 });
    expect(h.enemyAt(20000)).toEqual({ attack: 1800, attackSpeed: 1 });
    // 10 s into the frenzy: damage x (1 + 0.03 * 10) = 2340, speed 1 + 0.08 * 10 = 1.8
    const t30 = h.enemyAt(30000);
    expect(t30.attack).toBe(2340);
    expect(t30.attackSpeed).toBeCloseTo(1.8, 10);
    expect(h.enemyAt(10_000_000).attackSpeed).toBe(6);
  });
  it('28 % of a blocked or dodged hit is dealt back; other events deal nothing', () => {
    const h = worldBossHooks(enraged, 10000);
    expect(h.reboundFor({ type: 'attacker_block' }, { attack: 1800 })).toBe(504);
    expect(h.reboundFor({ type: 'attacker_miss' }, { attack: 1800 })).toBe(504);
    expect(h.reboundFor({ type: 'defender_hit' }, { attack: 1800 })).toBe(0);
  });
  it('the dormant and fortified bosses have no hit-back', () => {
    expect(worldBossHooks(worldBossMob('NONE').affinity, 10000)).toBeNull();
    expect(worldBossHooks(worldBossMob('FORTIFIED').affinity, 10000)).toBeNull();
  });
});

describe('preparePveFighter / sigilStateOf', () => {
  const fighter = (o = {}) => ({ stats: stats(), class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [], ...o });

  it('builds the sigil slice: generic + Ancient equipped, utility apart, conditions on the owned entries', () => {
    const st = sigilStateOf(fighter({
      sigils: [{ species: 'BLADE_OF_JUDGMENT', level: 5 }],
      ancient: { species: 'FLAMEBORN', level: 1 },
      utility: { species: 'ARCANE_BARRIER', level: 2 },
      conditions: { BLADE_OF_JUDGMENT: 'ENEMY_HP_BELOW_40' },
    }));
    expect(st.equippedSpecies).toEqual(['BLADE_OF_JUDGMENT', 'FLAMEBORN']);
    expect(st.utilitySlotSpecies).toBe('ARCANE_BARRIER');
    expect(st.ownedSigils.find((s) => s.species === 'BLADE_OF_JUDGMENT')).toMatchObject({ level: 5, activationCondition: 'ENEMY_HP_BELOW_40' });
  });

  it('a Druid\'s sigils go to the druid slots', () => {
    const st = sigilStateOf(fighter({
      class: 'MYSTIC', spec: 'MYSTIC_DRUID', sigils: [{ species: 'ARCANE_SHARD', level: 1 }],
      utility: { species: 'URSINE_FORM', level: 1 },
    }));
    expect(st.equippedSpecies).toEqual([]);
    expect(st.druidEquippedSpecies).toEqual(['ARCANE_SHARD']);
    expect(st.druidUtilitySlotSpecies).toBe('URSINE_FORM');
  });

  it('fresh() gives a player with shield mitigation 0.5 and independent state per call', () => {
    const prep = preparePveFighter(fighter({ sigils: [{ species: 'BLADE_OF_JUDGMENT', level: 1 }] }));
    const a = prep.fresh();
    const b = prep.fresh();
    expect(a.player.shieldMitigation).toBe(0.5);
    expect(a.player.shieldRegenAlwaysRefills).toBe(false);
    expect(a.spells).toHaveLength(1);
    expect(a.spells).not.toBe(b.spells);
    expect(a.spells[0].config.species).toBe('BLADE_OF_JUDGMENT');
    expect(a.player).not.toBe(b.player);
    expect(a.minion).toBeNull();
  });

  it('a shield sigil sets shieldMax = floor(maxHp * hp% / 100), full, with its refill flags', () => {
    const prep = preparePveFighter(fighter({
      class: 'MYSTIC', spec: 'MYSTIC_MAGE', utility: { species: 'ABYSSAL_WARD', level: 1 },
    }));
    const f = prep.fresh();
    expect(f.player.shieldMax).toBeGreaterThan(0);
    expect(f.player.shieldHp).toBe(f.player.shieldMax);
    expect(f.player.shieldRegenAlwaysRefills).toBe(true); // Abyssal Ward refills from regen
  });

  it('a summon sigil gives the Necromancer a live minion scaled from the owner', () => {
    const prep = preparePveFighter(fighter({
      class: 'NECROMANCER', spec: 'NECROMANCER_SUMMONER', utility: { species: 'BONE_SERVANT', level: 1 },
      stats: stats({ totalMinionAttack: 0, totalMinionHealth: 0 }),
    }));
    const f = prep.fresh();
    expect(f.minion.alive).toBe(true);
    expect(f.minion.maxHp).toBeGreaterThan(0);
    expect(f.minion.hp).toBe(f.minion.maxHp);
  });

  it('conduits on the sheet switch the Chrono Flux bar on', () => {
    const prep = preparePveFighter(fighter({ stats: stats({ totalFlameConduit: 3 }) }));
    expect(prep.fresh().chrono).toEqual({ flux: 0, flameConduit: 3, earthenConduit: 0, darkConduit: 0 });
    expect(preparePveFighter(fighter()).fresh().chrono).toBeNull();
  });
});

describe('simulatePve', () => {
  const fighter = (o = {}) => ({ stats: stats(), class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [], ...o });
  const rng = () => mulberry32(hashSeed('fight', 1));

  it('reports won / timeMs / damage / hp for a single mob', () => {
    const r = simulatePve({ fighter: fighter(), enemy: { hp: 3000, attack: 100, attackSpeed: 1 }, rng: rng() });
    expect(r.won).toBe(true);
    expect(r.mobsDefeated).toBe(1);
    expect(r.damageDealt).toBe(3000);
    expect(r.enemyHpLeft).toBe(0);
    // 3 swings at 1000, 2000, 3000 ms
    expect(r.timeMs).toBe(3000);
    expect(r.damageTaken).toBe(200); // enemy swings at 1000 and 2000
    expect(r.hpLeft).toBe(10000 - 200);
    expect(r.log).toBeUndefined();
  });

  it('log:true returns the event log', () => {
    const r = simulatePve({ fighter: fighter(), enemy: { hp: 2000, attack: 0, attackSpeed: 0 }, rng: rng(), log: true });
    expect(r.log.map((e) => e.type)).toEqual(['attacker_hit', 'attacker_hit', 'defender_dead']);
  });

  it('a sequence of mobs carries HP and sums time and damage; a loss leaves the rest undefeated', () => {
    const mobs = [
      { hp: 2000, attack: 100, attackSpeed: 1 },
      { hp: 2000, attack: 100, attackSpeed: 1 },
      { hp: 2000, attack: 100, attackSpeed: 1 },
    ];
    const win = simulatePve({ fighter: fighter(), enemy: mobs, rng: rng() });
    expect(win).toMatchObject({ won: true, mobsDefeated: 3, damageDealt: 6000, timeMs: 6000 });
    // HP carries: enemy swings at 1 s of each 2 s mob fight -> 3 hits
    expect(win.hpLeft).toBe(10000 - 300);
    const weak = simulatePve({ fighter: fighter({ stats: stats({ totalHp: 250 }) }), enemy: mobs, rng: rng() });
    expect(weak.won).toBe(false);
    expect(weak.hpLeft).toBe(0);
    expect(weak.mobsDefeated).toBeLessThan(3);
    expect(weak.enemyHpLeft).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const f = fighter({ stats: stats({ totalCritChance: 30, totalCritDamage: 2, totalDoubleHit: 20, totalLifesteal: 5 }) });
    const e = { hp: 1e7, attack: 300, attackSpeed: 1.2, blockChance: 10, penetration: 20, damageReduction: 15 };
    const a = simulatePve({ fighter: f, enemy: e, maxMs: 30000, rng: mulberry32(7) });
    const b = simulatePve({ fighter: f, enemy: e, maxMs: 30000, rng: mulberry32(7) });
    const c = simulatePve({ fighter: f, enemy: e, maxMs: 30000, rng: mulberry32(8) });
    expect(a).toEqual(b);
    expect(a.damageDealt).not.toBe(c.damageDealt);
  });

  it('a catalogue chapter level runs end to end', () => {
    const f = fighter({ stats: stats({ totalHp: 5e6, totalAttack: 5e5 }) });
    const r = simulatePve({ fighter: f, enemy: chapterMobs(3, 1), rng: rng() });
    expect(r.won).toBe(true);
    expect(r.mobsDefeated).toBe(3);
  });

  it('applies the Oblivion output cut to the player Attack and the strain to the fight', () => {
    const f = fighter({ stats: stats({ totalHp: 1e9, totalAttack: 1e6 }) });
    const floor = oblivionFloorMob(10);
    expect(oblivionEffectiveInstability(floor.instability, 0)).toBe(floor.instability);
    const free = simulatePve({ fighter: f, enemy: { ...floor, hp: 1e6, blockChance: 0 }, oblivion: { power: floor.instability }, rng: rng(), log: true });
    const hard = simulatePve({ fighter: f, enemy: { ...floor, hp: 1e6, blockChance: 0 }, oblivion: { power: 0 }, rng: rng(), log: true });
    expect(oblivionEffectiveInstability(floor.instability, floor.instability)).toBe(0);
    // no strain: Attack untouched (1e6 per swing) and no pulses
    expect(free.log.some((e) => e.type === 'attacker_instability')).toBe(false);
    expect(free.log.find((e) => e.type === 'attacker_hit').damage).toBe(1e6);
    // full strain x: output x (1 - 0.97 * x / (x + 6)) -> the same hit is far smaller
    const x = floor.instability;
    const cut = hard.log.find((e) => e.type === 'attacker_hit').damage;
    expect(cut).toBe(Math.floor(1e6 * (1 - (97 * x) / (x + 6) / 100)));
    expect(hard.log.some((e) => e.type === 'attacker_instability')).toBe(true);
  });

  it('applyOutputCut:false leaves the Attack alone', () => {
    const f = fighter({ stats: stats({ totalHp: 1e9, totalAttack: 1e6 }) });
    const r = simulatePve({
      fighter: f, enemy: { ...oblivionFloorMob(10), hp: 1e6, blockChance: 0 }, oblivion: { power: 0 },
      applyOutputCut: false, rng: rng(), log: true,
    });
    expect(r.log.find((e) => e.type === 'attacker_hit').damage).toBe(1e6);
  });

  it('an Oblivion state object is used as given', () => {
    const st = oblivionCombatState(50, 100);
    const r = simulatePve({ fighter: fighter(), enemy: trainingDummy(), oblivion: st, maxMs: 1000, rng: rng(), log: true });
    expect(r.log.filter((e) => e.type === 'attacker_instability')).toHaveLength(2);
  });
});

describe('World Boss through simulatePve', () => {
  const f = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [] });
  const rng = () => mulberry32(3);

  it('Dormant: 60 s window, nothing hits back, damage = swings * attack', () => {
    const r = simulatePve({ fighter: f(), enemy: worldBossMob('NONE'), rng: rng() });
    expect(r.won).toBe(false);
    expect(r.timeMs).toBe(60000);
    expect(r.damageDealt).toBe(60 * 1000);
    expect(r.damageTaken).toBe(0);
  });

  it('Fortified: Block 80 % and 30 % spell resist (mob entity)', () => {
    const e = mobEntityOf(worldBossMob('FORTIFIED'));
    expect(e).toMatchObject({ blockChance: 80, spellResist: 30, attackSpeed: 0 });
  });

  it('Fortified: only the Penetration share gets through a blocked hit', () => {
    const run = (pen, seed) => simulatePve({
      fighter: f({ totalPenetration: pen }), enemy: worldBossMob('FORTIFIED'), rng: mulberry32(seed),
    }).damageDealt;
    const n = 400;
    let none = 0;
    let pen50 = 0;
    for (let i = 0; i < n; i++) {
      none += run(0, i);
      pen50 += run(50, i);
    }
    // 60 swings: E = 0.2 * 1000 per swing with no Pen; + 0.8 * 500 with Pen 50
    expect(none / n / 60).toBeGreaterThan(190);
    expect(none / n / 60).toBeLessThan(210);
    expect(pen50 / n / 60).toBeGreaterThan(590);
    expect(pen50 / n / 60).toBeLessThan(610);
  });

  it('Enraged: the 5 minute window, hit-back for 18 % of max HP, the player dies', () => {
    const r = simulatePve({ fighter: f({ totalHp: 10000 }), enemy: worldBossMob('ENRAGED'), rng: rng(), log: true });
    expect(r.won).toBe(false);
    expect(r.hpLeft).toBe(0);
    expect(r.timeMs).toBeLessThan(10000);
    expect(r.log.find((e) => e.type === 'defender_hit').damage).toBe(1800);
  });

  it('Enraged: 28 % of a blocked hit is dealt back to the boss', () => {
    const r = simulatePve({
      fighter: f({ totalHp: 1e9, totalBlockChance: 85, totalAttack: 0 }), enemy: worldBossMob('ENRAGED'),
      maxMs: 10000, rng: mulberry32(5), log: true,
    });
    const reflected = r.log.filter((e) => e.type === 'thorns_reflect');
    expect(reflected.length).toBeGreaterThan(0);
    for (const ev of reflected) expect(ev.damage % 1).toBe(0);
    // each rebound is 28 % of the 1800 hit = 504 (one per blocked hit)
    expect(reflected.every((e) => e.damage % 504 === 0)).toBe(true);
  });
});

describe('convergence to the closed form (combat-pve.md §7, plan E6c acceptance)', () => {
  // 60 s on a defended dummy, spells off. E per swing (m = crit multiplier, c = crit, h = double hit,
  // b = Block, p = Penetration, d = DR), values chosen so every rounding is exact:
  //   hit = (1 - b) * [R * a * (1 + c * (m - 1)) + h * R * a]  +  b * p * R * a * (1 + c * (m - 1))
  const mean = (fighter, enemy, n, seed, maxMs = 60000) => {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += simulatePve({ fighter, enemy, maxMs, rng: mulberry32(hashSeed(seed, i)) }).damageDealt;
    }
    return sum / n;
  };
  const N = 2000;

  it('plain dummy: Attack * (1 + c(m-1) + h) * swings', () => {
    const fighter = { stats: stats({ totalAttack: 1000, totalAttackSpeed: 1.25, totalCritChance: 30, totalCritDamage: 2, totalDoubleHit: 20 }), class: 'WARRIOR', spec: null, sigils: [] };
    // interval round(1000 / 1.25) = 800 -> 1.25 swings per second -> 75 swings in 60 s
    const swings = 75;
    const expected = 1000 * (1 + 0.3 * (2 - 1) + 0.2) * swings;
    const got = mean(fighter, trainingDummy(), N, 'plain');
    expect(Math.abs(got - expected) / expected).toBeLessThan(0.01);
  });

  it('defended mob: DR, Block and Penetration', () => {
    const fighter = {
      stats: stats({ totalAttack: 1000, totalAttackSpeed: 1, totalCritChance: 30, totalCritDamage: 2, totalDoubleHit: 20, totalPenetration: 25 }),
      class: 'WARRIOR', spec: null, sigils: [],
    };
    const enemy = { ...trainingDummy(), damageReduction: 20, blockChance: 10 };
    const R = 0.8;
    const per = 0.9 * (R * 1000 * (1 + 0.3) + 0.2 * R * 1000) + 0.1 * (0.25 * R * 1000 * (1 + 0.3));
    const expected = per * 60;
    const got = mean(fighter, enemy, N, 'defended');
    expect(Math.abs(got - expected) / expected).toBeLessThan(0.01);
  });

  it('incoming damage matches Attack * swings * (1 - DR) when nothing is avoided', () => {
    const fighter = { stats: stats({ totalHp: 1e9, totalDamageReduction: 25, totalAttack: 0 }), class: 'WARRIOR', spec: null, sigils: [] };
    const enemy = { hp: 1e12, attack: 400, attackSpeed: 1.6 };
    // interval round(1000 / 1.6) = 625 -> 1.6 swings / s; hit = round(400 * 0.75) = 300
    const r = simulatePve({ fighter, enemy, maxMs: 60000, rng: mulberry32(1) });
    expect(r.damageTaken).toBeGreaterThan(300 * 95);
    expect(r.damageTaken).toBeLessThanOrEqual(300 * 96);
  });
});

describe('real sigils through simulatePve', () => {
  const rng = () => mulberry32(11);
  const base = { stats: stats({ totalHp: 5e5, totalAttack: 5e4 }), class: 'WARRIOR', spec: 'WARRIOR_TANK' };

  it('an equipped damage sigil casts after its 1 s opening delay', () => {
    const r = simulatePve({
      fighter: { ...base, sigils: [{ species: 'BLADE_OF_JUDGMENT', level: 1 }] },
      enemy: trainingDummy(), maxMs: 3000, rng: rng(), log: true,
    });
    const cast = r.log.find((e) => e.type === 'spell_cast');
    expect(cast.timestamp).toBe(1000); // opening cooldown 1000 ms, ready on the tick that reaches it
    expect(r.log.some((e) => e.type === 'spell_damage')).toBe(true);
  });

  it('a Mystic with a shield sigil absorbs mob hits at mitigation 0.5', () => {
    const fighter = {
      stats: stats({ totalHp: 1e6, totalAttack: 1 }), class: 'MYSTIC', spec: 'MYSTIC_MAGE', sigils: [],
      utility: { species: 'ARCANE_BARRIER', level: 1 },
    };
    const shieldMax = preparePveFighter(fighter).fresh().player.shieldMax;
    expect(shieldMax).toBeGreaterThan(1000);
    const r = simulatePve({ fighter, enemy: { hp: 1e12, attack: 1000, attackSpeed: 1 }, maxMs: 1500, rng: rng(), log: true });
    const hit = r.log.find((e) => e.type === 'defender_hit');
    expect(hit.damage).toBe(500); // shield-effective: 1000 damage costs 500 shield points
    expect(hit.attackerShieldHp).toBe(shieldMax - 500);
    expect(r.hpLeft).toBe(1e6); // the first hits never reach HP
  });

  it('a Necromancer summon fights beside the owner', () => {
    const fighter = {
      stats: stats({ totalHp: 1e6, totalAttack: 1e4 }), class: 'NECROMANCER', spec: 'NECROMANCER_SUMMONER', sigils: [],
      utility: { species: 'BONE_SERVANT', level: 1 },
    };
    const r = simulatePve({ fighter, enemy: trainingDummy(), maxMs: 5000, rng: rng(), log: true });
    expect(r.log.some((e) => e.type === 'minion_hit' || e.type === 'minion_crit')).toBe(true);
    expect(r.log.find((e) => e.type === 'minion_hit' || e.type === 'minion_crit').minionHp).toBeGreaterThan(0);
  });

  it('a Warrior with Bulwark of Thorns gets stack counts on its events', () => {
    const fighter = { ...base, sigils: [{ species: 'BULWARK_OF_THORNS', level: 1 }] };
    const r = simulatePve({ fighter, enemy: { hp: 1e12, attack: 1000, attackSpeed: 1 }, maxMs: 3000, rng: rng(), log: true });
    expect(r.log.some((e) => e.bulwarkStacks !== undefined)).toBe(true);
  });
});
