// H1 golden tests on the real server captures (stripped fixtures in this folder), plus the pinned
// dungeon mobs of D1. real.test.js keeps the older exact-match checks; this file states the contract
// the plan (section C) names:
//  - profile-warrior-l72: imports, and every computedStats key matches the recomputed stat within the
//    sheet tolerance (engine/pipeline/sheet.js); the residual is empty, so no key needs a server-only offset.
//  - arena-fight-warrior: the replay check passes every rule with substantive checks once the attacker
//    sheet is given. The one rule that stays skipped, hit-sizes, says why (spells are in the log).
//  - drop-batch: normalises into base-realm entries and batch-checks through the dropCheck task.
//  - D1: pinned hard and normal dungeon mobs carry the client's numbers and the `dungeon` mode.
import { describe, it, expect, beforeEach } from 'vitest';
import profile from './profile-warrior-l72.json';
import fight from './arena-fight-warrior.json';
import batch from './drop-batch.json';
import { normaliseCharacter } from '../../model/index.js';
import { isGameProfile, gameProfileToCharacter } from '../../model/gameProfile.js';
import { computePresetStats } from '../../build/stats.js';
import { toleranceFor, SHEET_KEYS } from '../../engine/pipeline/sheet.js';
import { replayCheck } from '../../engine/pvp/replayCheck.js';
import { dungeonMobs, DUNGEON_IDS } from '../../engine/pve/enemies.js';
import { createMobEntity } from '../../engine/core/entity.js';
import { parseDropBatch, prepareBatch, entryResults, judgeEntry } from '../../features/dropBatch.js';
import { runTask } from '../../tasks/index.js';
import { clearMetricCache } from '../../engine/metrics.js';

beforeEach(() => clearMetricCache());

const character = () => normaliseCharacter(gameProfileToCharacter(profile));

describe('golden: profile-warrior-l72', () => {
  it('is a game profile and imports as a Warrior of level 72', () => {
    expect(isGameProfile(profile)).toBe(true);
    const c = character();
    expect(c.class).toBe('WARRIOR');
    expect(c.level).toBe(72);
  });

  it('every computedStats key matches the recomputed stat within the sheet tolerance; no residual remains', () => {
    const c = character();
    const { computed, residual } = computePresetStats(c, c.activePresetId, { realm: 'base' });
    const keys = Object.keys(profile.computedStats);
    expect(keys.length).toBeGreaterThanOrEqual(35);
    for (const key of keys) {
      expect(SHEET_KEYS, `${key} is a sheet key`).toContain(key);
      const delta = Math.abs(computed[key] - profile.computedStats[key]);
      expect(delta, `${key}: computed ${computed[key]} vs server ${profile.computedStats[key]}`).toBeLessThanOrEqual(toleranceFor(key) + 1e-9);
    }
    // the documented server-only keys (none today): anything the sheet explains leaves no residual
    expect(residual).toEqual({});
  });
});

describe('golden: arena-fight-warrior', () => {
  const attacker = {
    class: 'WARRIOR', spec: 'WARRIOR_TANK', stats: profile.computedStats,
    sigils: ['IRON_BASTION', 'WARBORN_FURY'].map((species) => ({ species, level: 5 })),
  };

  it('with the attacker sheet every rule passes with substantive checks; only hit-sizes is skipped, and says why', () => {
    const report = replayCheck(fight, { attacker });
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
    const skipped = report.rules.filter((r) => r.status === 'skipped');
    expect(skipped.map((r) => r.rule)).toEqual(['hit-sizes']);
    expect(skipped[0].note).toMatch(/spells, minions or stacks/);
    for (const r of report.rules.filter((x) => x.status === 'pass')) expect(r.checked, r.rule).toBeGreaterThan(0);
    for (const name of ['opening', 'swing-times', 'regen', 'spell-casts', 'hp-chain']) {
      expect(report.rules.find((r) => r.rule === name).status, name).toBe('pass');
    }
  });

  it('without the sheet the schedules are skipped, never reported as passed', () => {
    const report = replayCheck(fight);
    expect(report.ok).toBe(true);
    for (const name of ['swing-times', 'regen', 'spell-casts']) expect(report.rules.find((r) => r.rule === name).status, name).toBe('skipped');
  });
});

describe('golden: drop-batch', () => {
  it('normalises into four base-realm Warrior entries with their secondaries intact', () => {
    const r = parseDropBatch(batch, character());
    expect(r.error).toBeNull();
    expect(r.skipped).toEqual([]);
    expect(r.entries).toHaveLength(4);
    for (const e of r.entries) {
      expect(e.realm).toBe('base');
      expect(e.dropped, `${e.name} dropped secondaries`).toBe(0);
      expect(e.item.primaryStats.attack).toBeGreaterThan(0);
      expect(e.item.primaryStats.hp).toBeGreaterThan(0);
    }
  });

  it('batch-checks through the dropCheck task: finite deltas and a verdict for every entry', async () => {
    const c = character();
    const { entries } = parseDropBatch(batch, c);
    const { request, rows, offsets } = prepareBatch(c, entries);
    const res = await runTask('dropCheck', { ...request, nSim: 4, seconds: 10 });
    expect(res.results).toHaveLength(request.items.length);
    entries.forEach((_, i) => {
      const per = entryResults(offsets, rows, i, res.results);
      for (const r of per) {
        expect(r).toBeTruthy();
        for (const v of [r.sim.before.mean, r.sim.after.mean, r.sim.delta.delta]) expect(Number.isFinite(v)).toBe(true);
      }
      expect(['upgrade', 'mixed', 'sidegrade', 'downgrade']).toContain(judgeEntry(rows[i], per).verdict);
    });
  }, 60000);
});

describe('golden: D1 pinned dungeon and hard mobs', () => {
  const pick = (m) => [m.id, m.name, m.hp, m.attack, m.attackSpeed, m.blockChance, m.penetration, m.damageReduction];

  it('dungeon_1_hard step 1 and dungeon_7_hard step 8 carry the client numbers', () => {
    expect(pick(dungeonMobs('dungeon_1_hard', 1)[0]))
      .toEqual(['mine_rat_hard', 'Giant Rat', 108000000, 2570400, 1.625, 20, 50, 0]);
    expect(pick(dungeonMobs('dungeon_7_hard', 8)[2]))
      .toEqual(['chrono_boss_hard', 'Kairon, the Timeless', 91931840000, 653769600, 1.063, 26, 66, 30]);
  });

  it('every dungeon id (7 normal, 7 hard) has 8 steps of 3 mobs stamped `dungeon`, and the hard mobs\' DR reaches the entity', () => {
    expect(DUNGEON_IDS).toHaveLength(14);
    for (const id of DUNGEON_IDS) {
      for (let step = 1; step <= 8; step++) {
        const mobs = dungeonMobs(id, step);
        expect(mobs, `${id} step ${step}`).toHaveLength(3);
        for (const m of mobs) {
          expect(m.mode).toBe('dungeon');
          expect(Number.isFinite(m.hp) && m.hp > 0 && Number.isFinite(m.attack) && m.attackSpeed > 0, m.id).toBe(true);
        }
      }
    }
    expect(createMobEntity(dungeonMobs('dungeon_3_hard', 1)[0]).damageReduction).toBe(30);
  });
});
