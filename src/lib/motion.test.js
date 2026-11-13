import { describe, it, expect, afterEach, vi } from 'vitest';
import { motionOK, cssMs, glide, pageEnter, leave, settleChildren } from './motion.js';

// jsdom has no Web Animations API, so motion is off unless a test switches it on.
function enableMotion() {
  const animate = vi.fn();
  Element.prototype.animate = animate;
  return animate;
}

afterEach(() => {
  delete Element.prototype.animate;
  delete document.documentElement.dataset.reduceMotion;
  document.documentElement.style.cssText = '';
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('motionOK', () => {
  it('is off where elements cannot animate', () => {
    expect(motionOK()).toBe(false);
  });

  it('is on with the animation API, and off again under either reduced-motion switch', () => {
    enableMotion();
    expect(motionOK()).toBe(true);
    document.documentElement.dataset.reduceMotion = 'true';
    expect(motionOK()).toBe(false);
    delete document.documentElement.dataset.reduceMotion;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    expect(motionOK()).toBe(false);
  });
});

describe('cssMs', () => {
  it('reads a duration token in milliseconds or seconds, else the fallback', () => {
    document.documentElement.style.setProperty('--dur-a', '200ms');
    document.documentElement.style.setProperty('--dur-b', '0.32s');
    expect(cssMs('--dur-a')).toBe(200);
    expect(cssMs('--dur-b')).toBe(320);
    expect(cssMs('--dur-missing', 75)).toBe(75);
  });
});

describe('glide', () => {
  function strip() {
    document.body.innerHTML = '<div id="s"><button data-on="1">A</button><button>B</button></div>';
    const node = document.getElementById('s');
    const [a, b] = node.querySelectorAll('button');
    a.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 36 });
    b.getBoundingClientRect = () => ({ left: 100, top: 0, width: 60, height: 36 });
    const move = () => {
      delete a.dataset.on;
      b.dataset.on = '1';
    };
    return { node, a, b, move };
  }
  const params = { on: 0, selector: '[data-on]', pseudo: '::after' };

  it('does nothing when motion is off', () => {
    const { node, move } = strip();
    const action = glide(node, params);
    move();
    expect(() => action.update({ ...params, on: 1 })).not.toThrow();
  });

  it("animates the new child's marker from the old child's box", () => {
    const animate = enableMotion();
    // the marker: an underline inset 8px each side, 3px thick on the bottom edge
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
      pseudo ? { left: '8px', top: '33px', width: '44px', height: '3px' } : { getPropertyValue: () => '' },
    );
    const { node, b, move } = strip();
    const action = glide(node, params);
    move();
    action.update({ ...params, on: 1 });
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.contexts[0]).toBe(b);
    const [frames, options] = animate.mock.calls[0];
    // from A's underline (x 8, 84 wide) to B's (x 108, 44 wide): 100px to the left, 84/44 as long, same thickness
    expect(frames[0].transform).toBe(`translate(-100px, 0px) scale(${84 / 44}, 1)`);
    expect(frames[1].transform).toBe('none');
    expect(options.pseudoElement).toBe('::after');
  });

  it('stays still when the selection has not moved', () => {
    const animate = enableMotion();
    const { node } = strip();
    glide(node, params).update({ ...params, on: 1 });
    expect(animate).not.toHaveBeenCalled();
  });
});

describe('leave', () => {
  it('has no duration when motion is off, so the element goes at once', () => {
    expect(leave(document.body, { x: 32 })).toEqual({ duration: 0 });
  });

  it('fades the element out while it backs off by the given offset and scale', () => {
    enableMotion();
    const t = leave(document.body, { x: 32, scale: 0.9 });
    expect(t.duration).toBeGreaterThan(0);
    expect(t.css(1, 0)).toBe('opacity: 1; transform: translate(0px, 0px) scale(1);');
    expect(t.css(0, 1)).toBe('opacity: 0; transform: translate(32px, 0px) scale(0.9);');
  });
});

describe('settleChildren', () => {
  // jsdom lays nothing out, so each child's offsetTop is its index times 50
  function list() {
    document.body.innerHTML = '<div id="l"><p>a</p><p>b</p></div>';
    const node = document.getElementById('l');
    node.getBoundingClientRect = () => ({ left: 0, top: 0 });
    const place = (el) => Object.defineProperty(el, 'offsetTop', { get: () => [...node.children].indexOf(el) * 50 });
    [...node.children].forEach(place);
    return { node, place };
  }

  it('slides the children that moved when one is added or removed, and not the newcomer', async () => {
    const animate = enableMotion();
    const { node, place } = list();
    const [a, b] = node.children;
    const action = settleChildren(node);

    const first = document.createElement('p');
    place(first);
    node.prepend(first);
    await Promise.resolve(); // the observer reports in a microtask
    expect(animate.mock.contexts).toEqual([a, b]);
    expect(animate.mock.calls[0][0][0].transform).toBe('translate(0px, -50px)');

    animate.mockClear();
    first.remove();
    await Promise.resolve();
    expect(animate.mock.contexts).toEqual([a, b]);
    expect(animate.mock.calls[0][0][0].transform).toBe('translate(0px, 50px)');
    action.destroy();
  });

  it('moves nothing when motion is off', async () => {
    const { node } = list();
    const action = settleChildren(node);
    node.firstElementChild.remove();
    await Promise.resolve();
    action.destroy();
  });
});

describe('pageEnter', () => {
  it('numbers the panels, marks the page as entering, and clears the mark once they have landed', () => {
    enableMotion();
    vi.useFakeTimers();
    document.body.innerHTML = '<div id="p">' + '<section class="panel"></section>'.repeat(10) + '</div>';
    const node = document.getElementById('p');
    const action = pageEnter(node);
    const steps = [...node.querySelectorAll('.panel')].map((p) => p.style.getPropertyValue('--enter-i'));
    expect(steps).toEqual(['0', '1', '2', '3', '4', '5', '6', '7', '7', '7']);
    expect(node.classList.contains('is-entering')).toBe(true);
    vi.runAllTimers();
    expect(node.classList.contains('is-entering')).toBe(false);
    action.destroy();
  });

  it('leaves the page alone when motion is off', () => {
    document.body.innerHTML = '<div id="p"><section class="panel"></section></div>';
    const node = document.getElementById('p');
    pageEnter(node);
    expect(node.classList.contains('is-entering')).toBe(false);
    expect(node.querySelector('.panel').getAttribute('style')).toBeNull();
  });
});
