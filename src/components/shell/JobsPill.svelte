<script>
  /**
   * JobsPill.svelte - the labelled "Jobs" pill in the top bar (design-system §4.18): ring spinner
   * while any job runs, and a count badge of the RUNNING jobs only (no badge when none run: finished jobs
   * are in the tray, not in the number). Toggles the JobsTray; Escape in the tray
   * closes it and returns focus here.
   */
  import { onMount } from 'svelte';
  import { jobsStore, restoreInterrupted } from '../../lib/jobs.svelte.js';
  import { router } from '../../lib/router.svelte.js';
  import JobsTray from './JobsTray.svelte';

  let open = $state(false);
  let button = $state(null);
  let wrap = $state(null);

  // The tray is a popover: it closes on Escape from anywhere, on a press outside it, and when the
  // page changes (it would otherwise cover the page it just opened, most of all on a phone).
  let lastHash = null;
  $effect(() => {
    const hash = router.route?.hash ?? null;
    if (lastHash !== null && hash !== lastHash) open = false;
    lastHash = hash;
  });
  function onWindowKeydown(e) {
    if (open && e.key === 'Escape' && !e.defaultPrevented) close();
  }
  function onWindowClick(e) {
    // a row's own button may already be gone from the page (Dismiss), which is not a press outside
    if (open && wrap && e.target.isConnected && !wrap.contains(e.target)) open = false;
  }

  const total = $derived(jobsStore.list.length);
  const running = $derived(jobsStore.running);
  const label = $derived(
    total === 0
      ? 'Runs: none'
      : `Runs: ${running} running, ${jobsStore.list.filter((j) => j.status !== 'running' && j.status !== 'queued').length} finished`,
  );

  // A run that finishes sends one ring out from the pill (design-system §2.13); the tray holds the result.
  const finished = $derived(jobsStore.list.filter((j) => j.status === 'finished').length);
  let pings = $state(0);
  let lastFinished = null;
  let pingCount = 0;
  $effect(() => {
    if (lastFinished !== null && finished > lastFinished) pings = ++pingCount;
    lastFinished = finished;
  });

  function close() {
    open = false;
    button?.focus();
  }

  onMount(() => {
    void restoreInterrupted();
  });
</script>

<svelte:window onkeydown={onWindowKeydown} onclick={onWindowClick} />

<span class="jobs-wrap" bind:this={wrap}>
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
  <span class="ring-wrap">
    <svg class="jobs-ring" viewBox="0 0 20 20" aria-hidden="true">
      <circle class="track" cx="10" cy="10" r="7.5" />
      {#if running > 0}<circle class="arc" cx="10" cy="10" r="7.5" stroke-dasharray="16 32" />{/if}
    </svg>
    {#key pings}{#if pings > 0}<span class="ping" aria-hidden="true"></span>{/if}{/key}
  </span>
  <span class="jobs-lbl">Runs</span>
  {#if running > 0}<span class="count" data-testid="jobs-running">{running}</span>{/if}
</button>

{#if open}<JobsTray id="jobs-tray" onclose={close} />{/if}
</span>

<style>
  .jobs-wrap { display: contents; }
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
  .ring-wrap { position: relative; display: inline-flex; flex: none; }
  .jobs-ring { width: 18px; height: 18px; flex: none; }
  .ping {
    position: absolute;
    inset: 1px;
    border-radius: 50%;
    border: 2px solid var(--brass-200);
    pointer-events: none;
    animation: ping var(--dur-flash) var(--ease-out) forwards;
  }
  .jobs-lbl { max-width: 6ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
  @keyframes jobs-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .arc { animation: none; stroke-dasharray: 14 26; }
  }
  /* The label stays on a phone: a bare ring does not say what it opens. */
  @media (max-width: 700px) {
    .jobs-pill { padding: 0 var(--sp-2); gap: var(--sp-1); font-size: var(--fs-12); }
  }
</style>
