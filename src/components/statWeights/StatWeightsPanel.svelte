<script>
  /**
   * StatWeightsPanel.svelte - backlog §9: what one game-sized step of each stat is worth to this preset,
   * simulated (simulation.md §Stat weights). Two forest tables, one per metric (design-system §4.15):
   * DPS on the training dummy and survival against the reference enemy. A bar whose interval spans 0
   * reads "No clear effect" and has no rank. The run is a job (jobs.svelte.js); the result is read
   * off the job, never copied.
   *
   * Props: character, preset, realm ('base' | 'oblivion').
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { startJob, cancelJob, resumeJob, isStale, jobSignature, jobsStore } from '../../lib/jobs.svelte.js';
  import { statWeightsRequest, statWeightsInputs, STAT_WEIGHT_PRECISION } from '../../lib/features/statWeights.js';
  import { forestDomain } from '../../lib/ui/forestScale.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import { formatFlat } from '../../lib/format.js';
  import Panel from '../ui/Panel.svelte';
  import Banner from '../ui/Banner.svelte';
  import Button from '../ui/Button.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import ForestAxis from '../ui/ForestAxis.svelte';
  import CIForest from '../ui/CIForest.svelte';
  import { weightRows, chartFormat, rowSentence } from './statWeightsView.js';

  let { character, preset, realm = 'base' } = $props();

  let precision = $state('standard');

  const job = $derived(
    [...jobsStore.list].reverse().find((j) => j.tool === 'stat-weights' && j.request?.characterId === character.id
      && j.request?.presetId === preset.id && j.request?.realm === realm) ?? null,
  );
  const running = $derived(job?.status === 'running' || job?.status === 'queued');
  const stale = $derived(!!job && !running && isStale(job));
  const result = $derived(job?.result ?? null);

  const TITLES = {
    damage: { title: 'Damage', axis: 'Change in average DPS vs this preset (%)' },
    survival: { title: 'Survival', axis: 'Change in chance to survive (points)' },
  };
  const charts = $derived(
    ['damage', 'survival']
      .filter((k) => result?.[k])
      .map((k) => {
        const rows = weightRows(k, result[k].bars);
        return { kind: k, ...TITLES[k], chart: result[k], rows, domain: forestDomain(rows) };
      }),
  );

  function signatureFor(ch, req) {
    return jobSignature({ characterKey: ch.id, presetId: req.presetId, inputs: statWeightsInputs(req) });
  }

  function run() {
    if (running) return;
    const request = { ...statWeightsRequest(character, preset.id, { precision, realm }), characterId: character.id };
    const chId = character.id;
    const pId = preset.id;
    const p = precision;
    const r = realm;
    startJob({
      tool: 'stat-weights',
      title: 'Stat weights',
      context: preset.name,
      request,
      signature: signatureFor(character, request),
      currentSignature: () => {
        const ch = rosterStore.current;
        return ch?.id === chId && ch.presets.some((x) => x.id === pId) ? signatureFor(ch, statWeightsRequest(ch, pId, { precision: p, realm: r })) : '';
      },
      openRoute: 'builds/sheet',
      notice: 'Stat weights started',
      summarize: (res) => {
        const top = res?.damage?.bars?.find((b) => b.rank === 1);
        return [{ tone: top ? 'up' : 'warn', text: top ? `Top damage stat: ${top.label}` : 'No stat clearly helps damage' }];
      },
    });
  }

  const pctDone = (pr) => (pr?.total ? Math.round((pr.done / pr.total) * 100) : 0);
</script>

<Panel title="Stat weights" scope={realm === 'oblivion' ? 'oblivion' : 'preset'} {stale}>
  {#snippet meta()}
    <span class="sub">Simulated, this preset only</span>
  {/snippet}

  <p class="note">
    Shows what one more step of each stat is worth to this preset. Damage is tested against the training dummy.
    Survival is tested against the reference enemy, a dummy that hits back, set so this preset survives about half the time.
  </p>
  <details class="basis">
    <summary>How this works</summary>
    <p>Each stat gets one step added to the raw total, then the game's soft cap is applied. The change is measured in the client's fight, on the same random draws as the preset itself.</p>
  </details>
  <div class="setup">
    <SegmentedControl
      label="Effort" bind:value={precision}
      options={Object.entries(STAT_WEIGHT_PRECISION).map(([value, n]) => ({ value, label: value[0].toUpperCase() + value.slice(1), sub: `${fmtCount(n.nDps)} / ${fmtCount(n.nSurvival)} fights` }))}
    />
    <Button variant="primary" disabled={running} loading={running} busyLabel="Simulating…" onclick={run} data-testid="stat-weights-run">Simulate stat weights</Button>
    {#if running}
      <Button variant="ghost" onclick={() => cancelJob(job.id)}>Cancel</Button>
      {#if job?.progress?.total}<span class="num muted" data-testid="stat-weights-progress">{pctDone(job.progress)}% of {fmtCount(job.progress.total)} fights</span>{/if}
    {/if}
  </div>

  {#if job?.status === 'failed'}<Banner variant="error" lead="Run failed">{job.error}</Banner>{/if}
  {#if stale}<Banner variant="warn" lead="Out of date">The preset changed since these weights were simulated. Run it again.</Banner>{/if}
  {#if job?.status === 'cancelled'}
    <Banner variant="info" lead="Cancelled">
      Showing the stats finished so far.
      {#snippet action()}<Button variant="ghost" size="small" onclick={() => resumeJob(job.id)}>Resume</Button>{/snippet}
    </Banner>
  {/if}
  {#if result?.calibration && !result.calibration.inBand}
    <Banner variant="warn" lead="Survival barely measurable.">
      The reference enemy could not be set to an even fight for this preset (closest: you survive
      <span class="num">{Math.round(result.calibration.p * 100)}%</span> at Attack <span class="num">{formatFlat(result.calibration.attack)}</span>),
      so most survival steps show no clear effect.
    </Banner>
  {/if}

  {#each charts as c (c.kind)}
    {@const f = chartFormat(c.kind)}
    <div class="chart" data-chart={c.kind}>
      <h3 class="subheading">{c.title}</h3>
      <p class="caption" data-testid="chart-label-{c.kind}">
        {c.chart.label}. Simulated, not a game value; base
        {#if c.kind === 'damage'}<span class="num">{formatFlat(Math.round(c.chart.base.mean))}</span> DPS{:else}<span class="num">{Math.round(c.chart.base.mean * 100)}%</span>{/if}
        over <span class="num">{fmtCount(c.chart.n)}</span> fights per stat.
      </p>
      <div class="tbl" role="table" aria-label="{c.title} stat weights, with likely ranges">
        <div class="trow thead" role="row">
          <span role="columnheader" class="cap-label">Stat · step</span>
          <div role="columnheader"><ForestAxis domain={c.domain} title={c.axis} format={(t) => String(Number(t.toFixed(3)))} /></div>
          <span role="columnheader" class="cap-label right">Change · likely range</span>
          <span role="columnheader" class="cap-label">Rank</span>
        </div>
        {#each c.rows as r (r.key)}
          <div class="trow" role="row" data-stat={r.key}>
            <span role="cell" class="who">{r.label} <span class="unit num">{r.unit}</span></span>
            <div role="cell"><CIForest domain={c.domain} est={r.est} lo={r.lo} hi={r.hi} tone={r.tone} label={rowSentence(c.kind, r)} /></div>
            <div role="cell" class="delta">
              <span class="v num {r.tone}">{f(r.est)}</span>
              <span class="ci num">[{f(r.lo)}, {f(r.hi)}]{#if r.abs != null} · {r.abs >= 0 ? '+' : '−'}{formatFlat(Math.round(Math.abs(r.abs)))} DPS{/if}</span>
            </div>
            <span role="cell" class="rank" data-testid="rank">
              {#if r.measurable}<span class="num">#{r.rank}</span>{:else}<span class="muted">No clear effect</span>{/if}
            </span>
          </div>
        {/each}
      </div>
    </div>
  {/each}
  {#if charts.length}
    <p class="caption">
      A stat whose likely range includes 0 has no clear effect at this effort and gets no rank.
    </p>
    <details class="basis">
      <summary>How this works</summary>
      <p>The ranges are simultaneous 95% intervals over each chart's stats (Bonferroni).</p>
    </details>
  {/if}
</Panel>

<style>
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--brass-400); }
  .basis p { margin: var(--sp-2) 0 0; }
  .note, .caption { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .sub { font-size: var(--fs-12); color: var(--text-soft); }
  .setup { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-end; margin: var(--sp-3) 0; }
  .muted { color: var(--text-muted); font-size: var(--fs-12); }
  .chart { display: grid; gap: var(--sp-2); margin-top: var(--sp-4); min-width: 0; }
  .chart h3 { margin: 0; }
  .tbl { display: grid; min-width: 0; }
  .trow {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 0.9fr);
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--line-hairline);
    min-width: 0;
  }
  .trow.thead { align-items: end; border-bottom-color: var(--line-rule); }
  .right { text-align: right; }
  .who { font-size: var(--fs-13); color: var(--text-ink); overflow-wrap: anywhere; }
  .unit { color: var(--text-soft); font-size: var(--fs-12); }
  .delta { display: grid; justify-items: end; font-size: var(--fs-12); }
  .delta .v { font-weight: var(--fw-bold); color: var(--text-ink); }
  .delta .v.up { color: var(--verdict-up); }
  .delta .v.down { color: var(--verdict-down); }
  .delta .ci { color: var(--text-soft); }
  .rank { font-size: var(--fs-12); }
  @media (max-width: 700px) {
    .trow { grid-template-columns: minmax(0, 1fr); }
    .delta { justify-items: start; }
  }
</style>
