import { describe, it, expect } from 'vitest';
import { defaultSetup, normaliseSetup, setupFromRun, requestOf, searchCharacter, signatureOf } from './optimiserSetup.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { cloneAsOpponent } from '../features/duel.js';
import { SPACE_DEFAULTS } from '../search/space.js';
import { runFromResult } from '../model/runs.js';
import { richResult } from '../__fixtures__/optimiser/index.js';

const character = (fn) => {
  const raw = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
  fn?.(raw);
  return normaliseCharacter(raw);
};
const withOpponent = () => character((raw) => {
  raw.opponents = [{ ...cloneAsOpponent(fixtureCharacter('WARRIOR'), 'p1', 'WARRIOR_TANK', 'Tanky'), id: 'opp-a' }];
});

describe('normaliseSetup', () => {
  it('defaults: dummy DPS, every block on, the preferred effort', () => {
    const s = normaliseSetup(null, character(), 'thorough');
    expect(s).toMatchObject({ presetId: 'p1', target: { kind: 'dummy', seconds: 60 }, objective: { kind: 'dps' }, effort: 'thorough', seed: 1 });
    expect(s.space).toEqual(SPACE_DEFAULTS);
  });
  it('an unknown preset falls back to the active one; a bad effort and seed to the defaults', () => {
    const s = normaliseSetup({ presetId: 'gone', effort: 'warp', seed: -3 }, character());
    expect(s.presetId).toBe('p1');
    expect(s.effort).toBe('standard');
    expect(s.seed).toBe(1);
  });
  it('a target that does not resolve falls back, and the objective follows the target', () => {
    expect(normaliseSetup({ target: { kind: 'chapter', chapter: 99, level: 1 } }, character()).target.kind).toBe('dummy');
    const s = normaliseSetup({ target: { kind: 'chapter', chapter: 3, level: 2 }, objective: { kind: 'dps' } }, character());
    expect(s.target).toEqual({ kind: 'chapter', chapter: 3, level: 2 });
    expect(s.objective.kind).toBe('ttk-median');
  });
  it('accepts a hard dungeon target', () => {
    const s = normaliseSetup({ target: { kind: 'dungeon', id: 'dungeon_2_hard', step: 3 }, objective: { kind: 'ttk-p90' } }, character());
    expect(s.target).toEqual({ kind: 'dungeon', id: 'dungeon_2_hard', step: 3 });
    expect(s.objective.kind).toBe('ttk-p90');
  });
  it('deleted opponents drop out of a PVP target', () => {
    const c = withOpponent();
    const s = normaliseSetup({ target: { kind: 'pvp', opponentIds: ['opp-a', 'ghost'], seats: 'both' }, objective: { kind: 'pvp-winrate' } }, c);
    expect(s.target).toEqual({ kind: 'pvp', opponentIds: ['opp-a'], seats: 'both' });
    expect(s.objective.kind).toBe('pvp-winrate');
  });
  it('keeps unticked blocks as explicit false and ignores unknown keys', () => {
    const s = normaliseSetup({ space: { relics: false, nonsense: true } }, character());
    expect(s.space.relics).toBe(false);
    expect(s.space.nonsense).toBeUndefined();
  });
});

describe('setupFromRun', () => {
  it('rebuilds the setup a schema 2 run was made with, without the echoed result keys', () => {
    const run = runFromResult(richResult(), { id: 'r1' });
    run.presetId = 'p1';
    const s = setupFromRun(run, character());
    expect(s.target).toEqual({ kind: 'dummy', seconds: 10 });
    expect(s.objective).toEqual({ kind: 'dps' });
    expect(s.effort).toBe('quick');
    expect(s.seed).toBe(2);
    expect(s.space.relics).toBe(true);
  });
});

describe('request and signature', () => {
  it('the request carries no saved runs, so recording a run does not change the characterKey', () => {
    const c = character();
    const withRun = { ...c, runs: [runFromResult(richResult(), { id: 'r1' })] };
    const s = defaultSetup();
    s.presetId = 'p1';
    expect(requestOf(s, withRun).character.runs).toEqual([]);
    expect(signatureOf(withRun, 'p1')).toBe(signatureOf(c, 'p1'));
  });
  it('is stale once the character is edited', () => {
    const c = character();
    const edited = character((raw) => { raw.presets[0].relicIds = []; });
    expect(signatureOf(edited, 'p1')).not.toBe(signatureOf(c, 'p1'));
  });
  it('sends every toggle, the effort level and the seed, and no retired budget key', () => {
    const s = { ...defaultSetup('quick'), presetId: 'p1', seed: 5 };
    const req = requestOf(s, character());
    expect(req).toMatchObject({ mode: 'optimize', presetId: 'p1', effort: 'quick', seed: 5 });
    expect(Object.keys(req.space).sort()).toEqual(Object.keys(SPACE_DEFAULTS).sort());
    for (const k of ['maxMs', 'finalMs', 'maxEvals', 'maxPasses', 'budget']) expect(req).not.toHaveProperty(k);
  });
  it('searchCharacter detaches from the source', () => {
    const c = character();
    expect(searchCharacter(c)).not.toBe(c);
  });
});
