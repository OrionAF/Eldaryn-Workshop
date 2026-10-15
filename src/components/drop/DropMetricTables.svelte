<script>
  /**
   * DropMetricTables.svelte - the single drop's simulated metrics as one forest table per metric
   * (design-system §4.15, mockup view 3): DPS in percent, survival and each PVP opponent's win rate in points.
   * A table's rows are its metric for every preset in every gear set, so Set 2 sits next to Set 1 on that
   * metric's own labelled axis. Colour comes from the verdict, never from the sign of the estimate.
   *
   * Props: cards (features/dropView.js setCards output).
   */
  import { forestDomain } from '../../lib/ui/forestScale.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import ForestAxis from '../ui/ForestAxis.svelte';
  import CIForest from '../ui/CIForest.svelte';
  import VerdictChip from '../ui/VerdictChip.svelte';
  import { metricTables, signedPct } from './dropFormat.js';

  let { cards } = $props();

  const tables = $derived(metricTables(cards).map((t) => ({ ...t, domain: forestDomain(t.rows) })));
  const num = (t, v) => (t.unit === 'pct' ? signedPct(v, 1) : `${v > 0 ? '+' : ''}${v.toFixed(1)} pts`);
  const sentence = (t, r) => `${r.label}: ${num(t, r.est)}, 95% interval ${num(t, r.lo)} to ${num(t, r.hi)}, N ${fmtCount(r.n)}`;
  const chipLabel = { better: 'Better', worse: 'Worse', equivalent: 'Within noise', unresolved: 'Too close to call' };
</script>

{#each tables as t (t.id)}
  <div class="tbl" role="table" aria-label="{t.title}: change, 95% intervals" data-metric-table={t.id}>
    <div class="trow thead" role="row">
      <span role="columnheader" class="cap-label">{t.title}</span>
      <div role="columnheader"><ForestAxis domain={t.domain} title={t.axisTitle} /></div>
      <span role="columnheader" class="cap-label right">Δ · 95% CI</span>
      <span role="columnheader" class="cap-label">Verdict</span>
    </div>
    {#each t.rows as r (r.key)}
      <div class="trow" role="row">
        <span role="cell" class="who">{r.label}</span>
        <div role="cell"><CIForest domain={t.domain} est={r.est} lo={r.lo} hi={r.hi} tone={r.tone} label={sentence(t, r)} /></div>
        <div role="cell" class="delta">
          <span class="v num {r.tone}">{num(t, r.est)}</span>
          <span class="ci num">[{num(t, r.lo)}, {num(t, r.hi)}] · N {fmtCount(r.n)}</span>
        </div>
        <span role="cell"><VerdictChip verdict={r.verdict} label={chipLabel[r.verdict] ?? chipLabel.unresolved} /></span>
      </div>
    {/each}
  </div>
{/each}

<style>
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .tbl { display: grid; min-width: 0; }
  .trow {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(0, 2fr) minmax(0, 1.2fr) minmax(0, 1fr);
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-2) 0;
    border-bottom: 1px solid var(--line-hairline);
    min-width: 0;
  }
  .trow.thead { align-items: end; border-bottom-color: var(--line-rule); }
  .right { text-align: right; }
  .who { font-size: var(--fs-13); color: var(--text-ink); overflow-wrap: anywhere; }
  .delta { display: grid; justify-items: end; font-size: var(--fs-12); }
  .delta .v { font-weight: var(--fw-bold); color: var(--text-ink); }
  .delta .v.up { color: var(--verdict-up); }
  .delta .v.down { color: var(--verdict-down); }
  .delta .ci { color: var(--text-soft); }
  @media (max-width: 700px) {
    .trow { grid-template-columns: minmax(0, 1fr); }
    .delta { justify-items: start; }
  }
</style>
