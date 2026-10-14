// search/combinatorics.js (F2a): subset enumeration salvaged from the legacy optimizer.js (subsetsUpTo,
// subsetCount); `combinations` and `choose` are new. Pure, no imports.

/**
 * Every subset of `pool` of size <= `cap`, including the empty one. A plain loop rather than
 * `push(...grown)`: spreading a long array as call arguments overflows the stack.
 */
export function subsetsUpTo(pool, cap) {
  const subsets = [[]];
  for (const item of pool) {
    const grown = [];
    for (const subset of subsets) if (subset.length < cap) grown.push([...subset, item]);
    for (const subset of grown) subsets.push(subset);
  }
  return subsets;
}

/** Every subset of exactly `k` items (all of them when the pool is smaller than k). */
export function combinations(pool, k) {
  const size = Math.min(k, pool.length);
  const out = [];
  const pick = [];
  const go = (from) => {
    if (pick.length === size) {
      out.push([...pick]);
      return;
    }
    for (let i = from; i <= pool.length - (size - pick.length); i++) {
      pick.push(pool[i]);
      go(i + 1);
      pick.pop();
    }
  };
  go(0);
  return out;
}

/** C(n, 0) + ... + C(n, k): the size subsetsUpTo returns, without building it. */
export function subsetCount(n, k) {
  let total = 0;
  let term = 1;
  for (let i = 0; i <= Math.min(k, n); i++) {
    total += term;
    term = (term * (n - i)) / (i + 1);
  }
  return Math.round(total);
}

/** C(n, k), exact for the sizes used here. */
export function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= Math.min(k, n - k); i++) r = (r * (n - i + 1)) / i;
  return Math.round(r);
}
