import { describe, it, expect } from 'vitest';
import { scripted } from '../rng.js';
import {
  getSpellTypeCastOrder, getOpeningCastRank, getOpeningCastDelayMs, initSpellRuntimes, isConditionMet,
  bankMomentum, momentumBonuses, momentumStackCount, requiresLivingMinion, computeActiveBuffModifiers,
  resolveTransformEffects, processSpellsTick, triggerTransformSpell, hasPendingTransform, isTransformActive,
  transformFireCount, hasActiveEffects, isSpellBuffActive, activeBuffThornsPercent, EMPTY_BUFF_MODIFIERS,
} from './spells.js';

const cfg = (species, spell, activationCondition) => ({ species, name: species, icon: null, spell, activationCondition });
const ref = (species) => ({ name: species, icon: null, species });
const blade = (over = {}) => ({ spellType: 'DAMAGE', baseDamage: 0, isDoT: false, attackPercent: 55, cooldownMs: 8000, ...over });
const momentum = { maxStacks: 30, fastUntilStacks: 15, fastStacksPerCast: 2, slowStacksPerCast: 1, spellDamagePerStack: 1.2, spellCritPerStack: 0.4, spellVampPerStack: 0.4 };
const none = () => scripted([]); // throws on any draw
// a runtime list already off cooldown
const ready = (configs) => initSpellRuntimes(configs).map((rt) => ({ ...rt, cooldownRemaining: 0 }));
const base = { maxHp: 1000, hp: 1000, dtMs: 100, timestamp: 5000, attack: 1000, enemyHp: 1000, enemyMaxHp: 1000 };

