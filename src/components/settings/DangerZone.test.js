import { it, expect, beforeEach, vi, afterEach } from 'vitest';
import { setup, type, key, click } from '../ui/testkit.js';
import DangerZone from './DangerZone.svelte';
import { KEY, KEY_V1 } from '../../lib/storage.js';

let reload;
beforeEach(() => {
  localStorage.clear();
  reload = vi.fn();
  vi.stubGlobal('location', { ...window.location, reload });
});
afterEach(() => vi.unstubAllGlobals());

const resetBtn = (qa) => qa('button').find((b) => b.textContent.trim() === 'Reset all data');

it('the button is off until the text is exactly RESET (case-sensitive), and a wrong text shows the error line', () => {
  const { q, qa, done } = setup(DangerZone);
  const input = q('input');
  expect(resetBtn(qa).disabled).toBe(true);
  expect(q('[role="alert"]')).toBeNull();
  type(input, 'reset');
  expect(resetBtn(qa).disabled).toBe(true);
  expect(q('[role="alert"]').textContent).toBe('Type RESET exactly, in capitals');
  type(input, 'RESET');
  expect(resetBtn(qa).disabled).toBe(false);
  expect(q('[role="alert"]')).toBeNull();
  done();
});

it('RESET plus Enter wipes the v2 key, the v1 key and the legacy settings key, then reloads', () => {
  for (const k of [KEY, KEY_V1, 'eldaryn_optimiser_settings_v1']) localStorage.setItem(k, '{"probe":true}');
  localStorage.setItem('eldaryn_ui_v1', '{"v":1}');
  const { q, qa, done } = setup(DangerZone);
  const input = q('input');
  type(input, 'RESET');
  key(input, 'Enter');
  for (const k of [KEY, KEY_V1, 'eldaryn_optimiser_settings_v1']) expect(localStorage.getItem(k)).toBeNull();
  expect(reload).toHaveBeenCalled();
  done();
});

it('Enter with the wrong text clears nothing', () => {
  localStorage.setItem(KEY_V1, '{"probe":true}');
  const { q, qa, done } = setup(DangerZone);
  type(q('input'), 'not it');
  key(q('input'), 'Enter');
  expect(localStorage.getItem(KEY_V1)).not.toBeNull();
  expect(reload).not.toHaveBeenCalled();
  done();
});

it('lists what is wiped and offers Export first', () => {
  const { q, qa, done } = setup(DangerZone);
  expect(q('ul').textContent).toMatch(/every character/);
  expect(q('ul').textContent).toMatch(/version 1 backup/);
  expect(qa('button').some((b) => b.textContent.trim() === 'Export first')).toBe(true);
  done();
});

it('clicking the enabled button resets', () => {
  localStorage.setItem(KEY, '{}');
  const { q, qa, done } = setup(DangerZone);
  type(q('input'), 'RESET');
  click(resetBtn(qa));
  expect(localStorage.getItem(KEY)).toBeNull();
  done();
});
