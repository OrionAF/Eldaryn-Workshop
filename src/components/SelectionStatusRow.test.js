import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SelectionStatusRow from './SelectionStatusRow.svelte';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

it('shows the selected slot and highlights the active mode', () => {
  const app = mount(SelectionStatusRow, {
    target,
    props: { selectedSlot: 'Ring', mode: 'compare', onModeChange: () => {} },
  });
  flushSync();

  expect(target.textContent).toContain('Ring');
  const buttons = [...target.querySelectorAll('.mode-toggle button')];
  expect(buttons.find((b) => b.textContent.trim() === 'Compare').classList.contains('active')).toBe(true);
  expect(buttons.find((b) => b.textContent.trim() === 'Edit').classList.contains('active')).toBe(false);
  unmount(app);
});

it('clicking Edit calls onModeChange with "edit"', () => {
  let mode = 'compare';
  const app = mount(SelectionStatusRow, {
    target,
    props: { selectedSlot: 'Ring', mode: 'compare', onModeChange: (m) => (mode = m) },
  });
  flushSync();

  [...target.querySelectorAll('.mode-toggle button')].find((b) => b.textContent.trim() === 'Edit').click();
  flushSync();
  expect(mode).toBe('edit');
  unmount(app);
});
