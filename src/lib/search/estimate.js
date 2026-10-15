// search/estimate.js (backlog §3): what an Optimiser run will cost, before it runs. Pure and cheap (no
// simulation), so the setup can call it on every change. What is exact and what is assumed:
// docs/Reference/simulation.md §Estimates; the procedure it models is §Search (search.js optimize).
import { isWinRateKind } from './objectives.js';
import { BLOCKS } from './space.js';
import { prepare, enumerateJoint, twoPointMoves, EXHAUSTIVE_MAX, SPEC_INNER, MOUNT_INNER } from './search.js';
import { PRESET_SIGIL_CAP } from '../model/presets.js';
import { MOUNT_GLYPH_SOCKETS } from '../model/glyphs.js';
import { estimateSeconds } from '../calibration.js';
import { CALIBRATION_FIGHT_SECONDS } from '../tasks/calibrate.js';

/** The joint space is counted build by build (exact) up to this size; above it the product of block sizes stands in. */
export const LIVE_ENUMERATE_MAX = 1000;
/**
 * Coordinate-ascent passes per start: the fewest (lo), a typical run (likely) and the assumed most (hi). `inner`
 * is the same for the inner ascent of a spec or mount switch, which starts from the current picks carried over.
 */
export const ASCENT_PASSES = Object.freeze({ lo: 1, likely: 3, hi: 8 });
const INNER_PASSES = Object.freeze({ lo: 1, likely: 1, hi: 8 });
/** Fights per build tried in a typical run, in units of the first look n0 (simulation.md §Cost: about 2 x n0). */
export const LIKELY_LOOKS = 2;

/**
 * The calibrated fight kind a target's fights cost like (lib/calibration.js FIGHT_KINDS), and for dummy-kind
 * targets whether the cost scales with the target's window. An assumption: the calibration measures one
 * fight of each kind. A target kind not listed (a newer target) has no time estimate.
 */
export const FIGHT_KIND_OF = Object.freeze({
  dummy: 'dummy', worldBoss: 'dummy', custom: 'dummy',
  chapter: 'dungeon', dungeon: 'dungeon', raid: 'dungeon', oblivion: 'dungeon',
  fortressBoss: 'duel', pvp: 'duel',
});

// Most atomic changes one build can differ from the baseline by, per block (effect.js changesOf ids).
const CHANGES_PER_BLOCK = Object.freeze({
  spec: 1, equipmentSet: 1, sigils: 1, utility: 1, ancient: 1, conditions: PRESET_SIGIL_CAP + 2, relics: 1, pet: 1,
  mount: 1, transcendence: 1, minorGlyphs: MOUNT_GLYPH_SOCKETS.minor, majorGlyphs: MOUNT_GLYPH_SOCKETS.major, talents: 1,
});

const sumNew = (sizes, ids) => ids.reduce((s, id) => s + ((sizes[id] ?? 1) - 1), 0);

/**
 * The estimate of one Optimiser run. Push runs the same search at its start rung, so for Push this
 * covers one rung's build search (`push: true`); the climb adds a search per rung it optimises.
 * @param {Object} request  the optimize request the setup stands for (ui/optimiserSetup.js requestOf)
 * @param {{calibration?: Object|null}} [o]  this device's speed calibration (lib/calibration.js), or null
 * @returns {{ok: false, reason: string} | {ok: true, strategy: 'exhaustive'|'local', push: boolean,
 *   blocks: Array<{id: string, enabled: boolean, values: number}>, starts: number|null, lanes: number,
 *   builds: {lo: number, likely: number, hi: number, exact: boolean, basis: string},
 *   fights: {lo: number, likely: number, hi: number, basis: string},
 *   kind: string|null, time: {lo: number, likely: number, hi: number, rate: number, workers: number, basis: string}|null,
 *   timeReason: null|'no-calibration'|'unmapped-kind', assumptions: string[]}}
 */
