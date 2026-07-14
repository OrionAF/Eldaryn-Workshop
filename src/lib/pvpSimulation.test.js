import { describe, it, expect } from 'vitest';
import { offensiveStats } from './dps.js';
import { mulberry32 } from './simulation.js';
import {
  buildPvpSide,
  capStats,
  resolvePvpSigils,
  runPvpSingle,
  runPvpSimulation,
  runTracedDuel,
  rateCiHalfWidth,
  PVP_SIGIL_MECHANICS,
} from './pvpSimulation.js';

// A plain brawler: 1 swing/s, 100 damage, decent HP, no procs.
function side(overrides = {}) {
  return buildPvpSide({
    stats: offensiveStats({ attack: 100, health: 10000, speed: 100, crit_mult: 150, ...overrides }),
  });
}

const rng = () => mulberry32(42);

describe('capStats', () => {
  it('clamps capped stats and leaves uncapped ones alone', () => {
    const capped = capStats(offensiveStats({ miss_chance: 95, blind_chance: 90, crit: 200, attack: 1e9, lifesteal: 500 }));
    expect(capped.miss_chance).toBe(70); // Miss Chance hard cap lowered to 70 in constants.js
    expect(capped.blind_chance).toBe(40);
    expect(capped.crit).toBe(80);
    expect(capped.attack).toBe(1e9);
    expect(capped.lifesteal).toBe(500);
  });
});

describe('runPvpSingle - core resolution', () => {
  it('a defenseless mirror match ends when someone dies', () => {
    const result = runPvpSingle(side(), side(), { rng: rng() });
    // 100 dmg/s vs 10000 HP -> death around 100s... capped at 60s: draw territory.
    // Give the player lethal stats instead:
    const strong = side({ attack: 1000 });
    const r2 = runPvpSingle(strong, side(), { rng: rng() });
    expect(r2.winner).toBe('player');
    expect(r2.diedEarly).toBe(true);
    expect(r2.endTime).toBeLessThan(60);
    expect(r2.opponent.hpRemaining).toBe(0);
    expect(result.winner).toBe('draw'); // identical sides, no rng-affected mechanics
  });

  it('100% miss chance means the attacker never lands a hit', () => {
    const dodger = side({ miss_chance: 80 });
    dodger.stats.miss_chance = 100; // simulate an over-cap state directly
    const result = runPvpSingle(side({ attack: 99999 }), dodger, { rng: rng() });
    expect(result.player.damageDealt).toBe(0);
    expect(result.player.dodgedByEnemy).toBeGreaterThan(0);
    expect(result.winner).not.toBe('player');
  });

  it('a block with zero penetration deals nothing; penetration pierces pre-crit base', () => {
    const blocker = side();
    blocker.stats.block_chance = 100;
    const noPen = runPvpSingle(side({ attack: 1000 }), blocker, { rng: rng(), durationSeconds: 10 });
    expect(noPen.player.damageDealt).toBe(0);

    const pierced = runPvpSingle(side({ attack: 1000, penetration: 50 }), blocker, { rng: rng(), durationSeconds: 10 });
    // Every hit blocked, 50% of base 1000 goes through: 500 per swing, 10 swings scheduled at 0..9
    expect(pierced.player.damageDealt).toBeCloseTo(500 * 10, 5);
  });

  it('the PVP damage chain matches the CONTEXT.md worked example', () => {
    const attacker = side({ attack: 862534, pvp_attack: 303 });
    const defender = side({ health: 1e12, dmg_reduction: 9.9, pvp_defense: 283 });
    const result = runPvpSingle(attacker, defender, { rng: () => 0.999, durationSeconds: 1.5 });
    // One swing at t=0 (rng 0.999 -> no miss/block/crit/procs), 1.5s horizon -> swings at 0 and 1.
    const perHit = 862534 * (1 - 0.099) * (1 + 303 / 503) * (1 - 283 / 483);
    expect(result.player.damageDealt / 2).toBeCloseTo(perHit, 0);
    expect(perHit).toBeCloseTo(515248, -3); // ~515,248 per the doc
  });

  it('blind consumes exactly one enemy swing per stack', () => {
    // Attacker always blinds (roll < 100%), defender deals damage otherwise.
    const blinder = side({ attack: 1, blind_chance: 40 });
    blinder.stats.blind_chance = 100;
    const victim = side({ attack: 50 });
    const result = runPvpSingle(blinder, victim, { rng: rng(), durationSeconds: 20 });
    // Victim's first swing at t=0 happens before any blind lands... every
    // subsequent swing is blinded (blinder lands a hit every second).
    expect(result.opponent.blindedSwings).toBeGreaterThan(0);
    expect(result.opponent.damageDealt).toBeLessThan(50 * 20);
  });

  it('paralyze skips enemy swings for its window', () => {
    const stunner = side({ attack: 1 });
    stunner.stats.paralyze_chance = 100;
    const result = runPvpSingle(stunner, side({ attack: 50 }), { rng: rng(), durationSeconds: 20 });
    expect(result.opponent.paralyzedSwings).toBeGreaterThan(0);
  });

  it('health multiplier scales both HP pools', () => {
    const strong = side({ attack: 2000 });
    const single = runPvpSingle(strong, side(), { rng: rng() });
    const triple = runPvpSingle(strong, side(), { rng: rng(), healthMultiplier: 3 });
    expect(triple.endTime).toBeGreaterThan(single.endTime);
  });

  it('HP regen heals each second and lifesteal heals on damage dealt', () => {
    const regen = side({ hp_regen: 10 });
    const r = runPvpSingle(regen, side({ attack: 100 }), { rng: rng(), durationSeconds: 10 });
    expect(r.player.healed).toBeGreaterThan(0);

    const leech = side({ attack: 500, lifesteal: 50 });
    const hurt = runPvpSingle(side({ attack: 400 }), leech, { rng: rng(), durationSeconds: 10 });
    expect(hurt.opponent.healed).toBeGreaterThan(0);
  });
});

