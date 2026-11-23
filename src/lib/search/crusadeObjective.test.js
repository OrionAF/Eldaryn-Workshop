// The Crusade as an optimiser target (backlog §10, simulation.md §Crusade): spec validation and the solo
// rule, label and fidelity, the win-rate and stones samples on the port with common random numbers, the pool
// kernel, and a bounded optimise on the user's Sentinel (profile-sentinel-l85-oct15b).
import { describe, it, expect } from 'vitest';
import sentinel from '../__fixtures__/real/profile-sentinel-l85-oct15b.json';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import { buildFighter } from '../build/fighter.js';
import { fightRng } from '../engine/rng.js';
import { simulateCrusade, CRUSADE_ASSUMPTIONS, CRUSADE_TIME_LIMIT_MS } from '../engine/pve/crusade.js';
import { resolveTarget, makeObjective, objectiveKindsFor, goalRetired } from './objectives.js';
import { targetOut } from './result.js';
import { crusadeFightScore, crusadeStoneScore, crusadeSoloAllowed } from './crusadeObjective.js';
import { prepare, optimize } from './search.js';
import { BLOCKS } from './space.js';
import { normaliseSetup } from '../ui/optimiserSetup.js';
import { KERNELS } from '../tasks/kernels.js';

const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: '2026-10-15T00:00:00.000Z' }));
const myFighter = buildFighter(me, me.activePresetId);
// a build near the edge of a Normal solo clear (some runs clear, some time out), for samples that vary
const edge = {
  stats: {
    totalHp: 3_000_000, totalAttack: 16_500, totalAttackSpeed: 1, totalDoubleHit: 10, totalCritChance: 30,
    totalCritDamage: 2, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
    totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0, totalPvpDefense: 0,
  },
  class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [],
};
const normal = { kind: 'crusade', difficulty: 'NORMAL' };

describe('Crusade target spec', () => {
  it('a solo Normal run: label, key, window, server-model fidelity and tagged assumptions', () => {
    const t = resolveTarget(normal);
    expect(t.spec).toEqual(normal);
    expect(t.label).toBe('Crusade Normal, solo');
    expect(t.fidelity).toBe('server-model');
    expect(t.mode).toBe('crusade');
    expect(t.realm).toBe('base');
    expect([t.maxMs, t.seconds]).toEqual([CRUSADE_TIME_LIMIT_MS, 300]);
    expect(t.crusade).toEqual({ difficulty: 'NORMAL', mythicPlus: 0, playerCount: 1 });
    expect(t.enemy.map((m) => m.hp)).toEqual([1555200, 2332800, 2974320]);
    expect(t.assumptions.map((a) => a.id)).toEqual(Object.values(CRUSADE_ASSUMPTIONS).map((a) => a.key));
    const tags = Object.fromEntries(targetOut(t).assumptions.map((a) => [a.id, a.tag]));
    expect(tags).toEqual({ 'crusade-server-fight': 'UNRESOLVED', 'crusade-solo-scaling': 'SERVER', 'crusade-drops': 'SERVER' });
  });

  it('validates like the other kinds; Hard and Mythic (Mythic+ too) have no solo run', () => {
    expect(() => resolveTarget({ kind: 'crusade' })).toThrow(/unknown Crusade difficulty/);
    expect(() => resolveTarget({ kind: 'crusade', difficulty: 'EASY' })).toThrow(/unknown Crusade difficulty/);
    expect(() => resolveTarget({ kind: 'crusade', difficulty: 'NORMAL', mythicPlus: 2 })).toThrow(/needs the Mythic difficulty/);
    expect(() => resolveTarget({ kind: 'crusade', difficulty: 'MYTHIC', mythicPlus: 0 })).toThrow(/whole number from 1/);
    expect(() => resolveTarget({ kind: 'crusade', difficulty: 'MYTHIC', mythicPlus: 2.5 })).toThrow(/whole number from 1/);
    expect(() => resolveTarget({ kind: 'crusade', difficulty: 'HARD' })).toThrow(/Crusade Hard needs a party of 2: the game offers a solo run on Normal only/);
    expect(() => resolveTarget({ kind: 'crusade', difficulty: 'MYTHIC', mythicPlus: 4 })).toThrow(/Crusade Mythic\+4 needs a party of 3/);
    expect(['NORMAL', 'HARD', 'MYTHIC'].map(crusadeSoloAllowed)).toEqual([true, false, false]);
    // a stored setup with a party-only Crusade falls back to the default fight
    expect(normaliseSetup({ target: { kind: 'crusade', difficulty: 'HARD' } }, me).target.kind).toBe('dummy');
    expect(normaliseSetup({ target: normal, objective: { kind: 'stones' } }, me)).toMatchObject({ target: normal, objective: { kind: 'stones' } });
  });

  it('offers the win-rate family (highest chance to win first) and expected stones; nothing else scores it', () => {
    expect(objectiveKindsFor('crusade')).toEqual(['win-chance', 'win-rate', 'stones']);
    expect(normaliseSetup({ target: normal }, me).objective).toEqual({ kind: 'win-chance' });
    const t = resolveTarget(normal);
    expect(() => makeObjective({ kind: 'dps' }, t)).toThrow(/cannot score/);
    expect(() => makeObjective({ kind: 'push' }, t)).toThrow(/cannot score/);
    expect(() => makeObjective({ kind: 'stones' }, resolveTarget({ kind: 'dungeon', id: 'dungeon_1', step: 1 }))).toThrow(/cannot score/);
    expect(goalRetired('crusade', 'stones')).toBe(false);
    expect(makeObjective({ kind: 'win-rate', target: 0.9 }, t)).toMatchObject({ goal: 'target', target: 0.9, label: 'Win rate (target 90%)' });
    expect(makeObjective({ kind: 'stones' }, t)).toMatchObject({ label: 'Expected enchant stones per run', unit: 'stones', statistic: 'mean', deltaKind: 'absolute' });
  });
});

