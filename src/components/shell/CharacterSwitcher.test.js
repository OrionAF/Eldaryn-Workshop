import { it, expect } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import CharacterSwitcher from './CharacterSwitcher.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';

it('the "No class" warning in the hidden edit dialog clears once the character has a class', () => {
  localStorage.clear();
  const id = rosterStore.addCharacter('Aria', 'WARRIOR');
  rosterStore.setCharacterClass(id, null);
  const target = document.createElement('div');
  document.body.appendChild(target);
  const app = mount(CharacterSwitcher, { target });
  flushSync();
  target.querySelector('button.current').click();
  flushSync();
  const edit = [...document.querySelectorAll('button, li, [role^="menuitem"]')].find((b) => b.textContent.trim() === 'Edit character');
  edit.click();
  flushSync();
  expect(document.body.textContent).toContain('Most pages need a class');
  // The class is chosen elsewhere (Overview); the dialog stays mounted and hidden.
  rosterStore.setCharacterClass(id, 'WARRIOR');
  flushSync();
  expect(document.body.textContent).not.toContain('Most pages need a class');
  unmount(app);
  target.remove();
});
