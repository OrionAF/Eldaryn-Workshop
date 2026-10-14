import { describe, it, expect } from 'vitest';
import {
  sigilTierStatMult, getSigilBonusAttack, getSigilBonusHp, getSigilSpellScaled, spellTypeOf,
  getFormConditionalSpells, getSigilDefinitionForSpec, scaledSigilSpell,
} from './sigilScale.js';
import { sigilBySpecies } from '../../game/sigils.js';

const sp = (species) => sigilBySpecies(species).spell;
const scaled = (species, level) => getSigilSpellScaled(sp(species), level, sigilBySpecies(species).spellType);

describe('sigil stat scaling (L1067546-1067621, L1066773-1066807)', () => {
  it('tier multiplier is 3^(tier-1), falsy tier counts as 1 (L1066773)', () => {
    expect(sigilTierStatMult(1)).toBe(1);
    expect(sigilTierStatMult(2)).toBe(3);
    expect(sigilTierStatMult(3)).toBe(9);
    expect(sigilTierStatMult()).toBe(1);
    expect(sigilTierStatMult(0)).toBe(1);
    expect(sigilTierStatMult(null)).toBe(1);
  });

  it('level 1 is the rarity base times the tier multiplier', () => {
    const common = sigilBySpecies('BERSERK_STANCE');
    expect(getSigilBonusAttack(common, 1, 1)).toBe(166);
    expect(getSigilBonusHp(common, 1, 1)).toBe(1300);
    expect(getSigilBonusHp(sigilBySpecies('EARTHWARDEN'), 1, 3)).toBe(40000 * 9);
  });

  it('Common Health at L5 is 1819, not 1820 (L1067584-1067621 float case)', () => {
    // 1300 * (1 + 4*0.1) = 1300 * 1.4 = 1819.9999999999998 in IEEE doubles, floored to 1819.
    const common = sigilBySpecies('BERSERK_STANCE');
    expect(getSigilBonusHp(common, 5, 1)).toBe(1819);
    // tier 2: 1819.9999999999998 * 3 = 5459.999999999999 -> 5459 ; tier 3: x9 -> 16379
    expect(getSigilBonusHp(common, 5, 2)).toBe(5459);
    expect(getSigilBonusHp(common, 5, 3)).toBe(16379);
  });

  it('Common Attack at L5: 166 * 1.4 = 232.4 -> 232; Epic Health at L5 is 32479', () => {
    expect(getSigilBonusAttack(sigilBySpecies('BERSERK_STANCE'), 5, 1)).toBe(232);
    expect(getSigilBonusHp(sigilBySpecies('WITHERING_TOUCH'), 5, 1)).toBe(32479);
  });

  it('exact cases floor normally: Rare Attack L10 = 1140 * 1.9 = 2166; Epic Attack L10 = 3600 * 1.9 = 6840', () => {
    expect(getSigilBonusAttack(sigilBySpecies('CATACLYSM'), 10, 1)).toBe(2166);
    expect(getSigilBonusAttack(sigilBySpecies('WITHERING_TOUCH'), 10, 1)).toBe(6840);
  });

  it('Legendary L30 tier 3: 9000 * 3.9 * 9 = 315900', () => {
    expect(getSigilBonusAttack(sigilBySpecies('BULWARK_OF_THORNS'), 30, 3)).toBe(315900);
  });

  it('tier is uniform across rarities (no Legendary-only ladder): same x3 at tier 2', () => {
    const leg = sigilBySpecies('SUNDER_MARK');
    expect(getSigilBonusAttack(leg, 1, 2)).toBe(27000);
    expect(getSigilBonusHp(leg, 1, 2)).toBe(174000);
  });
});

