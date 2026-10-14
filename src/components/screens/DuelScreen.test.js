import { it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import DuelScreen from './DuelScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

let target, app;
function open(props = {}) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(DuelScreen, { target, props });
  flushSync();
}
beforeEach(() => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Duelist', 'WARRIOR');
  for (const c of [...rosterStore.roster.characters]) if (c.id !== id) rosterStore.deleteCharacter(c.id);
});
afterEach(() => {
  unmount(app);
  target.remove();
});

const btn = (label) => [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
const click = (el) => {
  el.click();
  flushSync();
};
const q = (sel) => target.querySelector(sel);

it('without an opponent it asks for one and cannot run', () => {
  open();
  expect(q('[data-testid="duel-setup"]').textContent).toContain('Pick or add an opponent.');
  expect(btn('Run 400 duels').disabled).toBe(true);
  expect(q('[data-testid="opponent-editor"]')).toBeNull();
});

it('a new opponent has no stats yet: the editor opens and the run stays blocked until HP and Attack are entered', () => {
  open();
  click(btn('+ New opponent'));
  expect(rosterStore.current.opponents).toHaveLength(1);
  expect(q('[data-testid="opponent-editor"]')).not.toBeNull();
  expect(q('[data-testid="duel-setup"]').textContent).toMatch(/has no HP/);
  expect(btn('Run 400 duels').disabled).toBe(true);

  rosterStore.setOpponentSheet(rosterStore.current.opponents[0].id, { totalHp: 800, totalAttack: 30 });
  flushSync();
  expect(btn('Run 400 duels').disabled).toBe(false);
});

it('runs a duel: win rate with an interval and N, a traced timeline, and swapping sides re-runs from the other seat', async () => {
  const id = rosterStore.addOpponent('WARRIOR_TANK', 'Dummy');
  rosterStore.setOpponentSheet(id, { totalHp: 500, totalAttack: 1, totalAttackSpeed: 1 });
  open();
  expect(q('[data-testid="seat"]').textContent).toContain('attacker');

  click(btn('Run 400 duels'));
  await vi.waitFor(() => expect(q('[data-testid="duel-result"]')).not.toBeNull(), { timeout: 20000 });
  expect(q('[data-testid="win-ci"]').textContent).toMatch(/N=400/);
  expect(q('[data-testid="win-rate"]').textContent).toMatch(/%$/);
  expect(q('[data-testid="duel-timeline"]')).not.toBeNull();
  expect(q('[data-testid="trace-stats"]')).not.toBeNull();
  expect(q('[data-testid="duel-timeline"]').textContent).toContain('Top: ' + rosterStore.current.presets[0].name);

  click(btn('Swap sides'));
  expect(q('[data-testid="seat"]').textContent).toContain('defender');
  await vi.waitFor(() => expect(q('[data-testid="duel-timeline"]').textContent).toContain('Top: Dummy'), { timeout: 20000 });
}, 60000);

it('the replay check reports invalid JSON without throwing', () => {
  open();
  const ta = q('textarea[aria-label="Fight log JSON"]');
  ta.value = '{nope';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(btn('Check log'));
  expect(q('[role="alert"]').textContent).toMatch(/not valid JSON/);
});

it('the opponent editor edits spec, sigils (with level and condition) and keeps the store normalised', () => {
  const id = rosterStore.addOpponent('WARRIOR_DPS', 'Rival');
  open();
  const chip = (label) => [...target.querySelectorAll('.chip')].find((b) => b.textContent.trim() === label);
  const opp = () => rosterStore.current.opponents.find((o) => o.id === id);

  click(chip('Berserk Stance'));
  expect(opp().sigils).toEqual([{ species: 'BERSERK_STANCE', level: 1 }]);
  const lvl = q('input[aria-label="Berserk Stance level"]');
  lvl.value = '17';
  lvl.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
  expect(opp().sigils[0].level).toBe(17);

  click(chip('Mystic · Mage'));
  expect(opp()).toMatchObject({ class: 'MYSTIC', spec: 'MYSTIC_MAGE', sigils: [] });
});
