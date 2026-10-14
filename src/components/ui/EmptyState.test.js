import { it, expect } from 'vitest';
import EmptyState from './EmptyState.svelte';
import { setup, html } from './testkit.js';

it('shows the title, one sentence and the action; the diamond is decorative', () => {
  const { q, done } = setup(EmptyState, { title: 'No spare items', text: 'Add one in Gear.', action: html('<button>Open Drop Check</button>') });
  expect(q('b').textContent).toBe('No spare items');
  expect(q('p').textContent).toBe('Add one in Gear.');
  expect(q('.act button').textContent).toBe('Open Drop Check');
  expect(q('.glyph').getAttribute('aria-hidden')).toBe('true');
  done();
});

it('omits the sentence and action when not given', () => {
  const { q, done } = setup(EmptyState, { title: 'Nothing here' });
  expect(q('p')).toBeNull();
  expect(q('.act')).toBeNull();
  done();
});
