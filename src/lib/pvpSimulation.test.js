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
  PVP_HEALTH_MULTIPLIER,
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
    // Hard caps per the rebalance table in constants.js (Jul 2026 raises).
    expect(capped.miss_chance).toBe(90);
    expect(capped.blind_chance).toBe(50);
    expect(capped.crit).toBe(90);
    expect(capped.attack).toBe(1e9);
    expect(capped.lifesteal).toBe(70);
  });
});

describe('spell stats (sigil spell damage)', () => {
  // A caster who never lands swing damage: all damageDealt comes from the sigil.
  const caster = (extra = {}) =>
    buildPvpSide({
      stats: offensiveStats({ attack: 0, health: 10000, speed: 100, crit_mult: 150, ...extra }),
      characterClass: 'Warrior',
      sigilIds: ['blade-of-judgment'],
      sigilValues: { 'blade-of-judgment': { damage: 1000 } },
    });
  // A big target dummy so boosted sigil damage never ends the fight early.
  const dummy = (extra = {}) => side({ health: 1000000, ...extra });

  it("the caster's Spell Damage boosts sigil damage multiplicatively", () => {
    const base = runPvpSingle(caster(), dummy(), { rng: rng() }).player.damageDealt;
    expect(base).toBeGreaterThan(0);
    const boosted = runPvpSingle(caster({ spell_damage: 100 }), dummy(), { rng: rng() }).player.damageDealt;
    expect(boosted).toBeCloseTo(base * 2, 6);
  });

  it("the target's Spell Resist softens incoming sigil damage", () => {
    const base = runPvpSingle(caster(), dummy(), { rng: rng() }).player.damageDealt;
    const resisted = runPvpSingle(caster(), dummy({ spell_resist: 50 }), { rng: rng() }).player.damageDealt;
    expect(resisted).toBeCloseTo(base * 0.5, 6);
  });

  it('Spell Resist does not touch normal swing damage', () => {
    const plain = runPvpSingle(side(), dummy(), { rng: rng() }).player.damageDealt;
    const vsResist = runPvpSingle(side(), dummy({ spell_resist: 60 }), { rng: rng() }).player.damageDealt;
    expect(vsResist).toBe(plain);
  });
});

