import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import RelicsScreen from './RelicsScreen.svelte';
import AwakeningScreen from './AwakeningScreen.svelte';
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
    target.querySelector(`[data-relic="${war[0].id}"] button[aria-label^="Raise"]`).click();
    flushSync();
    expect(rosterStore.current.relics[war[0].id]).toBe(1);
  });
  it('caps equip at 4 per preset and drops them on class change', () => {
    const war = relicsForClass('WARRIOR');
    const pid = rosterStore.current.presets[0].id;
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
    expect(target.querySelector('[data-testid="override-source"]').textContent).toContain('Class override');
  });
});
