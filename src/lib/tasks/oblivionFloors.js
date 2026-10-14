// Worker task 'oblivionFloors' (F4): win rate per Oblivion Dungeon floor for one Fighter.
// request: { fighter, from?: 1, to?: 30, floors?: number[], n?: 64, seed?: 1, threshold?: 0.9,
//            maxMs?: 300000, stopAfter?: 3 }
//   `floors` overrides from..to. The scan stops early after `stopAfter` consecutive floors with no win.
// result:  { power, threshold, rows: [{floor, instability, strain, p, pLo, pHi, wins, n, medianMs}],
//            maxFloor (highest floor with p >= threshold, or null), aborted }
// Power is fighter.stats.totalOblivionPower (nonzero only for the Oblivion realm build). Cancel returns
// the rows finished so far with aborted: true.

import { ttkVsAsync } from '../engine/metrics.js';
import { oblivionFloorMob, oblivionEffectiveInstability } from '../engine/pve/enemies.js';

export async function oblivionFloors(request, { signal, onProgress } = {}) {
  const { fighter, from = 1, to = 30, n = 64, seed = 1, threshold = 0.9, maxMs = 300000, stopAfter = 3 } = request ?? {};
  if (!fighter) throw new Error('oblivionFloors: fighter is required');
  const floors = request.floors ?? Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const power = Math.round(Number(fighter.stats?.totalOblivionPower) || 0);
  const rows = [];
  let aborted = false;
  let dry = 0;
  for (let i = 0; i < floors.length; i++) {
    if (signal?.aborted) {
      aborted = true;
      break;
    }
    const floor = floors[i];
    const mob = oblivionFloorMob(floor);
    if (!mob) continue;
    const r = await ttkVsAsync(fighter, mob, {
      n, seed, maxMs, opts: { oblivion: { power } }, signal,
      onProgress: (p) => onProgress?.({ ...p, floor, floorIndex: i, floors: floors.length }),
    });
    if (r.aborted) {
      aborted = true;
      break;
    }
    rows.push({
      floor, instability: mob.instability, strain: oblivionEffectiveInstability(mob.instability, power),
      p: r.p, pLo: r.pLo, pHi: r.pHi, wins: r.wins, n: r.n, medianMs: r.wins ? r.median : null,
    });
    dry = r.wins === 0 ? dry + 1 : 0;
    if (stopAfter > 0 && dry >= stopAfter) break;
  }
  let maxFloor = null;
  for (const r of rows) if (r.p >= threshold) maxFloor = r.floor;
  return { power, threshold, rows, maxFloor, aborted };
}
