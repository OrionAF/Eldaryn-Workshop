import { describe, it, expect } from 'vitest';
import { AREAS, PAGES, areaFirstPage, formatHash, pageById, pagesOfArea, parseHash, resolveTarget } from './routes.js';

describe('route table', () => {
  it('has the 18 pages of ia.md §1 in three groups, in rail order', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['character', 'builds', 'tools']);
    expect(pagesOfArea('character').map((p) => p.label)).toEqual([
      'Overview', 'Skills & Clan', 'Gear', 'Talents', 'Sigils', 'Pets', 'Mounts & Glyphs', 'Relics', 'Awakening', 'Transcendence',
    ]);
    expect(pagesOfArea('builds').map((p) => p.label)).toEqual(['Presets', 'Loadout', 'Stat Sheet']);
    expect(pagesOfArea('tools').map((p) => p.label)).toEqual(['Drop Check', 'Optimiser', 'Duel', 'Opponents', 'Oblivion Floors']);
    expect(PAGES).toHaveLength(18);
  });

  it('gives every page a unique id and a hash that parses back to it', () => {
    expect(new Set(PAGES.map((p) => p.id)).size).toBe(18);
    for (const p of PAGES) expect(parseHash(formatHash(p.id))).toMatchObject({ kind: 'page', id: p.id, tab: null });
  });
});

describe('parseHash', () => {
  it('reads area, page and tab', () => {
    expect(parseHash('#/character/gear/set2')).toMatchObject({ kind: 'page', id: 'character/gear', tab: 'set2', hash: '#/character/gear/set2' });
    expect(parseHash('#/builds/loadout')).toMatchObject({ id: 'builds/loadout', tab: null });
  });

  it('knows the two global pages', () => {
    expect(parseHash('#/settings').kind).toBe('settings');
    expect(parseHash('#/welcome').kind).toBe('welcome');
  });

  it('resolves an area alone to its first page and normalises case and trailing slashes', () => {
    expect(parseHash('#/tools').hash).toBe('#/tools/drop');
    expect(parseHash('#/Character/Gear/').hash).toBe('#/character/gear');
    expect(areaFirstPage('builds').id).toBe('builds/presets');
  });

  it('treats everything else as unknown', () => {
    for (const bad of ['', '#', '#/', '#/nope', '#/character/nope', '#/character/gear/a/b', '#/character/gear/a b', '#/settings/x', 'gear']) {
      expect(parseHash(bad).kind, bad).toBe('unknown');
    }
  });
});

describe('resolveTarget', () => {
  it('maps every legacy screen id the old screens pass to onNavigate', () => {
    const expected = {
      character: '#/character/overview', presets: '#/builds/presets', drop: '#/tools/drop', gear: '#/character/gear',
      talents: '#/character/talents', sigils: '#/character/sigils', pets: '#/character/pets', mounts: '#/character/mounts',
      relics: '#/character/relics', awakening: '#/character/awakening', transcendence: '#/character/transcendence',
      optimiser: '#/tools/optimiser', duel: '#/tools/duel', oblivion: '#/tools/oblivion',
    };
    for (const [legacy, hash] of Object.entries(expected)) expect(resolveTarget(legacy), legacy).toBe(hash);
  });

  it('accepts hashes, route paths and the global pages; rejects junk', () => {
    expect(resolveTarget('#/tools/duel')).toBe('#/tools/duel');
    expect(resolveTarget('character/gear/set2')).toBe('#/character/gear/set2');
    expect(resolveTarget('settings')).toBe('#/settings');
    expect(resolveTarget('nonsense')).toBeNull();
    expect(resolveTarget(undefined)).toBeNull();
    expect(pageById('tools/oblivion').scope).toBe('oblivion');
  });
});
