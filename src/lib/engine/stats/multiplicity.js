// Family-wise error control (docs/Reference/simulation.md §Statistics, families).

/** Bonferroni: adjusted p = min(1, m p); reject at alpha. */
export function bonferroni(ps, alpha = 0.05) {
  const m = ps.length;
  const adjusted = ps.map((p) => Math.min(1, m * p));
  return { adjusted, reject: adjusted.map((p) => p <= alpha), alphaEach: m ? alpha / m : alpha };
}

/**
 * Holm step-down. Adjusted p for the i-th smallest is max over j <= i of min(1, (m - j + 1) p(j));
 * reject when adjusted p <= alpha. `alphaEach[i]` is the per-test level the step-down reached for
 * hypothesis i (alpha / (m - rank + 1)), used to size its shown interval.
 */
export function holm(ps, alpha = 0.05) {
  const m = ps.length;
  const order = ps.map((p, i) => i).sort((a, b) => ps[a] - ps[b] || a - b);
  const adjusted = new Array(m);
  const alphaEach = new Array(m);
  let run = 0;
  order.forEach((i, rank) => {
    run = Math.max(run, Math.min(1, (m - rank) * ps[i]));
    adjusted[i] = run;
    alphaEach[i] = alpha / (m - rank);
  });
  return { adjusted, reject: adjusted.map((p) => p <= alpha), alphaEach };
}
