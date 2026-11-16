import { describe, it, expect, beforeEach } from 'vitest';
import { dropCombo, comboConfirmSeed, COMBO_ROUNDS_MAX } from './dropCombo.js';
import { prepareBatch, judgeEntry, entryResults } from './dropBatch.js';
import { runSwapMetrics } from './swap.js';
import { runTask } from '../tasks/index.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { clearMetricCache } from '../engine/metrics.js';

beforeEach(() => clearMetricCache());

const DUMMY = [{ id: 'dps', target: { kind: 'dummy', seconds: 10 }, objective: { kind: 'dps' } }];
const gear = (attack, secondaryStats = []) => ({ rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 }, secondaryStats, conduit: null });
const entry = (key, slot, item) => ({ key, name: key, slot, realm: 'base', item, dropped: 0 });

/** A Warrior whose Set 1 head, chest and leggings are known, judged on Set 1 by a 10 s dummy. */
function setup(entries, extra = {}) {
  const c = fixtureCharacter('WARRIOR');
  c.equipment.set1.items.HEAD = gear(2000);
  c.equipment.set1.items.CHEST = gear(5000);
  c.equipment.set1.items.LEGGINGS = gear(5000);
  const prep = prepareBatch(c, entries, { sets: 'set1', goals: DUMMY, goalIdsByRealm: { base: ['dps'], oblivion: [] }, combine: true });
  return { c, prep, request: { ...prep.request, maxN: 256, ...extra } };
}
const set1 = (r) => r.combo.sets.find((s) => s.setKey === 'set1');

describe('prepareBatch with combine', () => {
  it('asks for the dropCombo task with the same items, each naming its entry and set, plus the entries', () => {
    const entries = [entry('a', 'HEAD', gear(9000)), entry('b', 'CHEST', gear(9000))];
    const { c, request } = setup(entries);
    const plain = prepareBatch(c, entries, { sets: 'set1', goals: DUMMY, goalIdsByRealm: { base: ['dps'], oblivion: [] } }).request;
    expect(plain.mode).toBe('dropCheck');
    expect(request.mode).toBe('dropCombo');
    expect(request.sets).toBe('set1');
    expect(request.entries).toEqual(entries.map(({ dropped: _d, ...e }) => e));
    expect(request.items.map(({ entry: _e, setKey: _s, ...it }) => it)).toEqual(plain.items);
    expect(request.items.every((it) => it.setKey === 'set1')).toBe(true);
    expect(request.items.map((it) => it.entry)).toEqual(request.items.map((_, i) => (i < request.items.length / 2 ? 'a' : 'b')));
  });
});