describe('sigil actives in PVP', () => {
  it('a stat-buff sigil exceeds the cap during its window and reverts after', () => {
    // Sentinel phantom-veil: +miss_chance for 8s every 16s.
    const dodgerStats = offensiveStats({ attack: 1, health: 1e9, speed: 100, crit_mult: 150, miss_chance: 80 });
    const dodger = buildPvpSide({
      stats: dodgerStats,
      characterClass: 'Sentinel',
      sigilIds: ['phantom-veil'],
      sigilValues: { 'phantom-veil': { active: { miss_chance: 20 }, damage: 0, tickDamage: 0 } },
    });
    // Attacker rng draws a fixed 0.85: base miss 80% -> hit lands; buffed 100% -> dodged.
    const attacker = side({ attack: 100 });
    const fixed = () => 0.85;
    const result = runPvpSingle(attacker, dodger, { rng: fixed, durationSeconds: 16 });
    // Buff active 0-8s (8 swings dodged), inactive 8-16s (8 swings land).
    expect(result.player.dodgedByEnemy).toBe(8);
    expect(result.player.hits).toBe(8);
  });

  it('nuke sigil damage goes through the PVP chain but skips miss/block', () => {
    const nuker = buildPvpSide({
      stats: offensiveStats({ attack: 0, health: 1e9, speed: 100, crit_mult: 150 }),
      characterClass: 'Warrior',
      sigilIds: ['blade-of-judgment'],
      sigilValues: { 'blade-of-judgment': { active: {}, damage: 1000, tickDamage: 0 } },
    });
    const wall = side({ dmg_reduction: 50 });
    wall.stats.miss_chance = 100;
    wall.stats.block_chance = 100;
    // Activations at 1, 9 in a 10s fight (1s enemy-targeting delay); each 1000 * 0.5 = 500.
    const result = runPvpSingle(nuker, wall, { rng: rng(), durationSeconds: 10 });
    expect(result.player.damageDealt).toBeCloseTo(1000, 5);
  });

  it('enemy-targeting sigils wait out the 1s trigger delay (nothing fires before the 59s mark)', () => {
    const nuker = buildPvpSide({
      stats: offensiveStats({ attack: 0, health: 1e9, speed: 100, crit_mult: 150 }),
      characterClass: 'Warrior',
      sigilIds: ['blade-of-judgment'],
      sigilValues: { 'blade-of-judgment': { active: {}, damage: 1000, tickDamage: 0 } },
    });
    // A 1s duel ends before the delayed activation; a 2s duel contains exactly it.
    expect(runPvpSingle(nuker, side(), { rng: rng(), durationSeconds: 1 }).player.damageDealt).toBe(0);
    expect(runPvpSingle(nuker, side(), { rng: rng(), durationSeconds: 2 }).player.damageDealt).toBeCloseTo(1000, 5);
  });

  it('thunderbind paralyzes the enemy on activation', () => {
    const zapper = buildPvpSide({
      stats: offensiveStats({ attack: 0, health: 1e9, speed: 100, crit_mult: 150 }),
      characterClass: 'Sentinel',
      sigilIds: ['thunderbind'],
      sigilValues: { thunderbind: { active: {}, damage: 1, tickDamage: 0 } },
    });
    const result = runPvpSingle(zapper, side({ attack: 10 }), { rng: rng(), durationSeconds: 24 });
    // Activations at 1 and 13 (1s delay), each stunning 2s -> at least 2 skipped swings.
    expect(result.opponent.paralyzedSwings).toBeGreaterThanOrEqual(2);
  });

  it('withering-touch cuts the enemy regen tick by the ENTERED % for exactly its 8s window', () => {
    const wither = (regenDebuffPct) =>
      buildPvpSide({
        stats: offensiveStats({ attack: 5000, health: 1e9, speed: 100, crit_mult: 150 }),
        characterClass: 'Warrior',
        sigilIds: ['withering-touch'],
        sigilValues: { 'withering-touch': { active: {}, damage: 0, tickDamage: 0, regenDebuffPct } },
      });
    // Passive healer: 1%/s regen on 100k HP = 1000/tick, never HP-clamped
    // because the withering side dents it by 5000/swing from t=0.
    const healer = () => side({ attack: 0, health: 100000, hp_regen: 1 });
    // Activation at t=1 (enemy-targeting delay), debuff until t=9. Regen
    // ticks at 1..9: eight debuffed plus t=9 back at full.
    const healedWith = (pct) =>
      runPvpSingle(wither(pct), healer(), { rng: rng(), durationSeconds: 10 }).opponent.healed;
    expect(healedWith(60)).toBeCloseTo(8 * 400 + 1000, 5); // 1000 * (1 - 60%)
    expect(healedWith(25)).toBeCloseTo(8 * 750 + 1000, 5); // level-scaled: 1000 * (1 - 25%)
    expect(healedWith(0)).toBeCloseTo(9 * 1000, 5); // nothing entered -> no debuff
  });

  it('sunder-mark strips enemy DMG Reduction via on-hit stacks', () => {
    // 3 swings/s outpaces the 1.75 stacks/s shed, so marks accumulate.
    const sunder = buildPvpSide({
      stats: offensiveStats({ attack: 100, health: 1e9, speed: 300, crit_mult: 150 }),
      characterClass: 'Warrior',
      sigilIds: ['sunder-mark'],
      sigilValues: {},
    });
    const tank = side({ dmg_reduction: 32, attack: 0 });
    const withMarks = runPvpSingle(sunder, tank, { rng: rng(), durationSeconds: 30 });
    const without = runPvpSingle(side({ attack: 100, speed: 300 }), tank, { rng: rng(), durationSeconds: 30 });
    expect(withMarks.player.damageDealt).toBeGreaterThan(without.player.damageDealt);
  });

  it('PVP mechanics registry overrides the PVE-unsupported entries', () => {
    expect(PVP_SIGIL_MECHANICS['sunder-mark'].kind).toBe('on-hit-marks');
    expect(PVP_SIGIL_MECHANICS['elusive-supremacy'].kind).toBe('hit-stacks');
    expect(PVP_SIGIL_MECHANICS['thunderbind'].paralyzeSec).toBe(2);
    // PVE-supported shapes pass through untouched.
    expect(PVP_SIGIL_MECHANICS['hemorrhage'].kind).toBe('stacking-dot');
  });

  it('resolvePvpSigils drops passive-only sigils and unknown ids', () => {
    const resolved = resolvePvpSigils('Warrior', ['defense-stance', 'nope', 'blade-of-judgment'], {});
    expect(resolved.map((r) => r.def.id)).toEqual(['blade-of-judgment']);
  });

  it('resolvePvpSigils applies the Ember Curse special mount glyph to the bleed mechanic', () => {
    const values = { 'ember-curse': { damage: 100, tickDamage: 10 } };
    const [plain] = resolvePvpSigils('Sentinel', ['ember-curse'], values);
    expect(plain.mech.maxStacks).toBe(8);
    expect(plain.mech.tickDamage).toBe(10);
    const [glyphed] = resolvePvpSigils('Sentinel', ['ember-curse'], values, ['ember-curse-glyph']);
    expect(glyphed.mech.maxStacks).toBe(9); // +1 max stack
    expect(glyphed.mech.tickDamage).toBeCloseTo(11, 9); // +10% damage per stack
  });
});