describe('cast order and opening delay (module 3965, L1092725-1092929)', () => {
  it('type order DEFENSE 0 .. SUMMON 10, unknown types 9', () => {
    expect(['DEFENSE', 'BUFF', 'HEAL', 'DAMAGE', 'DEBUFF', 'AURA', 'TRANSFORM', 'STACK', 'SHIELD', 'FORM', 'SUMMON']
      .map(getSpellTypeCastOrder)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(getSpellTypeCastOrder('NOPE')).toBe(9);
  });
  it('opening rank 100 except NULL_PULSE 0; delay 1000 / 500 for DAMAGE and DEBUFF only', () => {
    expect(getOpeningCastRank('BLADE_OF_JUDGMENT')).toBe(100);
    expect(getOpeningCastRank('NULL_PULSE')).toBe(0);
    expect(getOpeningCastDelayMs('BLADE_OF_JUDGMENT', 'DAMAGE')).toBe(1000);
    expect(getOpeningCastDelayMs('HEMORRHAGE', 'DEBUFF')).toBe(1000);
    expect(getOpeningCastDelayMs('NULL_PULSE', 'DAMAGE')).toBe(500);
    expect(getOpeningCastDelayMs('NULL_PULSE', 'BUFF')).toBe(0);
    expect(getOpeningCastDelayMs('WARBORN_FURY', 'BUFF')).toBe(0);
  });
});

describe('initSpellRuntimes (L1090372-1090471)', () => {
  it('sorts by type order, then opening rank, then equip index; sets cooldown and momentum', () => {
    const rts = initSpellRuntimes([
      cfg('BLADE', blade()),
      cfg('NULL_PULSE', blade({ silenceMs: 1000 })),
      cfg('MOM', blade({ momentum })),
      cfg('FLAMEBORN', { spellType: 'TRANSFORM', durationMs: 60000, effects: [] }),
      cfg('FURY', { spellType: 'BUFF', effects: [], durationMs: 5000, cooldownMs: 15000 }),
      cfg('REJUV', { spellType: 'HEAL', healPercentPerTick: 5, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 }),
    ]);
    expect(rts.map((r) => r.config.species)).toEqual(['FURY', 'REJUV', 'NULL_PULSE', 'BLADE', 'MOM', 'FLAMEBORN']);
    expect(rts.map((r) => r.cooldownRemaining)).toEqual([0, 0, 500, 1000, 1000, 0]);
    expect(rts[4].momentumStacks).toBe(0);
    expect('momentumStacks' in rts[3]).toBe(false);
    expect(rts[0]).toMatchObject({ isEffectActive: false, effectRemaining: 0, nextTickIn: 0, transformFires: 0 });
  });
});

describe('isConditionMet (L1089843-1089963)', () => {
  it.each([
    [undefined, 100, 100, false, true],
    ['ON_COOLDOWN', 100, 100, false, true],
    ['ENEMY_HP_BELOW_40', 100, 40, false, true],
    ['ENEMY_HP_BELOW_40', 100, 40.1, false, false],
    ['ENEMY_HP_BELOW_80', 0, 81, true, false],
    ['MY_HP_BELOW_60', 60, 100, false, true],
    ['MY_HP_BELOW_60', 61, 100, false, false],
    ['MY_HP_BELOW_20', 99, 100, true, true],
    ['SOMETHING_ELSE', 100, 100, false, true],
  ])('%s my=%d enemy=%d flag=%s -> %s', (c, my, en, flag, want) => {
    expect(isConditionMet(c, my, en, flag)).toBe(want);
  });
});

describe('momentum (L1089596-1089841)', () => {
  it('banks fast below fastUntilStacks, slow above, capped at maxStacks', () => {
    const rt = { momentumStacks: 0 };
    bankMomentum(rt, momentum);
    expect(rt.momentumStacks).toBe(2);
    rt.momentumStacks = 14; bankMomentum(rt, momentum); expect(rt.momentumStacks).toBe(16);
    rt.momentumStacks = 16; bankMomentum(rt, momentum); expect(rt.momentumStacks).toBe(17);
    rt.momentumStacks = 30; bankMomentum(rt, momentum); expect(rt.momentumStacks).toBe(30);
  });
  it('bonuses are stacks x per-stack values; null / undefined without a momentum spell', () => {
    const rts = initSpellRuntimes([cfg('MOM', blade({ momentum }))]);
    expect(momentumBonuses(rts)).toEqual({ spellDamagePercent: 0, spellCritPoints: 0, spellVampPoints: 0 });
    rts[0].momentumStacks = 10;
    const b = momentumBonuses(rts);
    expect(b.spellDamagePercent).toBeCloseTo(12);
    expect(b.spellCritPoints).toBeCloseTo(4);
    expect(b.spellVampPoints).toBeCloseTo(4);
    expect(momentumStackCount(rts)).toBe(10);
    const plain = initSpellRuntimes([cfg('BLADE', blade())]);
    expect(momentumBonuses(plain)).toBeNull();
    expect(momentumStackCount(plain)).toBeUndefined();
  });
  it('requiresLivingMinion: BUFF with minionEmpower / minionFrenzy only', () => {
    expect(requiresLivingMinion({ spellType: 'BUFF', minionEmpower: {} })).toBe(true);
    expect(requiresLivingMinion({ spellType: 'BUFF', minionFrenzy: {} })).toBe(true);
    expect(requiresLivingMinion({ spellType: 'HEAL', minionEmpower: {} })).toBe(false);
  });
});

describe('processSpellsTick: DAMAGE hit, modSpellDmg and k (L1090892-1090927, L1091897-1092198)', () => {
  // trace: base floor(1000*55/100)=550; x(1+20/100)=660; R=min(70,60)=60 -> k=0.4; floor(264)=264
  it('k = 1 - min(R, SPELL_RESIST.hard 60)/100 after the Spell Damage multiplier', () => {
    const rts = ready([cfg('BLADE', blade())]);
    const r = processSpellsTick(rts, { ...base, spellDamage: 20, targetSpellResist: 70 }, none());
    expect(r.targetHpDelta).toBe(-264);
    expect(r.events).toEqual([
      { timestamp: 5000, type: 'spell_cast', value: 0, spell: ref('BLADE') },
      { timestamp: 5000, type: 'spell_damage', value: 264, spell: ref('BLADE') },
    ]);
    expect(rts[0].cooldownRemaining).toBe(8000);
    expect(Object.keys(r)).toEqual(['ownerHpDelta', 'ownerVampHeal', 'targetHpDelta', 'events', 'buffModifiers', 'newDebuffs']);
    expect(r.newDebuffs).toBeUndefined();
  });
  it('opening delay: no cast until the 1000 ms delay has run down', () => {
    const rts = initSpellRuntimes([cfg('BLADE', blade())]);
    expect(processSpellsTick(rts, { ...base, dtMs: 500 }, none()).events).toEqual([]);
    expect(processSpellsTick(rts, { ...base, dtMs: 500 }, none()).targetHpDelta).toBe(-550);
  });
  it('baseDamage when attackPercent is 0; damage <= 0 gives 0, any positive hit at least 1', () => {
    let r = processSpellsTick(ready([cfg('B', blade({ attackPercent: 0, baseDamage: 3 }))]), { ...base, targetSpellResist: 60 }, none());
    expect(r.targetHpDelta).toBe(-1); // floor(3*0.4)=1
    r = processSpellsTick(ready([cfg('B', blade({ attackPercent: 0, baseDamage: 0 }))]), base, none());
    expect(r.targetHpDelta).toBe(0);
    expect(r.events[1].value).toBe(0);
  });
  it('crit: one draw, random*100 < chance, base x critDamage before modSpellDmg', () => {
    const rng = scripted([0.49]);
    const r = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellCritChance: 50, critDamage: 2 }, rng);
    expect(rng.draws).toBe(1);
    expect(r.targetHpDelta).toBe(-1100);
    expect(r.events[1]).toMatchObject({ value: 1100, isCrit: true });
    const r2 = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellCritChance: 50 }, scripted([0.5]));
    expect(r2.targetHpDelta).toBe(-550);
    expect('isCrit' in r2.events[1]).toBe(false);
  });
  it('critDamage null falls back to 1.5; crit chance capped at the 95 ceiling', () => {
    const r = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellCritChance: 300, critDamage: null }, scripted([0.9499]));
    expect(r.targetHpDelta).toBe(-825); // floor(550*1.5)
    const r2 = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellCritChance: 300 }, scripted([0.95]));
    expect(r2.targetHpDelta).toBe(-550);
  });
  it('spell vamp: floor(dmg*healingMult*vamp/100), ceiling 80, wound max(1, round(h*(1-r/100)))', () => {
    let r = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellVamp: 10 }, none());
    expect(r.ownerVampHeal).toBe(55);
    expect(r.ownerHpDelta).toBe(55);
    expect(r.events[2]).toEqual({ timestamp: 5000, type: 'spell_heal_tick', value: 55, spell: ref('B') });
    r = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellVamp: 10, healReductionPercent: 50 }, none());
    expect(r.ownerVampHeal).toBe(28); // round(27.5)
    r = processSpellsTick(ready([cfg('B', blade())]), { ...base, spellVamp: 200, healingMult: 0.5 }, none());
    expect(r.ownerVampHeal).toBe(220); // 550*0.5*80/100
  });
  it('selfHealPercent heals floor(dmg*healingMult*p/100); paralyze / silence / fear take the max', () => {
    const rts = ready([
      cfg('A', blade({ selfHealPercent: 10, paralyzeMs: 1000, fearMs: 800 })),
      cfg('B', blade({ paralyzeMs: 1500, silenceMs: 2000 })),
    ]);
    const r = processSpellsTick(rts, base, none());
    expect(r.ownerHpDelta).toBe(55);
    expect(r).toMatchObject({ targetParalyzeMs: 1500, targetSilenceMs: 2000, targetFearMs: 800 });
  });
  it('momentum banks after the hit and feeds later hits; ownerMomentumStacks reported', () => {
    const rts = ready([cfg('MOM', blade({ momentum, cooldownMs: 0 }))]);
    let r = processSpellsTick(rts, base, none());
    expect(r.targetHpDelta).toBe(-550);
    expect(r.ownerMomentumStacks).toBe(2);
    const rng = scripted([0.99]); // 2 stacks give 0.8 spell crit, so the roll now draws
    r = processSpellsTick(rts, base, rng);
    expect(rng.draws).toBe(1);
    expect(r.targetHpDelta).toBe(-563); // floor(550*1.024)
    expect(r.ownerMomentumStacks).toBe(4);
  });
});

