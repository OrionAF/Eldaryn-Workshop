// Dominance pruning on a Celestial run, before and after (backlog §16 follow-up): per-visit domain sizes and a
// bounded optimise with the filter on and off (effort.dominance: false). A measurement, not a check:
//   CELESTIAL_PRUNE=1 npx vitest run src/lib/__fixtures__/real/celestialPruning.test.js
// CELESTIAL_PRUNE_BLOCKS=talents,relics,pet picks the blocks the optimise may change (default: those three). The goal is
// Fastest clear: on NORMAL L50 the fixture party clears every fight, so a win-rate goal stops at its first check.
import { describe, it } from 'vitest';
import sentinel from './profile-sentinel-l85-oct15b.json';
import warrior from './profile-warrior-l73.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { resolveRosterPartner } from '../../search/celestialObjective.js';
import { prepare, optimize } from '../../search/search.js';
import { BLOCKS } from '../../search/space.js';

const NOW = '2026-10-15T00:00:00.000Z';
const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW }));
const warriorChar = normaliseCharacter(gameProfileToCharacter(warrior, { now: NOW }));
const tankPreset = warriorChar.presets.find((p) => p.name === 'TANK');
const ref = { source: 'character', characterId: warriorChar.id, presetId: tankPreset.id };
const partner = resolveRosterPartner(ref, [me, warriorChar]);
const SHOWN = ['sigils', 'utility', 'conditions', 'relics', 'pet', 'talents'];
const chosen = (process.env.CELESTIAL_PRUNE_BLOCKS ?? 'talents,relics,pet').split(',');

const request = (dominance) => ({
  character: me, partner, presetId: me.activePresetId, seed: 1,
  target: { kind: 'celestial', difficulty: 'NORMAL', level: 50, partner: ref },
  objective: { kind: 'fastest-clear' },
  space: Object.fromEntries(BLOCKS.map((b) => [b, chosen.includes(b)])),
  effort: { level: 'quick', dominance },
});

describe.skipIf(!process.env.CELESTIAL_PRUNE)('Dominance pruning on the Celestial Trial, measured (backlog §16)', () => {
  it('per-visit domain sizes, filter on and off', () => {
    for (const on of [false, true]) {
      const prep = prepare({ ...request(on), space: Object.fromEntries(BLOCKS.map((b) => [b, true])) });
      const sizes = prep.space.domainSizes(prep.space.start);
      console.log(`dominance ${on ? 'on ' : 'off'}: ${SHOWN.map((b) => `${b} ${sizes[b] ?? '-'}`).join(', ')}`);
    }
  });

  it(`a Quick optimise of ${chosen.join(' + ')}, filter off then on`, async () => {
    for (const on of [false, true]) {
      const t0 = performance.now();
      const res = await optimize(request(on));
      const s = (performance.now() - t0) / 1000;
      const f = res.search?.fights ?? {};
      const best = res.rows?.[0]?.value?.est ?? res.baseline.value.est;
      console.log(`dominance ${on ? 'on ' : 'off'}: ${res.status}, builds ${res.search?.evaluated}, fights ${JSON.stringify(f)}, ${s.toFixed(0)} s, baseline ${res.baseline.value.est} ms, best ${best} ms, rows ${res.rows?.length ?? 0}`);
    }
  }, 6 * 3600_000);
});
