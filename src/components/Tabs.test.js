import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Tabs from './Tabs.svelte';

let target;
beforeEach(() => {
  target = document.createElement('div');
  document.body.appendChild(target);
});

it('marks the active tab and calls onSelect with the clicked tab id', () => {
  let selected = null;
  const app = mount(Tabs, {
    target,
    props: {
      tabs: [
        { id: 'profile', label: 'Profile Stats' },
        { id: 'gear', label: 'Gear Panel' },
      ],
      active: 'profile',
      onSelect: (id) => {
        selected = id;
      },
    },
  });
  flushSync();

  const buttons = [...target.querySelectorAll('button[role="tab"]')];
  expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  expect(buttons[1].getAttribute('aria-selected')).toBe('false');

  buttons[1].click();
  flushSync();
  expect(selected).toBe('gear');

  unmount(app);
});
