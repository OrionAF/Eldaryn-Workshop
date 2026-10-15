import { it, expect, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import profile from '../../lib/__fixtures__/real/profile-warrior-l72.json';
import { setup, click } from '../ui/testkit.js';
import ImportDialog from './ImportDialog.svelte';
import { loadImportText, resetImportFlow, importFlow } from '../../lib/importFlow.svelte.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { newRoster } from '../../lib/model/index.js';

const text = (v) => JSON.stringify(v);
const button = (qa, label) => qa('button').find((b) => b.textContent.trim() === label);

beforeEach(() => {
  localStorage.clear();
  resetImportFlow();
  rosterStore.roster.characters.splice(0);
  rosterStore.addCharacter('Aria', 'WARRIOR');
});

it('a profile whose name matches offers "Update <name>" first, with the diff and what is kept', () => {
  loadImportText(text(profile));
  const name = importFlow.plan.character.name;
  rosterStore.renameCharacter(rosterStore.current.id, name);
  resetImportFlow();
  const { q, qa, done } = setup(ImportDialog);
  loadImportText(text(profile));
  flushAll();
  expect(button(qa, `Update ${name}`)).toBeTruthy();
  expect(qa('[role="radio"],[role="tab"],button').some((b) => b.textContent.trim() === 'Add as a new character')).toBe(true);
  expect(q('.report').textContent).toContain('What will change');
  expect(q('.report').textContent).toContain('presets made in the app, saved opponents and run history are kept');
  done();
});

it('a backup over existing characters asks "Replace all characters?" with counts and the backup option', () => {
  const backup = newRoster();
  const { q, qa, done } = setup(ImportDialog);
  loadImportText(text(backup));
  flushAll();
  expect(q('.report').textContent).toContain('Replace all characters?');
  expect(q('.report').textContent).toMatch(/replaces your 1 character and 2 presets/);
  expect(q('.report input[type="checkbox"]').checked).toBe(true);
  expect(button(qa, 'Replace all characters')).toBeTruthy();
  click(button(qa, 'Cancel'));
  expect(importFlow.open).toBe(false);
  done();
});

it('an unrecognised text keeps the dialog closed and the reason on the flow (shown by Settings > Import)', () => {
  const { q, done } = setup(ImportDialog);
  loadImportText('[1,2]');
  flushAll();
  expect(importFlow.error).toContain('Valid JSON, but not a roster backup');
  expect(q('dialog[open]')).toBeNull();
  expect(q('.report')).toBeNull();
  expect(q('input[type="file"]')).toBeNull(); // no file / paste step inside the dialog any more
  done();
});

const flushAll = () => flushSync();
