// H3 property: no inert change in any optimiser result (redesign plan A.1 I2 and I3, C). Quick-effort runs
// on random characters against the dummy, a chapter, a World Boss and a cloned PVP opponent. Checked
// independently of result.js's own assertions (strict mode), straight from the returned rows.
import { describe, it, expect } from 'vitest';
import { forAll, arbCharacter, pick, sample, int } from '../harness/arbitrary.js';
import { HARNESS_SPECS } from '../harness/specs.js';
import { withLegalBaseline } from '../harness/baseline.js';
import { optimize } from './search.js';
import { SPEC_REALMS } from '../harness/specs.js';
import { BLOCKS, createBuildSpace } from './space.js';
import { revert, addChange, changesOf, canonicalise, candidateEngineKey } from './effect.js';
import { legalityOf } from './legality.js';
import { cloneAsOpponent } from '../features/duel.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { hashSeed } from '../engine/rng.js';

const TARGETS = {
  dummy: { target: { kind: 'dummy', seconds: 8 }, effort: { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 } },
  // a chapter target now scores win rate only, which seldom resolves a row at quick effort; a custom mob exercises a PVE mob fight with dps
  custom: { target: { kind: 'custom', mob: { hp: 3e6, attack: 1, attackSpeed: 1 }, seconds: 30 }, objective: { kind: 'dps' }, effort: { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 } },
  worldBoss: { target: { kind: 'worldBoss', affinity: 'NONE' }, effort: { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 } },
  pvp: {
    target: { kind: 'pvp', opponentIds: ['opp-a'], seats: 'attacker' },
    objective: { kind: 'pvp-winrate' },
    effort: { level: 'quick', n0: 8, maxN: 16, randomStarts: 0 },
  },
};
// the pvp space stays small: each fight is a duel
const EXTRA = { pvp: ['sigils', 'utility'] };

/** Rows' changes are checked against the baseline the run itself used (`result.baseline.candidate`). */
function checkResult(character, presetId, result, kind, mode) {
  expect(result.status, `${kind}: ${result.error ?? JSON.stringify(result.baselineViolations)}`).toBe('done');
  const space = createBuildSpace(character, presetId, { realm: result.target.realm ?? 'base', mode });
  const B = result.baseline.candidate;
  let changes = 0;
  for (const row of result.rows) {
    expect(row.changes.length, `${kind}: row ${row.rank} has no change`).toBeGreaterThanOrEqual(1);
    expect(legalityOf(character, presetId, row.candidate).ok, `${kind}: row ${row.rank} is illegal`).toBe(true);
    const bundled = new Set(row.changes.flatMap((c) => c.bundle ?? []));
    const ek = candidateEngineKey(space, row.candidate, mode);
    for (const c of row.changes) {
      changes += 1;
      const Y = space.legalise(revert(space, B, row.candidate, c));
      if (space.key(Y) !== space.key(row.candidate)) {
        expect(candidateEngineKey(space, Y, mode), `${kind}: reverting ${c.id} leaves the engine inputs unchanged`).not.toBe(ek);
      } else {
        expect(bundled.has(c.id), `${kind}: ${c.id} cannot be reverted alone and is in no bundle`).toBe(true);
      }
      if (!bundled.has(c.id)) {
        const ok = c.needed?.significant === true || c.own?.significant === true;
        expect(ok, `${kind}: change ${c.id} is neither needed nor significant on its own`).toBe(true);
      }
    }
  }
  return changes;
}

