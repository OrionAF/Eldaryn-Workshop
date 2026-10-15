import { it, expect, afterEach } from 'vitest';
import ContextHeader from './ContextHeader.svelte';
import { setup } from '../ui/testkit.js';

let ui;
afterEach(() => ui?.done());

it('Settings is a Global page: the chip says Global, not Tool', () => {
  ui = setup(ContextHeader, { route: { kind: 'settings', hash: '#/settings' }, character: null });
  const chip = ui.q('.scope-chip');
  expect(chip.querySelector('b').textContent).toBe('Global');
  expect(chip.querySelector('.tg').textContent).toBe('This device');
  expect(chip.getAttribute('style')).toContain('--scope-global');
});
