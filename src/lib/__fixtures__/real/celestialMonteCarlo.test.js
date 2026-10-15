// Seeded Monte Carlo of the three real Celestial parties (engine/pve/celestial.js with the injected
// rng), against the logged fights: HARD L85 and NORMAL L85 (the user's Sentinel and Warrior tank; wins
// at 145 s and 75.3 s) and HARD L95 (the user's Sentinel with another player's L95 tank; a win at
// 307.6 s). One log is one draw, so the bands are wide: they catch a broken engine, not luck.
// A 1000-fight run on 2026-10-15 gave: HARD L85 65.5 % wins, mean clear 160.3 s; NORMAL L85 100 %,
// 74.8 s; HARD L95 100 %, 316.7 s.
import { describe, it, expect } from 'vitest';
import { CELESTIAL_LOGS } from './celestialParties.js';
import { simulateCelestial, prepareCelestialMember } from '../../engine/pve/celestial.js';
import { fightRng } from '../../engine/rng.js';

const SEED = 20261015;
function monteCarlo(id, n) {
  const L = CELESTIAL_LOGS.find((l) => l.id === id);
  const party = L.party().map(prepareCelestialMember);
  let wins = 0;
  let clear = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateCelestial({
      party, difficulty: L.difficulty, tactics: L.tactics, stackPlayerIndex: L.stackPlayerIndex,
      tankIndex: L.fight.celestialResult.tankIndex, rng: fightRng(SEED, i),
    });
    if (r.won) {
      wins += 1;
      clear += r.timeMs;
    }
  }
  return { winRate: wins / n, meanClearS: wins > 0 ? clear / wins / 1000 : null };
}

describe('Celestial Monte Carlo of the real parties', () => {
  it('NORMAL L85 (log: a win at 75.3 s): always wins, clear time near the log', () => {
    const r = monteCarlo('normal-l85', 60);
    expect(r.winRate).toBe(1);
    expect(r.meanClearS).toBeGreaterThan(70);
    expect(r.meanClearS).toBeLessThan(80);
  }, 60_000);

  it('HARD L85 (log: a win at 145 s): wins most fights, losing some to the tank\'s death', () => {
    const r = monteCarlo('hard-l85', 80);
    expect(r.winRate).toBeGreaterThan(0.45);
    expect(r.winRate).toBeLessThan(0.85);
    expect(r.meanClearS).toBeGreaterThan(140);
    expect(r.meanClearS).toBeLessThan(180);
  }, 60_000);

  it('HARD L95 with the leaderboard tank (log: a win at 307.6 s): always wins, clear time near the log', () => {
    const r = monteCarlo('hard-l95', 30);
    expect(r.winRate).toBe(1);
    expect(r.meanClearS).toBeGreaterThan(295);
    expect(r.meanClearS).toBeLessThan(340);
  }, 60_000);
});
