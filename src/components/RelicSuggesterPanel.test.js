/**
 * Tests RelicSuggesterPanel.svelte - input gating, a real inline run (jsdom
 * has no Worker, so runOptimizerTask falls back to the in-process engine),
 * and result rendering for unlock/upgrade/at-max rows.
 */
import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RelicSuggesterPanel from './RelicSuggesterPanel.svelte';

let target, app;

function makeCharacter() {
  return {
    id: 'c1',
    class: 'Warrior',
    loadouts: [
      { gear: { Weapon: { attack: 100, crit: 20 } }, socketedStones: {} },
      { gear: {}, socketedStones: {} },
    ],
    talentSets: [{ spec: null, allocation: {} }, { spec: null, allocation: {} }],
    pets: [],
    glyphs: { entries: [] },
    mounts: { entries: [] },
    awakening: { path: null, points: 0 },
    transcendence: { unlockedPositions: [] },
    relicLevels: { 'war-charm': 5 },
  };
}

function makePreset() {
  return {
    id: 'p1',
    name: 'Preset 1',
    loadout: 0,
    talentSet: 0,
    petId: null,
    mountId: null,
    relicIds: ['war-charm'],
    sigilIds: [],
    fortressBuffs: {},
  };
}

function mountPanel(props = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(RelicSuggesterPanel, {
    target,
    props: {
      character: makeCharacter(),
      preset: makePreset(),
      buildObjectiveSpec: () => ({ kind: 'pve-fast' }),
      scoreUnit: 'DPS',
      formatScore: (n) => n.toFixed(2),
      setStatus: () => {},
      ...props,
    },
  });
  flushSync();
}

afterEach(() => {
  unmount(app);
  target.remove();
});

it('renders the levels input and run button, enabled with a preset and a positive level count', () => {
  mountPanel();
  expect(target.querySelector('[data-testid="relic-suggest-levels"]').value).toBe('2');
  expect(target.querySelector('[data-testid="relic-suggest-run"]').disabled).toBe(false);
});

it('disables the run button with no preset picked', () => {
  mountPanel({ preset: null });
  expect(target.querySelector('[data-testid="relic-suggest-run"]').disabled).toBe(true);
});

it('disables the run button at 0 levels and while the host optimizer runs', async () => {
  mountPanel({ disabled: true });
  expect(target.querySelector('[data-testid="relic-suggest-run"]').disabled).toBe(true);

  mountPanel();
  const input = target.querySelector('[data-testid="relic-suggest-levels"]');
  input.value = '0';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(target.querySelector('[data-testid="relic-suggest-run"]').disabled).toBe(true);
});

it('runs inline and renders the result card: unlock steps, full ranked table, level texts', async () => {
  mountPanel();
  target.querySelector('[data-testid="relic-suggest-run"]').click();
  flushSync();
  // The inline engine yields to the event loop between evals - poll for completion.
  for (let i = 0; i < 200 && !target.querySelector('[data-testid="relic-suggest-result"]'); i++) {
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
  const card = target.querySelector('[data-testid="relic-suggest-result"]');
  expect(card).not.toBeNull();
  // 14 Warrior relics ranked.
  expect(card.querySelectorAll('tbody tr').length).toBe(14);
  const text = card.textContent;
  expect(text).toContain('Unlock'); // locked relics rank with an unlock label
  expect(text).toContain('lv 5 → 7'); // war-charm upgrade at +2
});
