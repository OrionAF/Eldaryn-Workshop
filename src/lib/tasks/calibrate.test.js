// S2: the calibration benchmark runs through the pool, measures each fight kind and stops on abort.
import { describe, it, expect } from 'vitest';
import { calibrate } from './calibrate.js';
import { fakePoolFactory } from './fakePoolWorker.js';
import { runTask, hasTask } from './index.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { buildFighter } from '../build/fighter.js';
import { presetDuelFighter } from '../features/duel.js';

const c = fixtureCharacter('WARRIOR');
const fighter = buildFighter(c, c.activePresetId);
const mine = presetDuelFighter(c, c.activePresetId);

describe('calibrate task', () => {
  it('is registered', () => {
    expect(hasTask('calibrate')).toBe(true);
  });
  it('measures fights per second for the dummy and a dungeon step, inline', async () => {
    const phases = [];
    const r = await calibrate({ fighter, budgetMs: 120 }, { onProgress: (p) => phases.push(p.phases.map((x) => x.state).join()) });
    expect(Object.keys(r.fightsPerSec)).toEqual(['dummy', 'dungeon']);
    for (const v of Object.values(r.fightsPerSec)) expect(v).toBeGreaterThan(0);
    expect(r.workers).toBe(1);
    expect(r.aborted).toBe(false);
    expect(phases.at(-1)).toBe('done,done');
  });
  it('adds the duel kind when a pair is given, and reports the pool size', async () => {
    const pool = fakePoolFactory(2, { maxDelayMs: 1 });
    const r = await calibrate({ fighter, duel: { attacker: mine, defender: mine }, budgetMs: 300 }, { pool });
    expect(Object.keys(r.fightsPerSec)).toEqual(['dummy', 'dungeon', 'duel']);
    expect(r.workers).toBe(2);
    expect(pool.spawn.made).toBeGreaterThanOrEqual(2);
  });
  it('an abort returns the kinds finished so far with aborted: true', async () => {
    const ctl = new AbortController();
    const r = await calibrate({ fighter, budgetMs: 4000 }, { signal: ctl.signal, onProgress: () => ctl.abort() });
    expect(r.aborted).toBe(true);
    expect(r.fightsPerSec.dungeon).toBeUndefined();
  });
  it('needs a fighter, and runs through the task registry', async () => {
    await expect(calibrate({})).rejects.toThrow(/fighter/);
    const r = await runTask('calibrate', { fighter, budgetMs: 60 });
    expect(r.fightsPerSec.dummy).toBeGreaterThan(0);
  });
});
