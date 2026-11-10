import { describe, it, expect } from 'vitest';
import {
  defaultDropCheck, normaliseDropCheck, normaliseDropGoals, reconcileDropCheck, activeDropProfile, DROP_GOAL_MAX, GUARD_TARGET,
} from './dropCheck.js';
import { newCharacter, normaliseCharacter } from './index.js';

const dummy = { target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' } };
const judge = { role: 'judge', presetIds: null };

describe('model/dropCheck', () => {
  it('defaults to one empty profile', () => {
    const { dropCheck } = defaultDropCheck();
    expect(dropCheck.profiles).toHaveLength(1);
    expect(dropCheck.profiles[0].goals).toEqual([]);
    expect(dropCheck.activeProfileId).toBe(dropCheck.profiles[0].id);
    expect(newCharacter('A').dropCheck).toEqual(dropCheck);
    expect(normaliseDropCheck({})).toEqual(defaultDropCheck());
    expect(normaliseDropCheck({ dropCheck: { profiles: [] } })).toEqual(defaultDropCheck());
  });

  it('keeps valid goals, drops malformed ones and strips echo keys', () => {
    const goals = normaliseDropGoals([
      { id: 'a', ...dummy, target: { ...dummy.target, label: 'Training dummy' } },
      { id: 'b', target: { seconds: 60 }, objective: { kind: 'dps' } },
      { id: 'c', target: dummy.target },
      'junk',
    ]);
    expect(goals).toEqual([{ id: 'a', target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, ...judge }]);
  });

  it('a guard keeps a target in range; a judge carries none; presetIds are deduplicated', () => {
    const [g, h, j] = normaliseDropGoals([
      { id: 'g', ...dummy, role: 'guard', guard: { target: 7 }, presetIds: ['a', 'a', 3, 'b'] },
      { id: 'h', ...dummy, role: 'guard' },
      { id: 'j', ...dummy, role: 'nonsense', guard: { target: 0.5 }, presetIds: 'x' },
    ]);
    expect(g).toMatchObject({ role: 'guard', guard: { target: GUARD_TARGET.max }, presetIds: ['a', 'b'] });
    expect(h.guard.target).toBe(GUARD_TARGET.default);
    expect(j).toEqual({ id: 'j', ...dummy, ...judge });
  });

  it('makes goal ids unique and caps the list', () => {
    const many = Array.from({ length: DROP_GOAL_MAX + 3 }, () => ({ id: 'same', ...dummy }));
    const goals = normaliseDropGoals(many);
    expect(goals).toHaveLength(DROP_GOAL_MAX);
    expect(new Set(goals.map((g) => g.id)).size).toBe(DROP_GOAL_MAX);
  });

  it('is idempotent', () => {
    const once = normaliseDropCheck({ dropCheck: { profiles: [{ id: 'p', name: ' Ranked ', goals: [{ id: 'g', ...dummy }] }], activeProfileId: 'nope' } });
    expect(once.dropCheck.profiles[0].name).toBe('Ranked');
    expect(once.dropCheck.activeProfileId).toBe('p');
    expect(normaliseDropCheck(once)).toEqual(once);
  });

  it('reconciles PVP opponents and a deleted Celestial opponent partner', () => {
    const c = {
      opponents: [{ id: 'o1' }],
      dropCheck: {
        profiles: [{
          id: 'p', name: 'G', goals: [
            { id: 'g1', target: { kind: 'pvp', opponentIds: ['o1', 'gone'], seats: 'attacker' }, objective: { kind: 'pvp-winrate' } },
            { id: 'g2', target: { kind: 'celestial', difficulty: 'HARD', partner: { source: 'opponent', opponentId: 'gone' }, tank: 'partner', starter: 'partner' }, objective: { kind: 'win-chance' } },
          ],
        }],
        activeProfileId: 'p',
      },
    };
    reconcileDropCheck(c);
    const [g1, g2] = c.dropCheck.profiles[0].goals;
    expect(g1.target.opponentIds).toEqual(['o1']);
    expect(g2.target).toMatchObject({ partner: null, tank: 'auto', starter: 'me' });
  });

  it('reconciles deleted presets but keeps a goal left with none (it then judges no preset)', () => {
    const c = {
      presets: [{ id: 'p1' }],
      dropCheck: { profiles: [{ id: 'p', name: 'G', goals: [{ id: 'g1', ...dummy, presetIds: ['p1', 'gone'] }, { id: 'g2', ...dummy, presetIds: ['gone'] }] }], activeProfileId: 'p' },
    };
    reconcileDropCheck(c);
    const [g1, g2] = c.dropCheck.profiles[0].goals;
    expect(g1.presetIds).toEqual(['p1']);
    expect(g2.presetIds).toEqual([]);
  });

  it('round-trips through normaliseCharacter', () => {
    const c = newCharacter('A', 'WARRIOR');
    c.dropCheck.profiles[0].goals = [{ id: 'g', ...dummy, ...judge }, { id: 'h', ...dummy, role: 'guard', guard: { target: 0.9 }, presetIds: [c.presets[0].id] }];
    const back = normaliseCharacter(JSON.parse(JSON.stringify(c)));
    expect(activeDropProfile(back).goals).toEqual(c.dropCheck.profiles[0].goals);
  });
});
