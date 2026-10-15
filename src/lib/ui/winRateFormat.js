// ui/winRateFormat.js - how the Optimiser says what a win rate means in practice: the expected number of
// attempts per clear, 1 / p (simulation.md §Objectives, Win rate target). Pure.

/**
 * "about N tries per clear" for a win rate p in [0, 1]: one decimal below 10 tries, a whole number from 10
 * up. p = 1 reads "clears every try" and p = 0 "no clears". Anything that is not a rate gives ''.
 */
export function triesPerClear(p) {
  if (typeof p !== 'number' || !Number.isFinite(p) || p < 0 || p > 1) return '';
  if (p === 0) return 'no clears';
  if (p === 1) return 'clears every try';
  const tries = 1 / p;
  const tenth = Math.round(tries * 10) / 10;
  return tenth < 10 ? `about ${tenth.toFixed(1)} tries per clear` : `about ${Math.round(tries)} tries per clear`;
}
