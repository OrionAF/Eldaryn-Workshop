// search/debugLog.js: the Optimiser's debug log (simulation.md §Debug log). It records what a run
// spent its fights and compute time on: one row per build raced and, at the fights level, one row per
// fight. It only observes: it draws no random number and never feeds a decision.
//
// Fights are recorded per sampler entry as they are simulated (sampler.js `drew`) and stay pending until
// a build row claims them, so a fight drawn ahead of the step that reads it (a pool prefetch) still lands
// on that step's row; fights no row claimed are flushed as rows of their own when the run ends.
import { normaliseDebugLevel } from '../model/debugLog.js';

export const DEBUG_LOG_SCHEMA = 'optimiser-debug-log/1';
/** Fight rows kept (26 bytes each in typed columns); further fights are counted, not stored. */
export const FIGHT_ROW_CAP = 4_000_000;
/** Build rows kept; further builds still count in the summary. */
export const BUILD_ROW_CAP = 250_000;
/** The slowest builds a run's Details lists. */
export const SLOWEST_SHOWN = 20;

const now = () => performance.now();
const FIRST_CAPACITY = 1 << 14;

/** Typed columns of the fight rows, grown by doubling up to the cap. */
function fightTable(cap) {
  const KINDS = { build: Int32Array, lane: Uint16Array, index: Uint32Array, value: Float64Array, gameMs: Float32Array, cpuMs: Float32Array };
  let size = 0;
  let capacity = 0;
  const cols = {};
  const grow = () => {
    const next = Math.min(cap, Math.max(FIRST_CAPACITY, capacity * 2));
    for (const [k, T] of Object.entries(KINDS)) {
      const c = new T(next);
      if (cols[k]) c.set(cols[k].subarray(0, size));
      cols[k] = c;
    }
    capacity = next;
  };
  return {
    get size() { return size; },
    /** Append one row; false when the cap is reached. */
    add(lane, index, value, gameMs, cpuMs) {
      if (size >= cap) return false;
      if (size === capacity) grow();
      cols.build[size] = -1;
      cols.lane[size] = lane;
      cols.index[size] = index;
      cols.value[size] = value;
      cols.gameMs[size] = gameMs;
      cols.cpuMs[size] = cpuMs;
      size++;
      return true;
    },
    claim(from, to, buildId) {
      cols.build.fill(buildId, from, to);
    },
    export() {
      const out = { rows: size };
      for (const k of Object.keys(KINDS)) out[k] = cols[k] ? cols[k].slice(0, size) : new KINDS[k](0);
      return out;
    },
  };
}

const emptyAgg = (id) => ({ id, builds: 0, fights: 0, cpuMs: 0, wallMs: 0 });

/**
 * A debug log at `level` ('builds' | 'fights'), or null when the level is off (no work at all then).
 * @param {string} level
 * @param {{fightCap?: number, buildCap?: number}} [o]
 */
