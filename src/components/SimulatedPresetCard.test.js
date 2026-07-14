/**
 * SimulatedPresetCard apply-button wiring: the card stays a read-only
 * recommendation unless a parent passes onApply, and applying is two-click
 * confirmed because it overwrites real build state. Card content rendering
 * is covered by SimulationScreen.test.js.
 */
import { it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SimulatedPresetCard from './SimulatedPresetCard.svelte';
import { candidateFromCurrent } from '../lib/optimizer.js';
import { newCharacter } from '../lib/model.js';

let target, app;

function mountCard(props) {
  const character = newCharacter('Card Tester');
  character.class = 'Warrior';
  const candidate = candidateFromCurrent(character, character.presets[0]);
  const result = {
    baseline: { score: 40 },
    best: { score: 55, candidate },
    improvementPct: 37.5,
    changes: [{ dimension: 'pet', from: 'No pet', to: 'Attack Pet' }],
    transcendencePlan: [],
    ...props?.result,
  };
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(SimulatedPresetCard, { target, props: { character, ...props, result } });
  flushSync();
  return { candidate, result };
}

afterEach(() => {
  unmount(app);
  target.remove();
});

const applyButton = () => [...target.querySelectorAll('button')].find((b) => b.textContent.includes('Apply to preset') || b.textContent.includes('Overwrite preset'));

it('renders no apply button without onApply (recommendation-only footnote instead)', () => {
  mountCard();
  expect(applyButton()).toBeUndefined();
  expect(target.textContent).toContain('nothing is saved to your presets');
});

it('with onApply, applying takes two clicks and passes the recommended candidate', () => {
  const onApply = vi.fn();
  const { candidate } = mountCard({ onApply });

  const btn = applyButton();
  btn.click();
  flushSync();
  expect(onApply).not.toHaveBeenCalled(); // first click only arms the confirm
  expect(btn.textContent).toContain('Overwrite preset');

  btn.click();
  flushSync();
  expect(onApply).toHaveBeenCalledTimes(1);
  expect(onApply).toHaveBeenCalledWith(candidate);
});

it('hides the apply button when there is nothing to change', () => {
  mountCard({ onApply: vi.fn(), result: { changes: [] } });
  expect(applyButton()).toBeUndefined();
});

const overrideButton = () => [...target.querySelectorAll('button')].find((b) => /Override Preset|Overwrite “|Create a new preset/.test(b.textContent));

it('picker mode: shows the target preset by name and passes the chosen id on confirm', () => {
  const onApply = vi.fn();
  const applyPresets = [
    { id: 'p1', name: 'Farm Build' },
    { id: 'p2', name: 'Boss Build' },
  ];
  const { candidate } = mountCard({ onApply, applyPresets, applyDefaultId: 'p1' });

  // The select defaults to the preset the result was optimized from.
  const select = target.querySelector('.apply-target select');
  expect(select.value).toBe('p1');
  expect(select.textContent).toContain('Farm Build (optimized from)');

  overrideButton().click();
  flushSync();
  // The confirm names the preset being overridden.
  expect(overrideButton().textContent).toContain('Overwrite “Farm Build”');
  overrideButton().click();
  flushSync();
  expect(onApply).toHaveBeenCalledWith(candidate, 'p1');
});

it('picker mode: "create new preset" passes null as the target', () => {
  const onApply = vi.fn();
  const { candidate } = mountCard({ onApply, applyPresets: [{ id: 'p1', name: 'Farm Build' }], applyDefaultId: 'p1' });

  const select = target.querySelector('.apply-target select');
  select.value = '__new__';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  overrideButton().click();
  flushSync();
  expect(overrideButton().textContent).toContain('Create a new preset');
  overrideButton().click();
  flushSync();
  expect(onApply).toHaveBeenCalledWith(candidate, null);
});
