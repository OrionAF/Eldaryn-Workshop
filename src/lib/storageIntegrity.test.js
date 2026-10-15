// M3: import and persistence integrity (plan M3; findings #121 #124).
import { it, expect, vi, beforeEach } from 'vitest';
import { saveRoster, importJson, ImportError, KEY } from './storage.js';
import { newRoster } from './model/index.js';

beforeEach(() => {
  localStorage.clear();
});

it('importJson rejects JSON that is neither a profile nor a roster with a character, and names the problem (#121)', () => {
  const roster = newRoster();
  for (const junk of ['{}', '[]', 'null', '42', '"hi"', '{"characters":[]}', '{"foo":1}']) {
    expect(() => importJson(junk, roster), junk).toThrow(ImportError);
  }
  expect(roster.characters).toHaveLength(1); // the caller's roster is untouched
});

it('importJson reports the line of a JSON syntax error', () => {
  let err;
  try {
    importJson('{\n  "a": 1,\n  "b": ,\n}');
  } catch (e) {
    err = e;
  }
  expect(err).toBeInstanceOf(ImportError);
  expect(err.line).toBe(3);
  expect(err.message).toMatch(/line 3/);
});

it('the store import leaves the roster alone when the text is junk', async () => {
  const { rosterStore } = await import('./rosterStore.svelte.js');
  rosterStore.addCharacter('Keep me');
  const before = JSON.stringify(rosterStore.roster);
  expect(() => rosterStore.importFromJson('{}')).toThrow(ImportError);
  expect(JSON.stringify(rosterStore.roster)).toBe(before);
});

it('saveRoster reports success, and failure when setItem throws (#124)', () => {
  expect(saveRoster(newRoster())).toMatchObject({ ok: true, error: null });
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  try {
    const res = saveRoster(newRoster());
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/full|quota/i);
  } finally {
    spy.mockRestore();
  }
});

it('rosterStore.saveState follows the last save', async () => {
  const { rosterStore } = await import('./rosterStore.svelte.js');
  rosterStore.addCharacter('A');
  expect(rosterStore.saveState.ok).toBe(true);
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  try {
    rosterStore.addCharacter('B');
    expect(rosterStore.saveState.ok).toBe(false);
  } finally {
    spy.mockRestore();
  }
  rosterStore.addCharacter('C');
  expect(rosterStore.saveState.ok).toBe(true);
});

it('saveRoster trims run detail across characters to the roster-wide budget, oldest first, pinned kept (#124)', () => {
  const big = 'x'.repeat(400_000);
  const run = (id, at, pinned = false) => ({
    id, kind: 'optimise', at, pinned, headline: {}, detail: { baseline: null, results: [{ key: big }] },
  });
  const roster = newRoster();
  const second = JSON.parse(JSON.stringify(roster.characters[0]));
  second.id = 'second';
  roster.characters.push(second);
  roster.characters[0].runs = [run('a3', '2026-03-01'), run('a1', '2026-01-01', true)];
  roster.characters[1].runs = [run('b2', '2026-02-01'), run('b0', '2025-12-01')];
  const res = saveRoster(roster, { runsBudget: 1_000_000 });
  expect(res.ok).toBe(true);
  const kept = (c) => Object.fromEntries(c.runs.map((r) => [r.id, r.detail !== null]));
  expect(kept(roster.characters[0])).toEqual({ a3: true, a1: true });
  expect(kept(roster.characters[1])).toEqual({ b2: false, b0: false });
  expect(JSON.parse(localStorage.getItem(KEY)).characters[1].runs.every((r) => r.detail === null)).toBe(true);
});
