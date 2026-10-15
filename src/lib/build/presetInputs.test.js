import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { computePresetStats } from './stats.js';
import { transcendencePreset } from './presetInputs.js';

function statsLinkedTo(c, id) {
  const copy = JSON.parse(JSON.stringify(c));
  copy.presets.find((p) => p.id === 'p2').transcendencePresetId = id;
  return computePresetStats(copy, 'p2').computed;
}

describe('unlinked preset transcendence board (B1, #83)', () => {
  it('an unlinked preset is built on the active board, not on "default"', () => {
    const c = fixtureCharacter('WARRIOR');
    const nodes = c.transcendence.presets[0].allocatedNodeIds;
    c.transcendence.presets.push({ id: 'x', name: 'X', allocatedNodeIds: nodes.slice(0, 3) });
    c.transcendence.activePresetId = 'x';
    const unlinked = computePresetStats(c, 'p2').computed;
    expect(unlinked).toEqual(statsLinkedTo(c, 'x'));
    expect(unlinked).not.toEqual(statsLinkedTo(c, 'default'));
  });

  it('fallback chain: link, then active board, then default, then the first board', () => {
    const c = fixtureCharacter('WARRIOR');
    c.transcendence.presets.push({ id: 'x', name: 'X', allocatedNodeIds: [] });
    const p2 = c.presets[1];
    expect(transcendencePreset(c, p2).id).toBe('default');
    c.transcendence.activePresetId = 'x';
    expect(transcendencePreset(c, p2).id).toBe('x');
    expect(transcendencePreset(c, { ...p2, transcendencePresetId: 'default' }).id).toBe('default');
    expect(transcendencePreset(c, { ...p2, transcendencePresetId: 'gone' }).id).toBe('x');
    c.transcendence.activePresetId = 'gone';
    expect(transcendencePreset(c, p2).id).toBe('default');
    c.transcendence.presets.shift();
    expect(transcendencePreset(c, p2).id).toBe('x');
  });
});