describe('processSpellsTick: DoT DAMAGE (L1091136-1091251, L1092079-1092183)', () => {
  const dot = (over = {}) => ({ spellType: 'DAMAGE', isDoT: true, baseDamage: 0, attackPercent: 0, damagePerTick: 100, durationMs: 3000, tickIntervalMs: 1000, cooldownMs: 10000, ...over });
  it('cast arms the effect; ticks while effectRemaining > 0; spell_end when it runs out', () => {
    const rts = ready([cfg('DOT', dot())]);
    const t = { ...base, dtMs: 1000 };
    const r1 = processSpellsTick(rts, t, none());
    expect(r1.events.map((e) => e.type)).toEqual(['spell_cast']);
    expect(r1.targetHpDelta).toBe(0);
    expect(processSpellsTick(rts, t, none()).events).toEqual([{ timestamp: 5000, type: 'spell_dot_tick', value: 100, spell: ref('DOT') }]);
    expect(processSpellsTick(rts, t, none()).targetHpDelta).toBe(-100);
    const r4 = processSpellsTick(rts, t, none());
    expect(r4.events.map((e) => e.type)).toEqual(['spell_end']);
    expect(rts[0].isEffectActive).toBe(false);
    expect(rts[0].cooldownRemaining).toBe(7000);
  });
  it('attackPercent wins over damagePerTick; tick crit draws once; blindOnTick sets targetBlinded', () => {
    const rts = ready([cfg('DOT', dot({ attackPercent: 60, blindOnTick: true }))]);
    processSpellsTick(rts, { ...base, dtMs: 1000 }, none());
    const rng = scripted([0]);
    const r = processSpellsTick(rts, { ...base, dtMs: 1000, spellCritChance: 10 }, rng);
    expect(rng.draws).toBe(1);
    expect(r.targetHpDelta).toBe(-900); // floor(600*1.5)
    expect(r.events[0].isCrit).toBe(true);
    expect(r.targetBlinded).toBe(true);
  });
  it('slow / wound / critDown become SLOW / WOUND / CRIT_DOWN debuff specs at cast', () => {
    const rts = ready([cfg('HEX', dot({ slow: { attackSpeedReductionPercent: 20 }, wound: { regenReductionPercent: 30 }, critDown: { critChanceReduction: 5 } }))]);
    const r = processSpellsTick(rts, base, none());
    expect(r.newDebuffs).toEqual([
      { type: 'SLOW', config: { durationMs: 3000, maxStacks: 1, attackSpeedReductionPercent: 20 }, damagePerTickFlat: 0, source: ref('HEX') },
      { type: 'WOUND', config: { durationMs: 3000, maxStacks: 1, regenReductionPercent: 30 }, damagePerTickFlat: 0, source: ref('HEX') },
      { type: 'CRIT_DOWN', config: { durationMs: 3000, maxStacks: 1, critChanceReduction: 5 }, damagePerTickFlat: 0, source: ref('HEX') },
    ]);
  });
});

