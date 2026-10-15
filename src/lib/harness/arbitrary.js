// harness/arbitrary.js (H1): seeded generators and the `forAll` runner of the property tests (plan C).
// In-house, no dependency: a generator is `(rng) => value` over an injected mulberry32, so a failure
// prints the run index, the seed and the generated JSON and replays exactly. Test support only.
import { mulberry32, hashSeed } from '../engine/rng.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { relicsForClass } from '../game/relics.js';
import { sigilConditionOptions, ownableSigils } from '../model/sigils.js';
import { newOpponent, normaliseOpponent } from '../model/opponents.js';
import { SHEET_KEY_META, sheetKeysForClass } from '../engine/pipeline/sheet.js';
import { REQUIRED_STATS } from '../features/duel.js';
import { HARNESS_SPECS } from './specs.js';

/** Runs per property: as asked by default, ten times that under HARNESS_DEEP=1. */
export const runsFor = (n) => (process.env.HARNESS_DEEP ? n * 10 : n);

// --- primitives (each takes the rng first) ---

export const int = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
export const float = (rng, lo, hi) => lo + rng() * (hi - lo);
export const chance = (rng, p) => rng() < p;
export const pick = (rng, list) => list[Math.floor(rng() * list.length)];
export const sample = (rng, list, k) => {
  const pool = [...list];
  const out = [];
  while (out.length < k && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
};

const show = (value) => {
  try {
    return JSON.stringify(value, (_, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v === undefined ? '<undefined>' : v));
  } catch {
    return String(value);
  }
};

/**
 * Run `prop(value, rng)` on `runs` generated values. A throw is rethrown with the run index, the seed and
 * the value as JSON; `gen(mulberry32(hashSeed(seed, name, run)))` regenerates it.
 * @param {string} name
 * @param {(rng: () => number) => any} gen
 * @param {(value: any, rng: () => number) => void} prop
 * @param {{runs?: number, seed?: number}} [o]
 */
export function forAll(name, gen, prop, { runs = 100, seed = 1 } = {}) {
  const n = runsFor(runs);
  for (let run = 0; run < n; run++) {
    const value = gen(mulberry32(hashSeed(seed, name, run)));
    try {
      prop(value, mulberry32(hashSeed(seed, name, run, 'prop')));
    } catch (cause) {
      const err = new Error(`${name}: failed on run ${run} of ${n} (seed ${seed})\n${cause?.message ?? cause}\ninput: ${show(value)}`);
      err.cause = cause;
      throw err;
    }
  }
}

// --- junk ---

const JUNK_LEAVES = [
  () => null, () => undefined, () => NaN, () => Infinity, () => -Infinity, () => -1, () => 0, () => 1e300,
  () => '', () => 'x', () => '12.5', () => '1.234', () => true, () => false, () => [], () => ({}), () => [null, 1, 'a'],
  (rng) => rng() * 1e6, (rng) => -rng() * 100, (rng) => Math.floor(rng() * 200) - 50,
  (rng) => ({ type: 'ATTACK_PERCENT', value: rng() * 1e4 }),
];
const JUNK_KEYS = ['id', 'type', 'value', 'level', 'items', 'stats', 'class', 'spec', 'x'];

/** Any JSON-ish value including NaN, +-Infinity and undefined; nested objects and arrays up to `depth`. */
export function arbJunk(rng, depth = 2) {
  const r = rng();
  if (depth > 0 && r < 0.2) return Array.from({ length: int(rng, 0, 4) }, () => arbJunk(rng, depth - 1));
  if (depth > 0 && r < 0.4) {
    const o = {};
    for (let i = 0, n = int(rng, 0, 4); i < n; i++) o[pick(rng, JUNK_KEYS)] = arbJunk(rng, depth - 1);
    return o;
  }
  return pick(rng, JUNK_LEAVES)(rng);
}

function pathsOf(value, prefix = [], out = []) {
  if (value && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      out.push([...prefix, k]);
      pathsOf(value[k], [...prefix, k], out);
    }
  }
  return out;
}

/** A deep copy of `obj` with `count` random paths replaced by junk or deleted (structuredClone keeps NaN and Infinity). */
export function junkify(obj, rng, count = 3) {
  const copy = structuredClone(obj);
  const all = pathsOf(copy);
  for (let i = 0; i < count && all.length; i++) {
    const p = pick(rng, all);
    let at = copy;
    for (let j = 0; j < p.length - 1; j++) at = at?.[p[j]];
    if (at && typeof at === 'object') {
      // JSON has no holes: an array element is set to undefined, an object key is deleted
      if (chance(rng, 0.15) && !Array.isArray(at)) delete at[p[p.length - 1]];
      else at[p[p.length - 1]] = arbJunk(rng, 1);
    }
  }
  return copy;
}

