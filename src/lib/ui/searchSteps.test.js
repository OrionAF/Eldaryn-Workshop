import { describe, it, expect } from 'vitest';
import { searchStepRows, searchStepCounts } from './searchSteps.js';

const row = (id, o = {}) => ({ id, state: 'queued', reason: null, pass: 0, tried: 0, fights: 0, improved: false, ...o });

describe('searchStepRows', () => {
  const rows = [
    row('equipmentSet', { state: 'done', pass: 1, tried: 3, fights: 120, improved: true }),
    row('spec', { state: 'skipped', reason: 'off' }),
    row('talents', { state: 'running', pass: 2, tried: 1782, fights: 9000 }),
    row('pet', { state: 'skipped', reason: 'nothing-to-try' }),
    row('relics'),
  ];

  it('names each block, its state and what it did', () => {
    const out = searchStepRows(rows);
    expect(out.map((r) => [r.label, r.state])).toEqual([['Gear set', 'done'], ['Talent set', 'skipped'], ['Talents', 'active'], ['Pet', 'skipped'], ['Relics', 'queued']]);
    expect(out[0].detail).toBe('3 builds tried · 120 fights · found an improvement');
    expect(out[2].detail).toBe('pass 2 · 1,782 builds tried · 9,000 fights · no improvement yet');
    expect(out[4].detail).toBe('');
  });

  it('says why a block was skipped', () => {
    const out = searchStepRows(rows);
    expect(out[1].detail).toBe('turned off under Allowed to change');
    expect(out[3].detail).toBe('nothing to try');
  });

  it('can leave out the blocks that were turned off', () => {
    expect(searchStepRows(rows, { showOff: false }).map((r) => r.id)).toEqual(['equipmentSet', 'talents', 'pet', 'relics']);
  });

  it('a run without steps (older, Push, cancelled early) gives no list', () => {
    for (const none of [undefined, null, [], 'x', {}]) expect(searchStepRows(none)).toEqual([]);
  });

  it('counts the blocks done out of those the search works on', () => {
    expect(searchStepCounts(rows)).toEqual({ done: 1, total: 3 });
    expect(searchStepCounts(null)).toEqual({ done: 0, total: 0 });
  });
});
