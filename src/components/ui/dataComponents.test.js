import { it, expect, vi } from 'vitest';
import ProvenanceTag from './ProvenanceTag.svelte';
import VerdictChip from './VerdictChip.svelte';
import ScopeChip from './ScopeChip.svelte';
import StatTable from './StatTable.svelte';
import CIForest from './CIForest.svelte';
import ForestAxis from './ForestAxis.svelte';
import RunProgress from './RunProgress.svelte';
import ResultRank from './ResultRank.svelte';
import { setup, click } from './testkit.js';
import { forestDomain } from '../../lib/ui/forestScale.js';

const M = '−';

it('ProvenanceTag: one class per kind, never a verdict class', () => {
  for (const [kind, word] of [['sheet', 'Sheet'], ['model', 'Model'], ['estimate', 'Estimate'], ['stale', 'Stale']]) {
    const t = setup(ProvenanceTag, { kind });
    expect(t.q('.prov').classList.contains(kind)).toBe(true);
    expect(t.q('.prov').textContent).toBe(word);
    t.done();
  }
});

it('VerdictChip: inconclusive and equivalent exist; only better/worse are coloured', () => {
  const read = (verdict) => {
    const t = setup(VerdictChip, { verdict });
    const out = { text: t.q('.vchip').textContent.trim(), cls: t.q('.vchip').className };
    t.done();
    return out;
  };
  expect(read('unresolved').text).toContain('Inconclusive');
  expect(read('equivalent').text).toContain('Equivalent');
  expect(read('better').cls).toContain('up');
  expect(read('worse').cls).toContain('down');
  for (const v of ['unresolved', 'equivalent', 'remainder', 'pending', 'queued']) {
    expect(read(v).cls).not.toMatch(/\b(up|down)\b/);
  }
  expect(read('remainder').text).toBe('Remainder');
});

it('VerdictChip: the glyph is aria-hidden', () => {
  const t = setup(VerdictChip, { verdict: 'better', label: 'Upgrade · Set 1' });
  expect(t.q('.g').getAttribute('aria-hidden')).toBe('true');
  expect(t.q('.vchip').textContent).toContain('Upgrade · Set 1');
  t.done();
});

it('ScopeChip: reads as one sentence with side effects named', () => {
  const t = setup(ScopeChip, { scope: 'character', target: 'Talent Set A', sideEffects: [{ name: 'Boss build' }] });
  expect(t.q('.scope-chip').textContent.replace(/\s+/g, ' ').trim()).toBe('Character Talent Set A, also Boss build');
  t.done();
  const p = setup(ScopeChip, { scope: 'preset', target: 'Farm build only' });
  expect(p.q('em')).toBeNull();
  p.done();
});

it('StatTable: real table, flat vs percent formatting, residual colouring', () => {
  const rows = [
    { key: 'totalAttack', label: 'Attack', value: 12345, base: 12000, residual: 345, source: 'sheet' },
    { key: 'totalCritChance', label: 'Crit', value: 12.5, base: 12.5, residual: 0, source: 'model' },
  ];
  const s = setup(StatTable, { rows, mode: 'source' });
  expect(s.q('table')).not.toBeNull();
  expect(s.qa('thead th[scope="col"]').length).toBe(3);
  expect(s.qa('tbody tr')[0].textContent).toContain('12.345');
  expect(s.qa('tbody tr')[1].textContent).toContain('12.5');
  expect(s.qa('.prov').map((e) => e.textContent)).toEqual(['Sheet', 'Model']);
  s.done();
  const r = setup(StatTable, { rows, mode: 'residual', footer: 'Sheet vs model 9 / 10 explained' });
  const cells = r.qa('tbody tr')[0].querySelectorAll('td');
  expect(cells[1].classList.contains('up')).toBe(true);
  expect(r.qa('tbody tr')[1].querySelectorAll('td')[1].classList.contains('up')).toBe(false);
  expect(r.q('tfoot').textContent).toContain('9 / 10');
  r.done();
});

it('CIForest: rows on one domain share positions; est tone draws no bar', () => {
  const domain = forestDomain([{ est: 4, lo: -2, hi: 6 }]);
  const a = setup(CIForest, { domain, est: 2, lo: 1, hi: 3, tone: 'up' });
  const b = setup(CIForest, { domain, est: 2, lo: -1, hi: 5, tone: 'side' });
  expect(a.q('.pt').style.left).toBe(b.q('.pt').style.left);
  expect(a.q('.forest').style.getPropertyValue('--zero')).toBe(b.q('.forest').style.getPropertyValue('--zero'));
  a.done();
  b.done();
  const e = setup(CIForest, { domain, est: 2, lo: 1, hi: 3, tone: 'est', label: 'x' });
  expect(e.q('.bar')).toBeNull();
  expect(e.q('.forest').getAttribute('aria-hidden')).toBe('true');
  expect(e.q('.visually-hidden').textContent).toBe('x');
  e.done();
});

