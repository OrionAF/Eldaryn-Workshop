// Sigil-set ranking for the Fortress boss (backlog §15 table): the user's Sentinel (profile-sentinel-l85-oct15b,
// active preset), TOP 5 stars. Slow, so it runs only with FORTRESS_RANK=1 set:
//   FORTRESS_RANK=1 npx vitest run src/lib/__fixtures__/real/fortressSigilRank.test.js
// It scores every sigil set the optimiser's sigil block can try (the generic slots; the other blocks off) on
// common random numbers, and runs the optimiser itself (sigils only, Standard effort, seed 1).
import { describe, it } from 'vitest';
import profile from './profile-sentinel-l85-oct15b.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { prepare, optimize } from '../../search/search.js';
import { BLOCKS } from '../../search/space.js';

const N = 200;
const SEED = 1;

describe.skipIf(!process.env.FORTRESS_RANK)('Fortress sigil ranking (TOP 5 stars, Sentinel L85)', () => {
  it('scores every sigil set and runs the optimiser', async () => {
    const character = normaliseCharacter(gameProfileToCharacter(profile));
    const request = {
      character, presetId: character.activePresetId,
      target: { kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 26, server: 5 },
      objective: { kind: 'dps' }, effort: 'standard', seed: SEED,
      space: Object.fromEntries(BLOCKS.map((b) => [b, b === 'sigils'])),
    };
    const { space, objective } = prepare(request);
    const block = space.blocks.find((b) => b.id === 'sigils');
    const cands = [space.start, ...block.domain(space.start)];
    const rows = cands.map((c) => {
      const m = objective.measure(space.fighterOf(c), { n: N, seed: SEED });
      return { sigils: c.sigilSpecies.join(' + '), dps: m.value, lo: m.lo, hi: m.hi, current: c === space.start };
    }).sort((a, b) => b.dps - a.dps);
    const fmt = (x) => (x / 1e6).toFixed(2);
    console.log(`sets ${rows.length}; n ${N}; seed ${SEED}`);
    rows.slice(0, 5).forEach((r, i) => console.log(`#${i + 1} ${r.sigils}: ${fmt(r.dps)}M (${fmt(r.lo)}-${fmt(r.hi)})`));
    const cur = rows.findIndex((r) => r.current);
    console.log(`current #${cur + 1} ${rows[cur].sigils}: ${fmt(rows[cur].dps)}M`);
    const res = await optimize(request);
    const top = res.rows?.[0];
    console.log(`optimiser: ${res.status ?? ''} ${res.headline ?? ''} best ${top ? JSON.stringify(top.changes?.map((ch) => `${ch.from ?? ''} -> ${ch.to ?? ''}`) ?? top) : 'none'} ${top?.estimate?.est ?? top?.value?.est ?? ''}`);
  }, 3_600_000);
});
