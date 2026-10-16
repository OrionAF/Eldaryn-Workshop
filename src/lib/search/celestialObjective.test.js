// The Celestial Trial as an optimiser target (backlog §11, simulation.md §Celestial Trial): spec validation,
// partner resolution and keys, the win-rate sample with the partner fixed, tank / starter mapping, CRN, and a
// bounded optimise run on the real fixtures (the user's Sentinel and the Warrior's TANK preset, as
// __fixtures__/real/celestialParties.js builds them).
import { describe, it, expect } from 'vitest';
import sentinel from '../__fixtures__/real/profile-sentinel-l85-oct15b.json';
import warrior from '../__fixtures__/real/profile-warrior-l73.json';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import { buildFighter } from '../build/fighter.js';
import { cloneAsOpponent } from '../features/duel.js';
import { fightRng } from '../engine/rng.js';
import { simulateCelestial, celestialMaxHoldCount, defaultTankIndex, CELESTIAL_ASSUMPTIONS } from '../engine/pve/celestial.js';
import { CELESTIAL_TACTICS } from '../game/celestial.js';
import { resolveTarget, makeObjective, objectiveKindsFor, goalRetired } from './objectives.js';
import { targetOut } from './result.js';
import {
  resolveRosterPartner, rosterPartnerFor, celestialRunner, celestialFightScore, defaultCelestialTactics, ME, PARTNER,
} from './celestialObjective.js';
import { prepare, optimize } from './search.js';
import { BLOCKS } from './space.js';
import { normaliseSetup, requestOf } from '../ui/optimiserSetup.js';
import { KERNELS } from '../tasks/kernels.js';

const NOW = '2026-10-15T00:00:00.000Z';
const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW }));
const warriorChar = normaliseCharacter(gameProfileToCharacter(warrior, { now: NOW }));
const tankPreset = warriorChar.presets.find((p) => p.name === 'TANK');
const roster = [me, warriorChar];
const rosterRef = { source: 'character', characterId: warriorChar.id, presetId: tankPreset.id };
const rosterPartner = resolveRosterPartner(rosterRef, roster);
// the Warrior's TANK preset typed in as one of my opponents (its sheet taken as given)
const opponent = { ...cloneAsOpponent(warriorChar, tankPreset.id, 'WARRIOR_TANK', 'Tin Can'), id: 'opp-tin' };
const meWithOpp = { ...me, opponents: [opponent] };
const myFighter = buildFighter(me, me.activePresetId);

const hard = (o = {}) => ({ kind: 'celestial', difficulty: 'HARD', partner: rosterRef, ...o });
const resolveHard = (o = {}, ctx = {}) => resolveTarget(hard(o), { character: me, partner: rosterPartner, ...ctx });

