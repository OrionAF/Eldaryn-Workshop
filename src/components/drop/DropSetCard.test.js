import { it, expect, vi, afterEach } from 'vitest';
import DropSetCard from './DropSetCard.svelte';
import { setup, click } from '../ui/testkit.js';

const metric = (verdict, delta, o = {}) => ({
  before: { mean: 1000, n: 512 },
  after: { mean: 1000 + delta, n: 512 },
  delta: { delta, lo: delta - 20, hi: delta + 20, n: 512, verdict, zone: 5, ...o },
});
const card = (o = {}) => ({
  setKey: 'set1', setLabel: 'Set 1', verdict: 'upgrade', basis: 'sim', coverageLabel: 'DPS only: defence not measured',
  notJudged: ['Health %'], unresolved: false, nNeeded: null, presetNames: ['Farm', 'Boss'], estimatePct: 3.6,
  presets: [{ presetId: 'a', name: 'Farm', method: 'anchored', approx: false, verdict: 'upgrade', metrics: [{ id: 'sim', label: 'DPS vs training dummy', unit: 'dps', m: metric('better', 100) }] }],
  ...o,
});
let t;
afterEach(() => t?.done());

it('states the coverage, what was not judged, the preset metric row and a scope-named footer', () => {
  t = setup(DropSetCard, { card: card(), onapply: () => {} });
  const text = t.target.textContent;
  expect(text).toContain('DPS only: defence not measured');
  expect(text).toContain('Not judged: Health %');
  expect(text).toContain('+10.00%');
  expect(text).toContain('N 512');
  expect(t.q('.scope-chip').textContent).toContain('Gear Set 1');
  expect(t.q('.scope-chip').textContent).toContain('also Farm, Boss');
  expect(t.q('.vchip.up').textContent).toContain('Upgrade');
});

it('the estimate is labelled ESTIMATE and never coloured', () => {
  t = setup(DropSetCard, { card: card(), onapply: () => {} });
  expect(t.q('.estimate .prov.estimate')).not.toBeNull();
  expect(t.q('.estimate .est').className).not.toMatch(/\b(up|down)\b/);
});

it('an inconclusive set is neutral, names the fights needed and offers Run more', () => {
  const onrunmore = vi.fn();
  t = setup(DropSetCard, {
    card: card({ verdict: 'inconclusive', unresolved: true, nNeeded: 6400, presets: [{ presetId: 'a', name: 'Farm', method: 'recomputed', approx: false, verdict: 'inconclusive', metrics: [{ id: 'sim', label: 'DPS', unit: 'dps', m: metric('unresolved', 2) }] }] }),
    onapply: () => {},
    onrunmore,
  });
  expect(t.q('.vchip').textContent).toContain('Too close to call');
  expect(t.q('.vchip.up, .vchip.down')).toBeNull();
  expect(t.target.textContent).toContain('about 6,400 fights needed');
  click([...t.qa('button')].find((b) => b.textContent.includes('Run more')));
  expect(onrunmore).toHaveBeenCalledOnce();
});

it('a card without a simulation shows no metric rows and a neutral chip', () => {
  t = setup(DropSetCard, { card: card({ basis: 'closed', presets: [] }), phase: 'running', onapply: () => {} });
  expect(t.q('.vchip').textContent).toContain('Simulating');
  expect(t.q('.met')).toBeNull();
  expect(t.q('.coverage').textContent).toContain('Simulation not finished');
});

it('Apply asks first, naming the set and the presets it changes', () => {
  const onapply = vi.fn();
  t = setup(DropSetCard, { card: card({ verdict: 'mixed' }), onapply });
  const apply = [...t.qa('button')].find((b) => b.textContent.includes('Apply to Set 1'));
  click(apply);
  expect(onapply).not.toHaveBeenCalled();
  expect(t.q('.confirm').textContent).toContain('Writes Set 1; changes Farm, Boss');
  expect(t.q('.confirm').textContent).toContain('helps some presets and hurts others');
  click([...t.qa('button')].find((b) => b.textContent.includes('Confirm apply')));
  expect(onapply).toHaveBeenCalledWith('set1');
});
