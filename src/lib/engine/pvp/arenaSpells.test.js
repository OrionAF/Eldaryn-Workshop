import { describe, it, expect } from 'vitest';
import { scripted } from '../rng.js';
import { initSpellRuntimes } from '../core/spells.js';
import { createMinion, summonMinion } from '../core/minions.js';
import { mapSpellEventType, processArenaSpells, routeSpellHealToMinion } from './arenaSpells.js';

const cfg = (species, spell, activationCondition) => ({ species, name: species, icon: null, spell, activationCondition });
const ref = (species) => ({ name: species, icon: null, species });
const blade = (over = {}) => ({ spellType: 'DAMAGE', baseDamage: 0, isDoT: false, attackPercent: 55, cooldownMs: 8000, ...over });
const ready = (configs) => initSpellRuntimes(configs).map((rt) => ({ ...rt, cooldownRemaining: 0 }));
const none = () => scripted([]); // throws on any draw

const duelist = (over = {}) => ({
  maxHp: 8000, rawMaxHp: 1000, hp: 8000, attack: 1000, critDamage: 1.5, spellDamage: 0, spellResist: 0,
  spellCritChance: 0, spellVamp: 0, pvpDefense: 0, shieldHp: 0, shieldMax: 0, ...over,
});
const run = (runtimes, over = {}, rng = none()) => {
  const input = {
    caster: duelist(), target: duelist(), dtMs: 100, timestamp: 5000, side: 'attacker',
    targetDebuffs: [], casterDebuffs: [], ...over,
  };
  const events = processArenaSpells(runtimes, input, rng);
  return { events, ...input };
};

describe('2.7.4 PvP cast lockout', () => {
  for (const field of ['silencedMs', 'paralyzedMs', 'fearedMs']) {
    it(`${field} blocks new casts while cooldown progresses, then casts on release`, () => {
      const rts = ready([cfg('BLADE', blade())]);
      rts[0].cooldownRemaining = 200;
      const caster = duelist({ [field]: 500 });
      expect(run(rts, { caster }).events).toEqual([]);
      expect(rts[0].cooldownRemaining).toBe(100);
      expect(run(rts, { caster }).events).toEqual([]);
      expect(rts[0].cooldownRemaining).toBe(0);
      caster[field] = 0;
      expect(run(rts, { caster }).events.map((e) => e.type)).toEqual(['attacker_spell_cast', 'attacker_spell_damage']);
    });
    it(`${field} preserves ongoing DoT ticks and active buffs`, () => {
      const rts = ready([cfg('FIRE', blade({ isDoT: true, durationMs: 3000, tickIntervalMs: 100 }))]);
      run(rts);
      expect(run(rts, { caster: duelist({ [field]: 1000 }) }).events.some((e) => e.type === 'attacker_spell_dot_tick')).toBe(true);
      const buffs = ready([cfg('BUFF', { spellType: 'BUFF', effects: [{ stat: 'ATTACK_PERCENT', value: 20 }], durationMs: 3000, cooldownMs: 8000 })]);
      run(buffs);
      run(buffs, { caster: duelist({ [field]: 1000 }) });
      expect(buffs[0].isEffectActive).toBe(true);
      expect(buffs[0].effectRemaining).toBe(2900);
    });
  }
  it('the longest timer wins and blind does not lock casting', () => {
    const rts = ready([cfg('BLADE', blade())]);
    const caster = duelist({ silencedMs: 0, paralyzedMs: 0, fearedMs: 100 });
    expect(run(rts, { caster }).events).toEqual([]);
    caster.fearedMs = 0;
    caster.blinded = true;
    expect(run(rts, { caster }).events).toHaveLength(2);
  });
});

describe('mapSpellEventType (L1453845-1453856)', () => {
  it('prefixes the caster side', () => {
    expect(mapSpellEventType('spell_damage', 'attacker')).toBe('attacker_spell_damage');
    expect(mapSpellEventType('spell_cast', 'defender')).toBe('defender_spell_cast');
  });
});

