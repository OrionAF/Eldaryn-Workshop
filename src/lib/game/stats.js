// L1 catalogue: stat rows, caps, ceilings, units, rounding. Data lives in data/stats.json.
import statsData from '../../data/game/stats.json';

export const STATS = statsData.stats;
export const PRIMARY_STATS = statsData.primaryStats;
export const BASE_STATS = statsData.baseStats;
export const DERIVED_TOTALS = statsData.derivedTotals;
export const SOFT_CAP_CURVE = statsData.softCapCurve;
export const PVP_RATING = statsData.pvpRating;
export const POWER_CONFIG = statsData.powerConfig;

const byEnum = new Map(STATS.map((s) => [s.enumName, s]));
const byKey = new Map(STATS.filter((s) => s.computedKey).map((s) => [s.computedKey, s]));

export const statByEnum = (name) => byEnum.get(name) ?? null;
export const statByKey = (computedKey) => byKey.get(computedKey) ?? null;

const row = (id) => byKey.get(id) ?? byEnum.get(id) ?? null;
const field = (id, f, dflt = null) => {
  const r = row(id);
  return r && r[f] != null ? r[f] : dflt;
};

// All accept a computedKey or an enum name.
export const softCap = (id) => field(id, 'softCap');
export const hardCap = (id) => field(id, 'hardCap');
export const combatCeiling = (id) => field(id, 'combatCeiling');
export const statUnit = (id) => field(id, 'unit');
export const roundDigits = (id) => field(id, 'roundDigits');
export const displayMult = (id) => field(id, 'displayMult', 1);
export const rawKey = (id) => field(id, 'rawKey');
/** Classes whose gear can roll this stat. */
export const classesAvailable = (id) => field(id, 'classesAvailable', []);
