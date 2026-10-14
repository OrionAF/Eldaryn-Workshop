import { describe, it, expect } from 'vitest';
import {
  getEquippedStackDef, hasBulwark, hasSunder, initBulwarkRuntime, bulwarkOnBlock, bulwarkOnUnblockedHit,
  bulwarkModifiers, elusiveOnEvade, elusiveModifiers, initSunderRuntime, sunderOnHit, sunderDecayTick,
  sunderModifiers, withStackGlyphOverride, applyBulwarkDr, applyElusiveBuff, applySunderToTarget,
  createStackCombat, EMPTY_BULWARK_MODIFIERS, EMPTY_ELUSIVE_MODIFIERS, EMPTY_SUNDER_MODIFIERS,
} from './stacks.js';

// Catalogue values (sigils.json, Game/sigils.md §6): Bulwark 8 max, +8 hp / +4 dr / +7 thorns, loss 1;
// Sunder 8 max, -4 dr/blind/block/miss, decay 1.75/s; Elusive 8 max, +3 each, loss 2.
const WAR = { playerClass: 'WARRIOR', activeSpec: 'WARRIOR_TANK' };
const SEN = { playerClass: 'SENTINEL', activeSpec: 'SENTINEL_RANGER' };
const bulwarkDef = { kind: 'BULWARK', maxStacks: 8, hpPercentPerStack: 8, drPercentPerStack: 4, thornsPercentPerStack: 7, stackLossPerHit: 1 };
const sunderDef = {
  kind: 'SUNDER', maxStacks: 8, drReductionPerStack: 4, blindReductionPerStack: 4,
  blockReductionPerStack: 4, missReductionPerStack: 4, decayPerSecond: 1.75,
};

describe('getEquippedStackDef (L1078988-1079115)', () => {
  it('finds the stack def of the requested kind among the equipped sigils', () => {
    expect(getEquippedStackDef(['BERSERK_STANCE', 'BULWARK_OF_THORNS'], 'BULWARK', WAR)).toMatchObject(bulwarkDef);
    expect(getEquippedStackDef([{ species: 'SUNDER_MARK', level: 3 }], 'SUNDER', WAR)).toMatchObject(sunderDef);
    expect(getEquippedStackDef(['BULWARK_OF_THORNS'], 'SUNDER', WAR)).toBeNull();
    expect(getEquippedStackDef(null, 'BULWARK', WAR)).toBeNull();
    expect(getEquippedStackDef([], 'BULWARK', WAR)).toBeNull();
  });
  it('Elusive Supremacy and Siegebreaker belong to the Sentinel', () => {
    expect(getEquippedStackDef(['ELUSIVE_SUPREMACY'], 'ELUSIVE', SEN)).toMatchObject({ maxStacks: 8, stackLossPerHit: 2 });
    expect(getEquippedStackDef(['SIEGEBREAKER_MARK'], 'SIEGEBREAKER', SEN)).toMatchObject({ hpRegenReductionPerStack: 3, decayPerSecond: 1.75 });
  });
  it('a Druid needs a form for Primal Instinct: none -> skipped, Bear -> Bulwark (loss 2), Wolf -> Siegebreaker', () => {
    const druid = { playerClass: 'MYSTIC', activeSpec: 'MYSTIC_DRUID' };
    expect(getEquippedStackDef(['PRIMAL_INSTINCT'], 'BULWARK', druid)).toBeNull();
    expect(getEquippedStackDef(['PRIMAL_INSTINCT'], 'BULWARK', { ...druid, form: 'BEAR' }))
      .toMatchObject({ hpPercentPerStack: 4, drPercentPerStack: 2, thornsPercentPerStack: 5, stackLossPerHit: 2 });
    expect(getEquippedStackDef(['PRIMAL_INSTINCT'], 'SIEGEBREAKER', { ...druid, form: 'WOLF' })).toMatchObject({ blockReductionPerStack: 4 });
    expect(getEquippedStackDef(['PRIMAL_INSTINCT'], 'BULWARK', { ...druid, form: 'WOLF' })).toBeNull();
  });
  it('a Mage never sees the Druid-only sigil', () => {
    expect(getEquippedStackDef(['PRIMAL_INSTINCT'], 'BULWARK', { playerClass: 'MYSTIC', activeSpec: 'MYSTIC_MAGE' })).toBeNull();
  });
  it('hasBulwark / hasSunder (L1080139-1080167)', () => {
    expect(hasBulwark(['BULWARK_OF_THORNS'], WAR)).toBe(true);
    expect(hasBulwark(['SUNDER_MARK'], WAR)).toBe(false);
    expect(hasSunder(['SUNDER_MARK'], WAR)).toBe(true);
    expect(hasSunder(['SIEGEBREAKER_MARK'], SEN)).toBe(false);
  });
});

