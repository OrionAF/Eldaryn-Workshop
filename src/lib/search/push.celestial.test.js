// Push on the Celestial Trial (backlog §11 follow-up, simulation.md §Push, §Celestial Trial): the ladder is the
// party's scaling level, the partner fixed. Real fixtures: the Sentinel (oct15b) with the Warrior's TANK preset.
import { describe, it, expect } from 'vitest';
import sentinel from '../__fixtures__/real/profile-sentinel-l85-oct15b.json';
import warrior from '../__fixtures__/real/profile-warrior-l73.json';
import { normaliseCharacter } from '../model/index.js';
import { gameProfileToCharacter } from '../model/gameProfile.js';
import { celestialBossStats } from '../engine/pve/celestial.js';
import { MAX_PLAYER_LEVEL } from '../game/classes.js';
import { ladderOf, push } from './push.js';
import { prepare } from './search.js';
import { resolveRosterPartner } from './celestialObjective.js';
import { objectiveKindsFor } from './objectives.js';
import { BLOCKS } from './space.js';
import { viewResult, ladderStrip } from '../ui/optimiserView.js';

const NOW = '2026-10-15T00:00:00.000Z';
const me = normaliseCharacter(gameProfileToCharacter(sentinel, { now: NOW }));
const warriorChar = normaliseCharacter(gameProfileToCharacter(warrior, { now: NOW }));
const tankPreset = warriorChar.presets.find((p) => p.name === 'TANK');
const rosterRef = { source: 'character', characterId: warriorChar.id, presetId: tankPreset.id };
const partner = resolveRosterPartner(rosterRef, [me, warriorChar]);
const target = (o = {}) => ({ kind: 'celestial', difficulty: 'HARD', partner: rosterRef, ...o });
const ctx = { character: me, partner };
const only = (...on) => Object.fromEntries(BLOCKS.map((b) => [b, on.includes(b)]));

describe('Celestial ladder', () => {
  it('Push is offered for the Celestial Trial', () => {
    expect(objectiveKindsFor('celestial')).toContain('push');
  });

  it('rungs are the party levels from the difficulty unlock to the cap, in order, starting at the target level', () => {
    const hard = ladderOf(target({ level: 85 }), ctx);
    expect(hard.kind).toBe('celestial');
    expect(hard.rungs).toHaveLength(MAX_PLAYER_LEVEL - 60 + 1);
    expect(hard.rungs.map((r) => r.spec.level)).toEqual(Array.from({ length: 41 }, (_, i) => 60 + i));
    expect(hard.start).toBe(25);
    expect(hard.rungs[hard.start].short).toBe('level 85');
    expect(hard.label).toBe(`Celestial Trial (HARD, with ${warriorChar.name})`);
    expect(hard.rungs[0].spec).toEqual({ ...target(), tank: 'auto', starter: 'me', tactics: hard.rungs[0].spec.tactics, level: 60 });
    // the party's own level (no explicit level) is where it starts
    expect(ladderOf(target(), ctx).start).toBe(25);
    const normal = ladderOf({ kind: 'celestial', difficulty: 'NORMAL', partner: null }, { character: me });
    expect(normal.rungs[0].short).toBe('level 40');
    expect(normal.rungs).toHaveLength(61);
    expect(() => ladderOf(target({ level: 101 }), ctx)).toThrow(/needs a party level from 60/);
  });

  it('boss HP and attack rise along every rung (difficulty only goes up with level)', () => {
    for (const difficulty of ['NORMAL', 'HARD']) {
      const l = ladderOf({ kind: 'celestial', difficulty, partner: null }, { character: me });
      let prev = null;
      for (const r of l.rungs) {
        const b = celestialBossStats(r.spec.level, difficulty);
        if (prev) {
          expect(b.hp).toBeGreaterThan(prev.hp);
          expect(b.attack).toBeGreaterThan(prev.attack);
        }
        prev = b;
      }
    }
  });

  it('a changed partner changes every rung key (and so every stage seed); the same partner keeps them', () => {
    const a = ladderOf(target({ level: 85 }), ctx);
    const same = ladderOf(target({ level: 85 }), { ...ctx });
    expect(same.rungs.map((r) => r.key)).toEqual(a.rungs.map((r) => r.key));
    const stronger = { ...partner, fighter: { ...partner.fighter, stats: { ...partner.fighter.stats, totalAttack: partner.fighter.stats.totalAttack + 1 } } };
    const b = ladderOf(target({ level: 85 }), { character: me, partner: stronger });
    expect(b.rungs.every((r, i) => r.key !== a.rungs[i].key)).toBe(true);
    expect(new Set(a.rungs.map((r) => r.key)).size).toBe(a.rungs.length);
  });
});

describe('Celestial Push, live (real fixtures)', () => {
  it('a bounded run returns the deepest level the party clears at the target, with level labels', async () => {
    const res = await push({
      character: me, partner, presetId: me.activePresetId, target: target({ level: 85 }),
      objective: { kind: 'push', target: 0.5 }, space: only('mount'), effort: { level: 'quick', n0: 16, maxN: 64, randomStarts: 0 }, seed: 1,
    });
    expect(res.status).toBe('done');
    expect(res.push.ladder).toMatchObject({ kind: 'celestial', size: 41 });
    expect(res.push.start).toEqual({ index: 25, label: 'level 85' });
    expect(res.push.reached.deepest).toBeGreaterThanOrEqual(25);
    expect(res.push.reached.label).toMatch(/^level \d+$/);
    expect(res.headline.text).toMatch(/level \d+/);
    expect(res.request.partnerKey).toBe(prepare({ character: me, partner, target: target({ level: 85 }), objective: { kind: 'win-chance' } }).requestEcho.partnerKey);
    const strip = ladderStrip(viewResult(res).push);
    expect(strip[0].label).toBe('level 85');
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
  }, 600_000);
});
