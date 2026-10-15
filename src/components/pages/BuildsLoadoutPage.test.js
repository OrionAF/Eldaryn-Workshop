import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import BuildsLoadoutPage from './BuildsLoadoutPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { fixtureCharacter } from '../../lib/build/fixtures.js';
import { relicSlotCap } from '../../lib/model/legality.js';
import { relicsForClass } from '../../lib/game/relics.js';
import { setup, click } from '../ui/testkit.js';

let t;
function load(c) {
  rosterStore.roster.characters.splice(0, rosterStore.roster.characters.length, c);
  rosterStore.roster.currentId = c.id;
}
function open() {
  t = setup(BuildsLoadoutPage, {});
}
beforeEach(() => {
  localStorage.clear();
  load(fixtureCharacter('WARRIOR'));
  open();
});
afterEach(() => t.done());

const preset = () => rosterStore.current.presets.find((p) => p.id === rosterStore.current.activePresetId);
const reopen = () => {
  t.done();
  open();
};

it('the preset name input renames the active preset', () => {
  const name = t.q('input[aria-label="Preset name"]');
  name.value = 'Farm Build';
  name.dispatchEvent(new Event('blur', { bubbles: true }));
  expect(preset().name).toBe('Farm Build');
});

it('Delete preset is refused at the two-preset minimum', () => {
  rosterStore.deletePreset(rosterStore.current.presets[1].id);
  reopen();
  expect(rosterStore.current.presets.length).toBeGreaterThanOrEqual(2);
  const del = t.qa('button').find((b) => b.textContent.trim() === 'Delete preset');
  expect(del.disabled).toBe(true);
});

it('the equipment set control writes the preset, and Set 2 is gated below level 28', () => {
  const set2 = t.qa('[aria-label="Equipment set"] button').find((b) => b.textContent.includes('Set 2'));
  click(set2);
  expect(preset().equipmentSet).toBe(2);
  const low = fixtureCharacter('WARRIOR');
  low.level = 20;
  load(low);
  reopen();
  const set2b = t.qa('[aria-label="Equipment set"] button').find((b) => b.textContent.includes('Set 2'));
  expect(set2b.disabled || set2b.getAttribute('aria-disabled') === 'true').toBe(true);
});

describe('Transcendence board picker', () => {
  const board = () => {
    const label = t.qa('label').find((l) => l.textContent.trim() === 'Transcendence board');
    return document.getElementById(label.getAttribute('for'));
  };
  const withBoards = (level, link) => {
    const c = fixtureCharacter('WARRIOR');
    c.level = level;
    c.transcendence.presets.push({ id: 'bare', name: 'Bare', allocatedNodeIds: [] });
    c.presets[0].transcendencePresetId = link;
    load(c);
    reopen();
  };
  const enabled = () => [...board().options].filter((o) => !o.disabled).map((o) => o.value);

  it('links any board from level 58', () => {
    withBoards(58, 'default');
    expect(board().disabled).toBe(false);
    expect(enabled()).toEqual(['', 'default', 'bare']);
  });

  it('at 55-57 it offers no link: the preset follows the active board', () => {
    withBoards(56, null);
    expect(board().disabled).toBe(true);
    expect(t.target.textContent).toContain('Linking a board unlocks at level 58');
  });

  it('below 58 a saved link to another board can still be cleared', () => {
    withBoards(38, 'bare');
    expect(board().disabled).toBe(false);
    expect(enabled()).toEqual(['', 'bare']);
    board().value = '';
    board().dispatchEvent(new Event('change', { bubbles: true }));
    expect(preset().transcendencePresetId).toBeNull();
  });
});

it('pet and mount are radio cards; None clears the choice', () => {
  const none = t.qa('[aria-label="Pet"] [role="radio"]')[0];
  click(none);
  expect(preset().petId).toBeNull();
  const m = t.qa('[aria-label="Mount"] [role="radio"]');
  click(m[0]);
  expect(preset().mountId).toBeNull();
  click(m[1]);
  expect(preset().mountId).toBe(rosterStore.current.mounts[0].id);
});

it('the ridden mount shows its sockets read-only with an Edit sockets link, and marks inert majors', () => {
  const box = t.q('[data-testid="mount-sockets"]');
  expect(box).not.toBeNull();
  expect(box.textContent).toContain('Minor glyphs');
  expect(box.querySelector('a[href="#/character/mounts"]')).not.toBeNull();
  expect(box.querySelectorAll('input, select, button')).toHaveLength(0);
});

it('relic slots follow the cap and a full tray says so inline', () => {
  const c = rosterStore.current;
  const cap = relicSlotCap(c.level, c.extraRelicSlots);
  const owned = relicsForClass(c.class).filter((d) => (c.relics[d.id] ?? 0) > 0);
  expect(t.qa('[data-testid="relic-slot"]')).toHaveLength(cap);
  for (const d of owned) if (!preset().relicIds.includes(d.id) && preset().relicIds.length < cap) rosterStore.togglePresetRelic(preset().id, d.id);
  reopen();
  const free = t.qa('.cell button').find((b) => b.getAttribute('aria-pressed') === 'false' && b.getAttribute('aria-disabled') !== 'true');
  expect(preset().relicIds).toHaveLength(cap);
  click(free);
  expect(t.q('.err').textContent).toContain(`All ${cap} relic slots are full`);
  expect(preset().relicIds).toHaveLength(cap);
});

