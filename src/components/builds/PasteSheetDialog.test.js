import { it, expect, afterEach } from 'vitest';
import PasteSheetDialog from './PasteSheetDialog.svelte';
import { setup, type, click } from '../ui/testkit.js';

let t;
let applied;
const open = (values = { totalAttack: 1, totalHp: 900 }) => {
  applied = [];
  t = setup(PasteSheetDialog, {
    open: true,
    keys: ['totalAttack', 'totalHp', 'totalCritChance'],
    values,
    playerClass: 'WARRIOR',
    onapply: (v) => applied.push(v),
  });
};
afterEach(() => t?.done());

const applyBtn = () => document.querySelector('[data-testid="paste-apply"]');

it('Apply is disabled until a line is read', () => {
  open();
  expect(applyBtn().disabled).toBe(true);
  type(document.querySelector('textarea'), 'Foo 3');
  expect(applyBtn().disabled).toBe(true);
  expect(document.querySelector('[data-testid="paste-preview"]').textContent).toContain('Not recognised: Foo 3');
});

it('previews read rows and skipped lines, then applies them merged over the current values', () => {
  open();
  type(document.querySelector('textarea'), 'Attack 48.124\nCrit Chance 6.2%\nAttack -1\nSoul Link 4');
  const preview = document.querySelector('[data-testid="paste-preview"]').textContent;
  expect(preview).toContain('48.124');
  expect(preview).toContain('6.2%');
  expect(preview).toContain('Number not read: Attack -1');
  expect(preview).toContain('Not on this sheet: Soul Link 4');
  expect(document.querySelector('[data-testid="paste-count"]').textContent).toContain('2 stats read, 2 skipped');
  click(applyBtn());
  expect(applied).toEqual([{ totalAttack: 48124, totalHp: 900, totalCritChance: 6.2 }]);
});
