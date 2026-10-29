// features/specGuide.js: per-roll stat values. For each spec and level band, what one typical gear roll of
// each stat is worth to a reference build of that spec, ranked. The Spec baseline (specBaseline.js) keeps
// gear by these values. Contract: docs/Reference/simulation.md §Spec stat guide.
//
//   referenceCharacter()  a clean build of one spec at one level band (gear, talents, sigils only)
//   rollSteps()           one expected gear secondary roll per stat, as stat-weight steps
//   specGuideRequest()    the stat-weights request of a reference build, probed one roll per stat
//   runSpecGuide()        one guide entry: damage on the training dummy, time alive against the reference enemy
//   guideRanking()        a chart's bars as a ranking: top stat 100, the rest relative to it
//
// The tables are generated ahead of time (scripts/specGuide.mjs -> src/data/specGuide.json),
// because every spec and band takes minutes of fights.
import { normaliseCharacter } from '../model/index.js';
import { sanitiseAllocation } from '../model/talents.js';
import { talentSpec, TALENT_CONSTANTS } from '../game/talents.js';
import { SPECS, classOfSpec, classLabel, available } from '../game/classes.js';
import { BASE_SLOTS, SECONDARY_STAT_POOL, rarityById, secondaryStatCount, secondaryStatCeiling, slotWeights } from '../game/gear.js';
import { capConfig } from '../engine/core/caps.js';
import { SPEC_SIGIL_LOADOUTS } from '../build/fixtures.js';
import { simulatePve, preparePveFighter } from '../engine/pve/fight.js';
import { fightRng, hashSeed } from '../engine/rng.js';
import {
  STAT_WEIGHT_STEPS, STAT_WEIGHT_PRECISION, REFERENCE_ENEMY, stepsFor, statWeightsRequest, runStatWeights, chartBars,
} from './statWeights.js';

/** The guide's specs: every spec, the Druid three ways (its Form sigil changes which stats matter). */
export const GUIDE_SPECS = Object.freeze([
  { id: 'WARRIOR_DPS', spec: 'WARRIOR_DPS' },
  { id: 'WARRIOR_TANK', spec: 'WARRIOR_TANK' },
  { id: 'SENTINEL_MARKSMANSHIP', spec: 'SENTINEL_MARKSMANSHIP' },
  { id: 'SENTINEL_DISRUPTION', spec: 'SENTINEL_DISRUPTION' },
  { id: 'MYSTIC_MAGE', spec: 'MYSTIC_MAGE' },
  { id: 'MYSTIC_DRUID_BEAR', spec: 'MYSTIC_DRUID', utility: 'DIRE_URSINE', form: 'Bear' },
  { id: 'MYSTIC_DRUID_WOLF', spec: 'MYSTIC_DRUID', utility: 'ALPHA_LUPINE', form: 'Wolf' },
  { id: 'MYSTIC_DRUID_FORMLESS', spec: 'MYSTIC_DRUID', utility: null, form: 'no form' },
  { id: 'NECROMANCER_DEATHLORD', spec: 'NECROMANCER_DEATHLORD' },
  { id: 'NECROMANCER_DOOMWEAVER', spec: 'NECROMANCER_DOOMWEAVER' },
].map((g) => Object.freeze({ ...g, cls: classOfSpec(g.spec) })));

export const guideSpec = (id) => GUIDE_SPECS.find((g) => g.id === id) ?? null;

/** "Mystic · Druid (Bear)" */
export function guideSpecLabel(g) {
  const name = SPECS.find((s) => s.key === g.spec)?.name ?? g.spec;
  return `${classLabel(g.cls)} · ${name}${g.form ? ` (${g.form})` : ''}`;
}

/**
 * Level bands and what a reference build has at each: gear rarity (item level = the band), Sigil Altar
 * tier and sigil level. Modelling choices, not game data: a typical player of that level.
 */
