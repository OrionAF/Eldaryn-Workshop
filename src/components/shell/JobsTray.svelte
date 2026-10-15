<script>
  /**
   * JobsTray.svelte - the G4 popover listing the session's jobs (design-system §4.18): status word
   * with glyph (never colour alone), segmented progress, elapsed, and the actions each status allows.
   * Non-modal dialog; Escape asks the pill to close (focus returns there). State comes from the job
   * store; this component only presents it.
   */
  import {
    jobsStore,
    cancelJob,
    resumeJob,
    retryJob,
    dismissJob,
    clearFinished,
    openResult,
    isStale,
    summaryOf,
    setPersistCheckpoints,
  } from '../../lib/jobs.svelte.js';
  import { retiredGoalBlock } from '../../lib/ui/optimiserSetup.js';
  import RunProgress from '../ui/RunProgress.svelte';
  import StepList from '../ui/StepList.svelte';
  import { searchStepRows } from '../../lib/ui/searchSteps.js';
  import Button from '../ui/Button.svelte';

  const retiredOf = (job) => (job.tool === 'optimiser' ? retiredGoalBlock(job.request) : '');

  let { id = 'jobs-tray', onclose = () => {} } = $props();

  const STATUS = {
    queued: { glyph: '◌', word: 'Queued', cls: 'st-queued' },
    running: { glyph: '●', word: 'Running', cls: 'st-running' },
    finished: { glyph: '✓', word: 'Finished', cls: 'st-done' },
    failed: { glyph: '✕', word: 'Failed', cls: 'st-failed' },
    cancelled: { glyph: '⊘', word: 'Cancelled', cls: 'st-cancelled' },
    skipped: { glyph: '!', word: 'Skipped', cls: 'st-skipped' },
  };
  const SEGMENT_STATE = { done: 'done', current: 'active', queued: 'queued' };

  let now = $state(Date.now());
  $effect(() => {
    if (jobsStore.running === 0) return;
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  const jobs = $derived(jobsStore.list);
  const hasDone = $derived(jobs.some((j) => j.status !== 'running' && j.status !== 'queued'));

  const segmentsOf = (job) =>
    (job.progress?.phases ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      state: job.status === 'cancelled' && p.state !== 'done' ? 'cancelled' : (SEGMENT_STATE[p.state] ?? 'queued'),
      done: p.done,
      total: p.total,
    }));

  function duration(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
  }
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const elapsed = (job) => duration((job.endedAt ?? now) - (job.startedAt ?? job.queuedAt));

  // Polite announcement of status changes (the rows themselves are not a live region).
  let announce = $state('');
  const last = new Map();
  $effect(() => {
    for (const j of jobs) {
      const prev = last.get(j.id);
      if (prev !== undefined && prev !== j.status) announce = `${j.title}: ${STATUS[j.status].word}`;
      last.set(j.id, j.status);
    }
  });

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section {id} class="tray" role="dialog" aria-modal="false" aria-labelledby="{id}-h" tabindex="-1" onkeydown={onKeydown}>
  <div class="tray-head">
    <h2 id="{id}-h">Jobs ({jobs.length})</h2>
    <span class="grow"></span>
    <Button variant="quiet" size="small" disabled={!hasDone} onclick={clearFinished}>Clear finished</Button>
    <button type="button" class="close" aria-label="Close jobs" onclick={onclose}>×</button>
  </div>

  {#if jobs.length === 0}
    <p class="empty">No jobs yet. Long simulations (Optimiser, Duel, Drop Check, Oblivion) appear here while they run.</p>
  {/if}

  {#each jobs as job (job.id)}
    {@const st = STATUS[job.status]}
    {@const stale = job.status === 'finished' && isStale(job)}
    <article class="job" aria-label="{job.title}, {st.word.toLowerCase()}">
      <div class="job-top">
        <div class="t">
          <b>{job.title}</b>
          {#if job.context}<span>{job.context}</span>{/if}
        </div>
        <span class="st {st.cls}"><span aria-hidden="true">{st.glyph}</span>{st.word}</span>
      </div>

      {#if job.status === 'running' || (job.status === 'cancelled' && job.progress)}
        {@const segs = segmentsOf(job)}
        {#if segs.length > 0}<RunProgress segments={segs} />{/if}
        <StepList id="jobs-steps-{job.id}" title="Search steps" steps={searchStepRows(job.progress?.searchSteps, { showOff: false })} />
      {/if}

      {#if job.status === 'failed' && job.error}
        <p class="err" role="alert"><span aria-hidden="true">✕</span> {job.error}</p>
      {/if}
      {#if job.status === 'skipped' && job.error}
        <p class="note">{job.error}</p>
      {/if}
      {#if job.status === 'cancelled'}
        <p class="note">
          {#if job.interrupted}Interrupted by a reload.{/if}
          {job.checkpoint ? 'Progress is saved; Resume continues where it stopped.' : 'Nothing saved to resume from.'}
        </p>
      {/if}
      {#if stale}
        <p class="note stale"><span aria-hidden="true">!</span> Stale: the character or preset changed after this ran. Run it again.</p>
      {/if}

      {#if job.status === 'finished'}
        {@const chips = summaryOf(job)}
        {#if chips.length > 0}
          <div class="chips">
            {#each chips as c, i (i)}<span class="sum {c.tone ?? ''}">{c.text}</span>{/each}
          </div>
        {/if}
      {/if}

      <div class="job-foot">
        <span class="time">
          {#if job.status === 'running'}Elapsed <span class="num">{elapsed(job)}</span>{#if job.workers} · <span class="num" data-testid="job-workers">{job.workers} {job.workers === 1 ? 'worker' : 'workers'}</span>{/if}
          {:else if job.status === 'queued'}Waiting for a free slot
          {:else}{st.word} <span class="num">{clock(job.endedAt ?? job.queuedAt)}</span>
            {#if job.startedAt}· took <span class="num">{elapsed(job)}</span>{/if}
          {/if}
        </span>
        <span class="acts">
          {#if job.status === 'running' || job.status === 'queued'}
            <Button variant="ghost" size="small" disabled={job.cancelRequested} onclick={() => cancelJob(job.id)}>
              {job.cancelRequested ? 'Cancelling…' : 'Cancel'}
            </Button>
          {:else}
            <Button variant="quiet" size="small" onclick={() => dismissJob(job.id)}>Dismiss</Button>
          {/if}
          {#if job.status === 'cancelled'}
            <Button variant="secondary" size="small" disabled={!!retiredOf(job)} reason={retiredOf(job)} onclick={() => resumeJob(job.id)}>Resume</Button>
          {/if}
          {#if job.status === 'failed'}
            <Button variant="secondary" size="small" disabled={!!retiredOf(job)} reason={retiredOf(job)} onclick={() => retryJob(job.id)}>Retry</Button>
          {/if}
          {#if job.openRoute && job.status !== 'queued'}
            <Button variant="secondary" size="small" onclick={() => openResult(job.id)}>
              {job.status === 'finished' ? 'Open result' : 'Open'}
            </Button>
          {/if}
        </span>
      </div>
    </article>
  {/each}

  <label class="keep">
    <input
      type="checkbox"
      checked={jobsStore.persistCheckpoints}
      onchange={(e) => setPersistCheckpoints(e.currentTarget.checked)}
    />
    Keep checkpoints on this device so Resume works after a reload
  </label>
  <div class="tray-foot" data-testid="tray-foot">
    Jobs run in the background: keep using the app while they work.
    {jobsStore.persistCheckpoints ? 'A reload pauses running jobs; Resume picks up from the last checkpoint.' : 'A reload cancels running jobs.'}
  </div>
  <div class="sr-only" role="status" aria-live="polite">{announce}</div>
</section>

<style>
  .tray {
    position: fixed;
    top: calc(var(--topbar-h) + 6px);
    right: var(--sp-4);
    width: min(var(--jobs-tray-w), calc(100vw - 2 * var(--sp-3)));
    max-height: calc(100vh - var(--topbar-h) - var(--sp-6));
    overflow-y: auto;
    overflow-x: hidden;
    z-index: var(--z-popover);
    background: var(--surface-2);
    border: 1px solid var(--line-control);
    border-radius: var(--r-3);
    box-shadow: var(--elev-2);
  }
  .tray-head { display: flex; align-items: center; gap: var(--sp-2); padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--line-hairline); }
  .tray-head h2 { margin: 0; font-size: var(--fs-16); }
  .grow { flex: 1; }
  .close { width: var(--control-h); height: var(--control-h); background: none; border: 1px solid transparent; border-radius: var(--r-1); color: var(--text-soft); font-size: var(--fs-16); cursor: pointer; }
  .close:hover { background: var(--surface-3); color: var(--text-ink); }
  .empty { margin: 0; padding: var(--sp-4); color: var(--text-soft); font-size: var(--fs-13); }
  .job { padding: var(--sp-3) var(--sp-4); border-bottom: 1px solid var(--line-hairline); display: grid; gap: var(--sp-2); min-width: 0; }
  .job > :global(*) { min-width: 0; }
  .job-top { display: flex; align-items: flex-start; gap: var(--sp-2); }
  .t { flex: 1; min-width: 0; }
  .t b { display: block; color: var(--text-ink); }
  .t span { font-size: var(--fs-12); color: var(--text-soft); }
  .st { font-size: var(--fs-12); font-weight: var(--fw-bold); display: inline-flex; gap: 5px; align-items: center; white-space: nowrap; }
  .st-queued { color: var(--text-muted); }
  .st-running { color: var(--ember-300); }
  .st-done { color: var(--verdict-up); }
  .st-failed { color: var(--verdict-down); }
  .st-cancelled { color: var(--text-muted); font-weight: var(--fw-medium); }
  .st-skipped { color: var(--status-warn); }
  .err { margin: 0; padding: var(--sp-2) var(--sp-3); background: var(--surface-1); border: 1px solid var(--verdict-down); border-radius: var(--r-1); font-size: var(--fs-13); color: var(--text-ink); }
  .err span { color: var(--verdict-down); }
  .note { margin: 0; font-size: var(--fs-12); color: var(--text-soft); }
  .stale { color: var(--status-warn); font-weight: var(--fw-bold); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .sum { font-size: var(--fs-12); padding: 2px 6px; border: 1px solid var(--line-rule); border-radius: var(--r-1); color: var(--text-soft); }
  .sum.up { color: var(--verdict-up); }
  .sum.down { color: var(--verdict-down); }
  .sum.warn { color: var(--status-warn); }
  .job-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-2); flex-wrap: wrap; }
  .time { font-size: var(--fs-12); color: var(--text-soft); }
  .acts { display: flex; gap: var(--sp-2); }
  .keep { display: flex; gap: var(--sp-2); align-items: center; padding: var(--sp-2) var(--sp-4); font-size: var(--fs-12); color: var(--text-soft); border-top: 1px solid var(--line-hairline); }
  .tray-foot { padding: var(--sp-2) var(--sp-4); font-size: var(--fs-12); color: var(--text-muted); border-top: 1px solid var(--line-hairline); }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
