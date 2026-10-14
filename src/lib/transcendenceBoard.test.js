import { describe, it, expect, beforeEach } from 'vitest';
import {
  boardKeyFor, boardGraph, isReachable, canAllocateNode, canRemoveNode, sanitiseAllocation, setTotalCost,
  allocCost, removeRefund, validateAllocation, transcendenceBonuses, sideProgress, slotPrice,
} from './transcendence.js';
import { TRANSCENDENCE_BOARD_KEYS, transcendenceBoard } from './game/transcendence.js';
import { normaliseCharacter, newCharacter, migrateCharacterFromV1, normaliseRoster } from './model/index.js';
import { migrateTranscendenceFromV1, normaliseTranscendence } from './model/transcendence.js';
import { TRANSCENDENCE_TREES } from './transcendenceData.js';
import { rosterStore } from './rosterStore.svelte.js';

const ALLOCATABLE = (b) => b.nodes.filter((n) => ['minor', 'notable', 'sigil'].includes(n.kind));

describe('board topology (doc §2, §7)', () => {
  it('every board has the same 279-cell geometry and a core linked only to 0,-1', () => {
    for (const key of TRANSCENDENCE_BOARD_KEYS) {
      const g = boardGraph(key);
      expect(g.byId.size, key).toBe(279);
      expect(g.neighbors.get('core')).toEqual(['n_0,-1']);
      const kinds = {};
      for (const n of g.byId.values()) kinds[n.kind] = (kinds[n.kind] ?? 0) + 1;
      expect(kinds).toEqual({ start: 1, minor: 255, notable: 14, socket: 7, sigil: 2 });
    }
  });
  it('links are symmetric and orthogonal only', () => {
    const g = boardGraph('WARRIOR');
    for (const [id, ns] of g.neighbors) {
      const a = g.byId.get(id);
      for (const n of ns) {
        const b = g.byId.get(n);
        expect(Math.abs(a.col - b.col) + Math.abs(a.row - b.row)).toBe(1);
        expect(g.neighbors.get(n)).toContain(id);
      }
    }
  });
  it('the whole allocatable board is connected through allocatable nodes (cost 13285)', () => {
    const b = transcendenceBoard('WARRIOR');
    const ids = ALLOCATABLE(b).map((n) => n.id);
    expect(sanitiseAllocation('WARRIOR', ids)).toHaveLength(271);
    // reachability-ordered build (BFS from the core) validates and reproduces the documented full cost
    const g = boardGraph('WARRIOR');
    const order = [];
    const seen = new Set(['core']);
    const queue = ['core'];
    while (queue.length) {
      for (const n of g.neighbors.get(queue.shift())) {
        const node = g.byId.get(n);
        if (seen.has(n) || node.kind === 'socket') continue;
        seen.add(n);
        order.push(n);
        queue.push(n);
      }
    }
    expect(order).toHaveLength(271);
    expect(validateAllocation('WARRIOR', order)).toBe(13285);
  });
  it('sockets never allocate and never carry a path', () => {
    expect(canAllocateNode('WARRIOR', ['n_0,-1'], 'soc_0,-14')).toBe(false);
    expect(sanitiseAllocation('WARRIOR', ['soc_0,-14'])).toEqual([]);
  });
});

