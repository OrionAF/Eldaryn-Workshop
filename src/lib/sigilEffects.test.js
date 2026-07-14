import { it, expect, describe } from 'vitest';
import { runSingle, mulberry32, DEFAULT_EFFECTS } from './simulation.js';
import { buildSigilEffects, expectedSigilActiveDps, makeSigilEffect, sigilSimSupport, SIGIL_MECHANICS, applySpecialGlyphsToMech, activeSpecialGlyphIds } from './sigilEffects.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
import { offensiveStats } from './dps.js';

// Deterministic all-or-nothing stats: no crit/double-hit noise, 1 swing/sec.
const baseStats = () => offensiveStats({ attack: 100, speed: 100, crit: 0, crit_mult: 150, double_hit: 0 });

function run(stats, effects, durationSeconds = 60) {
  return runSingle(stats, { durationSeconds, rng: mulberry32(1), effects: [...DEFAULT_EFFECTS, ...effects] });
}

const activeSigil = (id, active) => ({ id, name: id, rarity: 'Common', passive: null, active, notes: '' });

describe('generic nuke', () => {
  it('fires at t=1 (enemy-targeting 1s trigger delay) and then once per cooldown', () => {
    const def = activeSigil('nuke', { stats: [], durationSec: 0, cooldownSec: 8, damage: 500 });
    const result = run(baseStats(), [makeSigilEffect(def)], 60);
    // activations at 1, 9, ..., 57 -> 8 of them
    expect(result.damageByTag.sigil_nuke).toBe(8 * 500);
    expect(result.totalDamage).toBe(60 * 100 + 8 * 500);
  });

  it('deals nothing in the first second of combat (the in-game 59s-mark rule)', () => {
    const def = activeSigil('nuke', { stats: [], durationSec: 0, cooldownSec: 8, damage: 500 });
    // A 1s fight ends before the delayed first activation fires…
    expect(run(baseStats(), [makeSigilEffect(def)], 1).damageByTag.sigil_nuke).toBeUndefined();
    // …a 2s fight contains exactly the t=1 activation.
    expect(run(baseStats(), [makeSigilEffect(def)], 2).damageByTag.sigil_nuke).toBe(500);
  });

  it('a cooldown of 0 never activates (nothing to schedule)', () => {
    const def = activeSigil('idle', { stats: [], durationSec: 0, cooldownSec: 0, damage: 500 });
    const result = run(baseStats(), [makeSigilEffect(def)], 60);
    expect(result.damageByTag.sigil_idle).toBeUndefined();
  });
});

describe('timed buff', () => {
  it('attack% applies only to swings inside the duration window', () => {
    // +100% attack for 5s of every 10s: swings at t=0..4 doubled, t=5..9 normal.
    const def = activeSigil('buff', {
      stats: [{ statKey: 'attack_pct', value: 100 }],
      durationSec: 5,
      cooldownSec: 10,
      damage: 0,
    });
    const result = run(baseStats(), [makeSigilEffect(def)], 60);
    expect(result.totalDamage).toBe(30 * 200 + 30 * 100);
  });

  it('a crit buff with 100% crit makes every in-window swing crit', () => {
    const def = activeSigil('critbuff', {
      stats: [{ statKey: 'crit', value: 100 }],
      durationSec: 5,
      cooldownSec: 10,
      damage: 0,
    });
    const result = run(baseStats(), [makeSigilEffect(def)], 60);
    expect(result.crits).toBe(30); // exactly the swings inside buff windows
  });

  it('a speed buff adds swings via the engine speedBonus hook', () => {
    const def = activeSigil('haste', {
      stats: [{ statKey: 'speed', value: 100 }],
      durationSec: 60,
      cooldownSec: 60,
      damage: 0,
    });
    const result = run(baseStats(), [makeSigilEffect(def)], 60);
    expect(result.swings).toBe(120); // 200% speed for the whole fight
  });
});

