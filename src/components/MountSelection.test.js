import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MountSelection from './MountSelection.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  for (const m of [...rosterStore.current.sources.mounts.entries]) rosterStore.removeMount(m.id);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(MountSelection, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('adds a mount via the form, auto-activating the first one', () => {
  target.querySelector('.add-form input[type="text"]').value = 'Crystal Beast';
  target.querySelector('.add-form input[type="text"]').dispatchEvent(new Event('input', { bubbles: true }));
  const raritySelect = target.querySelector('.add-form select');
  raritySelect.value = 'Uncommon';
  raritySelect.dispatchEvent(new Event('change', { bubbles: true }));
  target.querySelector('.add-form button').click();
  flushSync();

  expect(rosterStore.current.sources.mounts.entries.length).toBe(1);
  const mount1 = rosterStore.current.sources.mounts.entries[0];
  expect(mount1.name).toBe('Crystal Beast');
  expect(mount1.rarity).toBe('Uncommon');
  expect(rosterStore.current.sources.mounts.activeId).toBe(mount1.id);
  cleanup();
});

it('editing Base HP%/Base ATK% on a mount row writes through updateMount', () => {
  const id = rosterStore.addMount('Crystal Beast', 'Uncommon');
  flushSync();

  const baseInputs = target.querySelectorAll('.base-stat input');
  baseInputs[0].value = '19';
  baseInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  baseInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
  baseInputs[1].value = '10';
  baseInputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  baseInputs[1].dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();

  const mountEntry = rosterStore.current.sources.mounts.entries.find((m) => m.id === id);
  expect(mountEntry.baseHpPct).toBe(19);
  expect(mountEntry.baseAtkPct).toBe(10);
  cleanup();
});

it('Riding radio switches the active mount', () => {
  const a = rosterStore.addMount('A', 'Common');
  const b = rosterStore.addMount('B', 'Common');
  flushSync();

  const radios = [...target.querySelectorAll('input[type="radio"]')];
  radios[1].checked = true;
  radios[1].dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  expect(rosterStore.current.sources.mounts.activeId).toBe(b);
  expect(a).not.toBe(b);
  cleanup();
});
