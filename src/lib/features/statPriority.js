// Stat priorities from leaderboard players (Tools › Stat Priorities). Pure: no imports, no store.
// Method: docs/WIP/being-worked-on/spec-guide.md §Leaderboard guide. The data is
// src/data/statPriority.json, written by scripts/statPriority.mjs, which scores its preset brackets
// with these same functions, so a level range picked on the page reads like a preset.
//
// A spec's data is one aggregate per level: { n players, items, obs[i] pieces carrying pool stat i,
// exp[i] pieces expected from drop odds, awk {path: players}, tot[i] sheet totals of stat i }.

export const MAX_LEVEL = 100;

export const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo);
};
const roundTotal = (v) => (v == null ? null : +v.toFixed(Math.abs(v) >= 100 ? 0 : 1));

/** Sum one spec's per-level aggregates over levels lo..hi. */
export function aggregate(byLevel, lo, hi, nStats) {
  const out = { players: 0, items: 0, obs: new Array(nStats).fill(0), exp: new Array(nStats).fill(0), awk: {}, tot: Array.from({ length: nStats }, () => []) };
  for (const key of Object.keys(byLevel)) {
    const lvl = +key;
    if (lvl < lo || lvl > hi) continue;
    const x = byLevel[key];
    out.players += x.n;
    out.items += x.items;
    for (let i = 0; i < nStats; i++) {
      out.obs[i] += x.obs[i];
      out.exp[i] += x.exp[i];
      for (const v of x.tot[i]) out.tot[i].push(v);
    }
    for (const [path, c] of Object.entries(x.awk)) out.awk[path] = (out.awk[path] ?? 0) + c;
  }
  return out;
}

function awakeningOf(counts) {
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  const of = entries.reduce((s, [, c]) => s + c, 0);
  const [path0, count] = [...entries].sort((a, b) => b[1] - a[1])[0];
  return { path: path0[0] + path0.slice(1).toLowerCase(), count, of };
}

/**
 * true where a stat ties ("≈") with the group before it. Measured against the group's first stat,
 * not the neighbour, so a chain of small steps cannot drift into one long tie.
 */
export function priorityTies(prio, nearTie) {
  let lead = null;
  return prio.map((s) => {
    const tie = lead != null && lead.keepRate / s.keepRate < nearTie;
    if (!tie) lead = s;
    return tie;
  });
}

/**
 * Score one aggregate. Every pool stat lands in exactly one list, split at ×1: priority (above,
 * best first), ban (the Attunement block list: the least-kept below ×1, one per slot) and belowOdds.
 * ctx: { labels, softCaps, shrink, nearTie, banSlots } (banSlots of this spec's class).
 */
export function scoreRange(agg, pool, ctx) {
  const stats = pool.map((t, i) => ({
    type: t,
    label: ctx.labels[t],
    observed: agg.obs[i],
    expected: +agg.exp[i].toFixed(1),
    keepRate: +((agg.obs[i] + ctx.shrink) / (agg.exp[i] + ctx.shrink)).toFixed(3),
    share: agg.items ? +(agg.obs[i] / agg.items).toFixed(3) : 0,
    median: roundTotal(quantile(agg.tot[i], 0.5)),
    p75: roundTotal(quantile(agg.tot[i], 0.75)),
    softCap: ctx.softCaps[t],
  })).sort((a, b) => b.keepRate - a.keepRate);
  const priority = stats.filter((s) => s.keepRate > 1);
  // a banned stat all but vanishes from gear, so real bans sit at the bottom
  const ban = stats.filter((s) => s.keepRate < 1).sort((a, b) => a.keepRate - b.keepRate).slice(0, ctx.banSlots);
  const belowOdds = stats.filter((s) => s.keepRate <= 1 && !ban.includes(s)).sort((a, b) => a.keepRate - b.keepRate);
  const ties = priorityTies(priority, ctx.nearTie);
  // RMS of log keep rate: how far this group's gear sits from plain drop odds
  const signal = Math.sqrt(stats.reduce((s, x) => s + Math.log(x.keepRate) ** 2, 0) / stats.length);
  return {
    players: agg.players,
    items: agg.items,
    priorityLine: priority.map((s, i) => (i === 0 ? s.label : `${ties[i] ? ' ≈ ' : ' > '}${s.label}`)).join(''),
    priorityTies: ties,
    priority: priority.map((s) => s.type),
    ban: ban.map((s) => s.type),
    belowOdds: belowOdds.map((s) => s.type),
    awakening: awakeningOf(agg.awk),
    typical: priority.slice(0, 6).map((s) => s.type),
    signal: +signal.toFixed(3),
    stats,
  };
}