describe('processSpellsTick: DEBUFF (L1091570-1091707)', () => {
  const hemo = { spellType: 'DEBUFF', cooldownMs: 10000, initialAttackPercent: 80, debuffType: 'BLEED', debuff: { durationMs: 0, maxStacks: 8, damagePerTickPercent: 40, tickIntervalMs: 2000 } };
  it('initial hit through modSpellDmg, then a debuff spec with modded flat tick, crit chance and mult', () => {
    // initial floor(800*1.1)=880; tick flat floor(400*1.1)=440
    const rng = scripted([0.99]);
    const r = processSpellsTick(ready([cfg('HEMO', hemo)]), { ...base, spellDamage: 10, spellCritChance: 30, critDamage: 1.8 }, rng);
    expect(rng.draws).toBe(1);
    expect(r.targetHpDelta).toBe(-880);
    expect(r.newDebuffs).toEqual([{ type: 'BLEED', config: hemo.debuff, damagePerTickFlat: 440, critChance: 30, critMult: 1.8, source: ref('HEMO') }]);
  });
  it('PVE ignores the activation condition of offensive spells; PVP (offensiveConditions) honours it', () => {
    const t = { ...base, enemyHp: 900 };
    expect(processSpellsTick(ready([cfg('HEMO', hemo, 'ENEMY_HP_BELOW_20')]), t, none()).newDebuffs).toHaveLength(1);
    expect(processSpellsTick(ready([cfg('HEMO', hemo, 'ENEMY_HP_BELOW_20')]), { ...t, offensiveConditions: true }, none()).newDebuffs).toBeUndefined();
    expect(processSpellsTick(ready([cfg('HEMO', hemo, 'ENEMY_HP_BELOW_20')]), { ...t, enemyHp: 200, offensiveConditions: true }, none()).newDebuffs).toHaveLength(1);
  });
});