describe('runPvpSimulation', () => {
  it('a mirror match with random mechanics lands near 50/50 and is seed-reproducible', () => {
    const s = () => side({ attack: 400, crit: 30, double_hit: 20, miss_chance: 20 });
    const a = runPvpSimulation({ player: s(), opponent: s(), iterations: 400, seed: 7 });
    const b = runPvpSimulation({ player: s(), opponent: s(), iterations: 400, seed: 7 });
    expect(a.winRate).toBe(b.winRate);
    expect(a.winRate + a.lossRate + a.drawRate).toBeCloseTo(100, 6);
    // Identical speeds mean synchronized swings, so some duels end in a
    // mutual kill - which the game (and sim) counts as a LOSS. Symmetry
    // therefore holds between wins and non-mutual losses.
    expect(Math.abs(a.winRate - (a.lossRate - a.mutualKillRate))).toBeLessThan(15);
  });

  it('a mutual kill (both die in the same instant) counts as a loss, matching the game', () => {
    // Identical one-shot brawlers: both swings land in the t=0 batch.
    const s = () => side({ attack: 1e9 });
    const single = runPvpSingle(s(), s(), { rng: rng() });
    expect(single.winner).toBe('opponent');
    expect(single.mutualKill).toBe(true);
    expect(single.player.hpRemaining).toBe(0);
    expect(single.opponent.hpRemaining).toBe(0);

    const agg = runPvpSimulation({ player: s(), opponent: s(), iterations: 20, seed: 5 });
    expect(agg.winRate).toBe(0);
    expect(agg.lossRate).toBe(100);
    expect(agg.mutualKillRate).toBe(100);
  });

  it('an overwhelming attacker wins ~always with a short time-to-kill', () => {
    const result = runPvpSimulation({
      player: side({ attack: 100000 }),
      opponent: side(),
      iterations: 50,
      seed: 1,
    });
    expect(result.winRate).toBe(100);
    expect(result.killRate).toBe(100);
    expect(result.timeToKill.mean).toBeLessThan(2);
  });
});

