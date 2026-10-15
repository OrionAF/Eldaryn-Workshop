// features/oblivionDungeon.js (F4): the Oblivion hero's pure helpers and the floor-scan runner.
// Game rules: pve-content.md §11 (net strain = max(0, round(instability) - round(power))).
import { oblivionFloorMob, oblivionEffectiveInstability } from '../engine/pve/enemies.js';
import { buildFighter } from '../build/fighter.js';
import { runOptimizerTask } from '../optimizerClient.js';

export const WIN_THRESHOLD = 0.9;

/** Oblivion Power of a built Fighter (0 outside the Oblivion realm or without Oblivion stones). */
export const oblivionPowerOf = (fighter) => Math.round(Number(fighter?.stats?.totalOblivionPower) || 0);

/** Static rows (no simulation): floor, raw instability and net strain for floors from..to. */
export function strainRows(power, from = 1, to = 30) {
  const rows = [];
  for (let floor = from; floor <= to; floor++) {
    const mob = oblivionFloorMob(floor);
    if (mob) rows.push({ floor, instability: mob.instability, strain: oblivionEffectiveInstability(mob.instability, power) });
  }
  return rows;
}

/** Highest floor whose win rate is at least `threshold`, or null. */
export function maxFloorAtThreshold(rows, threshold = WIN_THRESHOLD) {
  let best = null;
  for (const r of rows) if (r.p != null && r.p >= threshold) best = r.floor;
  return best;
}

/** Highest floor (within `to`) where the power fully cancels the strain; 0 if none. */
export function highestFreeFloor(power, to = 60) {
  let best = 0;
  for (let f = 1; f <= to; f++) if (oblivionEffectiveInstability(oblivionFloorMob(f).instability, power) === 0) best = f;
  return best;
}

/** Build the Oblivion-realm Fighter for the character's active (or given) preset. */
export function oblivionFighter(character, presetId) {
  return buildFighter(character, presetId, { realm: 'oblivion' });
}

/**
 * Start a floor scan through the task facade. Returns { promise, cancel, fighter }.
 * @param {object} character  plain or $state character (JSON-cloned)
 */
export function runFloorScan(character, { presetId, from = 1, to = 30, n = 64, seed = 1, threshold = WIN_THRESHOLD, maxMs, applyOutputCut } = {}, hooks = {}) {
  const plain = JSON.parse(JSON.stringify(character));
  const fighter = oblivionFighter(plain, presetId);
  const task = runOptimizerTask({ mode: 'oblivionFloors', fighter, from, to, n, seed, threshold, maxMs, applyOutputCut }, hooks);
  return { ...task, fighter };
}

/** Scan effort -> fights per floor (open decision Q4: Standard is the default). */
export const FLOOR_EFFORT = { quick: 32, standard: 64, thorough: 256 };

/**
 * Worker request for a floor scan job (the request runFloorScan sends), so the job store can run it.
 * @param {object} character  plain or $state character (JSON-cloned)
 */
export function floorScanRequest(character, { presetId, from = 1, to = 30, effort = 'standard', threshold = WIN_THRESHOLD, applyOutputCut = false } = {}) {
  const plain = JSON.parse(JSON.stringify(character));
  return {
    mode: 'oblivionFloors', fighter: oblivionFighter(plain, presetId), from, to,
    n: FLOOR_EFFORT[effort] ?? FLOOR_EFFORT.standard, seed: 1, threshold, applyOutputCut,
  };
}

/**
 * Everything a scan's result depends on, as one string: the built fighter plus the scan options. A job
 * stores it at start; a differing current value means the result describes an older build or setup.
 */
export function floorScanInputs(character, opts = {}) {
  const { fighter, ...scan } = floorScanRequest(character, opts);
  return JSON.stringify([fighter, scan]);
}
