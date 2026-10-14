import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import PresetsScreen from './PresetsScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { computePresetStats } from '../../lib/build/stats.js';

let target, app;
function open() {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(PresetsScreen, { target, props: {} });
  flushSync();
}
beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Test', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  open();
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const btn = (label) => [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const click = (el) => {
  el.click();
  flushSync();
};
const enter = (id, text) => {
  const input = target.querySelector(`#sheet-${id}`);
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
};
const preset = () => rosterStore.current.presets.find((p) => p.id === rosterStore.current.activePresetId);

it('renders a card per preset (two minimum) with the active one open in the editor', () => {
  expect(target.querySelectorAll('.preset-card')).toHaveLength(2);
  expect(target.querySelectorAll('.preset-card.editing')).toHaveLength(1);
  expect(target.querySelector('[data-testid="preset-editor"]')).not.toBeNull();
});

it('+ New Preset adds a card and edits it; clicking a card switches the editor', () => {
  click(btn('+ New Preset'));
  expect(rosterStore.current.presets).toHaveLength(3);
  expect(target.querySelectorAll('.preset-card')).toHaveLength(3);
  const newId = rosterStore.current.activePresetId;
  expect(target.querySelector('.preset-card.editing').dataset.presetId).toBe(newId);
  click(target.querySelectorAll('.preset-card')[0]);
  expect(rosterStore.current.activePresetId).toBe(rosterStore.current.presets[0].id);
  expect(target.querySelector('.editor-header h2').textContent).toContain(rosterStore.current.presets[0].name.toUpperCase());
});

it('renaming and switching the gear / talent set selectors writes to the preset', () => {
  const name = target.querySelector('input[aria-label="Preset name"]');
  name.value = 'Farm Build';
  name.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
  expect(preset().name).toBe('Farm Build');
  click([...target.querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Gear Set 2')));
  expect(preset().equipmentSet).toBe(2);
  click([...target.querySelectorAll('.chip')].find((c) => c.textContent.startsWith('Set B')));
  expect(preset().talentSet).toBe(1);
});

it('delete is refused at the two-preset minimum', () => {
  expect(btn('Delete preset').disabled).toBe(true);
});

it('sheet entry reads "." as a thousands separator on flat rows and a decimal point on percent rows', () => {
  enter('totalAttack', '48.124');
  enter('totalCritChance', '6.2');
  expect(preset().sheet.values.totalAttack).toBe(48124);
  expect(preset().sheet.values.totalCritChance).toBe(6.2);
  expect(computePresetStats(rosterStore.current).effective.totalAttack).toBe(48124);
  expect(target.querySelector('[data-testid="sheet-source"]').textContent).toContain('your sheet');
});

it('Attack Speed is typed as a percent and stored as a multiplier', () => {
  enter('totalAttackSpeed', '250');
  expect(preset().sheet.values.totalAttackSpeed).toBe(2.5);
});

it('an invalid entry is flagged and not saved; a blank entry removes the key', () => {
  enter('totalAttack', 'abc');
  expect(preset().sheet).toBeNull();
  expect(target.querySelector('#sheet-totalAttack').getAttribute('aria-invalid')).toBe('true');
  enter('totalAttack', '1.000');
  expect(preset().sheet.values.totalAttack).toBe(1000);
  enter('totalAttack', '');
  expect(preset().sheet).toBeNull();
});

it('only shows rows the class has: Dominion never, spell crit only for casters', () => {
  expect(target.querySelector('#sheet-totalDominion')).toBeNull();
  expect(target.querySelector('#sheet-totalSpellCritChance')).toBeNull();
  unmount(app);
  target.remove();
  rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
  open();
  expect(target.querySelector('#sheet-totalSpellCritChance')).not.toBeNull();
});

it('the diff table colours rows by tolerance and counts the explained ones', () => {
  const computed = computePresetStats(rosterStore.current).computed;
  enter('totalAttack', String(Math.round(computed.totalAttack)));
  enter('totalHp', String(Math.round(computed.totalHp) + 5000));
  const rows = target.querySelectorAll('.diff tbody tr');
  expect(rows).toHaveLength(2);
  expect(target.querySelector('.diff tr[data-key="totalAttack"]').classList.contains('ok')).toBe(true);
  expect(target.querySelector('.diff tr[data-key="totalHp"]').classList.contains('off')).toBe(true);
  expect(target.querySelector('[data-testid="diff-summary"]').textContent).toContain('1/2 explained');
});

it('Absorb into base moves the Attack gap into baseResidual so the model matches the sheet', () => {
  const before = computePresetStats(rosterStore.current).computed.totalAttack;
  enter('totalAttack', String(Math.round(before) + 400));
  expect(btn('Absorb into base').disabled).toBe(false);
  const baseBefore = rosterStore.current.baseResidual.attack;
  click(btn('Absorb into base'));
  expect(rosterStore.current.baseResidual.attack).toBeGreaterThan(baseBefore);
  const after = computePresetStats(rosterStore.current);
  expect(Math.abs(after.computed.totalAttack - after.sheet.values.totalAttack)).toBeLessThanOrEqual(1);
  expect(target.querySelector('[data-testid="diff-summary"]').textContent).toContain('1/1 explained');
});

it('Absorb is disabled while the model already matches the sheet', () => {
  enter('totalAttack', String(Math.round(computePresetStats(rosterStore.current).computed.totalAttack)));
  expect(btn('Absorb into base').disabled).toBe(true);
});

it('Clear sheet removes the preset sheet', () => {
  enter('totalAttack', '1.000');
  click(btn('Clear sheet'));
  expect(preset().sheet).toBeNull();
});

it('the Oblivion realm edits the shared Oblivion sheet once unlocked', () => {
  expect(btn('Oblivion')).toBeUndefined();
  unmount(app);
  target.remove();
  rosterStore.setOblivionUnlocked(true);
  open();
  click(btn('Oblivion'));
  enter('totalAttack', '2.000');
  expect(rosterStore.current.oblivion.sheet.values.totalAttack).toBe(2000);
  expect(preset().sheet).toBeNull();
});