export function createDebugLog(level, { fightCap = FIGHT_ROW_CAP, buildCap = BUILD_ROW_CAP } = {}) {
  const lv = normaliseDebugLevel(level);
  if (lv === 'off') return null;
  const keepFights = lv === 'fights';
  const fights = keepFights ? fightTable(fightCap) : null;
  const entries = []; // id -> {stage, ek, fights, cpuMs, ranges, ctx}
  const builds = [];
  const phases = new Map();
  const blocks = new Map();
  const totals = { builds: 0, fights: 0, cpuMs: 0, wallMs: 0, truncatedBuilds: 0, truncatedFights: 0 };
  const t0 = now();
  let context = () => ({ phase: null, block: null, pass: null, rung: null });
  let phaseAt = null;
  let blockAt = null;
  let nextBuild = 0;

  const aggOf = (map, id) => map.get(id) ?? map.set(id, emptyAgg(id)).get(id);
  const closePhase = (t) => {
    if (phaseAt) aggOf(phases, phaseAt.id).wallMs += t - phaseAt.t;
  };
  const closeBlock = (t) => {
    if (blockAt) aggOf(blocks, blockAt.id).wallMs += t - blockAt.t;
  };

  function addRow(row) {
    const id = nextBuild++;
    totals.builds++;
    totals.fights += row.fights;
    totals.cpuMs += row.cpuMs;
    const p = aggOf(phases, row.phase ?? 'run');
    p.builds++;
    p.fights += row.fights;
    p.cpuMs += row.cpuMs;
    if (row.block) {
      const b = aggOf(blocks, row.block);
      b.builds++;
      b.fights += row.fights;
      b.cpuMs += row.cpuMs;
    }
    if (builds.length < buildCap) builds.push({ id, ...row });
    else totals.truncatedBuilds++;
    return id;
  }

  /** Take an entry's pending fights; their fight rows are marked with `buildId`. */
  function claim(entry, buildId) {
    const e = entries[entry];
    if (!e) return { fights: 0, cpuMs: 0 };
    const out = { fights: e.fights, cpuMs: e.cpuMs };
    if (fights) for (const [from, to] of e.ranges) fights.claim(from, to, buildId);
    e.fights = 0;
    e.cpuMs = 0;
    e.ranges = [];
    return out;
  }

  return {
    level: lv,
    keepFights,
    /**
     * Make `fn` the source of the phase / block / pass / rung of rows and fights recorded from now on
     * (a run sets its own; a Push rung's inner run sets its own and restores the Push's when it ends).
     * @returns {() => void} restore
     */
    useContext(fn) {
      const prev = context;
      context = fn;
      return () => { context = prev; };
    },
    /** Wall time: the phase now running (time until the next call goes to this one). */
    enterPhase(id) {
      const t = now();
      closePhase(t);
      phaseAt = id ? { id, t } : null;
    },
    /** Wall time: the search block now running, or null between blocks. */
    enterBlock(id) {
      const t = now();
      closeBlock(t);
      blockAt = id ? { id, t } : null;
    },
    /** A new sampler entry (one build's fights on one stage); returns its id. */
    entry(stage, ek) {
      entries.push({ stage, ek, fights: 0, cpuMs: 0, ranges: [], ctx: null });
      return entries.length - 1;
    },
    /** Pending fights of an entry (simulated, not yet on a row). */
    pending: (entry) => entries[entry]?.fights ?? 0,
    /**
     * Fights just simulated for an entry: `chunk` is the sampler's ({main, trace?: {cpu, ms}}), lane by
     * lane from fight index `from`. Without a trace (an objective that cannot time its fights) the
     * chunk's wall time `wallMs` is shared out evenly.
     */
    drew(entry, chunk, from, wallMs) {
      const e = entries[entry];
      const lanes = chunk.main ?? [];
      const m = lanes[0]?.length ?? 0;
      const count = m * lanes.length;
      if (!e || count === 0) return;
      const cpu = chunk.trace?.cpu;
      const ms = chunk.trace?.ms;
      const even = count ? wallMs / count : 0;
      let sum = 0;
      const start = fights ? fights.size : 0;
      for (let j = 0; j < lanes.length; j++) {
        for (let i = 0; i < m; i++) {
          const c = cpu?.[j]?.[i] ?? even;
          sum += c;
          if (fights && !fights.add(j, from + i, lanes[j][i], ms?.[j]?.[i] ?? NaN, c)) totals.truncatedFights++;
        }
      }
      if (fights && fights.size > start) e.ranges.push([start, fights.size]);
      e.fights += count;
      e.cpuMs += sum;
      e.ctx = context();
    },
    /**
     * One build row: the context now, the fights its entry has pending, and the decision it ended with.
     * @param {{step: string, stage: string, key: string, entry: number|null, changes: string[], looks: number,
     *   n: number, decision: string, basis?: string|null, delta?: number|null}} row
     */
    build(row) {
      const id = nextBuild;
      const got = row.entry == null ? { fights: 0, cpuMs: 0 } : claim(row.entry, id);
      return addRow({ ...context(), ...row, basis: row.basis ?? null, delta: Number.isFinite(row.delta) ? row.delta : null, fights: got.fights, cpuMs: got.cpuMs });
    },
    /**
     * Fights no row claimed (drawn ahead and never read, or cut off by a cancel), one row per entry,
     * in the context they were drawn in.
     */
    flush(decision) {
      for (let k = 0; k < entries.length; k++) {
        const e = entries[k];
        if (!e.fights) continue;
        const id = nextBuild;
        const got = claim(k, id);
        addRow({
          ...(e.ctx ?? context()), step: 'unclaimed', stage: e.stage, key: e.ek, entry: k, changes: [], looks: 0, n: 0,
          decision, basis: decision === 'cancelled' ? 'cut off by the cancel' : 'drawn ahead, never read', delta: null, ...got,
        });
      }
    },
    /** The finished log (closes the open phase and block): header, summary, slowest builds, rows. */
    finish(header) {
      const t = now();
      closePhase(t);
      closeBlock(t);
      phaseAt = null;
      blockAt = null;
      totals.wallMs = t - t0;
      const summary = {
        level: lv,
        phases: [...phases.values()].map((p) => ({ ...p })),
        blocks: [...blocks.values()].map((b) => ({ ...b })),
        totals: { ...totals },
      };
      const slowest = [...builds].sort((a, b) => b.cpuMs - a.cpuMs || a.id - b.id).slice(0, SLOWEST_SHOWN);
      return {
        schema: DEBUG_LOG_SCHEMA,
        level: lv,
        header: { ...header, level: lv },
        summary,
        slowest,
        builds: builds.slice(),
        fights: fights ? fights.export() : null,
      };
    },
  };
}

/**
 * The log as JSONL lines (one JSON object per line): the header (with the summary), the build rows,
 * then the fight rows. A generator, so a long log is never one string.
 */
export function* debugLogLines(log) {
  if (!log) return;
  yield JSON.stringify({ type: 'header', schema: log.schema, ...log.header, summary: log.summary });
  for (const b of log.builds ?? []) yield JSON.stringify({ type: 'build', ...b });
  const f = log.fights;
  if (!f) return;
  const finite = (x) => (Number.isFinite(x) ? x : null);
  for (let i = 0; i < f.rows; i++) {
    yield JSON.stringify({ type: 'fight', build: f.build[i], lane: f.lane[i], index: f.index[i], value: f.value[i], gameMs: finite(f.gameMs[i]), cpuMs: f.cpuMs[i] });
  }
}

/** A file name for the log: optimiser-log-<character>-<timestamp>.jsonl. */
export function debugLogFileName(character, at = new Date()) {
  const slug = String(character ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'character';
  const stamp = at.toISOString().replace(/\.\d+Z$/, '').replace(/[:T]/g, '-');
  return `optimiser-log-${slug}-${stamp}.jsonl`;
}
