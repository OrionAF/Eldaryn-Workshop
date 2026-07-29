import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import GauntletResultPanel from './GauntletResultPanel.svelte';

function render(result) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(GauntletResultPanel, { target, props: { result } });
  flushSync();
  return { target, cleanup: () => (unmount(app), target.remove()) };
}

function fixture(overrides = {}) {
  return {
    budget: 60000,
    iterations: 200,
    finalists: [
      {
        index: 0,
        score: 100,
        overallWinRate: 45,
        ci: 2,
        perArchetype: [
          { archetypeId: 'w-berserker', name: 'Berserker', class: 'Warrior', winRate: 30, ci: 4 },
          { archetypeId: 's-marksman', name: 'Marksman', class: 'Sentinel', winRate: 60, ci: 4 },
        ],
      },
      {
        index: 1,
        score: 90,
        overallWinRate: 72,
        ci: 2,
        perArchetype: [
          { archetypeId: 'w-berserker', name: 'Berserker', class: 'Warrior', winRate: 70, ci: 4 },
          { archetypeId: 's-marksman', name: 'Marksman', class: 'Sentinel', winRate: 74, ci: 4 },
        ],
      },
    ],
    contradiction: { flagged: true, message: 'The closed-form top build ranks #2 by duels — build #2 out-duels it (72.0% vs 45.0%).' },
    ...overrides,
  };
}

it('renders the finalist × archetype grid with overall win-rates and the contradiction banner', () => {
  const { target, cleanup } = render(fixture());
  expect(target.querySelector('[data-testid="gauntlet-result"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="gauntlet-contradiction"]')).not.toBeNull();
  expect(target.textContent).toContain('out-duels');

  const rows = target.querySelectorAll('tbody tr');
  expect(rows.length).toBe(2);
  expect(rows[0].textContent).toContain('Recommended');
  expect(rows[1].textContent).toContain('Runner-up 1');
  // Header carries both archetypes; overall column shows each finalist's rate.
  const headers = [...target.querySelectorAll('thead th')].map((h) => h.textContent.trim());
  expect(headers).toContain('Berserker');
  expect(headers).toContain('Marksman');
  expect(rows[0].textContent).toContain('45%');
  expect(rows[1].textContent).toContain('72%');
  cleanup();
});

it('shows the agreement line (no contradiction) when the rankings agree', () => {
  const { target, cleanup } = render(fixture({ contradiction: { flagged: false, message: 'Closed-form and duel rankings agree on the best build.' } }));
  expect(target.querySelector('[data-testid="gauntlet-contradiction"]')).toBeNull();
  expect(target.textContent).toContain('agree on the best build');
  cleanup();
});

it('marks near-coin-flip cells (within CI of 50%) as even, not good/bad', () => {
  const { target, cleanup } = render(
    fixture({
      finalists: [
        {
          index: 0,
          score: 100,
          overallWinRate: 51,
          ci: 3, // 51 is within 3 of 50 -> even
          perArchetype: [{ archetypeId: 'w-berserker', name: 'Berserker', class: 'Warrior', winRate: 51, ci: 3 }],
        },
      ],
    })
  );
  const overallCell = target.querySelector('tbody tr td');
  expect(overallCell.classList.contains('even')).toBe(true);
  expect(overallCell.classList.contains('good')).toBe(false);
  cleanup();
});

it('renders nothing when there is no result', () => {
  const { target, cleanup } = render(null);
  expect(target.querySelector('[data-testid="gauntlet-result"]')).toBeNull();
  cleanup();
});
