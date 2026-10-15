// Highest chance to win where almost nothing wins (backlog §12 table): the user's Sentinel
// (profile-sentinel-l85-oct15b, active preset), Hard Forsaken Mines step 6, Standard effort, sigils only,
// seed 1. Slow, so it runs only with PROGRESS_TOL=1 set:
//   PROGRESS_TOL=1 npx vitest run src/lib/__fixtures__/real/progressTolerance.test.js
// It prints the fights and seconds of each phase, and the top rows against the baseline.
import { describe, it } from 'vitest';
import profile from './profile-sentinel-l85-oct15b.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { optimize } from '../../search/search.js';
import { BLOCKS } from '../../search/space.js';

const STEP = Number(process.env.PROGRESS_TOL_STEP) || 6;

describe.skipIf(!process.env.PROGRESS_TOL)('Progress tolerance (Hard Forsaken Mines, Sentinel L85)', () => {
  it(`runs the highest-chance goal on step ${STEP}`, async () => {
    const character = normaliseCharacter(gameProfileToCharacter(profile));
    const request = {
      character, presetId: character.activePresetId,
      target: { kind: 'dungeon', id: 'dungeon_1_hard', step: STEP },
      objective: { kind: 'win-chance' }, effort: 'standard', seed: 1,
      space: Object.fromEntries(BLOCKS.map((b) => [b, b === 'sigils'])),
    };
    const t0 = Date.now();
    const res = await optimize(request);
    console.log(`step ${STEP}: ${((Date.now() - t0) / 1000).toFixed(0)} s; goal ${res.goal?.status}; ${res.headline?.text ?? ''}`);
    for (const p of res.phases ?? []) console.log(`  ${p.id}: ${p.fights} fights, ${(p.ms / 1000).toFixed(1)} s`);
    console.log(`  fights ${JSON.stringify(res.search?.fights)}; rows ${res.rows?.length ?? 0}`);
    for (const r of (res.rows ?? []).slice(0, 5)) {
      const v = r.vsBaseline;
      console.log(`  row ${r.candidate?.sigilSpecies?.join(' + ')}: ${v?.verdict} on ${v?.basis} at n ${v?.n} [${v?.lo?.toFixed(4)}, ${v?.hi?.toFixed(4)}]`);
    }
    for (const w of res.warnings ?? []) console.log(`  warning ${w.code}: ${w.message}`);
  }, 3_600_000);
});
