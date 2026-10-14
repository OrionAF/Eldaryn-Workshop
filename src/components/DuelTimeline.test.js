import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DuelTimeline from './DuelTimeline.svelte';

const row = (timestamp, type, damage = 0, extra = {}) => ({ timestamp, type, damage, attackerHpAfter: 100, defenderHpAfter: 100, ...extra });

const FIXTURE = [
  row(1000, 'attacker_hit', 500, { isCrit: false }),
  row(1250, 'defender_crit', 12000, { isCrit: true }),
  row(2000, 'attacker_regen', 90),
  row(2500, 'attacker_spell_cast', 0, { spell: { name: 'Ember Curse', icon: null, species: 'EMBER_CURSE' } }),
  row(3000, 'defender_blinded'),
  row(3500, 'attacker_miss'),
  row(40000, 'defender_dead'),
  row(60000, 'time_up'),
];

function render(props) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(DuelTimeline, { target, props });
  flushSync();
  return { target, cleanup: () => (unmount(app), target.remove()) };
}

it('draws damage as bars, other events as marks, a death glyph and a time-up line, each with a tooltip', () => {
  const { target, cleanup } = render({ events: FIXTURE, attackerName: 'Boss Preset', defenderName: 'Rival' });

  expect(target.querySelectorAll('rect').length).toBe(2); // the two damage rows
  expect(target.querySelectorAll('circle').length).toBe(4); // regen, spell cast, blinded, avoided
  expect(target.querySelectorAll('text').length).toBe(1); // the death
  expect(target.querySelectorAll('svg > line').length).toBe(3); // two lane baselines + the time-up line
  expect(target.querySelectorAll('title').length).toBe(FIXTURE.length);
  const titles = [...target.querySelectorAll('title')].map((t) => t.textContent);
  expect(titles.some((t) => t.includes('Ember Curse'))).toBe(true);
  expect(titles.some((t) => t.includes('CRIT') && t.includes('Rival'))).toBe(true);
  expect(titles.some((t) => t.includes('Rival died'))).toBe(true);
  expect(target.textContent).toContain('Boss Preset');
  expect(target.textContent).toContain('Rival');

  const [small, big] = [...target.querySelectorAll('rect')].map((r) => Number(r.getAttribute('height')));
  expect(big).toBeGreaterThan(small); // sqrt scaling
  cleanup();
});

it('puts attacker rows in the top lane and defender rows in the bottom lane', () => {
  const { target, cleanup } = render({ events: [row(1000, 'attacker_hit', 100), row(1000, 'defender_hit', 100)] });
  const [a, d] = [...target.querySelectorAll('rect')].map((r) => Number(r.getAttribute('y')) + Number(r.getAttribute('height')));
  expect(a).toBeLessThan(d); // baselines: attacker 34, defender 82
  cleanup();
});

it('renders an empty strip without crashing', () => {
  const { target, cleanup } = render({ events: [] });
  expect(target.querySelector('svg')).not.toBeNull();
  expect(target.querySelectorAll('rect').length).toBe(0);
  cleanup();
});
