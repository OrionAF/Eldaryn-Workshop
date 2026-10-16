import { describe, it, expect } from 'vitest';
import { fixtureCharacter } from './fixtures.js';
import { describeBuild } from './describe.js';
import { petDisplayName } from '../game/pets.js';
import { buildFighter } from './fighter.js';
import { SIGIL_CATALOGUE, sigilClasses, isSigilSpeciesActiveForSpec } from '../game/sigils.js';

const line = (lines, label) => lines.find((l) => l.label === label)?.value;

describe('describeBuild', () => {
  const c = fixtureCharacter('WARRIOR');

  it('resolves every dimension to plain text', () => {
    const lines = describeBuild(c, 'p1');
    expect(line(lines, 'Gear set')).toBe('Set 1');
    expect(line(lines, 'Talents')).toMatch(/^Arms - Sharpened Blade 5\/5/);
    expect(line(lines, 'Pet').startsWith(`${petDisplayName('INFERNAL_DRAKE', true)} (Legendary`)).toBe(true); // altar tier 2: evolved name
    expect(line(lines, 'Relics')).toContain('Iron Heart');
    expect(line(lines, 'Sigils')).toContain('Berserk Stance');
    expect(line(lines, 'Ancient sigil')).toBe('Flameborn');
    expect(line(lines, 'Mount')).toMatch(/^Night Wolf \(level 3 · \+8% HP, \+8% Attack\)$/);
    expect(line(lines, 'Major glyphs')).toContain('Warhaste Emblem (Rare)');
    expect(line(lines, 'Transcendence')).toBe('Default (77 nodes)');
    expect(lines.every((l) => typeof l.label === 'string' && typeof l.value === 'string')).toBe(true);
  });

  it('the full build never shows a raw stat key (backlog §6)', () => {
    const lines = describeBuild(c, 'p1');
    expect(line(lines, 'Minor glyphs')).toMatch(/\(Common · Crit Chance \+[\d.]+%\)/);
    for (const l of lines) expect(l.value).not.toMatch(/(critChance|attackPercent|healthPercent|critDamage)|[A-Z]+_[A-Z]+/);
  });

  it('an empty preset reads None and the Oblivion realm names its set', () => {
    const lines = describeBuild(c, 'p2', { realm: 'oblivion' });
    expect(line(lines, 'Gear set')).toBe('Oblivion set');
    expect(line(lines, 'Pet')).toBe('None');
    expect(line(lines, 'Mount')).toBe('None');
    expect(line(lines, 'Relics')).toBe('None');
  });

  it('accepts a preset-shaped candidate and an allocation override', () => {
    const cand = { ...c.presets[0], petId: null, talentSet: 1 };
    const lines = describeBuild(c, cand, { talentAllocation: { tank_t1_fortitude: 2 } });
    expect(line(lines, 'Pet')).toBe('None');
    expect(line(lines, 'Talents')).toBe('Protection - Fortitude 2/5');
  });

  it('keeps unknown ids readable instead of throwing', () => {
    const cand = { ...c.presets[0], relicIds: ['relic_gone'], sigilSpecies: ['GONE_SIGIL'] };
    const lines = describeBuild(c, cand);
    expect(lines.find((l) => l.label === 'Relics')).toMatchObject({ value: 'None', inactive: 'relic_gone (not owned)' });
    expect(lines.find((l) => l.label === 'Sigils')).toMatchObject({ value: 'None', inactive: 'GONE_SIGIL (not owned)' });
  });

  it('calls a sigil unusable exactly when the Fighter would not run it (one rule for both)', () => {
    const w = JSON.parse(JSON.stringify(fixtureCharacter('WARRIOR')));
    const foreign = SIGIL_CATALOGUE.find((x) => x.rarity !== 'Ancient' && !sigilClasses(x).includes('WARRIOR')).species;
    w.sigils.owned[foreign] = { level: 1 };
    const preset = { ...w.presets[0], sigilSpecies: [foreign] };
    const fighterRuns = buildFighter(w, preset.id).sigils.length;
    // the engine's rule (isSigilSpeciesActiveForSpec) does not look at the class for a Warrior, so
    // describe must not claim the sigil is inert while the Fighter carries it
    const runs = isSigilSpeciesActiveForSpec(foreign, 'WARRIOR', null);
    const sigils = describeBuild(w, preset).find((l) => l.label === 'Sigils');
    expect(runs).toBe(true);
    expect(sigils.inactive).toBeUndefined();
    expect(fighterRuns).toBeGreaterThan(0);
  });

  const LABELS = ['Gear set', 'Talents', 'Pet', 'Mount', 'Minor glyphs', 'Major glyphs', 'Mythic glyph', 'Relics', 'Sigils', 'Utility sigil', 'Ancient sigil', 'Conditions', 'Transcendence'];

  it('emits the same labels in the same order for any build (B1, #91)', () => {
    const bare = { ...c.presets[0], petId: null, mountId: null, relicIds: [], sigilSpecies: [], utilitySigilSpecies: null, ancientSigilSpecies: null };
    for (const p of [c.presets[0], c.presets[1], bare]) {
      expect(describeBuild(c, p).map((l) => l.label)).toEqual(LABELS);
    }
    const lines = describeBuild(c, bare);
    expect(line(lines, 'Utility sigil')).toBe('None');
    expect(line(lines, 'Ancient sigil')).toBe('None');
  });

  it('dropping the Ancient changes only the Ancient line (B1, #91)', () => {
    const base = describeBuild(c, c.presets[0]);
    const dropped = describeBuild(c, { ...c.presets[0], ancientSigilSpecies: null });
    expect(base.filter((l, i) => l.value !== dropped[i].value).map((l) => l.label)).toEqual(['Ancient sigil']);
  });

  it('a minor-only socket change changes the Minor glyphs line (B1, #92)', () => {
    const edited = JSON.parse(JSON.stringify(c));
    edited.mounts[0].glyphs.minor = ['gl-1', null, null];
    const a = describeBuild(c, 'p1');
    const b = describeBuild(edited, 'p1');
    expect(a.filter((l, i) => l.value !== b[i].value).map((l) => l.label)).toEqual(['Minor glyphs']);
    expect(line(a, 'Minor glyphs')).toMatch(/Common/);
  });

  it('a major glyph whose sigil is not equipped is marked inactive, not listed as active (B1, #81)', () => {
    const lines = describeBuild(c, { ...c.presets[0], sigilSpecies: [] });
    const major = lines.find((l) => l.label === 'Major glyphs');
    expect(major.value).toBe('None');
    expect(major.inactive).toMatch(/Warhaste Emblem/);
    expect(major.inactive).toMatch(/sigil is not equipped/);
    expect(lines.find((l) => l.label === 'Sigils').inactive).toBeUndefined();
  });

  it('conditions show only where the Fighter applies them (B1, #81)', () => {
    const e = JSON.parse(JSON.stringify(c));
    const sp = e.presets[0].sigilSpecies[0];
    e.sigils.owned[sp].condition = 'MY_HP_BELOW_40';
    expect(line(describeBuild(e, 'p1'), 'Conditions')).toContain('My HP at or below 40%');
    e.level = 40;
    expect(line(describeBuild(e, 'p1'), 'Conditions')).toBe('None');
  });
});
