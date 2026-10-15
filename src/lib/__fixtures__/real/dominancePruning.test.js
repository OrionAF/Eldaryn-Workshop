// Dominance pruning measured on real fixtures (backlog §16 tables): per-visit domain sizes at the active preset,
// and the fights of one bounded Celestial optimise run. Slow, so it runs only with PRUNE_MEASURE=1 set:
//   PRUNE_MEASURE=1 npx vitest run src/lib/__fixtures__/real/dominancePruning.test.js
import { describe, it } from 'vitest';
import sentinel from './profile-sentinel-l85-oct15b.json';
import warrior from './profile-warrior-l73.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { optimize, prepare } from '../../search/search.js';
import { resolveRosterPartner } from '../../search/celestialObjective.js';
import { BLOCKS } from '../../search/space.js';

const NOW = '2026-10-15T00:00:00.000Z';
const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW }));
const warriorChar = normaliseCharacter(gameProfileToCharacter(warrior, { now: NOW }));
const tankPreset = warriorChar.presets.find((p) => p.name === 'TANK');
const rosterRef = { source: 'character', characterId: warriorChar.id, presetId: tankPreset.id };
const partner = resolveRosterPartner(rosterRef, [me, warriorChar]);
const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const LEVEL = Number(process.env.PRUNE_LEVEL) || 96;
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

  it('one bounded Celestial optimise run (NORMAL, PRUNE_LEVEL (default 96, where the build wins about 25%), Warrior TANK partner, sigils + talents + relics, Quick, seed 1)', async () => {
    const t0 = Date.now();
    const res = await optimize({
      character: me, partner, presetId: me.activePresetId,
      target: { kind: 'celestial', difficulty: 'NORMAL', level: LEVEL, partner: rosterRef },
      objective: { kind: 'win-chance' }, space: only('sigils', 'talents', 'relics'), effort: 'quick', seed: 1,
    });
    console.log(`celestial: ${((Date.now() - t0) / 1000).toFixed(0)} s; goal ${res.goal?.status}; ${res.headline?.text ?? ''}`);
    for (const p of res.phases ?? []) console.log(`  ${p.id}: ${p.fights} fights, ${(p.ms / 1000).toFixed(1)} s`);
    console.log(`  fights ${JSON.stringify(res.search?.fights)}; rows ${res.rows?.length ?? 0}`);
    for (const b of res.search?.blocks ?? []) if (b.enabled) console.log(`  block ${b.id}: domain ${b.domain}, pruned ${b.pruned?.length ?? 0}`);
    const top = res.rows?.[0];
    if (top) console.log(`  top row: ${top.vsBaseline?.verdict} est ${JSON.stringify(top.estimate ?? top.value ?? null)}`);
  }, 3_600_000);
});
