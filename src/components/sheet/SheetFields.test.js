import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SheetFields from './SheetFields.svelte';

function render(props) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(SheetFields, { target, props: { values: {}, onChange: () => {}, ...props } });
  flushSync();
  return { target, app };
}
const model = (target, key) => target.querySelector(`.sheet-row[data-key="${key}"] .model-value`).textContent.trim();

it('the Model column shows a dash, never a lone unit, when there is no computed value', () => {
  const { target, app } = render({ keys: ['totalCritChance', 'totalAttack'], computed: null });
  expect(model(target, 'totalCritChance')).toBe('—');
  expect(model(target, 'totalAttack')).toBe('—');
  unmount(app);
});

it('the Model column shows the computed value with its unit and "." thousands grouping', () => {
  const { target, app } = render({ keys: ['totalCritChance', 'totalAttack'], computed: { totalCritChance: 5, totalAttack: 1234567 } });
  expect(model(target, 'totalCritChance')).toBe('5%');
  expect(model(target, 'totalAttack')).toBe('1.234.567');
  unmount(app);
});