it('ForestAxis: one labelled axis, zero tick emphasised', () => {
  const domain = forestDomain([{ est: 4, lo: -2, hi: 6 }]);
  const t = setup(ForestAxis, { domain, title: 'Δ DPS vs current (%)' });
  expect(t.qa('.axis').length).toBe(1);
  expect(t.q('.cap').textContent).toBe('Δ DPS vs current (%)');
  expect(t.qa('.t.zero').length).toBe(1);
  t.done();
});

it('RunProgress: data-driven segments with progressbar text', () => {
  const segments = [
    { id: 'screen', label: 'Screening', state: 'done', done: 10, total: 10 },
    { id: 'minimise', label: 'Re-measure', state: 'active', done: 4, total: 6 },
    { id: 'attribute', label: 'Ablation', state: 'queued' },
  ];
  const t = setup(RunProgress, { segments });
  const bars = t.qa('[role="progressbar"]');
  expect(bars.length).toBe(3);
  expect(bars[1].getAttribute('aria-valuetext')).toBe('Re-measure, 4 of 6');
  expect(bars[1].getAttribute('aria-valuenow')).toBe('67');
  expect(bars[0].getAttribute('aria-valuenow')).toBe('100');
  expect(t.qa('.seg-step')[2].classList.contains('is-queued')).toBe(true);
  t.done();
  const two = setup(RunProgress, { segments: segments.slice(0, 2) });
  expect(two.qa('.seg-step').length).toBe(2);
  two.done();
});

it('RunProgress: the A.9 "current" phase state is drawn as the active segment', () => {
  const t = setup(RunProgress, { segments: [{ id: 'search', label: 'Search', state: 'current', done: 1, total: 4 }] });
  expect(t.q('.seg-step').classList.contains('is-active')).toBe(true);
  t.done();
});

const contrast = (over = {}) => ({
  delta: 1000, lo: -3000, hi: 5000, pct: null, n: 800, seed: 1, alphaAdj: 0.05, method: 'paired-t',
  verdict: 'unresolved', significant: false, nNeeded: 4000, ...over,
});
const row = (over = {}) => ({
  rank: 1, tieGroup: null, isBaseline: false, provisional: false, key: 'k', engineKey: 'e', candidate: {},
  value: { est: 2500, lo: 2000, hi: 3000, n: 800 },
  aux: {}, vsBaseline: contrast(), remainder: { delta: 120, lo: null, hi: null, method: 'subtraction' },
  writes: [], runMore: { targetN: 4096, reason: 'unresolved' }, lines: [],
  changes: [
    {
      id: 'pet', dimension: 'Pet', label: 'Pet', from: 'Emberkit', to: 'Pyre Wyrmling', scope: 'preset',
      owner: {}, sideEffects: [], bundle: [],
      own: contrast({ delta: 800, lo: 100, hi: 1500, verdict: 'better', significant: true }),
      needed: contrast({ delta: -700, lo: -1200, hi: -200, verdict: 'worse', significant: true }),
      keptBecause: 'own-effect',
    },
    {
      id: 'relics', dimension: 'Relics', label: 'Relics', from: 'A', to: 'B', scope: 'character',
      owner: {}, sideEffects: [{ presetId: 'p2', name: 'Boss build', reason: 'shared' }], bundle: [],
      own: null, needed: contrast(), keptBecause: 'interaction',
    },
  ],
  ...over,
});
const domain = forestDomain([{ est: 1000, lo: -3000, hi: 5000 }]);

it('ResultRank: a ms CI spanning zero keeps its signs and is not coloured', () => {
  const t = setup(ResultRank, { row: row(), unit: 'ms', domain });
  expect(t.q('.delta .ci').textContent).toBe(`95% CI ${M}3.00 s to +5.00 s`);
  expect(t.q('.delta .v').className).not.toMatch(/\b(up|down)\b/);
  expect(t.q('.vchip').textContent).toContain('Inconclusive');
  expect(t.q('.n').textContent).toBe('Too close to call at 800');
  t.done();
});

it('ResultRank: toggle controls the body; expanded lists changes, scope, remainder', () => {
  const t = setup(ResultRank, { row: row(), unit: 'dps', domain, presetName: 'Farm build' });
  const btn = t.q('button.toggle');
  expect(btn.getAttribute('aria-expanded')).toBe('false');
  expect(t.q('.body')).toBeNull();
  click(btn);
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  const body = t.q('.body');
  expect(body.id).toBe(btn.getAttribute('aria-controls'));
  const abl = t.qa('.abl');
  expect(abl.length).toBe(3);
  expect(abl[0].textContent).toContain('Emberkit');
  expect(abl[0].textContent).toContain('Farm build only');
  expect(abl[0].textContent).toContain('Without it');
  expect(abl[1].textContent).toContain('also Boss build');
  const rem = t.q('.remainder');
  expect(rem.textContent).toContain('Remainder');
  expect(rem.textContent).toContain('no interval');
  expect(rem.querySelector('.bar')).toBeNull();
  expect(rem.querySelector('.v').className).not.toMatch(/\b(up|down)\b/);
  expect(rem.querySelector('.forest').className).toContain('is-est');
  t.done();
});

