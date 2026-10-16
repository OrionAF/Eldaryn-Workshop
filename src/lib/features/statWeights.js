// features/statWeights.js (backlog §9): how much one game-sized step of each stat moves a preset, measured
// in the client port. Contract: docs/Reference/simulation.md §Stat weights.
//
// Two halves, like features/swap.js:
//   statWeightsRequest()  main thread, synchronous: the preset's Fighter and one probe Fighter per step,
//                         each the raw total plus the step with the soft cap applied once (anchoredDelta).
//   runStatWeights()      async and pure over the samples (the worker task 'statWeights' runs it): mean
//                         DPS on the training dummy and survival against the reference enemy, each probe a
//                         common-random-number paired contrast against the preset.
import { buildFighter } from '../build/fighter.js';
import { computePresetStats } from '../build/stats.js';
import { anchoredDeltaDetailed } from '../engine/pipeline/anchoredDelta.js';
import { sheetKeysForClass, sheetKeyMeta } from '../engine/pipeline/sheet.js';
import { dpsVsDummyAsync, survivalAsync, meanCI, wilson, pairedT, pairedProportion, metricKey } from '../engine/metrics.js';
import { hashSeed } from '../engine/rng.js';

/**
 * One step per stat (the v1 sizes, backlog §9), in the units anchoredDelta takes: flat for Attack and
 * Health (gear Health), percent points for percent stats, multiplier for Attack Speed, Crit Damage and
 * Minion Attack Speed (0.1 = 10 % on the sheet). `chart` is the metric that ranks it.
 * simulation.md §Stat weights cites this table; it is the only copy.
 */
