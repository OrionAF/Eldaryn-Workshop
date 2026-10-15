// H1 property: finite fighters. For every spec x realm, buildFighter yields stats the engine can read
// (plan C, invariant I9): finite, chances inside their combat ceiling, positive HP and attack speed, and
// engine inputs that can be fingerprinted (engineKey).
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, chance } from '../harness/arbitrary.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { buildFighter } from './fighter.js';
import { ceilingFor } from '../engine/core/caps.js';
import { preparePveFighter } from '../engine/pve/fight.js';
import { engineKey } from '../search/effect.js';
import { DEFAULT_CONDITION, SIGIL_CONDITIONS_LEVEL } from '../model/sigils.js';

const EPS = 1e-9;

describe('buildFighter property', () => {
  for (const sr of SPEC_REALMS) {
    it(`${sr.label} / ${sr.realm}: stats are finite, chances inside their ceiling, HP and Attack Speed above 0`, () => {
      let ceilings = 0;
      forAll(`fighter-${sr.label}-${sr.realm}`, (rng) => arbCharacter(rng, { spec: sr }), (character) => {
        const f = buildFighter(character, character.activePresetId, { realm: sr.realm });
        expect(f.realm).toBe(sr.realm);
        for (const [k, v] of Object.entries(f.stats)) {
          if (typeof v !== 'number') continue;
          expect(Number.isFinite(v), `${k} = ${v}`).toBe(true);
          expect(v, k).toBeGreaterThanOrEqual(-EPS);
          const ceiling = ceilingFor(k);
          if (ceiling != null) ceilings += 1;
          if (ceiling != null) expect(v, `${k} above its ceiling ${ceiling}`).toBeLessThanOrEqual(ceiling + EPS);
        }
        expect(f.stats.totalHp).toBeGreaterThan(0);
        expect(f.stats.totalAttack).toBeGreaterThan(0);
        expect(f.stats.totalAttackSpeed).toBeGreaterThan(0);

        // the engine inputs fingerprint, and the key is stable for the same fighter
        const prepared = preparePveFighter(f);
        for (const mode of ['pve', 'pvp']) {
          expect(() => engineKey(f, mode)).not.toThrow();
          expect(engineKey(f, mode)).toBe(engineKey(structuredClone(f), mode));
        }
        expect(Number.isFinite(prepared.fresh().player.hp)).toBe(true);
      }, { runs: 12 });
      expect(ceilings, 'no ceiling was checked').toBeGreaterThan(0);
    });
  }

  it('below the conditions level every equipped sigil fires ON_COOLDOWN; a sigil never appears twice', () => {
    forAll('fighter-conditions', (rng) => arbCharacter(rng, { spec: SPEC_REALMS[Math.floor(rng() * SPEC_REALMS.length)] }), (character, rng) => {
      const f = buildFighter(character, character.activePresetId, { realm: chance(rng, 0.5) ? 'base' : 'oblivion' });
      const species = [...f.sigils, f.utility, f.ancient].filter(Boolean).map((s) => s.species);
      expect(new Set(species).size).toBe(species.length);
      expect(Object.keys(f.conditions).sort()).toEqual([...species].sort());
      if (character.level < SIGIL_CONDITIONS_LEVEL) for (const c of Object.values(f.conditions)) expect(c).toBe(DEFAULT_CONDITION);
    }, { runs: 80 });
  });
});
