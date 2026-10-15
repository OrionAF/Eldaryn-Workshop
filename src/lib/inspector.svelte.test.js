import { it, expect, afterEach } from 'vitest';
import { createRawSnippet } from 'svelte';
import { inspector } from './inspector.svelte.js';
import InspectorOutlet from '../components/InspectorOutlet.svelte';
import { setup } from '../components/ui/testkit.js';

afterEach(() => inspector.clear());
const snip = (text) => createRawSnippet(() => ({ render: () => `<p>${text}</p>` }));

it('starts empty, set shows a snippet, clear removes it', () => {
  expect(inspector.current).toBeNull();
  const a = snip('a');
  inspector.set(a);
  expect(inspector.current).toBe(a);
  inspector.clear();
  expect(inspector.current).toBeNull();
});

it('a release clears the slot only while it still holds that snippet', () => {
  const releaseA = inspector.set(snip('a'));
  const b = snip('b');
  inspector.set(b);
  releaseA(); // page A unmounts after page B registered
  expect(inspector.current).toBe(b);
});

it('the outlet renders the registered snippet and goes empty on release', async () => {
  const view = setup(InspectorOutlet);
  expect(view.target.textContent).toBe('');
  const release = inspector.set(snip('totals'));
  await Promise.resolve();
  expect(view.target.textContent).toContain('totals');
  release();
  await Promise.resolve();
  expect(view.target.textContent).toBe('');
  view.done();
});
