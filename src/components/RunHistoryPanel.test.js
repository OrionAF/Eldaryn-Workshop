import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RunHistoryPanel from './RunHistoryPanel.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  for (const r of [...(rosterStore.current.runHistory || [])]) rosterStore.deleteRunEntry(r.id);
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  unmount(app);
  target.remove();
  for (const r of [...(rosterStore.current.runHistory || [])]) rosterStore.deleteRunEntry(r.id);
});

function mountPanel() {
  app = mount(RunHistoryPanel, { target, props: {} });
  flushSync();
}

function seedEntries() {
  rosterStore.addRunHistoryEntry('sim', {
    name: 'Boss farm · 1,000 × 60s',
    presetName: 'Preset 1',
    headline: { meanDps: 1200, p5: 60000, p95: 80000, iterations: 1000, durationSeconds: 60 },
    detail: {
      meanDps: 1200,
      expectedDps: 1180,
      iterations: 1000,
      seed: 7,
      totalDamage: { mean: 72000, stdDev: 100, min: 60000, max: 84000, p5: 61000, p25: 66000, p50: 71000, p75: 76000, p95: 82000 },
      histogram: { min: 60000, max: 84000, bins: [1, 4, 9, 4, 1] },
      damageByTag: { swing: 60000, double_hit: 12000 },
      config: [{ label: 'Gear Loadout', value: 'Loadout 1' }],
    },
  });
  rosterStore.addRunHistoryEntry('pvp-sim', {
    name: 'vs Rival · 61.0% win',
    presetName: 'Preset 2',
    headline: { opponentName: 'Rival', winRate: 61, killRate: 55, meanTimeToKill: 21.5 },
    detail: { winRate: 61, lossRate: 35, drawRate: 4, killRate: 55, meanTimeToKill: 21.5, playerHpLeftPct: 40, config: [] },
  });
}

it('renders the empty state, then lists auto-saved runs newest-first with kind badges and headlines', () => {
  mountPanel();
  expect(target.textContent).toContain('No runs yet');

  seedEntries();
  flushSync();
  const rows = [...target.querySelectorAll('.run-row')];
  expect(rows.length).toBe(2);
  expect(rows[0].textContent).toContain('Rival'); // newest first
  expect(rows[0].querySelector('.kind-badge').textContent).toBe('Duel');
  expect(rows[1].querySelector('.kind-badge').textContent).toBe('Battle Sim');
  expect(rows[1].textContent).toContain('DPS');
});

it('kind and preset filters narrow the list', () => {
  seedEntries();
  mountPanel();

  [...target.querySelectorAll('.chip-list button')].find((b) => b.textContent.includes('Battle Sim')).click();
  flushSync();
  expect(target.querySelectorAll('.run-row').length).toBe(1);
  expect(target.querySelector('.kind-badge').textContent).toBe('Battle Sim');

  [...target.querySelectorAll('.chip-list button')].find((b) => b.textContent.includes('All')).click();
  flushSync();
  const presetSelect = [...target.querySelectorAll('select')][0];
  presetSelect.value = 'Preset 2';
  presetSelect.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(target.querySelectorAll('.run-row').length).toBe(1);
  expect(target.querySelector('.run-row').textContent).toContain('Rival');
});

it('expanding a sim run shows its histogram, percentile strip, damage breakdown, and config', () => {
  seedEntries();
  mountPanel();
  [...target.querySelectorAll('.run-row')].find((r) => r.textContent.includes('Boss farm')).click();
  flushSync();

  const detail = target.querySelector('[data-testid="run-detail"]');
  expect(detail).not.toBeNull();
  expect(detail.querySelectorAll('.hist-bin').length).toBe(5);
  expect(detail.querySelector('.pct-strip')).not.toBeNull();
  expect(detail.textContent).toContain('swing');
  expect(detail.textContent).toContain('Gear Loadout');
});

