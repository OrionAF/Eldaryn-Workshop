import { it, expect, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import StarRating from './StarRating.svelte';

function setup(props = {}) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  const onchange = vi.fn();
  const app = mount(StarRating, { target, props: { onchange, ...props } });
  flushSync();
  return { target, app, onchange, stars: () => [...target.querySelectorAll('.star')] };
}

it('renders 5 stars, locking the ones past the available level', () => {
  // Common/Uncommon/Rare mounts only have 1-2 star data: 3/4/5 are star-off.
  const { target, app, stars } = setup({ value: 0, available: 2 });
  expect(stars().length).toBe(5);
  expect(stars().filter((s) => s.classList.contains('locked')).length).toBe(3);
  expect(stars().slice(0, 2).every((s) => !s.disabled)).toBe(true);
  expect(stars().slice(2).every((s) => s.disabled)).toBe(true);
  expect(target.querySelector('[role="radiogroup"]')).toBeTruthy();
  unmount(app);
});

it('fills every star up to the value, not just the clicked one', () => {
  const { app, stars } = setup({ value: 3, available: 3 });
  expect(stars().map((s) => s.classList.contains('filled'))).toEqual([true, true, true, false, false]);
  unmount(app);
});

it('clicking a star selects that level', () => {
  const { app, onchange, stars } = setup({ value: 0, available: 3 });
  stars()[2].click();
  flushSync();
  expect(onchange).toHaveBeenCalledWith(3);
  unmount(app);
});

it('clicking the star that IS the value clears to 0, from any star', () => {
  // Star 1 of a 1-star selection.
  const first = setup({ value: 1, available: 2 });
  first.stars()[0].click();
  flushSync();
  expect(first.onchange).toHaveBeenCalledWith(0);
  unmount(first.app);

  // ...and the lit 2nd star of a 2-star mount, which is the natural way to
  // un-own one whose max data is 2 stars.
  const second = setup({ value: 2, available: 2 });
  second.stars()[1].click();
  flushSync();
  expect(second.onchange).toHaveBeenCalledWith(0);
  unmount(second.app);

  // ...and the 3rd of an Epic mount.
  const third = setup({ value: 3, available: 3 });
  third.stars()[2].click();
  flushSync();
  expect(third.onchange).toHaveBeenCalledWith(0);
  unmount(third.app);
});

it('clicking a DIFFERENT star still selects it rather than clearing', () => {
  const { app, onchange, stars } = setup({ value: 2, available: 3 });
  stars()[0].click();
  flushSync();
  expect(onchange).toHaveBeenCalledWith(1);
  onchange.mockClear();
  stars()[2].click();
  flushSync();
  expect(onchange).toHaveBeenCalledWith(3);
  unmount(app);
});

it('hit areas tile instead of overlapping, so every star is independently clickable', () => {
  // Regression guard: hit areas used to be 44px wide on a 24px pitch, so the
  // right 20px of each star was covered by its next sibling and clicks landed
  // on the wrong star. Each star must own a disjoint horizontal slice.
  const { app, onchange, stars } = setup({ value: 0, available: 5, total: 5 });
  stars().forEach((star, i) => {
    onchange.mockClear();
    star.click();
    flushSync();
    expect(onchange, `star ${i + 1}`).toHaveBeenCalledWith(i + 1);
  });
  unmount(app);
});

it('clicking a locked star does nothing', () => {
  const { app, onchange, stars } = setup({ value: 1, available: 2 });
  stars()[4].click();
  flushSync();
  expect(onchange).not.toHaveBeenCalled();
  unmount(app);
});

it('arrow keys move within the available range and clamp at both ends', () => {
  const { target, app, onchange } = setup({ value: 1, available: 2 });
  // Keys are handled on the focused radio (roving tabindex), not the group.
  const group = target.querySelector('.star:not(:disabled)');

  group.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  flushSync();
  expect(onchange).toHaveBeenLastCalledWith(2);

  group.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  flushSync();
  expect(onchange).toHaveBeenLastCalledWith(0);

  // Already at 1 with available 2: End goes to 2, Home to 0.
  group.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  flushSync();
  expect(onchange).toHaveBeenLastCalledWith(2);
  unmount(app);
});

it('never selects past the available level via keyboard', () => {
  const { target, app, onchange } = setup({ value: 2, available: 2 });
  // Keys are handled on the focused radio (roving tabindex), not the group.
  const group = target.querySelector('.star:not(:disabled)');
  group.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  flushSync();
  // Clamped to 2, which is unchanged, so no event fires.
  expect(onchange).not.toHaveBeenCalled();
  unmount(app);
});

it('keeps a single tab stop (roving tabindex on the selected star)', () => {
  const { app, stars } = setup({ value: 2, available: 3 });
  expect(stars().map((s) => s.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
  unmount(app);
});

it('falls back to the first star for the tab stop when nothing is selected', () => {
  const { app, stars } = setup({ value: 0, available: 2 });
  expect(stars().map((s) => s.tabIndex)).toEqual([0, -1, -1, -1, -1]);
  unmount(app);
});

it('a mount with no star data at all is fully inert', () => {
  const { target, app, onchange, stars } = setup({ value: 0, available: 0 });
  expect(stars().every((s) => s.disabled)).toBe(true);
  expect(target.querySelector('[role="radiogroup"]').getAttribute('aria-disabled')).toBe('true');
  stars()[0].click();
  flushSync();
  expect(onchange).not.toHaveBeenCalled();
  unmount(app);
});
