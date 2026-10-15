import { it, expect, beforeEach, afterEach, describe } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SigilsScreen from './CharacterSigilsPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { ownableSigils } from '../../lib/model/sigils.js';
import { sigilImage } from '../../lib/assets.js';

let target, app;

function resetSigils() {
  const c = rosterStore.current;
  if (c.class !== 'WARRIOR') rosterStore.setCharacterClass(c.id, 'WARRIOR');
  rosterStore.setCharacterLevel(100);
  for (const sp of Object.keys(rosterStore.current.sigils.owned)) rosterStore.setSigilLevel(sp, 0);
  rosterStore.setSigilAltarTier(1);
}

beforeEach(() => {
  localStorage.clear();
  resetSigils();
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(SigilsScreen, { target, props: { setStatus() {}, onNavigate() {} } });
  flushSync();
});

afterEach(() => {
  unmount(app);
  target.remove();
  resetSigils();
});

const card = (name) => [...target.querySelectorAll('.sigil-card')].find((c) => c.querySelector('.rarity-title').textContent === name);
const preset = () => rosterStore.current.presets[0];
const own = (species, level) => {
  rosterStore.setSigilLevel(species, level);
  flushSync();
};

describe('collection', () => {
  it('lists every sigil the class can own, grouped Common first and Ancient last', () => {
    expect(target.querySelectorAll('.sigil-card').length).toBe(ownableSigils('WARRIOR').length);
    const headings = [...target.querySelectorAll('.rarity-section .subheading')].map((h) => h.textContent);
    expect(headings).toEqual(['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Ancient']);
  });

  it('every Warrior and Sentinel sigil has art', () => {
    const missing = ['WARRIOR', 'SENTINEL'].flatMap((c) => ownableSigils(c).filter((d) => !sigilImage(d.class, d.id)).map((d) => d.species));
    expect(missing).toEqual([]);
  });

  it('typing a level owns the sigil and shows its derived flat stats (Common Health L5 = 1819)', () => {
    const c = card('Defense Stance');
    const input = c.querySelector('input.level-input');
    input.value = '5';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(rosterStore.current.sigils.owned.DEFENSE_STANCE).toEqual({ level: 5 });
    // sigils.md §4: 1300 * 1.4 floors to 1819 in IEEE doubles; tier 2 triples it (5459)
    expect(card('Defense Stance').querySelector('[data-testid="hp"]').textContent).toBe('1.819');
    rosterStore.setSigilAltarTier(2);
    flushSync();
    expect(card('Defense Stance').querySelector('[data-testid="hp"]').textContent).toBe('5.459');
  });

  it('the stepper goes down to not owned, which unequips the sigil', () => {
    own('CATACLYSM', 1);
    rosterStore.setPresetSigils(preset().id, { species: ['CATACLYSM'] });
    flushSync();
    expect(preset().sigilSpecies).toEqual(['CATACLYSM']);
    card('Cataclysm').querySelector('button[aria-label="Cataclysm level down"]').click();
    flushSync();
    expect(rosterStore.current.sigils.owned.CATACLYSM).toBeUndefined();
    expect(preset().sigilSpecies).toEqual([]);
  });

  it('Ancients are a toggle and stay level 1', () => {
    const box = card('Earthwarden').querySelector('input[type="checkbox"]');
    box.click();
    flushSync();
    expect(rosterStore.current.sigils.owned.EARTHWARDEN).toEqual({ level: 1 });
    expect(card('Earthwarden').querySelector('input.level-input')).toBeNull();
  });
});