// --- characters ---

const LEVELS = [1, 14, 15, 21, 22, 24, 27, 28, 37, 38, 39, 40, 44, 45, 53, 54, 55, 58, 59, 72, 100];
const CONDITION_POOL = ['ON_COOLDOWN', 'ENEMY_HP_BELOW_80', 'ENEMY_HP_BELOW_20', 'MY_HP_BELOW_60', 'MY_HP_BELOW_20', 'NOPE', 5];
const ITEM_STATS = ['ATTACK_PERCENT', 'CRIT_CHANCE', 'CRIT_DAMAGE', 'ATTACK_SPEED', 'HEALTH_PERCENT', 'LIFESTEAL', 'PENETRATION', 'SPELL_DAMAGE', 'DOUBLE_HIT', 'MISS_CHANCE', 'BLOCK_CHANCE', 'DAMAGE_REDUCTION'];

const fixtures = new Map();
function baseFixture(spec) {
  if (!fixtures.has(spec.label)) {
    const c = fixtureCharacter(spec.cls, { spec: spec.key });
    if (spec.key === 'MYSTIC_DRUID') {
      // the Druid variant: BEAR / WOLF Form sigil in the utility slot, or none (formless)
      if (spec.utility) c.sigils.owned[spec.utility] = { level: 1 };
      for (const p of c.presets) p.utilitySigilSpecies = spec.utility;
    }
    fixtures.set(spec.label, normaliseCharacter(c));
  }
  return fixtures.get(spec.label);
}

/**
 * A RAW character: a fixture of the spec with fields pushed past the game's gates (level, talent and
 * relic counts, sigil conditions and levels, item and stone values, conduits, glyph quality). It is what
 * `normaliseCharacter` must repair, so it is not itself legal.
 * @param {() => number} rng
 * @param {{spec?: import('./specs.js').HarnessSpec}} [o]
 */