describe('getSigilSpellScaled (L1067622-1068264)', () => {
  it('scale is 1 + (level-1)*0.08', () => {
    // Berserk Stance Attack% 4 at L5: 4*1.32 = 5.28 -> toFixed(1) 5.3
    expect(scaled('BERSERK_STANCE', 5).bonusValue).toBe(5.3);
    expect(scaled('BERSERK_STANCE', 1).bonusValue).toBe(4);
  });

  it('AURA Attack Speed keeps 2 decimals (L1068238-1068260): Hawk Focus 0.1 -> 0.13 at L5, 0.33 at L30', () => {
    expect(scaled('HAWK_FOCUS', 1).bonusValue).toBe(0.1);
    expect(scaled('HAWK_FOCUS', 5).bonusValue).toBe(0.13);
    expect(scaled('HAWK_FOCUS', 10).bonusValue).toBe(0.17);
    expect(scaled('HAWK_FOCUS', 30).bonusValue).toBe(0.33);
  });

  it('BUFF effects: capped at maxValue (Warborn Fury Attack% 12 -> 20.6 -> cap 20 at L10)', () => {
    const l1 = scaled('WARBORN_FURY', 1).effects;
    const l10 = scaled('WARBORN_FURY', 10).effects;
    expect(l1.map((e) => e.value)).toEqual([12, 15, 20]);
    // 12*1.72 = 20.64 -> 20.6 -> min(20.6, 20)
    expect(l10[0]).toMatchObject({ stat: 'ATTACK_PERCENT', value: 20 });
  });

  it('BUFF Attack Speed steps by 0.1 (Sanguine Rush: 0.2 L1-4, 0.3 at L5, 0.7 at L30, cap 0.8)', () => {
    const as = (lv) => scaled('SANGUINE_RUSH', lv).effects.find((e) => e.stat === 'ATTACK_SPEED').value;
    expect(as(1)).toBe(0.2);
    expect(as(4)).toBe(0.2); // 0.2*1.24 = 0.248
    expect(as(5)).toBe(0.3); // 0.2*1.32 = 0.264
    expect(as(30)).toBe(0.7); // 0.2*3.32 = 0.664
  });

  it('DAMAGE attackPercent is capped (Blade of Judgment 80 -> 137.6 -> cap 120 at L10)', () => {
    expect(scaled('BLADE_OF_JUDGMENT', 1).attackPercent).toBe(80);
    expect(scaled('BLADE_OF_JUDGMENT', 5).attackPercent).toBe(105.6); // 80*1.32
    expect(scaled('BLADE_OF_JUDGMENT', 10).attackPercent).toBe(120);
  });

  it('DAMAGE baseDamage and damagePerTick are floored (0 stays 0)', () => {
    const a = scaled('ARROWSTORM', 10);
    expect(a.baseDamage).toBe(0);
    expect(a.damagePerTick).toBe(0);
    expect(a.attackPercent).toBe(90); // 60*1.72 = 103.2 -> cap 90
  });

  it('DEBUFF: initial hit and debuff numbers cap (Withering Touch regen -60 -> 85 by L7; initial 210 -> 300)', () => {
    const wt = (lv) => scaled('WITHERING_TOUCH', lv);
    expect(wt(1).debuff.regenReductionPercent).toBe(60);
    expect(wt(3).debuff.regenReductionPercent).toBe(69.6); // 60*1.16
    expect(wt(7).debuff.regenReductionPercent).toBe(85); // 60*1.48 = 88.8 -> cap
    expect(wt(5).initialAttackPercent).toBe(277.2); // 210*1.32
    expect(wt(10).initialAttackPercent).toBe(300); // 361.2 -> cap
  });

  it('DEBUFF bleed damagePerTickPercent caps (Hemorrhage 40 -> 55 at L10); durations and stacks stay', () => {
    const h = scaled('HEMORRHAGE', 10);
    expect(h.debuff.damagePerTickPercent).toBe(55); // 40*1.72 = 68.8
    expect(h.debuff.maxStacks).toBe(8);
    expect(h.debuff.tickIntervalMs).toBe(2000);
    expect(h.cooldownMs).toBe(10000);
  });

  it('DEBUFF: a debuff field without its max passes through unscaled (L1067845-1067853)', () => {
    const spell = { initialAttackPercent: 10, debuff: { regenReductionPercent: 30, damagePerTickPercent: 20, maxDamagePerTickPercent: 25 } };
    const out = getSigilSpellScaled(spell, 11, 'DEBUFF'); // scale 1.8
    expect(out.initialAttackPercent).toBe(18); // no max: uncapped
    expect(out.debuff.regenReductionPercent).toBe(30); // field present, max absent: raw
    expect(out.debuff.damagePerTickPercent).toBe(25); // 36 -> cap 25
  });

  it('HEAL scales without a cap (Rejuvenation 8 -> 13.8 at L10)', () => {
    expect(scaled('REJUVENATION', 10).healPercentPerTick).toBe(13.8); // 8*1.72 = 13.76
  });

  it('TRANSFORM scales uncapped where no maxValue exists (Earthwarden at a hypothetical L11)', () => {
    expect(scaled('EARTHWARDEN', 1).effects.map((e) => e.value)).toEqual([30, 100, 16]);
    expect(scaled('EARTHWARDEN', 11).effects[0].value).toBe(54); // 30*1.8
  });

  it('STACK and FORM spells are constant at every level (L1067692-1067703)', () => {
    expect(scaled('BULWARK_OF_THORNS', 30)).toEqual(sp('BULWARK_OF_THORNS'));
    expect(scaled('URSINE_FORM', 30)).toEqual(sp('URSINE_FORM'));
  });

  it('SHIELD caps at maxShieldHpPercent; SUMMON caps attack and hp', () => {
    const shield = sp('ARCANE_BARRIER');
    const s1 = getSigilSpellScaled(shield, 1, 'SHIELD');
    const s30 = getSigilSpellScaled(shield, 30, 'SHIELD');
    expect(s1.shieldHpPercent).toBe(shield.shieldHpPercent);
    expect(s30.shieldHpPercent).toBe(shield.maxShieldHpPercent);
    const bone = sp('BONE_SERVANT');
    const b30 = getSigilSpellScaled(bone, 30, 'SUMMON');
    expect(b30.attackPercent).toBe(bone.maxAttackPercent);
    expect(b30.hpPercent).toBe(bone.maxHpPercent);
  });

  it('cooldowns and durations never scale; the input is not mutated', () => {
    const before = JSON.stringify(sp('WARBORN_FURY'));
    const out = scaled('WARBORN_FURY', 20);
    expect(out.cooldownMs).toBe(sp('WARBORN_FURY').cooldownMs);
    expect(out.durationMs).toBe(sp('WARBORN_FURY').durationMs);
    expect(JSON.stringify(sp('WARBORN_FURY'))).toBe(before);
  });

  it('unknown spell type returns undefined (L1067689-1067691)', () => {
    expect(getSigilSpellScaled({ x: 1 }, 5, 'NOPE')).toBeUndefined();
  });
});