describe('Bulwark runtime (L1079116-1079208)', () => {
  it('+1 per block up to maxStacks, then false', () => {
    const rt = initBulwarkRuntime();
    for (let i = 0; i < 8; i++) expect(bulwarkOnBlock(rt, bulwarkDef)).toBe(true);
    expect(rt.stacks).toBe(8);
    expect(bulwarkOnBlock(rt, bulwarkDef)).toBe(false);
  });
  it('an unblocked hit burns stackLossPerHit (default 2 when the def has none), floor 0', () => {
    const rt = { stacks: 5 };
    expect(bulwarkOnUnblockedHit(rt, bulwarkDef)).toBe(true);
    expect(rt.stacks).toBe(4);
    expect(bulwarkOnUnblockedHit(rt, { maxStacks: 8 })).toBe(true);
    expect(rt.stacks).toBe(2);
    bulwarkOnUnblockedHit(rt, { maxStacks: 8 });
    bulwarkOnUnblockedHit(rt, { maxStacks: 8 });
    expect(rt.stacks).toBe(0);
    expect(bulwarkOnUnblockedHit(rt, bulwarkDef)).toBe(false);
  });
  it('modifiers are stacks x per-stack: 3 stacks -> 24 hp, 12 dr, 21 thorns', () => {
    expect(bulwarkModifiers({ stacks: 3 }, bulwarkDef)).toEqual({ hpPercent: 24, drPercent: 12, thornsPercent: 21 });
    expect(bulwarkModifiers({ stacks: 3 }, { maxStacks: 8 })).toEqual({ hpPercent: 0, drPercent: 0, thornsPercent: 0 });
  });
});

describe('Elusive runtime (L1079209-1079272)', () => {
  it('+1 per evade up to maxStacks; modifiers 3 stacks x 3 = 9 each', () => {
    const rt = { stacks: 0 };
    const def = { kind: 'ELUSIVE', maxStacks: 2, attackPercentPerStack: 3, critChancePercentPerStack: 3, lifestealPercentPerStack: 3, attackSpeedPercentPerStack: 3 };
    expect([elusiveOnEvade(rt, def), elusiveOnEvade(rt, def), elusiveOnEvade(rt, def)]).toEqual([true, true, false]);
    expect(elusiveModifiers(rt, def)).toEqual({ attackPercent: 6, critChancePercent: 6, lifestealPercent: 6, attackSpeedPercent: 6 });
  });
});