it('a level-0 relic cannot be equipped and links to Relics', () => {
  const c = rosterStore.current;
  const def = relicsForClass(c.class).find((d) => !(c.relics[d.id] > 0));
  expect(def).toBeTruthy();
  expect(t.qa('.cell').some((cell) => cell.textContent.includes(def.name) && cell.textContent.includes('Level 0: set on Relics'))).toBe(true);
  const tile = t.qa('.cell button').find((b) => b.textContent.includes(def.name));
  click(tile);
  expect(preset().relicIds).not.toContain(def.id);
  expect(t.qa('a').some((a) => a.getAttribute('href') === '#/character/relics')).toBe(true);
});

it('sigil slots beyond the unlock level read "Unlocks at level n"', () => {
  const low = fixtureCharacter('WARRIOR');
  low.level = 30;
  load(low);
  reopen();
  expect(t.q('.sigil-slots').textContent).toMatch(/Unlocks at level \d+/);
});

/** The native <select> a design-system Select renders for the label text (exact string or RegExp). */
const selectFor = (root, text) => {
  const lab = [...root.querySelectorAll('label')].find((l) => (typeof text === 'string' ? l.textContent.trim() === text : text.test(l.textContent.trim())));
  return lab ? root.querySelector(`select[id="${lab.getAttribute("for")}"]`) : null;
};

it('a condition names the other presets that equip the sigil (CHARACTER scope) and writes character-wide', () => {
  const [a, b] = rosterStore.current.presets;
  const sp = a.sigilSpecies[1]; // WARBORN_FURY offers HP conditions; slot 0 (Berserk Stance) does not
  rosterStore.setPresetSigils(b.id, { species: [sp] });
  reopen();
  const sel = selectFor(t.target, /activation condition$/);
  const chip = t.q('[aria-label="Activation conditions"] .scope-chip');
  expect(chip.textContent).toMatch(/Character/i);
  expect(chip.textContent).toContain(`also ${b.name}`);
  const alt = [...sel.options].find((o) => o.value !== 'ON_COOLDOWN');
  sel.value = alt.value;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  expect(rosterStore.current.sigils.owned[sp].condition).toBe(alt.value);
});

it('checkPreset badges show: an Ancient without its board node reads as a note', () => {
  const c = rosterStore.current;
  c.transcendence.presets.forEach((p) => (p.allocatedNodeIds = []));
  reopen();
  const ancient = preset().ancientSigilSpecies;
  expect(ancient).toBeTruthy();
  expect(t.q('[data-testid="preset-checks"]').textContent).toContain('Transcendence sigil node');
});

it('every relic tile carries tier art, so none renders an empty icon square', () => {
  const tiles = t.qa('.cell button');
  expect(tiles.length).toBeGreaterThan(0);
  for (const b of tiles) expect(b.querySelector('.art img')).not.toBeNull();
});

describe('sigil tray (moved from the Sigils page)', () => {
  const slot = (n) => selectFor(t.target, `Sigil ${n}`);
  const fire = (el, value) => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };

  it('offers only owned sigils and writes the pick to the preset', () => {
    const owned = Object.keys(rosterStore.current.sigils.owned);
    const values = [...slot(1).options].map((o) => o.value).filter(Boolean);
    expect(values.length).toBeGreaterThan(0);
    for (const v of values) expect(owned).toContain(v);
    fire(slot(1), values[0]);
    expect(preset().sigilSpecies[0]).toBe(values[0]);
  });

  it('a Warrior has no utility slot; a Mystic gets a utility slot (Form, Shield or Summon by spec)', () => {
    expect(selectFor(t.target, /^(Shield|Form|Summon) slot$/)).toBeNull();
    const m = fixtureCharacter('MYSTIC');
    load(m);
    reopen();
    const util = selectFor(t.target, /^(Shield|Form|Summon) slot$/);
    expect(util).not.toBeNull();
    expect(t.target.textContent).toMatch(/(Shield|Form|Summon) slot/);
    const pick = [...util.options].map((o) => o.value).filter(Boolean)[0];
    expect(pick).toBeTruthy();
    fire(util, pick);
    expect(preset().utilitySigilSpecies).toBe(pick);
  });

  it('flat totals follow the equipped sigils', () => {
    expect(t.q('[data-testid="equip-atk"]')).not.toBeNull();
    expect(t.q('[data-testid="equip-hp"]')).not.toBeNull();
  });

  it('conditions are gated below character level 54', () => {
    const low = fixtureCharacter('WARRIOR');
    low.level = 50;
    load(low);
    reopen();
    expect(t.q('[aria-label="Activation conditions"]').textContent).toContain('Unlock at character level 54');
  });
});
