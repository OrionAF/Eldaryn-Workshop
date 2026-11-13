import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installTitleTips } from './titleTips.js';

let remove;
let el;

const fire = (node, type, init = {}) => {
  const e = new Event(type, { bubbles: true });
  Object.assign(e, init);
  node.dispatchEvent(e);
};
const bubble = () => document.querySelector('.title-tip');
const shown = () => !!bubble() && !bubble().hidden;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<button id="b" title="Already first">←</button><span id="s" title="Plain label">x</span><p id="p">no title</p>';
  el = document.getElementById('b');
  remove = installTitleTips(document);
});

afterEach(() => {
  remove();
  vi.useRealTimers();
});

describe('titleTips', () => {
  it('shows the title in the app bubble after the delay and blanks the native title meanwhile', () => {
    fire(el, 'pointerover');
    expect(el.getAttribute('title')).toBe('');
    expect(shown()).toBe(false);
    vi.advanceTimersByTime(250);
    expect(shown()).toBe(true);
    expect(bubble().textContent).toBe('Already first');
    expect(bubble().getAttribute('role')).toBe('tooltip');
  });

  it('puts the title back and hides the bubble when the pointer leaves', () => {
    fire(el, 'pointerover');
    vi.advanceTimersByTime(250);
    fire(el, 'pointerout');
    expect(shown()).toBe(false);
    expect(el.getAttribute('title')).toBe('Already first');
  });

  it('does not put back a title the app removed while it was shown', async () => {
    fire(el, 'pointerover');
    el.removeAttribute('title');
    fire(el, 'pointerout');
    expect(el.hasAttribute('title')).toBe(false);
  });

  it('keeps a title the app rewrote while it was shown', () => {
    fire(el, 'pointerover');
    el.setAttribute('title', 'Now last');
    fire(el, 'pointerout');
    expect(el.getAttribute('title')).toBe('Now last');
  });

  it('a press hides the bubble; Escape hides it too', () => {
    fire(el, 'pointerover');
    vi.advanceTimersByTime(250);
    fire(el, 'pointerdown', { pointerType: 'mouse' });
    expect(shown()).toBe(false);
    fire(el, 'pointerout');
    fire(el, 'pointerover');
    vi.advanceTimersByTime(250);
    expect(shown()).toBe(true);
    fire(document.body, 'keydown', { key: 'Escape' });
    expect(shown()).toBe(false);
  });

  it('on touch, a tap on something that cannot act shows the bubble without touching the title', () => {
    const label = document.getElementById('s');
    fire(label, 'pointerdown', { pointerType: 'touch' });
    fire(label, 'pointerup', { pointerType: 'touch' });
    expect(shown()).toBe(true);
    expect(bubble().textContent).toBe('Plain label');
    expect(label.getAttribute('title')).toBe('Plain label');
    vi.advanceTimersByTime(3500);
    expect(shown()).toBe(false);
  });

  it('on touch, a tap on a working button shows nothing, a long press does', () => {
    fire(el, 'pointerdown', { pointerType: 'touch' });
    fire(el, 'pointerup', { pointerType: 'touch' });
    expect(shown()).toBe(false);
    vi.advanceTimersByTime(500);
    fire(el, 'pointerdown', { pointerType: 'touch' });
    vi.advanceTimersByTime(450);
    expect(shown()).toBe(true);
  });

  it('ignores elements without a title', () => {
    fire(document.getElementById('p'), 'pointerover');
    vi.advanceTimersByTime(300);
    expect(shown()).toBe(false);
  });
});
