import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DuelTimeline from './DuelTimeline.svelte';

const FIXTURE = [
  { t: 1, side: 'player', kind: 'damage', tag: 'swing', amount: 500, crit: true },
  { t: 1.25, side: 'opponent', kind: 'damage', tag: 'swing', amount: 12000 },
  { t: 2, side: 'player', kind: 'heal', amount: 90 },
  { t: 2.5, side: 'player', kind: 'sigil', name: 'Ember Curse' },
  { t: 3, side: 'opponent', kind: 'blind' },
  { t: 40, side: 'opponent', kind: 'death' },
];

function render(props) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DuelTimeline, { target, props });
  flushSync();
  return { target, cleanup: () => (unmount(app), target.remove()) };
}

it('renders damage as bars, other events as marks, and a death glyph, each with a tooltip', () => {
  const { target, cleanup } = render({ timeline: FIXTURE, playerName: 'Boss Preset', opponentName: 'Rival', durationSeconds: 60 });

  expect(target.querySelectorAll('rect').length).toBe(2); // the two damage events
  expect(target.querySelectorAll('circle').length).toBe(3); // heal + sigil + blind
  expect(target.querySelectorAll('text').length).toBe(1); // the death ✕
  expect(target.querySelectorAll('title').length).toBe(FIXTURE.length);
  expect([...target.querySelectorAll('title')].some((t) => t.textContent.includes('Ember Curse'))).toBe(true);
  expect(target.textContent).toContain('Boss Preset');
  expect(target.textContent).toContain('Rival');

  // The big hit's bar is taller than the small one's (sqrt scaling).
  const [small, big] = [...target.querySelectorAll('rect')].map((r) => Number(r.getAttribute('height')));
  expect(big).toBeGreaterThan(small);
  cleanup();
});

it('renders an empty strip without crashing when the timeline is empty', () => {
  const { target, cleanup } = render({ timeline: [], durationSeconds: 60 });
  expect(target.querySelector('svg')).not.toBeNull();
  expect(target.querySelectorAll('rect').length).toBe(0);
  cleanup();
});
