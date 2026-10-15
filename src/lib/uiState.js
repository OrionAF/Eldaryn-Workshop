// Per-device view state (ia.md: "View state goes in a separate per-device UI key, never in the
// roster"). Everything here is a convenience: every read and write is guarded, a missing or broken
// store just yields the defaults, and nothing in the roster depends on it.

export const UI_KEY = 'eldaryn_ui_v1';

const defaults = () => ({ v: 1, lastHash: null, areaLast: {} });

/** @returns {{v:1, lastHash:string|null, areaLast:Record<string,string>}} */
export function loadUi() {
  const ui = defaults();
  try {
    const raw = JSON.parse(localStorage.getItem(UI_KEY));
    if (raw && typeof raw === 'object') {
      if (typeof raw.lastHash === 'string') ui.lastHash = raw.lastHash;
      if (raw.areaLast && typeof raw.areaLast === 'object') {
        for (const [k, v] of Object.entries(raw.areaLast)) if (typeof v === 'string') ui.areaLast[k] = v;
      }
    }
  } catch {
    // no storage, blocked storage or junk: defaults
  }
  return ui;
}

/** Merge a patch (`areaLast` merges key by key) into the stored state. Returns whether it was written. */
export function saveUi(patch) {
  try {
    const cur = loadUi();
    const next = { ...cur, ...patch, areaLast: { ...cur.areaLast, ...(patch.areaLast ?? {}) }, v: 1 };
    localStorage.setItem(UI_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}
