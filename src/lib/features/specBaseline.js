// features/specBaseline.js: the Spec baseline. For each spec and level, the stat totals a player reaches
// from gear and Awakening alone, as a range over simulated players. Contract: docs/Reference/simulation.md
// §Spec baseline.
//
//   statValues()       what one unit of each stat is worth to a spec at a level (from the Spec guide's weights)
//   rollDrop()         one drop as the game rolls it: rarity by level, slot, primaries, secondary lines
//   simulatePlayer()   one player: a stream of drops, the best item per slot kept, the better Awakening path
//   runBaseline()      one table entry: many players, each stat's middle range
//   baselineText()     the share text
//
// Talents, sigils, pets, mounts, relics, stones, Transcendence and fortress stay out: a player above the
// baseline gets the difference from those; below it, the gear is behind.
import { normaliseCharacter } from '../model/index.js';
import { awakeningPointsForLevel } from '../model/legality.js';
import { classLabel, attunementBonus } from '../game/classes.js';
import { BASE_SLOTS, rarityById, secondaryStatCount, secondaryStatCeiling, secondaryPoolFor, slotWeights } from '../game/gear.js';
import { dropRatesForLevel, DROP_RARITY_ORDER } from '../game/drops.js';
import { AWAKENING_PATHS } from '../game/awakening.js';
import { statByKey, displayMult } from '../game/stats.js';
import { buildFighter } from '../build/fighter.js';
import { mulberry32, hashSeed } from '../engine/rng.js';
import { GUIDE_SPECS, guideSpec, guideSpecLabel, totalKeyOfType } from './specGuide.js';

export const BASELINE_LEVELS = Object.freeze([40, 50, 60, 70, 80, 90, 100]);

/**
 * The simulation's assumptions, printed beside the tables. `drops`: every drop a player has had at this
 * level, all at item level = player level (the server picks item level, drops.md §4). Attunement at its
 * maximum (3 bans plus the class bonus, drops.md §5), banning the stats the spec values least.
 */
export const BASELINE = Object.freeze({ drops: 1000, players: 400, percentiles: [25, 75], attunementBans: 3 });

/**
 * What the player keeps: Damage keeps by damage alone, Balanced by damage and time alive equally (each a
 * percent change per unit, so they add).
 */
export const PROFILES = Object.freeze([
  { id: 'damage', label: 'Damage', survival: 0 },
  { id: 'balanced', label: 'Balanced', survival: 1 },
]);
export const profileById = (id) => PROFILES.find((p) => p.id === id) ?? null;

const STAT_ORDER_HEAD = ['totalAttack', 'totalHp'];

/**
 * Percent damage and percent time alive per unit of each stat key, for spec `id` at `level`, from the
 * Spec guide's per-roll values (src/data/specGuide.json), linearly between its levels. A stat with no
 * measurable effect, or a loss, is worth 0.
 * @returns {{damage: Map<string, number>, survival: Map<string, number>}}
 */
export function statValues(guide, id, level) {
  const levels = guide.levels;
  const lo = [...levels].reverse().find((l) => l <= level) ?? levels[0];
  const hi = levels.find((l) => l >= level) ?? levels[levels.length - 1];
  const t = hi === lo ? 0 : (level - lo) / (hi - lo);
  const at = (l) => guide.entries.find((e) => e.id === id && e.level === l);
  const out = { damage: new Map(), survival: new Map() };
  for (const kind of ['damage', 'survival']) {
    const per = (e) => new Map(e[kind].map((r) => [r.key, r.inert || !(r.score > 0) ? 0 : r.value / r.roll]));
    const a = per(at(lo));
    const b = per(at(hi));
    for (const k of new Set([...a.keys(), ...b.keys()])) out[kind].set(k, (a.get(k) ?? 0) * (1 - t) + (b.get(k) ?? 0) * t);
  }
  return out;
}

const pickWeighted = (rng, rows) => {
  let total = 0;
  for (const r of rows) total += r.w;
  let x = rng() * total;
  for (const r of rows) if ((x -= r.w) < 0) return r.v;
  return rows[rows.length - 1].v;
};

