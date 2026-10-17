// Equal opponent frequencies, unequal win rewards. See simulation.md §Arena rewards from wins.
import { arenaInfluenceReward, arenaVirtualOffset } from '../engine/pvp/arenaRewards.js';
import { ARENA_RANK_FIGHT_MULTIPLIERS } from '../game/combatPvp.js';
import { binomialUpper, stableStringify } from '../engine/metrics.js';

export const ARENA_REWARD_KIND = 'arena-reward';
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** Validate only explicit inputs; an imported rank or position is never guessed. */
export function arenaRewardConfig(raw, target) {
  if (target?.seats !== 'attacker') throw new Error('Arena rewards need the attacking seat.');
  if (!ARENA_RANK_FIGHT_MULTIPLIERS.some((r) => r.rank === raw.rank)) throw new Error('Choose your Arena rank tier.');
  if (!(Number.isSafeInteger(raw.position) && raw.position > 0)) throw new Error('Enter your current Arena position.');
  const opponentPositions = {};
  const rewards = target.opponentIds.map((id) => {
    const position = raw.opponentPositions?.[id];
    if (!(Number.isSafeInteger(position) && position > 0)) throw new Error('Enter the Arena position of every selected opponent.');
    if (Object.values(opponentPositions).includes(position)) throw new Error('Selected opponents need different Arena positions.');
    const reward = arenaInfluenceReward(raw.rank, raw.position, position);
    if (reward == null) throw new Error('Choose opponents in your six Arena challenge slots, at different positions from yours.');
    opponentPositions[id] = position;
    return reward;
  });
  if (!rewards.length) throw new Error('Pick at least one Arena opponent.');
  return { spec: { kind: ARENA_REWARD_KIND, rank: raw.rank, position: raw.position, opponentPositions }, rewards,
    scale: sum(rewards) / rewards.length };
}

// Exact marginal binomial limits, combined with a union bound across lanes/tails. No sample replication.
const bounds = (wins, n, tail) => n > 0
  ? [1 - binomialUpper(n - wins, n, tail), binomialUpper(wins, n, tail)] : [0, 1];

export function rewardEstimate(main, rewards, alpha = .05) {
  const k = main.length, n = main[0]?.length ?? 0;
  let est = 0, lo = 0, hi = 0;
  for (let j = 0; j < k; j++) {
    const wins = main[j].filter((x) => x > 0).length;
    const [l, h] = bounds(wins, n, alpha / (2 * k));
    est += sum(main[j]) / Math.max(1, n * k);
    lo += rewards[j] * l / k; hi += rewards[j] * h / k;
  }
  return { est: n ? est : null, lo, hi, n: n * k, level: 1 - alpha, alphaAdj: alpha, method: 'stratified-exact-binomial' };
}

export function rewardContrast(x, y, rewards, alpha = .05) {
  const k = rewards.length, n = Math.min(x.n, y.n);
  let delta = 0, lo = 0, hi = 0, variance = 0;
  for (let j = 0; j < k; j++) {
    let b = 0, c = 0;
    for (let i = 0; i < n; i++) {
      if (x.main[j][i] > y.main[j][i]) b++;
      else if (x.main[j][i] < y.main[j][i]) c++;
    }
    const [bl, bh] = bounds(b, n, alpha / (4 * k));
    const [cl, ch] = bounds(c, n, alpha / (4 * k));
    const w = rewards[j] / k, d = n ? (b - c) / n : 0;
    delta += w * d; lo += w * (bl - ch); hi += w * (bh - cl);
    variance += w * w * Math.max(0, (b + c) / Math.max(1, n) - d * d) * n / Math.max(1, n - 1);
  }
  return { delta, lo, hi, n, sd: Math.sqrt(variance), p: null, alphaAdj: alpha, method: 'stratified-exact-paired',
    ref: y.main.reduce((s, lane) => s + sum(lane.slice(0, n)), 0) / Math.max(1, n * k) };
}

/** Reuses exactly the old win-rate sampler's duels and seeds; only scoring changes. */
export function makeArenaRewardObjective(raw, target, base) {
  const { spec, rewards, scale } = arenaRewardConfig(raw, target.spec);
  return {
    ...base, kind: ARENA_REWARD_KIND, spec, key: stableStringify(spec),
    label: 'Arena Influence from wins', unit: 'influence', statistic: 'mean', deltaKind: 'absolute', deltaScale: scale,
    async sample(fighter, opts) {
      const chunk = await base.sample(fighter, opts);
      return { ...chunk, main: chunk.main.map((lane, j) => lane.map((win) => win * rewards[j])) };
    },
    estimate(s, { alpha = .05 } = {}) {
      const bits = { ...s, main: s.main.map((lane) => lane.map((v) => v > 0 ? 1 : 0)) };
      const win = base.estimate(bits, { alpha });
      return { value: rewardEstimate(s.main, rewards, alpha), aux: { ...win.aux,
        rewardNote: 'Equal attempts against the selected opponents. Influence from wins only; loss rewards and game matchmaking are unknown.',
        matchups: win.aux.matchups.map((m, j) => ({ ...m, reward: rewards[j], offset: arenaVirtualOffset(spec.position, spec.opponentPositions[m.opponentId]),
          value: rewardEstimate([s.main[j]], [rewards[j]], alpha) })) } };
    },
    contrast: (x, y, { alpha = .05 } = {}) => rewardContrast(x, y, rewards, alpha),
    matchupContrast: (j, x, y, { alpha = .05 } = {}) => rewardContrast(x, y, [rewards[j]], alpha),
    score: (s) => s.main.reduce((n, lane) => n + sum(lane), 0) / Math.max(1, s.n * s.main.length),
    legacyExtra: undefined,
  };
}
