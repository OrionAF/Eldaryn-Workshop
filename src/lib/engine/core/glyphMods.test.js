import { describe, it, expect } from 'vitest';
import { MAJOR_GLYPHS } from '../../game/mountsGlyphs.js';
import {
  GLYPH_EFFECT_KINDS, emptySigilGlyphMods, majorGlyphRarityIndex, resolveSigilGlyphMods, applySigilGlyphMods,
  stackGlyphOverrides, ironBastionThornsPercent, toSigilGlyphCombatMods, EMPTY_SIGIL_GLYPH_COMBAT_MODS,
  glyphCombatMods, uncoveredMajorGlyphIds,
} from './glyphMods.js';
import { createStackCombat, getEquippedStackDef, withStackGlyphOverride } from './stacks.js';
import { buildCombatSpells, getEquippedShieldConfig } from './spellConfig.js';
import { specsForClass } from '../../game/classes.js';

const g = (glyphType, rarity = 'Legendary', extra = {}) => ({ glyphType, rarity, ...extra });

describe('coverage of the 42 major glyphs', () => {
  it('lists any glyph id this module does not handle (expected: none)', () => {
    expect(MAJOR_GLYPHS).toHaveLength(42);
    expect(uncoveredMajorGlyphIds()).toEqual([]);
  });
  it('every effect kind in the catalogue is one of the 13 handled kinds, and all 13 occur', () => {
    const kinds = new Set(MAJOR_GLYPHS.map((m) => m.effectKind));
    expect([...kinds].filter((k) => !GLYPH_EFFECT_KINDS.includes(k))).toEqual([]);
    expect(GLYPH_EFFECT_KINDS.filter((k) => !kinds.has(k))).toEqual([]);
  });
});

describe('every major glyph changes combat for its class / spec (and some Druid form)', () => {
  // (glyph id, spec, form) cases where the client itself leaves the glyph inert. None in 2.7.0.
  const EXPECTED_INERT = [];
  const FORMS = (spec) => (spec === 'MYSTIC_DRUID' ? [null, 'BEAR', 'WOLF'] : [null]);
  const STACK_KIND_LIST = ['BULWARK', 'ELUSIVE', 'SUNDER', 'SIEGEBREAKER'];

  // Everything a fight reads from the sigil + glyph: castable spells after glyph mods, the shield
  // config, the stack defs after overrides, and Iron Bastion thorns while Iron Bastion is cast.
  const combatConfig = (species, cls, spec, form, glyphs) => {
    const mods = resolveSigilGlyphMods(glyphs, cls, spec);
    const state = {
      ownedSigils: [{ species, level: 1 }],
      equippedSpecies: [species], druidEquippedSpecies: [species], utilitySlotSpecies: species,
    };
    const spells = buildCombatSpells(state, cls, spec, form, mods);
    const ctx = { playerClass: cls, activeSpec: spec, form };
    const overrides = stackGlyphOverrides(mods);
    return JSON.stringify({
      spells,
      shield: getEquippedShieldConfig(state, spec, mods),
      stacks: STACK_KIND_LIST.map((k) => withStackGlyphOverride(getEquippedStackDef([species], k, ctx), k, overrides)),
      thorns: spells.some((s) => s.species === 'IRON_BASTION') ? ironBastionThornsPercent(mods) : 0,
    });
  };

  it('a Legendary copy alters the combat config in at least one form, for every applicable spec', () => {
    const inert = [];
    for (const m of MAJOR_GLYPHS) {
      for (const { key: spec } of specsForClass(m.playerClass)) {
        if (m.requiredSpec != null && m.requiredSpec !== spec) continue;
        const changed = FORMS(spec).some((form) =>
          combatConfig(m.sigilSpecies, m.playerClass, spec, form, []) !== combatConfig(m.sigilSpecies, m.playerClass, spec, form, [g(m.id)]));
        if (!changed) inert.push(`${m.id} ${spec}`);
      }
    }
    expect(inert).toEqual(EXPECTED_INERT);
  });
});

describe('majorGlyphRarityIndex (L1081245-1081261)', () => {
  it('names in any case map to 0..4; unknown -> 0; a number passes through', () => {
    expect(['Common', 'uncommon', 'RARE', 'Epic', 'Legendary'].map(majorGlyphRarityIndex)).toEqual([0, 1, 2, 3, 4]);
    expect(majorGlyphRarityIndex('Mythic')).toBe(0);
    expect(majorGlyphRarityIndex(undefined)).toBe(0);
    expect(majorGlyphRarityIndex(3)).toBe(3);
  });
});

