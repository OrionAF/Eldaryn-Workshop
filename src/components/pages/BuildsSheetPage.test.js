import { it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import BuildsSheetPage from './BuildsSheetPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { computePresetStats } from '../../lib/build/stats.js';
import { setup, click } from '../ui/testkit.js';

let t;
function open() {
  t = setup(BuildsSheetPage, {});
}
beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Test', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
  open();
});
afterEach(() => t.done());

const reopen = () => {
  t.done();
  open();
};
const btn = (label) => t.qa('button').find((b) => b.textContent.trim() === label);
const enter = (id, text) => {
  const input = t.target.querySelector(`#sheet-${id}`);
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();
};
const preset = () => rosterStore.current.presets.find((p) => p.id === rosterStore.current.activePresetId);
const swordItem = {
  rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack: 4200, hp: 0 }, secondaryStats: [],
};

it('sheet entry reads "." as a thousands separator on flat rows and a decimal point on percent rows', () => {
  enter('totalAttack', '48.124');
  enter('totalCritChance', '6.2');
  expect(preset().sheet.values.totalAttack).toBe(48124);
  expect(preset().sheet.values.totalCritChance).toBe(6.2);
  expect(computePresetStats(rosterStore.current).effective.totalAttack).toBe(48124);
  expect(t.q('[data-testid="sheet-source"]').textContent).toContain('your sheet');
});

it('Attack Speed is typed as a percent and stored as a multiplier', () => {
  enter('totalAttackSpeed', '250');
  expect(preset().sheet.values.totalAttackSpeed).toBe(2.5);
});

it('an invalid entry is flagged with a message and not saved; a blank entry removes the key', () => {
  enter('totalAttack', 'abc');
  expect(preset().sheet).toBeNull();
  expect(t.q('#sheet-totalAttack').getAttribute('aria-invalid')).toBe('true');
  expect(t.q('#err-totalAttack').textContent).toContain('48.124 is 48124');
  enter('totalAttack', '1.000');
  expect(preset().sheet.values.totalAttack).toBe(1000);
  enter('totalAttack', '');
  expect(preset().sheet).toBeNull();
});

it('a focused field echoes how its text is read', () => {
  const input = t.q('#sheet-totalAttack');
  input.dispatchEvent(new Event('focus', { bubbles: true }));
  input.value = '48.124';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  expect(t.q('#echo-totalAttack').textContent).toContain('48.124');
});

it('only shows rows the class has: Dominion never, spell crit only for casters', () => {
  expect(t.q('#sheet-totalDominion')).toBeNull();
  expect(t.q('#sheet-totalSpellCritChance')).toBeNull();
  rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
  reopen();
  expect(t.q('#sheet-totalSpellCritChance')).not.toBeNull();
});

it('the table is one list: gap, tolerance and status per entered row, and an explained count', () => {
  const computed = computePresetStats(rosterStore.current).computed;
  enter('totalAttack', String(Math.round(computed.totalAttack)));
  enter('totalHp', String(Math.round(computed.totalHp) + 5000));
  expect(t.q('tr[data-key="totalAttack"]').classList.contains('ok')).toBe(true);
  expect(t.q('tr[data-key="totalHp"]').classList.contains('off')).toBe(true);
  expect(t.q('tr[data-key="totalHp"] .status').textContent).toContain('off by');
  expect(t.q('tr[data-key="totalAttack"] .status').textContent).toContain('explained');
  expect(t.q('tr[data-key="totalAttack"]').textContent).toContain('±');
  expect(t.q('[data-testid="diff-summary"]').textContent).toContain('1/2 explained');
});

