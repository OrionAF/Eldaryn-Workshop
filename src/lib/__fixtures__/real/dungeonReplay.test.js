// Replay check of a real dungeon run (backlog §7) against the app's dungeon fight rules
// (engine/pve/dungeonReplay.js, Game/combat-pve.md §21). The attacker comes through the app's own import
// and build path, as real.test.js does for the arena capture; the mobs are the catalogue's dungeon_4 step 8.
import { describe, it, expect } from 'vitest';
import profile from './profile-mystic-l50.json';
import run from './dungeon-run-mystic-d4s8.json';
import { normaliseCharacter } from '../../model/index.js';
import { gameProfileToCharacter } from '../../model/gameProfile.js';
import { buildFighter } from '../../build/fighter.js';
import { dungeonMobs } from '../../engine/pve/enemies.js';
import { preparePveFighter, simulatePve } from '../../engine/pve/fight.js';
import { laneRng } from '../../engine/rng.js';
import { dungeonReplayCheck, dungeonResponseOf, DUNGEON_REPLAY_RULES } from '../../engine/pve/dungeonReplay.js';

const c = normaliseCharacter(gameProfileToCharacter(profile));
const attacker = buildFighter(c, c.activePresetId);
const mobs = dungeonMobs('dungeon_4', 8);
const check = (log, opts = {}) => dungeonReplayCheck(log, { attacker, mobs, ...opts });
const rule = (report, name) => report.rules.find((r) => r.rule === name);
const clone = () => JSON.parse(JSON.stringify(run));
const rows = (log) => log.result.ticks;
const resort = (log) => rows(log).sort((a, b) => a.timestamp - b.timestamp);

