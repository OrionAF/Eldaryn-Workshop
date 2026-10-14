<script>
  /**
   * RunHistory.svelte - saved optimiser runs (character.runs, newest first; F2b, adapted from RunHistoryPanel).
   * Headline rows live forever; the per-build detail may have compacted away (shown as "detail compacted").
   * Delete is a two-step ConfirmButton; names and notes persist per run.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import ResultList from './ResultList.svelte';
  import { fmtValue } from './format.js';

  const runs = $derived(rosterStore.current?.runs ?? []);
  let expanded = $state(null);
  const toggle = (id) => (expanded = expanded === id ? null : id);
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');
  const gain = (h) => (h.gainPct != null ? `${h.gainPct >= 0 ? '+' : ''}${(h.gainPct * 100).toFixed(2)}%` : null);
</script>

<section class="panel" data-testid="run-history">
  <div class="top">
    <h3 class="subheading">Saved runs</h3>
    <span class="hint">{runs.length} run{runs.length === 1 ? '' : 's'}; finished runs are saved automatically</span>
    <span class="spacer"></span>
    {#if runs.length}
      <ConfirmButton class="btn-danger" label="Clear unpinned" confirmLabel="Confirm clear" onConfirm={() => rosterStore.clearRuns({ keepPinned: true })} />
    {/if}
  </div>

  {#each runs as run (run.id)}
    {@const h = run.headline}
    <div class="run" data-testid="run-row">
      <div class="head">
        <button type="button" class="btn-ghost" aria-expanded={expanded === run.id} onclick={() => toggle(run.id)}>{expanded === run.id ? 'Hide' : 'Open'}</button>
        <span class="name">{run.name}</span>
        <span class="meta mono">{when(run.at)}</span>
        {#if run.pinned}<span class="tag">pinned</span>{/if}
        {#if h.aborted}<span class="tag">cancelled</span>{/if}
        {#if h.truncated}<span class="tag">stopped on {h.truncated}</span>{/if}
      </div>
      <div class="sub">
        <span>{run.target.label}</span>
        <span>{run.objective.label}</span>
        <span class="mono">
          {fmtValue(h.unit, h.baseline)} to {fmtValue(h.unit, h.best)}{#if gain(h)}, {gain(h)}{/if}
        </span>
        <span class="mono">N={h.n ?? 0}, {h.evaluated ?? 0} builds tried, tier {h.tier}</span>
        {#if h.significant != null}<span class="tag">{h.significant ? 'significant' : 'within noise'}</span>{/if}
      </div>

      {#if expanded === run.id}
        <div class="body">
          <div class="edit">
            <input
              type="text"
              value={run.name}
              aria-label="Run name"
              onchange={(e) => rosterStore.setRunName(run.id, e.currentTarget.value)}
            />
            <button type="button" class="btn-ghost" onclick={() => rosterStore.setRunPinned(run.id, !run.pinned)}>{run.pinned ? 'Unpin' : 'Pin'}</button>
            <ConfirmButton class="btn-danger" label="Delete" confirmLabel="Confirm delete" onConfirm={() => rosterStore.deleteRun(run.id)} />
          </div>
          <textarea
            rows="2"
            placeholder="Notes"
            aria-label="Run notes"
            value={run.notes}
            onchange={(e) => rosterStore.setRunNotes(run.id, e.currentTarget.value)}
          ></textarea>
          {#if run.detail}
            <ResultList unit={h.unit} baseline={run.detail.baseline} results={run.detail.results} />
          {:else}
            <p class="hint">Detail compacted to keep storage small; the headline above is kept.</p>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <p class="hint">No runs yet.</p>
  {/each}
</section>

<style>
  .panel { background: var(--color-panel); border: 1px solid var(--color-border); border-radius: var(--radius-panel); padding: 16px 18px; display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-3); }
  .top { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .spacer { flex: 1; }
  .run { border-top: 1px solid var(--color-border); padding-top: var(--space-2); display: flex; flex-direction: column; gap: 4px; }
  .head, .sub, .edit { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .name { font-weight: 600; }
  .meta, .sub { color: var(--color-muted); font-size: 12px; }
  .tag { font-size: 11px; color: var(--color-soft); border: 1px solid var(--color-border); border-radius: var(--radius-chip); padding: 1px 6px; }
  .body { display: flex; flex-direction: column; gap: var(--space-2); }
  .edit input { flex: 1; min-width: 140px; }
  textarea { width: 100%; box-sizing: border-box; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
</style>