describe('Celestial target spec', () => {
  it('defaults: tank auto, starter me, the catalogue tactics, the party\'s highest level; label and fidelity', () => {
    const t = resolveHard();
    expect(t.spec).toEqual({
      kind: 'celestial', difficulty: 'HARD', partner: rosterRef, tank: 'auto', starter: 'me',
      tactics: { focus: CELESTIAL_TACTICS.CELESTIAL_FINDER_DEFAULT_TACTICS.HARD.focus, holdCount: CELESTIAL_TACTICS.CELESTIAL_FINDER_DEFAULT_TACTICS.HARD.holdCount },
    });
    expect(t.celestial.level).toBe(85); // the Sentinel's 85 over the Warrior's 73
    expect(t.label).toBe(`Celestial Trial (HARD, L85, with ${warriorChar.name})`);
    expect(t.fidelity).toBe('server-model');
    expect(t.mode).toBe('celestial');
    expect(t.realm).toBe('base');
    expect([t.maxMs, t.seconds]).toEqual([360000, 360]);
    const ids = t.assumptions.map((a) => a.id);
    for (const a of Object.values(CELESTIAL_ASSUMPTIONS)) expect(ids).toContain(a.key);
    expect(t.assumptions.find((a) => a.id === 'celestial-partner').label).toMatch(/your characters/);
    expect(targetOut(t).assumptions.find((a) => a.id === 'celestial-server').tag).toBe('SERVER');
    // an explicit level is echoed and wins; NORMAL has its own default hold count
    expect(resolveHard({ level: 95 }).label).toBe(`Celestial Trial (HARD, L95, with ${warriorChar.name})`);
    expect(resolveHard({ difficulty: 'NORMAL' }).spec.tactics).toEqual(defaultCelestialTactics('NORMAL'));
    expect(resolveTarget({ kind: 'celestial', difficulty: 'NORMAL', partner: null }, { character: me }).label).toBe('Celestial Trial (NORMAL, L85, solo)');
  });

  it('validates every field with a clear error', () => {
    const bad = (o) => () => resolveHard(o);
    expect(bad({ difficulty: 'MYTHIC' })).toThrow(/MYTHIC is not simulated/);
    expect(bad({ difficulty: undefined })).toThrow(/difficulty/);
    expect(bad({ difficulty: 'EASY' })).toThrow(/difficulty/);
    expect(bad({ level: 39 })).toThrow(/level/);
    expect(bad({ level: 85.5 })).toThrow(/level/);
    expect(bad({ tank: 'boss' })).toThrow(/tank/);
    expect(bad({ starter: 'auto' })).toThrow(/starter/);
    expect(bad({ partner: { source: 'ranking', id: 'x' } })).toThrow(/partner source/);
    expect(bad({ partner: { source: 'character', characterId: 'x' } })).toThrow(/presetId/);
    expect(bad({ partner: { source: 'opponent' } })).toThrow(/opponentId/);
    expect(bad({ partner: 'Tin Can' })).toThrow(/partner/);
    expect(bad({ tactics: { focus: 'ADDS' } })).toThrow(/focus/);
    expect(bad({ tactics: { holdCount: 0 } })).toThrow(/hold count/);
    expect(bad({ tactics: { holdCount: celestialMaxHoldCount('HARD') + 1 } })).toThrow(/hold count/);
    expect(bad({ tactics: { holdCount: 2.5 } })).toThrow(/hold count/);
    expect(bad({ tactics: 'HOLD' })).toThrow(/tactics/);
    expect(bad({ partner: null, tank: 'partner' })).toThrow(/solo/);
    expect(bad({ partner: null, starter: 'partner' })).toThrow(/solo/);
    expect(resolveHard({ tactics: { focus: 'BOSS' } }).spec.tactics).toEqual({ focus: 'BOSS', holdCount: defaultCelestialTactics('HARD').holdCount });
  });

  it('is scored by the win-rate family and Push; dps is refused', () => {
    expect(objectiveKindsFor('celestial')).toEqual(['win-chance', 'win-rate', 'push']);
    expect(goalRetired('celestial', 'push')).toBe(false);
    expect(goalRetired('celestial', 'dps')).toBe(true);
    expect(() => makeObjective({ kind: 'dps' }, resolveHard())).toThrow(/cannot score/);
    expect(makeObjective({ kind: 'push', target: 0.9 }, resolveHard()).spec).toEqual({ kind: 'push', target: 0.9 });
    expect(makeObjective({ kind: 'win-rate', target: 0.9 }, resolveHard()).label).toBe('Win rate (target 90%)');
  });

  it('a level below the difficulty own unlock is refused (NORMAL 40, HARD 60)', () => {
    expect(() => resolveHard({ level: 59 })).toThrow(/from 60/);
    expect(resolveHard({ level: 60 }).celestial.level).toBe(60);
    expect(resolveHard({ difficulty: 'NORMAL', level: 40 }).celestial.level).toBe(40);
  });
});

