<script>
  /**
   * RunHistoryTab.svelte - the Optimiser's "Run history" tab (ia.md §5.17): saved runs of the current
   * character, newest first. The run's name opens its stored result in Setup & results (`onopen`); Details
   * expands it in place. Rename / notes / pin / delete / Clear unpinned, "Re-run with
   * settings" (loads the run's setup, measures afresh) and a side-by-side compare of two runs. A run's detail
   * is read-only; a run saved before per-change effects were measured says "not measured". The headline
   * rows are kept forever; the detail may have compacted away (model/runs.js).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { viewRun } from '../../lib/ui/optimiserView.js';
  import { fmtScalar, fmtCount } from '../../lib/ui/statsFormat.js';
  import ConfirmAction from '../tools/ConfirmAction.svelte';
  import Button from '../ui/Button.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Panel from '../ui/Panel.svelte';
  import Textarea from '../ui/Textarea.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Banner from '../ui/Banner.svelte';
  import OptimiserResults from './OptimiserResults.svelte';
  import RunCompare from './RunCompare.svelte';

  let { onrerun = () => {}, onopen = null } = $props();

  const runs = $derived(rosterStore.current?.runs ?? []);
  let openId = $state(null);
  let picked = $state([]); // run ids chosen for compare (max two)

  const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');
  const gain = (h) => (h.gainPct != null ? `${h.gainPct >= 0 ? '+' : ''}${(h.gainPct * 100).toFixed(2)}%` : null);
  const toggleOpen = (id) => (openId = openId === id ? null : id);
  function togglePick(id, on) {
    picked = on ? [...picked.filter((x) => x !== id), id].slice(-2) : picked.filter((x) => x !== id);
  }
  const pair = $derived(picked.length === 2 ? picked.map((id) => runs.find((r) => r.id === id)) : null);
  const view = $derived(openId ? viewRun(runs.find((r) => r.id === openId) ?? {}) : null);
</script>

<div class="history" data-testid="run-history">
  <Panel title="Run history" level="primary" scope="tool">
    <div class="top">
      <span class="hint">{runs.length} run{runs.length === 1 ? '' : 's'}. Finished runs are saved here automatically.</span>
      {#if runs.length}
        <ConfirmAction label="Clear unpinned" confirmLabel="Confirm clear" prompt="Pinned runs are kept." onConfirm={() => rosterStore.clearRuns({ keepPinned: true })} />
      {/if}
    </div>

    {#if pair && pair[0] && pair[1]}
      <RunCompare a={pair[0]} b={pair[1]} />
    {:else if runs.length > 1}
      <p class="hint">Tick "Compare" on two runs to see them side by side.</p>
    {/if}

    {#each runs as run (run.id)}
      {@const h = run.headline}
      <article class="run" data-testid="run-row">
        <div class="head">
          {#if onopen}
            <button type="button" class="open" onclick={() => onopen(run)} title="Open this result in Setup & results">{run.name}</button>
          {:else}
            <button type="button" class="open" aria-expanded={openId === run.id} onclick={() => toggleOpen(run.id)}>{run.name}</button>
          {/if}
          <span class="meta num">{when(run.at)}</span>
          {#if run.pinned}<span class="tag">pinned</span>{/if}
          {#if run.applied}<span class="tag">applied</span>{/if}
          {#if run.schema !== 2}<span class="tag">before per-change effects</span>{/if}
          {#if h.aborted}<span class="tag">cancelled</span>{/if}
          <span class="spacer"></span>
          {#if onopen}
            <Button variant="quiet" size="small" aria-expanded={openId === run.id} onclick={() => toggleOpen(run.id)}>Details</Button>
          {/if}
          <Button variant="quiet" size="small" aria-pressed={run.pinned} onclick={() => rosterStore.setRunPinned(run.id, !run.pinned)}>{run.pinned ? 'Unpin' : 'Pin'}</Button>
          <Checkbox label="Compare" checked={picked.includes(run.id)} onchange={(on) => togglePick(run.id, on)} />
        </div>
        <div class="sub">
          <span>{run.presetName || 'Preset'}</span>
          <span>{run.target.label}</span>
          <span>{run.objective.label}</span>
          <span class="num">{fmtScalar(h.unit, h.baseline)} to {fmtScalar(h.unit, h.best)}{#if gain(h)}, {gain(h)}{/if}</span>
          <span class="num">N {fmtCount(h.n)}, {fmtCount(h.evaluated)} builds tried</span>
        </div>
        {#if h.text}<p class="text">{h.text}</p>{/if}

        {#if openId === run.id}
          <div class="body">
            <div class="edit">
              <label class="name">
                <span class="lbl">Name</span>
                <input type="text" value={run.name} aria-label="Run name" onchange={(e) => rosterStore.setRunName(run.id, e.currentTarget.value)} />
              </label>
              <Button variant="secondary" size="small" onclick={() => onrerun(run)}>Re-run with settings</Button>
              <ConfirmAction label="Delete" confirmLabel="Confirm delete" onConfirm={() => rosterStore.deleteRun(run.id)} />
            </div>
            <Textarea label="Notes" rows={2} value={run.notes} oninput={(v) => rosterStore.setRunNotes(run.id, v)} />
            {#if run.schema !== 2}
              <Banner variant="info" lead="Per-change effects: not measured.">
                This run was saved before each change was measured on its own. Its values and intervals are as recorded.
              </Banner>
            {/if}
            {#if view}
              <OptimiserResults {view} presetName={run.presetName || 'the preset'} unmeasured={() => run.schema !== 2} />
            {:else}
              <p class="hint">Detail compacted to keep storage small; the headline above is kept.</p>
            {/if}
          </div>
        {/if}
      </article>
    {:else}
      <EmptyState title="No runs yet" text="Run the optimiser and the finished result is saved here." />
    {/each}
  </Panel>
</div>

<style>
  .history { display: grid; gap: var(--sp-4); }
  .top { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; justify-content: space-between; }
  .hint { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .run { border-top: 1px solid var(--line-hairline); padding-top: var(--sp-3); display: grid; gap: var(--sp-2); }
  .head, .sub, .edit { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .spacer { flex: 1; }
  .open { background: none; border: 0; padding: 0; cursor: pointer; color: var(--text-ink); font: inherit; font-weight: var(--fw-bold); text-align: left; }
  .open:hover { color: var(--brass-200); }
  .meta, .sub { color: var(--text-soft); font-size: var(--fs-12); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .text { margin: 0; color: var(--text-soft); font-size: var(--fs-13); }
  .tag { font-size: var(--fs-11); color: var(--text-soft); border: 1px solid var(--line-control); border-radius: var(--r-1); padding: 1px 6px; }
  .body { display: grid; gap: var(--sp-3); }
  .edit { align-items: flex-end; }
  .name { display: grid; gap: 4px; flex: 1; min-width: 160px; }
  .lbl { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .name input {
    height: var(--control-h); padding: 0 var(--sp-3); background: var(--surface-3); color: var(--text-ink);
    border: 1px solid var(--line-control); border-radius: var(--r-1); font: inherit; font-size: var(--fs-13);
  }
</style>
