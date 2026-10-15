// H1 property: blank rows of an opponent's stat sheet (plan C, data-model.md §7). A random subset of a
// class sheet left blank -> finite stats, `defaulted` is exactly the blanks, `missingStats` exactly the
// required blanks, duel results finite, and a defender avoids swings iff Block + Miss is above 0.
import { describe, it, expect } from 'vitest';
import { forAll, arbOpponent, pick, int } from '../harness/arbitrary.js';
import { HARNESS_SPECS } from '../harness/specs.js';
import { opponentFighter, missingStats, REQUIRED_STATS, traceSummary } from './duel.js';
import { runDuel, DUEL_STAT_DEFAULTS } from '../engine/pvp/resolver.js';
import { EngineInputError } from '../engine/validate.js';
import { mulberry32, hashSeed } from '../engine/rng.js';

const REQ_KEYS = REQUIRED_STATS.map(([k]) => k);

// a sturdy, slow attacker so the defender is swung at many times without the duel ending early
const dummyAttacker = () => ({
  class: 'WARRIOR', spec: 'WARRIOR_DPS', level: 100, sigils: [], utility: null, ancient: null, conditions: {}, glyphMods: [],
  altarTier: 1, realm: 'base', source: 'sheet',
  stats: { totalHp: 1e9, totalAttack: 100, totalAttackSpeed: 1 },
});

describe('opponent blank rows property', () => {
  it('stats are finite; `defaulted` is exactly the blanks; `missingStats` exactly the required blanks', () => {
    forAll('opp-blank-rows', (rng) => arbOpponent(rng, { blankRate: rng() < 0.2 ? 0.9 : 0.35, blankRequired: true }), ({ opponent, blank, spec }) => {
      const f = opponentFighter(opponent);
      for (const [k, v] of Object.entries(f.stats)) {
        if (typeof v === 'number') expect(Number.isFinite(v), k).toBe(true);
      }
      const given = new Set(Object.keys(opponent.sheet.values));
      const expected = Object.keys(DUEL_STAT_DEFAULTS).filter((k) => !given.has(k)).sort();
      expect([...f.defaulted].sort()).toEqual(expected);
      for (const k of f.defaulted) expect(f.stats[k]).toBe(DUEL_STAT_DEFAULTS[k]);
      // every blank the generator left out of the class sheet is defaulted, or it is a row with no neutral value
      for (const k of blank) expect(k in DUEL_STAT_DEFAULTS || REQ_KEYS.includes(k) || !(k in f.stats), k).toBe(true);
      // present rows stay as entered
      for (const [k, v] of Object.entries(opponent.sheet.values)) expect(f.stats[k], k).toBe(v);

      const requiredBlank = REQUIRED_STATS.filter(([k]) => !(given.has(k) && opponent.sheet.values[k] > 0)).map(([, label]) => label);
      expect(missingStats(f)).toEqual(requiredBlank);
      expect(f.class).toBe(spec.cls);
    }, { runs: 300 });
  });

  it('a duel with a required row missing throws an EngineInputError naming it; with none missing it is finite', () => {
    forAll('opp-blank-duel', (rng) => arbOpponent(rng, { blankRate: 0.3, blankRequired: true }), ({ opponent }, rng) => {
      const f = opponentFighter(opponent);
      const me = dummyAttacker();
      const run = () => runDuel({ attacker: me, defender: f, rng: mulberry32(int(rng, 1, 1e9)) });
      if (missingStats(f).length) {
        let err = null;
        try { run(); } catch (e) { err = e; }
        expect(err).toBeInstanceOf(EngineInputError);
        expect(err.kind).toBe('defender');
      } else {
        const r = run();
        for (const v of [r.timeMs, r.attackerHpLeft, r.defenderHpLeft, r.attackerMaxHp, r.defenderMaxHp]) expect(Number.isFinite(v)).toBe(true);
      }
    }, { runs: 150 });
  });

  it('the defender avoids swings iff its Block + Miss is above 0', () => {
    forAll('opp-avoidance', (rng) => {
      const spec = pick(rng, HARNESS_SPECS);
      const { opponent } = arbOpponent(rng, { blankRate: 0.3, spec });
      // Block / Miss are either blank, 0, or well above 0, so "above 0" is observable in a few duels
      const v = { ...opponent.sheet.values };
      for (const k of ['totalBlockChance', 'totalMissChance']) {
        const r = rng();
        if (r < 0.4) delete v[k];
        else if (r < 0.6) v[k] = 0;
        else v[k] = 10 + rng() * 20;
      }
      opponent.sheet = { ...opponent.sheet, values: v };
      // keep the defender alive through the whole window, and its hits from ending the duel
      v.totalHp = 1e9;
      v.totalAttack = 1;
      return opponent;
    }, (opponent, rng) => {
      const f = opponentFighter(opponent);
      const avoids = Number(f.stats.totalBlockChance) + Number(f.stats.totalMissChance) > 0;
      let avoided = 0;
      let swings = 0;
      for (let i = 0; i < 4; i++) {
        const seed = hashSeed('avoid', i, int(rng, 1, 1e9));
        const r = runDuel({ attacker: dummyAttacker(), defender: f, rng: mulberry32(seed), log: true });
        const t = traceSummary(r.log);
        // swings the dummy made at the defender: those it landed plus those avoided
        avoided += t.attacker.avoided; // `avoided` = this side's swings the other side avoided
        swings += t.attacker.swings;
      }
      expect(swings).toBeGreaterThan(0);
      if (avoids) expect(avoided, 'block + miss above 0 but nothing was avoided').toBeGreaterThan(0);
      else expect(avoided, 'block + miss is 0 but a swing was avoided').toBe(0);
    }, { runs: 60 });
  });
});
