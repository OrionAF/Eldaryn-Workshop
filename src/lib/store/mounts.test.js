import { describe, it, expect, beforeEach } from 'vitest';
import { rosterStore } from '../rosterStore.svelte.js';
import { loadRoster } from '../storage.js';

const cur = () => rosterStore.current;

describe('mounts store', () => {
  let id;
  beforeEach(() => {
    localStorage.clear();
    id = rosterStore.addCharacter('Mounty', 'WARRIOR');
  });

  it('adds, patches and removes mounts, persisting every change', () => {
    const mid = rosterStore.addMount({ species: 'STORM_ROC' });
    expect(cur().mounts).toHaveLength(1);
    expect(cur().mounts[0]).toMatchObject({ id: mid, species: 'STORM_ROC', rarity: 'Epic', level: 1, baseHp: 34, baseAtk: 26 });
    expect(loadRoster().characters.find((c) => c.id === id).mounts).toHaveLength(1);

    rosterStore.updateMount(mid, { level: 4, baseHp: 37, species: 'NIGHT_WOLF' });
    expect(cur().mounts[0]).toMatchObject({ level: 4, baseHp: 37, species: 'STORM_ROC' }); // species cannot change
    rosterStore.updateMount(mid, { level: 99, baseAtk: 'x' });
    expect(cur().mounts[0]).toMatchObject({ level: 5, baseAtk: 0 });

    expect(rosterStore.addMount({ species: 'DRAGON' })).toBeNull();
    rosterStore.removeMount(mid);
    expect(cur().mounts).toEqual([]);
  });

  it('removing a mount clears preset.mountId (via setPresetMount) ', () => {
    const mid = rosterStore.addMount({ species: 'NIGHT_WOLF' });
    const pid = cur().activePresetId;
    rosterStore.setPresetMount(pid, mid);
    expect(cur().presets.find((p) => p.id === pid).mountId).toBe(mid);
    rosterStore.removeMount(mid);
    expect(cur().presets.find((p) => p.id === pid).mountId).toBeNull();
  });

  it('sockets: right tier, unsealed, class-gated majors; a glyph moves instead of duplicating', () => {
    const m1 = rosterStore.addMount({ species: 'NIGHT_WOLF' });
    const m2 = rosterStore.addMount({ species: 'FROSTFANG_WOLF' });
    const minor = rosterStore.addGlyph({ glyphType: 'g-swift', rarity: 'Common' });
    const sealed = rosterStore.addGlyph({ glyphType: 'g-keen', rarity: 'Uncommon', sealed: true });
    const major = rosterStore.addGlyph({ glyphType: 'sg-warborn-cd', rarity: 'Rare' });

    expect(rosterStore.setMountSocket(m1, 'minor', 0, minor)).toEqual({ ok: true });
    expect(cur().mounts[0].glyphs.minor).toEqual([minor, null, null]);
    expect(rosterStore.setMountSocket(m1, 'minor', 1, sealed).ok).toBe(false);
    expect(rosterStore.setMountSocket(m1, 'major', 0, minor).ok).toBe(false); // wrong tier
    expect(rosterStore.setMountSocket(m1, 'minor', 3, minor).ok).toBe(false); // no 4th minor socket
    expect(rosterStore.setMountSocket(m1, 'major', 1, major).ok).toBe(true);

    // moving: the minor leaves m1 when socketed on m2
    expect(rosterStore.setMountSocket(m2, 'minor', 2, minor).ok).toBe(true);
    expect(cur().mounts[0].glyphs.minor).toEqual([null, null, null]);
    expect(cur().mounts[1].glyphs.minor).toEqual([null, null, minor]);

    expect(rosterStore.setMountSocket(m2, 'minor', 2, null)).toEqual({ ok: true });
    expect(cur().mounts[1].glyphs.minor).toEqual([null, null, null]);
  });

  it('unlocking works, re-sealing empties the socket, removing the glyph empties it too', () => {
    const m = rosterStore.addMount({ species: 'NIGHT_WOLF' });
    const g = rosterStore.addGlyph({ glyphType: 'g-spark', rarity: 'Uncommon', sealed: true });
    rosterStore.updateGlyph(g, { sealed: false });
    expect(rosterStore.setMountSocket(m, 'minor', 0, g).ok).toBe(true);
    rosterStore.updateGlyph(g, { secondary: { stat: 'lifesteal', quality: 0.5 } });
    expect(cur().glyphs[0].secondary).toEqual({ stat: 'lifesteal', quality: 0.5 });
    expect(cur().mounts[0].glyphs.minor[0]).toBe(g);
    rosterStore.updateGlyph(g, { sealed: true });
    expect(cur().glyphs[0]).toMatchObject({ sealed: true, secondary: null });
    expect(cur().mounts[0].glyphs.minor[0]).toBeNull();
    rosterStore.updateGlyph(g, { sealed: false });
    rosterStore.setMountSocket(m, 'minor', 0, g);
    rosterStore.removeGlyph(g);
    expect(cur().glyphs).toEqual([]);
    expect(cur().mounts[0].glyphs.minor[0]).toBeNull();
  });

  it('major glyphs of another class cannot be added', () => {
    expect(rosterStore.addGlyph({ glyphType: 'sg-phantom-cd', rarity: 'Rare' })).toBeNull(); // Sentinel major on a Warrior
    expect(cur().glyphs).toEqual([]);
  });

  it('switching class drops the old class majors from the inventory and from sockets', () => {
    const m = rosterStore.addMount({ species: 'NIGHT_WOLF' });
    const major = rosterStore.addGlyph({ glyphType: 'sg-warborn-cd', rarity: 'Rare' });
    const minor = rosterStore.addGlyph({ glyphType: 'g-swift', rarity: 'Common' });
    rosterStore.setMountSocket(m, 'major', 0, major);
    rosterStore.setMountSocket(m, 'minor', 0, minor);
    rosterStore.setCharacterClass(id, 'MYSTIC');
    expect(cur().class).toBe('MYSTIC');
    expect(cur().glyphs.map((g) => g.id)).toEqual([minor]);
    expect(cur().mounts[0].glyphs.major).toEqual([null, null]);
    expect(cur().mounts[0].glyphs.minor[0]).toBe(minor);
  });
});
