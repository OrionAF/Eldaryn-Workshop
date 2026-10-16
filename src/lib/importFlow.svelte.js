/**
 * importFlow.svelte.js - the state machine behind the G3 import dialog (ia.md §3.1, §3.2, §5.4).
 *
 * One flow for both Settings entry points (Data > Restore a backup, and Advanced > Import): the text goes
 * through planImport (importPlan.js), the dialog shows what it is and what will happen, and only
 * `confirmImport` writes. Junk never reaches the roster: a failed plan sets `error` and nothing else.
 * Loot bags and fight logs are not imported here; they are handed to their tool page, which collects
 * them with `takeHandoff`.
 */
import { rosterStore } from './rosterStore.svelte.js';
import { planImport } from './importPlan.js';
import { ImportError } from './storage.js';
import { notify } from './notify.svelte.js';
import { go } from './router.svelte.js';
import { AFTER_IMPORT_PAGE_ID } from './routes.js';
import { MAX_OPPONENTS } from './model/opponents.js';

let state = $state({
  open: false,
  /** 'choose' (file / paste) or 'report' (a plan is shown) */
  stage: 'choose',
  text: '',
  plan: null,
  error: '',
  /** for a profile that matches an existing name: 'update' (default) or 'create' */
  mode: 'create',
  /** roster replace: download the current roster before replacing it */
  backupFirst: true,
  /** bumped when a loot bag / fight log is handed over, so a tool page that is already open can react */
  handoffSeq: 0,
  /** bumped by a pointer link so Settings focuses its Import section */
  focusSeq: 0,
  /** true from a pointer link's request until the Import section has taken the focus */
  focusPending: false,
  /** which Settings box the last text came from ('import' or 'restore'), so only that box shows the error */
  from: 'import',
});

/** The last "Update <name>": the character as it was, for the one-step undo. */
let lastUpdate = $state(null);

let handoff = null;

export const importFlow = {
  get open() {
    return state.open;
  },
  get stage() {
    return state.stage;
  },
  get text() {
    return state.text;
  },
  get plan() {
    return state.plan;
  },
  get error() {
    return state.error;
  },
  get mode() {
    return state.mode;
  },
  get backupFirst() {
    return state.backupFirst;
  },
  /** Changes each time a loot bag / fight log is waiting; tool pages watch it and call `takeHandoff`. */
  get handoffSeq() {
    return state.handoffSeq;
  },
  get focusSeq() {
    return state.focusSeq;
  },
  get focusPending() {
    return state.focusPending;
  },
  get from() {
    return state.from;
  },
  /** {name, at} of the update that can still be undone, or null. */
  get undo() {
    return lastUpdate ? { name: lastUpdate.name, at: lastUpdate.at } : null;
  },
};

export function setImportMode(mode) {
  state.mode = mode === 'update' ? 'update' : 'create';
}

export function setBackupFirst(on) {
  state.backupFirst = !!on;
}

/** Ask the Settings page to scroll to and focus its Import section (the pointer links on the tool pages). */
export function requestImportFocus() {
  state.focusSeq += 1;
  state.focusPending = true;
}

/** The Import section calls this once it has focused its heading. */
export function consumeImportFocus() {
  const was = state.focusPending;
  state.focusPending = false;
  return was;
}

export function closeImport() {
  state.open = false;
  state.stage = 'choose';
  state.plan = null;
  state.error = '';
  state.text = '';
}

/** Go back from the report to the file / paste step (the error, if any, stays visible there). */
export function backToChoose() {
  state.stage = 'choose';
  state.plan = null;
}

/**
 * Read `text` (a file's contents or pasted JSON). On success the report is shown; on failure the dialog
 * stays on the choose step with the specific reason, and nothing has been written.
 * @param {string} text
 * @param {'import'|'restore'} [from] the Settings box it came from
 * @returns {boolean} whether a report is shown
 */