describe('processArenaSpells: DAMAGE and PVP Defense (L1453857-1454146)', () => {
  it('logs the hit under the caster side, takes it off the target HP, and draws nothing at 0 crit', () => {
    const r = run(ready([cfg('BLADE', blade())]));
    // every event reads the HP after the whole call, so the cast line already shows the hit's result
    expect(r.events).toEqual([
      { timestamp: 5000, type: 'attacker_spell_cast', damage: 0, attackerHpAfter: 8000, defenderHpAfter: 7450, spell: ref('BLADE') },
      { timestamp: 5000, type: 'attacker_spell_damage', damage: 550, attackerHpAfter: 8000, defenderHpAfter: 7450, spell: ref('BLADE') },
    ]);
    expect(r.target.hp).toBe(7450);
    expect(r.caster.hp).toBe(8000);
  });

  it('a defender caster swaps the prefix and the HP-after columns', () => {
    const r = run(ready([cfg('BLADE', blade())]), { side: 'defender' });
    expect(r.events[1]).toMatchObject({ type: 'defender_spell_damage', damage: 550, attackerHpAfter: 7450, defenderHpAfter: 8000 });
  });

  it('crit: one draw, isCrit on the log event', () => {
    const rng = scripted([0.0]);
    const r = run(ready([cfg('BLADE', blade())]), { caster: duelist({ spellCritChance: 50 }) }, rng);
    expect(rng.draws).toBe(1);
    expect(r.events[1]).toMatchObject({ type: 'attacker_spell_damage', damage: 825, isCrit: true });
    expect(r.target.hp).toBe(7175);
  });

  it('target PVP Defense: the HP loss is rounded once on the total, each logged hit on its own', () => {
    // PVP Defense 200 -> 200 / (200 + K=200) = 0.5
    const r = run(ready([cfg('BLADE', blade({ attackPercent: 55 }))]), { target: duelist({ pvpDefense: 200 }) });
    expect(r.events[1].damage).toBe(275); // max(1, round(550 * 0.5))
    expect(r.target.hp).toBe(8000 - 275);
  });

  it('PVP Defense floors a hit at 1; rounding happens on the absolute net damage', () => {
    const r = run(ready([cfg('BLADE', blade({ attackPercent: 0.1 }))]), { target: duelist({ pvpDefense: 5000 }) });
    // base floor(1000*0.1/100)=1 -> modSpellDmg max(1,..)=1; 1 * (1 - 0.9615) rounds to 0 -> max 1
    expect(r.events[1].damage).toBe(1);
    expect(r.target.hp).toBe(7999);
  });

  it('spell vamp is scaled by 1 - the target PVP Defense fraction (healingMult)', () => {
    // damage 550 (resist 0); vamp 10% -> floor(550 * 0.5 * 10 / 100) = 27
    const r = run(ready([cfg('BLADE', blade())]), {
      caster: duelist({ hp: 5000, spellVamp: 10 }), target: duelist({ pvpDefense: 200 }),
    });
    expect(r.caster.hp).toBe(5027);
    expect(r.events.map((e) => e.type)).toEqual(['attacker_spell_cast', 'attacker_spell_damage', 'attacker_spell_heal_tick']);
    expect(r.events[2].damage).toBe(27);
  });

  it('the target shield absorbs first (no mitigation), the rest hits HP', () => {
    const r = run(ready([cfg('BLADE', blade())]), { target: duelist({ shieldHp: 200, shieldMax: 500 }) });
    expect(r.target.shieldHp).toBe(0);
    expect(r.target.hp).toBe(8000 - 350);
  });

  it('target spellResist plus the buff resist bonus (not damageReduction) gives the k factor', () => {
    // R = 20 + 40 = 60 -> k 0.4; floor(550 * 0.4) = 220
    const r = run(ready([cfg('BLADE', blade())]), {
      target: duelist({ spellResist: 20, damageReduction: 50 }), targetSpellResistBonus: 40,
    });
    expect(r.events[1].damage).toBe(220);
  });

  it('honours the activation condition for DAMAGE (PVP) against the target HP percent', () => {
    const rts = ready([cfg('BLADE', blade(), 'ENEMY_HP_BELOW_40')]);
    expect(run(rts).events).toEqual([]);
    const r = run(rts, { target: duelist({ hp: 3000 }) });
    expect(r.events.map((e) => e.type)).toEqual(['attacker_spell_cast', 'attacker_spell_damage']);
  });

  it('a silenced caster casts nothing; silencedMs missing counts as 0', () => {
    expect(run(ready([cfg('BLADE', blade())]), { caster: duelist({ silencedMs: 300 }) }).events).toEqual([]);
    expect(run(ready([cfg('BLADE', blade())]), { caster: duelist({ silencedMs: undefined }) }).events).toHaveLength(2);
  });
});