export function estimateRun(request, { calibration = null } = {}) {
  let prep;
  try {
    prep = prepare(request);
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e) };
  }
  const { space, effort, objective, target } = prep;
  const B = space.start;
  const enabled = new Set(space.blocks.filter((b) => b.enabled).map((b) => b.id));
  const sizes = space.domainSizes(B);
  const blocks = BLOCKS.map((id) => ({ id, enabled: enabled.has(id), values: enabled.has(id) ? sizes[id] ?? 1 : 1 }));
  const lanes = Math.max(1, objective.lanes ?? 1);
  const assumptions = [];

  let jointSize = 1;
  for (const id of enabled) jointSize *= sizes[id] ?? 1;
  const talentsLocal = enabled.has('talents') && (sizes.talents ?? 1) > 1;

  // ---- builds -------------------------------------------------------------------------------------
  let strategy;
  let builds;
  let starts = null;
  let finalistsCap;
  if (!talentsLocal && jointSize <= EXHAUSTIVE_MAX) {
    strategy = 'exhaustive';
    const list = jointSize <= LIVE_ENUMERATE_MAX ? enumerateJoint(space, B, enabled) : null;
    if (list) {
      const k = space.powerFloor == null ? list.length : list.filter((c) => space.admissible(c)).length;
      builds = { lo: k, likely: k, hi: k, exact: true, basis: 'Every legal build of the allowed blocks, counted one by one (after pruning and the Combat Power guard).' };
    } else {
      builds = { lo: jointSize, likely: jointSize, hi: jointSize, exact: false, basis: 'The product of the block sizes; the search counts the actual list.' };
      assumptions.push('A space this size is listed when the run starts; if the list exceeds the exhaustive limit the run switches to the local search.');
    }
    finalistsCap = Math.max(0, builds.hi - 1);
  } else {
    strategy = 'local';
    const two = enabled.has('talents') ? twoPointMoves(space, B).length : 0;
    const plain = [...enabled].filter((id) => id !== 'spec' && id !== 'mount');
    const specBlock = space.blocks.find((b) => b.id === 'spec');
    const mountBlock = space.blocks.find((b) => b.id === 'mount');
    const specInner = SPEC_INNER.filter((id) => enabled.has(id));
    const mountInner = MOUNT_INNER.filter((id) => enabled.has(id));
    const specVals = enabled.has('spec') ? specBlock.domain(B) : [];
    const mountVals = enabled.has('mount') ? mountBlock.domain(B) : [];
    // spec and mount arms are inner-optimised before they are raced: a switch is one build plus its inner ascent
    const specNew = specVals.map((v) => ({ n: sumNew(space.domainSizes(v), specInner), two: specInner.includes('talents') ? twoPointMoves(space, v).length : 0 }));
    const mountNew = mountVals.map((v) => (v.mountId && mountInner.length ? sumNew(space.domainSizes(v), mountInner) : 0));
    const passNew = (Pin) => sumNew(sizes, plain)
      + specNew.reduce((s, v) => s + 1 + Pin * v.n + v.two, 0)
      + mountNew.reduce((s, n) => s + 1 + Pin * n, 0);
    starts = 1 + specVals.length + (enabled.has('equipmentSet') ? (sizes.equipmentSet ?? 1) - 1 : 0) + (talentsLocal ? 1 : 0) + effort.randomStarts;
    const of = (k, S) => S * (1 + ASCENT_PASSES[k] * passNew(INNER_PASSES[k]) + two);
    builds = {
      lo: of('lo', 1),
      likely: of('likely', starts),
      hi: of('hi', starts),
      exact: false,
      basis: `Coordinate ascent: each pass races every value of each allowed block. From one start converging in ${ASCENT_PASSES.lo} pass, to ${starts} starts of ${ASCENT_PASSES.hi} passes each (about ${ASCENT_PASSES.likely} in a typical run).`,
    };
    assumptions.push(`How many passes an ascent takes depends on what it finds; ${ASCENT_PASSES.hi} per start is assumed as the most.`);
    // finalists: each start's optimum plus the ties of its last pass
    finalistsCap = starts * (sumNew(sizes, [...enabled]) + two);
    if (space.powerFloor != null) assumptions.push('Builds below the Combat Power floor are skipped when they come up, so fewer may be tried.');
  }
  assumptions.push('Builds equal in effect (same engine inputs) are raced once, so a few less may be tried.');

  // ---- fights (race rules, simulation.md §Racing; fights are counted per build and lane) ------------
  let m = [...enabled].reduce((s, id) => s + (CHANGES_PER_BLOCK[id] ?? 1), 0);
  if (enabled.has('spec') && enabled.has('talents')) m += 1; // the other set's talents
  // minimise: F and F - c over shrinking change sets; confirm + attribute: the row, the baseline, B + c and F - c
  const perFinalist = 1 + (m * (m + 1)) / 2 + 2 + 2 * m;
  const goal = isWinRateKind(objective.kind) ? 1 : 0;
  const fights = {
    lo: (builds.lo + goal) * effort.n0 * lanes,
    likely: Math.round((builds.likely + goal) * LIKELY_LOOKS * effort.n0 * lanes),
    hi: (builds.hi + 1 + finalistsCap * perFinalist) * effort.maxN * lanes,
    basis: `Least: every build resolved at the first look (N ${effort.n0}) and no change found. Most: every comparison runs to N ${effort.maxN}, including the checks of every possible finalist.${lanes > 1 ? ` Times ${lanes} matchups.` : ''}`,
  };
  if (goal) assumptions.push('If the current build already meets the goal, the run stops after its first check.');

  // ---- time --------------------------------------------------------------------------------------
  const { kind, time, reason: timeReason, assumption } = estimateTime(fights, target, calibration);
  if (assumption) assumptions.push(assumption);

  return {
    ok: true, strategy, push: request?.objective?.kind === 'push', blocks, starts, lanes,
    builds, fights, kind, time, timeReason, assumptions,
  };
}