describe('optimiser results contain no inert change', { timeout: 600000 }, () => {
  for (const [kind, t] of Object.entries(TARGETS)) {
    it(`${kind}: every non-baseline row has changes that alter the engine inputs and matter`, async () => {
      const mode = kind === 'pvp' ? 'pvp' : 'pve';
      let rows = 0;
      let changes = 0;
      let runs = 0;
      const cases = [];
      forAll(`inert-${kind}`, (rng) => {
        // PVP duels are the costly fight: its characters are the fixture Warrior and Sentinel (level 100)
        const spec = kind === 'pvp' ? pick(rng, HARNESS_SPECS.filter((x) => x.key === 'WARRIOR_DPS' || x.key === 'SENTINEL_MARKSMANSHIP')) : pick(rng, HARNESS_SPECS);
        // a baseline without relics or pet (PVP: no sigils, against the full build's clone), so the search has something
        // to add and rows exist to check
        const full = kind === 'pvp' ? fixtureCharacter(spec.cls, { spec: spec.key }) : arbCharacter(rng, { spec });
        const stripped = structuredClone(full);
        for (const p of stripped.presets) {
          if (kind === 'pvp') Object.assign(p, { sigilSpecies: [], utilitySigilSpecies: null, ancientSigilSpecies: null });
          else Object.assign(p, { relicIds: [], petId: null });
        }
        let character = withLegalBaseline(stripped);
        if (kind === 'pvp') {
          const raw = JSON.parse(JSON.stringify(character));
          raw.opponents = [{ ...cloneAsOpponent(withLegalBaseline(full), full.activePresetId, spec.key, 'Opp'), id: 'opp-a' }];
          character = normaliseCharacter(raw);
        }
        const blocks = EXTRA[kind] ?? sample(rng, ['relics', 'pet', 'utility', 'ancient', 'conditions'], 2);
        return { character, blocks, seed: int(rng, 1, 1e6) };
      }, (c) => { cases.push(c); }, { runs: kind === 'pvp' ? 1 : 2 });

      for (const { character, blocks, seed } of cases) {
        const presetId = character.activePresetId;
        const space = Object.fromEntries(BLOCKS.map((b) => [b, blocks.includes(b)]));
        const result = await optimize({ character, presetId, target: t.target, objective: t.objective, space, effort: t.effort, seed: hashSeed(seed, kind) });
        if (result.status === 'failed' && result.baselineViolations?.length) continue; // a setup blocker, not a result
        runs += 1;
        rows += result.rows.length;
        changes += checkResult(character, presetId, result, kind, mode);
      }
      expect(runs, 'every generated baseline was a setup blocker').toBeGreaterThan(0);
      // PVP duels at quick effort rarely resolve a win-rate gain; its inertness is also swept on arms below
      if (kind !== 'pvp') {
        expect(rows, 'no run produced a row to check').toBeGreaterThan(0);
        expect(changes).toBeGreaterThan(0);
      }
    });
  }
});

describe('canonicalised arms contain no inert change (no fights)', () => {
  for (const sr of SPEC_REALMS) {
    it(`${sr.label} / ${sr.realm}: an arm, or two arms joined, reverts to no inert change`, () => {
      let checked = 0;
      forAll(`inert-arms-${sr.label}-${sr.realm}`, (rng) => withLegalBaseline(arbCharacter(rng, { spec: sr })), (character, rng) => {
        const mode = pick(rng, ['pve', 'pvp']);
        const space = createBuildSpace(character, character.activePresetId, { realm: sr.realm, mode });
        const B = space.start;
        if (!legalityOf(character, space.presetId, B).ok) return;
        const arms = space.blocks.flatMap((b) => b.domain(B));
        for (let i = 0; i < Math.min(arms.length, 12); i++) {
          let X = arms[int(rng, 0, arms.length - 1)];
          // join a second arm's first change, as the search's ascent does
          const other = arms[int(rng, 0, arms.length - 1)];
          const extra = changesOf(space, B, other, { bundles: false })[0];
          if (extra) X = space.legalise(addChange(space, B, X, extra));
          const { candidate } = canonicalise(space, B, X, { mode });
          const ek = candidateEngineKey(space, candidate, mode);
          for (const c of changesOf(space, B, candidate)) {
            const Y = space.legalise(revert(space, B, candidate, c));
            if (space.key(Y) === space.key(candidate)) continue;
            expect(candidateEngineKey(space, Y, mode), `${mode}: ${c.id} is inert after canonicalise`).not.toBe(ek);
          }
          checked += 1;
        }
      }, { runs: 4 });
      expect(checked).toBeGreaterThan(0);
    });
  }
});
