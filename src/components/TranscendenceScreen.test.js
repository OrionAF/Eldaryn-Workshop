import { it, expect, beforeEach, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TranscendenceScreen from './TranscendenceScreen.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;
beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, null);
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(TranscendenceScreen, { target });
  flushSync();
});

function cleanup() {
  unmount(app);
  target.remove();
}

/** jsdom has no matchMedia - stub it as always matching the mobile breakpoint, then remount fresh. */
function remountAsMobile() {
  unmount(app);
  target.remove();
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  });
  target = document.createElement('div');
  document.body.appendChild(target);
  app = mount(TranscendenceScreen, { target });
  flushSync();
}

afterEach(() => {
  delete window.matchMedia;
});

it('shows an onboarding hint with no class chosen', () => {
  expect(target.querySelector('.empty-hint')).not.toBeNull();
  expect(target.textContent).toContain('Choose a class');
  cleanup();
});

it('renders the grid for Warrior now that its tree data exists', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  flushSync();
  expect(target.querySelector('.empty-hint')).toBeNull();
  expect(target.querySelector('.viewport')).not.toBeNull();
  expect(target.textContent).toContain('Nodes placed:');
  cleanup();
});

it('renders the grid and header readout for a class with tree data (Sentinel), starting with nothing unlocked', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  expect(target.querySelector('.empty-hint')).toBeNull();
  expect(target.querySelector('.viewport')).not.toBeNull();
  expect(target.textContent).toContain('Nodes placed:');
  expect(target.querySelector('.header-bar').textContent).toContain('0'); // nothing unlocked by default
  cleanup();
});

it('the start position is selectable/unlockable like any other node - not unlocked by default', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  const start = target.querySelector('[aria-label="common node at 14:25"]');
  expect(start.classList.contains('unlocked')).toBe(false);
  expect(start.classList.contains('unlockable')).toBe(true);

  // Nothing else is reachable until the start itself is unlocked.
  const neighbor = target.querySelector('[aria-label="common node at 14:24"]');
  expect(neighbor.classList.contains('unlockable')).toBe(false);

  start.click();
  flushSync();
  expect(start.classList.contains('unlocked')).toBe(true);
  expect(target.querySelector('.header-bar').textContent).toContain('1');
  expect(neighbor.classList.contains('unlockable')).toBe(true); // now reachable

  start.click();
  flushSync();
  expect(start.classList.contains('unlocked')).toBe(false);
  expect(target.querySelector('.header-bar').textContent).toContain('0');
  cleanup();
});

it('clicking an adjacency-valid node unlocks it, updates the header readout, and clicking again removes it', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  target.querySelector('[aria-label="common node at 14:25"]').click(); // unlock the start first
  flushSync();

  const node = target.querySelector('[aria-label="common node at 14:24"]'); // the start's one real neighbor
  expect(node.classList.contains('unlockable')).toBe(true);

  node.click();
  flushSync();
  expect(node.classList.contains('unlocked')).toBe(true);
  expect(target.querySelector('.header-bar').textContent).toContain('2');

  node.click();
  flushSync();
  expect(node.classList.contains('unlocked')).toBe(false);
  expect(target.querySelector('.header-bar').textContent).toContain('1');
  cleanup();
});

it('hovering a node shows a tooltip with its rarity and stat(s)', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  const node = target.querySelector('[aria-label="common node at 14:24"]');
  // jsdom has no PointerEvent - MouseEvent carries the clientX/clientY the handler reads.
  node.dispatchEvent(new MouseEvent('pointerenter', { clientX: 100, clientY: 100, bubbles: true }));
  flushSync();

  const tooltip = target.querySelector('.tooltip');
  expect(tooltip).not.toBeNull();
  expect(tooltip.textContent).toContain('Common');
  expect(tooltip.textContent).toContain('Attack %');

  node.dispatchEvent(new MouseEvent('pointerleave', { bubbles: true }));
  flushSync();
  expect(target.querySelector('.tooltip')).toBeNull();
  cleanup();
});

it('on mobile, tapping a node opens a drawer instead of toggling it directly', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  remountAsMobile();

  const node = target.querySelector('[aria-label="common node at 14:24"]');
  node.click();
  flushSync();

  expect(node.classList.contains('unlocked')).toBe(false); // tapping alone doesn't toggle
  const drawer = target.querySelector('.drawer');
  expect(drawer).not.toBeNull();
  expect(drawer.textContent).toContain('Common');
  expect(drawer.textContent).toContain('Attack %');
  expect(target.querySelector('.tooltip')).toBeNull(); // no hover tooltip on mobile
  cleanup();
});

it('the drawer\'s Allocate/Remove button toggles the node and stays open, flipping label', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  remountAsMobile();

  const node = target.querySelector('[aria-label="common node at 14:25"]'); // the start - immediately unlockable
  node.click();
  flushSync();

  const allocateButton = target.querySelector('.allocate-button');
  expect(allocateButton.textContent.trim()).toBe('Allocate');
  allocateButton.click();
  flushSync();

  expect(node.classList.contains('unlocked')).toBe(true);
  expect(target.querySelector('.drawer')).not.toBeNull(); // still open
  expect(target.querySelector('.allocate-button').textContent.trim()).toBe('Remove');
  cleanup();
});

it('tapping the backdrop closes the drawer without toggling anything', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  remountAsMobile();

  const node = target.querySelector('[aria-label="common node at 14:24"]');
  node.click();
  flushSync();
  expect(target.querySelector('.drawer')).not.toBeNull();

  target.querySelector('.backdrop').click();
  flushSync();
  expect(target.querySelector('.drawer')).toBeNull();
  expect(node.classList.contains('unlocked')).toBe(false); // untouched
  cleanup();
});

it("the drawer's button is disabled for a non-adjacency-valid locked node", () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();
  remountAsMobile();

  const farNode = target.querySelector('[aria-label="common node at 20:3"]'); // far from the start, not unlockable
  farNode.click();
  flushSync();
  expect(target.querySelector('.allocate-button').disabled).toBe(true);
  cleanup();
});

it('Node Filter highlights nodes carrying a selected stat, including uncommon nodes matching on either stat', () => {
  rosterStore.setCharacterClass(rosterStore.current.id, 'Sentinel');
  flushSync();

  const chips = [...target.querySelectorAll('.filter-chip')];
  expect(chips.length).toBeGreaterThan(0);
  const critMultChip = chips.find((c) => c.textContent.trim() === 'Crit Mult %');
  critMultChip.click();
  flushSync();
  expect(critMultChip.classList.contains('active')).toBe(true);

  // 21:4 is an uncommon node with attack_pct + crit_mult - matches on its second stat.
  const uncommon = target.querySelector('[aria-label="uncommon node at 21:4"]');
  expect(uncommon.classList.contains('highlighted')).toBe(true);
  // 7:4 is an uncommon node with neither stat selected - not highlighted.
  const other = target.querySelector('[aria-label="uncommon node at 7:4"]');
  expect(other.classList.contains('highlighted')).toBe(false);

  // Multi-select: adding a second stat highlights its nodes too, keeping the first.
  const blindChip = chips.find((c) => c.textContent.trim() === 'Blind Chance %');
  blindChip.click();
  flushSync();
  expect(uncommon.classList.contains('highlighted')).toBe(true);
  expect(other.classList.contains('highlighted')).toBe(true);

  // Clear removes every highlight.
  target.querySelector('.filter-clear').click();
  flushSync();
  expect(target.querySelector('.tnode.highlighted')).toBeNull();
  cleanup();
});