it('Absorb into base previews the change, writes it on confirm, and Undo restores it', () => {
  const before = computePresetStats(rosterStore.current).computed.totalAttack;
  enter('totalAttack', String(Math.round(before) + 400));
  const baseBefore = rosterStore.current.baseResidual.attack;
  click(btn('Absorb into base'));
  const preview = t.q('[data-testid="absorb-preview"]');
  expect(preview.textContent).toContain('Attack');
  expect(t.q('[data-testid="absorb-reach"]').textContent).toContain(rosterStore.current.presets[0].name);
  expect(rosterStore.current.baseResidual.attack).toBe(baseBefore); // preview wrote nothing
  click(btn('Absorb'));
  expect(rosterStore.current.baseResidual.attack).toBeGreaterThan(baseBefore);
  const after = computePresetStats(rosterStore.current);
  expect(Math.abs(after.computed.totalAttack - after.sheet.values.totalAttack)).toBeLessThanOrEqual(1);
  click(btn('Undo'));
  expect(rosterStore.current.baseResidual.attack).toBe(baseBefore);
});

it('Absorb is disabled with a reason while the model already matches the sheet', () => {
  enter('totalAttack', String(Math.round(computePresetStats(rosterStore.current).computed.totalAttack)));
  const b = btn('Absorb into base');
  expect(b.getAttribute('aria-disabled')).toBe('true');
  expect(b.title).toContain('already matches');
});

it('Clear sheet asks twice, then removes the preset sheet', () => {
  enter('totalAttack', '1.000');
  click(btn('Clear sheet'));
  expect(preset().sheet).not.toBeNull();
  click(btn('Confirm clear'));
  expect(preset().sheet).toBeNull();
});

it('a stale-sheet banner appears after a build edit and Confirm re-stamps the sheet', () => {
  enter('totalAttack', '1.000');
  expect(t.q('[data-testid="sheet-status"]')).toBeNull();
  expect(t.q('[data-testid="sheet-confirm"]')).toBeNull();
  rosterStore.setEquipmentItem('set1', 'WEAPON', swordItem);
  reopen();
  expect(computePresetStats(rosterStore.current).sheetStatus).toBe('stale');
  expect(t.q('[data-testid="sheet-status"]').textContent).toMatch(/out of date/);
  // the stale sheet is shown for re-entry but the model value is what applies
  expect(t.q('#sheet-totalAttack').value).toBe('1.000');
  click(t.q('[data-testid="sheet-confirm"]'));
  expect(computePresetStats(rosterStore.current).sheetStatus).toBe('fresh');
  expect(t.q('[data-testid="sheet-confirm"]')).toBeNull();
});

it('a row expands to the model value split by source, with the interaction remainder', () => {
  const row = t.q('tr[data-key="totalAttack"] .expand');
  expect(row.getAttribute('aria-expanded')).toBe('false');
  click(row);
  const list = t.q('#src-totalAttack');
  expect(list.textContent).toContain('Base stats');
  expect(list.textContent).toContain('Interaction');
  expect(list.textContent).toContain('Model total');
});

it('the Oblivion realm edits the shared Oblivion sheet once unlocked and names its owner', () => {
  const tab = () => t.qa('[role="tab"]').find((x) => x.textContent.includes('Oblivion'));
  expect(tab().getAttribute('aria-disabled')).toBe('true');
  rosterStore.setOblivionUnlocked(true);
  reopen();
  click(tab());
  enter('totalAttack', '2.000');
  expect(rosterStore.current.oblivion.sheet.values.totalAttack).toBe(2000);
  expect(preset().sheet).toBeNull();
  expect(t.q('[data-testid="oblivion-owner"]').textContent).toContain(preset().name);
});

it('an Oblivion sheet owned by another preset warns and is not applied to this one', () => {
  rosterStore.setOblivionUnlocked(true);
  const [a, b] = rosterStore.current.presets;
  rosterStore.setOblivionSheet({ totalAttack: 2000 }, a.id);
  rosterStore.setActivePreset(b.id);
  reopen();
  click(t.qa('[role="tab"]').find((x) => x.textContent.includes('Oblivion')));
  expect(t.q('[data-testid="sheet-status"]').textContent).toContain('another preset');
  expect(t.q('[data-testid="oblivion-owner"]').textContent).toContain(a.name);
});
