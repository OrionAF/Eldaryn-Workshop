import { it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import TargetPicker from './TargetPicker.svelte';
import { setup } from '../ui/testkit.js';

let mounted;
afterEach(() => mounted?.done());

/** Mount with accessor props so the test sees what the component writes back (a stand-in for bind:). */
function mountPicker(initial = {}, extra = {}) {
  const state = { target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, ...initial };
  mounted = setup(TargetPicker, {
    get target() { return state.target; },
    set target(v) { state.target = v; },
    get objective() { return state.objective; },
    set objective(v) { state.objective = v; },
    ...extra,
  });
  return { state, ui: mounted };
}

const pick = (ui, label, value) => {
  const sel = [...ui.target.querySelectorAll('.field')].find((f) => f.querySelector('label')?.textContent.trim() === label)?.querySelector('select');
  sel.value = value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};
const optionsOf = (ui, label) =>
  [...[...ui.target.querySelectorAll('.field')].find((f) => f.querySelector('label')?.textContent.trim() === label).querySelectorAll('option')].map((o) => o.textContent);

it('lists the target kinds, with Oblivion only when unlocked and PVP disabled without opponents', () => {
  const { ui } = mountPicker();
  const kinds = [...ui.target.querySelectorAll('option')].map((o) => [o.value, o.disabled]);
  expect(kinds.map(([v]) => v)).toEqual(['dummy', 'chapter', 'dungeon', 'raid', 'worldBoss', 'fortressBoss', 'custom', 'pvp']);
  expect(kinds.find(([v]) => v === 'pvp')[1]).toBe(true);
  expect(ui.q('[data-testid="pvp-hint"]').textContent).toMatch(/saved opponent/);
});

it('the dungeon list has every classic dungeon and its hard version', () => {
  const { ui } = mountPicker({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-rate' } });
  const names = optionsOf(ui, 'Dungeon');
  expect(names).toHaveLength(14);
  expect(names[0]).toBe('Forsaken Mines');
  expect(names[7]).toBe('Hard: Forsaken Mines');
});

it('choosing a hard dungeon writes the _hard id', () => {
  const { ui, state } = mountPicker({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-rate' } });
  pick(ui, 'Dungeon', 'dungeon_3_hard');
  expect(state.target).toEqual({ kind: 'dungeon', id: 'dungeon_3_hard', step: 1 });
});

it('a server-run fight is labelled as a model with its assumptions tagged, never as exact', () => {
  const { ui } = mountPicker({ target: { kind: 'raid', id: 'raid_1', step: 1 }, objective: { kind: 'win-rate' } });
  const box = ui.q('[data-testid="fidelity"]');
  expect(box.dataset.fidelity).toBe('server-model');
  expect(box.textContent).toMatch(/server runs this fight/i);
  expect(box.textContent).toMatch(/UNRESOLVED/);
});

it('a client-rules fight says so and carries no server assumption', () => {
  const { ui } = mountPicker({ target: { kind: 'chapter', chapter: 3, level: 2 }, objective: { kind: 'win-rate' } });
  expect(ui.q('[data-testid="fidelity"]').dataset.fidelity).toBe('client');
  expect(ui.q('[data-testid="chapter-name"]').textContent).not.toBe('');
});

it('the raid list names the five raids and flags the level a raid needs', () => {
  const { ui } = mountPicker({ target: { kind: 'raid', id: 'raid_1', step: 1 }, objective: { kind: 'win-rate' } }, { playerLevel: 1 });
  const names = optionsOf(ui, 'Village raid');
  expect(names).toHaveLength(5);
  expect(names[0]).toBe('Bandit Village (needs level 10)');
  expect(names.every((n) => /needs level/.test(n))).toBe(true);
  expect(optionsOf(mountPicker({ target: { kind: 'raid', id: 'raid_1', step: 1 }, objective: { kind: 'win-rate' } }, { playerLevel: 99 }).ui, 'Village raid')[0]).toBe('Bandit Village');
});

it('switching the fight moves an objective it cannot score to one it can', () => {
  const { ui, state } = mountPicker();
  pick(ui, 'Fight', 'chapter');
  expect(state.target).toEqual({ kind: 'chapter', chapter: 1, level: 1 });
  expect(state.objective.kind).toBe('win-rate');
});

it('Oblivion offers the instability output cut as an off-by-default assumption', () => {
  const { ui, state } = mountPicker({ target: { kind: 'oblivion', floor: 3 }, objective: { kind: 'win-rate' } }, { oblivionUnlocked: true });
  const box = ui.q('input[type="checkbox"]');
  expect(box.checked).toBe(false);
  box.click();
  flushSync();
  expect(state.target).toEqual({ kind: 'oblivion', floor: 3, applyOutputCut: true });
});

it('the PVP branch picks opponents and a seat', () => {
  const opponents = [{ id: 'o1', name: 'Tanky', class: 'WARRIOR' }, { id: 'o2', name: 'Glass', class: 'MAGE' }];
  const { ui, state } = mountPicker({ target: { kind: 'pvp', opponentIds: ['o1'], seats: 'attacker' }, objective: { kind: 'pvp-winrate' } }, { opponents });
  const chips = [...ui.qa('[data-testid="pvp-opponents"] button')];
  expect(chips.map((c) => c.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
  chips[1].click();
  flushSync();
  expect(state.target.opponentIds).toEqual(['o1', 'o2']);
  const both = [...ui.qa('[data-testid="pvp-seats"] button')].find((b) => b.textContent.trim() === 'Both');
  both.click();
  flushSync();
  expect(state.target.seats).toBe('both');
});

const numberField = (ui, label) => [...ui.target.querySelectorAll('.field')].find((f) => f.querySelector('label')?.textContent.trim() === label)?.querySelector('input');
const setNumber = (input, v) => {
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur'));
  flushSync();
};

it('the Fortress boss fields show the shield, drop Stars for the Core and restore them for the Top', () => {
  // The accessor props are not reactive, so each step remounts with what the previous step wrote.
  const first = mountPicker();
  pick(first.ui, 'Fight', 'fortressBoss');
  expect(first.state.target).toMatchObject({ kind: 'fortressBoss', group: 'TOP', stars: 1 });
  expect(first.state.objective.kind).toBe('dps');

  const top = mountPicker({ target: { ...first.state.target, aliveDefenders: 25, maxClanSize: 50 } });
  expect(numberField(top.ui, 'Stars')).toBeTruthy();
  expect(numberField(top.ui, 'Alive defenders').value).toMatch(/25/);
  expect(top.ui.q('[data-testid="fortress-shield"]').textContent).toMatch(/shield 30%/);
  expect(top.ui.q('[data-testid="fidelity"]').dataset.fidelity).toBe('server-model');
  setNumber(numberField(top.ui, 'Alive defenders'), 50);
  expect(top.state.target.aliveDefenders).toBe(50);
  pick(top.ui, 'Fortress', 'CORE');
  expect(top.state.target.group).toBe('CORE');
  expect('stars' in top.state.target).toBe(false);

  const core = mountPicker({ target: top.state.target });
  expect(numberField(core.ui, 'Stars')).toBeFalsy();
  expect(core.ui.q('[data-testid="fortress-shield"]')).toBeTruthy();
  pick(core.ui, 'Fortress', 'TOP');
  expect(core.state.target.stars).toBe(1);
  expect(numberField(mountPicker({ target: core.state.target }).ui, 'Stars')).toBeTruthy();
});