/**
 * Seconds a fight range takes on this device: fights / the calibrated speed of the target's fight kind. The
 * calibrated speed is the whole worker pool's (tasks/calibrate.js), so it is not divided by the workers again.
 * A dummy-kind window costs in proportion to its length against the calibration's fight.
 * @param {{lo: number, likely: number, hi: number}} fights
 * @param {{kind: string, seconds?: number, label?: string}} target  a resolved target
 * @param {Object|null} calibration
 * @returns {{kind: string|null, time: Object|null, reason: null|'no-calibration'|'unmapped-kind', assumption: string|null}}
 */
export function estimateTime(fights, target, calibration) {
  const kind = FIGHT_KIND_OF[target.kind] ?? null;
  if (!kind) return { kind, time: null, reason: 'unmapped-kind', assumption: null };
  if (!calibration) return { kind, time: null, reason: 'no-calibration', assumption: null };
  const scale = kind === 'dummy' && target.seconds > 0 ? target.seconds / CALIBRATION_FIGHT_SECONDS : 1;
  const secs = (n) => estimateSeconds(calibration, { [kind]: n * scale }) ?? 0;
  const measured = calibration.fightsPerSec[kind] ?? null;
  const rate = measured ?? Math.min(...Object.values(calibration.fightsPerSec));
  const w = calibration.workers;
  return {
    kind,
    time: {
      lo: secs(fights.lo), likely: secs(fights.likely), hi: secs(fights.hi), rate, workers: w,
      basis: `Fights divided by this device's measured ${kind} speed (${Math.round(rate)} fights/s with ${w} worker${w === 1 ? '' : 's'})${scale !== 1 ? `, scaled to a ${target.seconds} s fight` : ''}.`,
    },
    reason: null,
    assumption: `${target.label || target.kind} fights are assumed to cost like the calibration's ${kind} fight${measured ? '' : ' (not measured: the slowest measured speed is used)'}.`,
  };
}