describe('special mechanics', () => {
  it('tick-train deals its damage every interval across the duration', () => {
    // damage 100 every 2s for 6s, cd 10 -> 3 ticks per activation, 6 activations in 60s
    const def = activeSigil('train', { stats: [], durationSec: 6, cooldownSec: 10, damage: 100 });
    const result = run(baseStats(), [makeSigilEffect(def, { kind: 'tick-train', tickIntervalSec: 2 })], 60);
    expect(result.damageByTag.sigil_train).toBe(6 * 3 * 100);
  });

  it('dot deals up-front damage plus ticks over the duration', () => {
    // 100 up front + 10/s for 10s, cd 20 -> 3 activations (0,20,40) = 3*(100+100)
    const def = activeSigil('poison', { stats: [], durationSec: 10, cooldownSec: 20, damage: 100 });
    const result = run(baseStats(), [makeSigilEffect(def, { kind: 'dot', tickIntervalSec: 1, tickDamage: 10 })], 60);
    expect(result.damageByTag.sigil_poison).toBe(3 * (100 + 10 * 10));
  });

  it('stacking-dot ramps: each activation adds a stack (capped) and one shared ticker scales with stacks', () => {
    const def = activeSigil('bleed', { stats: [], durationSec: 0, cooldownSec: 10, damage: 0 });
    const mech = { kind: 'stacking-dot', tickIntervalSec: 2, maxStacks: 2, tickDamage: 10 };
    const result = run(baseStats(), [makeSigilEffect(def, mech)], 30);
    // Activations at 0, 10, 20 -> stacks 1, 2, capped at 2. Ticks at 2,4,...,28
    // (t<30); at the t=10 tie the activation event fires first (scheduled
    // earlier), so ticks t=2..8 see 1 stack (4 ticks) and t=10..28 see 2 (10 ticks).
    expect(result.damageByTag.sigil_bleed).toBe(4 * 10 + 10 * 2 * 10);
  });
});

describe('buildSigilEffects / sigilSimSupport', () => {
  const warrior = { class: 'Warrior' };

  it('builds effects only for equipped sigils with a supported active', () => {
    const preset = { sigilIds: ['blade-of-judgment', 'defense-stance', 'sunder-mark'] };
    const effects = buildSigilEffects(warrior, preset);
    // defense-stance is passive-only, sunder-mark is unsupported
    expect(effects.map((e) => e.id)).toEqual(['sigil_blade-of-judgment']);
  });

  it("resolves the character's entered numbers into the effect (values are per-character, not catalogue)", () => {
    const character = {
      class: 'Warrior',
      sigilValues: { 'blade-of-judgment': { passive: {}, active: {}, damage: 500, tickDamage: 0 } },
    };
    const preset = { sigilIds: ['blade-of-judgment'] };
    const result = run(baseStats(), buildSigilEffects(character, preset), 60);
    // cd 8 -> activations at 0, 8, ..., 56 = 8 nukes of the ENTERED damage
    expect(result.damageByTag['sigil_blade-of-judgment']).toBe(8 * 500);
  });

  it('entered tickDamage reaches DoT mechanics (hemorrhage stacking bleed)', () => {
    const character = {
      class: 'Warrior',
      sigilValues: { hemorrhage: { passive: {}, active: {}, damage: 100, tickDamage: 10 } },
    };
    const preset = { sigilIds: ['hemorrhage'] };
    const result = run(baseStats(), buildSigilEffects(character, preset), 20);
    // cd 10 -> activations at 0, 10 (2 x 100 up front). Ticks every 2s (t<20):
    // t=2..8 at 1 stack (4 ticks), t=10..18 at 2 stacks (5 ticks).
    expect(result.damageByTag.sigil_hemorrhage).toBe(2 * 100 + 4 * 10 + 5 * 2 * 10);
  });

  it('returns [] for no class or no sigils', () => {
    expect(buildSigilEffects({ class: null }, { sigilIds: ['x'] })).toEqual([]);
    expect(buildSigilEffects(warrior, { sigilIds: [] })).toEqual([]);
  });

  it('sigilSimSupport labels every catalogue sigil, and unsupported ones carry a reason', () => {
    for (const defs of Object.values(SIGILS_BY_CLASS)) {
      for (const def of defs) {
        const support = sigilSimSupport(def);
        expect(typeof support.summary).toBe('string');
        if (SIGIL_MECHANICS[def.id]?.kind === 'unsupported') {
          expect(support.simulated).toBe(false);
          expect(support.note).toBeTruthy();
        }
      }
    }
  });

  it('every SIGIL_MECHANICS key references a real catalogue sigil', () => {
    const allIds = new Set(Object.values(SIGILS_BY_CLASS).flat().map((d) => d.id));
    for (const id of Object.keys(SIGIL_MECHANICS)) expect(allIds.has(id)).toBe(true);
  });
});

