// The Optimiser's debug log setting and the small summary a saved run may keep of it. The log itself,
// what it records and its JSONL shape: docs/Reference/simulation.md §Debug log; the pref and the saved
// summary: docs/Reference/data-model.md.

/** Off (default), one row per build raced, or one row per build and per fight. */
export const DEBUG_LOG_LEVELS = Object.freeze(['off', 'builds', 'fights']);

export const normaliseDebugLevel = (v) => (DEBUG_LOG_LEVELS.includes(v) ? v : 'off');

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);
const str = (v) => (typeof v === 'string' ? v : '');

function totalsOf(t) {
  const x = isObj(t) ? t : {};
  return { builds: num(x.builds), fights: num(x.fights), cpuMs: num(x.cpuMs), wallMs: num(x.wallMs) };
}

const groupsOf = (list) => (Array.isArray(list) ? list.filter(isObj).filter((g) => str(g.id)).map((g) => ({ id: str(g.id), ...totalsOf(g) })) : []);

/**
 * A run's debug summary (per phase, per block, totals) -> a valid one, or null when there is none or
 * the level is off. Never holds build or fight rows.
 */
export function normaliseDebugSummary(raw) {
  if (!isObj(raw)) return null;
  const level = normaliseDebugLevel(raw.level);
  if (level === 'off') return null;
  return {
    level,
    phases: groupsOf(raw.phases),
    blocks: groupsOf(raw.blocks),
    totals: { ...totalsOf(raw.totals), truncatedBuilds: num(raw.totals?.truncatedBuilds), truncatedFights: num(raw.totals?.truncatedFights) },
  };
}
