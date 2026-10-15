import { it, expect, vi, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import VerdictCard from './VerdictCard.svelte';
import { prepareSwap } from '../../lib/features/swap.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

const item = (attack) => ({ rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 }, secondaryStats: [], conduit: null });
const ci = (delta, lo, hi, n = 32, zone = 0) => ({
  delta, lo, hi, n, zone, significant: lo > 0 || hi < 0,
  verdict: lo > 0 ? 'better' : hi < 0 ? 'worse' : zone > 0 && -zone < lo && hi < zone ? 'equivalent' : 'unresolved',
});
const sim = (d) => ({ sim: { before: { mean: 1000, lo: 990, hi: 1010, n: 32 }, after: { mean: 1000 + d.delta, lo: 0, hi: 0, n: 32 }, delta: d } });

function rowsFor(attack) {
  return prepareSwap(fixtureCharacter('WARRIOR'), { slot: 'WEAPON', item: item(attack) });
}

function render(props) {
  const app = mount(VerdictCard, { target, props });
  flushSync();
  return app;
}
const btn = (text) => [...target.querySelectorAll('button')].find((b) => b.textContent.includes(text));

it('without simulation results: the closed-form verdict, an Apply button, no CI lines', () => {
  const onApply = vi.fn();
  const rows = rowsFor(40000);
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows: rows.filter((r) => r.setKey === 'set1'), onApply });
  const card = target.querySelector('[data-set="set1"]');
  expect(card.dataset.verdict).toBe('upgrade');
  expect(target.textContent).toContain('Auto-attack DPS');
  expect(target.textContent).toContain('recomputed from gear');
  expect(target.querySelector('[data-metric="sim"]')).toBeNull();
  btn('Apply to Set 1').click();
  expect(onApply).toHaveBeenCalledWith('set1');
  unmount(app);
});

it('shows the paired sim delta with N and the 95% interval, plus survival and PVP rows', () => {
  const rows = rowsFor(40000).filter((r) => r.setKey === 'set1');
  const results = {
    [rows[0].presetId]: {
      ...sim(ci(120, 80, 160)),
      survival: { before: { mean: 0.5 }, after: { mean: 0.6 }, delta: ci(0.1, 0.02, 0.18, 200) },
      pvp: [{ opponentId: 'o1', name: 'Rival', before: { mean: 0.4 }, after: { mean: 0.45 }, delta: ci(0.05, 0.01, 0.09, 64) }],
    },
  };
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows, results, status: 'done', onApply: () => {} });
  const simLine = target.querySelector('[data-metric="sim"]').textContent;
  expect(simLine).toContain('N=32');
  expect(simLine).toContain('95% CI +80 to +160');
  expect(simLine).toContain('+120');
  const surv = target.querySelector('[data-metric="survival"]').textContent;
  expect(surv).toContain('50.0% → 60.0%');
  expect(surv).toContain('N=200');
  expect(target.querySelector('[data-metric="pvp"]').textContent).toContain('PVP vs Rival');
  expect(target.querySelector('li').dataset.verdict).toBe('upgrade');
  unmount(app);
});

it('an interval inside the indifference zone is a sidegrade; one spanning zero is too close to call', () => {
  const rows = rowsFor(40000).filter((r) => r.setKey === 'set1');
  const flatApp = render({ setKey: 'set1', setLabel: 'Set 1', rows, results: { [rows[0].presetId]: sim(ci(1, -4, 6, 4096, 10)) }, status: 'done', onApply: () => {} });
  expect(target.querySelector('li').dataset.verdict).toBe('sidegrade');
  expect(target.querySelector('[data-set]').dataset.verdict).toBe('sidegrade');
  unmount(flatApp);
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows, results: { [rows[0].presetId]: sim(ci(5, -60, 70)) }, status: 'done', onApply: () => {} });
  expect(target.querySelector('li').dataset.verdict).toBe('inconclusive');
  expect(target.textContent).toContain('Too close to call');
  unmount(app);
});

it('states what the verdict covers and which changed stats it did not judge', () => {
  const c = fixtureCharacter('WARRIOR');
  const hpItem = { ...item(0), secondaryStats: [{ type: 'HEALTH_PERCENT', value: 10 }] };
  const rows = prepareSwap(c, { slot: 'WEAPON', item: hpItem }).filter((r) => r.setKey === 'set1');
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows, results: { [rows[0].presetId]: sim(ci(0, -1, 1, 4096, 10)) }, status: 'done', onApply: () => {} });
  const cov = target.querySelector('.coverage').textContent;
  expect(cov).toContain('DPS only: defence not measured');
  expect(cov).toContain('Not judged');
  unmount(app);
});

it('shows a pending note while simulating', () => {
  const rows = rowsFor(40000).filter((r) => r.setKey === 'set1');
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows, status: 'running', onApply: () => {} });
  expect(target.textContent).toContain('Simulating');
  unmount(app);
});

it('a mixed verdict needs a second click to apply', () => {
  const c = fixtureCharacter('WARRIOR');
  // two presets on the same set: one improves, one worsens (synthetic results)
  c.presets[1].equipmentSet = 1;
  const rows = prepareSwap(c, { slot: 'WEAPON', item: item(40000) });
  expect(rows.map((r) => r.setKey)).toEqual(['set1', 'set1']);
  const results = {
    [rows[0].presetId]: sim(ci(100, 60, 140)),
    [rows[1].presetId]: sim(ci(-100, -140, -60)),
  };
  const onApply = vi.fn();
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows, results, status: 'done', onApply });
  expect(target.querySelector('[data-set]').dataset.verdict).toBe('mixed');
  expect(target.textContent).toContain('Mixed verdict');
  btn('Apply to Set 1').click();
  flushSync();
  expect(onApply).not.toHaveBeenCalled();
  btn('Confirm mixed apply').click();
  expect(onApply).toHaveBeenCalledWith('set1');
  unmount(app);
});

it('notes sheet anchoring in the row', () => {
  const c = fixtureCharacter('WARRIOR');
  const rows = prepareSwap(c, { slot: 'WEAPON', item: item(40000) });
  rows[0].method = 'anchored';
  const app = render({ setKey: 'set1', setLabel: 'Set 1', rows: [rows[0]], onApply: () => {} });
  expect(target.textContent).toContain('anchored on your sheet');
  unmount(app);
});