describe('Sunder runtime (L1079273-1079415)', () => {
  it('+1 per landed hit up to maxStacks', () => {
    const rt = initSunderRuntime();
    for (let i = 0; i < 9; i++) sunderOnHit(rt, sunderDef);
    expect(rt.stacks).toBe(8);
  });
  // decay 2/s -> interval 500 ms. stacks 4, dt 1200: accum 1200 -> (3, 700) -> (2, 200). Then dt 300: 500 -> (1, 0).
  it('sheds one stack per 1000/decay ms; the remainder carries (no catch-up cap)', () => {
    const rt = { stacks: 4, decayAccumMs: 0 };
    const def = { ...sunderDef, decayPerSecond: 2 };
    expect(sunderDecayTick(rt, def, 1200)).toBe(true);
    expect(rt).toEqual({ stacks: 2, decayAccumMs: 200 });
    expect(sunderDecayTick(rt, def, 300)).toBe(true);
    expect(rt).toEqual({ stacks: 1, decayAccumMs: 0 });
    expect(sunderDecayTick(rt, def, 100)).toBe(false);
    expect(rt.decayAccumMs).toBe(100);
  });
  it('decay defaults to 2/s when the def has none; 1.75/s gives a 571.43 ms interval', () => {
    const a = { stacks: 3, decayAccumMs: 0 };
    sunderDecayTick(a, { maxStacks: 8 }, 500);
    expect(a.stacks).toBe(2);
    const b = { stacks: 3, decayAccumMs: 0 };
    sunderDecayTick(b, sunderDef, 600);
    expect(b.stacks).toBe(2);
    expect(b.decayAccumMs).toBeCloseTo(600 - 1000 / 1.75, 9);
  });
  it('at 0 stacks the accumulator resets; decay <= 0 never sheds', () => {
    const a = { stacks: 0, decayAccumMs: 400 };
    expect(sunderDecayTick(a, sunderDef, 100)).toBe(false);
    expect(a.decayAccumMs).toBe(0);
    const b = { stacks: 3, decayAccumMs: 0 };
    expect(sunderDecayTick(b, { ...sunderDef, decayPerSecond: 0 }, 99999)).toBe(false);
    expect(b.stacks).toBe(3);
  });
  it('clearing the last stack clears the accumulator', () => {
    const rt = { stacks: 1, decayAccumMs: 0 };
    sunderDecayTick(rt, { ...sunderDef, decayPerSecond: 2 }, 1400); // one stack lost, 900 left over
    expect(rt).toEqual({ stacks: 0, decayAccumMs: 0 });
  });
  it('modifiers: 5 stacks x 4 = 20 on each reduction; Siegebreaker regen reduction 3 x 5 = 15', () => {
    expect(sunderModifiers({ stacks: 5 }, sunderDef)).toEqual({
      drReductionPercent: 20, blindReductionPercent: 20, blockReductionPercent: 20,
      missReductionPercent: 20, hpRegenReductionPercent: 0,
    });
    expect(sunderModifiers({ stacks: 5 }, { hpRegenReductionPerStack: 3, maxStacks: 8 }).hpRegenReductionPercent).toBe(15);
  });
});

describe('withStackGlyphOverride (L1079416-1079642)', () => {
  it('returns the def untouched without a def or an override', () => {
    expect(withStackGlyphOverride(null, 'BULWARK', { bulwark: {} })).toBeNull();
    expect(withStackGlyphOverride(bulwarkDef, 'BULWARK', null)).toBe(bulwarkDef);
    expect(withStackGlyphOverride(bulwarkDef, 'BULWARK', { sunder: { decayPerSecond: 1 } })).toBe(bulwarkDef);
  });
  it('Bulwark: thorns per stack and max stacks add (7 + 1 = 8, 8 + 1 = 9)', () => {
    const d = withStackGlyphOverride(bulwarkDef, 'BULWARK', { bulwark: { thornsPercentPerStackBonus: 1, maxStacksBonus: 1 } });
    expect(d).toMatchObject({ thornsPercentPerStack: 8, maxStacks: 9, hpPercentPerStack: 8 });
    expect(bulwarkDef.maxStacks).toBe(8); // not mutated
  });
  it('Elusive: per-stack bonuses add; a burn override replaces stackLossPerHit', () => {
    const base = { kind: 'ELUSIVE', maxStacks: 8, attackPercentPerStack: 3, attackSpeedPercentPerStack: 3, stackLossPerHit: 2 };
    const d = withStackGlyphOverride(base, 'ELUSIVE', {
      elusive: { attackSpeedPercentPerStackBonus: 2.5, attackPercentPerStackBonus: 4, stackLossPerHitOverride: 1 },
    });
    expect(d).toMatchObject({ attackSpeedPercentPerStack: 5.5, attackPercentPerStack: 7, stackLossPerHit: 1 });
    expect(withStackGlyphOverride(base, 'ELUSIVE', { elusive: { attackPercentPerStackBonus: 1 } }).stackLossPerHit).toBe(2);
  });
  it('Sunder and Siegebreaker: decayPerSecond is replaced, each from its own override key', () => {
    expect(withStackGlyphOverride(sunderDef, 'SUNDER', { sunder: { decayPerSecond: 1.3 } }).decayPerSecond).toBe(1.3);
    expect(withStackGlyphOverride(sunderDef, 'SIEGEBREAKER', { sunder: { decayPerSecond: 1.3 } })).toBe(sunderDef);
    expect(withStackGlyphOverride(sunderDef, 'SIEGEBREAKER', { siegebreaker: { decayPerSecond: 1.4 } }).decayPerSecond).toBe(1.4);
  });
});