describe('processSpellsTick: HEAL and BUFF', () => {
  const rejuv = { spellType: 'HEAL', healPercentPerTick: 5, durationMs: 4000, tickIntervalMs: 1000, cooldownMs: 12000 };
  it('MY_HP condition gates HEAL; ticks max(1, floor(healBase*p/100)) with wound', () => {
    const t = { ...base, dtMs: 1000, hp: 700 };
    const rts = ready([cfg('REJUV', rejuv, 'MY_HP_BELOW_60')]);
    expect(processSpellsTick(rts, t, none()).events).toEqual([]);
    expect(processSpellsTick(rts, { ...t, hp: 600 }, none()).events.map((e) => e.type)).toEqual(['spell_cast']);
    const r = processSpellsTick(rts, { ...t, healBaseMaxHp: 2000, healReductionPercent: 50 }, none());
    expect(r.ownerHpDelta).toBe(50); // floor(2000*5/100)=100, wound 50%
    expect(r.events[0]).toEqual({ timestamp: 5000, type: 'spell_heal_tick', value: 50, spell: ref('REJUV') });
  });
  it('instant HEAL heals at cast, refills the shield, and does not tick again', () => {
    const rts = ready([cfg('AETHER', { ...rejuv, instant: true, refillsShield: true })]);
    const r = processSpellsTick(rts, base, none());
    expect(r.ownerHpDelta).toBe(50);
    expect(r.ownerShieldRefill).toBe(50);
    expect(rts[0]).toMatchObject({ isEffectActive: true, effectRemaining: 4000, nextTickIn: 4100 });
  });
  it('healsMinion routes the tick to ownerMinionHeal', () => {
    const rts = ready([cfg('GRAVE', { ...rejuv, healsMinion: true })]);
    processSpellsTick(rts, { ...base, dtMs: 1000 }, none());
    const r = processSpellsTick(rts, { ...base, dtMs: 1000 }, none());
    expect(r.ownerMinionHeal).toBe(50);
    expect(r.events[0].minionHeal).toBe(true);
  });
  it('BUFF: cast + buff_start, HP_PERCENT heals its share of current HP, SPELL_DAMAGE feeds later spells', () => {
    const fury = { spellType: 'BUFF', durationMs: 5000, cooldownMs: 15000, thornsPercent: 7, effects: [
      { stat: 'ATTACK_PERCENT', value: 20 }, { stat: 'HP_PERCENT', value: 10 }, { stat: 'SPELL_DAMAGE', value: 15 }, { stat: 'SOUL_LINK', value: 3 },
    ] };
    const rts = ready([cfg('B', blade()), cfg('FURY', fury)]);
    const r = processSpellsTick(rts, { ...base, hp: 800 }, none());
    expect(r.events.map((e) => e.type)).toEqual(['spell_cast', 'spell_buff_start', 'spell_cast', 'spell_damage']);
    expect(r.ownerHpDelta).toBe(80);
    expect(r.targetHpDelta).toBe(-632); // floor(550*1.15)
    expect(r.buffModifiers).toEqual({ ...EMPTY_BUFF_MODIFIERS, attackPercent: 20, hpPercent: 10, soulLink: 3 });
    expect(activeBuffThornsPercent(rts)).toBe(7);
    expect(isSpellBuffActive(rts, 'FURY')).toBe(true);
    expect(hasActiveEffects(rts)).toBe(true);
  });
  it('silencedMs > 0 blocks casts but active effects keep ticking', () => {
    const rts = ready([cfg('B', blade()), cfg('REJUV', rejuv)]);
    rts.find((x) => x.config.species === 'REJUV').isEffectActive = true;
    rts.find((x) => x.config.species === 'REJUV').effectRemaining = 4000;
    const r = processSpellsTick(rts, { ...base, silencedMs: 1 }, none());
    expect(r.events.map((e) => e.type)).toEqual(['spell_heal_tick']);
  });
});

