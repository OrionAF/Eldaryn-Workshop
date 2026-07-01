import { it, expect, vi } from 'vitest';
import { defaultExportFilename, downloadRoster } from './storage.js';
import { newRoster } from './model.js';

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
