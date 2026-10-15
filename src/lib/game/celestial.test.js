import { describe, it, expect } from 'vitest';
import { celestialDifficulty, CELESTIAL_DIFFICULTIES, CELESTIAL_TACTICS, CELESTIAL_CONSTANTS } from './celestial.js';

describe('Celestial catalogue', () => {
  it('has the NORMAL / HARD / MYTHIC configs, the engine simulating the first two', () => {
    expect(CELESTIAL_DIFFICULTIES).toEqual(['NORMAL', 'HARD']);
    expect(celestialDifficulty('HARD')).toMatchObject({ timeLimitMs: 360000, bossSpellResist: 45 });
    expect(celestialDifficulty('NORMAL')).toMatchObject({ timeLimitMs: 240000, bossSpellResist: 0 });
    expect(celestialDifficulty('MYTHIC')).not.toBeNull();
    expect(celestialDifficulty('nope')).toBeNull();
  });

  it('carries the HARD boss spells and the party size', () => {
    const s = celestialDifficulty('HARD').spells;
    expect(s.CELESTIAL_OVERLOAD).toMatchObject({ addsThreshold: 7, attackBuffMultiplier: 5 });
    expect(s.GATEKEEPERS_BURDEN).toMatchObject({ attackPerBlockStack: 0.12, maxBlockStacks: 60, blockFuryDecayPerSec: 1.5 });
    expect(CELESTIAL_CONSTANTS.GROUP_SIZE).toBe(2);
    expect(CELESTIAL_TACTICS.CELESTIAL_FINDER_DEFAULT_TACTICS.HARD).toMatchObject({ focus: 'HOLD', holdCount: 3 });
  });
});
