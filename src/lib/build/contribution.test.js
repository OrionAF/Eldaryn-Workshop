import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { computePresetStats } from './stats.js';
import { sourceContributions, contributionRows } from './contribution.js';

describe('sourceContributions', () => {
  it('measures every source marginally and reports the interaction remainder', () => {
    const c = fixtureCharacter('WARRIOR');
    const contrib = sourceContributions(c, 'p1');
    expect(contrib.total.totalAttack).toBe(computePresetStats(c, 'p1').computed.totalAttack);
    const ids = contrib.sources.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['base', 'gear', 'talents', 'sigils', 'relics', 'mount']));
    const { rows, rest, total } = contributionRows(contrib, 'totalAttack');
    expect(rows.find((r) => r.id === 'gear').value).toBeGreaterThan(0);
    expect(rows.reduce((a, r) => a + r.value, 0) + rest).toBeCloseTo(total, 6);
  });

  it('a preset with no relics has no relics row', () => {
    const c = fixtureCharacter('WARRIOR');
    c.presets[0].relicIds = [];
    expect(sourceContributions(c, 'p1').sources.some((s) => s.id === 'relics')).toBe(false);
  });

  it('never reads the entered sheet', () => {
    const c = fixtureCharacter('WARRIOR');
    const before = sourceContributions(c, 'p1').total.totalAttack;
    c.presets[0].sheet = { values: { totalAttack: 1 }, enteredAt: null, inputsKey: null };
    expect(sourceContributions(c, 'p1').total.totalAttack).toBe(before);
  });
});
