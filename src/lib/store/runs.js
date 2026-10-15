// store/runs.js - optimiser run history mutators (F2a). The facade (rosterStore.svelte.js) spreads the
// returned object into the public store. Runs are plain data recorded from an OptimiserResult
// (model/runs.js runFromResult); every mutator ends in persist() through ctx.edit.
import { runFromResult, sortRuns, compactRuns, enforceRunsBudget, normaliseRun } from '../model/runs.js';

export function createRunsStore(ctx) {
  /**
   * Record a finished optimiser run on the current character. Accepts an OptimiserResult (converted here)
   * or an already-built run record. Returns the stored run, or null when the byte budget dropped it.
   */
  function addRun(resultOrRun, fields = {}) {
    return ctx.edit((c) => {
      const run = resultOrRun && resultOrRun.kind === 'optimise' && resultOrRun.headline
        ? normaliseRun(resultOrRun)
        : runFromResult(resultOrRun, fields);
      if (!run) return null;
      const next = [run, ...(c.runs ?? []).filter((r) => r.id !== run.id)];
      c.runs = enforceRunsBudget(compactRuns(sortRuns(next)));
      return c.runs.find((r) => r.id === run.id) ?? null;
    });
  }

  function deleteRun(runId) {
    return ctx.edit((c) => {
      const before = c.runs.length;
      c.runs = c.runs.filter((r) => r.id !== runId);
      return c.runs.length < before;
    });
  }

  function setRunName(runId, name) {
    return ctx.edit((c) => {
      const r = c.runs.find((x) => x.id === runId);
      if (!r || typeof name !== 'string' || !name.trim()) return false;
      r.name = name.trim();
      return true;
    });
  }

  function setRunNotes(runId, notes) {
    return ctx.edit((c) => {
      const r = c.runs.find((x) => x.id === runId);
      if (!r) return false;
      r.notes = typeof notes === 'string' ? notes : '';
      return true;
    });
  }

  /** Mark that a row of the run was written to its preset (Apply review); the run keeps the rank. */
  function setRunApplied(runId, rank = null) {
    return ctx.edit((c) => {
      const r = c.runs.find((x) => x.id === runId);
      if (!r) return false;
      r.applied = { at: new Date().toISOString(), rank: Number.isFinite(rank) ? rank : null };
      return true;
    });
  }

  /** Pinned runs keep their detail and survive the budget; unpinning re-applies compaction. */
  function setRunPinned(runId, pinned) {
    return ctx.edit((c) => {
      const r = c.runs.find((x) => x.id === runId);
      if (!r) return false;
      r.pinned = !!pinned;
      c.runs = enforceRunsBudget(compactRuns(c.runs));
      return true;
    });
  }

  /** Remove every run except the pinned ones (default) or all of them. */
  function clearRuns({ keepPinned = true } = {}) {
    return ctx.edit((c) => {
      c.runs = keepPinned ? c.runs.filter((r) => r.pinned) : [];
    });
  }

  return { addRun, deleteRun, setRunName, setRunNotes, setRunApplied, setRunPinned, clearRuns };
}
