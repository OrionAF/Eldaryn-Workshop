// H3 property: the legality round-trip (redesign plan A.1 I1, C). Every arm of every block of a random
// character passes the oracle, and the write path (patch, store) reproduces the candidate exactly.
import { describe, it, expect, beforeEach } from 'vitest';
import { forAll, arbCharacter, pick, int, chance } from '../harness/arbitrary.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { createBuildSpace, candidateOf, canonical } from './space.js';
import { legalityOf } from './legality.js';
import { applyCandidate } from './patch.js';
import { normaliseCharacter } from '../model/index.js';
import { stableStringify } from '../engine/metrics.js';
import { withLegalBaseline } from '../harness/baseline.js';
import { rosterStore } from '../rosterStore.svelte.js';

/** The arms of a space one step from the start, plus a second hop from a few of them. */
function arms(space, rng) {
  const out = [];
  for (const b of space.blocks) {
    const first = b.domain(space.start);
    for (const arm of first) out.push({ block: b.id, arm });
    for (const arm of first.slice(0, 1)) {
      for (const b2 of space.blocks) {
        const second = b2.domain(arm);
        if (second.length) out.push({ block: `${b.id}>${b2.id}`, arm: pick(rng, second) });
      }
    }
  }
  return out;
}

describe('legality round-trip property', () => {
  for (const sr of SPEC_REALMS) {
    it(`${sr.label} / ${sr.realm}: every arm passes legalityOf, and applyCandidate -> normalise -> candidateOf is the identity`, () => {
      let checked = 0;
      let baselines = 0;
      forAll(`legality-${sr.label}-${sr.realm}`, (rng) => withLegalBaseline(arbCharacter(rng, { spec: sr })), (character, rng) => {
        const mode = chance(rng, 0.5) ? 'pve' : 'pvp';
        const space = createBuildSpace(character, character.activePresetId, { realm: sr.realm, mode });
        // a baseline that breaks a rule is a setup blocker for the driver, not an arm to check
        if (!legalityOf(character, space.presetId, space.start).ok) return;
        baselines += 1;
        for (const { block, arm } of arms(space, rng)) {
          const r = legalityOf(character, space.presetId, arm);
          if (!r.ok) throw new Error(`${block}: ${JSON.stringify(r.violations)}\narm ${JSON.stringify(arm)}`);
          const written = normaliseCharacter(applyCandidate(character, space.presetId, arm));
          const back = candidateOf(written, space.presetId);
          expect(stableStringify(back), `${block} round trip`).toBe(stableStringify(canonical(written, space.presetId, arm)));
          checked += 1;
        }
      }, { runs: 3 });
      expect(baselines, 'no generated baseline was legal').toBeGreaterThan(0);
      expect(checked, 'no arm was checked').toBeGreaterThan(0);
    });
  }
});

describe('Apply through the store writes the same character', () => {
  beforeEach(() => localStorage.clear());

  it('store.applyCandidate equals normalise(patch) for random arms of random characters', () => {
    let applied = 0;
    forAll('legality-store', (rng) => withLegalBaseline(arbCharacter(rng, { spec: pick(rng, SPEC_REALMS) })), (character, rng) => {
      const space = createBuildSpace(character, character.activePresetId, { realm: 'base' });
      if (!legalityOf(character, space.presetId, space.start).ok) return;
      const pool = arms(space, rng);
      if (!pool.length) return;
      const { arm } = pool[int(rng, 0, pool.length - 1)];
      rosterStore.importFromJson(JSON.stringify({ schemaVersion: 2, characters: [character], currentId: character.id }));
      const expected = normaliseCharacter(applyCandidate(character, space.presetId, arm));
      const r = rosterStore.applyCandidate(space.presetId, arm);
      expect(r, JSON.stringify(r.violations)).toEqual({ ok: true, violations: [] });
      expect(JSON.parse(JSON.stringify(rosterStore.current))).toEqual(JSON.parse(JSON.stringify(expected)));
      applied += 1;
    }, { runs: 25 });
    expect(applied).toBeGreaterThan(0);
  });
});
