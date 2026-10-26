// The 2.8.2 client changes (Game/updates-2.8.2.md): PVP HP level curve, late-fight double damage,
// the 25/70 Spell Resist caps and the Mythic+ glyph quality bands above 1.
import { describe, it, expect } from 'vitest';
import { capConfig, applySoftCap, rawFromSoftCapped } from './core/caps.js';
import { calculateTotalStats } from './pipeline/totals.js';
import { initSpellRuntimes, processSpellsTick } from './core/spells.js';
import { getSigilSpellScaled } from './sources/sigilScale.js';
import { sigilBySpecies } from '../game/sigils.js';
import {
  LEGACY_PVP_BALANCE, DEFAULT_PVP_BALANCE, FORTRESS_PVP_BALANCE, pvpFightLevel, pvpHpMultiplierFor,
  pvpLateFightDamageMult, rampDamage, rampDebuffTick,
} from './pvp/balance.js';
import { applyPvpHpBuff, applyPvpHpBuffPair } from './pvp/hpBuff.js';
import { simulateArenaPvP, completeDuelStats, runDuel } from './pvp/resolver.js';
import { glyphSecondaryValue, glyphSecondaryQuality, glyphQualityBand, normaliseGlyph } from '../model/glyphs.js';

const never = () => 0.99;
const config = (species, level = 1) => {
  const d = sigilBySpecies(species);
  return { species, name: d.name, spell: { ...getSigilSpellScaled(d.spell, level, d.spellType), spellType: d.spellType } };
};

describe('2.8.2 PVP HP level curve (§1)', () => {
  const hp = (level) => pvpHpMultiplierFor(DEFAULT_PVP_BALANCE, level);
  it('hits the curve points, interpolates linearly and clamps to the ends', () => {
    expect([50, 60, 70, 95].map(hp)).toEqual([8, 16, 20, 24]);
    expect(hp(55)).toBe(12);
    expect(hp(85)).toBeCloseTo(22.4, 12);
    expect(hp(1)).toBe(8);
    expect(hp(100)).toBe(24);
    expect(hp(undefined)).toBe(24);
  });
  it('LEGACY is flat x8 and FORTRESS flat x1 at any level', () => {
    for (const l of [1, 50, 95, undefined]) {
      expect(pvpHpMultiplierFor(LEGACY_PVP_BALANCE, l)).toBe(8);
      expect(pvpHpMultiplierFor(FORTRESS_PVP_BALANCE, l)).toBe(1);
    }
  });
  it('both sides take one multiplier at the attacker\'s level, else the defender\'s', () => {
    expect(pvpFightLevel(60, 95)).toBe(60);
    expect(pvpFightLevel(null, 95)).toBe(95);
    const a = applyPvpHpBuff({ totalHp: 1000 }, hp(95));
    const [x, y] = applyPvpHpBuffPair(a, { totalHp: 500 }, 60, 95, DEFAULT_PVP_BALANCE);
    expect([x.totalHp, y.totalHp]).toEqual([16000, 8000]);
    expect(x.pvpBaseHp).toBe(1000);
  });
  it('runDuel buffs both fighters at the attacker\'s level', () => {
    const f = (level) => ({ class: 'WARRIOR', spec: null, sigils: [], level, stats: { totalHp: 1000, totalAttack: 10, totalAttackSpeed: 1 } });
    const r = runDuel({ attacker: f(60), defender: f(95), rng: never });
    expect([r.attackerMaxHp, r.defenderMaxHp]).toEqual([16000, 16000]);
  });
});

