import { describe, it, expect } from 'vitest';
import { createBuildSpace, BLOCKS } from './space.js';
import { optimize } from './search.js';
import { fixtureCharacter } from '../build/fixtures.js';
import { normaliseCharacter } from '../model/index.js';

const block = (space, id) => space.blocks.find((b) => b.id === id);
const sock = () => ({ minor: [null, null, null], major: [null, null], mythic: [null] });
const mk = (id, level, baseHp, baseAtk, rarity = 'Rare') => ({ id, species: 'NIGHT_WOLF', rarity, level, baseHp, baseAtk, glyphs: sock() });

/** The fixture with its mounts replaced (stats set directly: roll ranges are not under test) and `current` ridden. */
function withMounts(mounts, current) {
  const c = normaliseCharacter(JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR'))));
  const ch = { ...c, mounts, presets: c.presets.map((p) => (p.id === 'p1' ? { ...p, mountId: current } : p)) };
  return createBuildSpace(ch, 'p1');
}
const tried = (space) => block(space, 'mount').domain(space.start).map((a) => a.mountId);

describe('mount dominance pruning', () => {
  it('a Common is never tried while an Epic of the same level beats it', () => {
    const space = withMounts([mk('com', 2, 10, 8, 'Common'), mk('epic', 2, 37, 25, 'Epic'), mk('rare', 2, 30, 20)], 'epic');
    expect(tried(space)).toEqual([null]);
    expect(space.prunedMounts(space.start).map((p) => p.id).sort()).toEqual(['com', 'rare']);
    const away = withMounts([mk('com', 2, 10, 8, 'Common'), mk('epic', 2, 37, 25, 'Epic')], null);
    expect(tried(away)).toEqual(['epic']);
  });

  it('a level-5 Rare stays beside a level-1 Epic: each wins on one stat', () => {
    const space = withMounts([mk('rare5', 5, 29, 16), mk('epic1', 1, 34, 24, 'Epic')], 'epic1');
    expect(tried(space)).toEqual([null, 'rare5']);
    expect(space.prunedMounts(space.start)).toEqual([]);
  });

  it('equal twins collapse to one, preferring the current mount', () => {
    const mounts = [mk('a', 2, 30, 20), mk('b', 2, 30, 20), mk('c', 2, 30, 20)];
    expect(tried(withMounts(mounts, null)).filter(Boolean)).toEqual(['a']);
    expect(tried(withMounts(mounts, 'b'))).toEqual([null]); // the ridden twin is the baseline; a and c are pruned
  });

  it('a dominated current mount stays the baseline, and switching to the dominating one is offered', () => {
    const space = withMounts([mk('weak', 1, 10, 8), mk('strong', 1, 30, 20)], 'weak');
    expect(space.start.mountId).toBe('weak');
    expect(tried(space)).toEqual([null, 'strong']);
    expect(space.domainSizes(space.start).mount).toBe(3);
  });

  it('the pruned-current-mount baseline is not reported as pruned', () => {
    const space = withMounts([mk('weak', 1, 10, 8), mk('strong', 1, 30, 20), mk('weak2', 1, 5, 5)], 'weak');
    expect(space.prunedMounts(space.start).map((p) => p.id)).toEqual(['weak2']);
  });

  it('a search never races a dominated mount and reports it as pruned', { timeout: 120000 }, async () => {
    const c = normaliseCharacter(JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR'))));
    const mounts = [mk('com', 2, 10, 8, 'Common'), mk('epic', 2, 37, 25, 'Epic')];
    const character = { ...c, mounts, presets: c.presets.map((p) => (p.id === 'p1' ? { ...p, mountId: null } : p)) };
    const space = Object.fromEntries(BLOCKS.map((b) => [b, b === 'mount']));
    const r = await optimize({ character, presetId: 'p1', target: { kind: 'dummy', seconds: 10 }, space, effort: { level: 'quick', n0: 8, maxN: 32, randomStarts: 0 }, seed: 2 });
    const raced = [r.baseline, ...r.rows].map((x) => x.candidate.mountId ?? null);
    expect(raced).not.toContain('com');
    expect(r.search.blocks.find((b) => b.id === 'mount').pruned).toEqual([{ id: 'com', by: 'epic' }]);
    expect(r.search.blocks.find((b) => b.id === 'mount').domain).toBe(2);
  });
});