export const GUIDE_BANDS = Object.freeze([
  { level: 40, rarity: 'LEGENDARY', altarTier: 2, sigilLevel: 10 },
  { level: 60, rarity: 'MYTHIC', altarTier: 3, sigilLevel: 15 },
  { level: 80, rarity: 'DIVINE', altarTier: 4, sigilLevel: 20 },
  { level: 100, rarity: 'ETERNAL', altarTier: 5, sigilLevel: 25 },
].map((b) => Object.freeze(b)));

export const guideBand = (level) => GUIDE_BANDS.find((b) => b.level === level) ?? null;

// CRIT_CHANCE -> totalCritChance (the accumulator names of pipeline/totals.js, as sheet keys)
export const totalKeyOfType = (type) => `total${type.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`;
const POOL_BY_KEY = new Map(SECONDARY_STAT_POOL.map((def) => [totalKeyOfType(def.type), def]));

/**
 * The expected gear secondary roll of a pool entry at item level `level`: the roll is min + (ceiling -
 * min) * random^2, so its mean is min + (ceiling - min) / 3 (gear.md §4), rounded to the stat's decimals.
 */
export function expectedRoll(def, level) {
  const v = def.minValue + (secondaryStatCeiling(def, level) - def.minValue) / 3;
  return Number(v.toFixed(def.decimals));
}

// multiplier stats (0.1 = +10 % on the sheet) and the rest (percent points)
const MULTIPLIER_KEYS = new Set(['totalAttackSpeed', 'totalCritDamage', 'totalMinionAttackSpeed']);
const unitOf = (key, v) => (MULTIPLIER_KEYS.has(key) ? `+${Number((v * 100).toFixed(1))}%` : `+${v}%`);

/**
 * One gear roll per stat the class has, as stat-weight steps: the class's STAT_WEIGHT_STEPS that a gear
 * secondary can roll (flat Attack and Health are item primaries, not rolls), the step one expected roll.
 * @returns {Array<{key, step, unit, chart, type, cap}>}
 */
export function rollSteps(cls, level) {
  return stepsFor(cls)
    .filter((s) => POOL_BY_KEY.has(s.key) && available(POOL_BY_KEY.get(s.key).type, cls))
    .map((s) => {
      const def = POOL_BY_KEY.get(s.key);
      const step = expectedRoll(def, level);
      return { key: s.key, step, unit: unitOf(s.key, step), chart: s.chart, type: def.type, cap: capConfig(def.type) };
    });
}

const fullTalents = (spec, points) => {
  const all = {};
  for (const tier of talentSpec(spec).tiers) for (const t of tier.talents) all[t.id] = t.maxRank;
  return sanitiseAllocation(all, spec, points);
};

/** Talent points at `level`: one per level from the first talent level, up to the total (talents.md). */
export const talentPointsAt = (level) => Math.max(0, Math.min(TALENT_CONSTANTS.totalTalentPoints, level - TALENT_CONSTANTS.firstTalentLevel + 1));

/**
 * The reference build of one guide spec at one band: every base slot an item of the band's rarity at
 * item level = the band, primaries `floor(base + level * scale)` times the class's slot weight (gear.md
 * §3), and the rarity's secondary lines filled round-robin with one expected roll of each stat the guide
 * probes, so every stat starts from about one roll. The spec's talents (as many points as the level has)
 * and sigils (SPEC_SIGIL_LOADOUTS, no Ancient: it needs a Transcendence node). No pet, mount, relic,
 * stone, Awakening, Transcendence or fortress: those vary too much between players to be a baseline.
 * @param {Object} g  a GUIDE_SPECS entry
 * @param {number} level  a GUIDE_BANDS level
 */