describe('Celestial partner', () => {
  it('a roster partner resolves from the other character\'s preset (plain JSON for the worker)', () => {
    expect(rosterPartner).toMatchObject({ source: 'character', characterId: warriorChar.id, presetId: tankPreset.id, name: warriorChar.name, presetName: 'TANK' });
    expect(rosterPartner.fighter.spec).toBe('WARRIOR_TANK');
    expect(JSON.parse(JSON.stringify(rosterPartner))).toEqual(rosterPartner);
    expect(rosterPartnerFor(hard(), roster)).toEqual(rosterPartner);
    expect(resolveHard().partner).toMatchObject({ source: 'character', name: warriorChar.name });
  });

  it('an opponent partner resolves from character.opponents; its sheet carries no level', () => {
    const t = resolveTarget(hard({ partner: { source: 'opponent', opponentId: 'opp-tin' } }), { character: meWithOpp });
    expect(t.label).toBe('Celestial Trial (HARD, L85, with Tin Can)');
    expect(t.partner.fighter.spec).toBe('WARRIOR_TANK');
    expect(t.assumptions.find((a) => a.id === 'celestial-partner').label).toMatch(/typed sheet is taken as given/);
    expect(() => resolveTarget(hard({ partner: { source: 'opponent', opponentId: 'gone' } }), { character: meWithOpp })).toThrow(/no longer saved/);
  });

  it('the target key, the seeds and the run key change when the partner\'s build changes', () => {
    const base = resolveHard();
    const stronger = { ...rosterPartner, fighter: { ...rosterPartner.fighter, stats: { ...rosterPartner.fighter.stats, totalAttack: rosterPartner.fighter.stats.totalAttack + 1 } } };
    const moved = resolveHard({}, { partner: stronger });
    expect(moved.key).not.toBe(base.key);
    expect(resolveHard().key).toBe(base.key);
    const req = (partner) => ({ character: me, partner, target: hard(), objective: { kind: 'win-chance' } });
    const a = prepare(req(rosterPartner));
    const b = prepare(req(stronger));
    expect(b.requestKey).not.toBe(a.requestKey);
    expect(b.seeds.search).not.toBe(a.seeds.search);
    expect(a.requestEcho.partnerKey).toBe(base.partner.key);
    // an opponent partner: editing its sheet changes the key too
    const opp = (v) => resolveTarget(hard({ partner: { source: 'opponent', opponentId: 'opp-tin' } }), {
      character: { ...me, opponents: [{ ...opponent, sheet: { ...opponent.sheet, values: { ...opponent.sheet.values, totalAttack: v } } }] },
    }).key;
    expect(opp(1000)).not.toBe(opp(1001));
  });

  it('a dangling reference is a clear error at resolve and normalises to no partner in a saved setup', () => {
    expect(rosterPartnerFor(hard(), [me])).toBeNull();
    expect(() => resolveTarget(hard(), { character: me })).toThrow(/missing \(it may have been deleted\)/);
    expect(() => resolveRosterPartner(rosterRef, [me])).toThrow(/no longer one of your characters/);
    expect(() => resolveRosterPartner({ ...rosterRef, presetId: 'gone' }, roster)).toThrow(/no such preset/);
    const saved = { target: hard({ tank: 'partner', starter: 'partner' }), objective: { kind: 'win-rate', target: 0.8 } };
    // the character is gone from the roster
    const s1 = normaliseSetup(saved, me, 'standard', [me]);
    expect(s1.target).toMatchObject({ kind: 'celestial', difficulty: 'HARD', partner: null, tank: 'auto', starter: 'me' });
    expect(s1.objective).toEqual({ kind: 'win-rate', target: 0.8 });
    // the preset is gone
    const gonePreset = { ...warriorChar, presets: warriorChar.presets.filter((p) => p.id !== tankPreset.id) };
    expect(normaliseSetup(saved, me, 'standard', [me, gonePreset]).target.partner).toBeNull();
    // the opponent is gone
    expect(normaliseSetup({ target: hard({ partner: { source: 'opponent', opponentId: 'gone' } }) }, me, 'standard', roster).target.partner).toBeNull();
    // still there: kept
    expect(normaliseSetup(saved, me, 'standard', roster).target).toMatchObject({ partner: rosterRef, tank: 'partner', starter: 'partner' });
    // a broken spec (MYTHIC) falls back to the default fight, never throws
    expect(normaliseSetup({ target: hard({ difficulty: 'MYTHIC' }) }, me, 'standard', roster).target.kind).toBe('dummy');
  });

  it('the worker request carries the resolved roster partner', () => {
    const setup = normaliseSetup({ target: hard(), objective: { kind: 'win-chance' } }, me, 'standard', roster);
    const r = requestOf(setup, me, roster);
    expect(r.partner).toEqual(rosterPartner);
    expect(requestOf(normaliseSetup({ target: { kind: 'dummy' } }, me), me, roster).partner).toBeUndefined();
  });
});