describe('real dungeon run (dungeon_4 step 8, Mystic L50 with Void Aegis)', () => {
  it('the attacker is the sheet the fight used; the mobs are the step\'s three', () => {
    for (const k of Object.keys(profile.computedStats)) expect(attacker.stats[k] ?? 0, k).toBeCloseTo(profile.computedStats[k], 9);
    expect(attacker.sigils.map((s) => s.species)).toEqual(['RUNIC_AFFLICTION', 'ARCANE_BURST', 'ARCANE_BARRAGE']);
    expect(attacker.utility.species).toBe('VOID_AEGIS');
    expect(mobs.map((m) => m.name)).toEqual(['Obsidian Sentinel', 'Iron Colossus', 'Elder Dragon']);
  });

  it('passes every rule, each with substantive checks; none is skipped', () => {
    const report = check(run);
    expect(report.mismatches).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.rules.map((r) => r.rule)).toEqual([...DUNGEON_REPLAY_RULES]);
    for (const r of report.rules) {
      expect(r.status, `${r.rule}: ${r.note ?? ''}`).toBe('pass');
      expect(r.checked, r.rule).toBeGreaterThan(0);
    }
    expect(rule(report, 'player-swings').checked).toBe(78); // every player swing row
    expect(rule(report, 'player-swings').note).toBe('719 ms');
    expect(rule(report, 'mob-swings').checked).toBe(28); // 27 mob hits and the killing one
    expect(rule(report, 'mob-swings').note).toBe('1667 / 2500 / 1429 ms');
    expect(rule(report, 'spell-schedule').checked).toBe(220);
    expect(rule(report, 'regen').note).toBe('pulse 461 every 100 ms');
    expect(rule(report, 'shield-chain').checked).toBeGreaterThanOrEqual(28 + 110);
  });

  it('without the attacker or the mobs the sheet rules report skipped with a reason, never a pass', () => {
    const report = dungeonReplayCheck(run);
    expect(report.ok).toBe(true);
    for (const name of ['mobs', 'player-swings', 'mob-swings', 'spell-schedule', 'spell-damage', 'spell-heals', 'hit-sizes', 'regen', 'hp-chain', 'shield-chain']) {
      expect(rule(report, name).status, name).toBe('skipped');
      expect(rule(report, name).note, name).toMatch(/needs/);
    }
    for (const name of ['shape', 'tick-grid', 'terminal', 'transitions', 'mob-hp', 'shield-cap']) expect(rule(report, name).status, name).toBe('pass');
  });

  it('a shifted player swing or mob swing fails its clock', () => {
    const p = clone();
    rows(p).find((e) => e.type === 'player_attack' && e.timestamp > 30000).timestamp += 10;
    resort(p);
    expect(rule(check(p), 'player-swings').status).toBe('fail');
    const m = clone();
    rows(m).find((e) => e.type === 'mob_attack' && e.timestamp > 30000).timestamp -= 10;
    resort(m);
    expect(rule(check(m), 'mob-swings').status).toBe('fail');
  });

  it('a late heal (moved to the next tick) fails the heal rule and the HP chain', () => {
    const l = clone();
    // at 57 500 the two heals (24 030 + 22 756) lift HP from 102 847 to max; without the second it falls short
    const i = rows(l).findIndex((e) => e.type === 'spell_heal_tick' && e.timestamp === 57500 && e.spell.species === 'ARCANE_BARRAGE');
    rows(l)[i].timestamp += 10;
    resort(l);
    const report = check(l);
    expect(rule(report, 'spell-heals').status).toBe('fail');
    expect(rule(report, 'hp-chain').status).toBe('fail');
  });

  it('a shield over its cap fails the cap rule; a shield off its rebuilt value fails the chain', () => {
    const o = clone();
    rows(o).find((e) => e.playerShieldHp === 175626).playerShieldHp = 175627;
    const report = check(o);
    expect(rule(report, 'shield-cap').status).toBe('fail');
    expect(rule(report, 'shield-chain').status).toBe('fail');
    // only refilling the shield with the heal's overflow (not the whole vamp heal) leaves it 51 412 short
    const v = clone();
    rows(v).find((e) => e.timestamp === 38670).playerShieldHp -= 51412;
    expect(rule(check(v), 'shield-chain').status).toBe('fail');
  });

  it('a wrong hit size, spell size, heal size or regen pulse fails', () => {
    const h = clone();
    rows(h).find((e) => e.type === 'player_attack' && e.timestamp > 30000).damage += 1;
    expect(rule(check(h), 'hit-sizes').status).toBe('fail');
    const b = clone();
    rows(b).find((e) => e.type === 'mob_block').damage = 5368; // a crit pierce is allowed, a plain hit is not
    expect(rule(check(b), 'hit-sizes').status).toBe('pass');
    rows(b).find((e) => e.type === 'mob_block').damage = 69720;
    expect(rule(check(b), 'hit-sizes').status).toBe('fail');
    const s = clone();
    rows(s).find((e) => e.type === 'spell_damage' && e.spell.species === 'ARCANE_BURST').damage -= 1;
    expect(rule(check(s), 'spell-damage').status).toBe('fail');
    const hv = clone();
    rows(hv).find((e) => e.type === 'spell_heal_tick').damage += 1;
    expect(rule(check(hv), 'spell-heals').status).toBe('fail');
    const r = clone();
    const k = rows(r).findIndex((e) => e.type === 'player_regen');
    rows(r).splice(k, 1); // a pulse while HP is below max with no row
    expect(rule(check(r), 'regen').status).toBe('fail');
  });

  it('a shifted spell cast fails the schedule; a wrong mob HP or a missing death row fails', () => {
    const s = clone();
    rows(s).find((e) => e.type === 'spell_cast' && e.spell.species === 'ARCANE_BURST' && e.timestamp > 30000).timestamp += 10;
    resort(s);
    expect(rule(check(s), 'spell-schedule').status).toBe('fail');
    const m = clone();
    rows(m)[0].mobHpAfter -= 1;
    expect(rule(check(m), 'mobs').status).toBe('fail');
    const d = clone();
    rows(d).pop();
    expect(rule(check(d), 'terminal').status).toBe('fail');
  });

  it('the app\'s own dungeon fight for this attacker and step passes the same rules', () => {
    const prepared = preparePveFighter(attacker);
    const shieldMax = prepared.fresh().player.shieldMax;
    expect(shieldMax).toBe(run.result.playerShieldMax);
    for (const seed of [1, 2, 3, 4]) {
      const sim = simulatePve({ fighter: prepared, enemy: mobs, mode: 'dungeon', rng: laneRng(seed), log: true });
      const report = check(dungeonResponseOf(sim, { shieldMax }));
      expect(report.mismatches, `seed ${seed}`).toEqual([]);
      for (const r of report.rules) {
        expect(r.status, `seed ${seed} ${r.rule}: ${r.note ?? ''}`).toBe('pass');
        expect(r.checked, r.rule).toBeGreaterThan(0);
      }
    }
  });
});
