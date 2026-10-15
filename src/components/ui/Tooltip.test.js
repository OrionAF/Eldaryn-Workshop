import { it, expect } from 'vitest';
import { flushSync } from 'svelte';
import Tooltip from './Tooltip.svelte';
import { setup, html, key } from './testkit.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function focusIn(el) {
  el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  flushSync();
}

it('is hidden until hover or focus, then a role=tooltip described-by the trigger wrapper', async () => {
  const { q, done } = setup(Tooltip, { text: 'Unlock Oblivion first', delay: 0, children: html('<button>Run</button>') });
  expect(q('[role=tooltip]')).toBeNull();
  focusIn(q('button'));
  await wait(5);
  flushSync();
  const tip = q('[role=tooltip]');
  expect(tip.textContent).toBe('Unlock Oblivion first');
  expect(q('.tip-wrap').getAttribute('aria-describedby')).toBe(tip.id);
  done();
});

it('shows on mouseenter and hides on mouseleave', async () => {
  const { q, done } = setup(Tooltip, { text: 'Hint', delay: 0, children: html('<button>x</button>') });
  q('.tip-wrap').dispatchEvent(new MouseEvent('mouseenter'));
  await wait(5);
  flushSync();
  expect(q('[role=tooltip]')).not.toBeNull();
  q('.tip-wrap').dispatchEvent(new MouseEvent('mouseleave'));
  flushSync();
  expect(q('[role=tooltip]')).toBeNull();
  done();
});

it('Escape hides it', async () => {
  const { q, done } = setup(Tooltip, { text: 'Hint', delay: 0, children: html('<button>x</button>') });
  focusIn(q('button'));
  await wait(5);
  flushSync();
  key(q('button'), 'Escape');
  expect(q('[role=tooltip]')).toBeNull();
  done();
});

it('honours the delay: nothing is shown before it elapses', async () => {
  const { q, done } = setup(Tooltip, { text: 'Hint', delay: 60, children: html('<button>x</button>') });
  focusIn(q('button'));
  await wait(10);
  flushSync();
  expect(q('[role=tooltip]')).toBeNull();
  await wait(80);
  flushSync();
  expect(q('[role=tooltip]')).not.toBeNull();
  done();
});