export function arbRawCharacter(rng, { spec = pick(rng, HARNESS_SPECS) } = {}) {
  const c = structuredClone(baseFixture(spec));
  c.level = chance(rng, 0.6) ? pick(rng, LEVELS) : int(rng, 1, 100);
  c.extraRelicSlots = chance(rng, 0.3) ? int(rng, -1, 5) : int(rng, 0, 2);

  if (chance(rng, 0.7)) {
    for (const set of c.talentSets) for (const id of Object.keys(set.allocation)) set.allocation[id] = int(rng, 0, 12);
  }
  const relicIds = relicsForClass(c.class).map((r) => r.id);
  if (chance(rng, 0.6)) {
    for (const id of relicIds) if (chance(rng, 0.8)) c.relics[id] = int(rng, 0, 12);
    for (const p of c.presets) if (chance(rng, 0.7)) p.relicIds = sample(rng, relicIds, int(rng, 0, relicIds.length));
  }
  for (const sp of Object.keys(c.sigils.owned)) {
    if (chance(rng, 0.5)) c.sigils.owned[sp].condition = pick(rng, CONDITION_POOL);
    if (chance(rng, 0.4)) c.sigils.owned[sp].level = int(rng, -2, 40);
  }
  if (chance(rng, 0.3)) {
    for (const sp of sample(rng, ownableSigils(c.class).map((s) => s.species), 3)) {
      c.sigils.owned[sp] = { level: int(rng, 1, 30), condition: pick(rng, CONDITION_POOL) };
    }
  }
  c.sigils.altarTier = chance(rng, 0.3) ? int(rng, -1, 12) : int(rng, 1, 8);

  for (const set of Object.values(c.equipment)) {
    for (const item of Object.values(set.items)) {
      if (!item || !chance(rng, 0.5)) continue;
      if (chance(rng, 0.4)) item.itemLevel = int(rng, 1, 400);
      if (chance(rng, 0.4)) item.rarity = pick(rng, ['COMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'ANCIENT', 'ETERNAL', 'OBLIVION', 'NOPE']);
      item.secondaryStats = Array.from({ length: int(rng, 0, 5) }, () => ({
        type: pick(rng, ITEM_STATS), value: chance(rng, 0.3) ? float(rng, 0, 1e4) : float(rng, 0, 20),
      }));
      item.conduit = chance(rng, 0.6) ? { type: pick(rng, ['FLAME', 'EARTHEN', 'DARK', 'VOID']), value: float(rng, 0, 100) } : null;
    }
  }
  for (const pool of [c.enchantStones, c.oblivionEnchantStones]) {
    for (const s of pool ?? []) {
      if (chance(rng, 0.5)) s.type = pick(rng, ['PVE_ATTACK', 'PVE_DEFENSE', 'OBLIVION', 'NOPE']);
      s.stats = Array.from({ length: int(rng, 0, 5) }, () => ({ type: pick(rng, ITEM_STATS), value: float(rng, -5, 1e4) }));
      if (chance(rng, 0.3)) s.activated = false;
      if (chance(rng, 0.3)) s.amplifyLevel = int(rng, -3, 20);
    }
  }
  // a stone sitting in the wrong realm's pool
  if (chance(rng, 0.3)) c.oblivionEnchantStones.push({ id: 'ob-x', type: 'PVE_ATTACK', activated: true, quality: 50, amplifyLevel: 0, oblivionLevel: null, stats: [] });
  if (chance(rng, 0.3)) c.enchantStones.push({ id: 'st-x', type: 'OBLIVION', activated: true, quality: 50, amplifyLevel: 0, oblivionLevel: 2, stats: [] });
  for (const g of c.glyphs ?? []) if (g.secondary && chance(rng, 0.7)) g.secondary.quality = float(rng, -1, 2);

  for (const p of c.presets) {
    if (chance(rng, 0.3)) p.equipmentSet = pick(rng, [1, 2, 3]);
    if (chance(rng, 0.3)) p.talentSet = pick(rng, [0, 1, 2]);
    if (chance(rng, 0.2)) p.transcendencePresetId = pick(rng, ['default', 'nope', null]);
    if (chance(rng, 0.2)) p.mountId = pick(rng, ['mount-a', 'nope', null]);
    if (chance(rng, 0.2)) p.ancientSigilSpecies = pick(rng, [null, ...ownableSigils(c.class).map((s) => s.species)]);
  }
  return c;
}

/** A legal character: `arbRawCharacter` through `normaliseCharacter`. */
export function arbCharacter(rng, o) {
  return normaliseCharacter(arbRawCharacter(rng, o));
}

/** A raw character with a few random fields replaced by junk (NaN, strings, wrong shapes, deletions). */
export function arbJunkCharacter(rng, o) {
  return junkify(arbRawCharacter(rng, o), rng, int(rng, 1, 6));
}

// --- opponents ---

/** The sheet keys a class shows in the base realm. */
export const sheetKeys = (cls) => sheetKeysForClass(cls, 'base');

const REQUIRED = new Set(REQUIRED_STATS.map(([k]) => k));
const REQUIRED_FLOOR = { totalHp: 5e4, totalAttack: 2e3, totalAttackSpeed: 1 };
const KINDS = new Map(SHEET_KEY_META.map((m) => [m.key, m.kind]));

/**
 * An opponent of a random spec whose sheet is filled, then each row left blank with probability
 * `blankRate` (default 0.3). The required rows (HP, Attack, Attack Speed) stay filled unless
 * `blankRequired` is set.
 * @returns {{opponent: Object, blank: string[], spec: import('./specs.js').HarnessSpec}}  `blank`: sheet keys left out
 */
export function arbOpponent(rng, { blankRate = 0.3, spec = pick(rng, HARNESS_SPECS), blankRequired = false } = {}) {
  const o = newOpponent(spec.key, 'Gen');
  const values = {};
  const blank = [];
  for (const key of sheetKeys(spec.cls)) {
    if (chance(rng, blankRate) && (blankRequired || !REQUIRED.has(key))) { blank.push(key); continue; }
    const kind = KINDS.get(key);
    values[key] = REQUIRED_FLOOR[key] ? REQUIRED_FLOOR[key] * float(rng, 0.5, 4)
      : kind === 'integer' ? Math.floor(float(rng, 0, 5e4)) : kind === 'multiplier' ? float(rng, 0, 2) : float(rng, 0, 30);
  }
  o.sheet = { values, enteredAt: null };
  if (spec.utility) o.utility = { species: spec.utility, level: 1 };
  const generic = ownableSigils(spec.cls).filter((s) => s.rarity !== 'Ancient').map((s) => s.species);
  o.sigils = sample(rng, generic, int(rng, 0, 3)).map((species) => ({ species, level: int(rng, 1, 20) }));
  o.conditions = Object.fromEntries(o.sigils.map((s) => [s.species, pick(rng, sigilConditionOptions(s.species, spec.key))]));
  const opponent = normaliseOpponent(o);
  return { opponent, blank: blank.filter((k) => !(k in opponent.sheet.values)), spec };
}
