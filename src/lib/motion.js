// Motion helpers (design-system §2.13). Everything here is decoration over a DOM that is already in its
// end state: with reduced motion, or without the Web Animations API (jsdom), each helper does nothing.

/** May anything move? False under either reduced-motion switch and where elements cannot animate. */
export function motionOK() {
  if (typeof document === 'undefined' || typeof Element === 'undefined') return false;
  if (typeof Element.prototype.animate !== 'function') return false;
  if (document.documentElement.dataset.reduceMotion === 'true') return false;
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** A custom property off :root, as written in app.css (an easing, a colour). */
export function cssToken(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** A duration token in milliseconds. */
export function cssMs(name, fallback = 200) {
  const raw = cssToken(name);
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return raw.endsWith('ms') ? n : n * 1000;
}

// Where a selected child's marker sits. The marker is an absolutely positioned pseudo-element, so only the
// child that has it now can be measured; `from` is the same marker as it would sit in another child's box.
// Per axis the marker either spans the child (a thumb, an underline's length) and keeps its two insets, or
// is a fixed bar (an underline's thickness) pinned to its nearer edge.
function markerBoxes(now, from, pseudo) {
  const cs = getComputedStyle(now, pseudo);
  const [left, top, width, height] = [cs.left, cs.top, cs.width, cs.height].map(parseFloat);
  if (![left, top, width, height].every(Number.isFinite) || !width || !height) return null;
  const b = now.getBoundingClientRect();
  const a = from.getBoundingClientRect();
  if (!a.width || !a.height || !b.width || !b.height) return null;
  const axis = (start, size, nowStart, nowSize, fromStart, fromSize) => {
    const end = nowSize - start - size;
    if (size > nowSize / 2) return [fromStart + start, fromSize - start - end, nowStart + start];
    return [end < start ? fromStart + fromSize - end - size : fromStart + start, size, nowStart + start];
  };
  const [ax, aw, bx] = axis(left, width, b.left + now.clientLeft, b.width, a.left + from.clientLeft, a.width);
  const [ay, ah, by] = axis(top, height, b.top + now.clientTop, b.height, a.top + from.clientTop, a.height);
  if (aw <= 0 || ah <= 0) return null;
  return { dx: ax - bx, dy: ay - by, sx: aw / width, sy: ah / height };
}

/**
 * Action: the selection marker glides from the child that had it to the child that has it now.
 *   use:glide={{ on: value, selector: '[aria-selected="true"]', pseudo: '::after' }}
 * `on` is whatever changes with the selection; `selector` finds the selected child inside the node;
 * `pseudo` names the marker (one pseudo-element or a list). The marker stays plain CSS on the selected
 * child, so nothing is measured or kept between changes and a missed run costs nothing.
 */
export function glide(node, params) {
  let last = node.querySelector(params.selector);
  return {
    update(next) {
      const now = node.querySelector(next.selector);
      const from = last;
      last = now;
      if (!now || !from || from === now || !from.isConnected || !motionOK()) return;
      const options = { duration: cssMs('--dur-2'), easing: cssToken('--ease-out', 'ease-out') };
      for (const pseudo of [next.pseudo ?? '::after'].flat()) {
        const m = markerBoxes(now, from, pseudo);
        if (!m) continue;
        now.animate(
          [
            { transformOrigin: '0 0', transform: `translate(${m.dx}px, ${m.dy}px) scale(${m.sx}, ${m.sy})` },
            { transformOrigin: '0 0', transform: 'none' },
          ],
          { ...options, pseudoElement: pseudo },
        );
      }
    },
  };
}

/** How many panels take their own step in the page reveal; the rest arrive with the last. */
const REVEAL_STEPS = 7;

/**
 * Action on a page's wrapper: the page-load reveal (app.css `.page-enter.is-entering .panel`). Numbers the
 * panels in document order, then takes the class off once they have landed so later panels do not replay it.
 */
export function pageEnter(node) {
  if (!motionOK()) return {};
  let i = 0;
  for (const panel of node.querySelectorAll('.panel')) panel.style.setProperty('--enter-i', String(Math.min(i++, REVEAL_STEPS)));
  node.classList.add('is-entering');
  const total = cssMs('--dur-3') + REVEAL_STEPS * cssMs('--stagger', 30) + 60;
  const timer = setTimeout(() => node.classList.remove('is-entering'), total);
  return {
    destroy() {
      clearTimeout(timer);
    },
  };
}

/**
 * Svelte `out:` transition: the element fades and backs off the way it came, faster than it arrived.
 *   out:leave={{ x: 32 }}       a drawer returning to the right edge
 *   out:leave={{ scale: 0.96 }} a popover closing into its trigger (transform-origin is the element's own)
 * With motion off the duration is 0, which Svelte finishes at once without touching the animation API.
 */
export function leave(node, { x = 0, y = 0, scale = 1 } = {}) {
  if (!motionOK()) return { duration: 0 };
  return {
    duration: cssMs('--dur-1', 120),
    // cubic ease-out; `t` runs 1 -> 0, so `u` is how far gone the element is
    easing: (t) => 1 - (1 - t) ** 3,
    css: (t, u) => `opacity: ${t}; transform: translate(${x * u}px, ${y * u}px) scale(${1 - (1 - scale) * u});`,
  };
}

/**
 * Action on a positioned list (the toast stack): when a child arrives or goes, the others slide to their
 * new place instead of jumping there. Positions are layout positions (offsets inside the node's own box),
 * so a child that is still animating is measured where it will rest, and the slide is added on top of
 * whatever that child is already doing.
 */
export function settleChildren(node) {
  if (typeof MutationObserver === 'undefined') return {};
  let places = new Map();
  const measure = () => {
    const box = node.getBoundingClientRect();
    places = new Map([...node.children].map((c) => [c, { left: box.left + c.offsetLeft, top: box.top + c.offsetTop }]));
  };
  const observer = new MutationObserver(() => {
    const before = places;
    measure();
    if (!motionOK()) return;
    const options = { duration: cssMs('--dur-2'), easing: cssToken('--ease-out', 'ease-out'), composite: 'add' };
    for (const [child, to] of places) {
      const from = before.get(child);
      if (!from || (from.left === to.left && from.top === to.top)) continue;
      child.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` }, { transform: 'translate(0, 0)' }], options);
    }
  });
  measure();
  observer.observe(node, { childList: true });
  addEventListener('resize', measure);
  return {
    destroy() {
      observer.disconnect();
      removeEventListener('resize', measure);
    },
  };
}

/** One tint over an element's own colour, fading back (a figure that just changed). */
export function flashColor(el, color) {
  if (!el || !color || !motionOK()) return;
  el.animate([{ color }, {}], { duration: cssMs('--dur-flash', 900), easing: cssToken('--ease-out', 'ease-out') });
}