describe('rateCiHalfWidth (95% confidence half-width of a duel rate)', () => {
  it('matches the normal approximation at p=0.5', () => {
    // 1.96 * sqrt(0.25 / 100) * 100 = 9.8 percentage points
    expect(rateCiHalfWidth(50, 100)).toBeCloseTo(9.8, 9);
  });

  it('is zero at the boundaries and for empty samples', () => {
    expect(rateCiHalfWidth(0, 1000)).toBe(0);
    expect(rateCiHalfWidth(100, 1000)).toBe(0);
    expect(rateCiHalfWidth(50, 0)).toBe(0);
  });

  it('shrinks with more duels', () => {
    expect(rateCiHalfWidth(60, 5000)).toBeLessThan(rateCiHalfWidth(60, 1000));
  });
});

describe('batch aggregation extras (Phase 2)', () => {
  it('per-side damageByTag means are sorted descending and account for all damage', () => {
    const result = runPvpSimulation({
      player: side({ attack: 500, double_hit: 50 }),
      opponent: side(),
      iterations: 50,
      seed: 9,
    });
    const tags = Object.values(result.player.damageByTag);
    expect(tags.length).toBeGreaterThan(0);
    expect([...tags].sort((a, b) => b - a)).toEqual(tags);
    const tagTotal = tags.reduce((a, b) => a + b, 0);
    expect(tagTotal).toBeCloseTo(result.player.damageDealt.mean, 6);
  });

  it('durationSeconds threads through: a shorter fight ends by that horizon', () => {
    const result = runPvpSimulation({
      player: side(),
      opponent: side(),
      durationSeconds: 30,
      iterations: 5,
      seed: 3,
    });
    expect(result.durationSeconds).toBe(30);
    // Identical brawlers can't kill 10k HP in 30s at 100 dmg/s: all draws,
    // and each side lands at most 30 swings.
    expect(result.drawRate).toBe(100);
    expect(result.player.perRun.swings).toBeLessThanOrEqual(30);
  });
});

describe('runTracedDuel', () => {
  it('is duel #1 of the same-seed batch and tracing never changes the outcome', () => {
    const player = side({ attack: 800, crit: 30 });
    const opponent = side({ attack: 300 });
    const traced = runTracedDuel({ player, opponent, seed: 77 });
    // Iteration 0's seed IS the base seed - the untraced twin of duel #1.
    const untraced = runPvpSingle(player, opponent, { rng: mulberry32(77) });
    expect(traced.run.winner).toBe(untraced.winner);
    expect(traced.run.endTime).toBe(untraced.endTime);
    expect(traced.run.player.damageDealt).toBe(untraced.player.damageDealt);
  });

  it('emits ordered events with sides, kinds and amounts; a lethal duel logs a death', () => {
    const traced = runTracedDuel({ player: side({ attack: 5000 }), opponent: side(), seed: 5 });
    expect(traced.events.length).toBeGreaterThan(0);
    for (let i = 1; i < traced.events.length; i++) {
      expect(traced.events[i].t).toBeGreaterThanOrEqual(traced.events[i - 1].t);
    }
    expect(traced.events.every((e) => ['player', 'opponent'].includes(e.side))).toBe(true);
    const damage = traced.events.filter((e) => e.kind === 'damage');
    expect(damage.length).toBeGreaterThan(0);
    expect(damage.every((e) => e.amount > 0 && e.tag)).toBe(true);
    expect(traced.events.some((e) => e.kind === 'death' && e.side === 'opponent')).toBe(true);
  });
});