it('ResultRank: a change with an exactly zero own effect reads "Only with: <driver>", Without it as the number, no verdict chip', () => {
  const zero = contrast({ delta: 0, lo: 0, hi: 0, verdict: 'equivalent', significant: true });
  const r = row({
    changes: [
      {
        id: 'spec', dimension: 'spec', label: 'Talent set', from: 'A', to: 'B', scope: 'preset', owner: {}, sideEffects: [],
        bundle: ['talents:1'], own: contrast({ delta: 800, lo: 100, hi: 1500, verdict: 'better', significant: true }), needed: contrast(), keptBecause: 'own-effect',
      },
      {
        id: 'talents:1', dimension: 'talents', label: 'Talents (Set B)', from: 'None', to: 'Rage 3', scope: 'character', owner: {}, sideEffects: [],
        bundle: [], own: zero, needed: contrast({ delta: -700, lo: -1200, hi: -200, verdict: 'worse', significant: true }), keptBecause: 'interaction',
      },
    ],
  });
  const t = setup(ResultRank, { row: r, unit: 'dps', domain });
  click(t.q('button.toggle'));
  const dep = t.qa('.abl')[1];
  expect(dep.textContent).toContain('Only with: Talent set');
  expect(dep.textContent).toContain('700');
  expect(dep.textContent).not.toContain('Equivalent');
  expect(dep.querySelector('.vchip')).toBeNull();
  expect(t.qa('.abl')[0].querySelector('.vchip')).not.toBeNull();
  t.done();
});

it('ResultRank: baseline has no verdict; provisional rows are never up/down; Run more calls back', () => {
  const b = setup(ResultRank, { row: row({ isBaseline: true, rank: 0, changes: [], vsBaseline: null, remainder: null, runMore: null }), unit: 'dps', domain });
  expect(b.q('.mark').textContent).toBe('NOW');
  expect(b.q('.vchip')).toBeNull();
  expect(b.q('.forest').className).toContain('is-base');
  b.done();
  const better = row({ provisional: true, vsBaseline: contrast({ verdict: 'better', significant: true }) });
  const p = setup(ResultRank, { row: better, unit: 'dps', domain });
  expect(p.q('.vchip').textContent).toContain('Simulating');
  expect(p.q('.forest').className).not.toMatch(/is-up|is-down/);
  p.done();
  const onrunmore = vi.fn();
  const r = setup(ResultRank, { row: row({ tieGroup: 1, rank: 2 }), unit: 'dps', domain, onrunmore });
  expect(r.q('.mark').textContent).toBe('2=');
  click(r.q('.link-btn'));
  expect(onrunmore).toHaveBeenCalledTimes(1);
  r.done();
});

it('ScopeChip: the comma follows the target in its own run, never trailing inside it', () => {
  const t = setup(ScopeChip, { scope: 'character', target: 'Talents', sideEffects: ['PVP'] });
  expect(t.q('.tg').textContent).toBe('Talents');
  expect(t.q('.sep').textContent).toBe(',');
  expect(t.q('em').textContent).toBe('also PVP');
  t.done();
  const noTarget = setup(ScopeChip, { scope: 'preset', target: '', sideEffects: ['PVP'] });
  expect(noTarget.q('.sep')).toBeNull();
  noTarget.done();
  const g = setup(ScopeChip, { scope: 'global', target: 'This device' });
  expect(g.q('b').textContent).toBe('Global');
  expect(g.q('.scope-chip').getAttribute('style')).toContain('--scope-global');
  g.done();
});

it('ResultRank: the summary, scope chip and Comes with name things; no internal id or key shows', () => {
  const gl = (i) => ({
    id: `glyph:bb55b082-1082-43da-ba9d-bd6b1633c75d:minor:${i}`, dimension: 'minorGlyphs', label: `Wolf minor socket ${i + 1}`, from: 'Empty', to: 'Riven Fang (Rare, Attack Speed)',
    scope: 'mount', owner: {}, sideEffects: [], bundle: [], own: null, needed: null, keptBecause: null,
  });
  const r = row({
    changes: [
      { id: 'talents:0', dimension: 'talents', label: 'Talents (Set A)', from: 'None', to: 'Rage 3', scope: 'character', owner: {}, sideEffects: [{ presetId: 'p2', name: 'PVP', reason: 'x' }], bundle: [gl(0).id, gl(1).id, gl(2).id], own: null, needed: null, keptBecause: null },
      gl(0), gl(1), gl(2),
    ],
  });
  const t = setup(ResultRank, { row: r, unit: 'dps', domain, presetName: 'Farm build' });
  expect(t.q('.meta').textContent).toBe('4 changes · Talents, 3 glyph sockets');
  click(t.q('button[aria-expanded]'));
  const body = t.q('[role="region"]').textContent;
  expect(body).toContain('Comes with: 3 glyph sockets');
  expect(body).not.toMatch(/glyph:|talents:\d|minorGlyphs|[0-9a-f]{8}-[0-9a-f]{4}/);
  const chip = t.q('.scope-chip');
  expect(chip.querySelector('.tg').textContent).toBe('Talents');
  expect(chip.querySelector('.sep').textContent).toBe(',');
  t.done();
});
