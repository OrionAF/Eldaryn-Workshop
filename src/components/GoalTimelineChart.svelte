<script>
  /**
   * GoalTimelineChart.svelte - long-term progression charts built from run
   * HEADLINES (the forever-kept summary rows), so they keep working after
   * old runs compact. Hand-rolled SVG polylines - no chart libraries (the
   * app is dependency-free by policy).
   *
   * One mini-chart per metric with data: Mean DPS (sim runs), Tank Score /
   * PVP Score (optimizer bests by unit), Win rate (pvp duel batches).
   */
  import { formatFlat } from '../lib/format.js';

  let { entries = [] } = $props();

  const fmtValue = (v, unit) => (unit === '%' ? `${v.toFixed(1)}%` : formatFlat(Math.round(v)));

  // [{ label, unit, points: [{ t: ms, v }] }] oldest-first, only metrics with >= 2 points.
  const series = $derived.by(() => {
    const buckets = [
      { label: 'Mean DPS', unit: '', pick: (e) => (e.kind === 'sim' ? e.headline.meanDps : undefined) },
      { label: 'Tank Score', unit: '', pick: (e) => (e.kind === 'opt' && e.headline.unit === 'Tank Score' ? e.headline.best : undefined) },
      { label: 'PVP Score', unit: '', pick: (e) => (e.kind === 'opt' && e.headline.unit === 'PVP Score' ? e.headline.best : undefined) },
      { label: 'Win rate', unit: '%', pick: (e) => (e.kind === 'pvp-sim' ? e.headline.winRate : undefined) },
    ];
    return buckets
      .map(({ label, unit, pick }) => {
        const points = entries
          .map((e) => ({ t: Date.parse(e.at), v: pick(e) }))
          .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v))
          .sort((a, b) => a.t - b.t);
        return { label, unit, points };
      })
      .filter((s) => s.points.length >= 2);
  });

  const W = 260;
  const H = 72;
  const PAD = 6;

  function path(points) {
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const vs = points.map((p) => p.v);
    const vMin = Math.min(...vs);
    const vMax = Math.max(...vs);
    const x = (t, i) => (t1 === t0 ? PAD + (i * (W - 2 * PAD)) / (points.length - 1) : PAD + ((t - t0) / (t1 - t0)) * (W - 2 * PAD));
    const y = (v) => (vMax === vMin ? H / 2 : H - PAD - ((v - vMin) / (vMax - vMin)) * (H - 2 * PAD));
    return points.map((p, i) => ({ x: x(p.t, i), y: y(p.v), v: p.v, t: p.t }));
  }

  const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
</script>

{#if series.length > 0}
  <div class="charts" data-testid="goal-timeline-charts">
    {#each series as s (s.label)}
      {@const pts = path(s.points)}
      <figure class="chart">
        <figcaption class="micro-label">{s.label} — {s.points.length} runs</figcaption>
        <svg viewBox="0 0 {W} {H}" role="img" aria-label="{s.label} over time" preserveAspectRatio="none">
          <polyline
            points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
            fill="none"
            stroke="var(--nav-simulations)"
            stroke-width="1.5"
          />
          {#each pts as p (p.t + '-' + p.x)}
            <circle cx={p.x} cy={p.y} r="2.4" fill="var(--nav-simulations-light)">
              <title>{fmtDate(p.t)}: {fmtValue(p.v, s.unit)}</title>
            </circle>
          {/each}
        </svg>
        <div class="chart-range mono">
          <span>{fmtDate(s.points[0].t)}</span>
          <span class="latest">{fmtValue(s.points[s.points.length - 1].v, s.unit)}</span>
          <span>{fmtDate(s.points[s.points.length - 1].t)}</span>
        </div>
      </figure>
    {/each}
  </div>
{:else}
  <p class="chart-empty">Progression charts appear once a metric has two or more runs to connect.</p>
{/if}

<style>
  .charts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--space-4);
  }
  .chart {
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  svg {
    width: 100%;
    height: 72px;
    display: block;
  }
  .chart-range {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-size: 11px;
    color: var(--color-muted);
  }
  .chart-range .latest {
    color: var(--nav-simulations-light);
    font-size: 13px;
  }
  .chart-empty {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
</style>
