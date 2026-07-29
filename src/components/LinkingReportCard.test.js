import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import LinkingReportCard from './LinkingReportCard.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  target = document.createElement('div');
  document.body.appendChild(target);
});

afterEach(() => {
  unmount(app);
  target.remove();
  vi.restoreAllMocks();
  rosterStore.resetLinkingSim();
  rosterStore.current.awakening = { path: null, points: 0 }; // singleton store - reset the Lock test's write
  rosterStore.setCharacterClass(rosterStore.current.id, null);
});

function fixture(presetIds) {
  return {
    completedAt: '2026-07-20T10:00:00.000Z',
    priority: 50,
    lockedPath: 'shadow',
    reasoning: 'Shadow Path is the shared lock: Preset 1 is on its best path and costs Preset 2 4.2%.',
    regret: { shadow: 0.05, radiant: 0.2 },
    presets: [
      {
        presetId: presetIds[0],
        presetName: 'Preset 1',
        goalKind: 'dps',
        goalUnit: 'DPS',
        scores: { shadow: 1000, radiant: 700 },
        recommended: {
          candidate: { tag: 'candA' },
          changes: [{ dimension: 'loadout', from: 'Loadout 1', to: 'Loadout 2' }],
          improvementPct: 12,
          talentLean: { offense: 10, defense: 2, label: 'leans offensive' },
          statPriorities: [
            { key: 'attack', label: 'Attack', unit: '+100 flat', delta: 500, deltaPct: 5 },
            { key: 'crit', label: 'Crit Chance', unit: '+1%', delta: 100, deltaPct: 1 },
          ],
        },
      },
      {
        presetId: presetIds[1],
        presetName: 'Preset 2',
        goalKind: 'pvp',
        goalUnit: 'PVP Score',
        scores: { shadow: 500, radiant: 900 },
        recommended: {
          candidate: { tag: 'candB' },
          changes: [],
          improvementPct: 0,
          talentLean: { offense: 3, defense: 8, label: 'leans defensive' },
          statPriorities: [{ key: 'health', label: 'Health', unit: '+1000 flat', delta: 300, deltaPct: 3 }],
        },
      },
    ],
  };
}

function mountCard() {
  app = mount(LinkingReportCard, { target, props: { setStatus: () => {} } });
  flushSync();
}

it('renders the verdict, reasoning, and the 2x2 score matrix with the locked column marked', () => {
  const [p0, p1] = rosterStore.current.presets;
  rosterStore.current.linkingSim = fixture([p0.id, p1.id]);
  mountCard();

  expect(target.querySelector('[data-testid="linking-verdict"]').textContent).toContain('Shadow Path');
  expect(target.textContent).toContain('shared lock');

  const matrix = target.querySelector('[data-testid="score-matrix"]');
  expect(matrix.textContent).toContain('Preset 1 · DPS');
  expect(matrix.textContent).toContain('Preset 2 · PVP Score');
  expect(matrix.querySelectorAll('thead .locked-col').length).toBe(1); // Shadow column header marked
  // Row 1's best cell is Shadow (1000 > 700); row 2's is Radiant (900 > 500).
  expect(matrix.querySelectorAll('td.best').length).toBe(2);
});

it('renders per-preset talent lean, changes, stat priorities; an empty changes list reads "already optimal"', () => {
  const [p0, p1] = rosterStore.current.presets;
  rosterStore.current.linkingSim = fixture([p0.id, p1.id]);
  mountCard();

  const reports = target.querySelectorAll('[data-testid="preset-report"]');
  expect(reports.length).toBe(2);
  expect(reports[0].textContent).toContain('leans offensive');
  expect(reports[0].textContent).toContain('loadout: Loadout 1 → Loadout 2');
  expect(reports[0].textContent).toContain('Attack');
  expect(reports[1].textContent).toContain('leans defensive');
  expect(reports[1].textContent).toContain('Already optimal');
});

it('Lock in Awakening path writes the path, then shows the locked tag', () => {
  const [p0, p1] = rosterStore.current.presets;
  rosterStore.current.linkingSim = fixture([p0.id, p1.id]);
  mountCard();

  expect(rosterStore.current.awakening.path).not.toBe('shadow');
  target.querySelector('[data-testid="lock-path"]').click();
  flushSync();
  expect(rosterStore.current.awakening.path).toBe('shadow');
  expect(target.querySelector('[data-testid="path-locked"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="lock-path"]')).toBeNull();
});

it('Apply recommended build calls applyOptimizerCandidate with the stored candidate', () => {
  const [p0, p1] = rosterStore.current.presets;
  const spy = vi.spyOn(rosterStore, 'applyOptimizerCandidate').mockReturnValue(true);
  rosterStore.current.linkingSim = fixture([p0.id, p1.id]);
  mountCard();

  target.querySelectorAll('[data-testid="apply-build"]')[0].click();
  flushSync();
  expect(spy).toHaveBeenCalledWith(p0.id, { tag: 'candA' });
});

it('a deleted preset disables its Apply button with a stale note', () => {
  const [p0] = rosterStore.current.presets;
  rosterStore.current.linkingSim = fixture([p0.id, 'ghost-preset-id']);
  mountCard();

  const applyButtons = target.querySelectorAll('[data-testid="apply-build"]');
  expect(applyButtons[0].disabled).toBe(false); // real preset
  expect(applyButtons[1].disabled).toBe(true); // deleted preset
  expect(target.textContent).toContain("can't apply");
});
