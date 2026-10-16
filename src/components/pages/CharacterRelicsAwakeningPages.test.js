import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RelicsScreen from './CharacterRelicsPage.svelte';
import AwakeningScreen from './CharacterAwakeningPage.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { relicsForClass } from '../../lib/game/relics.js';

let target, app;
function render(Comp) {
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(Comp, { target, props: { setStatus() {}, onNavigate() {} } });
  flushSync();
}
function seed(cls = 'WARRIOR') {
  const id = rosterStore.addCharacter('Test', cls);
  if (id && rosterStore.switchCharacter) rosterStore.switchCharacter(id);
}
beforeEach(() => {
  localStorage.clear();
  seed();
});
afterEach(() => {
  if (app) unmount(app);
  app = null;
  target?.remove();
});

describe('Relics store + screen', () => {
  it('shows only the class relics and steps levels', () => {
    render(RelicsScreen);
    const war = relicsForClass('WARRIOR');
    expect(target.querySelectorAll('[data-relic]').length).toBe(war.length);
    target.querySelector(`[data-relic="${war[0].id}"] button[aria-label^="Increase"]`).click();
    flushSync();
    expect(rosterStore.current.relics[war[0].id]).toBe(1);
  });
  it('caps equip at 4 per preset and drops them on class change', () => {
    const war = relicsForClass('WARRIOR');
    const pid = rosterStore.current.presets[0].id;
    for (const r of war.slice(0, 5)) rosterStore.setRelicLevel(r.id, 1); // only owned relics can be equipped
    for (const r of war.slice(0, 5)) rosterStore.togglePresetRelic(pid, r.id);
    expect(rosterStore.current.presets[0].relicIds).toHaveLength(4);
    rosterStore.setCharacterClass(rosterStore.current.id, 'MYSTIC');
    expect(rosterStore.current.presets[0].relicIds).toEqual([]);
    expect(rosterStore.current.relics).toEqual({});
  });
  it('ignores relics of another class', () => {
    rosterStore.setRelicLevel(relicsForClass('MYSTIC')[0].id, 3);
    expect(rosterStore.current.relics).toEqual({});
  });
});

describe('Awakening store + screen', () => {
  it('sets path, clamps level, resets', () => {
    rosterStore.setAwakeningPath('SHADOW');
    rosterStore.setAwakeningLevel(40);
    expect(rosterStore.current.awakening).toEqual({ path: 'SHADOW', level: 15 });
    rosterStore.setAwakeningPath('RADIANT');
    expect(rosterStore.current.awakening).toEqual({ path: 'RADIANT', level: 0 });
    rosterStore.setAwakeningLevel(3);
    rosterStore.resetAwakening();
    expect(rosterStore.current.awakening).toEqual({ path: null, level: 0 });
  });
  it('displays the override source', () => {
    rosterStore.setCharacterClass(rosterStore.current.id, 'NECROMANCER');
    rosterStore.setAwakeningPath('SHADOW');
    rosterStore.setAwakeningLevel(2);
    render(AwakeningScreen);
    expect(target.querySelector('[data-testid="override-source"]').textContent).toContain('Bonuses set by your class');
  });
});

const field = (label) => {
  const l = [...target.querySelectorAll('label')].find((el) => el.textContent.trim().startsWith(label));
  return l ? document.getElementById(l.htmlFor) : null;
};
const setField = (el, v) => {
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('blur'));
  flushSync();
};

