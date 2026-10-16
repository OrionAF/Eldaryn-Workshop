<script>
  /**
   * SetupEstimate.svelte - the Optimiser setup's "Estimate" section (backlog §3): builds to try, fights to
   * simulate and time on this device, recomputed as the setup changes. Every figure is an estimate (decision
   * Q5): search/estimate.js computes it; what is exact and what is assumed is simulation.md §Estimates.
   * setup: the page's setup as plain data (presetId resolved, PVP opponents filtered); character: the live one;
   * history: saved runs of every character, which the estimate learns from (simulation.md §Estimates).
   */
  import { prefs } from '../../lib/prefs.svelte.js';
  import { staleReason, durationText } from '../../lib/calibration.js';
  import { estimateRun } from '../../lib/search/estimate.js';
  import { requestOf } from '../../lib/ui/optimiserSetup.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import ProvenanceTag from '../ui/ProvenanceTag.svelte';

  let { setup, character, history = [] } = $props();

  const cal = $derived(prefs.calibration);
  const est = $derived.by(() => {
    try {
      return estimateRun(requestOf(setup, character), { calibration: cal, history });
    } catch (e) {
      return { ok: false, reason: e?.message ?? String(e) };
    }
  });
  const stale = $derived(cal ? staleReason(cal, { profile: prefs.cpuProfile }) : null);
  const span = (lo, hi) => lo !== hi;
  const dur = (s) => (s < 60 ? 'under a minute' : durationText(s));
  const about = (s) => (s < 60 ? 'under a minute' : `about ${durationText(s)}`);
</script>

<section class="estimate" data-testid="setup-estimate">
  <h3>Estimate <ProvenanceTag kind="estimate" /></h3>
  {#if !est.ok}
    <p class="hint" data-testid="estimate-none">No estimate for this setup: {est.reason}</p>
  {:else}
    <dl class="figures">
      <div class="fig" data-testid="estimate-builds">
        <dt>Builds to try</dt>
        <dd>
          {#if est.builds.exact}
            <span class="num big">{fmtCount(est.builds.likely)}</span> <span class="sub">exactly, before builds equal in effect merge</span>
          {:else if span(est.builds.lo, est.builds.hi)}
            about <span class="num big">{fmtCount(est.builds.likely)}</span>
            <span class="sub">range <span class="num">{fmtCount(est.builds.lo)}</span> to <span class="num">{fmtCount(est.builds.hi)}</span></span>
          {:else}
            about <span class="num big">{fmtCount(est.builds.likely)}</span>
          {/if}
        </dd>
      </div>
      <div class="fig" data-testid="estimate-fights">
        <dt>Fights to simulate</dt>
        <dd>
          about <span class="num big">{fmtCount(est.fights.likely)}</span>
          <span class="sub">range <span class="num">{fmtCount(est.fights.lo)}</span> to <span class="num">{fmtCount(est.fights.hi)}</span></span>
        </dd>
      </div>
      <div class="fig" data-testid="estimate-time">
        <dt>Time on this device</dt>
        <dd>
          {#if est.time}
            <span class="num big">{about(est.time.likely)}</span>
            <span class="sub">range <span class="num">{dur(est.time.lo)}</span> to <span class="num">{dur(est.time.hi)}</span></span>
          {:else if est.timeReason === 'no-calibration'}
            <span class="sub">Needs a speed calibration. <a href="#/settings">Calibrate speed</a></span>
          {:else}
            <span class="sub">No calibrated fight is like this target's yet, so there is no time estimate.</span>
          {/if}
        </dd>
      </div>
    </dl>
    <p class="hint" data-testid="estimate-source">{est.source.text}</p>
    {#if est.time && est.time.source === 'calibration' && stale}
      <p class="hint">{stale === 'profile' ? 'The speed was measured under another CPU profile.' : 'The speed was measured on an older build.'}</p>
    {/if}
    {#if est.push}
      <p class="hint" data-testid="estimate-push">Push: this covers the build search at the start rung. The climb adds a search for each rung it optimises, so a Push run takes longer.</p>
    {/if}
    <details class="basis">
      <summary>How this is estimated</summary>
      <ul>
        <li>{est.source.kind === 'history'
          ? 'Fights per build, and for a local search the builds per start, come from past runs on this device. The range spans those runs with a margin.'
          : 'No run like this has finished on this device, so a table measured on a reference character stands in. Once a run like this finishes, the estimate uses it.'}</li>
        <li>Builds: {est.builds.basis}</li>
        <li>Fights: {est.fights.basis}</li>
        {#if est.time}<li>Time: {est.time.basis}</li>{/if}
        {#each est.assumptions as a (a)}<li>{a}</li>{/each}
      </ul>
    </details>
  {/if}
</section>

<style>
  .estimate { min-width: 0; display: grid; gap: var(--sp-3); }
  .estimate h3 { margin: 0; display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-14); color: var(--text-ink); }
  .figures { margin: 0; display: grid; gap: var(--sp-2); }
  .fig { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--sp-2); align-items: baseline; }
  dt { font-size: var(--fs-12); color: var(--text-muted); }
  dd { margin: 0; font-size: var(--fs-12); color: var(--text-soft); min-width: 0; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .big { font-size: var(--fs-14); }
  .sub { display: block; color: var(--text-muted); }
  .hint { margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis ul { margin: var(--sp-2) 0 0; padding-left: var(--sp-4); display: grid; gap: 4px; }
</style>
