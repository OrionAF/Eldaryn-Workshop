import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GoalTimelineChart from './GoalTimelineChart.svelte';

function render(entries) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(GoalTimelineChart, { target, props: { entries } });
  flushSync();
  return { target, cleanup: () => (unmount(app), target.remove()) };
}

const simRun = (day, meanDps) => ({
  id: `sim-${day}`,
  kind: 'sim',
  at: `2026-07-${String(day).padStart(2, '0')}T10:00:00.000Z`,
  headline: { meanDps, iterations: 100, durationSeconds: 60 },
});

it('renders one chart per metric with >= 2 points, oldest to newest', () => {
  const { target, cleanup } = render([
    simRun(15, 900),
    simRun(17, 1100),
    simRun(19, 1300),
    { id: 'p1', kind: 'pvp-sim', at: '2026-07-16T10:00:00.000Z', headline: { winRate: 48 } },
    { id: 'p2', kind: 'pvp-sim', at: '2026-07-18T10:00:00.000Z', headline: { winRate: 60 } },
    { id: 'o1', kind: 'opt', at: '2026-07-19T10:00:00.000Z', headline: { unit: 'Tank Score', best: 500 } }, // one point - no chart
  ]);
  const charts = target.querySelectorAll('.chart');
  expect(charts.length).toBe(2); // Mean DPS + Win rate; Tank Score has one point
  const dpsChart = [...charts].find((c) => c.textContent.includes('Mean DPS'));
  expect(dpsChart.querySelectorAll('circle').length).toBe(3);
  expect(dpsChart.querySelector('polyline')).not.toBeNull();
  expect(dpsChart.textContent).toContain('3 runs');
  cleanup();
});

it('shows the empty-state copy when no metric has two points', () => {
  const { target, cleanup } = render([simRun(19, 1000)]);
  expect(target.querySelector('.chart')).toBeNull();
  expect(target.textContent).toContain('two or more runs');
  cleanup();
});