describe('processArenaSpells: status effects (L1454147-1454306)', () => {
  it('paralyze takes the longer duration and is named after the victim side', () => {
    const rts = ready([cfg('SHOCK', blade({ paralyzeMs: 1500 }))]);
    const r = run(rts, { target: duelist({ paralyzedMs: 400 }) });
    expect(r.target.paralyzedMs).toBe(1500);
    expect(r.events.map((e) => e.type)).toEqual([
      'defender_paralyzed', 'attacker_spell_cast', 'attacker_spell_damage',
    ]);
    expect(r.events[0]).toEqual({
      timestamp: 5000, type: 'defender_paralyzed', damage: 0, attackerHpAfter: 8000, defenderHpAfter: 7450, paralyzeMs: 1500,
    });
    const r2 = run(ready([cfg('SHOCK', blade({ paralyzeMs: 100 }))]), { target: duelist({ paralyzedMs: 400 }) });
    expect(r2.target.paralyzedMs).toBe(400);
  });

  it('a defender caster paralyzes the attacker: attacker_paralyzed', () => {
    const r = run(ready([cfg('SHOCK', blade({ paralyzeMs: 1500 }))]), { side: 'defender' });
    expect(r.events[0].type).toBe('attacker_paralyzed');
  });

  it('silence and fear set their timers; fear logs fearMs, silence logs no duration', () => {
    const r = run(ready([cfg('NULL', blade({ silenceMs: 2000, fearMs: 1000 }))]));
    expect(r.target.silencedMs).toBe(2000);
    expect(r.target.fearedMs).toBe(1000);
    const types = r.events.map((e) => e.type);
    expect(types.slice(0, 2)).toEqual(['defender_silenced', 'defender_feared']);
    expect(r.events[0]).not.toHaveProperty('silenceMs');
    expect(r.events[1].fearMs).toBe(1000);
  });

  it('DoT blindOnTick blinds the target on each tick', () => {
    const rts = ready([cfg('DOT', blade({ isDoT: true, attackPercent: 0, damagePerTick: 100, durationMs: 3000, tickIntervalMs: 1000, blindOnTick: true }))]);
    const first = run(rts, { dtMs: 1000 });
    expect(first.target.blinded).toBeUndefined();
    const tick = run(rts, { dtMs: 1000, target: first.target, caster: first.caster });
    expect(tick.target.blinded).toBe(true);
    expect(tick.events.map((e) => e.type)).toEqual(['defender_blinded', 'attacker_spell_dot_tick']);
  });

  it('DoT ticks log with the PVP Defense reduction too', () => {
    const rts = ready([cfg('DOT', blade({ isDoT: true, attackPercent: 0, damagePerTick: 101, durationMs: 3000, tickIntervalMs: 1000 }))]);
    const target = duelist({ pvpDefense: 200 });
    run(rts, { dtMs: 1000, target });
    const tick = run(rts, { dtMs: 1000, target });
    expect(tick.events).toEqual([{
      timestamp: 5000, type: 'attacker_spell_dot_tick', damage: 51, attackerHpAfter: 8000, defenderHpAfter: 7949, spell: ref('DOT'),
    }]);
  });
});

