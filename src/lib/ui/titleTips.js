/**
 * titleTips.js - one app-styled tooltip for every `title` attribute in the app (design-system §4.32).
 *
 * Components keep writing a plain `title`; this turns it into the app's own bubble on mouse hover,
 * on keyboard focus and, on a touch screen (where a native title never shows), on a long press or a
 * tap on something that cannot act (a disabled control, a plain label). One listener set on the
 * document, so no component has to opt in.
 *
 * While the mouse is over an element its `title` is blanked, which is what stops the browser's own
 * tooltip; the text goes back when the pointer leaves. A blank (not removed) attribute means a change
 * the app makes meanwhile still shows up as a mutation, so a stale text is never put back.
 */

const SHOW_MS = 250;
const HOLD_MS = 450;
const TOUCH_SHOWN_MS = 3500;
const EDGE = 8;
const GAP = 6;

const ACTS = 'a[href], button, input, select, textarea, summary, [role="button"], [role="tab"], [role="menuitem"], [tabindex]';

/** Install on a document; returns the function that removes it. */
export function installTitleTips(doc = document) {
  const win = doc.defaultView;
  let tip = null;
  let owner = null;
  let text = null;
  let blanked = false;
  let observer = null;
  let showTimer = null;
  let hideTimer = null;
  let touching = false;

  const holder = (node) => (node && typeof node.closest === 'function' ? node.closest('[title]') : null);
  const cannotAct = (el) => el.getAttribute('aria-disabled') === 'true' || el.disabled === true || !el.closest(ACTS);

  function place() {
    const r = owner.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    const t = tip.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(r.left, win.innerWidth - t.width - EDGE));
    const below = r.bottom + GAP;
    const above = r.top - GAP - t.height;
    const top = below + t.height > win.innerHeight - EDGE && above >= EDGE ? above : below;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
  }

  function show() {
    if (!owner || !text) return;
    if (!tip) {
      tip = doc.createElement('div');
      tip.className = 'title-tip';
      tip.setAttribute('role', 'tooltip');
      doc.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.hidden = false;
    place();
  }

  function hideBubble() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (tip) tip.hidden = true;
  }

  function onTitleChange() {
    if (!owner) return;
    const now = owner.getAttribute('title');
    if (now === '') return; // our own blanking
    if (now === null) {
      text = null;
      hideBubble();
      return;
    }
    text = now;
    if (tip && !tip.hidden) tip.textContent = now;
    owner.setAttribute('title', '');
  }

  function take(el, value, blank) {
    owner = el;
    text = value;
    blanked = blank;
    if (!blank) return;
    el.setAttribute('title', '');
    observer = new win.MutationObserver(onTitleChange);
    observer.observe(el, { attributes: true, attributeFilter: ['title'] });
  }

  function release() {
    hideBubble();
    observer?.disconnect();
    observer = null;
    // Put the text back only if the attribute is still our blank: removed or rewritten means the app
    // changed it while we held it, and the app's value stands.
    if (owner && blanked && text != null && owner.getAttribute('title') === '') owner.setAttribute('title', text);
    owner = null;
    text = null;
    blanked = false;
  }

  function onPointerOver(e) {
    if (e.pointerType === 'touch' || touching) return;
    const el = holder(e.target);
    if (el === owner) return;
    release();
    const value = el?.getAttribute('title');
    if (!value) return;
    take(el, value, true);
    showTimer = setTimeout(show, SHOW_MS);
  }

  function onPointerOut(e) {
    if (!owner || touching) return;
    if (e.relatedTarget && owner.contains(e.relatedTarget)) return;
    release();
  }

  function onFocusIn(e) {
    const el = holder(e.target);
    if (!el || el === owner) return;
    let keyboard = true;
    try {
      keyboard = e.target.matches(':focus-visible');
    } catch {
      /* no :focus-visible support: treat every focus as a keyboard focus */
    }
    const value = el.getAttribute('title');
    if (!keyboard || !value) return;
    release();
    take(el, value, false);
    showTimer = setTimeout(show, SHOW_MS);
  }

  function onFocusOut() {
    if (owner && !blanked && !touching) release();
  }

  function onPointerDown(e) {
    if (e.pointerType !== 'touch') {
      hideBubble(); // a press dismisses it; the title stays blank until the pointer leaves
      return;
    }
    touching = true;
    release();
    const el = holder(e.target);
    const value = el?.getAttribute('title');
    if (!value) return;
    take(el, value, false);
    showTimer = setTimeout(show, HOLD_MS);
  }

  function onPointerUp(e) {
    if (e.pointerType !== 'touch') return;
    // keep `touching` through the emulated mouse events that follow a tap
    setTimeout(() => (touching = false), 400);
    if (!owner) return;
    clearTimeout(showTimer);
    const held = tip && !tip.hidden;
    if (!held && !cannotAct(owner)) {
      release();
      return;
    }
    if (!held) show();
    hideTimer = setTimeout(release, TOUCH_SHOWN_MS);
  }

  function onPointerCancel(e) {
    if (e.pointerType !== 'touch') return;
    touching = false;
    release();
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') hideBubble();
  }

  const opts = { capture: true, passive: true };
  const events = [
    ['pointerover', onPointerOver],
    ['pointerout', onPointerOut],
    ['focusin', onFocusIn],
    ['focusout', onFocusOut],
    ['pointerdown', onPointerDown],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['keydown', onKeyDown],
    ['scroll', release],
  ];
  for (const [name, fn] of events) doc.addEventListener(name, fn, opts);

  return () => {
    for (const [name, fn] of events) doc.removeEventListener(name, fn, opts);
    release();
    tip?.remove();
    tip = null;
  };
}
