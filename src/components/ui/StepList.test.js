import { it, expect } from 'vitest';
import StepList from './StepList.svelte';
import { setup, click } from './testkit.js';

const steps = [
  { id: 'a', label: 'Gear set', state: 'done', detail: '3 builds tried' },
  { id: 'b', label: 'Talents', state: 'done', detail: '' },
  { id: 'c', label: 'Pet', state: 'skipped', detail: 'nothing to try' },
  { id: 'd', label: 'Relics', state: 'active', detail: 'pass 2' },
];

it('StepList: collapsed until its button is pressed, then lists each step with its state word', () => {
  const t = setup(StepList, { steps, title: 'Search steps', id: 'sl' });
  const btn = t.q('button');
  expect(btn.getAttribute('aria-expanded')).toBe('false');
  expect(btn.getAttribute('aria-controls')).toBe('sl-list');
  expect(btn.textContent.replace(/\s+/g, ' ')).toContain('2 of 3 done');
  expect(t.q('ol')).toBeNull();
  click(btn);
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  const items = t.qa('li');
  expect(items.map((li) => li.querySelector('.what').textContent.replace(/\s+/g, ' ').trim())).toEqual([
    '1. Gear set: done', '2. Talents: done', '3. Pet: skipped', '4. Relics: in progress',
  ]);
  expect(items[3].getAttribute('aria-current')).toBe('step');
  expect(items[2].textContent).toContain('nothing to try');
  expect(t.q('ol').id).toBe('sl-list');
  click(btn);
  expect(t.q('ol')).toBeNull();
  t.done();
});

it('StepList: nothing renders without steps', () => {
  const t = setup(StepList, { steps: [] });
  expect(t.q('button')).toBeNull();
  t.done();
});
