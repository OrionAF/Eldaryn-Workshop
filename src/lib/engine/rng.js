// Seedable RNGs for the engine. Every generator is a function () -> number in [0, 1).
// Engines take the rng as an argument and never call Math.random (rebuild-plan §6).

/** Hash any mix of strings/numbers to one uint32 seed (FNV-1a over the joined parts, then avalanche). */
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  // the joined string of the parts, built without the map/join arrays (hot: one call per fight and lane)
  let s = parts.length > 0 ? String(parts[0]) : '';
  for (let i = 1; i < parts.length; i++) s += '\u001f' + String(parts[i]);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32: one 32-bit seed. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A lane-capable rng for one fight: itself a mulberry32 stream, plus `rng.lane(name)`, which returns
 * an independent child stream (same kind, so lanes nest) seeded from `(seed, name)` and created
 * once per name. Each actor and draw purpose reads its own lane, so a build change that adds or
 * removes draws in one lane (an extra swing, a new proc) leaves every other lane's draws aligned
 * between the two builds (common random numbers; see docs/Reference/simulation.md §Common random
 * numbers). Every lane is uniform and independent, so each fight's distribution is unchanged.
 */
export function laneRng(seed) {
  const s = seed >>> 0;
  const rng = mulberry32(s);
  const kids = new Map();
  rng.lane = (name) => {
    let k = kids.get(name);
    if (k === undefined) {
      k = laneRng(hashSeed(s, 'lane', name));
      kids.set(name, k);
    }
    return k;
  };
  return rng;
}

/**
 * The `name` lane of `rng`, or `rng` itself when it has no lanes (a plain or scripted function):
 * every call site works with either, and a plain function keeps its exact draw order.
 */
export function lane(rng, name) {
  return typeof rng?.lane === 'function' ? rng.lane(name) : rng;
}

/**
 * The rng of fight `i` of a sample seeded `seed`: a lane rng (laneRng), the same for every build, so
 * two builds measured on one seed are paired fight by fight and lane by lane.
 */
export const fightRng = (seed, i) => laneRng(hashSeed(seed, i));

/** sfc32: four 32-bit seeds; a missing seed defaults to 0. Warmed up 12 draws. */
export function sfc32(a = 0, b = 0, c = 0, d = 0) {
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const next = function () {
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + t) >>> 0;
    return t / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  return next;
}

/**
 * Scripted rng for port tests: returns the given values in order, throws when they run out.
 * `rng.draws` is the number of draws so far; `rng.remaining` the number left.
 */
export function scripted(values) {
  const list = [...values];
  let i = 0;
  const rng = function () {
    if (i >= list.length) {
      throw new Error(`scripted rng exhausted: draw ${i + 1} requested, only ${list.length} scripted`);
    }
    return list[i++];
  };
  Object.defineProperty(rng, 'draws', { get: () => i });
  Object.defineProperty(rng, 'remaining', { get: () => list.length - i });
  return rng;
}
