import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore as store } from '../rosterStore.svelte.js';
import { KEY } from '../storage.js';
import { runFromResult, RUN_DETAIL_LIMIT } from '../model/runs.js';

function reset() {
  const id = store.addCharacter('Test', 'WARRIOR');
  for (const c of [...store.roster.characters]) if (c.id !== id) store.deleteCharacter(c.id);
  localStorage.clear();
}
const saved = () => JSON.parse(localStorage.getItem(KEY)).characters.find((c) => c.id === store.current.id);

const entry = (rank) => ({
  rank, isBaseline: rank === 0, key: `k${rank}`, candidate: {}, value: 100 + rank, lo: 90, hi: 110, n: 64, score: 100 + rank,
  vsBaseline: null, changes: [], lines: [{ label: 'Relics', value: 'None' }],
});
const result = (best = 120) => ({
  aborted: false, truncated: null, tier: 2, realm: 'base', presetId: 'p', seed: 1,
  target: { kind: 'dummy', label: 'Dummy', key: 'k' }, objective: { kind: 'dps', label: 'DPS', unit: 'dps', higherIsBetter: true },
  space: {}, budget: {}, baseline: { ...entry(0), value: 100 }, results: [{ ...entry(1), value: best }], stats: { tier1: 5 },
});

describe('runs store', () => {
  beforeEach(reset);

  it('addRun records an optimiser result, newest first, and persists', () => {
    const a = store.addRun(result(110), { name: 'first', presetName: 'Main' });
    expect(a).toMatchObject({ name: 'first', presetName: 'Main', headline: { best: 110, baseline: 100 } });
    const b = store.addRun(result(130));
    expect(store.current.runs.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(saved().runs).toHaveLength(2);
    expect(saved().runs[0].id).toBe(b.id);
  });

  it('accepts an already-built run and replaces one with the same id', () => {
    const run = runFromResult(result(), { id: 'fixed', at: '2026-01-01T00:00:00.000Z' });
    store.addRun(run);
    store.addRun({ ...run, name: 'renamed' });
    expect(store.current.runs).toHaveLength(1);
    expect(store.current.runs[0].name).toBe('renamed');
  });

  it('rename, notes and pin edit the run and persist', () => {
    const { id } = store.addRun(result());
    expect(store.setRunName(id, '  Better  ')).toBe(true);
    expect(store.setRunName(id, '   ')).toBe(false);
    expect(store.setRunNotes(id, 'tried relics')).toBe(true);
    expect(store.setRunPinned(id, true)).toBe(true);
    expect(saved().runs[0]).toMatchObject({ name: 'Better', notes: 'tried relics', pinned: true });
    expect(store.setRunNotes('nope', 'x')).toBe(false);
    expect(store.setRunPinned('nope', true)).toBe(false);
  });

  it('delete and clear (pinned runs survive a clear unless asked)', () => {
    const a = store.addRun(result());
    const b = store.addRun(result());
    const c = store.addRun(result());
    expect(store.deleteRun(a.id)).toBe(true);
    expect(store.deleteRun(a.id)).toBe(false);
    store.setRunPinned(b.id, true);
    store.clearRuns();
    expect(store.current.runs.map((r) => r.id)).toEqual([b.id]);
    expect(store.current.runs.some((r) => r.id === c.id)).toBe(false);
    store.clearRuns({ keepPinned: false });
    expect(store.current.runs).toEqual([]);
    expect(saved().runs).toEqual([]);
  });

  it(`only the newest ${RUN_DETAIL_LIMIT} runs keep their detail`, () => {
    for (let i = 0; i < RUN_DETAIL_LIMIT + 5; i++) store.addRun(runFromResult(result(), { id: `r${i}`, at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }));
    const runs = store.current.runs;
    expect(runs).toHaveLength(RUN_DETAIL_LIMIT + 5);
    expect(runs.filter((r) => r.detail).length).toBe(RUN_DETAIL_LIMIT);
    expect(runs[0].id).toBe(`r${RUN_DETAIL_LIMIT + 4}`);
    expect(runs.at(-1).detail).toBeNull();
  });

  it('runs are per character', () => {
    store.addRun(result());
    const other = store.addCharacter('Other', 'SENTINEL');
    expect(store.current.id).toBe(other);
    expect(store.current.runs).toEqual([]);
  });
});
