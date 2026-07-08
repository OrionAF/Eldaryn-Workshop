import { it, expect, describe } from 'vitest';
import { runSingle, mulberry32, DEFAULT_EFFECTS } from './simulation.js';
import { buildSigilEffects, expectedSigilActiveDps, makeSigilEffect, sigilSimSupport, SIGIL_MECHANICS } from './sigilEffects.js';
import { SIGILS_BY_CLASS } from './sigilsData.js';
import { offensiveStats } from './dps.js';

// Deterministic all-or-nothing stats: no crit/double-hit noise, 1 swing/sec.
const baseStats = () => offensiveStats({ attack: 100, speed: 100, crit: 0, crit_mult: 150, double_hit: 0 });

function run(stats, effects, durationSeconds = 60) {
  return runSingle(stats, { durationSeconds, rng: mulberry32(1), effects: [...DEFAULT_EFFECTS, ...effects] });
}

const activeSigil = (id, active) => ({ id, name: id, rarity: 'Common', passive: null, active, notes: '' });

describe('generic nuke', () => {
  it('fires at t=0 and then once per cooldown (cooldown starts at activation)', () => {
    const def = activeSigil('nuke', { stats: [], durationSec: 0, cooldownSec: 8, damage: 500 });
    const result = run(baseStats(), [makeSigilEffect(def)], 60);
    // activations at 0, 8, ..., 56 -> 8 of them
    expect(result.damageByTag.sigil_nuke).toBe(8 * 500);
    expect(result.totalDamage).toBe(60 * 100 + 8 * 500);
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
      const { flatDps, buffs } = expectedSigilActiveDps(character, preset, 60);
      expect(flatDps * 60).toBeCloseTo(result.damageByTag[`sigil_${id}`], 6);
      expect(buffs).toEqual([]); // pure damage mechanics carry no buff term
    }
  });

  it('timed buff: reports the entered damage-side stats with duration/cooldown uptime', () => {
    const character = {
      class: 'Warrior',
      sigilValues: {
        // warborn-fury declares attack_pct (damage-side) + penetration/dmg_reduction (inert vs a dummy)
        'warborn-fury': { passive: {}, active: { attack_pct: 30, penetration: 10, dmg_reduction: 5 }, damage: 0, tickDamage: 0 },
      },
    };
    const preset = { sigilIds: ['warborn-fury'] };
    const { flatDps, buffs } = expectedSigilActiveDps(character, preset);
    expect(flatDps).toBe(0);
    // duration 5 / cd 15
    expect(buffs).toEqual([{ statAdds: { attack_pct: 30 }, uptime: 5 / 15 }]);
  });

  it('contributes nothing for unsupported, passive-only, or all-zero sigils', () => {
    const character = { class: 'Warrior', sigilValues: { 'sunder-mark': { passive: {}, active: {}, damage: 999, tickDamage: 0 } } };
    // sunder-mark is 'unsupported'; defense-stance is passive-only; cataclysm has no entered numbers
    const preset = { sigilIds: ['sunder-mark', 'defense-stance', 'cataclysm'] };
    expect(expectedSigilActiveDps(character, preset)).toEqual({ flatDps: 0, buffs: [] });
  });
});
