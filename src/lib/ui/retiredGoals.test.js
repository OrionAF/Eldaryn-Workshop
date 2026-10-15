// Retired Optimiser goals (backlog §10, O1): kill time on every target and survival outside custom mobs.
// A saved setup falls back to the target's default; a saved run stays in the history, viewable, with its
// re-run actions off and the reason 'This goal was retired.'
import { describe, it, expect } from 'vitest';
import { normaliseSetup, setupFromRun, retiredGoalBlock, RETIRED_GOAL_REASON } from './optimiserSetup.js';
import { viewRun } from './optimiserView.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { runFromResult, normaliseRun } from '../model/runs.js';
import { ttkResult, dpsResult } from '../__fixtures__/optimiser/index.js';

const character = () => JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));

/** A current-schema saved run of a retired kind, made from the recorded time-to-kill result. */
function savedRun(objectiveKind, target = { kind: 'chapter', chapter: 1, level: 1 }) {
  const r = ttkResult();
  r.objective = { ...r.objective, kind: objectiveKind };
  r.request = { ...r.request, objective: { kind: objectiveKind }, target: { ...target } };
  r.target = { ...r.target, ...target };
  return normaliseRun(JSON.parse(JSON.stringify(runFromResult(r, { id: `run-${objectiveKind}` }))));
}

describe('a saved setup with a retired objective', () => {
  it.each(['ttk-median', 'ttk-p90'])('%s normalises to the target default (highest chance to win on a dungeon)', (kind) => {
    const s = normaliseSetup({ target: { kind: 'dungeon', id: 'dungeon_2_hard', step: 3 }, objective: { kind, seconds: 5 } }, character());
    expect(s.target).toEqual({ kind: 'dungeon', id: 'dungeon_2_hard', step: 3 });
    expect(s.objective).toEqual({ kind: 'win-chance' });
  });

  it.each([
    [{ kind: 'chapter', chapter: 2, level: 1 }, 'win-chance'],
    [{ kind: 'raid', id: 'raid_1', step: 1 }, 'win-chance'],
    [{ kind: 'oblivion', floor: 2 }, 'win-chance'],
    [{ kind: 'worldBoss', affinity: 'ENRAGED' }, 'dps'],
  ])('survival on %j normalises to %s', (target, expected) => {
    const s = normaliseSetup({ target, objective: { kind: 'survival', seconds: 30 } }, character());
    expect(s.objective).toEqual({ kind: expected });
  });

  it('survival stays on a custom mob that can hurt the player', () => {
    const target = { kind: 'custom', mob: { hp: 1e6, attack: 10, attackSpeed: 1 }, seconds: 60 };
    expect(normaliseSetup({ target, objective: { kind: 'survival' } }, character()).objective).toEqual({ kind: 'survival' });
  });

  it('a win-rate target of 1 % is kept and 0.9 % falls back to the default; Push keeps its 10 % floor', () => {
    const target = { kind: 'dungeon', id: 'dungeon_1', step: 1 };
    expect(normaliseSetup({ target, objective: { kind: 'win-rate', target: 0.01 } }, character()).objective).toEqual({ kind: 'win-rate', target: 0.01 });
    expect(normaliseSetup({ target, objective: { kind: 'push', target: 0.1 } }, character()).objective).toEqual({ kind: 'push', target: 0.1 });
    expect(normaliseSetup({ target, objective: { kind: 'push', target: 0.09 } }, character()).objective).toEqual({ kind: 'push' });
    expect(normaliseSetup({ target, objective: { kind: 'win-rate', target: 0.009 } }, character()).objective).toEqual({ kind: 'win-rate' });
  });
});

describe('saved runs of a retired goal', () => {
  it.each(['ttk-median', 'ttk-p90'])('a %s run is kept whole and stays viewable', (kind) => {
    const run = savedRun(kind);
    expect(run.objective.kind).toBe(kind);
    expect(run.detail.rows.length).toBeGreaterThan(0);
    const view = viewRun(run);
    expect(view.rows.length).toBe(run.detail.rows.length);
    expect(view.baseline).not.toBeNull();
  });

  it('a survival run on a chapter is kept and viewable too', () => {
    const run = savedRun('survival');
    expect(run.objective.kind).toBe('survival');
    expect(viewRun(run).rows.length).toBeGreaterThan(0);
  });

  it.each(['ttk-median', 'ttk-p90'])('a %s run cannot be re-run, with the reason', (kind) => {
    expect(retiredGoalBlock(savedRun(kind))).toBe(RETIRED_GOAL_REASON);
    expect(RETIRED_GOAL_REASON).toBe('This goal was retired.');
  });

  it('survival is retired for a chapter run but not for a custom-mob run', () => {
    expect(retiredGoalBlock(savedRun('survival'))).toBe(RETIRED_GOAL_REASON);
    expect(retiredGoalBlock(savedRun('survival', { kind: 'custom', mob: { hp: 1e6, attack: 10, attackSpeed: 1 }, seconds: 60 }))).toBe('');
  });

  it('a live goal is not blocked, and neither is a job request or a spec with nothing to judge', () => {
    expect(retiredGoalBlock(dpsResult())).toBe('');
    expect(retiredGoalBlock({ target: { kind: 'dungeon', id: 'dungeon_1', step: 1 }, objective: { kind: 'win-rate' } })).toBe('');
    expect(retiredGoalBlock({ target: { kind: 'chapter', chapter: 1, level: 1 }, objective: { kind: 'ttk-p90' } })).toBe(RETIRED_GOAL_REASON);
    expect(retiredGoalBlock(null)).toBe('');
    expect(retiredGoalBlock({})).toBe('');
  });

  it('loading the settings of a retired run (were the button not disabled) lands on a valid setup', () => {
    const s = setupFromRun(savedRun('ttk-p90'), character());
    expect(s.objective).toEqual({ kind: 'win-chance' });
  });
});
