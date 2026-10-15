// search/pvpObjective.js (A3): the optimiser target 'pvp' and objective 'pvp-winrate'. Statistic,
// interval and contrast: docs/Reference/simulation.md §Objectives.
//
// TARGET spec (plain JSON):  {kind: 'pvp', opponentIds: string[], seats: 'attacker'|'defender'|'both'}
//   The ids name entries of `character.opponents` (features/duel.js opponentFighter turns each into a
//   Fighter from its sheet). `seats` is where MY build stands: attacker, defender, or both (two duels
//   per opponent). A MATCHUP is one (opponent, seat) pair and one lane of the sample set.
// OBJECTIVE spec:           {kind: 'pvp-winrate'}
//   Per duel: 1 when my build wins. The engine reports the attacker's win (a timeout goes to the
//   higher absolute HP, an exact tie to the defender: Game/combat-pvp.md §10), so from my defender
//   seat my win is its complement. No tie-break on duel length: equal win rates are equal.
//
// Common random numbers: duel i of a matchup uses fightRng(hashSeed(seed, opponentId, seat), i), the same
// lanes for every build (simulation.md §Common random numbers). Sampling is async (it yields every 25 ms) so a worker 'abort' lands.
import { hashSeed, fightRng } from '../engine/rng.js';
import { wilsonInterval, stratifiedPairedProportion, stableStringify } from '../engine/metrics.js';
import { runDuel, fighterDuelArgs } from '../engine/pvp/resolver.js';
import { opponentFighter, duelFighter, missingStats } from '../features/duel.js';

export const PVP_TARGET_KIND = 'pvp';
export const PVP_OBJECTIVE_KIND = 'pvp-winrate';
export const PVP_SEATS = ['attacker', 'defender', 'both'];
/** Most opponents one run may select: matchups multiply the cost of every candidate. */
export const PVP_MAX_OPPONENTS = 4;

const SEAT_LABEL = { attacker: 'attacking', defender: 'defending', both: 'both seats' };
// Arena duels are server-run; the app replays the client's bundled resolver (Game/combat-pvp.md §1).
const PVP_ASSUMPTIONS = [{ id: 'pvp-server', label: "Arena duels are run by the server; simulated with the client's bundled duel resolver." }];

/** The matchups a target spec expands to, in a fixed order. */
export function matchupsOf(opponentIds, seats) {
  const seatList = seats === 'both' ? ['attacker', 'defender'] : [seats];
  return opponentIds.flatMap((opponentId) => seatList.map((seat) => ({ opponentId, seat })));
}

/**
 * Validate a pvp target spec against the character's saved opponents.
 * @param {{opponentIds?: string[], seats?: string}} raw
 * @param {{opponents?: Array<{id: string, name: string}>}} character
 * @returns the same shape objectives.js resolveTarget returns, plus `opponents` (Fighters) and `matchups`.
 */