describe('Crusade objectives', () => {
  it('the win-rate sample is the solo run, fight i on fightRng(seed, i) (CRN), and shards merge by index', () => {
    const t = resolveTarget(normal);
    const o = makeObjective({ kind: 'win-chance' }, t);
    const runs = [0, 1, 2, 3, 4, 5].map((i) => simulateCrusade({ party: [edge], difficulty: 'NORMAL', rng: fightRng(11, i) }));
    const got = o.sample(edge, { seed: 11, from: 0, to: 6 }).main[0];
    expect(got).toEqual(runs.map(crusadeFightScore));
    expect(o.sample(edge, { seed: 11, from: 2, to: 6 }).main[0]).toEqual(got.slice(2));
    // the edge build both clears and fails across these seeds, so the scores straddle 1
    expect(got.some((x) => x >= 1)).toBe(true);
    expect(got.some((x) => x < 1)).toBe(true);
    // a clear scores 1 + the share of the time budget left, a failed run the share of boss HP removed
    expect(crusadeFightScore({ success: true, totalDuration: 75000, timeLimitMs: 300000 })).toBe(1.75);
    expect(crusadeFightScore({ success: false, damageDealt: 3, bossHpTotal: 4 })).toBe(0.75);
    expect(crusadeFightScore({ success: false, damageDealt: 4, bossHpTotal: 4 })).toBeLessThan(1);
    // the estimate is the clear rate
    const est = o.estimate({ main: [got], n: got.length }).value.est;
    const clears = runs.filter((r) => r.success).length;
    expect(est).toBeCloseTo(clears / runs.length, 12);
  });

  it('the stones sample is each run\'s expected stones from the drop table (0.10 / 0.25 / 0.35 solo Normal)', () => {
    const t = resolveTarget(normal);
    const o = makeObjective({ kind: 'stones' }, t);
    const got = o.sample(edge, { seed: 11, from: 0, to: 6 }).main[0];
    const runs = [0, 1, 2, 3, 4, 5].map((i) => simulateCrusade({ party: [edge], difficulty: 'NORMAL', rng: fightRng(11, i) }));
    expect(got).toEqual(runs.map(crusadeStoneScore));
    for (const x of got) expect([0, 0.1, 0.25, 0.35]).toContain(x);
    expect(o.measure(myFighter, { n: 4, seed: 1 }).value).toBeCloseTo(0.35, 12); // the Sentinel clears every run
  });

  it('a pool worker rebuilds the same objective from the plain-JSON setup', async () => {
    const setup = JSON.parse(JSON.stringify({ target: normal, objective: { kind: 'stones' }, character: { opponents: [], level: me.level } }));
    const k = KERNELS.objective.prepare(setup);
    const chunk = await KERNELS.objective.run(k, { fighter: edge, seed: 5 }, 0, 3);
    expect(chunk.main).toEqual(makeObjective({ kind: 'stones' }, resolveTarget(normal)).sample(edge, { seed: 5, from: 0, to: 3 }).main);
  });

  it('prepare runs the search in PVE mode on the base realm', () => {
    const p = prepare({ character: me, target: normal, objective: { kind: 'win-chance' }, realm: 'oblivion' });
    expect(p.mode).toBe('pve');
    expect(p.realm).toBe('base');
    expect(p.objective.goal).toBe('max');
  });
});

describe('Crusade optimise run (real fixture)', () => {
  it('a bounded mount-only run on the Sentinel returns a valid result', async () => {
    const res = await optimize({
      character: me, presetId: me.activePresetId, target: normal, objective: { kind: 'win-chance' },
      space: Object.fromEntries(BLOCKS.map((b) => [b, b === 'mount'])), effort: { level: 'quick', n0: 8, maxN: 8 }, seed: 1,
    });
    expect(res.status).toBe('done');
    expect(res.target).toMatchObject({ kind: 'crusade', label: 'Crusade Normal, solo', fidelity: 'server-model' });
    expect(res.objective.kind).toBe('win-chance');
    expect(res.baseline.value.est).toBe(1); // the Sentinel one-shots every Normal boss
    expect(typeof res.headline.text).toBe('string');
  }, 60_000);

  it('the stones objective runs too', async () => {
    const res = await optimize({
      character: me, presetId: me.activePresetId, target: normal, objective: { kind: 'stones' },
      space: Object.fromEntries(BLOCKS.map((b) => [b, b === 'mount'])), effort: { level: 'quick', n0: 8, maxN: 8 }, seed: 1,
    });
    expect(res.status).toBe('done');
    expect(res.objective).toMatchObject({ kind: 'stones', unit: 'stones' });
    expect(res.baseline.value.est).toBeCloseTo(0.35, 12);
  }, 60_000);
});