describe('runPvpSingle - core resolution', () => {
  it('a defenseless mirror match ends when someone dies', () => {
    const result = runPvpSingle(side(), side(), { rng: rng() });
    // 100 dmg/s vs an 8x 10000 HP pool -> nowhere near lethal inside 60s.
    // Lethal now means out-damaging the multiplied pool (80000/60s = 1334/s):
    const strong = side({ attack: 2000 });
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

  it('a block with zero penetration deals nothing; penetration pierces the base', () => {
    const blocker = side();
    blocker.stats.block_chance = 100;
    const noPen = runPvpSingle(side({ attack: 1000 }), blocker, { rng: rng(), durationSeconds: 10 });
    expect(noPen.player.damageDealt).toBe(0);

    const pierced = runPvpSingle(side({ attack: 1000, penetration: 50 }), blocker, { rng: rng(), durationSeconds: 10 });
    // Every hit blocked, 50% of base 1000 goes through: 500 per swing, 10
    // swings on ticks 1, 401, ... 3601 (speed 100 = every 400 ticks).
    expect(pierced.player.damageDealt).toBeCloseTo(500 * 10, 5);
  });

  it('the double-hit second strike cannot crit', () => {
    // SETTLED GAME RULE (owner ruling 2026-07-28) - the companion to the
    // penetration rule below, and the two are independent: pierced damage
    // crits, double-hit damage never does. Certain crit + certain double hit
    // makes every rng path identical, so this is exact.
    const attacker = side({ attack: 1000 });
    attacker.stats.crit = 100; // set post-build: capStats would clamp to 90
    attacker.stats.crit_mult = 200;
    attacker.stats.double_hit = 100;
    const dummy = side({ attack: 0, health: 1e9 });
    const r = runPvpSingle(attacker, dummy, { rng: rng(), durationSeconds: 10 });

    // Per swing: main hit crits (2000) + double hit at normal damage (1000).
    expect(r.player.damageDealt).toBeCloseTo(3000 * 10, 5);
    expect(r.player.doubleHits).toBe(10);
    expect(r.player.crits).toBe(10); // main hits only - never 20
  });

  it('Penetration Rework: what pierces a block CAN crit', () => {
    const blocker = side();
    blocker.stats.block_chance = 100; // every swing is blocked
    // 100% crit at x2 - with block and crit both certain, any rng in [0,1)
    // takes the same path, so the result is exact rather than sampled.
    const attacker = side({ attack: 1000, penetration: 50, crit: 100, crit_mult: 200 });
    attacker.stats.crit = 100;
    const result = runPvpSingle(attacker, blocker, { rng: rng(), durationSeconds: 10 });

    // 1000 base -> 50% pierces -> 500 -> crits x2 -> 1000 per swing.
    // Before the rework the pierced portion skipped the crit roll entirely and
    // this was 500 a swing, which is what made Penetration useless vs blockers.
    expect(result.player.damageDealt).toBeCloseTo(1000 * 10, 5);
    expect(result.player.crits).toBe(10);
    expect(result.player.blockedByEnemy).toBe(10);
  });

  it('the PVP damage chain matches the CONTEXT.md worked example', () => {
    const attacker = side({ attack: 862534, pvp_attack: 303 });
    const defender = side({ health: 1e12, dmg_reduction: 9.9, pvp_defense: 283 });
    const result = runPvpSingle(attacker, defender, { rng: () => 0.999, durationSeconds: 1.5 });
    // rng 0.999 -> no miss/block/crit/procs; 1.5s horizon -> swings on ticks 1 and 401.
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
    // The blinder (scheduled first) hits in the tick-1 batch before the
    // victim's swing resolves, so every victim swing is blinded.
    expect(result.opponent.blindedSwings).toBeGreaterThan(0);
    expect(result.opponent.damageDealt).toBeLessThan(50 * 20);
  });

  it('paralyze skips enemy swings for its window', () => {
    const stunner = side({ attack: 1 });
    stunner.stats.paralyze_chance = 100;
    const result = runPvpSingle(stunner, side({ attack: 50 }), { rng: rng(), durationSeconds: 20 });
    expect(result.opponent.paralyzedSwings).toBeGreaterThan(0);
  });

  it('a full-duration fight is judged on remaining HP PERCENTAGE, not the raw number', () => {
    // Player: 20k x1 pool, takes 60 x 100 = 6000 -> 14000 left (70%).
    // Opponent: 10k x1 pool, untouched -> 10000 left (100%).
    // Flat judging said player (14000 > 10000); since the Jul 2026 patch the
    // bigger SHARE wins, so the untouched small pool takes it.
    const big = side({ attack: 0, health: 20000 });
    const small = side({ attack: 100, health: 10000 });
    const r = runPvpSingle(big, small, { rng: rng(), healthMultiplier: 1 });
    expect(r.diedEarly).toBe(false);
    expect(r.player.hpRemaining).toBe(14000);
    expect(r.opponent.hpRemaining).toBe(10000);
    expect(r.winner).toBe('opponent');
  });

  it('health multiplier scales both HP pools, and defaults to the game\'s x8', () => {
    const strong = side({ attack: 2000 });
    const single = runPvpSingle(strong, side(), { rng: rng(), healthMultiplier: 1 });
    const triple = runPvpSingle(strong, side(), { rng: rng(), healthMultiplier: 3 });
    expect(triple.endTime).toBeGreaterThan(single.endTime);

    // The default is PVP_HEALTH_MULTIPLIER - no mode to pick, everyone gets it.
    const dflt = runPvpSingle(strong, side(), { rng: rng() });
    const explicit = runPvpSingle(strong, side(), { rng: rng(), healthMultiplier: PVP_HEALTH_MULTIPLIER });
    expect(dflt.endTime).toBe(explicit.endTime);
    expect(dflt.opponent.maxHp).toBe(10000 * PVP_HEALTH_MULTIPLIER);
    expect(dflt.endTime).toBeGreaterThan(triple.endTime);
  });

  it('the pool multiplier does NOT multiply healing: regen is sized off original max HP', () => {
    // 10% HP Regen on 10k Health = 1000/s. The attacker out-damages that
    // (2000/s), so the healer stays below its cap all fight and banks the full
    // regen rate rather than a cap-limited trickle.
    const healer = side({ attack: 0, hp_regen: 10, health: 10000 });
    const attacker = side({ attack: 2000 });
    const eight = runPvpSingle(healer, attacker, { rng: rng(), durationSeconds: 10 });
    const sixteen = runPvpSingle(healer, attacker, { rng: rng(), durationSeconds: 10, healthMultiplier: 16 });

    // Doubling the pool changes nothing about the healing.
    expect(sixteen.player.healed).toBeCloseTo(eight.player.healed, 6);
    // ...and that healing is ~10s x 1000/s off the ORIGINAL 10k pool, not the
    // 80k one (which would have healed 8x as much under the old rule).
    expect(eight.player.healed).toBeGreaterThan(9500);
    expect(eight.player.healed).toBeLessThan(10000);

    // Health itself still scales regen - it is a % of (original) max HP.
    const bigger = side({ attack: 0, hp_regen: 10, health: 20000 });
    const r2 = runPvpSingle(bigger, attacker, { rng: rng(), durationSeconds: 10 });
    expect(r2.player.healed).toBeCloseTo(2 * eight.player.healed, 6);
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
    // Passive healer: 1%/s regen on 100k HP = 1000/s = 2.5/tick, never
    // HP-clamped because the withering side dents it by 5000/swing early.
    const healer = () => side({ attack: 0, health: 100000, hp_regen: 1 });
    // Activation on tick 400 (enemy-targeting delay), debuff until tick
    // 3600 (8s = 3200 ticks, prorated exactly). Regen runs on combat ticks
    // 1..3999: 399 full + 3200 debuffed + 400 full.
    const healedWith = (pct) =>
      runPvpSingle(wither(pct), healer(), { rng: rng(), durationSeconds: 10 }).opponent.healed;
    expect(healedWith(60)).toBeCloseTo(799 * 2.5 + 3200 * 2.5 * 0.4, 5);
    expect(healedWith(25)).toBeCloseTo(799 * 2.5 + 3200 * 2.5 * 0.75, 5); // level-scaled %
    expect(healedWith(0)).toBeCloseTo(3999 * 2.5, 5); // nothing entered -> no debuff
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

describe('tick clock (400 ticks/s)', () => {
  // Swings every round(40000 / speed) ticks starting on tick 1; combat runs
  // strictly before the horizon tick. Zero attack so nobody dies.
  const swings = (speed, durationSeconds = 60) =>
    runPvpSingle(side({ attack: 0, speed }), side({ attack: 0 }), { rng: rng(), durationSeconds })
      .player.swings;

  it('speed 100 = 1 swing/s, speed 400 (the cap) = 4/s, speed 315 = 3.15/s', () => {
    expect(swings(100)).toBe(60);
    expect(swings(400)).toBe(240);
    expect(swings(315)).toBe(189); // every round(40000/315) = 127 ticks
    expect(swings(200, 10)).toBe(20);
  });

  it('HP regen accrues gradually per tick, not in whole-second chunks', () => {
    // Healer is dented by one 5000 hit on tick 1, then regens 1%/s of 100k
    // HP = 2.5/tick across combat ticks 1..199 of a half-second fight.
    const r = runPvpSingle(
      side({ attack: 5000 }),
      side({ attack: 0, health: 100000, hp_regen: 1 }),
      { rng: rng(), durationSeconds: 0.5 }
    );
    expect(r.opponent.healed).toBeCloseTo(199 * 2.5, 5);
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
    // Identical one-shot brawlers: both swings land in the tick-1 batch.
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
