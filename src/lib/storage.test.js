import { it, expect, vi, beforeEach } from 'vitest';
import { defaultExportFilename, downloadRoster, loadRoster } from './storage.js';
import { newRoster } from './model/index.js';
import { saveRoster, importRoster, importJson, exportRoster, clearAllData, KEY, KEY_V1 } from './storage.js';

const STORAGE_KEY = KEY;

beforeEach(() => {
  localStorage.clear();
});

it('loadRoster returns an empty roster (landing page state) when localStorage has nothing saved', () => {
  const roster = loadRoster();
  expect(roster).toEqual({ schemaVersion: 2, characters: [], currentId: null });
});

it('loadRoster returns an empty roster when the saved data is corrupt JSON', () => {
  localStorage.setItem(STORAGE_KEY, '{not valid json');
  const roster = loadRoster();
  expect(roster).toEqual({ schemaVersion: 2, characters: [], currentId: null });
});

it('defaultExportFilename uses the current character name + a datetime stamp, ending in .json', () => {
  const roster = newRoster();
  roster.characters[0].name = 'Character 1';
  const filename = defaultExportFilename(roster);
  expect(filename).toMatch(/^Character-1_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
});

it('defaultExportFilename sanitises characters that are unsafe in filenames', () => {
  const roster = newRoster();
  roster.characters[0].name = 'Bob/The "Great" *Slayer*!';
  const filename = defaultExportFilename(roster);
  expect(filename).toMatch(/^Bob-The-Great-Slayer_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
});

it('defaultExportFilename falls back to "roster" for an empty/blank name', () => {
  const roster = newRoster();
  roster.characters[0].name = '   ';
  const filename = defaultExportFilename(roster);
  expect(filename).toMatch(/^roster_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
});

it('downloadRoster uses defaultExportFilename when no explicit filename is given', () => {
  const created = vi.fn(() => 'blob:mock');
  const hadCreate = 'createObjectURL' in URL;
  URL.createObjectURL = created;
  if (!('revokeObjectURL' in URL)) URL.revokeObjectURL = vi.fn();
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  const roster = newRoster();
  roster.characters[0].name = 'Aria';
  let downloadedName = null;
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    const el = originalCreateElement(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'download', {
        set: (v) => { downloadedName = v; },
        get: () => downloadedName,
      });
    }
    return el;
  });

  downloadRoster(roster);

  expect(downloadedName).toMatch(/^Aria_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);

  clickSpy.mockRestore();
  document.createElement.mockRestore();
  if (!hadCreate) delete URL.createObjectURL;
});

const V1_BLOB = JSON.stringify({
  characters: [
    {
      id: 'old1',
      name: 'Aria',
      class: 'Sentinel',
      loadouts: [{ gear: {} }, { gear: {} }],
      presets: [{ id: 'op1', name: 'Boss', loadout: 1, talentSet: 1, relicIds: ['x'], sigilIds: ['y'] }],
      activePresetId: 'op1',
    },
  ],
  currentId: 'old1',
});

it('uses the v2 key', () => {
  expect(KEY).toBe('eldaryn_optimiser_state_v2');
  saveRoster(newRoster());
  expect(JSON.parse(localStorage.getItem(KEY)).schemaVersion).toBe(2);
  expect(localStorage.getItem(KEY_V1)).toBeNull();
});

it('loadRoster migrates a v1 blob when there is no v2 blob, and leaves the v1 key byte-identical', () => {
  localStorage.setItem(KEY_V1, V1_BLOB);
  const roster = loadRoster();
  expect(roster.schemaVersion).toBe(2);
  expect(roster.characters[0]).toMatchObject({ id: 'old1', name: 'Aria', class: 'SENTINEL', level: 100 });
  expect(roster.characters[0].presets[0]).toMatchObject({ name: 'Boss', equipmentSet: 2, talentSet: 1 });
  expect(localStorage.getItem(KEY_V1)).toBe(V1_BLOB);
  expect(localStorage.getItem(KEY)).toBeNull(); // nothing written until the first persist()
});

it('saving after a v1 migration writes only the v2 key', () => {
  localStorage.setItem(KEY_V1, V1_BLOB);
  saveRoster(loadRoster());
  expect(localStorage.getItem(KEY_V1)).toBe(V1_BLOB);
  expect(loadRoster().characters[0].id).toBe('old1');
});

it('a v2 blob wins over a v1 blob', () => {
  localStorage.setItem(KEY_V1, V1_BLOB);
  const r = newRoster();
  r.characters[0].name = 'FromV2';
  saveRoster(r);
  expect(loadRoster().characters[0].name).toBe('FromV2');
});

it('importRoster accepts both v1 and v2 JSON', () => {
  expect(importRoster(V1_BLOB).characters[0].class).toBe('SENTINEL');
  const r = newRoster();
  const back = importRoster(exportRoster(r));
  expect(back).toEqual(r);
});

it('importRoster throws on unparseable JSON and yields the empty roster for junk', () => {
  expect(() => importRoster('{nope')).toThrow();
  expect(importRoster('{"characters":[]}').characters).toEqual([]);
});

// A tiny game-profile shape (invented values): see model/gameProfile.test.js for the full mapping.
const profileJson = (name = 'Hero') =>
  JSON.stringify({ player: { name, class: 'WARRIOR', level: 50 }, equipment: {}, computedStats: { totalAttack: 1000 } });

it('importJson adds a game profile as a new selected character and leaves the input roster alone', () => {
  const roster = newRoster();
  const before = JSON.stringify(roster);
  const out = importJson(profileJson('Hero'), roster, { now: 'T' });
  expect(JSON.stringify(roster)).toBe(before);
  expect(out.kind).toBe('profile');
  expect(out.roster.characters).toHaveLength(2);
  expect(out.roster.currentId).toBe(out.character.id);
  expect(out.character).toMatchObject({ name: 'Hero', class: 'WARRIOR', level: 50 });
  expect(out.character.presets.find((p) => p.id === out.character.activePresetId).sheet.values.totalAttack).toBe(1000);
  expect(importRoster(exportRoster(out.roster))).toEqual(out.roster);
});

it('importJson suffixes " (imported)" when the name exists, and still replaces the roster for app exports', () => {
  const roster = newRoster();
  roster.characters[0].name = 'Hero';
  expect(importJson(profileJson('Hero'), roster).character.name).toBe('Hero (imported)');
  const other = newRoster();
  other.characters[0].name = 'Elsewhere';
  const out = importJson(exportRoster(other), roster);
  expect(out).toMatchObject({ kind: 'roster', character: null });
  expect(out.roster).toEqual(other);
  expect(() => importJson('{nope', roster)).toThrow();
});

it('importJson into an empty roster (Welcome screen) yields a single selected character', () => {
  const out = importJson(profileJson('First'));
  expect(out.roster.characters).toHaveLength(1);
  expect(out.roster.currentId).toBe(out.roster.characters[0].id);
});

it('clearAllData removes the v2 blob, the v1 blob and the legacy settings key', () => {
  localStorage.setItem(KEY, '{}');
  localStorage.setItem(KEY_V1, V1_BLOB);
  localStorage.setItem('eldaryn_optimiser_settings_v1', '{}');
  clearAllData();
  expect(localStorage.getItem(KEY)).toBeNull();
  expect(localStorage.getItem(KEY_V1)).toBeNull();
  expect(localStorage.getItem('eldaryn_optimiser_settings_v1')).toBeNull();
});
