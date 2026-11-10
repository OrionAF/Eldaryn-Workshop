import { describe, it, expect } from 'vitest';
import {
  dropObjectiveKinds, resolveDropGoal, resolveDropGoals, goalsForRealm, requestGoals, legacyDropGoals, expandLegacyGoals,
  goalIdsFor, goalsSeeDefence,
} from './dropGoals.js';
import { fixtureCharacter } from '../build/fixtures.js';

const goal = (id, target, objective) => ({ id, target, objective });

describe('ui/dropGoals', () => {
  it('offers the Optimiser objectives a swap can use', () => {
    expect(dropObjectiveKinds('dungeon')).toEqual(['win-chance']);
    expect(dropObjectiveKinds('dummy')).toEqual(['dps']);
    expect(dropObjectiveKinds('celestial')).toEqual(['win-chance', 'fastest-clear']);
    expect(dropObjectiveKinds('pvp')).toEqual(['pvp-winrate', 'arena-reward']);
  });

  it('a guard is offered only the rates it can hold', () => {
    expect(dropObjectiveKinds('dungeon', null, 'guard')).toEqual(['win-chance']);
    expect(dropObjectiveKinds('dummy', null, 'guard')).toEqual([]);
    expect(dropObjectiveKinds('pvp', null, 'guard')).toEqual(['pvp-winrate']);
  });

  it('scopes goals to presets: deleted presets drop out, a goal with none left says so, ids per preset', () => {
    const c = fixtureCharacter('WARRIOR');
    const [p1, p2] = c.presets.map((p) => p.id);
    const resolved = resolveDropGoals([
      { ...goal('all', { kind: 'dummy', seconds: 60 }, { kind: 'dps' }), presetIds: null },
      { ...goal('one', { kind: 'dummy', seconds: 60 }, { kind: 'dps' }), presetIds: [p2, 'gone'] },
      { ...goal('none', { kind: 'dummy', seconds: 60 }, { kind: 'dps' }), presetIds: ['gone'] },
      { ...goal('gd', { kind: 'chapter', chapter: 1, level: 2 }, { kind: 'win-chance' }), role: 'guard', guard: { target: 0.9 } },
    ], c);
    expect(resolved[1].presetIds).toEqual([p2]);
    expect(resolved[2]).toMatchObject({ ok: false, error: 'Judges no preset: pick one' });
    expect(goalIdsFor(resolved, 'base', p1)).toEqual(['all', 'gd']);
    expect(goalIdsFor(resolved, 'base', p2)).toEqual(['all', 'one', 'gd']);
    expect(requestGoals(resolved).find((g) => g.id === 'gd')).toMatchObject({ role: 'guard', guard: { target: 0.9 } });
    expect(requestGoals(resolved).find((g) => g.id === 'all').role).toBeUndefined();
    expect(goalsSeeDefence(resolved.slice(0, 2))).toBe(false);
    expect(goalsSeeDefence(resolved)).toBe(true);
  });

  it('resolves goals, keeps broken ones with the reason, and filters by realm', () => {
    const c = fixtureCharacter('WARRIOR');
    const resolved = resolveDropGoals([
      goal('a', { kind: 'dummy', seconds: 60 }, { kind: 'dps' }),
      goal('b', { kind: 'chapter', chapter: 99, level: 1 }, { kind: 'win-chance' }),
      goal('c', { kind: 'oblivion', floor: 3 }, { kind: 'win-chance' }),
    ], c);
    expect(resolved.map((r) => r.ok)).toEqual([true, false, true]);
    expect(resolved[0].label).toBe('Training dummy, 60 s: Damage per second');
    expect(resolved[1].error).toMatch(/does not exist/);
    expect(resolved[1].label).toBe('Campaign chapter: Highest chance to win');
    expect(goalsForRealm(resolved, 'base').map((r) => r.goal.id)).toEqual(['a']);
    expect(goalsForRealm(resolved, 'oblivion').map((r) => r.goal.id)).toEqual(['c']);
    expect(requestGoals(resolved).map((g) => g.id)).toEqual(['a', 'c']);
  });

  it('drops deleted opponents from a PVP goal before resolving it', () => {
    const c = { ...fixtureCharacter('WARRIOR'), opponents: [] };
    const r = resolveDropGoal(goal('p', { kind: 'pvp', opponentIds: ['gone'], seats: 'attacker' }, { kind: 'pvp-winrate' }), c);
    expect(r.goal.target.opponentIds).toEqual([]);
    expect(r.ok).toBe(false);
  });

  it('imports the old Measure settings once (survival becomes clear chance)', () => {
    expect(legacyDropGoals(null)).toEqual([]);
    expect(legacyDropGoals({ simOn: true, goalsImported: true })).toEqual([]);
    const goals = legacyDropGoals({ simOn: true, survivalOn: true, enemySpec: { kind: 'campaign', chapter: 2, level: 3 }, pvpOn: true, pvpIds: null });
    expect(goals).toEqual([
      { target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } },
      { target: { kind: 'chapter', chapter: 2, level: 3 }, objective: { kind: 'win-chance' } },
      { target: { kind: 'pvp', opponentIds: [], seats: 'attacker', allOpponents: true }, objective: { kind: 'pvp-winrate' } },
    ]);
    const c = { opponents: [{ id: 'o1' }, { id: 'o2' }] };
    expect(expandLegacyGoals(goals, c)[2].target).toEqual({ kind: 'pvp', opponentIds: ['o1', 'o2'], seats: 'attacker' });
    expect(legacyDropGoals({ simOn: false, survivalOn: true, enemySpec: { kind: 'raid', id: 'raid_1', step: 2 } })).toEqual([
      { target: { kind: 'raid', id: 'raid_1', step: 2 }, objective: { kind: 'win-chance' } },
    ]);
  });
});