describe('Celestial objective', () => {
  it('the sample is the party clear with the partner fixed, fight i on fightRng(seed, i) (CRN)', () => {
    const t = resolveHard();
    const o = makeObjective({ kind: 'win-chance' }, t);
    const got = o.sample(myFighter, { seed: 7, from: 3, to: 6 }).main[0];
    const want = [3, 4, 5].map((i) => celestialFightScore(simulateCelestial({
      difficulty: 'HARD', party: [myFighter, rosterPartner.fighter], level: 85,
      tactics: defaultCelestialTactics('HARD'), stackPlayerIndex: 0, rng: fightRng(7, i),
    })));
    expect(got).toEqual(want);
    expect(o.sample(myFighter, { seed: 7, from: 3, to: 6 }).main[0]).toEqual(got);
    // a clear scores 1 + the party's HP share, a loss the boss HP share removed (< 1)
    expect(celestialFightScore({ won: true, playerMaxHps: [100, 300], hpLeft: [50, 150], bossHpLeft: 0, bossMaxHp: 10 })).toBe(1.5);
    expect(celestialFightScore({ won: false, playerMaxHps: [100], hpLeft: [0], bossHpLeft: 2.5, bossMaxHp: 10 })).toBe(0.75);
    expect(celestialFightScore({ won: false, playerMaxHps: [100], hpLeft: [0], bossHpLeft: 0, bossMaxHp: 10 })).toBeLessThan(1);
  });

  it('maps tank and starter to the engine\'s tankIndex and stackPlayerIndex (me 0, partner 1)', () => {
    expect([ME, PARTNER]).toEqual([0, 1]);
    const fightOf = (o) => celestialRunner(resolveHard(o))(myFighter).fight(fightRng(3, 0));
    expect(resolveHard({ tank: 'me' }).celestial.tankIndex).toBe(0);
    expect(resolveHard({ tank: 'partner' }).celestial.tankIndex).toBe(1);
    expect(resolveHard({ tank: 'auto' }).celestial.tankIndex).toBeUndefined();
    expect(fightOf({ tank: 'me' }).tankIndex).toBe(0);
    expect(fightOf({ tank: 'partner' }).tankIndex).toBe(1);
    // auto: the engine's own rule on the party (the Warrior's TANK spec)
    expect(fightOf({ tank: 'auto' }).tankIndex).toBe(defaultTankIndex([myFighter, rosterPartner.fighter]));
    expect(fightOf({ tank: 'auto' }).tankIndex).toBe(1);
    expect(resolveHard({ starter: 'me' }).celestial.stackPlayerIndex).toBe(0);
    expect(resolveHard({ starter: 'partner' }).celestial.stackPlayerIndex).toBe(1);
    const direct = (stackPlayerIndex) => simulateCelestial({
      difficulty: 'HARD', party: [myFighter, rosterPartner.fighter], level: 85, tactics: defaultCelestialTactics('HARD'), stackPlayerIndex, rng: fightRng(3, 0),
    });
    expect(fightOf({ starter: 'partner' })).toEqual(direct(1));
    expect(fightOf({ starter: 'me' })).toEqual(direct(0));
    // solo: a party of one, me tanking and starting
    const solo = celestialRunner(resolveTarget({ kind: 'celestial', difficulty: 'NORMAL', partner: null }, { character: me }))(myFighter);
    expect(solo.party).toHaveLength(1);
    expect(solo.fight(fightRng(1, 0)).tankIndex).toBe(0);
  });

  it('a pool worker rebuilds the same objective from the plain-JSON setup (partner included)', async () => {
    const setup = JSON.parse(JSON.stringify({ target: hard(), objective: { kind: 'win-chance' }, character: { opponents: [], level: me.level }, partner: rosterPartner }));
    const k = KERNELS.objective.prepare(setup);
    const chunk = await KERNELS.objective.run(k, { fighter: myFighter, seed: 5 }, 0, 2);
    expect(chunk.main).toEqual(makeObjective({ kind: 'win-chance' }, resolveHard()).sample(myFighter, { seed: 5, from: 0, to: 2 }).main);
  });

  it('prepare runs the search in PVE mode on the base realm', () => {
    const p = prepare({ character: me, partner: rosterPartner, target: hard(), objective: { kind: 'win-chance' }, realm: 'oblivion' });
    expect(p.mode).toBe('pve');
    expect(p.realm).toBe('base');
    expect(p.objective.goal).toBe('max');
  });
});

const optimiseRequest = (block, effort) => ({
  character: me, partner: rosterPartner, presetId: me.activePresetId,
  target: hard({ level: 85 }), objective: { kind: 'win-chance' },
  space: Object.fromEntries(BLOCKS.map((b) => [b, b === block])), effort, seed: 1,
});
const expectValidResult = (res) => {
  expect(res.status).toBe('done');
  expect(res.target).toMatchObject({ kind: 'celestial', label: `Celestial Trial (HARD, L85, with ${warriorChar.name})`, fidelity: 'server-model' });
  expect(res.request.partnerKey).toBe(resolveHard().partner.key);
  expect(res.objective.kind).toBe('win-chance');
  expect(res.baseline.value.est).toBeGreaterThanOrEqual(0);
  expect(res.baseline.value.est).toBeLessThanOrEqual(1);
  expect(typeof res.headline.text).toBe('string');
};

describe('Celestial optimise run (real fixtures)', () => {
  it('a bounded mount-only run on HARD level 85 with the Warrior tank returns a valid result (seconds)', async () => {
    expectValidResult(await optimize(optimiseRequest('mount', { level: 'quick', n0: 8, maxN: 8 })));
  }, 60_000);
});

// The sigils-only run takes about four minutes (every set clears HARD L85 with this tank, so the minimise
// phase measures many equal builds at 25 ms a fight): CELESTIAL_E2E=1 npx vitest run src/lib/search/celestialObjective.test.js
describe.skipIf(!process.env.CELESTIAL_E2E)('Celestial optimise run, sigils only (slow)', () => {
  it('a bounded sigils-only run on HARD level 85 with the Warrior tank returns a valid result', async () => {
    expectValidResult(await optimize(optimiseRequest('sigils', { level: 'quick', n0: 8, maxN: 16 })));
  }, 900_000);
});
