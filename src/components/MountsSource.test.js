import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import MountsSource from './MountsSource.svelte';

let target, app;
beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(MountsSource, { target });
  flushSync();
});

it('defaults to Mount Selection, and switches to Glyph Inventory on tab click', () => {
  expect(target.querySelector('.mount-selection')).not.toBeNull();
  expect(target.querySelector('.glyph-inventory')).toBeNull();

  const tabButtons = [...target.querySelectorAll('button[role="tab"]')];
  tabButtons.find((b) => b.textContent.trim() === 'Glyph Inventory').click();
  flushSync();

  expect(target.querySelector('.mount-selection')).toBeNull();
  expect(target.querySelector('.glyph-inventory')).not.toBeNull();
  unmount(app);
});
