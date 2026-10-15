import { describe, it, expect } from 'vitest';
import { tierChangeLosses, boardUsers, relicUsers, inertGlyphPresets } from './usage.js';
import { rosterStore } from '../rosterStore.svelte.js';

function fresh(cls = 'WARRIOR') {
  localStorage.clear();
  rosterStore.addCharacter('U', cls);
  return rosterStore.current;
}

describe('build/usage', () => {
  it('tierChangeLosses names the pets and the presets that lose theirs', () => {
    fresh();
    const id = rosterStore.addPet('EMBER_FOX');
    rosterStore.setPresetPet(rosterStore.current.presets[0].id, id);
    const l = tierChangeLosses(rosterStore.current);
    expect(l.pets).toEqual([{ id, name: 'Ember Fox' }]);
    expect(l.presets).toEqual([rosterStore.current.presets[0].name]);
  });

  it('boardUsers separates linked presets from presets that follow the active board', () => {
    fresh();
    const b = rosterStore.addTranscendencePreset('B');
    const [p0, p1] = rosterStore.current.presets;
    rosterStore.setPresetTranscendence(p0.id, 'default');
    rosterStore.setActiveTranscendencePreset(b);
    const c = rosterStore.current;
    expect(boardUsers(c, 'default')).toEqual({ linked: [p0.name], following: [] });
    expect(boardUsers(c, b).following).toContain(p1.name);
    expect(boardUsers(c, b).linked).toEqual([]);
  });

  it('relicUsers lists nothing for an unequipped relic', () => {
    fresh();
    expect(relicUsers(rosterStore.current, 'nope')).toEqual([]);
  });

  it('inertGlyphPresets names only the presets that ride the mount without the sigil', () => {
    fresh();
    expect(inertGlyphPresets(rosterStore.current).size).toBe(0);
    const m = rosterStore.addMount({ species: 'NIGHT_WOLF' });
    const g = rosterStore.addGlyph({ glyphType: 'sg-warborn-cd', rarity: 'Rare' });
    expect(rosterStore.setMountSocket(m, 'major', 0, g).ok).toBe(true);
    const [p0, p1] = rosterStore.current.presets;
    // Socketed but nobody rides the mount: nothing to warn about.
    expect(inertGlyphPresets(rosterStore.current).size).toBe(0);
    rosterStore.setPresetMount(p0.id, m);
    expect(inertGlyphPresets(rosterStore.current).get(g)).toEqual([p0.name]);
    expect(p1.mountId).toBeNull();
  });
});
