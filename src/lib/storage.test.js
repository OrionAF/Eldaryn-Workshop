import { it, expect, vi, beforeEach } from 'vitest';
import { defaultExportFilename, downloadRoster, loadRoster } from './storage.js';
import { newRoster } from './model.js';

const STORAGE_KEY = 'eldaryn_optimiser_state_v1';

beforeEach(() => {
  localStorage.clear();
});

it('loadRoster returns an empty roster (landing page state) when localStorage has nothing saved', () => {
  const roster = loadRoster();
  expect(roster).toEqual({ characters: [], currentId: null });
});

it('loadRoster returns an empty roster when the saved data is corrupt JSON', () => {
  localStorage.setItem(STORAGE_KEY, '{not valid json');
  const roster = loadRoster();
  expect(roster).toEqual({ characters: [], currentId: null });
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