describe('applyBulwarkDr (L1079643-1079666)', () => {
  it('adds Bulwark DR and clamps to the 75 ceiling', () => {
    expect(applyBulwarkDr(50, { drPercent: 12 })).toBe(62);
    expect(applyBulwarkDr(70, { drPercent: 12 })).toBe(75);
    expect(applyBulwarkDr(70, { drPercent: 0 })).toBe(70);
  });
});

describe('applyElusiveBuff (L1079667-1079740)', () => {
  it('all-zero mods return the inputs', () => {
    const z = { attackPercent: 0, critChancePercent: 0, lifestealPercent: 0, attackSpeedPercent: 0 };
    expect(applyElusiveBuff(1000, 20, 5, 2, z)).toEqual({ attack: 1000, critChance: 20, lifesteal: 5, attackSpeed: 2 });
  });
  // 4 stacks x 3 = 12 each: attack round(1000 * 1.12) = 1120; crit 90 + 12 = 102 -> ceiling 95;
  // lifesteal 75 + 12 = 87 -> 80; attack speed 2 * 1.12 = 2.24
  it('attack multiplicative and rounded; crit and lifesteal additive with ceilings; speed multiplicative', () => {
    const m = { attackPercent: 12, critChancePercent: 12, lifestealPercent: 12, attackSpeedPercent: 12 };
    const r = applyElusiveBuff(1000, 90, 75, 2, m);
    expect(r.attack).toBe(1120);
    expect(r.critChance).toBe(95);
    expect(r.lifesteal).toBe(80);
    expect(r.attackSpeed).toBeCloseTo(2.24, 12);
  });
  it('attack speed is clamped at 4.5', () => {
    expect(applyElusiveBuff(1, 0, 0, 4.2, { attackPercent: 1, critChancePercent: 0, lifestealPercent: 0, attackSpeedPercent: 12 }).attackSpeed).toBe(4.5);
  });
});

describe('applySunderToTarget (L1079741-1079784)', () => {
  // 8 stacks x 4 = 32 off each; dr 10 -> 0 (floored), blind 50 -> 18, block 40 -> 8, miss 20 -> 0; regen 70 - 24 = 46
  it('subtracts the reductions and floors at 0', () => {
    const mods = sunderModifiers({ stacks: 8 }, { ...sunderDef, hpRegenReductionPerStack: 3 });
    expect(applySunderToTarget(10, 50, 40, 20, 70, mods)).toEqual({
      damageReduction: 0, blindChance: 18, blockChance: 8, missChance: 0, hpRegen: 46,
    });
  });
});

