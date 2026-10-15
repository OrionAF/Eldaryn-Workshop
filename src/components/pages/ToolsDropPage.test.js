import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ToolsDropPage from './ToolsDropPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { jobsStore, __resetJobs } from '../../lib/jobs.svelte.js';
import { loadImportText, confirmImport, resetImportFlow, importFlow } from '../../lib/importFlow.svelte.js';
import { prefs, setPrefs, applyPrefs } from '../../lib/prefs.svelte.js';
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
  applyPrefs();
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

// Regression: the expanded cards of a ranked row once came from the entry at the row's RANK position, not the
// row's own entry, so a row's headline matched neither of its set cards whenever ranking reordered the bag.
it('Loot bag: a ranked row expands to its own item\'s set cards, whose figure matches the row headline', async () => {
  __resetJobs({
    run: (request) => {
      calls.push(request);
      // later items do better, so the ranking reverses the import order
      const results = request.items.map((it, k) => {
        const m = metric('better');
        const d = 20 + 10 * k;
        return { presetId: it.presetId, sim: { ...m, after: { ...m.after, mean: 1000 + d }, delta: { ...m.delta, delta: d, lo: d - 5, hi: d + 5 } } };
      });
      return { promise: Promise.resolve({ results, aborted: false }), cancel() {} };
    },
  });
  open({ tab: 'bag' });
  paste(lootBag);
  await settle();
  const rows = [...target.querySelectorAll('.trow.rank')];
  expect(rows[0].querySelector('.name').textContent).toBe(lootBag.pendingItems.at(-1).name);
  for (const row of rows) {
    const headline = parseFloat(row.querySelector('.delta .v').textContent);
    const setLabel = row.querySelector('.vd').textContent.split('·')[1].trim();
    row.querySelector('.toggle').click();
    flushSync();
    const cardEl = [...target.querySelectorAll('.expand [data-set]')].find((c) => c.querySelector('h3').textContent === setLabel);
    const figures = [...cardEl.querySelectorAll('.met .d')].map((d) => parseFloat(d.textContent));
    expect(figures.some((f) => Math.abs(f - headline) < 0.06)).toBe(true);
    row.querySelector('.toggle').click();
    flushSync();
  }
});

const pickSets = (label) => [...target.querySelectorAll('[role="group"][aria-label="Compare against"] button')]
  .find((b) => b.textContent.includes(label));

it('Compare against: Set 1 only simulates and shows only Set 1, and the choice is remembered', async () => {
  open();
  change(q('Attack'), '9.000');
  expect(card('set2')).not.toBeNull();
  pickSets('Set 1 only').click();
  flushSync();
  expect(prefs.dropSets).toBe('set1');
  expect(card('set2')).toBeNull();
  btn('Check drop').click();
  flushSync();
  await settle();
  expect(calls[0].items.map((i) => i.presetId)).toEqual(rosterStore.current.presets.filter((p) => p.equipmentSet !== 2).map((p) => p.id));
  expect(card('set1').dataset.verdict).toBe('better');
  expect(card('set2')).toBeNull();
  // remembered: a new page starts in Set 1 only
  unmount(app);
  open();
  expect(card('set2')).toBeNull();
  // back to both sets: the Set-1-only run is stale, and the next check covers Set 2 again
  pickSets('Both sets').click();
  flushSync();
  expect(target.textContent).toContain('Stale.');
  btn('Check drop').click();
  flushSync();
  await settle();
  expect(calls.at(-1).items).toHaveLength(rosterStore.current.presets.length);
  expect(card('set2').dataset.verdict).toBe('better');
});

it('Compare against on the Loot bag: Set 1 only marks the bag stale and Check again runs Set 1 alone', async () => {
  open({ tab: 'bag' });
  paste(lootBag);
  await settle();
  const all = calls[0].items.length;
  pickSets('Set 1 only').click();
  flushSync();
  expect(target.textContent).toContain('Stale.');
  btn('Check again').click();
  flushSync();
  await settle();
  expect(calls[1].items.length).toBeLessThan(all);
  expect(target.textContent).not.toContain('Stale.');
  target.querySelector('.trow.rank .toggle').click();
  flushSync();
  expect(target.querySelector('.expand [data-set="set2"]')).toBeNull();
  expect(target.querySelector('.expand [data-set="set1"]')).not.toBeNull();
  for (const r of target.querySelectorAll('.trow.rank .vd')) expect(r.textContent).not.toContain('Set 2');
});

it('Loot bag: an expanded row lists its Attack, Health and every secondary stat, or says it has none', async () => {
  const bag = {
    pendingItems: [
      { ...lootBag.pendingItems[1], name: 'Plain Leggings', secondaryStats: [] },
      lootBag.pendingItems[1],
    ],
  };
  open({ tab: 'bag' });
  paste(bag);
  await settle();
  const statsOf = (name) => {
    const row = [...target.querySelectorAll('.trow.rank')].find((r) => r.querySelector('.name').textContent === name);
    row.querySelector('.toggle').click();
    flushSync();
    const box = target.querySelector('.expand [data-testid="drop-stats"]');
    const text = box.textContent.replace(/\s+/g, ' ');
    row.querySelector('.toggle').click();
    flushSync();
    return { box, text };
  };
  const full = statsOf(lootBag.pendingItems[1].name);
  expect(full.text).toContain('Attack');
  expect(full.text).toContain('Health');
  expect(full.box.querySelectorAll('.stat-value').length).toBe(2 + lootBag.pendingItems[1].secondaryStats.length);
  expect(full.text).toMatch(/\+\d+(\.\d+)?%/);
  expect(full.text).not.toMatch(/total[A-Z]|_/);
  const plain = statsOf('Plain Leggings');
  expect(plain.text).toContain('No secondary stats');
});

it('Loot bag: an item applied to a set leaves the list, and Check again judges only the rest', async () => {
  open({ tab: 'bag' });
  paste(lootBag);
  await settle();
  const names = () => [...target.querySelectorAll('.trow.rank .name')].map((n) => n.textContent);
  expect(names()).toHaveLength(4);
  const first = names()[0];
  const entry = lootBag.pendingItems.find((i) => i.name === first);
  target.querySelector('.trow.rank .toggle').click();
  flushSync();
  btn('Apply to Set 1…').click();
  flushSync();
  btn('Confirm apply').click();
  flushSync();
  expect(rosterStore.current.equipment.set1.items[entry.slot]).not.toBeNull();
  expect(names()).toHaveLength(3);
  expect(names()).not.toContain(first);
  expect(target.querySelector('[data-testid="bag-applied"]').textContent).toContain('1 applied item removed');
  expect(target.querySelector('.tabs-row').textContent).toContain('3');
  btn('Check again').click();
  flushSync();
  await settle();
  expect(calls.at(-1).items).toHaveLength(3 * rosterStore.current.presets.length);
  expect(names()).toHaveLength(3);
  expect(names()).not.toContain(first);
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
