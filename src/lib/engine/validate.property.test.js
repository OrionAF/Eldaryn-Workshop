// H1 property: the NaN guard (plan I9). Injecting NaN, undefined or +-Infinity into one entity-read key
// makes simulatePve and runDuel throw an EngineInputError that names the entity key; keys the client
// defaults (`orZero`, the duel neutrals) take their default instead. No metric ever returns NaN.
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, pick, int } from '../harness/arbitrary.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { buildFighter } from '../build/fighter.js';
import { EngineInputError } from './validate.js';
import { createPlayerEntity, createMobEntity } from './core/entity.js';
import { simulatePve, trainingDummy, PVE_PLAYER_KEYS } from './pve/fight.js';
import { runDuel, fighterDuelArgs, DUEL_STAT_DEFAULTS } from './pvp/resolver.js';
import { mulberry32 } from './rng.js';
import { dpsVsDummy, ttkVs, survival, pvpWinRate } from './metrics.js';
import { chapterMobs } from './pve/enemies.js';

const BAD = [NaN, undefined, Infinity, -Infinity];
const label = (v) => (v === undefined ? 'undefined' : String(v));

// stat key -> the entity fields it feeds, read off createPlayerEntity itself so the table cannot drift
const statToEntity = (() => {
  const probe = {};
  const names = [
    'totalHp', 'totalAttack', 'totalAttackSpeed', 'totalDoubleHit', 'totalCritChance', 'totalCritDamage', 'totalLifesteal',
    'totalHpRegen', 'totalDamageReduction', 'totalBlockChance', 'totalMissChance', 'totalBlindChance', 'totalParalyzeChance',
    'totalPenetration', 'totalDisruptionChance', 'totalPvpAttack', 'totalPvpDefense', 'totalSpellDamage', 'totalSpellResist',
    'totalSpellCritChance', 'totalSpellVamp',
  ];
  names.forEach((n, i) => { probe[n] = i + 1; });
  const entity = createPlayerEntity(probe);
  const map = {};
  names.forEach((n, i) => { map[n] = Object.keys(entity).filter((k) => entity[k] === i + 1); });
  return map;
})();
// the stat keys createPlayerEntity defaults when absent (orZero)
const ZERO_DEFAULT = new Set(Object.keys(statToEntity).filter((k) => createPlayerEntity({ [k]: undefined, totalHp: 1 })[statToEntity[k][0]] === 0));

const mobToEntity = (() => {
  const probe = { hp: 1, attack: 2, attackSpeed: 3, damageReduction: 4, blockChance: 5, penetration: 6 };
  const entity = createMobEntity(probe);
  return Object.fromEntries(Object.keys(probe).map((k) => [k, Object.keys(entity).filter((e) => entity[e] === probe[k])]));
})();

const rngOf = () => mulberry32(7);
const fighterOf = (character, sr) => buildFighter(character, character.activePresetId, { realm: sr.realm });
const withStat = (f, key, value) => {
  const stats = { ...f.stats };
  if (value === undefined) delete stats[key];
  else stats[key] = value;
  return { ...f, stats };
};

function expectInputError(fn, keys) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  expect(err, 'expected an EngineInputError').toBeInstanceOf(EngineInputError);
  expect(keys, `key ${err.key} of: ${err.message}`).toContain(err.key);
}

