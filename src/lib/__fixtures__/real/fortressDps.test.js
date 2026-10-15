// The app's Fortress boss dps for the attacker of a real server fight (backlog §15): fortress-boss-top-fight.json
// was fought by profile-sentinel-l85-miss.json (TOP, 5 stars). The real fight dealt rawDamage in 60 s; one fight
// is one draw, so the log's dps must sit inside the model's 95% prediction interval for one fight, and the
// model mean within 5% of it (the single real draw is ~0.5 sd of a fight from the mean: Game/clan-fortress.md §1.4).
import { describe, it, expect } from 'vitest';
import profile from './profile-sentinel-l85-miss.json';
import fight from './fortress-boss-top-fight.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { resolveTarget, makeObjective } from '../../search/objectives.js';

const LOG_DPS = fight.rawDamage / (fight.fightDurationMs / 1000); // 22.6M

describe('Fortress boss dps matches the server log (Sentinel L85, TOP 5 stars)', () => {
  it('the log dps is inside the 95% prediction interval of one simulated fight; the mean is within 5%', () => {
    const c = normaliseCharacter(gameProfileToCharacter(profile));
    const fighter = buildFighter(c, c.activePresetId);
    const target = resolveTarget({ kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 26, server: 5 });
    const m = makeObjective({ kind: 'dps' }, target).measure(fighter, { n: 400, seed: 20261015 });
    const xs = [...m.samples.main[0]].sort((a, b) => a - b);
    const lo = xs[Math.floor(0.025 * xs.length)];
    const hi = xs[Math.ceil(0.975 * xs.length) - 1];
    expect(LOG_DPS, `model mean ${Math.round(m.value)}, one-fight 95% range ${Math.round(lo)}-${Math.round(hi)}`).toBeGreaterThanOrEqual(lo);
    expect(LOG_DPS).toBeLessThanOrEqual(hi);
    expect(Math.abs(m.value - LOG_DPS) / LOG_DPS).toBeLessThan(0.05);
  });
});
