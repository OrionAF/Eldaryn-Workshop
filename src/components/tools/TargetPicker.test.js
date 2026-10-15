import { it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import TargetPicker from './TargetPicker.svelte';
import { setup } from '../ui/testkit.js';
import sentinelProfile from '../../lib/__fixtures__/real/profile-sentinel-l85-oct15b.json';
import warriorProfile from '../../lib/__fixtures__/real/profile-warrior-l73.json';
import { normaliseCharacter } from '../../lib/model/index.js';
import { gameProfileToCharacter } from '../../lib/model/gameProfile.js';
import { cloneAsOpponent } from '../../lib/features/duel.js';
import { celestialMaxHoldCount } from '../../lib/engine/pve/celestial.js';

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
  expect(kinds.map(([v]) => v)).toEqual(['dummy', 'chapter', 'dungeon', 'raid', 'worldBoss', 'fortressBoss', 'custom', 'celestial', 'pvp']);
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
  expect(state.objective.kind).toBe('win-chance');
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

  const top = mountPicker({ target: { ...first.state.target, aliveDefenders: 25, server: null } });
  expect(numberField(top.ui, 'Stars')).toBeTruthy();
  expect(numberField(top.ui, 'Alive defenders').value).toMatch(/25/);
  expect(top.ui.q('[data-testid="fortress-shield"]').textContent).toMatch(/shield 30% \(25 alive of a 50 cap\)/);
  expect(top.ui.q('[data-testid="clan-cap"]').textContent).toMatch(/cap 50/);
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

it('the Fortress boss shield follows the server cap, or a typed shield percent', () => {
  const server5 = mountPicker({ target: { kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 26, server: 5, kills: 0 } });
  expect(numberField(server5.ui, 'Server').value).toMatch(/5/);
  expect(server5.ui.q('[data-testid="clan-cap"]').textContent).toMatch(/cap 30/);
  expect(server5.ui.q('[data-testid="fortress-shield"]').textContent).toMatch(/Boss shield 53\.3% \(26 alive of a 30 cap\)/);
  setNumber(numberField(server5.ui, 'Server'), 7);
  expect(server5.state.target.server).toBe(7);

  const typed = mountPicker({ target: { kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 26, server: 5, shieldPercent: 45, kills: 0 } });
  expect(numberField(typed.ui, 'Alive defenders')).toBeFalsy();
  expect(typed.ui.q('[data-testid="fortress-shield"]').textContent).toMatch(/Boss shield 45%\./);
  setNumber(numberField(typed.ui, 'Boss shield'), 50);
  expect(typed.state.target.shieldPercent).toBe(50);
});

it('a legacy maxClanSize spec shows its real cap and editing Server drops it so the server decides', () => {
  const legacy = mountPicker({ target: { kind: 'fortressBoss', group: 'TOP', stars: 5, aliveDefenders: 26, maxClanSize: 50, server: 5, kills: 0 } });
  expect(legacy.ui.q('[data-testid="clan-cap"]').textContent).toMatch(/cap 50/);
  expect(legacy.ui.q('[data-testid="fortress-shield"]').textContent).toMatch(/26 alive of a 50 cap/);
  setNumber(numberField(legacy.ui, 'Server'), 5);
  expect('maxClanSize' in legacy.state.target).toBe(false);
  const after = mountPicker({ target: legacy.state.target });
  expect(after.ui.q('[data-testid="clan-cap"]').textContent).toMatch(/cap 30/);
  expect(after.ui.q('[data-testid="fortress-shield"]').textContent).toMatch(/26 alive of a 30 cap/);
});

it('a new Fortress boss target starts on the character\'s server', () => {
  const m = mountPicker({}, { character: { server: 5 } });
  pick(m.ui, 'Fight', 'fortressBoss');
  expect(m.state.target.server).toBe(5);
});

// ---- Celestial Trial ----
const NOW = '2026-10-15T00:00:00.000Z';
const sentinelChar = normaliseCharacter(gameProfileToCharacter(sentinelProfile, { now: NOW }));
const warriorChar = normaliseCharacter(gameProfileToCharacter(warriorProfile, { now: NOW }));
const tankPreset = warriorChar.presets.find((p) => p.name === 'TANK');
const tinCan = { ...cloneAsOpponent(warriorChar, tankPreset.id, 'WARRIOR_TANK', 'Tin Can'), id: 'opp-tin' };
const celestialProps = { character: { ...sentinelChar, opponents: [tinCan] }, characters: [warriorChar], opponents: [tinCan] };
const segButton = (ui, testid, label) => [...ui.qa(`[data-testid="${testid}"] button`)].find((b) => b.textContent.trim() === label);

// The accessor props are not reactive, so each step remounts with what the previous step wrote.
const remount = (state) => mountPicker({ target: state.target, objective: state.objective }, celestialProps);
const celestialSolo = { kind: 'celestial', difficulty: 'HARD', partner: null, tank: 'auto', starter: 'me', tactics: { focus: 'HOLD', holdCount: 3 } };

it('choosing the Celestial Trial starts solo on HARD with the catalogue tactics and the highest-chance goal', () => {
  const first = mountPicker({}, celestialProps);
  pick(first.ui, 'Fight', 'celestial');
  expect(first.state.target).toEqual(celestialSolo);
  expect(first.state.objective).toEqual({ kind: 'win-chance' });
  const { ui } = remount(first.state);
  expect(ui.q('[data-testid="celestial-level"]').textContent).toMatch(/Default: level 85/);
  expect(segButton(ui, 'celestial-tank', 'Partner').disabled).toBe(true);
  expect(segButton(ui, 'celestial-starter', 'Partner').disabled).toBe(true);
  expect(ui.q('[data-testid="fidelity"]').dataset.fidelity).toBe('server-model');
  expect(ui.q('[data-testid="fidelity"]').textContent).toMatch(/Solo: a party of one/);
});

it('the Celestial partner picker offers my other characters (then a preset) and my opponents', () => {
  const solo = mountPicker({ target: celestialSolo, objective: { kind: 'win-chance' } }, celestialProps);
  expect(optionsOf(solo.ui, 'Partner')).toEqual(['None (solo)', `${warriorChar.name} (level 73)`, 'Opponent: Tin Can (Warrior)']);
  pick(solo.ui, 'Partner', `character:${warriorChar.id}`);
  expect(solo.state.target.partner).toEqual({ source: 'character', characterId: warriorChar.id, presetId: warriorChar.activePresetId });

  const withChar = remount(solo.state);
  expect(optionsOf(withChar.ui, 'Partner preset')).toEqual(warriorChar.presets.map((p) => p.name));
  pick(withChar.ui, 'Partner preset', tankPreset.id);
  expect(withChar.state.target.partner.presetId).toBe(tankPreset.id);

  const seats = remount(withChar.state);
  expect(seats.ui.q('[data-testid="fidelity"]').textContent).toMatch(/from the roster/);
  segButton(seats.ui, 'celestial-tank', 'Partner').click();
  flushSync();
  expect(seats.state.target.tank).toBe('partner');
  const starter = remount(seats.state);
  segButton(starter.ui, 'celestial-starter', 'Partner').click();
  flushSync();
  expect(starter.state.target).toMatchObject({ tank: 'partner', starter: 'partner' });

  // an opponent partner; back to solo drops the partner seats
  const opp = remount(starter.state);
  pick(opp.ui, 'Partner', 'opponent:opp-tin');
  expect(opp.state.target.partner).toEqual({ source: 'opponent', opponentId: 'opp-tin' });
  const oppShown = remount(opp.state);
  expect(oppShown.ui.q('[data-testid="fidelity"]').textContent).toMatch(/typed sheet is taken as given/);
  pick(oppShown.ui, 'Partner', '');
  expect(oppShown.state.target).toMatchObject({ partner: null, tank: 'auto', starter: 'me' });
});

it('the Celestial difficulty, focus and hold count edit the tactics within the catalogue range', () => {
  const hard = mountPicker({ target: { ...celestialSolo, tactics: { focus: 'HOLD', holdCount: celestialMaxHoldCount('HARD') } }, objective: { kind: 'win-chance' } }, celestialProps);
  expect(numberField(hard.ui, 'Hold count')).toBeTruthy();
  segButton(hard.ui, 'celestial-difficulty', 'Normal').click();
  flushSync();
  expect(hard.state.target.difficulty).toBe('NORMAL');
  expect(hard.state.target.tactics.holdCount).toBeLessThanOrEqual(celestialMaxHoldCount('NORMAL'));
  const normal = remount(hard.state);
  setNumber(numberField(normal.ui, 'Hold count'), 1);
  expect(normal.state.target.tactics).toEqual({ focus: 'HOLD', holdCount: 1 });
  pick(normal.ui, 'Focus', 'BOSS');
  expect(normal.state.target.tactics.focus).toBe('BOSS');
  expect(numberField(remount(normal.state).ui, 'Hold count')).toBeFalsy();
  // a typed level replaces the default
  const lv = remount(normal.state);
  setNumber(numberField(lv.ui, 'Level'), 95);
  expect(lv.state.target.level).toBe(95);
  expect(remount(lv.state).ui.q('[data-testid="celestial-level"]').textContent).toMatch(/Scaling level 95/);
});

it('a Celestial partner that is gone shows why the fight cannot run, without throwing', () => {
  const { ui } = mountPicker({ target: { ...celestialSolo, partner: { source: 'character', characterId: 'gone', presetId: 'x' } }, objective: { kind: 'win-chance' } }, celestialProps);
  expect(ui.q('[data-testid="celestial-error"]').textContent).toMatch(/missing/);
  expect(ui.q('[data-testid="fidelity"]')).toBeNull();
});