describe('engine input boundary property', () => {
  it('table sanity: every entity key a stat feeds is read by the engine', () => {
    expect(statToEntity.totalHp).toContain('maxHp');
    expect(statToEntity.totalCritDamage).toEqual(['critDamage']);
    expect([...ZERO_DEFAULT].sort()).toEqual(['totalDisruptionChance', 'totalSpellCritChance', 'totalSpellDamage', 'totalSpellResist', 'totalSpellVamp']);
    expect(PVE_PLAYER_KEYS).toContain('critDamage');
  });

  it('simulatePve: a bad player stat the tick reads throws naming the entity key; a defaulted or unread one does not', () => {
    forAll('validate-pve-player', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      return { stat: pick(rng, Object.keys(statToEntity)), bad: pick(rng, BAD), sr, character: arbCharacter(rng, { spec: sr }) };
    }, ({ sr, character, stat, bad }) => {
      const f = withStat(fighterOf(character, sr), stat, bad);
      const run = () => simulatePve({ fighter: f, enemy: trainingDummy(), maxMs: 3000, rng: rngOf() });
      const readByPve = statToEntity[stat].some((k) => PVE_PLAYER_KEYS.includes(k));
      // PVP Attack / Defense are not read by the PVE tick; a defaulted stat takes its default
      if (!readByPve || (bad === undefined && ZERO_DEFAULT.has(stat))) expect(run).not.toThrow();
      else expectInputError(run, statToEntity[stat]);
    }, { runs: 150 });
  });

  it('simulatePve: a bad mob field throws naming the entity key', () => {
    forAll('validate-pve-mob', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      return { sr, character: arbCharacter(rng, { spec: sr }), field: pick(rng, Object.keys(mobToEntity)), bad: pick(rng, BAD) };
    }, ({ sr, character, field, bad }) => {
      const f = fighterOf(character, sr);
      const mob = { ...trainingDummy(1e6), attack: 100, attackSpeed: 1, damageReduction: 0, blockChance: 0, penetration: 0 };
      if (bad === undefined) delete mob[field]; else mob[field] = bad;
      const run = () => simulatePve({ fighter: f, enemy: mob, maxMs: 3000, rng: rngOf() });
      const defaulted = bad === undefined && ['damageReduction', 'blockChance', 'penetration'].includes(field);
      if (defaulted) expect(run).not.toThrow();
      else expectInputError(run, mobToEntity[field]);
    }, { runs: 100 });
  });

  it('runDuel: a bad stat on either side throws naming that side and the entity key; the duel neutrals are filled in', () => {
    forAll('validate-duel', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      const a = arbCharacter(rng, { spec: sr });
      const b = arbCharacter(rng);
      return { sr, a, b, side: pick(rng, ['attacker', 'defender']), stat: pick(rng, Object.keys(statToEntity)), bad: pick(rng, BAD) };
    }, ({ sr, a, b, side, stat, bad }) => {
      const mine = withStat(fighterOf(a, sr), stat, bad);
      const other = fighterOf(b, { realm: 'base' });
      const [attacker, defender] = side === 'attacker' ? [mine, other] : [other, mine];
      const run = () => runDuel({ attacker, defender, rng: rngOf() });
      // HP, Attack and Attack Speed have no neutral value; an absent neutral stat is filled in, a present bad one is not
      const filled = bad === undefined && (stat in DUEL_STAT_DEFAULTS || stat === 'totalDisruptionChance');
      if (filled) {
        const r = run();
        expect(Number.isFinite(r.timeMs)).toBe(true);
      } else {
        let err = null;
        try { run(); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(EngineInputError);
        expect(err.kind).toBe(side);
        expect(statToEntity[stat]).toContain(err.key);
      }
    }, { runs: 150 });
  });

  it('fighterDuelArgs completes the sheet: all neutral keys are finite numbers whatever was absent', () => {
    forAll('validate-duel-complete', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      const f = fighterOf(arbCharacter(rng, { spec: sr }), sr);
      const stats = { ...f.stats };
      for (const k of Object.keys(DUEL_STAT_DEFAULTS)) if (rng() < 0.4) delete stats[k];
      return { ...f, stats };
    }, (f) => {
      const { stats } = fighterDuelArgs(f);
      for (const k of Object.keys(DUEL_STAT_DEFAULTS)) expect(Number.isFinite(stats[k]), k).toBe(true);
    }, { runs: 80 });
  });

  it('no metric ever returns NaN', () => {
    const noNaN = (v, path = 'result') => {
      if (typeof v === 'number') expect(Number.isNaN(v), path).toBe(false);
      else if (Array.isArray(v)) v.forEach((x, i) => noNaN(x, `${path}[${i}]`));
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) noNaN(x, `${path}.${k}`);
    };
    const mob = chapterMobs(1, 1);
    forAll('validate-metrics', (rng) => {
      const sr = pick(rng, SPEC_REALMS);
      return { sr, a: arbCharacter(rng, { spec: sr }), b: arbCharacter(rng), seed: int(rng, 1, 1e6) };
    }, ({ sr, a, b, seed }) => {
      const fa = fighterOf(a, sr);
      const fb = fighterOf(b, { realm: 'base' });
      const o = { n: 3, seed, cache: false };
      noNaN(dpsVsDummy(fa, { ...o, seconds: 5 }), 'dps');
      noNaN(ttkVs(fa, mob, { ...o, maxMs: 4000 }), 'ttk');
      noNaN(survival(fa, mob, { ...o, seconds: 4 }), 'survival');
      noNaN(pvpWinRate(fa, fb, o), 'pvp');
    }, { runs: 40 });
  });
});

