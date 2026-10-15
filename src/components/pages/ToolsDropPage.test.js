import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ToolsDropPage from './ToolsDropPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { jobsStore, __resetJobs } from '../../lib/jobs.svelte.js';
import { loadImportText, confirmImport, resetImportFlow, importFlow } from '../../lib/importFlow.svelte.js';
import { setPrefs, applyPrefs } from '../../lib/prefs.svelte.js';
import { APP_VERSION as ESTIMATE_VERSION } from '../../lib/calibration.js';
import { field, setField } from '../gear/fieldKit.js';
import lootBag from '../../lib/__fixtures__/real/drop-batch.json';

const gear = (attack) => ({
  rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 },
  secondaryStats: [{ type: 'CRIT_CHANCE', value: 4 }], conduit: null,
});

/** A finished comparison; `verdict` and the interval decide the signal verdictFor reads. */
const metric = (verdict, n = 1024) => ({
  before: { mean: 1000, lo: 990, hi: 1010, n },
  after: { mean: verdict === 'better' ? 1100 : 1001, lo: 1, hi: 2, n },
  delta: {
    delta: verdict === 'better' ? 100 : 1, lo: verdict === 'better' ? 60 : -40, hi: verdict === 'better' ? 140 : 42,
    n, verdict, zone: 5, p: 0.001, nLooks: 1, maxN: 32768, nNeeded: verdict === 'unresolved' ? 90000 : null,
    significant: verdict === 'better', holmReject: verdict === 'better',
  },
});

let calls;
let verdict;
function runner(request) {
  calls.push(request);
  const results = request.items.map((it) => ({ presetId: it.presetId, ...(request.sim ? { sim: metric(verdict) } : {}) }));
  return { promise: Promise.resolve({ results, aborted: false }), cancel() {} };
}

let target;
let app;
beforeEach(() => {
  localStorage.clear();
  calls = [];
  verdict = 'better';
  resetImportFlow();
  __resetJobs({ run: runner });
  rosterStore.addCharacter('Drop Page', 'WARRIOR');
  rosterStore.setEquipmentItem('set1', 'WEAPON', gear(1000));
  rosterStore.setEquipmentItem('set2', 'WEAPON', gear(1000));
  target = document.createElement('div');
  document.body.appendChild(target);
  app = null;
});
afterEach(() => {
  if (app) unmount(app);
  target.remove();
  __resetJobs();
});

function open(props = {}) {
  app = mount(ToolsDropPage, { target, props: { setStatus: () => {}, ...props } });
  flushSync();
}
const q = (label) => field(target, label);
const btn = (text) => [...target.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const change = setField;
const settle = () => vi.waitFor(() => { flushSync(); expect(jobsStore.running).toBe(0); expect(jobsStore.list.length).toBeGreaterThan(0); });
const card = (setKey) => target.querySelector(`[data-set="${setKey}"]`);

it('before any run it shows only an ESTIMATE and a neutral "Not simulated" chip, never a verdict', () => {
  open();
  change(q('Attack'), '9.000');
  expect(card('set1').dataset.verdict).toBe('unresolved');
  expect(card('set1').textContent).toContain('Not simulated');
  expect(card('set1').querySelector('.prov.estimate')).not.toBeNull();
  expect(card('set1').querySelector('.vchip.up, .vchip.down')).toBeNull();
  expect(card('set1').querySelector('.est').className).not.toMatch(/up|down/);
  expect(jobsStore.list).toHaveLength(0);
});

it('Check drop runs a job with the chosen effort; the card shows the Holm verdict and what it covered', async () => {
  open();
  change(q('Attack'), '9.000');
  btn('Check drop').click();
  flushSync();
  expect(jobsStore.list[0]).toMatchObject({ tool: 'drop' });
  await settle();
  expect(calls[0]).toMatchObject({ mode: 'dropCheck', precision: 'standard', sim: true });
  expect(card('set1').dataset.verdict).toBe('better');
  expect(card('set1').textContent).toContain('Upgrade');
  expect(card('set1').textContent).toContain('DPS only: defence not measured');
  expect(card('set1').querySelector('.vchip.up')).not.toBeNull();
  // the estimate stays under the simulated figures, uncoloured
  expect(card('set1').querySelector('.estimate .est').className).not.toMatch(/up|down/);
});

it('an unresolved comparison is "Too close to call" (neutral) and Run more raises the precision', async () => {
  verdict = 'unresolved';
  open();
  change(q('Attack'), '9.000');
  btn('Check drop').click();
  flushSync();
  await settle();
  expect(card('set1').textContent).toContain('Too close to call');
  expect(card('set1').querySelector('.vchip.up, .vchip.down')).toBeNull();
  expect(card('set1').textContent).toContain('fights needed');
  btn('Run more').click();
  flushSync();
  await vi.waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1].precision).toBe('thorough');
  expect(jobsStore.list).toHaveLength(2);
});