describe('resolveSigilGlyphMods (L1083530-1084020)', () => {
  it('COOLDOWN at Legendary: 5 s -> 5000 ms on the sigil species', () => {
    const m = resolveSigilGlyphMods([g('sg-warborn-cd')], 'WARRIOR', 'WARRIOR_TANK');
    expect([...m.keys()]).toEqual(['WARBORN_FURY']);
    expect(m.get('WARBORN_FURY').cooldownReductionMs).toBe(5000);
    expect(m.get('WARBORN_FURY')).toEqual({ ...emptySigilGlyphMods(), cooldownReductionMs: 5000 });
  });
  it('two copies of one glyph type keep the highest rarity (Common + Epic -> Epic, 4 s)', () => {
    const m = resolveSigilGlyphMods([g('sg-warborn-cd', 'Common'), g('sg-warborn-cd', 'Epic'), g('sg-warborn-cd', 'Rare')], 'WARRIOR', null);
    expect(m.get('WARBORN_FURY').cooldownReductionMs).toBe(4000);
  });
  it('different glyph types on one sigil add up (Iron Bastion cooldown Rare 4.5 s + thorns Rare 6)', () => {
    const m = resolveSigilGlyphMods([g('sg-bastion-cd', 'Rare'), g('sg-bastion-thorns', 'Rare')], 'WARRIOR', null);
    expect(m.get('IRON_BASTION')).toMatchObject({ cooldownReductionMs: 4500, thornsPercent: 6 });
  });
  it('sealed glyphs and non-MAJOR tiers are ignored', () => {
    const m = resolveSigilGlyphMods([g('sg-warborn-cd', 'Legendary', { sealed: true }), g('sg-rejuv-cd', 'Legendary', { tier: 'MINOR' })], 'WARRIOR', null);
    expect(m.size).toBe(0);
  });
  it('class and requiredSpec gate the glyph (Sentinel glyph on a Warrior; Druid glyph on a Mage)', () => {
    expect(resolveSigilGlyphMods([g('sg-phantom-cd')], 'WARRIOR', null).size).toBe(0);
    expect(resolveSigilGlyphMods([g('sg-m-rending-cd')], 'MYSTIC', 'MYSTIC_MAGE').size).toBe(0);
    expect(resolveSigilGlyphMods([g('sg-m-rending-cd')], 'MYSTIC', 'MYSTIC_DRUID').get('RUNIC_AFFLICTION').cooldownReductionMs).toBe(5000);
    expect(resolveSigilGlyphMods([g('sg-m-runic-dmg')], 'MYSTIC', 'MYSTIC_MAGE').get('RUNIC_AFFLICTION').damageBonusPercent).toBe(100);
  });
  it('unknown glyph types and empty input are harmless', () => {
    expect(resolveSigilGlyphMods([g('sg-nope')], 'WARRIOR', null).size).toBe(0);
    expect(resolveSigilGlyphMods(undefined, 'WARRIOR', null).size).toBe(0);
  });
  it('every effect kind lands in its accumulator field (Legendary)', () => {
    const w = (id, cls = 'WARRIOR', spec = null) => resolveSigilGlyphMods([g(id)], cls, spec);
    expect(w('sg-arrowstorm-dmg').get('ARROWSTORM').damageBonusPercent).toBe(100);
    expect(w('sg-bastion-thorns').get('IRON_BASTION').thornsPercent).toBe(10);
    expect(w('sg-withering-paralyze').get('WITHERING_TOUCH').paralyzeMs).toBe(1000);
    expect(w('sg-thunderbind-paralyze', 'SENTINEL').get('THUNDERBIND').paralyzeMs).toBe(2000); // PARALYZE_EXTEND adds the same field
    expect(w('sg-hemorrhage-stacks').get('HEMORRHAGE')).toMatchObject({ bleedMaxStacksBonus: 3, bleedStackDamagePercent: 50 });
    expect(w('sg-bulwark-thorns').get('BULWARK_OF_THORNS')).toMatchObject({ bulwarkThornsPerStackPercent: 1, bulwarkMaxStacksBonus: 1 });
    expect(w('sg-sunder-decay').get('SUNDER_MARK').sunderDecayPerSecond).toBe(1.3);
    expect(w('sg-blinding-as', 'SENTINEL').get('BLINDING_MARK').attackSpeedBuffPercent).toBe(15);
    expect(w('sg-venom-stack', 'SENTINEL').get('VENOM_WOUND').poisonPermanentMaxStacks).toBe(7);
    expect(w('sg-elusive-buff', 'SENTINEL').get('ELUSIVE_SUPREMACY')).toMatchObject({
      elusiveAttackSpeedPerStackPercent: 2.5, elusiveAttackPerStackPercent: 4, elusiveBurnPerHitOverride: 1,
    });
    expect(w('sg-m-aegis-shield', 'MYSTIC', 'MYSTIC_MAGE').get('VOID_AEGIS').shieldPowerPercent).toBe(50);
    expect(w('sg-m-dominance-cc', 'MYSTIC', 'MYSTIC_DRUID').get('ARCANE_BURST').ccExtendMs).toBe(1000);
  });
  it('rarity picks the array entry: Elusive burn override is null below Epic', () => {
    const at = (r) => resolveSigilGlyphMods([g('sg-elusive-buff', r)], 'SENTINEL', null).get('ELUSIVE_SUPREMACY');
    expect(at('Rare').elusiveBurnPerHitOverride).toBeNull();
    expect(at('Epic').elusiveBurnPerHitOverride).toBe(1);
    expect(at('Rare').elusiveAttackPerStackPercent).toBe(2.4);
    expect(at(4).elusiveAttackPerStackPercent).toBe(4); // numeric rarity index
  });
});