function primaries(cls, slot, rarityId, level) {
  const r = rarityById(rarityId);
  const w = slotWeights(cls, slot);
  return {
    attack: Math.round(Math.floor(r.atkBase + level * r.atkScale) * w.attack),
    hp: Math.round(Math.floor(r.hpBase + level * r.hpScale) * w.hp),
  };
}

/**
 * One drop as the game rolls it (drops.md §2, §5; gear.md §3-§4): rarity from the level's odds, a random
 * base slot, primaries at item level = `level`, and the rarity's number of secondary lines, distinct stats
 * from `pool`, each min + (ceiling - min) * random^2. Whether the server allows a stat twice on one item
 * is unknown; one each is assumed. No conduit (it only charges an Ancient sigil).
 */
export function rollDrop(rng, cls, level, rates, pool) {
  const rarity = pickWeighted(rng, rates);
  const slot = BASE_SLOTS[Math.floor(rng() * BASE_SLOTS.length)];
  const n = Math.min(secondaryStatCount(rarity), pool.length);
  const left = [...pool];
  const secondaryStats = [];
  for (let k = 0; k < n; k++) {
    const def = left.splice(Math.floor(rng() * left.length), 1)[0];
    const u = rng();
    const v = def.minValue + (secondaryStatCeiling(def, level) - def.minValue) * u * u;
    secondaryStats.push({ type: def.type, value: Number(v.toFixed(def.decimals)) });
  }
  return { slot, rarity, itemLevel: level, quality: 50, primaryStats: primaries(cls, slot, rarity, level), secondaryStats, conduit: null };
}

function character(g, level, items, path) {
  const points = path ? awakeningPointsForLevel(level) : 0;
  return normaliseCharacter({
    id: `baseline-${g.id.toLowerCase()}-${level}`,
    name: `${guideSpecLabel(g)}, level ${level}`,
    class: g.cls,
    level,
    talentSets: [{ spec: g.spec, allocation: {} }],
    equipment: { set1: { items, enchantSlots: {} } },
    awakening: { path: points > 0 ? path : null, level: points },
    presets: [
      { id: 'ref', name: 'Baseline', equipmentSet: 1, talentSet: 0, petId: null, mountId: null, relicIds: [], sigilSpecies: [], utilitySigilSpecies: null, ancientSigilSpecies: null, transcendencePresetId: null, sheet: null },
      { id: 'ref-2', name: 'Spare', equipmentSet: 1, talentSet: 0, sheet: null },
    ],
    activePresetId: 'ref',
  });
}

const statsOf = (c) => buildFighter(c, 'ref').stats;
const expectedRollOf = (def, level) => def.minValue + (secondaryStatCeiling(def, level) - def.minValue) / 3;
/** [stat key, expected roll] for every line the class can roll. */
const rollSizes = (cls, level) => secondaryPoolFor(cls).map((d) => [totalKeyOfType(d.type), expectedRollOf(d, level)]);
const flatAttack = (s) => s.totalAttack / (1 + (s.totalAttackPercent ?? 0) / 100);
const flatHp = (s) => s.totalHp / (1 + (s.totalHealthPercent ?? 0) / 100);

/**
 * Everything one spec, level and profile share: the per-unit value of each stat key and of a point of
 * item Attack and Health, the Attunement bans, the drop pool and odds.
 */
