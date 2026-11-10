import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import DropDeepCheck from './DropDeepCheck.svelte';
import { setup, click } from '../ui/testkit.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { __resetJobs, jobSignature } from '../../lib/jobs.svelte.js';
import { applyPrefs } from '../../lib/prefs.svelte.js';
import { resolveDropGoals } from '../../lib/ui/dropGoals.js';
import { activeDropProfile } from '../../lib/model/dropCheck.js';

const gear = (attack) => ({ rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 }, secondaryStats: [], conduit: null });
const goalRes = (delta) => ({
  goalId: 'g', label: 'Training dummy: DPS', objectiveKind: 'dps', unit: 'dps', deltaKind: 'relative', higherIsBetter: true,
  before: { mean: 1000, n: 512 }, after: { mean: 1000 + delta, n: 512 },
  delta: { delta, lo: delta - 10, hi: delta + 10, n: 512, verdict: delta > 0 ? 'better' : 'equivalent', higherIsBetter: true },
});
let result;
let calls;
const runner = (request) => {
  calls.push(request);
  return { promise: Promise.resolve(result(request)), cancel() {} };
};
const done = (request, o = {}) => ({
  schema: 'deep-check/1', presetId: request.presetId, goalId: request.goal.id, setKey: 'set1', status: 'done', aborted: false, partial: false,
  verdict: 'upgrade', reason: null, drop: { ...goalRes(50), goalId: request.goal.id }, retune: { ...goalRes(20), goalId: request.goal.id }, guards: [], guardNotes: [],
  without: { run: { reused: false }, candidate: { a: 0 }, changes: [] },
  with: { run: { reused: false }, candidate: { a: 1 }, wearsDrop: true, changes: [{ id: 'x', label: 'Stone in Weapon', from: 'Ruby', to: 'Onyx' }] },
  ...o,
});

let t;
beforeEach(() => {
  localStorage.clear();
  applyPrefs();
  calls = [];
  result = (r) => done(r);
  __resetJobs({ run: runner });
  rosterStore.addCharacter('Deep', 'WARRIOR');
  rosterStore.setEquipmentItem('set1', 'WEAPON', gear(1000));
  rosterStore.addDropGoal({ target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } });
  rosterStore.startDrop('WEAPON', 'base');
  rosterStore.setDropItem(gear(5000));
});
afterEach(() => {
  t?.done();
  __resetJobs();
  vi.restoreAllMocks();
});

function open() {
  const c = rosterStore.current;
  const sig = () => jobSignature({ characterKey: rosterStore.current.id, inputs: JSON.stringify([rosterStore.current.equipment, rosterStore.current.drop]) });
  t = setup(DropDeepCheck, {
    character: c, realm: 'base', drop: c.drop, resolved: resolveDropGoals(activeDropProfile(c).goals, c, []), precision: 'quick', hasStats: true, signature: sig,
  });
  return t;
}
const btn = (label) => t.qa('button').find((b) => b.textContent.trim() === label);
const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); flushSync(); } };

it('runs a dropDeepCheck job for the chosen preset and judge goal, and shows the result card', async () => {
  open();
  click(btn('Deep check'));
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ mode: 'dropDeepCheck', presetId: rosterStore.current.activePresetId, space: 'full', budgetMs: 120000, reuse: null });
  expect(calls[0].character.runs).toEqual([]);
  await settle();
  const text = t.target.textContent;
  expect(text).toContain('Upgrade');
  expect(text).toContain('+5.0%');
  expect(text).toContain('Re-tuning alone');
  expect(text).toContain('Stone in Weapon: Ruby → Onyx');
});

it('Item + re-tune writes the re-tune first, then the item', async () => {
  open();
  click(btn('Deep check'));
  await settle();
  const order = [];
  vi.spyOn(rosterStore, 'applyCandidate').mockImplementation(() => { order.push('cand'); return { ok: true, violations: [] }; });
  vi.spyOn(rosterStore, 'applyDropToSet').mockImplementation(() => { order.push('item'); return true; });
  click(btn('Item + re-tune…'));
  expect(t.target.textContent).toContain('character-wide');
  click(btn('Confirm apply'));
  expect(order).toEqual(['cand', 'item']);
  expect(rosterStore.applyCandidate).toHaveBeenCalledWith(rosterStore.current.activePresetId, { a: 1 });
});

it('a refused re-tune writes nothing', async () => {
  open();
  click(btn('Deep check'));
  await settle();
  vi.spyOn(rosterStore, 'applyCandidate').mockReturnValue({ ok: false, violations: [{ detail: 'no' }] });
  const item = vi.spyOn(rosterStore, 'applyDropToSet');
  click(btn('Item + re-tune…'));
  click(btn('Confirm apply'));
  expect(item).not.toHaveBeenCalled();
});

it('an unworn drop says so and offers no re-tune', async () => {
  result = (r) => done(r, { verdict: 'sidegrade', reason: 'unworn', with: { run: {}, candidate: { a: 2 }, wearsDrop: false, changes: [{ id: 's', label: 'Gear set', from: 'Set 1', to: 'Set 2' }] } });
  open();
  click(btn('Deep check'));
  await settle();
  expect(t.target.textContent).toContain('never wears the item');
  expect(btn('Item + re-tune…')).toBeUndefined();
});

it('Light is passed through, and a cancelled run shows what finished', async () => {
  result = (r) => ({ ...done(r), status: 'cancelled', aborted: true, partial: true, drop: undefined, retune: undefined, with: undefined, verdict: undefined });
  open();
  click(t.qa('[role="radio"], button').find((b) => b.textContent.includes('Light')));
  click(btn('Deep check'));
  expect(calls[0].space).toBe('light');
  await settle();
  expect(t.target.textContent).toContain('only the run without the drop finished');
});
