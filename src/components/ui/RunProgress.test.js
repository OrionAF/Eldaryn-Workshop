import { it, expect } from 'vitest';
import RunProgress from './RunProgress.svelte';
import { setup } from './testkit.js';

it('RunProgress: a known phase id carries its explanation, an unknown one gets none', () => {
  const t = setup(RunProgress, {
    segments: [
      { id: 'screen', label: 'Screen', state: 'done' },
      { id: 'push', label: 'Push', state: 'active' },
    ],
  });
  const bars = t.qa('[role=progressbar]');
  const labels = t.qa('.lbl b');
  expect(bars[0].getAttribute('aria-description')).toContain('first measurements');
  expect(labels[0].getAttribute('title')).toContain('first measurements');
  expect(bars[1].getAttribute('aria-description')).toBeNull();
  expect(labels[1].getAttribute('title')).toBeNull();
  t.done();
});
