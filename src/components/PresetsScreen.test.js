import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PresetsScreen from './PresetsScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { RELICS_BY_CLASS } from '../lib/relicsData.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PresetsScreen, { target, props: {} });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('renders one preset card by default, editing it, with the editor panel open', () => {
  expect(target.querySelectorAll('.preset-card').length).toBe(1);
  expect(target.querySelector('.preset-card.editing')).not.toBeNull();
  expect(target.querySelector('.editor')).not.toBeNull();
  cleanup();
});

it('+ New Preset adds a card and switches the editor to it', () => {
  target.querySelector('.new-preset-btn').click();
  flushSync();
  expect(rosterStore.current.presets.length).toBe(2);
  expect(target.querySelectorAll('.preset-card').length).toBe(2);
  const newPreset = rosterStore.current.presets[1];
  expect(target.querySelector('.editor-header h2').textContent).toContain(newPreset.name.toUpperCase());
  cleanup();
});

it('clicking a different preset card switches which one is being edited', () => {
  target.querySelector('.new-preset-btn').click();
  flushSync();
  const cards = [...target.querySelectorAll('.preset-card')];
  cards[0].click();
  flushSync();
  expect(target.querySelector('.editor-header h2').textContent).toContain(rosterStore.current.presets[0].name.toUpperCase());
  cleanup();
});

it('renaming the preset in the editor updates the card', () => {
  const nameInput = target.querySelector('.field-group input[type="text"]');
  nameInput.value = 'Farm Build';
  nameInput.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(rosterStore.current.presets[0].name).toBe('Farm Build');
  expect(target.querySelector('.preset-name').textContent).toBe('Farm Build');
  cleanup();
});

it('switching the loadout/talent-set chips updates the preset', () => {
  const preset = rosterStore.current.presets[0];
  const loadoutChips = [...target.querySelectorAll('.field-group')].find((g) =>
    g.querySelector('.field-group-label').textContent.includes('Gear Loadout')
  );
  const chips = loadoutChips.querySelectorAll('.chip');
  chips[1].click(); // Loadout 2
  flushSync();
  expect(rosterStore.current.presets.find((p) => p.id === preset.id).loadout).toBe(1);
  cleanup();
});

it('switching Totals mode to Manual snapshots current calculated totals, and inputs become editable', () => {
  const totalsGroup = [...target.querySelectorAll('.field-group')].find((g) =>
    g.querySelector('.field-group-label').textContent.includes('Totals')
  );

  const manualChip = [...totalsGroup.querySelectorAll('.chip')].find((c) => c.textContent.trim() === 'Manual');
  manualChip.click(); // seeded preset starts Calculated - flipping to Manual should snapshot the (nonzero, base-only) calculated totals
  flushSync();

  const preset = rosterStore.current.presets[0];
  expect(preset.manualTotals).toBe(true);
  expect(preset.manualStats.attack).toBeGreaterThan(0); // snapshotted, not zero (base Attack is 10)
  expect(target.querySelector('.stats-fields input')).not.toBeNull(); // now editable
  cleanup();
});

it('picking a pet chip sets petId; None clears it', () => {
  rosterStore.addPet('Ashfang', 'Epic');
  flushSync();
  const petGroup = [...target.querySelectorAll('.field-group')].find((g) =>
    g.querySelector('.field-group-label').textContent.trim().endsWith('Pet')
  );
  const petChip = [...petGroup.querySelectorAll('.chip')].find((c) => c.textContent.includes('Ashfang'));
  petChip.click();
  flushSync();
  expect(rosterStore.current.presets[0].petId).not.toBe(null);

  const noneChip = [...petGroup.querySelectorAll('.chip')][0];
  noneChip.click();
  flushSync();
  expect(rosterStore.current.presets[0].petId).toBe(null);
  cleanup();
});

