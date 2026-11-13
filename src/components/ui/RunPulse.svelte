<script>
  /**
   * RunPulse.svelte - a running job's signs of life, in words (design-system §4.17): how long it has run,
   * how fast it is working and when it last reported. The bar above can sit still for a long step; this
   * line is what says the run is alive, and what says so when it has gone quiet.
   *
   * job: a jobs.svelte.js job ({status, startedAt, queuedAt, progressAt}).
   * count: a number that only grows while the run works (fights so far), or null; `unit` names it.
   *
   * The dot beats when a report arrives (at most twice a second), so it moves only when the run does.
   * Quiet for QUIET_MS the line says how long; quiet for STALL_MS it says what to do about it.
   */
  import { untrack } from 'svelte';
  import { fmtCount } from '../../lib/ui/statsFormat.js';

  let { job, count = null, unit = 'fights' } = $props();

  const QUIET_MS = 8_000;
  const STALL_MS = 45_000;
  const WINDOW_MS = 12_000; // the rate is the work done over about this long

  let now = $state(Date.now());
  $effect(() => {
    if (job?.status !== 'running' && job?.status !== 'queued') return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // (time, count) at each report inside the window, oldest first
  let samples = $state.raw([]);
  $effect(() => {
    const at = job?.progressAt;
    const c = count;
    if (!at || !Number.isFinite(c)) return;
    const prev = untrack(() => samples);
    // a count that went down is a new run in the same slot: start over
    const kept = prev.length && c < prev[prev.length - 1].c ? [] : prev.filter((s) => at - s.at <= WINDOW_MS);
    if (kept.length && kept[kept.length - 1].at === at) return;
    samples = [...kept, { at, c }];
  });

  function duration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  }

  const running = $derived(job?.status === 'running');
  const elapsed = $derived(running ? duration(now - (job.startedAt ?? now)) : '');
  const quietMs = $derived(running ? Math.max(0, now - (job.progressAt ?? job.startedAt ?? now)) : 0);
  const mood = $derived(quietMs >= STALL_MS ? 'stalled' : quietMs >= QUIET_MS ? 'quiet' : 'live');
  const rate = $derived.by(() => {
    if (!running || samples.length < 2 || mood !== 'live') return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const span = Math.max(now, last.at) - first.at;
    if (span < 1000) return null;
    return Math.round(((last.c - first.c) / span) * 1000);
  });
  // one beat per report, but not more than two a second
  const beat = $derived(Math.floor((job?.progressAt ?? 0) / 500));
</script>

{#if job?.status === 'queued'}
  <p class="pulse queued" data-testid="run-pulse">
    <span class="dot" aria-hidden="true"></span>
    <b>Queued</b>
    <span>Starts when the run ahead of it finishes.</span>
  </p>
{:else if running}
  <p class="pulse {mood}" data-testid="run-pulse">
    <span class="dot" aria-hidden="true">{#key beat}<span class="ring"></span>{/key}</span>
    <b>Running</b>
    <span>for <span class="num" data-testid="pulse-elapsed">{elapsed}</span></span>
    {#if rate != null}<span><span class="num" data-testid="pulse-rate">{fmtCount(rate)}</span> {unit} a second</span>{/if}
    {#if mood === 'live'}
      <span class="when">reporting now</span>
    {:else if mood === 'quiet'}
      <span class="when">last report <span class="num" data-testid="pulse-quiet">{duration(quietMs)}</span> ago</span>
    {:else}
      <span class="when">no report for <span class="num" data-testid="pulse-quiet">{duration(quietMs)}</span></span>
    {/if}
  </p>
  {#if mood === 'stalled'}
    <p class="advice" role="status">A big step can be quiet this long. If the time keeps growing, cancel the run and start it again.</p>
  {/if}
{/if}

<style>
  .pulse {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0 var(--sp-2);
    margin: var(--sp-3) 0 0;
    font-size: var(--fs-13);
    color: var(--text-soft);
  }
  .pulse b { color: var(--ember-300); font-weight: var(--fw-bold); }
  .pulse > span + span::before { content: '·'; margin-right: var(--sp-2); color: var(--text-muted); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .dot {
    position: relative;
    align-self: center;
    width: var(--sp-2);
    height: var(--sp-2);
    flex: none;
    border-radius: 50%;
    background: var(--ember-500);
    transition: background-color var(--dur-2) var(--ease-out);
  }
  /* each report sends one ring out of the dot */
  .ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid var(--ember-300);
    animation: ping var(--dur-flash) var(--ease-out) forwards;
  }
  .quiet .dot { background: var(--brass-700); }
  .quiet b { color: var(--text-ink); }
  .quiet .ring, .stalled .ring, .queued .ring { display: none; }
  .stalled .dot { background: var(--status-warn); }
  .stalled b { color: var(--text-ink); }
  .stalled .when, .stalled .when .num { color: var(--status-warn); font-weight: var(--fw-bold); }
  .queued .dot { background: transparent; border: 1px solid var(--text-muted); }
  .queued b { color: var(--text-ink); }
  .advice { margin: var(--sp-1) 0 0; font-size: var(--fs-12); color: var(--text-soft); }
</style>
