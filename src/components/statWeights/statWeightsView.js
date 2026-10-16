// statWeightsView.js - display rows of a stat-weights chart (features/statWeights.js chartBars output).
// The damage chart plots the change in percent of the preset's own mean DPS; the survival chart in
// percentage points of survival chance. Colour comes from `measurable`, never from the sign alone.

const MINUS = '−';
const signed = (x, digits, suffix) => {
  if (x == null || !Number.isFinite(x)) return 'n/a';
  const s = `${Math.abs(x).toFixed(digits)}${suffix}`;
  return x > 0 ? `+${s}` : x < 0 && Number(Math.abs(x).toFixed(digits)) !== 0 ? `${MINUS}${s}` : s;
};

/** Number formatting of one chart: damage in percent of base DPS, survival in points. */
export function chartFormat(kind) {
  return kind === 'damage' ? (v) => signed(v, 2, '%') : (v) => signed(v, 1, ' pts');
}

/**
 * Rows for the forest table. `est`/`lo`/`hi` are on the chart's axis (percent or points).
 * @param {'damage'|'survival'} kind
 * @param {Array<Object>} bars
 */
export function weightRows(kind, bars) {
  return (bars ?? []).map((b) => {
    const [est, lo, hi] = kind === 'damage' ? [b.pct, b.pctLo, b.pctHi] : [b.delta * 100, b.lo * 100, b.hi * 100];
    return {
      key: b.key,
      label: b.label,
      unit: b.unit,
      est, lo, hi,
      abs: kind === 'damage' ? b.delta : null,
      n: b.n,
      rank: b.rank,
      measurable: b.measurable,
      tone: !b.measurable ? 'side' : b.delta > 0 ? 'up' : 'down',
    };
  });
}

/** The visually hidden sentence of a row. */
export function rowSentence(kind, r) {
  const f = chartFormat(kind);
  const head = r.measurable ? `rank ${r.rank}` : 'no clear effect';
  return `${r.label} ${r.unit}: ${f(r.est)}, likely range ${f(r.lo)} to ${f(r.hi)}, ${head}`;
}