describe('reachability, removal, cost', () => {
  it('first node must touch the core; chains extend', () => {
    expect(isReachable('WARRIOR', 'n_0,-1', [])).toBe(true);
    expect(isReachable('WARRIOR', 'n_-1,-2', [])).toBe(false);
    expect(canAllocateNode('WARRIOR', ['n_0,-1'], 'n_0,-2')).toBe(true);
  });
  it('removal that strands is refused', () => {
    const ids = ['n_0,-1', 'n_0,-2', 'n_-1,-2'];
    expect(canRemoveNode('WARRIOR', ids, 'n_0,-1')).toBe(false);
    expect(canRemoveNode('WARRIOR', ids, 'n_-1,-2')).toBe(true);
  });
  it('slot prices and order-independent totals (doc §6)', () => {
    expect([1, 4, 5, 9, 10, 207].map(slotPrice)).toEqual([1, 1, 2, 2, 3, 80]);
    const a = ['n_0,-1', 'n_0,-2', 'not_0,-3', 'n_-1,-2'];
    const b = ['n_0,-1', 'n_0,-2', 'n_-1,-2', 'not_0,-3'];
    // notable = 3 slots: after 3 commons (slots 1-3) its slots are 4+5+6 = 1+2+2
    expect(allocCost('WARRIOR', ['n_0,-1', 'n_0,-2', 'n_-1,-2'], 'not_0,-3')).toBe(5);
    expect(setTotalCost('WARRIOR', a)).toBe(setTotalCost('WARRIOR', b) );
    expect(removeRefund('WARRIOR', a, 'not_0,-3')).toBe(5);
  });
  it('a sigil is a flat 30 and does not advance the slot count', () => {
    expect(setTotalCost('WARRIOR', ['sig_13,-25'])).toBe(30);
  });
  it('bonuses sum node stats and ignore unknown ids (doc §8)', () => {
    const b = transcendenceBonuses('WARRIOR', ['n_0,-1', 'not_0,-3', 'bogus', 'core']);
    expect(b).toEqual({ hpPercent: 1, attackPercent: 1.6, attackSpeedFlat: 0.02 });
  });
  it('Warrior full-board ceilings match the doc', () => {
    const b = transcendenceBonuses('WARRIOR', ALLOCATABLE(transcendenceBoard('WARRIOR')).map((n) => n.id));
    expect(b.hpPercent).toBeCloseTo(44);
    expect(b.attackPercent).toBeCloseTo(25.6);
    expect(sideProgress('WARRIOR', 'attack', []).total + sideProgress('WARRIOR', 'defense', []).total).toBe(271);
  });
  it('boardKeyFor maps specs and falls back to the class default', () => {
    expect(boardKeyFor('MYSTIC', 'MYSTIC_DRUID')).toBe('MYSTIC/DRUID');
    expect(boardKeyFor('MYSTIC', null)).toBe('MYSTIC/MAGE');
    expect(boardKeyFor('NECROMANCER', 'WARRIOR_TANK')).toBe('NECROMANCER/DOOMWEAVER');
    expect(boardKeyFor(null)).toBeNull();
  });
});

describe('model', () => {
  it('normalise is idempotent and enforces default / cap / sanity', () => {
    const raw = {
      class: 'WARRIOR',
      transcendence: {
        presets: [
          { id: 'x', name: '  A very long name that exceeds the limit  ', allocatedNodeIds: ['n_0,-1', 'n_0,-1', 'bogus', 'n_5,-9', 'soc_0,-14'] },
          ...[1, 2, 3, 4, 5].map((i) => ({ id: `p${i}`, name: `P${i}`, allocatedNodeIds: [] })),
        ],
        activePresetId: 'gone',
      },
    };
    const once = normaliseTranscendence(raw, { class: 'WARRIOR', spec: null });
    expect(once.transcendence.presets).toHaveLength(4);
    expect(once.transcendence.presets[0].id).toBe('default');
    expect(once.transcendence.activePresetId).toBe('default');
    expect(once.transcendence.presets[1].name.length).toBeLessThanOrEqual(18);
    expect(once.transcendence.presets[1].allocatedNodeIds).toEqual(['n_0,-1']);
    expect(normaliseTranscendence(once, { class: 'WARRIOR', spec: null })).toEqual(once);
  });
  it('no class means no allocations', () => {
    const out = normaliseTranscendence({ transcendence: { presets: [{ id: 'default', name: 'D', allocatedNodeIds: ['n_0,-1'] }] } }, { class: null });
    expect(out.transcendence.presets[0].allocatedNodeIds).toEqual([]);
  });
});