describe('applySigilGlyphMods (L1080871-1081182)', () => {
  const mods = (list, cls = 'WARRIOR', spec = null) => resolveSigilGlyphMods(list, cls, spec);
  const hemorrhage = () => ({
    species: 'HEMORRHAGE',
    spell: {
      spellType: 'DEBUFF', cooldownMs: 10000, initialAttackPercent: 80,
      debuff: { durationMs: 0, maxStacks: 8, damagePerTickPercent: 40, maxDamagePerTickPercent: 55, tickIntervalMs: 2000 },
    },
  });
  it('an empty or missing map returns the same array; a species without mods returns the same item', () => {
    const spells = [hemorrhage()];
    expect(applySigilGlyphMods(spells, null)).toBe(spells);
    expect(applySigilGlyphMods(spells, new Map())).toBe(spells);
    const other = applySigilGlyphMods(spells, mods([g('sg-warborn-cd')]));
    expect(other[0]).toBe(spells[0]);
  });
  // cooldown 10000 - 5000 = 5000; maxStacks 8 + 3 = 11; ticks x1.5: 40 -> 60, 55 -> 82.5 -> 83
  it('Hemorrhage: cooldown, +3 stacks, +50 % tick damage (rounded)', () => {
    const [out] = applySigilGlyphMods([hemorrhage()], mods([g('sg-hemorrhage-cd'), g('sg-hemorrhage-stacks')]));
    expect(out.spell.cooldownMs).toBe(5000);
    expect(out.spell.debuff).toMatchObject({ maxStacks: 11, damagePerTickPercent: 60, maxDamagePerTickPercent: 83, tickIntervalMs: 2000 });
  });
  it('does not mutate the input spell', () => {
    const s = hemorrhage();
    applySigilGlyphMods([s], mods([g('sg-hemorrhage-cd'), g('sg-hemorrhage-stacks')]));
    expect(s.spell.cooldownMs).toBe(10000);
    expect(s.spell.debuff.maxStacks).toBe(8);
  });
  it('the cooldown floor is 1000 ms (MIN_SIGIL_COOLDOWN_MS)', () => {
    const s = { species: 'HEMORRHAGE', spell: { spellType: 'DEBUFF', cooldownMs: 5500 } };
    expect(applySigilGlyphMods([s], mods([g('sg-hemorrhage-cd')]))[0].spell.cooldownMs).toBe(1000);
  });
  it('a spell with no cooldownMs is left without one', () => {
    const s = { species: 'HEMORRHAGE', spell: { spellType: 'DEBUFF' } };
    expect('cooldownMs' in applySigilGlyphMods([s], mods([g('sg-hemorrhage-cd')]))[0].spell).toBe(false);
  });
  // x(1 + 100/100) = x2: 60 -> 120, 90 -> 180, baseDamage 25 -> 50, damagePerTick 10 -> 20; baseDamage 0 stays
  it('DAMAGE glyph scales attackPercent, maxAttackPercent, baseDamage (> 0) and damagePerTick (> 0) on DAMAGE spells only', () => {
    const dmg = { species: 'ARROWSTORM', spell: { spellType: 'DAMAGE', attackPercent: 60, maxAttackPercent: 90, baseDamage: 25, damagePerTick: 10 } };
    const m = mods([g('sg-arrowstorm-dmg')]);
    expect(applySigilGlyphMods([dmg], m)[0].spell).toMatchObject({ attackPercent: 120, maxAttackPercent: 180, baseDamage: 50, damagePerTick: 20 });
    const zero = { species: 'ARROWSTORM', spell: { spellType: 'DAMAGE', attackPercent: 60, baseDamage: 0 } };
    expect(applySigilGlyphMods([zero], m)[0].spell.baseDamage).toBe(0);
    const notDmg = { species: 'ARROWSTORM', spell: { spellType: 'BUFF', attackPercent: 60 } };
    expect(applySigilGlyphMods([notDmg], m)[0].spell.attackPercent).toBe(60);
  });
  it('PARALYZE adds ms to DEBUFF / DAMAGE spells (undefined counts as 0); a BUFF is untouched', () => {
    const m = mods([g('sg-withering-paralyze', 'Epic')]); // Epic 0.8 s
    const a = { species: 'WITHERING_TOUCH', spell: { spellType: 'DEBUFF' } };
    const b = { species: 'WITHERING_TOUCH', spell: { spellType: 'DAMAGE', paralyzeMs: 500 } };
    const c = { species: 'WITHERING_TOUCH', spell: { spellType: 'BUFF' } };
    const out = applySigilGlyphMods([a, b, c], m);
    expect(out[0].spell.paralyzeMs).toBe(800);
    expect(out[1].spell.paralyzeMs).toBe(1300);
    expect('paralyzeMs' in out[2].spell).toBe(false);
  });
  it('CC_EXTEND adds only to a paralyzeMs and a fearMs that are already > 0', () => {
    const m = mods([g('sg-m-dominance-cc')], 'MYSTIC', 'MYSTIC_DRUID'); // +1000 ms
    const bear = { species: 'ARCANE_BURST', spell: { spellType: 'DAMAGE', paralyzeMs: 1500 } };
    const wolf = { species: 'ARCANE_BURST', spell: { spellType: 'DAMAGE', fearMs: 1000 } };
    const none = { species: 'ARCANE_BURST', spell: { spellType: 'DAMAGE' } };
    const zero = { species: 'ARCANE_BURST', spell: { spellType: 'DAMAGE', paralyzeMs: 0, fearMs: 0 } };
    const out = applySigilGlyphMods([bear, wolf, none, zero], m);
    expect(out[0].spell.paralyzeMs).toBe(2500);
    expect(out[1].spell.fearMs).toBe(2000);
    expect('paralyzeMs' in out[2].spell || 'fearMs' in out[2].spell).toBe(false);
    expect(out[3].spell).toMatchObject({ paralyzeMs: 0, fearMs: 0 });
  });
  it('ATTACK_SPEED_BUFF appends an ATTACK_SPEED effect of p/100 to a BUFF spell', () => {
    const buff = { species: 'BLINDING_MARK', spell: { spellType: 'BUFF', effects: [{ stat: 'BLIND_CHANCE', value: 10 }] } };
    const out = applySigilGlyphMods([buff], mods([g('sg-blinding-as')], 'SENTINEL'));
    expect(out[0].spell.effects).toEqual([{ stat: 'BLIND_CHANCE', value: 10 }, { stat: 'ATTACK_SPEED', value: 0.15 }]);
    expect(buff.spell.effects).toHaveLength(1);
  });
  it('POISON_STACK makes the poison permanent with the ceiling (Venom Wound Legendary: 7 stacks)', () => {
    const venom = { species: 'VENOM_WOUND', spell: { spellType: 'DEBUFF', debuff: { durationMs: 10000, maxStacks: 1, damagePerTickPercent: 40 } } };
    const out = applySigilGlyphMods([venom], mods([g('sg-venom-stack')], 'SENTINEL'));
    expect(out[0].spell.debuff).toEqual({ durationMs: 0, maxStacks: 7, damagePerTickPercent: 40 });
  });
  it('BLEED_BOOST on a debuff without maxStacks counts it as 1', () => {
    const s = { species: 'EMBER_CURSE', spell: { spellType: 'DEBUFF', debuff: { damagePerTickPercent: 40 } } };
    const out = applySigilGlyphMods([s], mods([g('sg-ember-stacks', 'Common')], 'SENTINEL')); // +1 stack, +10 %
    expect(out[0].spell.debuff).toMatchObject({ maxStacks: 2, damagePerTickPercent: 44 });
  });
});

