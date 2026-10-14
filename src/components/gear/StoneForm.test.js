import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StoneForm from './StoneForm.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Stone Test', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});

const q = (label) => target.querySelector(`[aria-label="${label}"]`);
function change(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}
const button = (text) => [...target.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text));

function render(props = {}) {
  let selected = props.selectedStoneId ?? null;
  const app = mount(StoneForm, {
    target,
    props: {
      realm: 'base',
      get stones() {
        return props.realm === 'oblivion' ? rosterStore.current.oblivionEnchantStones : rosterStore.current.enchantStones;
      },
      cls: 'WARRIOR',
      setKey: 'set1',
      setLabel: 'Set 1',
      selectedSlot: 'HEAD',
      get selectedStoneId() {
        return selected;
      },
      onSelect: (id) => {
        selected = id;
      },
      ...props,
    },
  });
  flushSync();
  return app;
}

it('base pool offers the 5 non-Oblivion types; Oblivion pool offers only the Oblivion stone', () => {
  const a = render();
  expect([...q('Stone type').options].map((o) => o.value)).toEqual(['PVE_ATTACK', 'PVE_DEFENSE', 'PVP', 'ULTIMATE', 'MYTHIC']);
  unmount(a);
  target.innerHTML = '';
  const b = render({ realm: 'oblivion' });
  expect([...q('Stone type').options].map((o) => o.value)).toEqual(['OBLIVION']);
  expect(q('Oblivion grade')).not.toBeNull();
  unmount(b);
});

it('Mythic: both PvP rows are fixed, 2 free rows must be chosen before Add enables', () => {
  const app = render();
  change(q('Stone type'), 'MYTHIC');
  expect(q('PVP Attack')).not.toBeNull();
  expect(q('PVP Defense')).not.toBeNull();
  expect(button('Add stone').disabled).toBe(true);
  change(q('Free stat 1'), 'CRIT_CHANCE');
  change(q('Free stat 2'), 'DOUBLE_HIT');
  expect(button('Add stone').disabled).toBe(false);
  // a chosen free stat is not offered in the other free row
  expect([...q('Free stat 2').options].map((o) => o.value)).not.toContain('CRIT_CHANCE');
  change(q('PVP Attack'), '12');
  change(q('PVP Defense'), '9');
  change(q('Free stat 1 value'), '1.5');
  change(q('Stone quality'), '77');
  button('Add stone').click();
  flushSync();
  const added = rosterStore.current.enchantStones.at(-1);
  expect(added).toMatchObject({ type: 'MYTHIC', quality: 77, amplifyLevel: 0 });
  expect(added.stats).toEqual([
    { type: 'PVP_ATTACK', value: 12 },
    { type: 'PVP_DEFENSE', value: 9 },
    { type: 'CRIT_CHANCE', value: 1.5 },
    { type: 'DOUBLE_HIT', value: 0 },
  ]);
  unmount(app);
});

it('Azure takes exactly one PvP stat from the Attack / Defense pair', () => {
  const app = render();
  change(q('Stone type'), 'PVP');
  expect([...q('PvP stat').options].map((o) => o.value)).toEqual(['PVP_ATTACK', 'PVP_DEFENSE']);
  change(q('PvP stat'), 'PVP_DEFENSE');
  change(q('PvP stat value'), '14');
  change(q('Free stat 1'), 'HEALTH_PERCENT');
  button('Add stone').click();
  flushSync();
  expect(rosterStore.current.enchantStones.at(-1).stats.map((s) => s.type)).toEqual(['PVP_DEFENSE', 'HEALTH_PERCENT']);
  unmount(app);
});

it('details mode: amplify stepper clamps at +10, shows the multiplier, and persists', () => {
  const id = rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 50, stats: [{ type: 'CRIT_CHANCE', value: 1 }] });
  const app = render({ selectedStoneId: id });
  const up = q('Amplify up');
  for (let i = 0; i < 12; i++) {
    up.click();
    flushSync();
  }
  expect(rosterStore.current.enchantStones[0].amplifyLevel).toBe(10);
  expect(target.querySelector('[data-testid="amplify-level"]').textContent).toBe('+10');
  expect(target.textContent).toContain('x1.60');
  expect(up.disabled).toBe(true);
  unmount(app);
});

it('details mode: edit a stat value and quality; socket / unsocket into the selected slot', () => {
  const id = rosterStore.addEnchantStone('base', { type: 'PVE_ATTACK', quality: 50, stats: [{ type: 'CRIT_CHANCE', value: 1 }] });
  const app = render({ selectedStoneId: id });
  change(q('Crit Chance'), '2.1');
  change(q('Stone quality'), '88');
  expect(rosterStore.current.enchantStones[0]).toMatchObject({ quality: 88, stats: [{ type: 'CRIT_CHANCE', value: 2.1 }] });
  button('Socket in Set 1 Helmet').click();
  flushSync();
  expect(rosterStore.current.equipment.set1.enchantSlots.HEAD).toBe(id);
  expect(button('Unsocket from Helmet')).toBeTruthy();
  button('Unsocket from Helmet').click();
  flushSync();
  expect(rosterStore.current.equipment.set1.enchantSlots.HEAD).toBeNull();
  unmount(app);
});

it('details mode for an Oblivion stone: grade select and base stats; socket target is the Oblivion set', () => {
  const id = rosterStore.addEnchantStone('oblivion', { type: 'OBLIVION', quality: 90, oblivionLevel: 2, stats: [] });
  const app = render({ realm: 'oblivion', setKey: 'oblivion', setLabel: 'Oblivion', selectedStoneId: id });
  expect(target.textContent).toContain('10.650 Attack');
  change(q('Oblivion grade'), '4');
  expect(rosterStore.current.oblivionEnchantStones[0].oblivionLevel).toBe(4);
  button('Socket in Oblivion Helmet').click();
  flushSync();
  expect(rosterStore.current.equipment.oblivion.enchantSlots.HEAD).toBe(id);
  unmount(app);
});

it('a slot without a socket hides the socket button', () => {
  const id = rosterStore.addEnchantStone('oblivion', { type: 'OBLIVION', stats: [] });
  const app = render({ realm: 'oblivion', setKey: 'oblivion', setLabel: 'Oblivion', selectedSlot: 'BELT', canSocket: false, selectedStoneId: id });
  expect(button('Socket in')).toBeUndefined();
  expect(target.textContent).toContain('Select a base slot');
  unmount(app);
});
