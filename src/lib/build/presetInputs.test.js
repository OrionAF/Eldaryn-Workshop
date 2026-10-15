import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { computePresetStats } from './stats.js';
import { transcendencePreset, buildPresetInputs } from './presetInputs.js';
import { powerInputs } from './power.js';

describe('Transcendence level gates in the build (transcendence.md §1, §9)', () => {
  const at = (c, level, presetId = 'p1') => buildPresetInputs({ ...c, level }, presetId);
  const boardBonus = (r) => r.args[9];

  it('below 55 the board adds nothing, the Ancient drops and power counts no nodes; from 55 it all counts', () => {
    const c = fixtureCharacter('WARRIOR'); // p1: FLAMEBORN on a default board that allocates its node
    expect(Object.values(boardBonus(at(c, 54))).every((v) => v === 0)).toBe(true);
    expect(at(c, 54).ancientDropped).toBe(true);
    expect(at(c, 54).warnings).toEqual(['FLAMEBORN is ignored: Transcendence unlocks at level 55.']);
    expect(powerInputs({ ...c, level: 54 }, 'p1').input.transcendenceNodeCount).toBe(0);
    expect(Object.values(boardBonus(at(c, 55))).some((v) => v !== 0)).toBe(true);
    expect(at(c, 55).ancientDropped).toBe(false);
    expect(powerInputs({ ...c, level: 55 }, 'p1').input.transcendenceNodeCount).toBeGreaterThan(0);
  });

  it('at 55-57 a link to another board is ignored for the active board; from 58 it counts', () => {
    const c = fixtureCharacter('WARRIOR');
    c.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    const linked = (level) => statsLinkedTo({ ...c, level }, 'bare');
    const unlinked = (level) => computePresetStats({ ...c, level }, 'p2').computed;
    expect(linked(57)).toEqual(unlinked(57));
    expect(linked(58)).not.toEqual(unlinked(58));
  });
});

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