describe('expectedSigilActiveDps (closed-form expectation of the active effects)', () => {
  it('nuke: exact activation count from the catalogue cooldown', () => {
    const character = {
      class: 'Warrior',
      sigilValues: { 'blade-of-judgment': { passive: {}, active: {}, damage: 500, tickDamage: 0 } },
    };
    const preset = { sigilIds: ['blade-of-judgment'] };
    // cd 8 -> activations at 0, 8, ..., 56 = 8 nukes
    expect(expectedSigilActiveDps(character, preset).flatDps).toBeCloseTo((8 * 500) / 60, 9);
  });

  it('stacking-dot with truncation: matches the hemorrhage tie-break math exactly', () => {
    const character = {
      class: 'Warrior',
      sigilValues: { hemorrhage: { passive: {}, active: {}, damage: 100, tickDamage: 10 } },
    };
    const preset = { sigilIds: ['hemorrhage'] };
    // Same schedule the buildSigilEffects test pins for a 20s fight:
    // 2 activations (0, 10), ticks t=2..8 at 1 stack, t=10..18 at 2 stacks.
    const expected = 2 * 100 + 4 * 10 + 5 * 2 * 10;
    expect(expectedSigilActiveDps(character, preset, 20).flatDps).toBeCloseTo(expected / 20, 9);
  });

  it('flat damage side agrees with the simulation for every damage mechanic (honesty check)', () => {
    const cases = [
      { cls: 'Warrior', id: 'blade-of-judgment' }, // nuke
      { cls: 'Warrior', id: 'arrowstorm' }, // tick-train
      { cls: 'Warrior', id: 'hemorrhage' }, // stacking-dot
      { cls: 'Sentinel', id: 'venom-wound' }, // dot
    ];
    for (const { cls, id } of cases) {
      const character = {
        class: cls,
        sigilValues: { [id]: { passive: {}, active: {}, damage: 137, tickDamage: 29 } },
      };
      const preset = { sigilIds: [id] };
      const result = run(baseStats(), buildSigilEffects(character, preset), 60);
      const { flatDps, segments } = expectedSigilActiveDps(character, preset, 60);
      expect(flatDps * 60).toBeCloseTo(result.damageByTag[`sigil_${id}`], 6);
      expect(segments).toEqual([]); // pure damage mechanics carry no buff term
    }
  });

  it('timed buff: reports the entered damage-side stats over the exact window fraction', () => {
    const character = {
      class: 'Warrior',
      sigilValues: {
        // warborn-fury declares attack_pct (damage-side) + penetration/dmg_reduction (inert vs a dummy)
        'warborn-fury': { passive: {}, active: { attack_pct: 30, penetration: 10, dmg_reduction: 5 }, damage: 0, tickDamage: 0 },
      },
    };
    const preset = { sigilIds: ['warborn-fury'] };
    const { flatDps, segments } = expectedSigilActiveDps(character, preset);
    expect(flatDps).toBe(0);
    // duration 5 / cd 15: windows [0,5) [15,20) [30,35) [45,50) = 20s of 60
    expect(segments).toEqual([{ statAdds: { attack_pct: 30 }, fraction: 20 / 60 }]);
  });

  it('timed buff windows are truncated exactly at the fight horizon', () => {
    const character = {
      class: 'Warrior',
      sigilValues: {
        'warborn-fury': { passive: {}, active: { attack_pct: 30 }, damage: 0, tickDamage: 0 },
      },
    };
    const preset = { sigilIds: ['warborn-fury'] };
    // duration 5 / cd 15 over a 17s fight: [0,5) in full + [15,17) cut short.
    const { segments } = expectedSigilActiveDps(character, preset, 17);
    expect(segments).toEqual([{ statAdds: { attack_pct: 30 }, fraction: 7 / 17 }]);
  });

  it('contributes nothing for unsupported, passive-only, or all-zero sigils', () => {
    const character = { class: 'Warrior', sigilValues: { 'sunder-mark': { passive: {}, active: {}, damage: 999, tickDamage: 0 } } };
    // sunder-mark is 'unsupported'; defense-stance is passive-only; cataclysm has no entered numbers
    const preset = { sigilIds: ['sunder-mark', 'defense-stance', 'cataclysm'] };
    expect(expectedSigilActiveDps(character, preset)).toEqual({ flatDps: 0, segments: [] });
  });
});