describe('altar', () => {
  it('the tier stepper edits the tier without touching the collection', () => {
    own('CATACLYSM', 4);
    target.querySelector('button[aria-label="Increase altar tier"]').click();
    flushSync();
    expect(rosterStore.current.sigils.altarTier).toBe(2);
    expect(rosterStore.current.sigils.owned.CATACLYSM).toEqual({ level: 4 });
  });

  it('Evolve lists what it destroys, keeps Ancients and only runs after the confirm', () => {
    own('CATACLYSM', 4);
    own('FLAMEBORN', 1);
    const evolve = [...target.querySelectorAll('button')].find((b) => b.textContent === 'Evolve Altar');
    evolve.click();
    flushSync();
    expect(rosterStore.current.sigils.altarTier).toBe(1); // not yet: needs the confirm
    const dialog = target.querySelector('dialog[open]');
    expect(dialog.querySelector('[data-testid="evolve-destroyed"]').textContent).toBe('Cataclysm');
    [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Evolve to tier 2').click();
    flushSync();
    expect(rosterStore.current.sigils.altarTier).toBe(2);
    expect(Object.keys(rosterStore.current.sigils.owned)).toEqual(['FLAMEBORN']);
  });

  it('Evolve names the presets that lose an equipped sigil', () => {
    own('CATACLYSM', 4);
    rosterStore.setPresetSigils(preset().id, { species: ['CATACLYSM'] });
    flushSync();
    [...target.querySelectorAll('button')].find((b) => b.textContent === 'Evolve Altar').click();
    flushSync();
    const text = target.querySelector('dialog[open]').textContent;
    expect(text).toContain('Presets that lose equips');
    expect(text).toContain(preset().name);
  });

  it('a tier above the evolve cap carries a warning and no Evolve button', () => {
    expect(target.querySelector('.banner, [role="status"].banner')).toBeNull();
    rosterStore.setSigilAltarTier(5);
    flushSync();
    expect(target.textContent).toContain('cannot be reached by evolving');
    expect([...target.querySelectorAll('button')].some((b) => b.textContent === 'Evolve Altar')).toBe(false);
  });
});

describe('equip panel', () => {
  const slot = (n) => target.querySelector(`select[aria-label="Sigil slot ${n}"]`);

  it('offers only owned sigils and writes the pick to the preset', () => {
    own('CATACLYSM', 3);
    own('HAWK_FOCUS', 3); // Sentinel-only: never offered, not even ownable
    const values = [...slot(1).options].map((o) => o.value);
    expect(values).toEqual(['', 'CATACLYSM']);
    slot(1).value = 'CATACLYSM';
    slot(1).dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(preset().sigilSpecies).toEqual(['CATACLYSM']);
    expect(card('Cataclysm').textContent).toContain(`Equipped in: ${preset().name}`);
  });

  it('locks slots the character level has not unlocked, and shows the unlock level', () => {
    rosterStore.setCharacterLevel(28);
    flushSync();
    expect(slot(2)).not.toBeNull();
    expect(slot(3)).toBeNull();
    expect(target.textContent).toContain('Unlocks at level 32');
  });

  it('a Warrior has no utility slot; the Ancient slot lists unlocked Ancients', () => {
    expect(target.querySelector('select[aria-label="Utility sigil slot"]')).toBeNull();
    own('EARTHWARDEN', 1);
    const a = target.querySelector('select[aria-label="Ancient sigil slot"]');
    expect([...a.options].map((o) => o.value)).toEqual(['', 'EARTHWARDEN']);
    a.value = 'EARTHWARDEN';
    a.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(preset().ancientSigilSpecies).toBe('EARTHWARDEN');
  });

  it('the flat total sums the equipped sigils at the altar tier', () => {
    own('DEFENSE_STANCE', 5); // Common: Attack 166 * 1.4 -> 232, Health 1819
    rosterStore.setPresetSigils(preset().id, { species: ['DEFENSE_STANCE'] });
    flushSync();
    expect(target.querySelector('[data-testid="equip-hp"]').textContent).toBe('1.819');
  });

  it('conditions need character level 54, then offer the spell family\'s options', () => {
    own('CATACLYSM', 3);
    rosterStore.setPresetSigils(preset().id, { species: ['CATACLYSM'] });
    rosterStore.setCharacterLevel(50);
    flushSync();
    expect(target.querySelector('select[aria-label="Cataclysm activation condition"]')).toBeNull();
    expect(target.textContent).toContain('Unlock at character level 54');
    rosterStore.setCharacterLevel(54);
    flushSync();
    const sel = target.querySelector('select[aria-label="Cataclysm activation condition"]');
    expect([...sel.options].map((o) => o.value)).toEqual(['ON_COOLDOWN', 'ENEMY_HP_BELOW_80', 'ENEMY_HP_BELOW_60', 'ENEMY_HP_BELOW_40', 'ENEMY_HP_BELOW_20']);
    sel.value = 'ENEMY_HP_BELOW_40';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(rosterStore.current.sigils.owned.CATACLYSM.condition).toBe('ENEMY_HP_BELOW_40');
    sel.value = 'ON_COOLDOWN';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(rosterStore.current.sigils.owned.CATACLYSM.condition).toBeUndefined();
  });
});

describe('other classes', () => {
  it('Mystic gets a Shield utility slot and its own catalogue; switching class clears Warrior sigils', () => {
    own('CATACLYSM', 3);
    rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
    flushSync();
    expect(rosterStore.current.sigils.owned).toEqual({});
    expect(target.querySelectorAll('.sigil-card').length).toBe(ownableSigils('MYSTIC').length);
    own('ARCANE_BARRIER', 2);
    const util = target.querySelector('select[aria-label="Utility sigil slot"]');
    expect(util).not.toBeNull();
    expect(target.textContent).toContain('Shield slot');
    expect([...util.options].map((o) => o.value)).toEqual(['', 'ARCANE_BARRIER']);
    util.value = 'ARCANE_BARRIER';
    util.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(preset().utilitySigilSpecies).toBe('ARCANE_BARRIER');
    // the Shield sigil is utility-only: not offered in a generic slot
    expect([...target.querySelector('select[aria-label="Sigil slot 1"]').options].map((o) => o.value)).toEqual(['']);
  });

  it('Form sigils are level-locked: an owned toggle, no level field, stored at level 1', () => {
    rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
    flushSync();
    const c = card('Ursine Form');
    expect(c).toBeTruthy();
    expect(c.querySelector('input.level-input')).toBeNull();
    c.querySelector('input[type="checkbox"]').click();
    flushSync();
    expect(rosterStore.current.sigils.owned.URSINE_FORM).toEqual({ level: 1 });
    expect(card('Ursine Form').textContent).toContain('fixed at level 1');
  });
});

describe('Equip in menu', () => {
  const openMenu = (name) => {
    const btn = card(name).querySelector('.equip-btn');
    if (btn.getAttribute('aria-expanded') !== 'true') btn.click();
    flushSync();
    return [...card(name).querySelectorAll('[role^="menuitem"]')];
  };

  it('names every preset, disables an unowned sigil with the reason, and equips on select', () => {
    expect(card('Cataclysm').textContent).toContain('Unequipped');
    expect(openMenu('Cataclysm').every((i) => i.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(card('Cataclysm').textContent).toContain('not owned');
    own('CATACLYSM', 3);
    const items = openMenu('Cataclysm');
    expect(items.map((i) => i.textContent)).toEqual(expect.arrayContaining([expect.stringContaining(preset().name)]));
    items[0].click();
    flushSync();
    expect(preset().sigilSpecies).toEqual(['CATACLYSM']);
    expect(card('Cataclysm').textContent).toContain(`Equipped in: ${preset().name}`);
  });

  it('unequips from the checked entry and refuses past the unlocked slots', () => {
    own('CATACLYSM', 3);
    rosterStore.setCharacterLevel(25); // one generic slot
    flushSync();
    rosterStore.setPresetSigils(preset().id, { species: ['CATACLYSM'] });
    own('DEFENSE_STANCE', 1);
    const full = openMenu('Defense Stance')[0];
    expect(full.getAttribute('aria-disabled')).toBe('true');
    expect(full.textContent).toContain('no free slot');
    const checked = openMenu('Cataclysm')[0];
    expect(checked.getAttribute('aria-checked')).toBe('true');
    checked.click();
    flushSync();
    expect(preset().sigilSpecies).toEqual([]);
  });
});
