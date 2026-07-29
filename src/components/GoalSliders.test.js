import { it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GoalSliders from './GoalSliders.svelte';

function setup(weights = { damage: 34, mitigation: 33, survivability: 33 }) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const onChange = vi.fn();
  const app = mount(GoalSliders, { target, props: { weights, onChange } });
  flushSync();
  return { target, app, onChange };
}

function slide(target, label, value) {
  const input = target.querySelector(`input[aria-label="${label}"]`);
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
}

const sum = (w) => w.damage + w.mitigation + w.survivability;

it('renders the three factor sliders with their current values', () => {
  const { target, app } = setup({ damage: 70, mitigation: 20, survivability: 10 });
  const labels = [...target.querySelectorAll('input[type="range"]')].map((i) => i.getAttribute('aria-label'));
  expect(labels).toEqual(['Maximum Damage', 'Damage Mitigation', 'Survivability']);
  expect(target.querySelector('input[aria-label="Maximum Damage"]').value).toBe('70');
  unmount(app);
});

it('moving one slider redistributes the remainder proportionally, keeping the sum at 100', () => {
  const { target, app, onChange } = setup({ damage: 50, mitigation: 30, survivability: 20 });
  slide(target, 'Maximum Damage', 70);
  const w = onChange.mock.calls[0][0];
  expect(w.damage).toBe(70);
  // The other two split the remaining 30 in their prior 30:20 ratio.
  expect(w.mitigation).toBeCloseTo(18, 9);
  expect(w.survivability).toBeCloseTo(12, 9);
  expect(sum(w)).toBeCloseTo(100, 9);
  unmount(app);
});

it('splits the remainder equally when the other two sliders are both at 0', () => {
  const { target, app, onChange } = setup({ damage: 100, mitigation: 0, survivability: 0 });
  slide(target, 'Maximum Damage', 60);
  const w = onChange.mock.calls[0][0];
  expect(w).toEqual({ damage: 60, mitigation: 20, survivability: 20 });
  unmount(app);
});

it('a slider dragged to 100 zeroes the other two', () => {
  const { target, app, onChange } = setup({ damage: 50, mitigation: 30, survivability: 20 });
  slide(target, 'Survivability', 100);
  const w = onChange.mock.calls[0][0];
  expect(w).toEqual({ survivability: 100, damage: 0, mitigation: 0 });
  expect(sum(w)).toBe(100);
  unmount(app);
});
