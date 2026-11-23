// @vitest-environment jsdom
// H3 property: the legality round-trip (redesign plan A.1 I1, C). The write path (patch, store) reproduces
// the candidate exactly. The per-spec round-trip cases live in legality.roundtrip.{0,1,2}.test.js.
import { describe, it, expect, beforeEach } from 'vitest';
import { forAll, arbCharacter, pick, int } from '../harness/arbitrary.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { createBuildSpace } from './space.js';
import { legalityOf } from './legality.js';
import { applyCandidate } from './patch.js';
import { normaliseCharacter } from '../model/index.js';
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