describe('processArenaSpells: debuffs (L1454307-1454378)', () => {
  const hemo = { spellType: 'DEBUFF', cooldownMs: 10000, initialAttackPercent: 80, debuffType: 'BLEED', debuff: { durationMs: 0, maxStacks: 8, damagePerTickPercent: 40, tickIntervalMs: 2000 } };
  it('applies to the target list; first cast is _spell_debuff_applied, a repeat is _spell_debuff_stack', () => {
    const rng = scripted([0.99, 0.99]);
    const rts = ready([cfg('HEMO', hemo)]);
    const targetDebuffs = [];
    const caster = duelist({ spellCritChance: 30 });
    const r1 = run(rts, { targetDebuffs, caster }, rng);
    expect(rng.draws).toBe(1); // the initial hit's crit roll; the BLEED tick draws later, in the debuff tick
    expect(r1.events.map((e) => e.type)).toEqual([
      'attacker_spell_debuff_applied', 'attacker_spell_cast', 'attacker_spell_damage',
    ]); // the debuff events come before the tick's own spell events
    expect(r1.events[0]).toMatchObject({
      damage: 0, spell: ref('HEMO'), debuffStacks: 1, debuffMaxStacks: 8, debuffPermanent: true, damagePerTick: 400,
    });
    expect(targetDebuffs).toHaveLength(1);
    rts[0].cooldownRemaining = 0;
    const r2 = run(rts, { targetDebuffs, caster }, rng);
    expect(rng.draws).toBe(2);
    expect(r2.events[0]).toMatchObject({ type: 'attacker_spell_debuff_stack', debuffStacks: 2 });
  });

  it('the caster WOUND cuts the caster spell heals (healReductionPercent)', () => {
    const rejuv = { spellType: 'HEAL', healPercentPerTick: 5, instant: true, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 };
    // healBase = caster.rawMaxHp 1000 -> floor(50) = 50 -> wound 60% -> round(20) = 20
    const wound = [{ type: 'WOUND', regenReductionPercent: 60, stacks: 1, maxStacks: 1 }];
    const plain = run(ready([cfg('REJUV', rejuv)]), { caster: duelist({ hp: 4000 }) });
    expect(plain.caster.hp).toBe(4050);
    const hurt = run(ready([cfg('REJUV', rejuv)]), { caster: duelist({ hp: 4000 }), casterDebuffs: wound });
    expect(hurt.caster.hp).toBe(4020);
  });
});

describe('processArenaSpells: caster HP and shield (L1453996-1454052)', () => {
  const rejuv = { spellType: 'HEAL', healPercentPerTick: 5, instant: true, refillsShield: true, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 };
  it('heals from rawMaxHp, clamps at maxHp, and the shield refill from the cast lands on the shield', () => {
    const r = run(ready([cfg('AETHER', rejuv)]), { caster: duelist({ hp: 7990, shieldHp: 10, shieldMax: 100 }) });
    expect(r.caster.hp).toBe(8000);
    // ownerHpDelta 50, applied 10 -> overflow 40, plus ownerShieldRefill 50
    expect(r.caster.shieldHp).toBe(100);
  });

  it('a BUFF max-HP effect raises the clamp; without one hp is clamped to maxHp', () => {
    const buff = { spellType: 'BUFF', durationMs: 5000, cooldownMs: 15000, effects: [{ stat: 'HP_PERCENT', value: 10 }] };
    const r = run(ready([cfg('B', buff)]), { caster: duelist({ hp: 8000 }) });
    // heal floor(8000 * 10 / 100) = 800, clamp floor(8000 * 1.1) = 8800
    expect(r.caster.hp).toBe(8800);
    const clamped = run(ready([cfg('NONE', { spellType: 'DEFENSE', effects: [], cooldownMs: 1000 })]), { caster: duelist({ hp: 9000 }) });
    expect(clamped.caster.hp).toBe(8000);
  });

  it('casterHpPercentBonus alone raises the clamp and stops the maxHp clamp', () => {
    const none_ = run(ready([cfg('NONE', { spellType: 'DEFENSE', effects: [], cooldownMs: 1000 })]),
      { caster: duelist({ hp: 8400 }), casterHpPercentBonus: 10 });
    expect(none_.caster.hp).toBe(8400);
  });
});

