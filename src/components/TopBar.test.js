/**
 * jsdom component test for TopBar.svelte (build step 3). Mounts the real
 * component and drives it via DOM events - no Playwright needed for
 * interaction/logic correctness (see rosterStore.test.js for the same
 * approach at the store layer).
 */
import { it, expect, beforeEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TopBar from './TopBar.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target;
let app;

beforeEach(() => {
  localStorage.clear();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(TopBar, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

it('renders the current character in the select', () => {
  const select = target.querySelector('select');
  expect(select.value).toBe(rosterStore.current.id);
  expect(select.querySelector(`option[value="${rosterStore.current.id}"]`).textContent).toBe(rosterStore.current.name);
  cleanup();
});

it('choosing "+ New Character" opens the inline panel and creates on confirm', () => {
  const select = target.querySelector('select');
  select.value = '__new__';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();

  const panel = target.querySelector('[aria-label="New character"]');
  expect(panel).not.toBeNull();

  const input = panel.querySelector('input');
  input.value = 'Fresh Hero';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();

  const startCount = rosterStore.roster.characters.length;
  panel.querySelector('button').click(); // "Create"
  flushSync();

  expect(rosterStore.roster.characters.length).toBe(startCount + 1);
  expect(rosterStore.current.name).toBe('Fresh Hero');
  expect(target.querySelector('[aria-label="New character"]')).toBeNull();
  cleanup();
});

it('rename via the edit icon updates the select option text', () => {
  target.querySelector('[aria-label="Rename or delete character"]').click();
  flushSync();

  const panel = target.querySelector('[aria-label="Edit character"]');
  const input = panel.querySelector('input');
  input.value = 'Renamed';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  panel.querySelector('button').click(); // "Rename"
  flushSync();

  expect(rosterStore.current.name).toBe('Renamed');
  const select = target.querySelector('select');
  expect(select.querySelector(`option[value="${rosterStore.current.id}"]`).textContent).toBe('Renamed');
  cleanup();
});

it('delete is disabled for the last character, and requires a confirm step otherwise', () => {
  // rosterStore is a shared singleton across tests in this file (matches
  // production - one roster per session), so drain to exactly one character
  // via the store directly rather than assuming a fresh count at test start.
  while (rosterStore.roster.characters.length > 1) {
    rosterStore.deleteCharacter(rosterStore.roster.characters[0].id);
  }
  flushSync();

  target.querySelector('[aria-label="Rename or delete character"]').click();
  flushSync();
  let panel = target.querySelector('[aria-label="Edit character"]');
  const buttons = [...panel.querySelectorAll('button')];
  const deleteBtn = buttons.find((b) => b.textContent === 'Delete');
  expect(deleteBtn.disabled).toBe(true);

  // Add a second character so delete becomes available, then confirm the two-step flow.
  rosterStore.addCharacter('Second');
  flushSync();
  panel = target.querySelector('[aria-label="Edit character"]');
  const deleteBtn2 = [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Delete');
  expect(deleteBtn2.disabled).toBe(false);
  deleteBtn2.click();
  flushSync();

  panel = target.querySelector('[aria-label="Edit character"]');
  expect(panel.textContent).toContain('Delete "Second"?');
  const confirmBtn = [...panel.querySelectorAll('button')].find((b) => b.textContent === 'Confirm delete');
  const before = rosterStore.roster.characters.length;
  confirmBtn.click();
  flushSync();

  expect(rosterStore.roster.characters.length).toBe(before - 1);
  cleanup();
});

it('export click calls downloadRoster (via URL.createObjectURL)', () => {
  // jsdom doesn't implement createObjectURL/revokeObjectURL at all, so they
  // must be assigned (not spyOn'd - there's nothing existing to wrap).
  const created = vi.fn(() => 'blob:mock');
  const revoked = vi.fn();
  const hadCreate = 'createObjectURL' in URL;
  const hadRevoke = 'revokeObjectURL' in URL;
  URL.createObjectURL = created;
  URL.revokeObjectURL = revoked;

  // jsdom logs "Not implemented: navigation" when a detached <a href="blob:...">
  // is .click()'d (downloadRoster's real, correct download pattern) - stub
  // navigation away for this test only, it's not what's under test here.
  const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  const buttons = [...target.querySelectorAll('.top-bar-actions button')];
  buttons.find((b) => b.textContent === 'Export').click();
  flushSync();
  expect(created).toHaveBeenCalled();
  expect(anchorClickSpy).toHaveBeenCalled();

  anchorClickSpy.mockRestore();
  if (!hadCreate) delete URL.createObjectURL;
  if (!hadRevoke) delete URL.revokeObjectURL;
  cleanup();
});

it('importing malformed JSON shows an inline error without crashing', async () => {
  const fileInput = target.querySelector('input[type="file"]');
  const badFile = new File(['not json'], 'roster.json', { type: 'application/json' });
  Object.defineProperty(fileInput, 'files', { value: [badFile], configurable: true });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => {
    flushSync();
    expect(target.querySelector('.import-error')).not.toBeNull();
  });
  expect(target.querySelector('.import-error').textContent).toContain('Import failed');
  cleanup();
});

it('importing valid roster JSON replaces the roster and clears any error', async () => {
  const validRoster = JSON.stringify({
    characters: [{ id: 'imported-1', name: 'Imported Hero', loadouts: [{ name: 'Loadout 1' }, { name: 'Loadout 2' }], sources: {} }],
    currentId: 'imported-1',
    drop: null,
  });
  const goodFile = new File([validRoster], 'roster.json', { type: 'application/json' });
  const fileInput = target.querySelector('input[type="file"]');
  Object.defineProperty(fileInput, 'files', { value: [goodFile], configurable: true });
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  await vi.waitFor(() => {
    flushSync();
    expect(rosterStore.current.name).toBe('Imported Hero');
  });
  expect(target.querySelector('.import-error')).toBeNull();
  cleanup();
});