describe('2.8.2 late-fight double damage (§2)', () => {
  const late = DEFAULT_PVP_BALANCE.lateFightDamage;
  it('is 1 up to and including 40 s after the opening, then 2', () => {
    expect(late).toMatchObject({ startMs: 40000, multiplier: 2, rampMs: 0 });
    expect(pvpLateFightDamageMult(late, 40000)).toBe(1);
    expect(pvpLateFightDamageMult(late, 40001)).toBe(2);
    expect(pvpLateFightDamageMult(null, 1e6)).toBe(1);
  });
  it('rampDamage rounds with a floor of 1 and leaves zero or mult 1 alone', () => {
    expect(rampDamage(7, 2)).toBe(14);
    expect(rampDamage(0.3, 2)).toBe(1);
    expect(rampDamage(0, 2)).toBe(0);
    expect(rampDamage(7.4, 1)).toBe(7.4);
  });
  it('rampDebuffTick ramps damage ticks and moves targetHpDelta by the difference', () => {
    const r = { targetHpDelta: -15, events: [{ type: 'debuff_tick', value: 10, damagePerTick: 10 }, { type: 'debuff_tick', value: 5, damagePerTick: 5 }, { type: 'debuff_expire' }] };
    const out = rampDebuffTick(r, 2);
    expect(out.targetHpDelta).toBe(-30);
    expect(out.events.map((e) => e.value)).toEqual([20, 10, undefined]);
    expect(rampDebuffTick(r, 1)).toBe(r);
  });
  it('arena hits double after 40 s under DEFAULT and stay flat under LEGACY', () => {
    const s = completeDuelStats({ totalHp: 1e8, totalAttack: 100, totalAttackSpeed: 1 }).stats;
    const hits = (balance) => simulateArenaPvP(s, s, [], [], null, null, null, null, null, null, null, null, null, null, { rng: never, log: true, balance })
      .ticks.filter((e) => e.type === 'attacker_hit');
    const sizes = (rows, pred) => new Set(rows.filter((e) => pred(e.timestamp)).map((e) => e.damage));
    const early = (t) => t < 39000;
    const lateT = (t) => t > 41000;
    const d = hits(DEFAULT_PVP_BALANCE);
    const [base] = sizes(d, early);
    expect(sizes(d, early)).toEqual(new Set([base]));
    expect(sizes(d, lateT)).toEqual(new Set([base * 2]));
    expect(sizes(hits(LEGACY_PVP_BALANCE), lateT)).toEqual(new Set([base]));
  });
});

describe('2.8.2 Spell Resist caps 25/70 (§3)', () => {
  it('soft boundary, curve example, inverse and asymptotic hard cap', () => {
    const cfg = capConfig('SPELL_RESIST');
    expect(cfg).toEqual({ soft: 25, hard: 70 });
    expect(applySoftCap(25, cfg)).toBe(25);
    expect(applySoftCap(100, cfg)).toBeCloseTo(56.6115702479, 9); // 25 + 45 * (1 - (90/165)^2)
    expect(rawFromSoftCapped(applySoftCap(100, cfg), cfg)).toBeCloseTo(100, 8);
    expect(rawFromSoftCapped(70, cfg)).toBe(Infinity);
    expect(applySoftCap(1e10, cfg)).toBeCloseTo(70, 6);
    const result = calculateTotalStats(
      { attack: 1, hp: 100, attackSpeed: 1, critChance: 0, critDamage: 1.5 },
      { WEAPON: { primaryStats: { attack: 0, hp: 0 }, secondaryStats: [{ type: 'SPELL_RESIST', value: 100 }] } },
    );
    expect(result.totalSpellResist).toBe(56.6);
  });
  it('spell mitigation clamps at 70', () => {
    const rt = initSpellRuntimes([config('SOUL_SPIKE')]); rt[0].cooldownRemaining = 0;
    const r = processSpellsTick(rt, { maxHp: 1000, dtMs: 0, timestamp: 0, attack: 1000, targetSpellResist: 100 }, never);
    expect(r.targetHpDelta).toBe(-Math.floor(450 * (1 - 0.7)));
  });
});

describe('2.8.2 Mythic+ glyph quality 1.01-1.20 (§4)', () => {
  it('Mythic and above roll in [1.01, 1.2]; free rarities are unchanged', () => {
    expect(glyphQualityBand('Mythic')).toEqual([1.01, 1.2]);
    expect(glyphQualityBand('Legendary')[1]).toBeLessThanOrEqual(1);
  });
  it('quality above 1 extends the range past max, at least one display step', () => {
    // critChance 0.6-5.0 at one decimal
    expect(glyphSecondaryValue({ stat: 'critChance', quality: 1.2 })).toBe(5.9);
    expect(glyphSecondaryValue({ stat: 'critChance', quality: 1.001 })).toBe(5.1);
    expect(glyphSecondaryValue({ stat: 'critChance', quality: 9 })).toBe(5.9);
    expect(glyphSecondaryQuality('critChance', 5.9)).toBeCloseTo(1.2, 10);
  });
  it('normalise keeps a pre-2.8.2 Mythic glyph at quality 1 and clamps to 1.2', () => {
    const g = (quality) => normaliseGlyph({ glyphType: 'g-cataclysm', secondary: { stat: 'critChance', quality } }).secondary.quality;
    expect(g(1)).toBe(1);
    expect(g(1.15)).toBe(1.15);
    expect(g(2)).toBe(1.2);
  });
});
