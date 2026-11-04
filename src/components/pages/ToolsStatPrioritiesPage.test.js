import { it, expect, describe, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import ToolsStatPrioritiesPage from './ToolsStatPrioritiesPage.svelte';
import data from '../../data/statPriority.json';
import { presetBrackets } from '../../lib/features/statPriority.js';
import { loadUi } from '../../lib/uiState.js';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { saveUi } from '../../lib/uiState.js';
import { setup, click } from '../ui/testkit.js';

let view;
beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    /* ignore */
  }
  view = setup(ToolsStatPrioritiesPage);
  // the data file loads with a dynamic import
  for (let i = 0; i < 100 && !view.q('[data-testid="priority-card"]'); i++) {
    await new Promise((r) => setTimeout(r, 10));
    flushSync();
  }
});
afterEach(() => view.done());

function enterRange(text) {
  const input = view.q('input[placeholder="74 or 60-64"]');
  input.value = text;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
}

it('opens on the first spec at its top bracket, with the card as text', () => {
  const top = presetBrackets(data, data.specs[0].spec).at(-1);
  expect(view.q('[aria-pressed="true"].spec').textContent).toContain(data.specs[0].specName);
  expect(view.q('[data-testid="priority-card"]')).not.toBeNull();
  expect(view.q('[data-testid="block-text"]').textContent.split('\n')[0]).toBe(top.priorityLine);
});

it('scores a typed level range like a bracket and remembers it', () => {
  const spec = data.specs[0].spec;
  const preset = presetBrackets(data, spec)[2];
  enterRange(preset.key.replace('-', ' to '));
  expect(view.q('[data-testid="block-text"]').textContent.split('\n')[0]).toBe(preset.priorityLine);
  expect(view.q('[data-testid="priority-card"]').textContent).not.toContain('Custom range');

  enterRange('74');
  expect(view.q('[data-testid="priority-card"]').textContent).toContain('Custom range');
  expect(view.qa('.hm thead button').map((b) => b.textContent)).toContain('74');
  expect(loadUi().statPriority).toEqual({ spec, range: '74' });
});

it('marks a range it cannot read and keeps the current one', () => {
  const before = view.q('[data-testid="block-text"]').textContent;
  enterRange('level seventy');
  expect(view.q('input[placeholder="74 or 60-64"]').getAttribute('aria-invalid')).toBe('true');
  expect(view.q('[data-testid="block-text"]').textContent).toBe(before);
});

it('switching spec keeps a custom range and falls back from a missing bracket', () => {
  const [a, b] = data.specs;
  enterRange('74');
  click(view.qa('button.spec').find((x) => x.textContent.includes(b.specName)));
  expect(loadUi().statPriority).toEqual({ spec: b.spec, range: '74' });

  const missing = data.brackets.map(([lo, hi]) => `${lo}-${hi}`).find((k) => !presetBrackets(data, b.spec).some((p) => p.key === k)
    && presetBrackets(data, a.spec).some((p) => p.key === k));
  if (!missing) return; // every bracket shared: nothing to fall back from
  click(view.qa('button.spec').find((x) => x.textContent.includes(a.specName)));
  click(view.qa('.chip').find((x) => x.textContent.includes(missing)));
  click(view.qa('button.spec').find((x) => x.textContent.includes(b.specName)));
  expect(loadUi().statPriority.range).toBe(presetBrackets(data, b.spec).at(-1).key);
});

describe('opening on the character', () => {
  const withChar = (cls, level) => {
    const c = fixtureCharacter(cls);
    c.level = level;
    rosterStore.roster.characters.splice(0, rosterStore.roster.characters.length, c);
    rosterStore.roster.currentId = c.id;
  };
  const reopen = async () => {
    view.done();
    view = setup(ToolsStatPrioritiesPage);
    for (let i = 0; i < 100 && !view.q('[data-testid="priority-card"]'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      flushSync();
    }
  };
  afterEach(() => rosterStore.roster.characters.splice(0, rosterStore.roster.characters.length));

  it('opens on the class spec and level bracket, without saving', async () => {
    withChar('MYSTIC', 62);
    await reopen();
    expect(view.q('[aria-pressed="true"].spec').textContent).toContain('Mage');
    expect(view.q('[data-testid="opened-hint"]').textContent).toContain('Mystic, level 62');
    expect(view.q('[data-testid="block-text"]').textContent.split('\n')[0]).toBe(presetBrackets(data, 'MYSTIC_MAGE').find((b) => b.key === '60-69').priorityLine);
    expect(loadUi().statPriority).toEqual({ spec: null, range: null });
  });

  it('keeps a saved choice', async () => {
    withChar('MYSTIC', 62);
    saveUi({ statPriority: { spec: data.specs[0].spec, range: null } });
    await reopen();
    expect(view.q('[aria-pressed="true"].spec').textContent).toContain(data.specs[0].specName);
    expect(view.q('[data-testid="opened-hint"]')).toBeNull();
  });

  it('shows no hint with an empty roster', async () => {
    rosterStore.roster.characters.splice(0, rosterStore.roster.characters.length);
    rosterStore.roster.currentId = null;
    await reopen();
    expect(view.q('[aria-pressed="true"].spec').textContent).toContain(data.specs[0].specName);
    expect(view.q('[data-testid="opened-hint"]')).toBeNull();
  });
});