export function referenceCharacter(g, level) {
  const band = guideBand(level);
  if (!g || !band) throw new Error(`specGuide: no reference build for ${g?.id} at level ${level}`);
  const rarity = rarityById(band.rarity);
  const lines = rollSteps(g.cls, level);
  let next = 0;
  const items = {};
  for (const slot of BASE_SLOTS) {
    const w = slotWeights(g.cls, slot);
    const secondaryStats = [];
    for (let k = 0; k < secondaryStatCount(band.rarity); k++) {
      const r = lines[next++ % lines.length];
      secondaryStats.push({ type: r.type, value: r.step });
    }
    items[slot] = {
      rarity: band.rarity, itemLevel: level, quality: 50,
      primaryStats: {
        attack: Math.round(Math.floor(rarity.atkBase + level * rarity.atkScale) * w.attack),
        hp: Math.round(Math.floor(rarity.hpBase + level * rarity.hpScale) * w.hp),
      },
      secondaryStats, conduit: null,
    };
  }
  const loadout = SPEC_SIGIL_LOADOUTS[g.spec];
  const utility = g.utility !== undefined ? g.utility : loadout.utility;
  const species = [...loadout.generic, utility].filter(Boolean);
  return normaliseCharacter({
    id: `guide-${g.id.toLowerCase()}-${level}`,
    name: `${guideSpecLabel(g)}, level ${level}`,
    class: g.cls,
    level,
    talentSets: [{ spec: g.spec, allocation: fullTalents(g.spec, talentPointsAt(level)) }],
    equipment: { set1: { items, enchantSlots: {} } },
    sigils: { altarTier: band.altarTier, owned: Object.fromEntries(species.map((s) => [s, { level: band.sigilLevel }])) },
    presets: [
      {
        id: 'ref', name: 'Reference', equipmentSet: 1, talentSet: 0, petId: null, mountId: null, relicIds: [],
        sigilSpecies: loadout.generic, utilitySigilSpecies: utility, ancientSigilSpecies: null,
        transcendencePresetId: null, sheet: null,
      },
      { id: 'ref-2', name: 'Spare', equipmentSet: 1, talentSet: 0, sheet: null },
    ],
    activePresetId: 'ref',
  });
}

/** The stat-weights request of one reference build, one roll per stat. */
export function specGuideRequest(g, level, { precision = 'standard', seed = 1 } = {}) {
  const character = referenceCharacter(g, level);
  return statWeightsRequest(character, 'ref', { precision, seed, steps: rollSteps(g.cls, level) });
}

/**
 * Time alive for the guide's survival list: how long the build lasts against the pressure enemy (the
 * reference enemy at 10 swings a second, so damage drains steadily against the build's healing instead
 * of landing in one-shot chunks), capped at `capSeconds`. Its Attack is set so the base build lasts
 * about `targetSeconds`, and a roll's worth is the paired change in mean time alive, in percent. A
 * continuous measure: the Stat weights page's 0/1 survival sits on a knife edge where one roll flips
 * most fights, which ranks but gives no sizes.
 */
export const TIME_ALIVE = Object.freeze({ capSeconds: 60, targetSeconds: 15, band: [13, 17], n: 64, maxTries: 24 });
export const PRESSURE_ENEMY = Object.freeze({ ...REFERENCE_ENEMY, id: 'spec-guide-pressure', attackSpeed: 10 });

function timeAlive(prepared, enemy, seed, n) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = simulatePve({ fighter: prepared, enemy, maxMs: TIME_ALIVE.capSeconds * 1000, rng: fightRng(seed, i) }).timeMs / 1000;
  }
  return out;
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/**
 * The pressure enemy's Attack at which `prepared` lasts about TIME_ALIVE.targetSeconds on average: x2 / ÷2
 * until the band is bracketed, then bisection in log space. Its own seed, never the measured fights.
 * @returns {{attack: number, seconds: number, tries: number, inBand: boolean}}
 */
export function calibrateTimeAlive(prepared, startAttack, { seed = 1 } = {}) {
  const calSeed = hashSeed('spec-guide-calibration', seed);
  const [lo, hi] = TIME_ALIVE.band;
  let attack = Math.max(1, Math.round(startAttack));
  let weak = null; // an Attack the build outlasts the band against
  let strong = null; // an Attack that kills it before the band
  let best = null;
  for (let tries = 1; tries <= TIME_ALIVE.maxTries; tries++) {
    const t = mean(timeAlive(prepared, { ...PRESSURE_ENEMY, attack }, calSeed, TIME_ALIVE.n));
    if (!best || Math.abs(t - TIME_ALIVE.targetSeconds) < Math.abs(best.seconds - TIME_ALIVE.targetSeconds)) best = { attack, seconds: t, tries };
    if (t >= lo && t <= hi) return { attack, seconds: t, tries, inBand: true };
    if (t > hi) weak = attack;
    else strong = attack;
    const next = weak != null && strong != null ? Math.round(Math.sqrt(weak * strong)) : t > hi ? attack * 2 : Math.max(1, Math.round(attack / 2));
    if (next === attack) break;
    attack = next;
  }
  return { ...best, inBand: false };
}

