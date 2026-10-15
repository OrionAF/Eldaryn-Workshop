// Worker task 'oblivionFloors': win rate per Oblivion Dungeon floor for one Fighter (plan F2).
// request: { fighter, from?: 1, to?: 30, floors?: number[], n?: 64, seed?: 1, threshold?: 0.9,
//            maxMs?: undefined (each fight gets the client cap, FIGHT_CAP_MS), stopAfter?: 3,
//            applyOutputCut?: false }
//   `floors` overrides from..to. The scan stops after `stopAfter` consecutive floors with no win
//   and no timeout (a build that only stalls is still alive; one that only dies is not).
// result:  { power, threshold, rows: [{floor, instability, strain, p, pLo, pHi, wins, deaths, timeouts,
//            n, medianMs, verdict}], maxFloor, scanCapped, assumptions, aborted }
//   verdict: 'pass' (Wilson lower bound >= threshold), 'fail' (upper bound < threshold), else 'unresolved'.
//   maxFloor: highest floor whose point estimate is >= threshold (null when none).
//   scanCapped: the last floor of the data table passed, so the real limit is beyond the scan.
// Cancel returns the rows finished so far with aborted: true.

import { simulatePve, preparePveFighter, PVE_MODES, FIGHT_CAP_MS } from '../engine/pve/fight.js';
import { oblivionFloorMob, oblivionEffectiveInstability } from '../engine/pve/enemies.js';
import { OBLIVION_FLOORS } from '../game/pveContent.js';
import { mulberry32, hashSeed } from '../engine/rng.js';
import { wilson, quantile } from '../engine/metrics.js';

const LAST_DATA_FLOOR = Math.max(...OBLIVION_FLOORS.map((f) => f.floor));
const tick = () => new Promise((r) => setTimeout(r, 0));

export async function oblivionFloors(request, { signal, onProgress } = {}) {
  const {
    fighter, from = 1, to = 30, n = 64, seed = 1, threshold = 0.9, maxMs, stopAfter = 3, applyOutputCut = false,
  } = request ?? {};
  if (!fighter) throw new Error('oblivionFloors: fighter is required');
  const floors = request.floors ?? Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const power = Math.round(Number(fighter.stats?.totalOblivionPower) || 0);
  const assumptions = [
    ...PVE_MODES.oblivion.assumptions,
    { key: 'fight-cap', text: `Each fight is cut off at ${(maxMs ?? FIGHT_CAP_MS) / 60000} minutes; a fight still running then is a timeout, not a loss.` },
    { key: 'output-cut', text: applyOutputCut ? 'The instability output cut is applied.' : 'The instability output cut is not applied.' },
  ];
  const rows = [];
  let aborted = signal?.aborted === true;
  let dry = 0;
  if (!aborted && n > 0 && floors.length) {
    const prepared = preparePveFighter(fighter);
    outer: for (let i = 0; i < floors.length; i++) {
      if (signal?.aborted) { aborted = true; break; }
      const floor = floors[i];
      const mob = oblivionFloorMob(floor);
      if (!mob) continue;
      let wins = 0;
      let timeouts = 0;
      const times = [];
      for (let k = 0; k < n; k++) {
        if (signal?.aborted) { aborted = true; break outer; }
        const r = simulatePve({
          fighter: prepared, enemy: mob, mode: 'oblivion', oblivion: { power }, applyOutputCut,
          ...(maxMs != null ? { maxMs } : {}), rng: mulberry32(hashSeed(seed, k)),
        });
        if (r.won) { wins++; times.push(r.timeMs); } else if (r.timedOut) timeouts++;
        onProgress?.({ done: k + 1, n, floor, floorIndex: i, floors: floors.length });
        if ((k & 7) === 7) await tick();
      }
      const w = wilson(wins, n);
      rows.push({
        floor, instability: mob.instability, strain: oblivionEffectiveInstability(mob.instability, power),
        p: w.p, pLo: w.lo, pHi: w.hi, wins, deaths: n - wins - timeouts, timeouts, n,
        medianMs: wins ? quantile(times, 0.5) : null,
        verdict: w.lo >= threshold ? 'pass' : w.hi < threshold ? 'fail' : 'unresolved',
      });
      dry = wins === 0 && timeouts === 0 ? dry + 1 : 0;
      if (stopAfter > 0 && dry >= stopAfter) break;
    }
  }
  let maxFloor = null;
  for (const r of rows) if (r.p >= threshold) maxFloor = r.floor;
  const last = rows.find((r) => r.floor === LAST_DATA_FLOOR);
  const scanCapped = !!last && last.p >= threshold;
  return { power, threshold, rows, maxFloor, scanCapped, assumptions, aborted };
}
