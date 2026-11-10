import { describe, it, expect, beforeEach } from 'vitest';
import { deepCheck, reusableRun, winnerOf, confirmSeed, DEEP_SPACES } from './deepCheck.js';
import { dropDeepCheck } from '../tasks/deepCheck.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';
import { BLOCKS } from '../search/space.js';
import { metricKey, clearMetricCache } from '../engine/metrics.js';
import { searchCharacter, runIsStale } from '../ui/optimiserSetup.js';

beforeEach(() => clearMetricCache());

const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));
const TINY = { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 };
const GOAL = { id: 'dps', target: { kind: 'dummy', seconds: 10 }, objective: { kind: 'dps' } };
const warrior = () => normaliseCharacter(JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR'))));
const weaponOf = (c, attack) => ({ ...JSON.parse(JSON.stringify(c.equipment.set1.items.WEAPON)), primaryStats: { attack, hp: 0 } });
const req = (c, o = {}) => ({
  character: c, presetId: c.presets[0].id, drop: { slot: 'WEAPON', realm: 'base', item: weaponOf(c, 400000) }, goal: GOAL,
  space: only(), effort: TINY, seed: 3, precision: 'quick', n0: 16, maxN: 64, ...o,
});
const stable = (r) => JSON.parse(JSON.stringify(r, (k, v) => (k === 'ms' ? 0 : v)));

describe('deepCheck', () => {
  it('a much stronger weapon is an upgrade after both re-tunes, and the run is deterministic', async () => {
    const c = warrior();
    const a = await deepCheck(req(c));
    expect(a).toMatchObject({ schema: 'deep-check/1', status: 'done', verdict: 'upgrade', setKey: 'set1', reason: null });
    expect(a.drop.delta.delta).toBeGreaterThan(0);
    expect(a.with.wearsDrop).toBe(true);
    expect(stable(await deepCheck(req(c)))).toEqual(stable(a));
  });

  it('confirms on a seed that is none of the search seeds', async () => {
    const r = await deepCheck(req(warrior()));
    expect(r.seed.confirm).toBe(confirmSeed(3));
    expect(Object.values(r.seed.search)).not.toContain(r.seed.confirm);
  });

  it('an item the re-tune never wears (the preset moves to the other set) is a sidegrade', async () => {
    // set 2 a copy of set 1, so once the weak drop replaces set 1's weapon, set 2 is the better set
    const raw = JSON.parse(JSON.stringify(warrior()));
    raw.equipment.set2.items = JSON.parse(JSON.stringify(raw.equipment.set1.items));
    raw.equipment.set2.enchantSlots = JSON.parse(JSON.stringify(raw.equipment.set1.enchantSlots));
    const c = normaliseCharacter(raw);
    const r = await deepCheck(req(c, { drop: { slot: 'WEAPON', realm: 'base', item: weaponOf(c, 1) }, space: only('equipmentSet') }));
    expect(r.with.wearsDrop).toBe(false);
    expect(r).toMatchObject({ verdict: 'sidegrade', reason: 'unworn' });
  });

  it('reuses a given W0 candidate instead of optimising without the drop', async () => {
    const c = warrior();
    const r = await deepCheck(req(c, { reuse: { runId: 'run-1', candidate: (await deepCheck(req(c))).without.candidate } }));
    expect(r.without.run).toMatchObject({ reused: true, runId: 'run-1' });
    expect(r.status).toBe('done');
  });

  it('cancel during the run with the drop returns W0 alone, as partial', async () => {
    const ctl = new AbortController();
    const r = await deepCheck(req(warrior()), { signal: ctl.signal, onProgress: (p) => { if (p.phase === 'with') ctl.abort(); } });
    expect(r).toMatchObject({ status: 'cancelled', aborted: true, partial: true });
    expect(r.without.candidate).toBeTruthy();
    expect(r.with).toBeUndefined();
  });

  it('checks the profile guards on the re-tuned build with the drop', async () => {
    const guard = { id: 'gd', target: { kind: 'chapter', chapter: 1, level: 2 }, objective: { kind: 'win-chance' }, role: 'guard', guard: { target: 0.5 } };
    const r = await deepCheck(req(warrior(), { guards: [guard] }));
    expect(r.guards[0]).toMatchObject({ goalId: 'gd', role: 'guard' });
    expect(['pass', 'below', 'unresolved', 'fail']).toContain(r.guards[0].guard.status);
  });

  it('runs through the worker task inline (no pool)', async () => {
    const r = await dropDeepCheck(req(warrior()));
    expect(r.status).toBe('done');
  });

  it('Light searches only the blocks gear stats interact with', () => {
    expect(Object.entries(DEEP_SPACES.light).filter(([, on]) => on).map(([b]) => b).sort()).toEqual(['ancient', 'conditions', 'relics', 'sigils', 'stones', 'talents', 'utility']);
  });
});

describe('reusableRun and winnerOf', () => {
  const c = warrior();
  const pid = c.presets[0].id;
  const run = (o = {}) => ({
    schema: 2, id: 'r1', presetId: pid, headline: { aborted: false }, target: { kind: 'dummy', key: null }, objective: { kind: 'dps' },
    space: only(...BLOCKS.filter((b) => !['relicUpgrades', 'relicPurchases', 'awakening'].includes(b))),
    characterKey: metricKey('character', searchCharacter(c)),
    detail: { baseline: { candidate: { b: 1 } }, rows: [{ rank: 1, isBaseline: false, candidate: { x: 1 }, vsBaseline: { verdict: 'better' } }] }, ...o,
  });
  const isCurrent = (r) => !runIsStale(r, c);

  it('matches a current run of the same preset, goal and space, and returns its winner', async () => {
    const { resolveTarget } = await import('../search/objectives.js');
    const tk = resolveTarget(GOAL.target, { character: c }).key;
    expect(reusableRun([run({ target: { kind: 'dummy', key: tk } })], { presetId: pid, goal: GOAL, character: c, isCurrent })).toEqual({ runId: 'r1', candidate: { x: 1 } });
    // a changed character, another preset, another target, another space, or a cancelled run: no reuse
    expect(reusableRun([run({ target: { key: tk }, characterKey: 'old' })], { presetId: pid, goal: GOAL, character: c, isCurrent })).toBeNull();
    expect(reusableRun([run({ target: { key: tk }, presetId: 'other' })], { presetId: pid, goal: GOAL, character: c, isCurrent })).toBeNull();
    expect(reusableRun([run({ target: { key: 'x' } })], { presetId: pid, goal: GOAL, character: c, isCurrent })).toBeNull();
    expect(reusableRun([run({ target: { key: tk } })], { presetId: pid, goal: GOAL, space: DEEP_SPACES.light, character: c, isCurrent })).toBeNull();
    expect(reusableRun([run({ target: { key: tk }, headline: { aborted: true } })], { presetId: pid, goal: GOAL, character: c, isCurrent })).toBeNull();
  });

  it('winnerOf: the top row only when it beats the current build', () => {
    expect(winnerOf({ rows: [{ candidate: 'a', vsBaseline: { verdict: 'better' } }], baseline: { candidate: 'b' } })).toBe('a');
    expect(winnerOf({ rows: [{ candidate: 'a', vsBaseline: { verdict: 'equivalent' } }], baseline: { candidate: 'b' } })).toBe('b');
    expect(winnerOf({ rows: [], baseline: { candidate: 'b' } })).toBe('b');
  });
});