it('editing the drop after a run marks the result stale instead of showing it as current', async () => {
  open();
  change(q('Attack'), '9.000');
  btn('Check drop').click();
  flushSync();
  await settle();
  expect(target.textContent).not.toContain('Stale.');
  change(q('Attack'), '20.000');
  expect(target.textContent).toContain('Stale.');
});

it('Apply names its scope first and writes only after the confirm', async () => {
  const setStatus = vi.fn();
  open({ setStatus });
  change(q('Attack'), '9.000');
  btn('Check drop').click();
  flushSync();
  await settle();
  btn('Apply to Set 2…').click();
  flushSync();
  expect(rosterStore.current.equipment.set2.items.WEAPON.primaryStats.attack).toBe(1000);
  expect(card('set2').textContent).toContain('Writes Set 2');
  btn('Confirm apply').click();
  flushSync();
  expect(rosterStore.current.equipment.set2.items.WEAPON.primaryStats.attack).toBe(9000);
  expect(rosterStore.current.equipment.set1.items.WEAPON.primaryStats.attack).toBe(1000);
  expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('Applied to Set 2'));
});

// A loot bag arrives through Settings > Import (the shared flow), never through a box on this page.
const paste = (json) => {
  loadImportText(JSON.stringify(json));
  confirmImport();
  flushSync();
};

it('Loot bag: no drop zone or paste box, only a pointer to Settings > Import that asks for focus', () => {
  open({ tab: 'bag' });
  expect(target.querySelector('#dc-panel-bag input[type="file"]')).toBeNull();
  expect(target.querySelector('#dc-panel-bag textarea')).toBeNull();
  const link = target.querySelector('[data-testid="import-pointer"] a');
  expect(link.getAttribute('href')).toBe('#/settings');
  expect(link.textContent).toContain('Import a loot bag in Settings');
  const before = importFlow.focusSeq;
  link.click();
  expect(importFlow.focusSeq).toBe(before + 1);
});

it('Loot bag: the batch is a job, rows rank in one DPS table, and a gear edit marks it stale', async () => {
  open({ tab: 'bag' });
  paste(lootBag);
  expect(jobsStore.list[0]).toMatchObject({ tool: 'drop-bag' });
  await settle();
  const rows = [...target.querySelectorAll('.trow.rank')];
  expect(rows).toHaveLength(4);
  expect(target.querySelectorAll('.tbl .axis')).toHaveLength(1);
  expect(target.querySelector('.summary').textContent).toContain('upgrade');
  expect(target.textContent).not.toContain('Stale.');
  rosterStore.setEquipmentItem('set1', 'WEAPON', gear(5000));
  flushSync();
  expect(target.textContent).toContain('Stale.');
  // rows expand to one card per gear set
  rows[0].querySelector('.toggle').click();
  flushSync();
  expect(target.querySelectorAll('.expand [data-set]').length).toBeGreaterThan(0);
});

it('Loot bag: Run more at Thorough raises maxN, and the next step raises it again', async () => {
  verdict = 'unresolved';
  open({ tab: 'bag' });
  paste(lootBag);
  await settle();
  target.querySelector('.trow.rank .toggle').click();
  flushSync();
  btn('Run more').click(); // standard -> thorough
  flushSync();
  await vi.waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1].precision).toBe('thorough');
  await settle();
  btn('Run more').click(); // thorough -> 4x maxN
  flushSync();
  await vi.waitFor(() => expect(calls).toHaveLength(3));
  expect(calls[2].precision).toBe('thorough');
  expect(calls[2].maxN).toBeGreaterThan(calls[1].maxN ?? 0);
  await settle();
  btn('Run more').click();
  flushSync();
  await vi.waitFor(() => expect(calls).toHaveLength(4));
  expect(calls[3].maxN).toBeGreaterThan(calls[2].maxN);
});

it('Loot bag: before the job finishes a row is Queued/Simulating, not a verdict', async () => {
  __resetJobs({ run: () => ({ promise: new Promise(() => {}), cancel() {} }) });
  open({ tab: 'bag' });
  paste(lootBag);
  const chips = [...target.querySelectorAll('.trow.rank .vchip')].map((c) => c.textContent.trim());
  expect(chips).toHaveLength(4);
  expect(chips.every((c) => /Simulating|Queued/.test(c))).toBe(true);
  expect(target.querySelector('.trow.rank .vchip.up, .trow.rank .vchip.down')).toBeNull();
});

it('Import dialog handoff: a loot bag confirmed before the page opens lands on Loot bag and runs', async () => {
  expect(loadImportText(JSON.stringify(lootBag))).toBe(true);
  expect(confirmImport()).toBe(true);
  open();
  await settle();
  expect(jobsStore.list[0]).toMatchObject({ tool: 'drop-bag' });
  expect(target.querySelector('#dc-panel-bag')).not.toBeNull();
  expect(target.querySelectorAll('.trow.rank')).toHaveLength(4);
});

