import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { boardKeyFor, boardGraph, canAllocateNode, setTotalCost, validateAllocation } from '../transcendence.js';
import { sigilBySpecies } from '../game/sigils.js';
import { AWAKENING_PATHS } from '../game/awakening.js';
import { awakeningPointsForLevel, effectiveTranscendencePreset } from '../model/legality.js';
import { BLOCKS, createBuildSpace, candidateOf, materialise, runningBoardOf } from './space.js';
import { canonicalBoardAllocation, boardCapacity, normaliseIchorBudget } from './boardAllocation.js';
import { awakeningCap } from './awakeningChoices.js';
import { legalityOf } from './legality.js';
import { changesOf, writesOf, revert, addChange, canonicalise } from './effect.js';
import { defaultSetup, normaliseSetup, requestOf, setupFromRun } from '../ui/optimiserSetup.js';
import { applyPlan } from '../ui/optimiserView.js';
import { prepare, optimize, optimizeMore, enumerateJoint } from './search.js';
import { estimateRun } from './estimate.js';
import { runFromResult } from '../model/runs.js';

const only = (...ids) => Object.fromEntries(BLOCKS.map((id) => [id, ids.includes(id)]));
const start = 'n_0,-1', middle = 'n_0,-2';
function fixture(cls = 'WARRIOR') {
  const raw = structuredClone(fixtureCharacter(cls));
  raw.level = 100;
  raw.presets.forEach((p) => { p.ancientSigilSpecies = null; });
  const graph = boardGraph(boardKeyFor(cls));
  const left = graph.neighbors.get(middle).find((id) => ![start, 'core'].includes(id) && id !== 'n_0,-3');
  raw.transcendence = { activePresetId: 'default', presets: [
    { id: 'default', name: 'Default', allocatedNodeIds: [start, middle, left] },
    { id: 'other', name: 'Other', allocatedNodeIds: [start] },
  ] };
  return normaliseCharacter(raw);
}
const spaceOf = (c = fixture(), options = {}) => createBuildSpace(c, 'p1', { toggles: only('boardAllocation', 'awakening'), ...options });
const domain = (s, id, cand = s.start) => s.blocks.find((b) => b.id === id).domain(cand);

