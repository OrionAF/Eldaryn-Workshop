// search/pvpObjective.js (F5): the optimiser target 'pvp' and objective 'pvp-winrate'.
//
// TARGET spec (plain JSON):  {kind: 'pvp', opponentIds: string[], seats: 'attacker'|'defender'|'both'}
//   The ids name entries of `character.opponents` (features/duel.js opponentFighter turns each into a
//   Fighter from its sheet). `seats` is where MY build stands: attacker, defender, or both (two duels
//   per opponent). A MATCHUP is one (opponent, seat) pair.
// OBJECTIVE spec:           {kind: 'pvp-winrate'}
//   A candidate's score is its win rate, the mean across all matchups (every matchup gets the same N,
//   so that is also the pooled rate). Ties go to the defender (Game/combat-pvp.md), so a duel that times
//   out counts for the defender, and the attacker's rate from the engine is flipped for my defender seat.
//
// Successive halving is the search's own tiers (search/search.js): tier 1 = PVP_BUDGET.n1 duels per
// matchup (64) drives the beam, tier 2 = n2 (400) re-measures only the finalists, a handful. Common
// random numbers: duel i of a matchup uses the stream hashSeed(hashSeed(seed, opponentId, seat), i), the
// same for every candidate, so pairedDelta over `scoreSamples` cancels most of the noise. The measure is
// ASYNC (pvpWinRateAsync yields every 25 ms) so a worker 'abort' lands within a few milliseconds even
// though one spell-heavy duel costs 13-17 ms.
import { hashSeed } from '../engine/rng.js';
import { pvpWinRateAsync, wilson, stableStringify } from '../engine/metrics.js';
import { opponentFighter, duelFighter, missingStats } from '../features/duel.js';

export const PVP_TARGET_KIND = 'pvp';
export const PVP_OBJECTIVE_KIND = 'pvp-winrate';
export const PVP_SEATS = ['attacker', 'defender', 'both'];
/** Most opponents one run may select: matchups multiply the cost of every candidate. */
export const PVP_MAX_OPPONENTS = 4;

/**
 * Budget defaults for a PVP run (merged under the caller's budget by optimizeBuild). A duel costs
 * several milliseconds, so the beam is narrower than the PVE one: N = 64 per matchup in the beam, 400
 * for the few finalists (the current build is always one of them). `finalMs` (search.js) lowers the
 * finalists' N, never below 128, when 400 would not fit the time, so the run stays near 20 s; the N used
 * is on every number. A longer effort raises maxMs and finalMs.
 */
export const PVP_BUDGET = { n1: 64, n2: 400, finalists: 4, topN: 8, maxEvals: 120, maxMs: 9000, finalMs: 8000, screenKeep: 8, perGroup: 2 };

const SEAT_LABEL = { attacker: 'attacking', defender: 'defending', both: 'both seats' };

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
    label: `PVP vs ${who}, ${SEAT_LABEL[seats]}`,
    opponents: chosen, matchups: matchupsOf(spec.opponentIds, seats),
  };
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/**
 * @param {Object} raw  {kind: 'pvp-winrate'}
 * @param {ReturnType<typeof resolvePvpTarget>} target
 * @param {{closedFormDps: Function, ehpProxy: Function}} screens  tier-0 helpers from objectives.js
 */
export function makePvpObjective(raw, target, { closedFormDps, ehpProxy }) {
  const byId = new Map(target.opponents.map((o) => [o.id, o]));
  const views = target.opponents.map((o) => ({
    damageReduction: o.fighter.stats?.totalDamageReduction ?? 0,
    blockChance: o.fighter.stats?.totalBlockChance ?? 0,
    penetration: 0,
  }));
  return {
    kind: PVP_OBJECTIVE_KIND, key: PVP_OBJECTIVE_KIND, spec: { kind: PVP_OBJECTIVE_KIND },
    label: 'PVP win rate', unit: 'p', higherIsBetter: true,
    defaultBudget: PVP_BUDGET,
    // Screen only: how hard I hit the saved opponents times how long I last. Spell kits are kept by group.
    tier0: (stats) => {
      const dps = sum(views.map((v) => closedFormDps(stats, v))) / views.length;
      return Math.log(Math.max(1, dps)) + Math.log(Math.max(1, ehpProxy(stats)));
    },
    async measure(fighter, { n, seed, keepSamples = false, signal }) {
      const mine = duelFighter(fighter);
      const missing = missingStats(mine);
      if (missing.length) throw new Error(`the preset has no ${missing.join(' / ')}; enter stats or gear first`);
      const per = [];
      let aborted = false;
      for (const m of target.matchups) {
        const theirs = byId.get(m.opponentId).fighter;
        const pairSeed = hashSeed(seed, m.opponentId, m.seat);
        // The engine reports the attacker's win; from the defender's seat my win is its complement.
        const r = m.seat === 'attacker'
          ? await pvpWinRateAsync(mine, theirs, { n, seed: pairSeed, keepSamples: true, cache: false, signal })
          : await pvpWinRateAsync(theirs, mine, { n, seed: pairSeed, keepSamples: true, cache: false, signal });
        if (r.aborted) { aborted = true; break; }
        const mineWon = m.seat === 'attacker' ? r.samples : r.samples.map((x) => 1 - x);
        per.push({ ...m, wins: sum(mineWon), n: r.n, samples: mineWon, meanMs: r.meanMs, timeoutShare: r.timeoutShare });
      }
      if (aborted) return { score: 0, tie: 0, value: null, lo: null, hi: null, n: 0, aborted: true };
      const wins = sum(per.map((x) => x.wins));
      const total = sum(per.map((x) => x.n));
      const w = wilson(wins, total);
      const meanMs = sum(per.map((x) => x.meanMs)) / per.length;
      return {
        score: w.p ?? 0,
        tie: -meanMs, // among equal win rates (often 100 % or 0 %), prefer the build that ends the duel sooner
        value: w.p, lo: w.lo, hi: w.hi, n: total, aborted: false,
        extra: {
          perMatchupN: per[0]?.n ?? 0,
          meanMs,
          timeoutShare: sum(per.map((x) => x.timeoutShare)) / per.length,
          matchups: per.map((x) => {
            const mw = wilson(x.wins, x.n);
            return { opponentId: x.opponentId, name: byId.get(x.opponentId).name, seat: x.seat, p: mw.p, lo: mw.lo, hi: mw.hi, n: x.n };
          }),
        },
        ...(keepSamples
          ? { scoreSamples: Array.from({ length: per[0]?.n ?? 0 }, (_, i) => sum(per.map((x) => x.samples[i])) / per.length) }
          : {}),
      };
    },
  };
}