describe('processArenaSpells: minions (L1454054-1454112, L1454408-1454664)', () => {
  const minionOf = (over = {}) => {
    const m = createMinion({ species: 'skeleton', hpPercent: 60, attackPercent: 20, respawnCooldownMs: 10000, summonCastMs: 0 },
      { maxHp: 1000, attack: 500, attackSpeed: 1, critDamage: 1.5 }, {});
    summonMinion(m);
    return Object.assign(m, over);
  };

  it('spell_damage hits go to the target minion first and log as _minion_damaged', () => {
    const targetMinion = minionOf({ hp: 300, maxHp: 600 });
    const r = run(ready([cfg('BLADE', blade())]), { targetMinion });
    expect(targetMinion.hp).toBe(0);
    expect(targetMinion.alive).toBe(false);
    expect(r.target.hp).toBe(8000); // the whole 550 hit was absorbed, overkill included
    expect(r.events).toEqual([
      { timestamp: 5000, type: 'attacker_spell_cast', damage: 0, attackerHpAfter: 8000, defenderHpAfter: 8000, spell: ref('BLADE') },
      { timestamp: 5000, type: 'defender_minion_damaged', damage: 300, attackerHpAfter: 8000, defenderHpAfter: 8000, spell: ref('BLADE') },
      { timestamp: 5000, type: 'defender_minion_dead', damage: 0, attackerHpAfter: 8000, defenderHpAfter: 8000, minionRespawnMs: 10000 },
    ]);
  });

  it('a defender minion is hit by an attacker caster; an attacker minion by a defender caster', () => {
    const r = run(ready([cfg('BLADE', blade())]), { side: 'defender', targetMinion: minionOf() });
    expect(r.events[1].type).toBe('attacker_minion_damaged');
  });

  it('DoT ticks do not go to the minion', () => {
    const targetMinion = minionOf();
    const rts = ready([cfg('DOT', blade({ isDoT: true, attackPercent: 0, damagePerTick: 100, durationMs: 3000, tickIntervalMs: 1000 }))]);
    const target = duelist();
    run(rts, { dtMs: 1000, target, targetMinion });
    const tick = run(rts, { dtMs: 1000, target, targetMinion });
    expect(targetMinion.hp).toBe(targetMinion.maxHp);
    expect(target.hp).toBe(7900);
    expect(tick.events[0].type).toBe('attacker_spell_dot_tick');
  });

  it('a dead target minion takes no hits', () => {
    const targetMinion = minionOf({ alive: false, hp: 0 });
    const r = run(ready([cfg('BLADE', blade())]), { targetMinion });
    expect(r.target.hp).toBe(7450);
    expect(r.events[1].type).toBe('attacker_spell_damage');
  });

  it('a healsMinion tick heals the caster minion by its share and not the owner', () => {
    const rejuv = { spellType: 'HEAL', healPercentPerTick: 5, healsMinion: true, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 };
    const rts = ready([cfg('GRAVE', rejuv)]);
    const casterMinion = minionOf({ hp: 100, maxHp: 600 });
    const caster = duelist({ hp: 4000 });
    run(rts, { dtMs: 1000, caster, casterMinion });
    const r = run(rts, { dtMs: 1000, caster, casterMinion });
    // heal = floor(1000 * 5 / 100) = 50; share = floor(50 * 600 / 8000) = 3
    expect(casterMinion.hp).toBe(103);
    expect(caster.hp).toBe(4000);
    expect(r.events).toEqual([{
      timestamp: 5000, type: 'attacker_minion_heal', damage: 3, attackerHpAfter: 4000, defenderHpAfter: 8000, spell: ref('GRAVE'),
    }]);
  });

  it('without a live caster minion the heal tick stays an owner heal', () => {
    const rejuv = { spellType: 'HEAL', healPercentPerTick: 5, healsMinion: true, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 };
    const rts = ready([cfg('GRAVE', rejuv)]);
    const caster = duelist({ hp: 4000 });
    run(rts, { dtMs: 1000, caster });
    const r = run(rts, { dtMs: 1000, caster });
    expect(caster.hp).toBe(4050);
    expect(r.events[0].type).toBe('attacker_spell_heal_tick');
  });

  it('minion empower: start grows the minion, a pulse heals it, the end shrinks it; events carry minionMaxHp', () => {
    const vigor = { spellType: 'BUFF', effects: [], durationMs: 3000, cooldownMs: 16000, minionEmpower: { maxHpPercent: 25, regenPercentPerTick: 3, tickIntervalMs: 1000 } };
    const rts = ready([cfg('VIGOR', vigor)]);
    const casterMinion = minionOf({ hp: 400, maxHp: 600 });
    const caster = duelist();
    const r1 = run(rts, { dtMs: 1000, caster, casterMinion });
    expect(casterMinion.maxHp).toBe(750);
    expect(casterMinion.hp).toBe(550);
    expect(r1.events.map((e) => e.type)).toEqual(['attacker_spell_cast', 'attacker_spell_buff_start', 'attacker_minion_buff']);
    expect(r1.events[2]).toMatchObject({ damage: 150, minionMaxHp: 750 });
    const r2 = run(rts, { dtMs: 1000, caster, casterMinion });
    // pulse floor(1000 * 3 / 100) = 30; share floor(30 * 750 / 8000) = 2
    expect(r2.events.map((e) => [e.type, e.damage])).toEqual([['attacker_minion_heal', 2]]);
    run(rts, { dtMs: 1000, caster, casterMinion });
    const r4 = run(rts, { dtMs: 1000, caster, casterMinion });
    expect(r4.events.map((e) => e.type)).toEqual(['attacker_spell_end', 'attacker_minion_heal', 'attacker_minion_buff_end']);
    expect(casterMinion.maxHp).toBe(600);
  });

  it('routeSpellHealToMinion syncs soulLinkBonus and returns [] without a minion or minion work', () => {
    expect(routeSpellHealToMinion(null, { events: [] }, 1000)).toEqual([]);
    const m = minionOf();
    const out = routeSpellHealToMinion(m, { events: [], buffModifiers: { soulLink: 4 } }, 1000);
    expect(out).toEqual([]);
    expect(m.soulLinkBonus).toBe(4);
  });

  it('frenzy start sets the frenzy buff; its end clears it', () => {
    const m = minionOf();
    const start = routeSpellHealToMinion(m, {
      events: [], buffModifiers: {}, ownerMinionEmpower: { heals: [], frenzyStart: { timestamp: 1, attackPercent: 30, attackSpeedPercent: 20, lifesteal: 5, spell: ref('F') } },
    }, 1000);
    expect(m.frenzy).toEqual({ attackPercent: 30, attackSpeedPercent: 20, lifesteal: 5 });
    expect(start).toEqual([{ type: 'minion_buff', timestamp: 1, healed: 0, spell: ref('F'), minionMaxHp: m.maxHp }]);
    const end = routeSpellHealToMinion(m, { events: [], buffModifiers: {}, ownerMinionEmpower: { heals: [], frenzyEnd: { timestamp: 2, spell: ref('F') } } }, 1000);
    expect(m.frenzy).toBeUndefined();
    expect(end[0]).toMatchObject({ type: 'minion_buff_end', timestamp: 2 });
  });
});