/** Diverging step of a keep rate, -3..3 (0: about drop odds), for chips and heatmap cells. */
export function keepStep(kr, { STRONG_MIN, AVOID_MAX }) {
  if (kr >= 2) return 3;
  if (kr >= 1.5) return 2;
  if (kr >= STRONG_MIN) return 1;
  if (kr <= 0.45) return -3;
  if (kr <= 0.6) return -2;
  if (kr <= AVOID_MAX) return -1;
  return 0;
}

/** "74", "60-64", "60 to 64" -> [lo, hi] within 1..MAX_LEVEL, else null. */
export function parseLevelRange(text) {
  const m = /^\s*(\d{1,3})\s*(?:(?:-|–|—|to)\s*(\d{1,3}))?\s*$/i.exec(String(text ?? ''));
  if (!m) return null;
  const clamp = (v) => Math.max(1, Math.min(MAX_LEVEL, v));
  const a = clamp(+m[1]);
  const b = clamp(m[2] ? +m[2] : +m[1]);
  return [Math.min(a, b), Math.max(a, b)];
}

export const rangeKey = ([lo, hi]) => (lo === hi ? `${lo}` : `${lo}-${hi}`);

const ctxFor = (data, cls) => ({
  labels: data.labels,
  softCaps: data.softCaps,
  shrink: data.method.SHRINK,
  nearTie: data.method.NEAR_TIE,
  banSlots: data.method.BAN_SLOTS[cls],
});

/** A spec's levels lo..hi scored, or { players: 0 } when nobody is there. */
export function scoreSpecRange(data, spec, lo, hi) {
  const entry = data.specs.find((s) => s.spec === spec);
  const pool = data.pools[entry.class];
  const agg = aggregate(data.levels[spec], lo, hi, pool.length);
  const base = { key: rangeKey([lo, hi]), lo, hi };
  return agg.players ? { ...base, ...scoreRange(agg, pool, ctxFor(data, entry.class)) } : { ...base, players: 0, items: 0 };
}

/** The preset brackets a spec has enough players for (MIN_PLAYERS), scored. */
export function presetBrackets(data, spec) {
  return data.brackets
    .map(([lo, hi]) => scoreSpecRange(data, spec, lo, hi))
    .filter((b) => b.players >= data.method.MIN_PLAYERS);
}

/** Players of a spec at levels lo..hi. */
export function playersIn(data, spec, lo, hi) {
  return Object.entries(data.levels[spec]).reduce((s, [l, x]) => s + (+l >= lo && +l <= hi ? x.n : 0), 0);
}

/** The card as pasteable text: the priority line, block list, the rest, Awakening, typical totals. */
export function blockText(labels, b) {
  const L = (t) => labels[t];
  const lines = [b.priorityLine || 'No stat kept above drop odds yet'];
  if (b.ban.length) lines.push(`Avoid (block list): ${b.ban.map(L).join(', ')}`);
  if (b.belowOdds.length) lines.push(`Below drop odds: ${b.belowOdds.map(L).join(', ')}`);
  if (b.awakening) lines.push(`Awakening: ${b.awakening.path} (${b.awakening.count} of ${b.awakening.of})`);
  const byType = Object.fromEntries(b.stats.map((s) => [s.type, s]));
  const typ = b.typical.filter((t) => byType[t].median != null);
  if (typ.length) lines.push(`Typical: ${typ.map((t) => `${L(t).replace(/ %$/, '')} ${byType[t].median}%`).join(', ')}`);
  return lines.join('\n');
}