describe('dropCombo', () => {
  it('rejects a malformed request', async () => {
    await expect(dropCombo({})).rejects.toThrow(/items/);
    await expect(dropCombo({ items: [] })).rejects.toThrow(/entries/);
    await expect(dropCombo({ items: [], entries: [] })).rejects.toThrow(/goals/);
    await expect(dropCombo({ items: [], entries: [], goals: [] })).rejects.toThrow(/character/);
  });

  it('the alone pass is the plain batch: same results as the dropCheck comparisons', async () => {
    const { request } = setup([entry('a', 'HEAD', gear(9000)), entry('b', 'CHEST', gear(1000))]);
    const r = await dropCombo(request);
    const plain = await runSwapMetrics(request.items, request);
    expect(r.aborted).toBe(false);
    expect(r.results).toEqual(plain.results);
  }, 60000);

  it('two upgrades in different slots are both picked, and the pair is confirmed on a fresh seed', async () => {
    const { request } = setup([entry('helm', 'HEAD', gear(9000)), entry('chest', 'CHEST', gear(12000)), entry('junk', 'LEGGINGS', gear(0))]);
    const r = await dropCombo(request);
    const s = set1(r);
    expect(s.status).toBe('done');
    expect(s.picks.map((p) => p.entry).sort()).toEqual(['chest', 'helm']);
    expect(s.picks.every((p) => p.alone === 'upgrade')).toBe(true);
    expect(s.steps.map((st) => [st.round, st.move])).toEqual([[1, 'equip'], [2, 'equip']]);
    expect(s.alone.junk).not.toBe('upgrade');
    expect(s.onTop.junk).not.toBe('upgrade');
    expect(s.total.confirmed).toBe(true);
    expect(s.total.verdict).toBe('upgrade');
    expect(s.total.results[0].goals[0].delta.seed).toBe(comboConfirmSeed(request.seed));
    expect(r.combo.seed).toEqual({ search: request.seed, confirm: comboConfirmSeed(request.seed) });
    expect(r.combo.rounds).toBe(3);
    // the pair beats either drop alone
    const aloneBest = Math.max(...r.results.map((x) => x.goals[0]?.delta.pct ?? -Infinity));
    expect(s.total.results[0].goals[0].delta.pct).toBeGreaterThan(aloneBest);
  }, 60000);

  it('two drops for one slot: only the better one is picked, and the other is no upgrade on top of it', async () => {
    const { request } = setup([entry('good', 'HEAD', gear(6000)), entry('best', 'HEAD', gear(12000))]);
    const s = set1(await dropCombo(request));
    expect(s.alone).toEqual({ good: 'upgrade', best: 'upgrade' });
    expect(s.picks).toEqual([{ entry: 'best', slot: 'HEAD', alone: 'upgrade' }]);
    expect(s.onTop).toEqual({ good: 'downgrade' });
    // one step: its alone comparison is the total, not a second run
    expect(s.total.confirmed).toBe(false);
    expect(s.total.verdict).toBe('upgrade');
  }, 60000);

  it('a drop that is an upgrade alone can stop being one once another is on, and the reverse', async () => {
    // `crit` takes the crit chance to the top of its curve (31 % to 90 %). `more` trades attack for crit chance:
    // good alone, a loss once crit has nowhere to go. `dmg` trades attack for crit damage: a loss at the starting
    // crit chance, a gain once nine hits in ten crit.
    const { request } = setup([
      entry('more', 'CHEST', gear(3000, [{ type: 'CRIT_CHANCE', value: 30 }])),
      entry('dmg', 'LEGGINGS', gear(0, [{ type: 'CRIT_DAMAGE', value: 0.3 }])),
      entry('crit', 'HEAD', gear(2000, [{ type: 'CRIT_CHANCE', value: 1000 }])),
    ]);
    const s = set1(await dropCombo(request));
    expect(s.alone).toEqual({ more: 'upgrade', dmg: 'downgrade', crit: 'upgrade' });
    expect(s.picks).toEqual([{ entry: 'crit', slot: 'HEAD', alone: 'upgrade' }, { entry: 'dmg', slot: 'LEGGINGS', alone: 'downgrade' }]);
    expect(s.onTop).toEqual({ more: 'downgrade' });
    expect(s.steps.map((st) => [st.round, st.entry])).toEqual([[1, 'crit'], [2, 'dmg']]);
    expect(s.status).toBe('done');
    expect(s.total).toMatchObject({ confirmed: true, verdict: 'upgrade' });
  }, 120000);

  it('no clear upgrade: nothing is picked and nothing more is simulated', async () => {
    const { request } = setup([entry('junk', 'HEAD', gear(100)), entry('same', 'CHEST', gear(5000))]);
    const r = await dropCombo(request);
    const s = set1(r);
    expect(s.status).toBe('none');
    expect(s.picks).toEqual([]);
    expect(s.total).toBeNull();
    expect(s.onTop).toEqual(s.alone);
    expect(r.combo.rounds).toBe(1);
  }, 60000);

  it('a screened drop (no goals) is never a candidate', async () => {
    const { request } = setup([entry('helm', 'HEAD', gear(9000)), entry('chest', 'CHEST', gear(12000))]);
    request.items = request.items.map((it) => (it.entry === 'chest' ? { ...it, goalIds: [] } : it));
    const s = set1(await dropCombo(request));
    expect(s.picks.map((p) => p.entry)).toEqual(['helm']);
    expect(s.alone).toEqual({ helm: 'upgrade' });
  }, 60000);

  it('maxRounds caps the climb and says so', async () => {
    const { request } = setup([entry('helm', 'HEAD', gear(9000)), entry('chest', 'CHEST', gear(12000))], { maxRounds: 1 });
    const s = set1(await dropCombo(request));
    expect(COMBO_ROUNDS_MAX).toBeGreaterThan(1);
    expect(s.status).toBe('capped');
    expect(s.picks).toHaveLength(1);
    expect(s.onTop).toBeNull();
  }, 60000);

  it('is deterministic, and runs as the worker task with phases in its progress', async () => {
    const { request } = setup([entry('helm', 'HEAD', gear(9000)), entry('chest', 'CHEST', gear(12000))]);
    const seen = [];
    const a = await runTask('dropCombo', request, { onProgress: (p) => seen.push(p.phase) });
    const b = await dropCombo(request);
    expect(a).toEqual(b);
    expect([...new Set(seen)]).toEqual(['singles', 'combine', 'confirm']);
  }, 60000);

  it('cancelled in the alone pass: the finished comparisons and no combination', async () => {
    const { request } = setup([entry('helm', 'HEAD', gear(9000))]);
    const ac = new AbortController();
    ac.abort();
    const r = await dropCombo(request, { signal: ac.signal });
    expect(r.aborted).toBe(true);
    expect(r.combo).toBeNull();
  });

  it('cancelled while combining: the alone results and the pick so far, with its alone comparison as the total', async () => {
    const { request, prep } = setup([entry('helm', 'HEAD', gear(9000)), entry('chest', 'CHEST', gear(12000))]);
    const ac = new AbortController();
    const r = await dropCombo(request, { signal: ac.signal, onProgress: (p) => { if (p.phase === 'combine') ac.abort(); } });
    expect(r.aborted).toBe(true);
    const s = set1(r);
    expect(s.status).toBe('cancelled');
    expect(s.picks).toHaveLength(1);
    expect(s.onTop).toBeNull();
    expect(s.total).toMatchObject({ confirmed: false, verdict: 'upgrade' });
    // the list still gets every drop's alone verdict
    expect(judgeEntry(prep.rows[0], entryResults(prep.offsets, prep.rows, 0, r.results)).verdict).toBe('upgrade');
  }, 60000);
});
