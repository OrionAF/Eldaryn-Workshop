import { describe, it, expect } from 'vitest';
import { normaliseRun, runFromResult, sortRuns, compactRuns, RUN_DETAIL_LIMIT } from './runs.js';
import { richResult } from '../__fixtures__/optimiser/index.js';

describe('search steps on a run', () => {
  const steps = [
    { id: 'equipmentSet', state: 'done', reason: null, pass: 1, tried: 3, fights: 120, improved: true },
    { id: 'spec', state: 'skipped', reason: 'off', pass: 0, tried: 0, fights: 0, improved: false },
    { id: 'talents', state: 'done', reason: null, pass: 4, tried: 949, fights: 5552, improved: false },
  ];
  const withSteps = () => {
    const r = richResult();
    r.search = { ...r.search, steps };
    return r;
  };

  it('keeps the final step list of the result', () => {
    const r = runFromResult(withSteps(), { id: 's1' });
    expect(r.steps).toEqual(steps);
    expect(normaliseRun(JSON.parse(JSON.stringify(r)))).toEqual(r);
  });

  it('a run saved without steps loads cleanly and has none', () => {
    const r = runFromResult(richResult(), { id: 's2' });
    expect(r).not.toHaveProperty('steps');
    const raw = JSON.parse(JSON.stringify(r));
    expect(normaliseRun(raw)).not.toHaveProperty('steps');
    expect(normaliseRun(raw).detail.rows.length).toBeGreaterThan(0);
  });

  it('drops unusable rows and malformed lists instead of failing', () => {
    const base = JSON.parse(JSON.stringify(runFromResult(richResult(), { id: 's3' })));
    expect(normaliseRun({ ...base, steps: 'nope' })).not.toHaveProperty('steps');
    expect(normaliseRun({ ...base, steps: [null, { id: 'x', state: 'weird' }, { state: 'done' }] })).not.toHaveProperty('steps');
    const out = normaliseRun({ ...base, steps: [{ id: 'pet', state: 'skipped', reason: 'because', pass: -2, tried: 'many', fights: 1.5 }, ...steps] });
    expect(out.steps[0]).toEqual({ id: 'pet', state: 'skipped', reason: null, pass: 0, tried: 0, fights: 0, improved: false });
    expect(out.steps).toHaveLength(4);
  });

  it('survives detail compaction (the list is not part of the compacted detail)', () => {
    const many = Array.from({ length: RUN_DETAIL_LIMIT + 2 }, (_, i) => runFromResult(withSteps(), { id: `c${i}`, at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
    const out = compactRuns(sortRuns(many));
    expect(out.some((r) => r.detail === null)).toBe(true);
    expect(out.every((r) => r.steps?.length === 3)).toBe(true);
  });
});