it('Import dialog handoff: a page that is already open reacts to a new loot bag', async () => {
  open();
  expect(target.querySelector('#dc-panel-single')).not.toBeNull();
  loadImportText(JSON.stringify(lootBag));
  confirmImport();
  flushSync();
  await settle();
  expect(target.querySelector('#dc-panel-bag')).not.toBeNull();
  expect(target.querySelectorAll('.trow.rank')).toHaveLength(4);
  expect(jobsStore.list.filter((j) => j.tool === 'drop-bag')).toHaveLength(1);
});

it('PVP win rate measures every saved opponent as soon as it is switched on, and Set 2 gets its own table', async () => {
  const oppId = rosterStore.addOpponent('WARRIOR_TANK', 'Rival');
  rosterStore.setOpponentSheet(oppId, { totalHp: 800, totalAttack: 30, totalAttackSpeed: 1, totalCritChance: 5, totalCritDamage: 150 });
  __resetJobs({
    run: (request) => {
      calls.push(request);
      const results = request.items.map((it) => ({
        presetId: it.presetId,
        ...(request.sim ? { sim: metric('better') } : {}),
        pvp: request.opponents.map((o) => ({ opponentId: o.id, name: o.name, ...metric('better') })),
      }));
      return { promise: Promise.resolve({ results, aborted: false }), cancel() {} };
    },
  });
  open();
  change(q('Attack'), '9.000');
  const toggle = [...target.querySelectorAll('input[type="checkbox"]')].find((c) => c.closest('label')?.textContent.includes('PVP win rate'));
  toggle.click();
  flushSync();
  btn('Check drop').click();
  flushSync();
  await settle();
  expect(calls[0].opponents.map((o) => o.id)).toEqual([oppId]);
  const tables = [...target.querySelectorAll('[data-metric-table]')].map((t) => t.dataset.metricTable);
  expect(tables).toEqual(['sim', `pvp:${oppId}`]);
  const pvp = target.querySelector(`[data-metric-table="pvp:${oppId}"]`);
  expect(pvp.textContent).toContain('Set 2');
  expect(pvp.querySelectorAll('.axis')).toHaveLength(1);
});

it('the preference default effort is the effort the page starts with', async () => {
  setPrefs({ defaultEffort: 'thorough' });
  try {
    open();
    change(q('Attack'), '9.000');
    btn('Check drop').click();
    flushSync();
    await settle();
    expect(calls[0].precision).toBe('thorough');
  } finally {
    localStorage.clear();
    applyPrefs();
  }
});

it('Loot bag: the too-close-to-call count in the summary takes the neutral verdict colour', async () => {
  verdict = 'unresolved';
  open({ tab: 'bag' });
  paste(lootBag);
  await settle();
  const count = target.querySelector('.summary [data-count="inconclusive"]');
  expect(count).not.toBeNull();
  expect(count.classList.contains('side')).toBe(true);
});

// ---- S2 run-time estimates -----------------------------------------------------------------------
const CAL = () => ({ profile: 'balanced', workers: 4, fightsPerSec: { dummy: 1, dungeon: 1, duel: 1 }, measuredAt: Date.now(), version: ESTIMATE_VERSION });
const estimate = () => target.querySelector('[data-testid="run-estimate"]');
const pickEffort = (name) => [...target.querySelectorAll('button[aria-pressed]')].find((b) => b.textContent.trim().startsWith(name));

it('S2: single drop shows an upper-bound estimate that follows the effort, or a link to calibrate', () => {
  applyPrefs();
  open();
  change(q('Attack'), '9.000');
  expect(estimate().querySelector('a').getAttribute('href')).toBe('#/settings');
  setPrefs({ calibration: CAL() });
  flushSync();
  expect(estimate().textContent).toMatch(/Up to .* on this device \(estimate\)/);
  const before = estimate().textContent;
  pickEffort('Thorough').click();
  flushSync();
  expect(estimate().textContent).not.toBe(before);
  localStorage.clear();
  applyPrefs();
});

it('S2: Loot bag shows a neutral note before the import, then an upper-bound estimate from the batch', () => {
  applyPrefs();
  setPrefs({ calibration: CAL() });
  open({ tab: 'bag' });
  expect(target.querySelector('[data-testid="run-estimate-bag"]')).not.toBeNull();
  paste(lootBag);
  expect(target.querySelector('[data-testid="run-estimate-bag"]')).toBeNull();
  expect(estimate().textContent).toMatch(/Up to .* on this device \(estimate\)/);
  const before = estimate().textContent;
  pickEffort('Thorough').click();
  flushSync();
  expect(estimate().textContent).not.toBe(before);
  localStorage.clear();
  applyPrefs();
});

it('S2: Loot bag without a calibration links to Settings once a bag is imported', () => {
  applyPrefs();
  open({ tab: 'bag' });
  paste(lootBag);
  expect(estimate().querySelector('a').getAttribute('href')).toBe('#/settings');
});
