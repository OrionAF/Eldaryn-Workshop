import { it, expect, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DropCheckScreen from './DropCheckScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

const gear = (attack, extra = {}) => ({
  rarity: 'ETERNAL', itemLevel: 200, quality: 80, primaryStats: { attack, hp: 0 },
  secondaryStats: [{ type: 'CRIT_CHANCE', value: 4 }], conduit: null, ...extra,
});

let target;
let app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Drop Screen', 'WARRIOR');
  rosterStore.setEquipmentItem('set1', 'WEAPON', gear(1000));
  rosterStore.setEquipmentItem('set2', 'WEAPON', gear(1000));
  target = document.createElement('div');
  document.body.appendChild(target);
  app = null;
});

function open(props = {}) {
  app = mount(DropCheckScreen, { target, props: { setStatus: () => {}, ...props } });
  flushSync();
}
function done() {
  if (app) unmount(app);
  target.remove();
}
const q = (label) => target.querySelector(`[aria-label="${label}"]`);
function change(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
const btn = (text) => [...target.querySelectorAll('button')].find((b) => b.textContent.includes(text));

it('creates a drop on first open and asks for stats before judging', () => {
  expect(rosterStore.current.drop).toBeNull();
  open();
  expect(rosterStore.current.drop).toMatchObject({ realm: 'base', slot: 'WEAPON' });
  expect(target.textContent).toContain('Enter at least one stat');
  expect(target.querySelector('[data-set]')).toBeNull();
  done();
});

it('typing the drop gives a closed-form verdict per equipment set straight away', () => {
  open();
  change(q('Attack'), '9.000');
  expect(rosterStore.current.drop.item.primaryStats.attack).toBe(9000);
  const cards = [...target.querySelectorAll('[data-set]')].map((c) => c.dataset.set);
  expect(cards).toEqual(['set1', 'set2']);
  expect(target.querySelector('[data-set="set1"]').dataset.verdict).toBe('upgrade');
  expect(target.textContent).toContain('Auto-attack DPS');
  done();
});

it('a worse drop is a downgrade', () => {
  open();
  change(q('Attack'), '10');
  expect(target.querySelector('[data-set="set1"]').dataset.verdict).toBe('downgrade');
  done();
});

it('runs the simulation after the pause and shows N and the interval', async () => {
  open();
  change(q('Attack'), '9.000');
  await vi.waitFor(() => expect(target.querySelector('[data-metric="sim"]')).not.toBeNull(), { timeout: 15000, interval: 100 });
  const line = target.querySelector('[data-metric="sim"]').textContent;
  expect(line).toContain('N=32');
  expect(line).toContain('95% CI');
  expect(target.textContent).toContain('Simulation complete');
  expect(target.querySelector('[data-set="set1"]').dataset.verdict).toBe('upgrade');
  done();
}, 20000);

it('with the simulation off nothing runs', async () => {
  open();
  target.querySelector('input[type="checkbox"]').click(); // Simulated DPS
  flushSync();
  change(q('Attack'), '9.000');
  await new Promise((r) => setTimeout(r, 600));
  flushSync();
  expect(target.querySelector('[data-metric="sim"]')).toBeNull();
  expect(target.textContent).not.toContain('Simulating');
  done();
});

it('Apply to set writes the drop into that set only and reports it', () => {
  const setStatus = vi.fn();
  open({ setStatus });
  change(q('Attack'), '9.000');
  btn('Apply to Set 2').click();
  flushSync();
  expect(rosterStore.current.equipment.set2.items.WEAPON.primaryStats.attack).toBe(9000);
  expect(rosterStore.current.equipment.set1.items.WEAPON.primaryStats.attack).toBe(1000);
  expect(setStatus).toHaveBeenCalledWith(expect.stringContaining('Applied to Set 2'));
  done();
});

it('choosing another slot starts a fresh drop; Discard empties it', () => {
  open();
  change(q('Attack'), '9.000');
  target.querySelector('[data-slot="RING"]').click();
  flushSync();
  expect(rosterStore.current.drop).toMatchObject({ slot: 'RING' });
  expect(rosterStore.current.drop.item.primaryStats.attack).toBe(0);
  change(q('Attack'), '5.000');
  btn('Discard this drop').click();
  flushSync();
  expect(rosterStore.current.drop.item.primaryStats.attack).toBe(0);
  done();
});

it('limiting to one preset shows only its set', () => {
  open();
  change(q('Attack'), '9.000');
  const second = rosterStore.current.presets[1];
  change(q('Presets'), second.id);
  const cards = [...target.querySelectorAll('[data-set]')];
  expect(cards).toHaveLength(1);
  expect(target.querySelectorAll('li[data-preset]')).toHaveLength(1);
  done();
});

it('hides the Oblivion realm until it is unlocked, then judges against the Oblivion set', () => {
  open();
  expect(btn('Oblivion')).toBeUndefined();
  done();

  rosterStore.setOblivionUnlocked(true);
  open();
  expect(btn('Oblivion')).toBeDefined();
  btn('Oblivion').click();
  flushSync();
  expect(rosterStore.current.drop.realm).toBe('oblivion');
  expect(target.querySelectorAll('.silhouette .slot')).toHaveLength(12);
  target.querySelector('[data-slot="BELT"]').click();
  flushSync();
  change(q('Attack'), '30.000');
  const cards = [...target.querySelectorAll('[data-set]')].map((c) => c.dataset.set);
  expect(cards).toEqual(['oblivion']);
  btn('Apply to Oblivion').click();
  flushSync();
  expect(rosterStore.current.equipment.oblivion.items.BELT.primaryStats.attack).toBe(30000);
  done();
});

it('survival and PVP options reveal their pickers', () => {
  open();
  const boxes = target.querySelectorAll('input[type="checkbox"]');
  boxes[1].click(); // survival
  flushSync();
  expect(q('Enemy kind')).not.toBeNull();
  boxes[2].click(); // pvp
  flushSync();
  expect(target.textContent).toContain('No saved opponents');
  done();
});

it('mentions the sheet when no preset has one, and links to Presets', () => {
  const onNavigate = vi.fn();
  open({ onNavigate });
  change(q('Attack'), '9.000');
  btn('Enter a sheet on Presets').click();
  expect(onNavigate).toHaveBeenCalledWith('presets');
  done();
});
