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
export function runFloorScan(character, { presetId, from = 1, to = 30, n = 64, seed = 1, threshold = WIN_THRESHOLD } = {}, hooks = {}) {
  const plain = JSON.parse(JSON.stringify(character));
  const fighter = oblivionFighter(plain, presetId);
  const task = runOptimizerTask({ mode: 'oblivionFloors', fighter, from, to, n, seed, threshold }, hooks);
  return { ...task, fighter };
}