describe('spell resolution for specs', () => {
  it('spellTypeOf infers a missing type from the spell shape', () => {
    expect(spellTypeOf({ bonusStat: 'HP_PERCENT', bonusValue: 8 })).toBe('AURA');
    expect(spellTypeOf({ initialAttackPercent: 5, debuff: {} })).toBe('DEBUFF');
    expect(spellTypeOf({ attackPercent: 5 })).toBe('DAMAGE');
    expect(spellTypeOf({ effects: [] })).toBe('BUFF');
    expect(spellTypeOf({ spellType: 'FORM' })).toBe('FORM');
  });

  it('getSigilDefinitionForSpec: non-Druid uses the base spell (L1066606)', () => {
    const d = getSigilDefinitionForSpec('ARCANE_EMPOWERMENT', 'MYSTIC_MAGE', null);
    expect(d.spell).toEqual({ bonusStat: 'SPELL_DAMAGE', bonusValue: 8 });
    expect(d.spellType).toBe('AURA');
    expect(getSigilDefinitionForSpec('NOPE', null, null)).toBeNull();
  });

  it('getSigilDefinitionForSpec: Druid uses the variant, form spell by kind, default BEAR', () => {
    expect(getSigilDefinitionForSpec('ARCANE_EMPOWERMENT', 'MYSTIC_DRUID', 'WOLF').spell)
      .toEqual({ bonusStat: 'ATTACK_PERCENT', bonusValue: 4 });
    expect(getSigilDefinitionForSpec('ARCANE_EMPOWERMENT', 'MYSTIC_DRUID', null).spell)
      .toEqual({ bonusStat: 'HP_PERCENT', bonusValue: 8 });
    // a variant without formSpell uses druidVariant.spell
    expect(getSigilDefinitionForSpec('ARCANE_SHARD', 'MYSTIC_DRUID', 'BEAR').name).toBe(sigilBySpecies('ARCANE_SHARD').druidVariant.name);
    expect(getFormConditionalSpells('ARCANE_EMPOWERMENT')).toHaveProperty('BEAR');
    expect(getFormConditionalSpells('ARCANE_SHARD')).toBeNull();
    expect(getFormConditionalSpells('BERSERK_STANCE')).toBeNull();
  });

  it('scaledSigilSpell scales the spec-resolved spell', () => {
    expect(scaledSigilSpell('BERSERK_STANCE', 5).bonusValue).toBe(5.3);
    expect(scaledSigilSpell('ARCANE_EMPOWERMENT', 10, 'MYSTIC_DRUID', 'WOLF').bonusValue).toBe(6.9); // 4*1.72 = 6.88
    expect(scaledSigilSpell('NOPE', 1)).toBeNull();
  });
});
