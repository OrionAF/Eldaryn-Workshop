import { it, expect, afterEach } from 'vitest';
import BoardGrid from './BoardGrid.svelte';
import { setup } from '../ui/testkit.js';
import { transcendenceBoard } from '../../lib/game/transcendence.js';
import { boardGraph, allocCost } from '../../lib/transcendence.js';

let mounted;
afterEach(() => {
  mounted?.done();
  mounted = null;
});

const board = transcendenceBoard('WARRIOR');
const g = boardGraph('WARRIOR');
// Two nodes in a line from the core.
const first = g.neighbors.get('core').find((id) => g.byId.get(id).kind === 'minor');
const second = g.neighbors.get(first).find((id) => id !== 'core' && g.byId.get(id).kind === 'minor');
const mount = (props) => (mounted = setup(BoardGrid, { boardKey: 'WARRIOR', nodes: board.nodes, ...props }));

it('draws the five tier bands with their labels and links adjacent allocated nodes, the core included', () => {
  const ui = mount({ allocatedIds: [first, second] });
  expect(ui.qa('.band')).toHaveLength(5);
  expect(ui.qa('.band-label').map((l) => l.textContent.replace(/\s+/g, ' ').trim())).toEqual(
    ['Tier 1 ASCENDANT', 'Tier 2 EXALTED', 'Tier 3 RADIANT', 'Tier 4 MYTHIC', 'Tier 5 TRANSCENDENT'],
  );
  expect(ui.qa('.edges line')).toHaveLength(2);
});

it('shows the Ichor cost on reachable nodes only, and none on a read-only board', () => {
  const ui = mount({ allocatedIds: [first] });
  const reachable = ui.qa('.tnode.unlockable');
  expect(reachable.length).toBeGreaterThan(0);
  expect(ui.qa('.tnode .cost')).toHaveLength(reachable.length);
  const node = ui.q(`.tnode.unlockable[aria-label*="${second.replace('n_', '')}"]`);
  expect(node.querySelector('.cost').textContent).toBe(String(allocCost('WARRIOR', [first], second)));
  expect(node.getAttribute('aria-label')).toMatch(/costs \d+ Ichor$/);
  mounted.done();
  const ro = mount({ allocatedIds: [first], readOnly: true, compact: true });
  expect(ro.qa('.tnode .cost')).toHaveLength(0);
  expect(ro.qa('.band-label')).toHaveLength(0);
});

it('marks sockets as coming soon', () => {
  const ui = mount({ allocatedIds: [] });
  expect(ui.qa('.tnode.socket .soon')).toHaveLength(board.nodes.filter((n) => n.kind === 'socket').length);
});
