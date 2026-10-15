// The per-device CPU profile (pref `cpuProfile`, uiState.js) and the pool size it gives a job.
// Contract: docs/Reference/simulation.md §Worker pool.

export const CPU_PROFILES = Object.freeze(['eco', 'balanced', 'max']);
export const DEFAULT_CPU_PROFILE = 'balanced';

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/**
 * Engine workers for one job: eco a quarter of the cores (1-2), balanced half (1-6), max all but one.
 * An unknown profile counts as balanced; a missing or junk core count as 4.
 * @param {string} profile  one of CPU_PROFILES
 * @param {number} cores    navigator.hardwareConcurrency
 */
export function workersFor(profile, cores) {
  const c = Number.isFinite(cores) && cores >= 1 ? Math.floor(cores) : 4;
  if (profile === 'eco') return clamp(Math.floor(c * 0.25), 1, 2);
  if (profile === 'max') return Math.max(1, c - 1);
  return clamp(Math.floor(c * 0.5), 1, 6);
}