describe('special mount glyphs (Ember Curse: +1 max bleed stack, +10% damage per stack)', () => {
  const emberValues = { 'ember-curse': { passive: {}, active: {}, damage: 100, tickDamage: 10 } };
  const glyphEntry = (equipped) => ({ id: 'g1', tier: 'major', rarity: 'Epic', statKey: 'attack_pct', value: 0, equipped, special: 'ember-curse-glyph' });
  const character = (equipped) => ({ class: 'Sentinel', sigilValues: emberValues, glyphs: { entries: [glyphEntry(equipped)] } });
  const preset = { sigilIds: ['ember-curse'] };

  it('applySpecialGlyphsToMech adjusts only its target sigil, and only when the glyph id is present', () => {
    const mech = { kind: 'stacking-dot', tickIntervalSec: 2, maxStacks: 8, tickDamage: 10 };
    const glyphed = applySpecialGlyphsToMech('ember-curse', mech, ['ember-curse-glyph']);
    expect(glyphed.maxStacks).toBe(9);
    expect(glyphed.tickDamage).toBeCloseTo(11, 9);
    expect(applySpecialGlyphsToMech('hemorrhage', mech, ['ember-curse-glyph'])).toBe(mech);
    expect(applySpecialGlyphsToMech('ember-curse', mech, [])).toBe(mech);
  });

  it('activeSpecialGlyphIds returns only EQUIPPED special glyph ids', () => {
    expect(activeSpecialGlyphIds(character(true))).toEqual(['ember-curse-glyph']);
    expect(activeSpecialGlyphIds(character(false))).toEqual([]);
    expect(activeSpecialGlyphIds({ class: 'Sentinel' })).toEqual([]);
  });

  it('an unequipped glyph changes nothing; an equipped one boosts only the per-stack tick term', () => {
    const base = expectedSigilActiveDps({ class: 'Sentinel', sigilValues: emberValues }, preset, 60).flatDps;
    expect(expectedSigilActiveDps(character(false), preset, 60).flatDps).toBeCloseTo(base, 9);
    // cd 10 -> 6 activations (t=1..51); stacks max out at 6 in 60s, below
    // BOTH caps, so only the +10% per-stack damage moves the number.
    const upfrontDps = (6 * 100) / 60;
    const glyphed = expectedSigilActiveDps(character(true), preset, 60).flatDps;
    expect(glyphed - upfrontDps).toBeCloseTo((base - upfrontDps) * 1.1, 9);
  });

  it('over a cap-binding fight the closed form pins maxStacks 9 / tick 11 and agrees with the simulation', () => {
    const c = character(true);
    // 120s, cd 10: activations t=1,11,...,111; shared ticker t=3,5,...,119.
    let tickTotal = 0;
    for (let t = 3; t < 120 - 1e-9; t += 2) {
      tickTotal += Math.min(Math.floor((t - 1) / 10) + 1, 9) * 11; // 9th stack binds from t=91
    }
    const expected = 12 * 100 + tickTotal;
    const { flatDps } = expectedSigilActiveDps(c, preset, 120);
    expect(flatDps * 120).toBeCloseTo(expected, 6);
    const result = run(baseStats(), buildSigilEffects(c, preset), 120);
    expect(result.damageByTag['sigil_ember-curse']).toBeCloseTo(expected, 6);
  });
});