describe('stackGlyphOverrides / ironBastionThornsPercent / toSigilGlyphCombatMods (L1080532-1080716)', () => {
  it('null without a map, without entries, or when no glyph touches a stack sigil', () => {
    expect(stackGlyphOverrides(null)).toBeNull();
    expect(stackGlyphOverrides(new Map())).toBeNull();
    expect(stackGlyphOverrides(resolveSigilGlyphMods([g('sg-warborn-cd')], 'WARRIOR', null))).toBeNull();
  });
  it('Bulwark: only the non-zero fields are set', () => {
    const o = stackGlyphOverrides(resolveSigilGlyphMods([g('sg-bulwark-thorns', 'Common')], 'WARRIOR', null));
    expect(o).toEqual({ bulwark: { thornsPercentPerStackBonus: 0.2, maxStacksBonus: undefined } });
  });
  it('Sunder, Elusive and Siegebreaker overrides', () => {
    expect(stackGlyphOverrides(resolveSigilGlyphMods([g('sg-sunder-decay')], 'WARRIOR', null))).toEqual({ sunder: { decayPerSecond: 1.3 } });
    expect(stackGlyphOverrides(resolveSigilGlyphMods([g('sg-siege-decay', 'Common')], 'SENTINEL', null))).toEqual({ siegebreaker: { decayPerSecond: 1.7 } });
    expect(stackGlyphOverrides(resolveSigilGlyphMods([g('sg-elusive-buff', 'Epic')], 'SENTINEL', null))).toEqual({
      elusive: { attackSpeedPercentPerStackBonus: 2, attackPercentPerStackBonus: 3.2, stackLossPerHitOverride: 1 },
    });
  });
  it('Iron Bastion thorns come from the THORNS glyph, 0 otherwise', () => {
    expect(ironBastionThornsPercent(resolveSigilGlyphMods([g('sg-bastion-thorns', 'Epic')], 'WARRIOR', null))).toBe(8);
    expect(ironBastionThornsPercent(new Map())).toBe(0);
    expect(ironBastionThornsPercent(null)).toBe(0);
  });
  it('toSigilGlyphCombatMods: the shared empty value for no glyphs, else stack + thorns', () => {
    expect(toSigilGlyphCombatMods(new Map())).toBe(EMPTY_SIGIL_GLYPH_COMBAT_MODS);
    expect(EMPTY_SIGIL_GLYPH_COMBAT_MODS).toEqual({ stack: null, ironBastionThornsPercent: 0 });
    const c = toSigilGlyphCombatMods(resolveSigilGlyphMods([g('sg-bastion-thorns'), g('sg-sunder-decay')], 'WARRIOR', null));
    expect(c).toEqual({ stack: { sunder: { decayPerSecond: 1.3 } }, ironBastionThornsPercent: 10 });
  });
  it('glyphCombatMods feeds createStackCombat end to end (Bulwark Legendary: 8 stacks -> 9, 7 -> 8 thorns)', () => {
    const { combat } = glyphCombatMods([g('sg-bulwark-thorns')], 'WARRIOR', 'WARRIOR_TANK');
    const sc = createStackCombat(['BULWARK_OF_THORNS'], true, combat.stack, { playerClass: 'WARRIOR' });
    for (let i = 0; i < 10; i++) sc.blockReflect(0);
    expect(sc.snapshot().bulwarkStacks).toBe(9);
    expect(sc.selfModifiers().thornsPercent).toBe(72);
  });
});
