<script>
  /**
   * JobsPill.svelte - the labelled "Jobs" pill in the top bar (design-system §4.18): ring spinner
   * while any job runs, count badge (muted when idle). Toggles the JobsTray; Escape in the tray
   * closes it and returns focus here.
   */
  import { onMount } from 'svelte';
  import { jobsStore, restoreInterrupted } from '../../lib/jobs.svelte.js';
  import JobsTray from './JobsTray.svelte';

  let open = $state(false);
  let button = $state(null);

  const total = $derived(jobsStore.list.length);
  const running = $derived(jobsStore.running);
  const label = $derived(
    total === 0
      ? 'Jobs: none'
      : `Jobs: ${running} running, ${jobsStore.list.filter((j) => j.status !== 'running' && j.status !== 'queued').length} finished`,
  );

  function close() {
    open = false;
    button?.focus();
  }

  onMount(() => {
    void restoreInterrupted();
  });
</script>

<button
  bind:this={button}
  type="button"
  class="jobs-pill"
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-controls="jobs-tray"
  aria-label={label}
  onclick={() => (open = !open)}
>
  <svg class="jobs-ring" viewBox="0 0 20 20" aria-hidden="true">
    <circle class="track" cx="10" cy="10" r="7.5" />
    {#if running > 0}<circle class="arc" cx="10" cy="10" r="7.5" stroke-dasharray="16 32" />{/if}
  </svg>
  <span class="jobs-lbl">Jobs</span>
  <span class="count" class:idle={running === 0}>{total}</span>
</button>

{#if open}<JobsTray id="jobs-tray" onclose={close} />{/if}

<style>
  .jobs-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    height: var(--control-h);
    padding: 0 var(--sp-3) 0 var(--sp-2);
    border: 1px solid var(--line-control);
    border-radius: var(--r-pill);
    background: var(--surface-2);
    color: var(--text-ink);
    cursor: pointer;
    font-weight: var(--fw-medium);
  }
  .jobs-pill:hover { border-color: var(--line-control-hover); background: var(--surface-3); }
  .jobs-pill[aria-expanded='true'] { border-color: var(--ember-500); background: var(--surface-3); }
  .jobs-ring { width: 18px; height: 18px; flex: none; }
  .jobs-ring circle { fill: none; stroke-width: 2.5; }
  .track { stroke: var(--line-rule); }
  .arc { stroke: var(--ember-500); stroke-linecap: round; transform-origin: center; animation: jobs-spin 1.4s linear infinite; }
  .count {
    min-width: 20px;
    height: 18px;
    padding: 0 5px;
    display: inline-grid;
    place-items: center;
    border-radius: var(--r-pill);
    background: var(--ember-500);
    color: var(--on-ember);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
  }
  .count.idle { background: var(--surface-4); color: var(--text-soft); }
  @keyframes jobs-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .arc { animation: none; stroke-dasharray: 14 26; }
  }
  @media (max-width: 700px) {
    .jobs-lbl { display: none; }
    .jobs-pill { padding: 0 var(--sp-2); }
  }
</style>