export function baselineSetup(guide, id, level, profileId) {
  const g = guideSpec(id);
  const profile = profileById(profileId);
  const values = statValues(guide, id, level);
  // each list on its own scale, its best roll = 100: time alive moves by larger percentages than DPS, so
  // raw percentages would let survival swamp damage in Balanced
  const scale = (kind) => {
    const top = Math.max(0, ...rollSizes(g.cls, level).map(([k, roll]) => (values[kind].get(k) ?? 0) * roll));
    return top > 0 ? 100 / top : 0;
  };
  const nD = scale('damage');
  const nS = profile.survival * scale('survival');
  const worth = new Map();
  for (const [k, v] of values.damage) worth.set(k, v * nD);
  for (const [k, v] of values.survival) worth.set(k, (worth.get(k) ?? 0) + nS * v);
  // a point of item Attack (or Health) is worth its share of a typical flat total: the class base plus nine
  // items of the best rarity the level drops at 2 % or more
  const rates = DROP_RARITY_ORDER.map((r) => ({ v: r.toUpperCase(), w: dropRatesForLevel(level)?.[r.toLowerCase()] ?? 0 })).filter((r) => r.w > 0);
  const typical = [...rates].reverse().find((r) => r.w >= 2)?.v ?? rates[0].v;
  const items = Object.fromEntries(BASE_SLOTS.map((slot) => [slot, { rarity: typical, itemLevel: level, quality: 50, primaryStats: primaries(g.cls, slot, typical, level), secondaryStats: [], conduit: null }]));
  const s = statsOf(character(g, level, items, null));
  // a point of flat Attack moves DPS by about 100 / flat %, of flat Health time alive by about 100 / flat %
  const perAttack = (nD * 100) / flatAttack(s);
  const perHp = (nS * 100) / flatHp(s);
  const classPool = secondaryPoolFor(g.cls);
  const bans = BASELINE.attunementBans + attunementBonus(g.cls);
  const ranked = [...classPool].sort((a, b) => (worth.get(totalKeyOfType(a.type)) ?? 0) - (worth.get(totalKeyOfType(b.type)) ?? 0));
  const banned = ranked.slice(0, bans).map((d) => d.type);
  const pool = classPool.filter((d) => !banned.includes(d.type));
  return { g, level, profile, worth, perAttack, perHp, rates, pool, banned };
}

/** An item's worth to the setup's player: its primaries and lines at their per-unit values. */
export function itemScore(setup, item) {
  let v = item.primaryStats.attack * setup.perAttack + item.primaryStats.hp * setup.perHp;
  for (const l of item.secondaryStats) v += l.value * (setup.worth.get(totalKeyOfType(l.type)) ?? 0);
  return v;
}

/** The Awakening paths the level has points for; none below the unlock. */
const pathsAt = (level) => (awakeningPointsForLevel(level) > 0 ? Object.keys(AWAKENING_PATHS) : [null]);

/**
 * One simulated player: `drops` drops, the best of each slot by `itemScore` kept, then the Awakening path
 * that adds the most by the same values. Returns the sheet totals and the path.
 */
export function simulatePlayer(setup, rng, drops = BASELINE.drops) {
  const kept = {};
  for (let i = 0; i < drops; i++) {
    const it = rollDrop(rng, setup.g.cls, setup.level, setup.rates, setup.pool);
    const score = itemScore(setup, it);
    if (!kept[it.slot] || score > kept[it.slot].score) kept[it.slot] = { score, item: it };
  }
  const items = Object.fromEntries(Object.entries(kept).map(([slot, k]) => {
    const { slot: _s, ...item } = k.item; // eslint-disable-line no-unused-vars
    return [slot, item];
  }));
  let best = null;
  for (const path of pathsAt(setup.level)) {
    const stats = statsOf(character(setup.g, setup.level, items, path));
    const value = Object.entries(stats).reduce((a, [k, v]) => a + (typeof v === 'number' ? v * (setup.worth.get(k) ?? 0) : 0), 0)
      + flatAttack(stats) * setup.perAttack * (1 + (stats.totalAttackPercent ?? 0) / 100) + flatHp(stats) * setup.perHp * (1 + (stats.totalHealthPercent ?? 0) / 100);
    if (!best || value > best.value) best = { value, stats, path };
  }
  return { stats: best.stats, path: best.path };
}

const quantile = (sorted, p) => {
  const i = (sorted.length - 1) * p;
  const a = Math.floor(i);
  return sorted[a] + (sorted[Math.min(a + 1, sorted.length - 1)] - sorted[a]) * (i - a);
};

/**
 * One table entry: `players` simulated players of spec `id` at `level` keeping by `profileId`. Each row is
 * a sheet stat the build gets something in, with the middle range (BASELINE.percentiles) and median of
 * its total. Rows: Attack, Health, then the stats the profile values, most per roll first, then the rest.
 */