it('a compacted entry renders headline-only with the compact badge and an explanation when expanded', () => {
  const id = rosterStore.addRunHistoryEntry('sim', { name: 'Old run', headline: { meanDps: 900, iterations: 100, durationSeconds: 60 } });
  // detail omitted -> stored as null, exactly like a compacted row
  mountPanel();
  const row = target.querySelector('.run-row');
  expect(row.querySelector('.compact-badge')).not.toBeNull();
  row.click();
  flushSync();
  expect(target.querySelector('[data-testid="run-detail"]').textContent).toContain('compacted');
  rosterStore.deleteRunEntry(id);
});

it('pin toggles, notes persist, and delete needs the two-step confirm', () => {
  seedEntries();
  mountPanel();
  target.querySelector('.run-row').click();
  flushSync();

  target.querySelector('[data-testid="pin-run"]').click();
  flushSync();
  expect(rosterStore.current.runHistory[0].pinned).toBe(true);
  expect(target.querySelector('.pin-mark')).not.toBeNull();

  const notes = target.querySelector('textarea.notes');
  notes.value = 'their sigils were half-entered';
  notes.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.runHistory[0].notes).toBe('their sigils were half-entered');

  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Delete').click();
  flushSync();
  expect(rosterStore.current.runHistory.length).toBe(2); // armed, not deleted
  [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Confirm delete').click();
  flushSync();
  expect(rosterStore.current.runHistory.length).toBe(1);
});

it('a traced duel entry renders the combat timeline instead of rate tiles', () => {
  rosterStore.addRunHistoryEntry('pvp-sim', {
    name: 'Preset 2 vs Rival · sample fight',
    presetName: 'Preset 2',
    headline: { opponentName: 'Rival', sample: true },
    detail: {
      traced: true,
      presetName: 'Preset 2',
      opponentName: 'Rival',
      durationSeconds: 60,
      seed: 7,
      winner: 'player',
      timeline: [
        { t: 1, side: 'player', kind: 'damage', tag: 'swing', amount: 500 },
        { t: 1.5, side: 'opponent', kind: 'damage', tag: 'swing', amount: 300 },
        { t: 2, side: 'player', kind: 'heal', amount: 50 },
        { t: 3, side: 'opponent', kind: 'death' },
      ],
    },
  });
  mountPanel();
  target.querySelector('.run-row').click();
  flushSync();

  const timeline = target.querySelector('[data-testid="duel-timeline"]');
  expect(timeline).not.toBeNull();
  expect(timeline.querySelectorAll('rect').length).toBe(2); // two damage bars
  expect(target.textContent).toContain('Winner: player');
});

it('a pvp-gauntlet entry renders the finalist × archetype grid and its contradiction note', () => {
  rosterStore.addRunHistoryEntry('pvp-gauntlet', {
    name: 'Boss vs archetype gauntlet',
    presetName: 'Boss',
    headline: { bestWinRate: 72, archetypeCount: 2, contradiction: true },
    detail: {
      budget: 60000,
      iterations: 200,
      contradiction: { flagged: true, message: 'The closed-form top build ranks #2 by duels.' },
      finalists: [
        { label: 'Recommended', score: 100, overallWinRate: 45, perArchetype: [{ archetypeId: 'w-berserker', name: 'Berserker', class: 'Warrior', winRate: 30, ci: 4 }] },
        { label: 'Runner-up 1', score: 90, overallWinRate: 72, perArchetype: [{ archetypeId: 'w-berserker', name: 'Berserker', class: 'Warrior', winRate: 70, ci: 4 }] },
      ],
    },
  });
  mountPanel();
  const row = target.querySelector('.run-row');
  expect(row.querySelector('.kind-badge').textContent).toBe('Gauntlet');
  expect(row.textContent).toContain('contradiction');
  row.click();
  flushSync();

  const detail = target.querySelector('[data-testid="run-detail"]');
  expect(detail.textContent).toContain('ranks #2 by duels');
  expect(detail.textContent).toContain('Berserker');
  expect(detail.querySelectorAll('tbody tr').length).toBe(2);
});
