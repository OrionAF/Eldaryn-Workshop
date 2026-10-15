// Dominance pruning measured on real fixtures (backlog §16 table): per-visit domain sizes at the active preset.
// A measurement, not a check, so it runs only with PRUNE_MEASURE=1 set:
//   PRUNE_MEASURE=1 npx vitest run src/lib/__fixtures__/real/dominancePruning.test.js
import { describe, it } from 'vitest';
import sentinel from './profile-sentinel-l85-oct15b.json';
import warrior from './profile-warrior-l73.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { prepare } from '../../search/search.js';

const NOW = '2026-10-15T00:00:00.000Z';
const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW }));
const warriorChar = normaliseCharacter(gameProfileToCharacter(warrior, { now: NOW }));
const SHOWN = ['sigils', 'utility', 'conditions', 'relics', 'pet', 'talents'];

const TARGETS = {
  dungeon: { target: { kind: 'dungeon', id: 'dungeon_1_hard', step: 6 }, objective: { kind: 'win-chance' } },
  dummy: { target: { kind: 'dummy' }, objective: { kind: 'dps' } },
  fortress: { target: { kind: 'fortressBoss', group: 'TOP', stars: 5 }, objective: { kind: 'dps' } },
};

describe.skipIf(!process.env.PRUNE_MEASURE)('Dominance pruning, measured (backlog §16)', () => {
  it('per-visit domain sizes at the active preset', () => {
    for (const [name, character] of [['Sentinel L85', me], ['Warrior L73', warriorChar]]) {
      for (const [t, req] of Object.entries(TARGETS)) {
        const prep = prepare({ character, presetId: character.activePresetId, ...req, seed: 1 });
        const sizes = prep.space.domainSizes(prep.space.start);
        console.log(`${name} ${t}: ${SHOWN.map((b) => `${b} ${sizes[b] ?? '-'}`).join(', ')}`);
      }
    }
  });
});