describe('processSpellsTick: minion buffs (L1091340-1091437, L1091854-1091895)', () => {
  const vigor = { spellType: 'BUFF', effects: [], durationMs: 3000, cooldownMs: 16000, minionEmpower: { maxHpPercent: 25, regenPercentPerTick: 3, tickIntervalMs: 1000 } };
  it('needs a living minion to cast; start, heals and end land in ownerMinionEmpower', () => {
    const rts = ready([cfg('VIGOR', vigor)]);
    expect(processSpellsTick(rts, base, none()).events).toEqual([]);
    const t = { ...base, dtMs: 1000, minionAlive: true };
    const r1 = processSpellsTick(rts, t, none());
    expect(r1.ownerMinionEmpower).toEqual({ heals: [], start: { timestamp: 5000, maxHpPercent: 25, spell: ref('VIGOR') } });
    const r2 = processSpellsTick(rts, t, none());
    expect(r2.ownerMinionEmpower.heals).toEqual([{ timestamp: 5000, value: 30, spell: ref('VIGOR') }]);
    const r3 = processSpellsTick(rts, { ...t, minionAlive: false }, none());
    expect(r3.ownerMinionEmpower.end).toEqual({ timestamp: 5000, spell: ref('VIGOR') });
    expect(r3.events.map((e) => e.type)).toEqual(['spell_end']);
  });
});

describe('transforms (L1089965-1090072, L1092346-1092611)', () => {
  const flame = { spellType: 'TRANSFORM', durationMs: 60000, effects: [{ stat: 'ATTACK_PERCENT', value: 80 }, { stat: 'HP_PERCENT', value: 50 }, { stat: 'PENETRATION', value: 12 }] };
  it('resolveTransformEffects soft-caps Miss / Block / Penetration against the sheet', () => {
    expect(resolveTransformEffects(flame.effects, { penetration: 0 })[2].value).toBe(12);
    const high = resolveTransformEffects(flame.effects, { penetration: 40 })[2].value;
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThan(12);
    expect(resolveTransformEffects(flame.effects, undefined)[0]).toEqual({ stat: 'ATTACK_PERCENT', value: 80 });
  });
  it('fires the first idle TRANSFORM; heals its HP share; is never cast by processSpellsTick', () => {
    const rts = initSpellRuntimes([cfg('FLAMEBORN', flame)]);
    expect(processSpellsTick(rts, base, none()).events).toEqual([]);
    expect(hasPendingTransform(rts)).toBe(true);
    const r = triggerTransformSpell(rts, 7000, 0, 1000, { penetration: 0 });
    expect(r).toEqual({
      triggered: true, species: 'FLAMEBORN', ownerHpDelta: 500,
      events: [
        { timestamp: 7000, type: 'spell_cast', value: 0, spell: ref('FLAMEBORN') },
        { timestamp: 7000, type: 'spell_buff_start', value: 0, spell: ref('FLAMEBORN') },
      ],
    });
    expect(isTransformActive(rts)).toBe(true);
    expect(transformFireCount(rts)).toBe(1);
    expect(computeActiveBuffModifiers(rts)).toMatchObject({ attackPercent: 80, hpPercent: 50, penetration: 12 });
    expect(triggerTransformSpell(rts, 8000)).toEqual({ triggered: false, species: null, ownerHpDelta: 0, events: [] });
    expect(triggerTransformSpell(rts, 8000, 600, 1000).ownerHpDelta).toBe(0);
  });
  it('HP_PERCENT heal uses current HP when above 0', () => {
    const rts = initSpellRuntimes([cfg('FLAMEBORN', flame)]);
    expect(triggerTransformSpell(rts, 0, 600, 1000).ownerHpDelta).toBe(300);
  });
});