export const STAT_WEIGHT_STEPS = Object.freeze([
  { key: 'totalAttack', step: 100, unit: '+100', chart: 'damage' },
  { key: 'totalAttackPercent', step: 1, unit: '+1 pt', chart: 'damage' },
  { key: 'totalCritChance', step: 1, unit: '+1%', chart: 'damage' },
  { key: 'totalCritDamage', step: 0.1, unit: '+10%', chart: 'damage' },
  { key: 'totalAttackSpeed', step: 0.1, unit: '+10%', chart: 'damage' },
  { key: 'totalDoubleHit', step: 1, unit: '+1%', chart: 'damage' },
  { key: 'totalSpellDamage', step: 1, unit: '+1%', chart: 'damage' },
  { key: 'totalSpellCritChance', step: 1, unit: '+1%', chart: 'damage' },
  { key: 'totalMinionAttack', step: 1, unit: '+1%', chart: 'damage' },
  { key: 'totalMinionCritChance', step: 1, unit: '+1%', chart: 'damage' },
  { key: 'totalMinionAttackSpeed', step: 0.1, unit: '+10%', chart: 'damage' },
  { key: 'totalHp', step: 1000, unit: '+1.000', chart: 'survival' },
  { key: 'totalHealthPercent', step: 1, unit: '+1 pt', chart: 'survival' },
  { key: 'totalHpRegen', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalLifesteal', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalDamageReduction', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalBlockChance', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalMissChance', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalBlindChance', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalParalyzeChance', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalSpellVamp', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalSoulLink', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalMinionHealth', step: 1, unit: '+1%', chart: 'survival' },
  { key: 'totalMinionLifesteal', step: 1, unit: '+1%', chart: 'survival' },
]);

export const STAT_WEIGHT_CHARTS = ['damage', 'survival'];

/**
 * The reference enemy of the survival chart: a never-dying melee mob (no spells, defence or crit) that
 * swings once per second. Only its Attack is set per run (calibrateAttack): the one value at which the
 * preset itself survives the window about half the time.
 */
export const REFERENCE_ENEMY = Object.freeze({ id: 'stat-weights-reference', mode: 'custom', hp: 1e15, attackSpeed: 1 });

/** Fights per probe. Survival outcomes are 0/1, so they need more fights than the DPS mean. */
export const STAT_WEIGHT_PRECISION = Object.freeze({
  quick: { nDps: 128, nSurvival: 512 },
  standard: { nDps: 256, nSurvival: 1024 },
  thorough: { nDps: 1024, nSurvival: 4096 },
});

/** Family-wise level of one chart, Bonferroni-split over its bars. */
export const STAT_WEIGHT_ALPHA = 0.05;

/** Reference-enemy calibration: fights per try, the band that stops it, and the try limit. */
export const CALIBRATION = Object.freeze({ n: 128, band: [0.35, 0.65], maxTries: 24 });

/** The steps a class's sheet has (stats the class does not have are not probed). */
export function stepsFor(playerClass) {
  const keys = new Set(sheetKeysForClass(playerClass));
  return STAT_WEIGHT_STEPS.filter((s) => keys.has(s.key));
}

/**
 * Stats after one step: the step is added to the raw total and the soft cap applied once (anchoredDelta,
 * the pipeline's cap), so a stat at or past its hard cap moves by about 0.
 * @param {Object} stats  effective stats
 * @param {{key: string, step: number}} step
 * @param {Object} ctx  computePresetStats ctx plus `exact`
 */
export function probeStats(stats, { key, step }, ctx = {}) {
  return anchoredDeltaDetailed(stats, { [key]: step }, ctx).stats;
}

/**
 * The worker request for one preset: its Fighter and a probe Fighter per step (plain data).
 * @param {Object} character  a normalised v2 Character
 * @param {string} [presetId]
 * @param {{precision?: 'quick'|'standard'|'thorough', seed?: number, realm?: 'base'|'oblivion'}} [o]
 */
export function statWeightsRequest(character, presetId, { precision = 'standard', seed = 1, realm = 'base' } = {}) {
  const res = computePresetStats(character, presetId, { realm });
  const base = buildFighter(character, presetId, { realm });
  const ctx = { ...res.ctx, exact: res.exact };
  const prec = STAT_WEIGHT_PRECISION[precision] ?? STAT_WEIGHT_PRECISION.standard;
  const probes = stepsFor(character.class).map((s) => ({
    key: s.key, label: sheetKeyMeta(s.key)?.label ?? s.key, unit: s.unit, chart: s.chart,
    fighter: { ...base, stats: probeStats(base.stats, s, ctx) },
  }));
  return { mode: 'statWeights', base, probes, ...prec, precision, seed, seconds: 60, survivalSeconds: 60, realm, presetId: base.presetId };
}

/** Staleness fingerprint of a request: the Fighters and settings, not the run. */
export function statWeightsInputs(request) {
  const { base, probes, nDps, nSurvival, seed, realm } = request;
  return metricKey('stat-weights', base, probes.map((p) => p.fighter.stats), nDps, nSurvival, seed, realm);
}

// ---------------------------------------------------------------------------------------------
// the run (worker side)

const ABORTED = Symbol('aborted');

/** The reference enemy at `attack`. */
export const referenceEnemy = (attack) => ({ ...REFERENCE_ENEMY, attack });

/**
 * Default sampler, straight over engine/metrics.js (fight i reads fightRng(seed, i), so a range is a
 * slice of the full run). tasks/statWeights.js replaces it with the worker pool's kernel.
 * @returns {Promise<{main: number[][], aborted: boolean}>}
 */
export async function metricsSampler(metric, fighter, enemy, from, to, { seed, seconds, survivalSeconds, signal }) {
  const o = { seed, n: to, signal, keepSamples: true, cache: false };
  const r = metric === 'dps'
    ? await dpsVsDummyAsync(fighter, { ...o, seconds })
    : await survivalAsync(fighter, enemy, { ...o, seconds: survivalSeconds });
  return { main: [r.samples.slice(from)], aborted: r.aborted === true };
}

/**
 * Search the reference enemy's Attack so the base build survives about half the time: start where the
 * preset's Health falls in 20 unmitigated swings, then x4 / ÷4 until the survival rate brackets the
 * band, then bisect in log space. Calibration fights use their own seed (never the measured fights).
 * @returns {Promise<{attack: number, p: number, n: number, tries: number, inBand: boolean}>}
 */
export async function calibrateAttack(base, survive, { seed = 1 } = {}) {
  const calSeed = hashSeed('stat-weights-calibration', seed);
  const [lo, hi] = CALIBRATION.band;
  let attack = Math.max(1, Math.round((base.stats?.totalHp ?? 1) / 20));
  let below = null; // an attack the build survives too often
  let above = null; // an attack the build dies to too often
  let best = null;
  for (let tries = 1; tries <= CALIBRATION.maxTries; tries++) {
    const xs = await survive(attack, calSeed, CALIBRATION.n);
    const p = xs.reduce((a, b) => a + b, 0) / xs.length;
    if (!best || Math.abs(p - 0.5) < Math.abs(best.p - 0.5)) best = { attack, p, n: xs.length, tries };
    if (p >= lo && p <= hi) return { attack, p, n: xs.length, tries, inBand: true };
    if (p > hi) below = attack;
    else above = attack;
    const next = below != null && above != null ? Math.round(Math.sqrt(below * above)) : p > hi ? attack * 4 : Math.max(1, Math.round(attack / 4));
    if (next === attack || (above === 1 && p < lo)) break;
    attack = next;
  }
  return { ...best, inBand: false }; // the try closest to one half
}

/**
 * One chart's bars from the base samples and each probe's. A bar is the paired contrast probe - base at
 * the chart's Bonferroni level; `measurable` is false when its interval spans 0, and such a bar gets no
 * rank. Measurable bars come first, largest change first, ranked 1..m; the rest follow, largest first.
 */
export function chartBars(kind, baseSamples, probes, { alpha = STAT_WEIGHT_ALPHA } = {}) {
  const level = alpha / Math.max(1, probes.length);
  const baseMean = kind === 'damage' ? meanCI(baseSamples).mean : baseSamples.reduce((a, b) => a + b, 0) / (baseSamples.length || 1);
  const bars = probes.map((p) => {
    const r = kind === 'damage' ? pairedT(p.samples, baseSamples, { alpha: level }) : pairedProportion(p.samples, baseSamples, { alpha: level });
    const lo = r.lo ?? r.delta;
    const hi = r.hi ?? r.delta;
    const measurable = r.n > 1 && (lo > 0 || hi < 0);
    const rel = (v) => (kind === 'damage' && baseMean > 0 ? (v / baseMean) * 100 : null);
    return {
      key: p.key, label: p.label, unit: p.unit, delta: r.delta, lo, hi, n: r.n, alpha: level, method: r.method,
      pct: rel(r.delta), pctLo: rel(lo), pctHi: rel(hi), measurable, rank: null,
    };
  });
  const byDelta = (a, b) => b.delta - a.delta;
  const ranked = bars.filter((b) => b.measurable).sort(byDelta);
  ranked.forEach((b, i) => { b.rank = i + 1; });
  return [...ranked, ...bars.filter((b) => !b.measurable).sort(byDelta)];
}

/**
 * Run both charts.
 * @param {ReturnType<typeof statWeightsRequest>} request
 * @param {{signal?: AbortSignal, onProgress?: Function, sample?: Function}} [ctx]  `sample(metric, fighter, enemy,
 *   from, to, {signal})` draws fights from..to-1 of 'dps' | 'survival' and promises `{main: [samples], aborted}`
 *   (default metricsSampler). Progress: {done, total, phases} in fights.
 * @returns {Promise<{damage: Object|null, survival: Object|null, aborted: boolean}>}  cancelling returns the bars
 *   finished so far
 */
export async function runStatWeights(request, { signal, onProgress, sample } = {}) {
  const { base, probes = [], nDps = 256, nSurvival = 1024, seed = 1, seconds = 60, survivalSeconds = 60 } = request ?? {};
  if (!base) throw new Error('statWeights: base Fighter is required');
  const draw = sample ?? ((m, f, e, from, to, o) => metricsSampler(m, f, e, from, to, { seed, seconds, survivalSeconds, ...o }));
  const damageProbes = probes.filter((p) => p.chart === 'damage');
  const survivalProbes = probes.filter((p) => p.chart === 'survival');
  const total = {
    damage: nDps * (damageProbes.length + 1),
    calibrate: survivalProbes.length ? CALIBRATION.n * CALIBRATION.maxTries : 0,
    survival: survivalProbes.length ? nSurvival * (survivalProbes.length + 1) : 0,
  };
  const done = { damage: 0, calibrate: 0, survival: 0 };
  const order = ['damage', 'calibrate', 'survival'].filter((id) => total[id] > 0);
  const LABEL = { damage: 'Damage', calibrate: 'Reference enemy', survival: 'Survival' };
  let current = order[0];
  const report = () => onProgress?.({
    done: order.reduce((s, id) => s + done[id], 0),
    total: order.reduce((s, id) => s + total[id], 0),
    phases: order.map((id, i) => ({
      id, label: LABEL[id], done: done[id], total: total[id],
      state: current === null || i < order.indexOf(current) ? 'done' : id === current ? 'current' : 'queued',
    })),
  });
  const take = async (phase, metric, fighter, enemy, n, s = seed) => {
    const c = await draw(metric, fighter, enemy, 0, n, { signal, seed: s });
    const xs = c.main[0] ?? [];
    done[phase] += xs.length;
    report();
    if (c.aborted || signal?.aborted || xs.length < n) throw ABORTED;
    return xs;
  };

  const out = { damage: null, survival: null, calibration: null, aborted: false };
  try {
    report();
    if (damageProbes.length) {
      const b = await take('damage', 'dps', base, null, nDps);
      const measured = [];
      out.damage = { base: brief('damage', b), bars: [], n: nDps, label: `Average DPS over ${seconds} s on the training dummy` };
      for (const p of damageProbes) {
        measured.push({ ...p, samples: await take('damage', 'dps', p.fighter, null, nDps) });
        out.damage.bars = chartBars('damage', b, measured);
      }
    }
    if (survivalProbes.length) {
      current = 'calibrate';
      report();
      const cal = await calibrateAttack(base, (attack, s, n) => take('calibrate', 'survival', base, referenceEnemy(attack), n, s), { seed });
      done.calibrate = total.calibrate;
      out.calibration = cal;
      current = 'survival';
      const enemy = referenceEnemy(cal.attack);
      const b = await take('survival', 'survival', base, enemy, nSurvival);
      const measured = [];
      out.survival = {
        base: brief('survival', b), bars: [], n: nSurvival, enemy,
        label: `Chance to survive ${survivalSeconds} s against the reference enemy (Attack ${cal.attack})`,
      };
      for (const p of survivalProbes) {
        measured.push({ ...p, samples: await take('survival', 'survival', p.fighter, enemy, nSurvival) });
        out.survival.bars = chartBars('survival', b, measured);
      }
    }
    current = null;
    report();
  } catch (e) {
    if (e !== ABORTED) throw e;
    out.aborted = true;
  }
  return out;
}

function brief(kind, xs) {
  if (kind === 'damage') {
    const r = meanCI(xs);
    return { mean: r.mean, lo: r.lo, hi: r.hi, n: r.n };
  }
  const w = wilson(xs.reduce((a, b) => a + b, 0), xs.length);
  return { mean: w.p, lo: w.lo, hi: w.hi, n: w.n };
}
