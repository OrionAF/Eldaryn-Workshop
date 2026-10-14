import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ItemEditor from './ItemEditor.svelte';
import { parseFlat, flatFieldText, toDisplay, fromDisplay } from './gearFormat.js';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

const legendary = {
  rarity: 'LEGENDARY',
  itemLevel: 100,
  quality: 80,
  primaryStats: { attack: 2750, hp: 8230 },
  secondaryStats: [{ type: 'CRIT_CHANCE', value: 3.2 }],
  conduit: null,
};

function render(props) {
  const changes = [];
  const app = mount(ItemEditor, { target, props: { slot: 'WEAPON', realm: 'base', class: 'WARRIOR', onchange: (v) => changes.push(v), ...props } });
  flushSync();
  return { app, changes };
}
function change(el, value) {
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}
const q = (label) => target.querySelector(`[aria-label="${label}"]`);

it('shows one secondary row per rarity slot (Legendary: 2) and the class weapon name', () => {
  const { app } = render({ value: legendary });
  expect(target.querySelectorAll('.secondary-row')).toHaveLength(2);
  expect(target.textContent).toContain('Sword');
  expect(target.textContent).toContain('Secondary stats (1/2)');
  unmount(app);
});

it('secondary picker is class-gated: Miss Chance is offered to a Sentinel, not a Warrior', () => {
  const w = render({ value: legendary });
  const warriorOptions = [...q('Secondary 1 stat').options].map((o) => o.value);
  expect(warriorOptions).not.toContain('MISS_CHANCE');
  expect(warriorOptions).toContain('CRIT_CHANCE');
  unmount(w.app);
  target.innerHTML = '';
  const s = render({ value: legendary, class: 'SENTINEL' });
  expect([...q('Secondary 1 stat').options].map((o) => o.value)).toContain('MISS_CHANCE');
  unmount(s.app);
});

it('a stat already chosen in another row is not offered again', () => {
  const { app } = render({ value: { ...legendary, secondaryStats: [{ type: 'CRIT_CHANCE', value: 3 }, { type: 'LIFESTEAL', value: 2 }] } });
  expect([...q('Secondary 2 stat').options].map((o) => o.value)).not.toContain('CRIT_CHANCE');
  expect([...q('Secondary 1 stat').options].map((o) => o.value)).not.toContain('LIFESTEAL');
  unmount(app);
});

it('emits the edited item on change: rarity, item level, attack with thousands separators', () => {
  const { app, changes } = render({ value: legendary });
  change(q('Rarity'), 'MYTHIC');
  expect(changes.at(-1)).toMatchObject({ rarity: 'MYTHIC', itemLevel: 100 });
  change(q('Item level'), '150');
  expect(changes.at(-1).itemLevel).toBe(150);
  change(q('Attack'), '48.124');
  expect(changes.at(-1).primaryStats).toEqual({ attack: 48124, hp: 8230 });
  change(q('Quality'), '');
  expect(changes.at(-1).quality).toBeNull();
  unmount(app);
});

it('choosing a secondary type then a value emits {type, value}; multiplier stats are entered as percent', () => {
  const { app, changes } = render({ value: legendary });
  change(q('Secondary 2 stat'), 'ATTACK_SPEED');
  expect(changes.at(-1).secondaryStats).toEqual([{ type: 'CRIT_CHANCE', value: 3.2 }, { type: 'ATTACK_SPEED', value: 0 }]);
  unmount(app);
  target.innerHTML = '';
  const again = render({ value: { ...legendary, secondaryStats: [{ type: 'ATTACK_SPEED', value: 0.12 }] } });
  expect(q('Secondary 1 value').value).toBe('12');
  change(q('Secondary 1 value'), '15');
  expect(again.changes.at(-1).secondaryStats[0].value).toBeCloseTo(0.15);
  unmount(again.app);
});

it('conduit controls appear only where a conduit can exist', () => {
  const a = render({ value: legendary });
  expect(q('Conduit type')).toBeNull();
  unmount(a.app);
  target.innerHTML = '';
  const b = render({ value: { ...legendary, rarity: 'ETERNAL' } });
  expect(q('Conduit type')).not.toBeNull();
  change(q('Conduit type'), 'FLAME');
  expect(b.changes.at(-1).conduit).toEqual({ type: 'FLAME', value: 0 });
  unmount(b.app);
  target.innerHTML = '';
  const c = render({ value: { ...legendary, rarity: 'DIVINE' }, realm: 'oblivion', slot: 'BELT' });
  expect(q('Conduit type')).not.toBeNull();
  unmount(c.app);
});

it('Clear slot emits null and is disabled for an empty slot', () => {
  const full = render({ value: legendary });
  [...target.querySelectorAll('button')].find((b) => b.textContent === 'Clear slot').click();
  expect(full.changes.at(-1)).toBeNull();
  unmount(full.app);
  target.innerHTML = '';
  const empty = render({ value: null });
  expect([...target.querySelectorAll('button')].find((b) => b.textContent === 'Clear slot').disabled).toBe(true);
  unmount(empty.app);
});

it('an empty slot starts editable: choosing a rarity emits a full item', () => {
  const { app, changes } = render({ value: null });
  change(q('Rarity'), 'RARE');
  expect(changes.at(-1)).toMatchObject({ rarity: 'RARE', primaryStats: { attack: 0, hp: 0 }, secondaryStats: [] });
  unmount(app);
});

it('parse / format helpers', () => {
  expect(parseFlat('48.124')).toBe(48124);
  expect(parseFlat('48,124')).toBe(48124);
  expect(parseFlat('12.5')).toBe(12.5);
  expect(parseFlat('abc')).toBe(0);
  expect(flatFieldText(48124)).toBe('48.124'); // the game's "." thousands separator, as everywhere else
  expect(parseFlat(flatFieldText(48124))).toBe(48124);
  expect(flatFieldText(0)).toBe('');
  expect(toDisplay('CRIT_DAMAGE', 0.2)).toBe('20');
  expect(toDisplay('CRIT_CHANCE', 3.2)).toBe('3.2');
  expect(fromDisplay('CRIT_DAMAGE', '20')).toBeCloseTo(0.2);
  expect(fromDisplay('CRIT_CHANCE', '-3')).toBe(0);
});
