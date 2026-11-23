// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  boardKeyFor, boardGraph, isReachable, canAllocateNode, canRemoveNode, sanitiseAllocation, setTotalCost,
  allocCost, removeRefund, validateAllocation, transcendenceBonuses, sideProgress, slotPrice, dominionNodeCost,
} from './transcendence.js';
import { TRANSCENDENCE_BOARD_KEYS, transcendenceBoard } from './game/transcendence.js';
import { normaliseCharacter, newCharacter, migrateCharacterFromV1, normaliseRoster } from './model/index.js';
import { migrateTranscendenceFromV1, normaliseTranscendence } from './model/transcendence.js';
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
    expect(boardKeyFor('NECROMANCER', 'WARRIOR_TANK')).toBe('NECROMANCER');
    expect(boardKeyFor('NECROMANCER', 'NECROMANCER_DEATHLORD')).toBe('NECROMANCER');
    expect(boardKeyFor('NECROMANCER', 'NECROMANCER_DOOMWEAVER')).toBe('NECROMANCER');
    expect(boardKeyFor(null)).toBeNull();
  });
});

describe('the Necromancer board (2.9.8: one NECRO board, Dominion nodes)', () => {
  const bfs = (key) => {
    const g = boardGraph(key);
    const order = [];
    const seen = new Set(['core']);
    const queue = ['core'];
    while (queue.length) {
      for (const n of g.neighbors.get(queue.shift())) {
        if (seen.has(n) || g.byId.get(n).kind === 'socket') continue;
        seen.add(n);
        order.push(n);
        queue.push(n);
      }
    }
    return order;
  };
  it('column 0 is the core side, left defense, right attack (necroSide L1258200)', () => {
    const g = boardGraph('NECROMANCER');
    expect(['n_0,-1', 'n_-1,-2', 'n_1,-2'].map((id) => g.byId.get(id).side)).toEqual(['core', 'defense', 'attack']);
    expect(transcendenceBonuses('NECROMANCER', ['n_0,-1', 'n_0,-2', 'n_-1,-2', 'n_1,-2'])).toEqual({
      hpPercent: 1, attackPercent: 0.8, minionAttackPercent: 0.8, spellDamageFlat: 0.8,
    });
  });
  it('Dominion nodes sit at -3,-7 -4,-13 -5,-19 -8,-22 (L1260725-1260733) and cost 1/5/20/50 outside the slot counter (L1259294, L1259429)', () => {
    const g = boardGraph('NECROMANCER');
    const dom = [...g.byId.values()].filter((n) => n.special === 'DOMINION').map((n) => `${n.col},${n.row}`);
    expect(dom).toEqual(['-3,-7', '-4,-13', '-5,-19', '-8,-22']);
    expect(g.byId.get('n_-3,-7')).toMatchObject({ side: 'defense', kind: 'minor', name: 'Dominion', stats: [{ stat: 'dominionFlat', value: 1 }] });
    expect([0, 1, 2, 3, 4, -1].map(dominionNodeCost)).toEqual([1, 5, 20, 50, 50, 1]);
    const path = bfs('NECROMANCER');
    const upTo = (id) => path.slice(0, path.indexOf(id) + 1);
    // the first Dominion costs 1 and the next common still pays the slot price it would have paid without it
    const before = upTo('n_-3,-7').filter((id) => id !== 'n_-3,-7');
    expect(allocCost('NECROMANCER', before, 'n_-3,-7')).toBe(1);
    const next = path[path.indexOf('n_-3,-7') + 1];
    expect(g.byId.get(next).special).toBeUndefined();
    expect(allocCost('NECROMANCER', [...before, 'n_-3,-7'], next)).toBe(allocCost('NECROMANCER', before, next));
    expect(removeRefund('NECROMANCER', [...before, 'n_-3,-7'], 'n_-3,-7')).toBe(1);
  });
  it('the full board costs 13041 Ichor and reaches the documented ceilings (transcendence.md §6, §8)', () => {
    const order = bfs('NECROMANCER');
    expect(order).toHaveLength(271);
    expect(validateAllocation('NECROMANCER', order)).toBe(13041);
    const b = transcendenceBonuses('NECROMANCER', order);
    const want = {
      hpPercent: 41, attackPercent: 16.8, attackSpeedFlat: 0.06, hpRegenFlat: 12.6, spellDamageFlat: 17.6, spellCritChanceFlat: 8,
      critDamageFlat: 26.6, spellVampFlat: 8.5, fearChanceFlat: 2.55, spellResistFlat: 6, minionAttackPercent: 14.4,
      minionHealthPercent: 28.5, minionCritChanceFlat: 8, minionLifestealFlat: 8.5, soulLinkFlat: 3.4, minionAttackSpeedFlat: 0.17, dominionFlat: 4,
    };
    expect(Object.keys(b).sort()).toEqual(Object.keys(want).sort());
    for (const [k, v] of Object.entries(want)) expect(b[k], k).toBeCloseTo(v, 6);
  });
  it('a saved allocation from the old Doomweaver/Deathlord boards keeps every id (same cells, same kinds)', () => {
    // n_0,-2 and n_0,-5 were Dominion on the old Deathlord board; they now give Attack and HP Regen
    const ids = ['n_0,-1', 'n_0,-2', 'not_0,-3', 'n_0,-4', 'n_0,-5', 'n_-1,-2', 'n_-1,-3', 'n_1,-2'];
    const c = normaliseCharacter({ class: 'NECROMANCER', transcendence: { presets: [{ id: 'default', allocatedNodeIds: ids }], activePresetId: 'default' } });
    expect(c.transcendence.presets[0].allocatedNodeIds).toEqual(ids);
    expect(transcendenceBonuses('NECROMANCER', ['n_0,-2', 'n_0,-5'])).toEqual({ attackPercent: 0.8, hpRegenFlat: 0.6 });
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
  it('every v1 node position (v2 col+14, row+26) lands on the v2 cell it came from', () => {
    const g = boardGraph('WARRIOR');
    const cells = [...g.byId.values()].filter((n) => n.id !== 'core');
    const positions = cells.map((n) => `${n.col + 14}:${n.row + 26}`);
    const { value } = migrateTranscendenceFromV1({ transcendence: { unlockedPositions: positions } });
    const ids = value.transcendence.presets[0].allocatedNodeIds;
    expect(new Set(ids)).toEqual(new Set(cells.map((n) => n.id)));
    expect(ids[0]).toBe('n_0,-1');
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
  it('duplicate: copies ids into a distinct array, activates, truncates name, refuses at cap', () => {
    rosterStore.allocateTranscendenceNode('n_0,-1');
    const id = rosterStore.duplicateTranscendencePreset('default');
    expect(id).toBeTruthy();
    const [a, b] = t().presets;
    expect(b.id).toBe(id);
    expect(b.name).toBe('Default copy');
    expect(b.allocatedNodeIds).toEqual(['n_0,-1']);
    expect(b.allocatedNodeIds).not.toBe(a.allocatedNodeIds);
    expect(t().activePresetId).toBe(id);
    rosterStore.renameTranscendencePreset(id, 'ABCDEFGHIJKLMNOPQR');
    const id2 = rosterStore.duplicateTranscendencePreset(id);
    expect(t().presets.find((p) => p.id === id2).name).toBe('ABCDEFGHIJKLMNOPQR');
    rosterStore.addTranscendencePreset();
    expect(rosterStore.duplicateTranscendencePreset('default')).toBeNull();
    expect(t().presets).toHaveLength(4);
    expect(rosterStore.duplicateTranscendencePreset('nope')).toBeNull();
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