export function loadImportText(text, from = 'import') {
  state.open = true;
  state.text = text;
  state.from = from;
  try {
    const plan = planImport(text, rosterStore.roster, { character: rosterStore.current });
    state.plan = plan;
    state.error = '';
    state.stage = 'report';
    state.mode = plan.kind === 'profile' && plan.match ? 'update' : 'create';
    state.backupFirst = true;
    return true;
  } catch (e) {
    state.plan = null;
    state.stage = 'choose';
    state.error = e instanceof ImportError ? e.message : `That file could not be read: ${e?.message ?? e}`;
    return false;
  }
}

/** Read a File (or Blob) and load its text. `from` as for loadImportText. */
export async function loadImportFile(file, from = 'import') {
  let text;
  try {
    text = typeof file.text === 'function' ? await file.text() : await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  } catch {
    state.open = true;
    state.stage = 'choose';
    state.from = from;
    state.error = 'That file could not be read. Try choosing it again.';
    return false;
  }
  return loadImportText(text, from);
}

/** A tool page takes the loot bag / fight log text once (null when none is waiting). */
export function takeHandoff(kind) {
  if (handoff?.kind !== kind) return null;
  const { text } = handoff;
  handoff = null;
  return text;
}

/**
 * Do what the report says. Writes only here.
 * @returns {boolean} whether the dialog's job is finished (it closes)
 */
export function confirmImport() {
  const plan = state.plan;
  if (!plan) return false;
  try {
    if (plan.kind === 'profile') {
      if (state.mode === 'update' && plan.match) {
        const res = rosterStore.updateCharacterFromProfile(plan.match.id, plan.character);
        if (!res) throw new ImportError('That character no longer exists, so nothing was updated.');
        lastUpdate = { id: plan.match.id, name: plan.match.name, before: res.before, at: new Date().toISOString() };
        notify(`Updated ${plan.match.name} from the game profile. Undo is in Settings, Data.`, { kind: 'success' });
      } else {
        const res = rosterStore.importFromJson(state.text);
        notify(`Created ${res.name} from a game profile`, { kind: 'success' });
      }
      closeImport();
      go(AFTER_IMPORT_PAGE_ID);
      return true;
    }
    if (plan.kind === 'opponent') {
      const res = rosterStore.saveRankingsOpponent(plan.opponent);
      if (!res) throw new ImportError(`You can save at most ${MAX_OPPONENTS} opponents. Remove one on the Opponents page first.`);
      notify(`${res.updated ? 'Updated' : 'Saved'} opponent ${plan.opponent.name} from Rankings`, { kind: 'success' });
      closeImport();
      go('tools/opponents');
      return true;
    }
    if (plan.kind === 'roster') {
      if (rosterStore.roster.characters.length > 0 && state.backupFirst) rosterStore.exportDownload();
      rosterStore.importFromJson(state.text);
      notify(`Restored ${plan.incoming.length} character${plan.incoming.length === 1 ? '' : 's'} from the backup`, { kind: 'success' });
      closeImport();
      return true;
    }
    handoff = { kind: plan.kind, text: state.text };
    state.handoffSeq += 1;
    closeImport();
    go(plan.kind === 'lootBag' ? 'tools/drop' : 'tools/duel');
    return true;
  } catch (e) {
    state.error = e instanceof ImportError ? e.message : `The import did not work: ${e?.message ?? e}`;
    state.stage = 'choose';
    state.plan = null;
    return false;
  }
}

/** Undo the last "Update <name>" (one step). */
export function undoLastUpdate() {
  if (!lastUpdate) return false;
  const ok = rosterStore.restoreCharacter(lastUpdate.before);
  const name = lastUpdate.name;
  lastUpdate = null;
  notify(ok ? `Undid the update of ${name}` : `${name} no longer exists, so the update could not be undone`, { kind: ok ? 'success' : 'warn' });
  return ok;
}

/** Tests: forget everything. */
export function resetImportFlow() {
  closeImport();
  lastUpdate = null;
  handoff = null;
  state.from = 'import';
  state.focusPending = false;
}