describe('v1 migration', () => {
  it('every v1 node position lands on a v2 cell of the same kind', () => {
    const kindMap = { common: 'minor', uncommon: 'notable', glyph: 'socket', sigil: 'sigil' };
    const g = boardGraph('WARRIOR');
    for (const cls of ['Warrior', 'Sentinel']) {
      const tree = TRANSCENDENCE_TREES[cls];
      const positions = [tree.startPosition, ...tree.nodes.map((n) => n.position)];
      const { value } = migrateTranscendenceFromV1({ transcendence: { unlockedPositions: positions } });
      const ids = value.transcendence.presets[0].allocatedNodeIds;
      // sockets are dropped by sanitise only after migrate; here they map to socket cells
      const expected = tree.nodes.length;
      expect(ids.length).toBe(expected);
      for (const n of tree.nodes) {
        const [c, r] = n.position.split(':').map(Number);
        expect(g.byId.get(g.byCell.get(`${c - 14},${r - 26}`)).kind, n.position).toBe(kindMap[n.type]);
      }
      expect(ids[0]).toBe('n_0,-1');
    }
  });
  it('a v1 character keeps its connected nodes, in the default preset, and links every preset to it', () => {
    const v1 = {
      id: 'c1', name: 'Old', class: 'Warrior',
      transcendence: { unlockedPositions: ['14:25', '14:24', '13:24', '1:1'] },
      presets: [{ id: 'a', name: 'One' }, { id: 'b', name: 'Two' }],
    };
    const c = migrateCharacterFromV1(v1);
    expect(c.transcendence.presets[0].allocatedNodeIds).toEqual(['n_0,-1', 'n_0,-2', 'n_-1,-2']);
    expect(c.presets.every((p) => p.transcendencePresetId === 'default')).toBe(true);
    expect(normaliseRoster({ characters: [v1] }).characters[0].transcendence.activePresetId).toBe('default');
  });
  it('a v2 character round-trips', () => {
    const c = newCharacter('X', 'SENTINEL');
    c.transcendence.presets[0].allocatedNodeIds = ['n_0,-1', 'n_0,-2'];
    expect(normaliseCharacter(JSON.parse(JSON.stringify(c))).transcendence).toEqual(c.transcendence);
  });
});

describe('store', () => {
  let id;
  beforeEach(() => {
    localStorage.clear();
    id = rosterStore.addCharacter('Tr', 'WARRIOR');
  });
  const t = () => rosterStore.current.transcendence;

  it('allocates reachable nodes only and removes without stranding', () => {
    expect(rosterStore.allocateTranscendenceNode('n_-1,-2')).toBe('unreachable');
    expect(rosterStore.allocateTranscendenceNode('soc_0,-14')).toBe('not-allocatable');
    expect(rosterStore.allocateTranscendenceNode('n_0,-1')).toBe('ok');
    expect(rosterStore.allocateTranscendenceNode('n_0,-1')).toBe('owned');
    expect(rosterStore.allocateTranscendenceNode('n_0,-2')).toBe('ok');
    expect(rosterStore.removeTranscendenceNode('n_0,-1')).toBe('strands');
    expect(rosterStore.removeTranscendenceNode('n_0,-2')).toBe('ok');
    expect(t().presets[0].allocatedNodeIds).toEqual(['n_0,-1']);
    expect(JSON.parse(localStorage.getItem(Object.keys(localStorage)[0]))).toBeTruthy();
  });
  it('presets: add to the cap of 4, rename, delete, default protected, links fall back', () => {
    const ids = [1, 2, 3].map(() => rosterStore.addTranscendencePreset());
    expect(rosterStore.addTranscendencePreset()).toBeNull();
    expect(t().presets).toHaveLength(4);
    rosterStore.renameTranscendencePreset(ids[0], 'Burst');
    expect(t().presets[1].name).toBe('Burst');
    const pid = rosterStore.current.presets[0].id;
    rosterStore.setPresetTranscendence(pid, ids[2]);
    expect(rosterStore.deleteTranscendencePreset('default')).toBe(false);
    expect(rosterStore.deleteTranscendencePreset(ids[2])).toBe(true);
    expect(rosterStore.current.presets[0].transcendencePresetId).toBeNull();
    expect(t().activePresetId).toBe('default');
  });
  it('class switch keeps a valid allocation', () => {
    rosterStore.allocateTranscendenceNode('n_0,-1');
    rosterStore.setCharacterClass(id, 'MYSTIC');
    expect(rosterStore.current.transcendence.presets[0].allocatedNodeIds).toEqual(['n_0,-1']);
  });
});
