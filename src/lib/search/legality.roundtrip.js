// Shared body of the legality round-trip property (redesign plan A.1 I1, C), split across the
// legality.roundtrip.*.test.js files so the 20 spec x realm cases run on parallel workers instead of one
// 100 s file that set the wall time of the whole suite. Same cases, same seeds, same assertions.
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, pick, chance } from '../harness/arbitrary.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { createBuildSpace, candidateOf, canonical } from './space.js';
import { legalityOf } from './legality.js';
import { applyCandidate } from './patch.js';
import { normaliseCharacter } from '../model/index.js';
import { stableStringify } from '../engine/metrics.js';
import { withLegalBaseline } from '../harness/baseline.js';

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

/** Define the round-trip cases of every `of`-th spec x realm pair, starting at `shard`. */
export function defineLegalityRoundTrip(shard, of) {
describe('legality round-trip property', () => {
  for (const [i, sr] of SPEC_REALMS.entries()) {
    if (i % of !== shard) continue;
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
}