describe('Relics page: slots and Equipped in', () => {
  it('Relic slots sets extraRelicSlots and the equip cap follows it', () => {
    const war = relicsForClass('WARRIOR');
    for (const r of war.slice(0, 3)) rosterStore.setRelicLevel(r.id, 1);
    render(RelicsScreen);
    const sel = field('Relic slots');
    expect(sel.value).toBe('4');
    sel.value = '2';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(rosterStore.current.extraRelicSlots).toBe(0);
    const pid = rosterStore.current.presets[0].id;
    for (const r of war.slice(0, 3)) rosterStore.togglePresetRelic(pid, r.id);
    expect(rosterStore.current.presets[0].relicIds).toHaveLength(2);
    flushSync();
    expect(target.textContent).toContain('2/2');
  });

  it('lowering the slots asks first and names the relics every preset would lose', () => {
    const war = relicsForClass('WARRIOR');
    for (const r of war.slice(0, 3)) rosterStore.setRelicLevel(r.id, 1);
    const [p0] = rosterStore.current.presets;
    for (const r of war.slice(0, 3)) rosterStore.togglePresetRelic(p0.id, r.id);
    render(RelicsScreen);
    const lower = () => {
      field('Relic slots').value = '2';
      field('Relic slots').dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
    };
    lower();
    const dialog = document.querySelector('dialog[open]');
    expect(dialog.textContent).toContain(p0.name);
    expect(dialog.textContent).toContain(war[2].name);
    expect(rosterStore.current.extraRelicSlots).toBe(2); // nothing written yet
    expect(rosterStore.current.presets[0].relicIds).toHaveLength(3);
    [...dialog.querySelectorAll('button')].find((b) => b.textContent.startsWith('Keep')).click();
    flushSync();
    expect(rosterStore.current.presets[0].relicIds).toHaveLength(3);
    expect(field('Relic slots').value).toBe('4');
    lower();
    [...document.querySelector('dialog[open]').querySelectorAll('button')].find((b) => b.textContent.startsWith('Lower slots')).click();
    flushSync();
    expect(rosterStore.current.extraRelicSlots).toBe(0);
    expect(rosterStore.current.presets[0].relicIds).toEqual([war[0].id, war[1].id]);
  });

  it('each relic row shows its tier icon', () => {
    render(RelicsScreen);
    expect(target.querySelector('[data-relic] .relic-icon')).not.toBeNull();
  });

  it('Equipped in lists every preset by name, ticks the equipping ones, and disables the full ones', () => {
    const war = relicsForClass('WARRIOR');
    rosterStore.setExtraRelicSlots(0);
    for (const r of war.slice(0, 3)) rosterStore.setRelicLevel(r.id, 1);
    const [p0, p1] = rosterStore.current.presets;
    rosterStore.togglePresetRelic(p0.id, war[0].id);
    rosterStore.togglePresetRelic(p0.id, war[1].id);
    render(RelicsScreen);
    target.querySelector(`[data-relic="${war[2].id}"] button[aria-haspopup="menu"]`).click();
    flushSync();
    const items = [...target.querySelectorAll('[role^="menuitem"]')];
    expect(items.map((i) => i.textContent)).toEqual(expect.arrayContaining([expect.stringContaining(p0.name), expect.stringContaining(p1.name)]));
    const full = items.find((i) => i.textContent.includes(p0.name));
    expect(full.getAttribute('aria-disabled')).toBe('true');
    items.find((i) => i.textContent.includes(p1.name)).click();
    flushSync();
    expect(rosterStore.current.presets[1].relicIds).toEqual([war[2].id]);
  });

  it('unowned relics cannot be equipped from the menu', () => {
    render(RelicsScreen);
    const war = relicsForClass('WARRIOR');
    target.querySelector(`[data-relic="${war[0].id}"] button[aria-haspopup="menu"]`).click();
    flushSync();
    expect([...target.querySelectorAll('[role^="menuitem"]')].every((i) => i.getAttribute('aria-disabled') === 'true')).toBe(true);
  });
});

describe('Awakening page: cap by level', () => {
  it('the points field stops at what the level allows, and Max goes there', () => {
    rosterStore.setCharacterLevel(50);
    rosterStore.setAwakeningPath('SHADOW');
    render(AwakeningScreen);
    // The cap is written beside the field once: the old "0 / 6 points" readout drew the value a second time.
    expect(target.querySelector('[data-testid="points-cap"]').textContent).toBe('/ 6 points');
    expect(target.textContent).not.toContain('0 / 6');
    const input = field('Awakening points');
    setField(input, '9');
    expect(rosterStore.current.awakening.level).toBe(0);
    expect(target.querySelector('[role="alert"]').textContent).toContain('maximum');
    setField(input, '4');
    expect(rosterStore.current.awakening.level).toBe(4);
    rosterStore.resetAwakening();
    rosterStore.setAwakeningPath('RADIANT');
    flushSync();
    [...target.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Max').click();
    flushSync();
    expect(rosterStore.current.awakening.level).toBe(6);
  });

  it('below level 45 there are no points to spend and it says why', () => {
    rosterStore.setCharacterLevel(30);
    rosterStore.setAwakeningPath('SHADOW');
    render(AwakeningScreen);
    expect(target.textContent).toContain('level 45');
  });

  it('compares the other path next to the chosen one', () => {
    rosterStore.setAwakeningPath('SHADOW');
    rosterStore.setAwakeningLevel(3);
    render(AwakeningScreen);
    expect(target.querySelector('[data-testid="other-path"]').textContent).toMatch(/Radiant/i);
  });
});