it('equipping a relic chip toggles it on the preset, and the 5th shows an inline error', () => {
  const relicGroup = [...target.querySelectorAll('.field-group')].find((g) =>
    g.querySelector('.field-group-label').textContent.includes('Relics')
  );
  const chips = [...relicGroup.querySelectorAll('.chip')];
  for (let i = 0; i < 4; i++) {
    chips[i].click();
    flushSync();
  }
  expect(rosterStore.current.presets[0].relicIds.length).toBe(4);

  chips[4].click();
  flushSync();
  expect(rosterStore.current.presets[0].relicIds.length).toBe(4); // rejected
  expect(target.querySelector('.inline-error')).not.toBeNull();
  expect(target.querySelector('.inline-error').textContent).toContain('4 slots full');
  cleanup();
});

it('shows tier-appropriate relic defs for the character class', () => {
  const relicGroup = [...target.querySelectorAll('.field-group')].find((g) =>
    g.querySelector('.field-group-label').textContent.includes('Relics')
  );
  expect(relicGroup.querySelectorAll('.chip').length).toBe(RELICS_BY_CLASS.Sentinel.length);
  cleanup();
});

it('delete preset (two-step confirm) removes the card', () => {
  const startCount = rosterStore.current.presets.length;
  target.querySelector('.new-preset-btn').click();
  flushSync();
  expect(rosterStore.current.presets.length).toBe(startCount + 1);

  const deleteBtn = target.querySelector('.editor-header button');
  deleteBtn.click(); // first click -> confirm state
  flushSync();
  const confirmBtn = target.querySelector('.confirm-yes');
  confirmBtn.click();
  flushSync();
  expect(rosterStore.current.presets.length).toBe(startCount);
  expect(target.querySelectorAll('.preset-card').length).toBe(startCount);
  cleanup();
});

it('the last remaining preset cannot be deleted', () => {
  while (rosterStore.current.presets.length > 1) {
    rosterStore.deletePreset(rosterStore.current.presets[rosterStore.current.presets.length - 1].id);
  }
  cleanup();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PresetsScreen, { target, props: {} });
  flushSync();

  const deleteBtn = target.querySelector('.editor-header button');
  expect(deleteBtn.disabled).toBe(true);
  cleanup();
});

it('character-wide tiles show mount/awakening/transcendence summaries and navigate on click', () => {
  let navigatedTo = null;
  cleanup();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PresetsScreen, { target, props: { onNavigate: (id) => (navigatedTo = id) } });
  flushSync();

  expect(target.textContent).toContain('mounts entered'); // stat-entry summary; the ridden mount is per-preset now
  expect(target.textContent).toContain('No path');
  expect(target.textContent).toContain('nodes');

  const tiles = [...target.querySelectorAll('.tile')];
  tiles.find((t) => t.textContent.includes('Awakening')).click();
  expect(navigatedTo).toBe('awakening');
  cleanup();
});

it('switching characters re-points the editor at the new character\'s own preset', () => {
  const firstCharacterId = rosterStore.current.id;
  const firstPresetId = rosterStore.current.presets[0].id;
  expect(target.querySelector('.editor-header h2').textContent).toContain(rosterStore.current.presets[0].name.toUpperCase());

  const altId = rosterStore.addCharacter('Alt');
  flushSync();
  const altPresetId = rosterStore.current.presets[0].id;
  expect(altPresetId).not.toBe(firstPresetId);

  // The editor must follow the new character, not silently disappear
  // (stale editingId pointing at a preset id that no longer exists here).
  expect(target.querySelector('.editor')).not.toBeNull();
  expect(target.querySelector('.editor-header h2').textContent).toContain(rosterStore.current.presets[0].name.toUpperCase());
  expect(target.querySelector('.preset-card.editing')).not.toBeNull();

  rosterStore.selectCharacter(firstCharacterId);
  flushSync();
  expect(target.querySelector('.editor-header h2').textContent).toContain(rosterStore.current.presets[0].name.toUpperCase());

  rosterStore.deleteCharacter(altId); // cleanup
  cleanup();
});