export function runBaseline(guide, id, level, profileId, { players = BASELINE.players, drops = BASELINE.drops, seed = 1 } = {}) {
  const setup = baselineSetup(guide, id, level, profileId);
  const rng = mulberry32(hashSeed('spec-baseline', seed, id, level, profileId));
  const all = [];
  const paths = {};
  for (let i = 0; i < players; i++) {
    const p = simulatePlayer(setup, rng, drops);
    all.push(p.stats);
    paths[p.path ?? 'none'] = (paths[p.path ?? 'none'] ?? 0) + 1;
  }
  const base = statsOf(character(setup.g, level, {}, null));
  const keys = Object.keys(all[0]).filter((k) => typeof all[0][k] === 'number' && (statByKey(k) || STAT_ORDER_HEAD.includes(k)) && all.some((s) => s[k] !== base[k]));
  const perRoll = (k) => {
    const def = setup.pool.find((d) => totalKeyOfType(d.type) === k);
    return (setup.worth.get(k) ?? 0) * (def ? expectedRollOf(def, level) : 0);
  };
  const order = (k) => (STAT_ORDER_HEAD.includes(k) ? -1e9 + STAT_ORDER_HEAD.indexOf(k) : -perRoll(k));
  const [pLo, pHi] = BASELINE.percentiles.map((p) => p / 100);
  const rows = keys.sort((a, b) => order(a) - order(b)).map((k) => {
    const v = all.map((s) => s[k]).sort((x, y) => x - y);
    return { key: k, lo: quantile(v, pLo), median: quantile(v, 0.5), hi: quantile(v, pHi), valued: perRoll(k) > 0 };
  });
  const path = Object.entries(paths).sort((a, b) => b[1] - a[1])[0][0];
  return { id, level, profile: profileId, cls: setup.g.cls, spec: setup.g.spec, path: path === 'none' ? null : path, awakening: awakeningPointsForLevel(level), banned: setup.banned, rows };
}

/** A row's total as the sheet shows it, multipliers ×100 as percent; flats in thousands from 10,000 (314k). */
export function formatTotal(key, value) {
  const def = statByKey(key);
  if (key === 'totalAttack' || key === 'totalHp') {
    return value >= 10000 ? `${Number((value / 1000).toFixed(value >= 100000 ? 0 : 1))}k` : Math.round(value).toLocaleString('en-US');
  }
  const mult = displayMult(def?.enumName ?? '') || 1;
  const v = value * mult;
  return `${Number(v.toFixed(v >= 100 ? 0 : 1))}%`;
}

/** Round a range for the share text: whole numbers above 10, else one decimal. */
export function rangeText(key, row) {
  const lo = formatTotal(key, row.lo);
  const hi = formatTotal(key, row.hi);
  if (lo === hi) return lo;
  const unit = hi.endsWith('%') ? '%' : hi.endsWith('k') && lo.endsWith('k') ? 'k' : '';
  return `${unit ? lo.slice(0, -1) : lo}-${hi}`;
}

const HEAD_LABELS = { totalAttack: 'Attack', totalHp: 'Health' };
export const statLabel = (key) => HEAD_LABELS[key] ?? statByKey(key)?.sheetLabel ?? key;

/** The plain-text version for sharing: one line per valued stat, Attack and Health first. */
export function baselineText(entries, { valuedOnly = true } = {}) {
  const first = entries[0];
  const g = guideSpec(first.id);
  const lines = [`${guideSpecLabel(g)}: stat baseline (${profileById(first.profile).label} build)`, 'Gear and Awakening only; talents, sigils, pets, mounts, relics and stones come on top.'];
  for (const e of entries) {
    lines.push('', `Level ${e.level}${e.path ? ` (${AWAKENING_PATHS[e.path].name}, ${e.awakening} points)` : ''}`);
    for (const r of e.rows.filter((x) => !valuedOnly || x.valued || STAT_ORDER_HEAD.includes(x.key))) lines.push(`${statLabel(r.key)}: ${rangeText(r.key, r)}`);
  }
  return lines.join('\n');
}

export { GUIDE_SPECS, guideSpec, guideSpecLabel, classLabel };