/**
 * A chart's bars (chartBars 'damage' kind: paired change in percent of the base mean) as a ranking.
 * `value` is the change one roll makes in percent; `score` puts the best measurable stat at 100 and the
 * others relative to it (null when the stat has no clear positive effect). Best first.
 * @param {Array<Object>} bars  chartBars output
 * @param {Array<Object>} steps  the rollSteps the run probed (roll size, unit, cap)
 */
export function guideRanking(bars, steps) {
  const byKey = new Map(steps.map((s) => [s.key, s]));
  const rows = (bars ?? []).filter((b) => byKey.has(b.key)).map((b) => {
    const s = byKey.get(b.key);
    return {
      key: b.key, label: b.label, roll: s.step, unit: s.unit, cap: s.cap ?? null,
      value: b.pct ?? 0, lo: b.pctLo ?? 0, hi: b.pctHi ?? 0, measurable: b.measurable && b.delta > 0,
    };
  });
  const top = Math.max(0, ...rows.filter((r) => r.measurable).map((r) => r.value));
  for (const r of rows) r.score = r.measurable && top > 0 ? Math.round((r.value / top) * 100) : null;
  return rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.value - a.value);
}

const round = (x, d) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);
const slim = (r) => ({ ...r, value: round(r.value, 3), lo: round(r.lo, 3), hi: round(r.hi, 3) });

/**
 * One guide entry: the reference build of `g` at `level`, one roll per stat, ranked for damage (mean
 * DPS over 60 s on the training dummy) and survival (time alive, TIME_ALIVE).
 * @param {{precision?: string, seed?: number, sample?: Function}} [o]  `sample` as runStatWeights takes it
 */
export async function runSpecGuide(g, level, { precision = 'thorough', seed = 1, sample } = {}) {
  const req = specGuideRequest(g, level, { precision, seed });
  const steps = rollSteps(g.cls, level);
  const n = (STAT_WEIGHT_PRECISION[precision] ?? STAT_WEIGHT_PRECISION.thorough).nDps;
  const dmg = await runStatWeights({ ...req, probes: req.probes.filter((p) => p.chart === 'damage') }, { sample });
  const base = preparePveFighter(req.base);
  const cal = calibrateTimeAlive(base, (req.base.stats.totalHp ?? 1) / 300, { seed });
  const enemy = { ...PRESSURE_ENEMY, attack: cal.attack };
  const b = timeAlive(base, enemy, seed, n);
  const probes = req.probes.filter((p) => p.chart === 'survival')
    .map((p) => ({ ...p, samples: timeAlive(preparePveFighter(p.fighter), enemy, seed, n) }));
  const loadout = SPEC_SIGIL_LOADOUTS[g.spec];
  // a roll the class's stat pipeline does not pass on (e.g. a Mystic's Damage Reduction) leaves every stat as it was
  const inert = new Set(req.probes.filter((p) => Object.keys(p.fighter.stats).every((k) => p.fighter.stats[k] === req.base.stats[k])).map((p) => p.key));
  const mark = (r) => ({ ...slim(r), ...(inert.has(r.key) ? { inert: true } : {}) });
  return {
    id: g.id, level, cls: g.cls, spec: g.spec,
    sigils: [...loadout.generic, g.utility !== undefined ? g.utility : loadout.utility].filter(Boolean),
    band: guideBand(level),
    base: { dps: Math.round(dmg.damage.base.mean), timeAlive: round(mean(b), 2), enemyAttack: cal.attack, calibrated: cal.inBand },
    n,
    damage: guideRanking(dmg.damage.bars, steps).map(mark),
    survival: guideRanking(chartBars('damage', b, probes), steps).map(mark),
  };
}