describe('processArenaSpells: momentum and log mode', () => {
  const momentum = { maxStacks: 30, fastUntilStacks: 15, fastStacksPerCast: 2, slowStacksPerCast: 1, spellDamagePerStack: 1.2, spellCritPerStack: 0.4, spellVampPerStack: 0.4 };
  it('ownerMomentumStacks is merged into every spell event under the caster side', () => {
    const r = run(ready([cfg('MOM', blade({ momentum }))]));
    expect(r.events.map((e) => e.attackerMomentumStacks)).toEqual([2, 2]);
    const d = run(ready([cfg('MOM', blade({ momentum }))]), { side: 'defender' });
    expect(d.events.map((e) => e.defenderMomentumStacks)).toEqual([2, 2]);
    expect(d.events[0]).not.toHaveProperty('attackerMomentumStacks');
  });

  it('log=false returns [] and leaves the same state and the same rng draws', () => {
    const make = () => ({
      rts: ready([cfg('BLADE', blade()), cfg('NULL', blade({ attackPercent: 10, silenceMs: 500 }))]),
      caster: duelist({ spellCritChance: 40, spellVamp: 5 }), target: duelist({ pvpDefense: 100 }),
    });
    const a = make();
    const b = make();
    const ra = scripted([0.1, 0.9]);
    const rb = scripted([0.1, 0.9]);
    const withLog = run(a.rts, { caster: a.caster, target: a.target }, ra);
    const noLog = run(b.rts, { caster: b.caster, target: b.target, log: false }, rb);
    expect(withLog.events.length).toBeGreaterThan(0);
    expect(noLog.events).toEqual([]);
    expect(b.caster).toEqual(a.caster);
    expect(b.target).toEqual(a.target);
    expect(rb.draws).toBe(ra.draws);
    expect(b.rts).toEqual(a.rts);
  });
});
