import { describe, it, expect, afterEach, vi } from 'vitest';
import { flushSync } from 'svelte';
import Num from './Num.svelte';
import { setup } from './testkit.js';

// Named *.svelte.test.js so the props can be $state and change after mount.
const fmt = (n) => `${Math.round(n)} pts`;

afterEach(() => {
  delete Element.prototype.animate;
  document.documentElement.style.cssText = '';
  vi.unstubAllGlobals();
});

describe('Num', () => {
  it('shows the formatted value and follows a change at once when motion is off', () => {
    const props = $state({ value: 100, format: fmt });
    const t = setup(Num, props);
    expect(t.target.textContent).toBe('100 pts');
    props.value = 250;
    flushSync();
    expect(t.target.textContent).toBe('250 pts');
    t.done();
  });

  it('rolls through in-between figures and lands on the new value, tinting by direction', () => {
    const animate = vi.fn();
    Element.prototype.animate = animate;
    document.documentElement.style.setProperty('--verdict-up', 'green');
    let now = 0;
    const frames = [];
    vi.stubGlobal('performance', { now: () => now });
    vi.stubGlobal('requestAnimationFrame', (fn) => frames.push(fn));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const step = (ms) => {
      now += ms;
      frames.shift()(now);
      flushSync();
    };

    const props = $state({ value: 100, format: fmt, flash: 'verdict' });
    const t = setup(Num, props);
    expect(animate).not.toHaveBeenCalled(); // nothing moves on first render

    props.value = 200;
    flushSync();
    expect(t.target.textContent).toBe('100 pts'); // the roll starts from the old figure
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][0][0]).toEqual({ color: 'green' }); // 200 > 100: the up tint

    step(100);
    const mid = parseInt(t.target.textContent, 10);
    expect(mid).toBeGreaterThan(100);
    expect(mid).toBeLessThan(200);

    step(10_000);
    expect(t.target.textContent).toBe('200 pts');
    expect(frames).toHaveLength(0);
    t.done();
  });
});