describe('board reallocation and Awakening search', () => {
  it('enables new board reallocation only for fresh setups and keeps Awakening opt-in', () => {
    const c = fixture();
    expect(defaultSetup().space).toMatchObject({ boardAllocation: true, awakening: false });
    expect(normaliseSetup({ space: { transcendence: true } }, c).space).toMatchObject({ boardAllocation: false, awakening: false });
    expect(prepare({ character: c, presetId: 'p1', space: { transcendence: true } }).space.toggles.boardAllocation).toBe(false);
    expect(normaliseIchorBudget(-1)).toBeNull();
    expect(normaliseIchorBudget(1.5)).toBeNull();
    expect(normaliseIchorBudget(0)).toBe(0);
  });
  it('canonicalises unchanged allocations and Awakening; allocations are sets, not click order', () => {
    const c = fixture(), s = spaceOf(c), B = s.start;
    expect(canonicalBoardAllocation(c, { boardId: 'default', allocatedNodeIds: [...c.transcendence.presets[0].allocatedNodeIds].reverse() })).toBeNull();
    expect(s.key({ ...B, awakening: { ...c.awakening } })).toBe(s.key(B));
  });
  it('reuses only saved Ichor by default, permits explicit capacity and never creates a board', () => {
    const c = fixture(), s = spaceOf(c), key = boardKeyFor(c.class);
    const capacity = setTotalCost(key, c.transcendence.presets[0].allocatedNodeIds);
    expect(boardCapacity(c, s.start, 'default', null)).toBe(capacity);
    expect(domain(s, 'boardAllocation').length).toBeGreaterThan(0);
    for (const cand of domain(s, 'boardAllocation')) {
      const ids = runningBoardOf(c, cand).allocatedNodeIds;
      expect(validateAllocation(key, ids)).not.toBeNull();
      expect(setTotalCost(key, ids)).toBeLessThanOrEqual(capacity);
      expect(legalityOf(c, 'p1', cand)).toMatchObject({ ok: true });
      expect(materialise(c, 'p1', cand).transcendence.presets).toHaveLength(2);
    }
    const expanded = spaceOf(c, { boardIchorBudget: capacity + 100 });
    expect(domain(expanded, 'boardAllocation').some((cand) => setTotalCost(key, runningBoardOf(c, cand).allocatedNodeIds) > capacity)).toBe(true);
  });
  it('offers compound routes to notables with legal leaf trimming rather than needing path nodes to win alone', () => {
    const c = fixture(), s = spaceOf(c, { boardIchorBudget: 100 });
    const graph = boardGraph(boardKeyFor(c.class));
    const moves = domain(s, 'boardAllocation');
    expect(moves.some((cand) => cand.boardAllocation?.allocatedNodeIds.some((id) => graph.byId.get(id).kind === 'notable'))).toBe(true);
    for (const cand of moves) expect(validateAllocation(boardKeyFor(c.class), cand.boardAllocation?.allocatedNodeIds ?? c.transcendence.presets[0].allocatedNodeIds)).not.toBeNull();
  });
  it.each(['WARRIOR', 'SENTINEL', 'MYSTIC', 'NECROMANCER'])('has legal candidates in both realms and modes for %s', (cls) => {
    const c = fixture(cls);
    for (const realm of ['base', 'oblivion']) for (const mode of ['pve', 'pvp']) {
      const s = spaceOf(c, { realm, mode });
      for (const cand of [...domain(s, 'boardAllocation'), ...domain(s, 'awakening')]) expect(legalityOf(c, 'p1', cand)).toMatchObject({ ok: true });
    }
  });
  it('rejects duplicate, disconnected, socket, core and unknown nodes, nonexistent boards and wrong selected boards', () => {
    const c = fixture(), B = candidateOf(c, 'p1'), graph = boardGraph(boardKeyFor(c.class));
    const socket = [...graph.byId.values()].find((n) => n.kind === 'socket').id;
    for (const allocatedNodeIds of [[start, start], [middle], [socket], ['core'], ['missing'], 'bad']) {
      expect(legalityOf(c, 'p1', { ...B, boardAllocation: { boardId: 'default', allocatedNodeIds } }).ok).toBe(false);
    }
    for (const boardId of ['missing', 'other']) expect(legalityOf(c, 'p1', { ...B, boardAllocation: { boardId, allocatedNodeIds: [] } }).ok).toBe(false);
  });
  it('uses the actual active board below link unlock and respects the board unlock gate', () => {
    const c = fixture(); c.level = 54;
    expect(domain(spaceOf(c), 'boardAllocation')).toEqual([]);
    c.level = 56; c.presets[0].transcendencePresetId = 'other';
    const s = spaceOf(c);
    expect(effectiveTranscendencePreset(c, c.presets[0]).id).toBe('default');
    for (const cand of domain(s, 'boardAllocation')) expect(cand.boardAllocation.boardId).toBe('default');
  });
  it('preserves the node of an equipped Ancient and its connectivity through all generated moves', () => {
    const c = fixtureCharacter('WARRIOR'), s = spaceOf(c);
    const required = sigilBySpecies(s.start.ancientSigilSpecies).transcendenceNode;
    expect(required).toBeTruthy();
    for (const cand of domain(s, 'boardAllocation')) {
      expect(runningBoardOf(c, cand).allocatedNodeIds).toContain(required);
      expect(cand.ancientSigilSpecies).toBe(s.start.ancientSigilSpecies);
    }
  });
  it('materialises only the chosen existing board and Awakening immutably, with shared-preset effects', () => {
    const c = fixture(), before = structuredClone(c), s = spaceOf(c, { boardIchorBudget: 10 });
    const X = { ...domain(s, 'boardAllocation')[0], awakening: { path: 'RADIANT', level: awakeningCap(c) } };
    const next = materialise(c, 'p1', X);
    expect(next.transcendence.presets[1]).toBe(c.transcendence.presets[1]);
    expect(next.transcendence.activePresetId).toBe(c.transcendence.activePresetId);
    expect(next.awakening).toEqual(X.awakening);
    expect(c).toEqual(before);
    const changes = changesOf(s, s.start, X);
    for (const change of changes) {
      expect(change.scope).toBe('character');
      expect(change.sideEffects.some((e) => e.presetId === 'p2')).toBe(true);
      expect(change.costNote).toMatch(/unknown|earned/);
      expect(legalityOf(c, 'p1', s.legalise(addChange(s, s.start, X, change))).ok).toBe(true);
    }
    expect(s.fighterOf(X).stats).not.toEqual(s.fighterOf(s.start).stats);
  });
  it('can exclude board and Awakening groups independently of each other and of sigil conditions', () => {
    const c = fixture(), s = spaceOf(c, { boardIchorBudget: 10 });
    const X = { ...domain(s, 'boardAllocation')[0], awakening: { path: 'RADIANT', level: 15 } };
    const changes = changesOf(s, s.start, X), writes = writesOf(s, s.start, X, changes);
    const row = { candidate: X, changes, writes };
    const bi = writes.findIndex((g) => g.owner.boardId), ai = writes.findIndex((g) => g.changeIds.includes('awakening'));
    expect(applyPlan(row, [bi]).cand.boardAllocation).toBeUndefined();
    expect(applyPlan(row, [bi]).cand.awakening).toEqual(X.awakening);
    expect(applyPlan(row, [ai]).cand.boardAllocation).toEqual(X.boardAllocation);
    expect(applyPlan(row, [ai]).cand.awakening).toBeUndefined();
    expect(s.key(revert(s, s.start, X, 'awakening'))).toBe(s.key(domain(s, 'boardAllocation')[0]));
  });
  it('bundles selecting a new board with its allocation and prevents splitting them in Apply', () => {
    const c = fixtureCharacter('WARRIOR');
    c.transcendence.presets.push({ id: 'other', name: 'Other', allocatedNodeIds: [] });
    const s = spaceOf(c, { boardIchorBudget: 100000 });
    const X = s.legalise({ ...s.start, transcendencePresetId: 'other', boardAllocation: {
      boardId: 'other', allocatedNodeIds: [...c.transcendence.presets[0].allocatedNodeIds] } });
    expect(legalityOf(c, 'p1', X).ok).toBe(true);
    const changes = changesOf(s, s.start, X), writes = writesOf(s, s.start, X, changes);
    const board = changes.find((c) => c.id === 'board:other');
    expect(board.bundle).toContain('transcendence');
    expect(legalityOf(c, 'p1', s.legalise(addChange(s, s.start, X, board))).ok).toBe(true);
    const row = { candidate: X, changes, writes };
    const i = writes.findIndex((g) => g.owner.boardId);
    expect(applyPlan(row, [i]).blockReason).toMatch(/together/);
    expect(applyPlan(row, writes.map((_, i) => i)).blockReason).toBeUndefined();
  });
  it.each([44, 45, 50, 59, 100])('searches valid actual Awakening levels at character level %i', (level) => {
    const c = fixture(); c.level = level; c.awakening = { path: null, level: 0 };
    const s = spaceOf(c), values = domain(s, 'awakening');
    expect(values).toHaveLength(Object.keys(AWAKENING_PATHS).length * awakeningPointsForLevel(level));
    for (const cand of values) expect(legalityOf(c, 'p1', cand).violations.filter((v) => v.gate === 'awakening')).toEqual([]);
  });
  it('rejects invalid paths, locked/fractional/too-high levels and same-path downgrades', () => {
    const c = fixture(), B = candidateOf(c, 'p1');
    for (const awakening of [{ path: 'BAD', level: 1 }, { path: 'SHADOW', level: 0 }, { path: 'SHADOW', level: 9 },
      { path: 'RADIANT', level: 1.5 }, { path: 'RADIANT', level: 16 }, []]) expect(legalityOf(c, 'p1', { ...B, awakening }).ok).toBe(false);
    c.level = 44;
    expect(legalityOf(c, 'p1', { ...B, awakening: { path: 'RADIANT', level: 1 } }).ok).toBe(false);
  });
  it('rejects disallowed progression and over-capacity candidates without changing the engine rules', () => {
    const c = fixture(), enabled = spaceOf(c, { boardIchorBudget: 100 });
    const board = domain(enabled, 'boardAllocation').find((x) => x.boardAllocation.allocatedNodeIds.length > 3);
    expect(board).toBeTruthy();
    expect(spaceOf(c, { boardIchorBudget: 0 }).admissible(board)).toBe(false);
    const disabled = createBuildSpace(c, 'p1', { toggles: only() });
    expect(disabled.admissible(board)).toBe(false);
    expect(disabled.admissible({ ...disabled.start, awakening: { path: 'RADIANT', level: 15 } })).toBe(false);
  });
  it('preserves capacities/permissions in request keys, history, reruns and local estimates', () => {
    const c = fixture(), setup = normaliseSetup({ ...defaultSetup(), boardIchorBudget: 100, space: only('boardAllocation', 'awakening') }, c);
    const req = requestOf(setup, c), prep = prepare(req);
    expect(prep.requestEcho.boardIchorBudget).toBe(100);
    expect(prepare({ ...req, boardIchorBudget: 99 }).requestKey).not.toBe(prep.requestKey);
    expect(enumerateJoint(prep.space, prep.space.start, new Set(['boardAllocation']))).toBeNull();
    expect(estimateRun(req).strategy).toBe('local');
    const X = domain(prep.space, 'boardAllocation')[0], changes = changesOf(prep.space, prep.space.start, X);
    const run = runFromResult({ schema: 'optimiser-result/2', request: prep.requestEcho, rows: [{ candidate: X, changes, writes: writesOf(prep.space, prep.space.start, X, changes) }] });
    expect(run.boardIchorBudget).toBe(100);
    expect(run.detail.rows[0].changes[0].costNote).toMatch(/Ichor/);
    expect(setupFromRun(run, c)).toMatchObject({ boardIchorBudget: 100, space: { boardAllocation: true, awakening: true } });
  });
  it('confirms real board and Awakening proposals and retains them in Run more', async () => {
    const c = fixture(); c.transcendence.presets[0].allocatedNodeIds = []; c.awakening = { path: null, level: 0 };
    const req = { character: c, presetId: 'p1', target: { kind: 'dummy', seconds: 2 },
      space: only('boardAllocation', 'awakening'), boardIchorBudget: 5, effort: { level: 'quick', n0: 4, maxN: 16, randomStarts: 0 }, seed: 1 };
    const result = await optimize(req);
    expect(result.status).toBe('done');
    expect(result.search.strategy).toBe('local');
    expect(result.rows.length).toBeGreaterThan(0);
    for (const row of result.rows) {
      expect(legalityOf(c, 'p1', row.candidate).ok).toBe(true);
      expect(row.changes.some((c) => c.dimension === 'awakening' || c.dimension === 'boardAllocation')).toBe(true);
      expect(row.changes.every((c) => c.costNote)).toBe(true);
      expect(applyPlan(row).blockReason).toBeUndefined();
      expect(canonicalise(prepare(req).space, candidateOf(c, 'p1'), row.candidate).inert).toEqual([]);
    }
    const more = await optimizeMore({ character: c, result, rowKeys: [result.rows[0].key], targetN: 32 });
    expect(more.request.boardIchorBudget).toBe(5);
    expect(more.rows[0].changes.some((c) => c.costNote)).toBe(true);
  });
});
