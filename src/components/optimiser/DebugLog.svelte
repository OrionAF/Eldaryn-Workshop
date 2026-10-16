<script>
  /**
   * DebugLog.svelte - an Optimiser run's debug log in its Details (simulation.md §Debug log; design-system
   * §4.39): where the fights and the compute time went, per phase and per search block, the slowest builds,
   * and the full log as a JSONL download while the session holds it.
   *
   * debug: the result's (or a saved run's) light log: {level, summary, slowest?}. getLog: () => the full
   * log or null (jobs.svelte.js jobDebugLog); without one there is no download. fileName: the download's name.
   */
  import Panel from '../ui/Panel.svelte';
  import Button from '../ui/Button.svelte';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import { fmtDuration } from '../../lib/ui/optimiserView.js';
  import { debugLogLines } from '../../lib/search/debugLog.js';

  let { debug, getLog = null, fileName = 'optimiser-log.jsonl' } = $props();

  const summary = $derived(debug?.summary ?? debug);
  const totals = $derived(summary?.totals ?? {});
  const PHASE_LABEL = {
    screen: 'Screen', search: 'Search', minimise: 'Minimise', confirm: 'Confirm', attribute: 'Attribute',
    'push-climb': 'Push: climb', 'push-screen': 'Push: screen', 'push-confirm': 'Push: confirm',
  };
  const LEVEL_TEXT = { builds: 'Builds', fights: 'Builds and fights' };
  const ms = (v) => (!Number.isFinite(v) ? '-' : v < 1000 ? `${Math.round(v)} ms` : fmtDuration(v));
  const share = (v) => (totals.cpuMs > 0 ? `${((100 * v) / totals.cpuMs).toFixed(1)}%` : '-');
  const where = (b) => [b.rung, PHASE_LABEL[b.phase] ?? b.phase, b.block, b.pass ? `pass ${b.pass}` : null].filter(Boolean).join(' · ');
  const groups = $derived([
    { id: 'phases', title: 'By phase', rows: summary?.phases ?? [], label: (g) => PHASE_LABEL[g.id] ?? g.id },
    { id: 'blocks', title: 'By search block', rows: summary?.blocks ?? [], label: (g) => g.id },
  ].filter((g) => g.rows.length));

  let saving = $state(false);
  function download() {
    const log = getLog?.();
    if (!log) return;
    saving = true;
    try {
      // the lines are joined in slices, so a log of millions of fights is never one string
      const parts = [];
      let slice = [];
      for (const line of debugLogLines(log)) {
        slice.push(line);
        if (slice.length === 10000) {
          parts.push(`${slice.join('\n')}\n`);
          slice = [];
        }
      }
      if (slice.length) parts.push(`${slice.join('\n')}\n`);
      const url = URL.createObjectURL(new Blob(parts, { type: 'application/x-ndjson' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      saving = false;
    }
  }
</script>

{#if summary}
  <Panel title="Debug log" scope="tool">
    {#snippet meta()}
      {#if getLog}
        <Button variant="secondary" size="small" loading={saving} busyLabel="Saving…" onclick={download} data-testid="debug-download">Download log</Button>
      {/if}
    {/snippet}
    <div class="debug" data-testid="debug-log">
      <p class="note">
        This shows where the run spent its time. {LEVEL_TEXT[summary.level] ?? summary.level}: <span class="num">{fmtCount(totals.builds)}</span> builds,
        <span class="num">{fmtCount(totals.fights)}</span> fights, <span class="num">{ms(totals.cpuMs)}</span> of computing in
        <span class="num">{ms(totals.wallMs)}</span> of real time.
        {#if !getLog}The full log is kept only until you close the app.{/if}
      </p>
      {#if totals.truncatedFights > 0 || totals.truncatedBuilds > 0}
        <p class="warn" role="status" data-testid="debug-truncated">
          The log is full: <span class="num">{fmtCount(totals.truncatedFights ?? 0)}</span> fight rows and
          <span class="num">{fmtCount(totals.truncatedBuilds ?? 0)}</span> build rows were not kept (the totals still count them).
        </p>
      {/if}

      {#each groups as g (g.id)}
        <table class="tbl" data-testid="debug-{g.id}">
          <caption>{g.title}</caption>
          <thead>
            <tr><th scope="col">{g.id === 'phases' ? 'Phase' : 'Block'}</th><th scope="col" class="r">Builds</th><th scope="col" class="r">Fights</th><th scope="col" class="r">Compute</th><th scope="col" class="r">Wall</th><th scope="col" class="r">Share</th></tr>
          </thead>
          <tbody>
            {#each g.rows as r (r.id)}
              <tr>
                <th scope="row">{g.label(r)}</th>
                <td class="r num">{fmtCount(r.builds)}</td>
                <td class="r num">{fmtCount(r.fights)}</td>
                <td class="r num">{ms(r.cpuMs)}</td>
                <td class="r num">{ms(r.wallMs)}</td>
                <td class="r num">{share(r.cpuMs)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/each}

      {#if debug?.slowest?.length}
        <table class="tbl" data-testid="debug-slowest">
          <caption>Slowest builds (by compute time)</caption>
          <thead>
            <tr><th scope="col">Where</th><th scope="col">Changes</th><th scope="col" class="r">Fights</th><th scope="col" class="r">Compute</th><th scope="col">Decision</th></tr>
          </thead>
          <tbody>
            {#each debug.slowest as b (b.id)}
              <tr>
                <td>{where(b)}</td>
                <td class="changes">{b.changes?.length ? b.changes.join('; ') : 'Current build'}</td>
                <td class="r num">{fmtCount(b.fights)}</td>
                <td class="r num">{ms(b.cpuMs)}</td>
                <td>{b.decision}{b.basis ? ` (${b.basis})` : ''}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {/if}
    </div>
  </Panel>
{/if}

<style>
  .debug { display: grid; gap: var(--sp-3); min-width: 0; overflow-x: auto; }
  .note { margin: 0; color: var(--text-soft); font-size: var(--fs-13); }
  .warn { margin: 0; color: var(--verdict-down); font-size: var(--fs-13); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .tbl { width: 100%; border-collapse: collapse; font-size: var(--fs-12); }
  .tbl caption { text-align: left; padding-bottom: var(--sp-1); color: var(--text-ink); font-size: var(--fs-13); font-weight: 600; }
  .tbl th, .tbl td { padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line-hairline); text-align: left; vertical-align: top; }
  .tbl thead th { color: var(--text-muted); font-weight: 600; }
  .tbl tbody th { font-weight: 400; color: var(--text-ink); }
  .tbl .r { text-align: right; white-space: nowrap; }
  .changes { overflow-wrap: anywhere; color: var(--text-soft); }
</style>
