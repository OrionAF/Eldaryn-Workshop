import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import OptimiserScreen from './OptimiserScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { SCHEMA_VERSION } from '../../lib/model/index.js';
import { fmtValue, fmtDelta } from '../optimiser/format.js';
import { applyCandidate } from '../optimiser/apply.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  raw.presets[0].relicIds = [];
  rosterStore.importFromJson(JSON.stringify({ schemaVersion: SCHEMA_VERSION, currentId: raw.id, characters: [raw] }));
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(OptimiserScreen, { target });
  flushSync();
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const q = (sel) => target.querySelector(sel);
const btn = (re) => [...target.querySelectorAll('button')].find((b) => re.test(b.textContent.trim()));
const click = (el) => {
  el.click();
  flushSync();
};

it('formats values by unit', () => {
  expect(fmtValue('ms', 12500)).toBe('12.50 s');
  expect(fmtValue('p', 0.5)).toBe('50.0%');
  expect(fmtValue('ms', null)).toBe('n/a');
  expect(fmtDelta('ms', { delta: -500 })).toBe('-0.50 s');
});

it('objective choices follow the target kind', () => {
  const kind = q('[data-testid="target-kind"]');
  kind.value = 'chapter';
  kind.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  const opts = [...q('[data-testid="objective-kind"]').options].map((o) => o.value);
  expect(opts).toEqual(['ttk-median', 'ttk-p90', 'survival']);
});

it('the dungeon target lists every classic dungeon', () => {
  const kind = q('[data-testid="target-kind"]');
  kind.value = 'dungeon';
  kind.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  const sel = [...target.querySelectorAll('label.field')].find((l) => l.querySelector('.micro-label')?.textContent.trim() === 'Dungeon')?.querySelector('select');
  const names = [...sel.options].map((o) => o.textContent);
  expect(names).toHaveLength(7);
  expect(names[0]).toBe('Forsaken Mines');
});

it('runs a quick search, shows N and CIs, auto-saves the run and applies a result', async () => {
  for (const label of ['Gear set', 'Talent set', 'Talent points', 'Pet', 'Mount', 'Glyphs', 'Sigils', 'Utility sigil', 'Ancient sigil', 'Sigil conditions', 'Transcendence']) {
    click(btn(new RegExp(`^${label}$`)));
  }
  click(btn(/^Quick$/));
  click(btn(/^Optimise/));
  await vi.waitFor(() => expect(q('[data-testid="optimiser-output"]')).not.toBeNull(), { timeout: 60000 });
  expect(q('[data-testid="baseline-row"]').textContent).toMatch(/N=\d+/);
  expect(q('[data-testid="optimiser-results"]').textContent).toMatch(/N=\d+/);
  expect(rosterStore.current.runs).toHaveLength(1);
  expect(q('[data-testid="run-row"]')).not.toBeNull();

  const apply = btn(/^Apply to preset$/);
  if (apply) {
    click(apply);
    expect(rosterStore.current.presets[0].relicIds.length).toBeGreaterThan(0);
  }
}, 70000);

it('applyCandidate writes preset fields through the store', () => {
  const p = rosterStore.current.presets[0];
  applyCandidate(
    rosterStore,
    p.id,
    { equipmentSet: 2, talentSet: 1, talentAllocation: null, petId: null, mountId: null, mountGlyphs: null, relicIds: [], sigilSpecies: [], utilitySigilSpecies: null, ancientSigilSpecies: null, transcendencePresetId: null, sigilConditions: {} },
    p,
  );
  const after = rosterStore.current.presets[0];
  expect(after.equipmentSet).toBe(2);
  expect(after.talentSet).toBe(1);
});