describe('createStackCombat (L1079785-1080125)', () => {
  it('Bulwark + Sunder: blockReflect takes thorns BEFORE the +1; hitTakenReflect BEFORE the loss', () => {
    const sc = createStackCombat(['BULWARK_OF_THORNS', 'SUNDER_MARK'], true, null, WAR);
    expect(sc.active).toBe(true);
    expect(sc.blockReflect(100)).toBe(0); // 0 stacks -> 0 thorns, then 1 stack
    expect(sc.blockReflect(100)).toBe(7); // 1 stack: round(100 * 7 / 100); then 2 stacks
    expect(sc.snapshot().bulwarkStacks).toBe(2);
    expect(sc.selfModifiers()).toEqual({ hpPercent: 16, drPercent: 8, thornsPercent: 14 });
    expect(sc.hitTakenReflect(200)).toBe(28); // 2 stacks: round(200 * 14 / 100); then 2 - 1
    expect(sc.snapshot().bulwarkStacks).toBe(1);
    expect(sc.thornsFor(0)).toBe(0); // damage 0 -> no thorns (a clean block pierces for 0)
    expect(sc.thornsFor(150)).toBe(11); // 1 stack: 150 * 7 / 100 = 10.5 -> 11
  });
  it('Sunder: +1 per landed hit, decays on tick, resetTarget clears only the target counter', () => {
    const sc = createStackCombat(['BULWARK_OF_THORNS', 'SUNDER_MARK'], true, null, WAR);
    sc.blockReflect(0);
    for (let i = 0; i < 3; i++) sc.onHitLanded();
    expect(sc.snapshot().sunderStacks).toBe(3);
    expect(sc.targetModifiers().drReductionPercent).toBe(12);
    sc.tick(1000); // 1.75/s -> interval 571.4: one stack lost, 428.6 carried
    expect(sc.snapshot().sunderStacks).toBe(2);
    sc.resetTarget();
    expect(sc.snapshot()).toEqual({ bulwarkStacks: 1, sunderStacks: 0 });
  });
  it('active = false disables Bulwark and Elusive but not Sunder', () => {
    const sc = createStackCombat(['BULWARK_OF_THORNS', 'SUNDER_MARK'], false, null, WAR);
    expect(sc.selfModifiers()).toEqual(EMPTY_BULWARK_MODIFIERS);
    expect(sc.blockReflect(100)).toBe(0);
    sc.blockReflect(100);
    expect(sc.snapshot().bulwarkStacks).toBe(0);
    sc.onHitLanded();
    expect(sc.snapshot().sunderStacks).toBe(1);
    expect(sc.active).toBe(true);
  });
  it('Elusive: evades build stacks, a hit taken costs stackLossPerHit (2)', () => {
    const sc = createStackCombat(['ELUSIVE_SUPREMACY'], true, null, SEN);
    sc.onEvaded(); sc.onEvaded(); sc.onEvaded();
    expect(sc.elusiveSelfModifiers()).toEqual({ attackPercent: 9, critChancePercent: 9, lifestealPercent: 9, attackSpeedPercent: 9 });
    sc.onHitTaken();
    expect(sc.elusiveSelfModifiers().attackPercent).toBe(3);
    expect(sc.selfModifiers()).toEqual(EMPTY_BULWARK_MODIFIERS);
    expect(sc.targetModifiers()).toEqual(EMPTY_SUNDER_MODIFIERS);
  });
  it('no stack sigils equipped: inactive and every modifier empty', () => {
    const sc = createStackCombat(['BERSERK_STANCE'], true, null, WAR);
    expect(sc.active).toBe(false);
    expect(sc.elusiveSelfModifiers()).toEqual(EMPTY_ELUSIVE_MODIFIERS);
    sc.onHitTaken(); sc.onEvaded(); sc.onHitLanded(); sc.tick(1000);
    expect(sc.snapshot()).toEqual({ bulwarkStacks: 0, sunderStacks: 0 });
  });
  it('glyph overrides apply: Bulwark thorns 7 -> 8 per stack, max 8 -> 9', () => {
    const sc = createStackCombat(['BULWARK_OF_THORNS'], true, { bulwark: { thornsPercentPerStackBonus: 1, maxStacksBonus: 1 } }, WAR);
    for (let i = 0; i < 12; i++) sc.blockReflect(0);
    expect(sc.snapshot().bulwarkStacks).toBe(9);
    expect(sc.thornsFor(100)).toBe(72); // 9 stacks x 8 = 72
  });
});