export function resolvePvpTarget(raw, character) {
  const saved = Array.isArray(character?.opponents) ? character.opponents : [];
  if (saved.length === 0) throw new Error('PVP target needs a saved opponent (add one on the Duel screen)');
  const seats = PVP_SEATS.includes(raw?.seats) ? raw.seats : 'attacker';
  const wanted = Array.isArray(raw?.opponentIds) ? [...new Set(raw.opponentIds)] : [];
  if (wanted.length === 0) throw new Error('PVP target needs at least one opponent selected');
  if (wanted.length > PVP_MAX_OPPONENTS) throw new Error(`PVP target takes at most ${PVP_MAX_OPPONENTS} opponents`);
  const chosen = wanted.map((id) => {
    const o = saved.find((x) => x.id === id);
    if (!o) throw new Error(`PVP target: opponent '${id}' is not saved on this character`);
    const f = opponentFighter(o);
    const missing = missingStats(f);
    if (missing.length) throw new Error(`PVP target: opponent '${o.name}' has no ${missing.join(' / ')} in its sheet`);
    return { id, name: o.name, fighter: f };
  });
  const spec = { kind: PVP_TARGET_KIND, opponentIds: chosen.map((o) => o.id), seats };
  const names = chosen.map((o) => o.name || 'Opponent');
  const who = names.length === 1 ? names[0] : `${names[0]} and ${names.length - 1} more`;
  return {
    kind: PVP_TARGET_KIND, spec, key: stableStringify(spec), realm: null, enemy: null, maxMs: undefined, seconds: 0, opts: {},
    mode: 'pvp', fidelity: 'server-model', assumptions: PVP_ASSUMPTIONS.map((a) => ({ ...a })),
    label: `PVP vs ${who}, ${SEAT_LABEL[seats]}`,
    opponents: chosen, matchups: matchupsOf(spec.opponentIds, seats),
  };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const YIELD_MS = 25;
const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * @param {Object} raw  {kind: 'pvp-winrate'}
 * @param {ReturnType<typeof resolvePvpTarget>} target
 * @param {{closedFormDps: Function, ehpProxy: Function}} heuristics  ordering helpers from objectives.js
 */
export function makePvpObjective(raw, target, { closedFormDps, ehpProxy }) {
  const byId = new Map(target.opponents.map((o) => [o.id, o]));
  const lanes = target.matchups.map((m) => ({ ...m, name: byId.get(m.opponentId).name, args: fighterDuelArgs(byId.get(m.opponentId).fighter) }));
  // my own Penetration against their negate (closedFormDps applies the zero-Miss rule)
  const views = target.opponents.map((o) => ({
    damageReduction: o.fighter.stats?.totalDamageReduction ?? 0,
    blockChance: o.fighter.stats?.totalBlockChance ?? 0,
    missChance: o.fighter.stats?.totalMissChance ?? 0,
  }));
  const screen = (stats) => {
    const dps = sum(views.map((v) => closedFormDps(stats, v))) / views.length;
    return Math.log(Math.max(1, dps)) + Math.log(Math.max(1, ehpProxy(stats)));
  };
  const pooled = (s) => sum(s.main.map(sum)) / Math.max(1, s.n * s.main.length);

  return {
    kind: PVP_OBJECTIVE_KIND, key: PVP_OBJECTIVE_KIND, spec: { kind: PVP_OBJECTIVE_KIND },
    label: 'PVP win rate', unit: 'p', higherIsBetter: true, statistic: 'proportion', q: null, deltaKind: 'absolute',
    window: null, lanes: lanes.length, screen, tier0: screen,

    /** Duels from..to-1 of every matchup: main = my wins (0/1), side.ms = duel length, side.timedOut. */
    async sample(fighter, { seed, from = 0, to, signal }) {
      const mine = duelFighter(fighter);
      const missing = missingStats(mine);
      if (missing.length) throw new Error(`the preset has no ${missing.join(' / ')}; enter stats or gear first`);
      const me = fighterDuelArgs(mine);
      const main = lanes.map(() => []);
      const ms = lanes.map(() => []);
      const timedOut = lanes.map(() => []);
      let last = Date.now();
      // fight-major order, so an abort leaves every lane equally long
      for (let i = from; i < to; i++) {
        if (signal?.aborted) return { main, side: { ms, timedOut }, aborted: true };
        lanes.forEach((m, j) => {
          const rng = fightRng(hashSeed(seed, m.opponentId, m.seat), i);
          const r = m.seat === 'attacker' ? runDuel({ attacker: me, defender: m.args, rng }) : runDuel({ attacker: m.args, defender: me, rng });
          main[j].push(r.attackerWon === (m.seat === 'attacker') ? 1 : 0);
          ms[j].push(r.timeMs);
          timedOut[j].push(r.timedOut ? 1 : 0);
        });
        if (Date.now() - last >= YIELD_MS) { await tick(); last = Date.now(); }
      }
      return { main, side: { ms, timedOut }, aborted: false };
    },

    estimate(s, { alpha = 0.05 } = {}) {
      const total = s.n * s.main.length;
      const w = wilsonInterval(sum(s.main.map(sum)), total, { alpha });
      const laneMs = (s.side.ms ?? []).map((l) => (l.length ? sum(l) / l.length : null));
      return {
        value: { est: w.est, lo: w.lo, hi: w.hi, n: total, level: 1 - alpha, alphaAdj: alpha, method: 'wilson' },
        aux: {
          meanMs: laneMs.length && laneMs.every((x) => x != null) ? sum(laneMs) / laneMs.length : null,
          timeoutShare: s.side.timedOut?.length ? sum(s.side.timedOut.map(sum)) / total : null,
          matchups: lanes.map((m, j) => {
            const mw = wilsonInterval(sum(s.main[j]), s.n, { alpha });
            return {
              opponentId: m.opponentId, name: m.name, seat: m.seat,
              value: { est: mw.est, lo: mw.lo, hi: mw.hi, n: s.n, level: 1 - alpha, alphaAdj: alpha, method: 'wilson' },
            };
          }),
        },
      };
    },

    /** Stratified paired contrast of pooled win rates, one stratum per matchup. */
    contrast(x, y, { alpha = 0.05 } = {}) {
      return { ...stratifiedPairedProportion(x.main.map((l, j) => [l, y.main[j]]), { alpha }), ref: pooled(y) };
    },

    score: pooled,

    /** The PVP fields of `measure` (objectives.js). */
    legacyExtra(s, aux) {
      return {
        perMatchupN: s.n, meanMs: aux.meanMs, timeoutShare: aux.timeoutShare,
        matchups: aux.matchups.map((m) => ({ opponentId: m.opponentId, name: m.name, seat: m.seat, p: m.value.est, lo: m.value.lo, hi: m.value.hi, n: m.value.n })),
      };
    },
  };
}
