<script>
  /**
   * WinRateTable.svelte - win rate per seat with its 95% Wilson interval on ONE shared axis
   * (design-system §4.15, ia.md §3.4). The mark is the win rate minus 50 points, so the zero line is
   * "even". Colour comes from the verdict, never from the sign of the estimate.
   *
   * rows: [{id, label, summary: {p, lo, hi, n}}]; the first row is the headline row.
   */
  import { forestDomain } from '../../lib/ui/forestScale.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import { winRateVerdict } from '../../lib/features/duel.js';
  import CIForest from '../ui/CIForest.svelte';
  import ForestAxis from '../ui/ForestAxis.svelte';
  import VerdictChip from '../ui/VerdictChip.svelte';

  let { rows, partial = false } = $props();

  const pts = (x) => (x - 0.5) * 100;
  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const signed = (v) => (v > 0 ? `+${v.toFixed(1)}` : v < 0 ? `−${Math.abs(v).toFixed(1)}` : '0.0');
  const items = $derived(
    rows.map((r) => ({ ...r, v: winRateVerdict(r.summary), est: pts(r.summary.p), lo: pts(r.summary.lo), hi: pts(r.summary.hi) })),
  );
  const domain = $derived(forestDomain(items));
  const tone = (v) => (v?.verdict === 'better' ? 'up' : v?.verdict === 'worse' ? 'down' : 'side');
  const sentence = (r) =>
    `${r.label}: win rate ${pct(r.summary.p)}, likely between ${pct(r.summary.lo)} and ${pct(r.summary.hi)}, from ${fmtCount(r.summary.n)} fights.`;
</script>

<div class="ci-table" role="table" aria-label="Win rate by seat, with its likely range" data-testid="win-rate-table">
  <div class="ci-row head" role="row">
    <span class="micro" role="columnheader">Seat</span>
    <span class="micro" role="columnheader">Win rate · likely range</span>
    <div role="columnheader"><ForestAxis {domain} title="Points above or below 50%" format={(t) => (t > 0 ? `+${t}` : t < 0 ? `−${Math.abs(t)}` : '0')} /></div>
    <span class="micro r" role="columnheader">Against 50%</span>
    <span class="micro" role="columnheader">Verdict</span>
  </div>
  {#each items as r (r.id)}
    <div class="ci-row" role="row" data-testid="win-row-{r.id}">
      <span class="seat" role="cell">{r.label}</span>
      <div class="value" role="cell">
        <span class="v num" data-testid={r.id === items[0].id ? 'win-rate' : undefined}>{pct(r.summary.p)}</span>
        <span class="ci num" data-testid={r.id === items[0].id ? 'win-ci' : undefined}>likely {pct(r.summary.lo)} to {pct(r.summary.hi)} · {fmtCount(r.summary.n)} fights</span>
      </div>
      <div role="cell"><CIForest {domain} est={r.est} lo={r.lo} hi={r.hi} tone={tone(r.v)} label={sentence(r)} /></div>
      <span class="r num" role="cell">{signed(r.est)} points</span>
      <span role="cell">
        {#if partial}
          <VerdictChip verdict="unresolved" label="Not finished" />
        {:else}
          <VerdictChip verdict={r.v?.verdict ?? 'unresolved'} label={r.v?.verdict === 'better' ? 'Likely to win' : r.v?.verdict === 'worse' ? 'Likely to lose' : 'Too close to call'} />
        {/if}
      </span>
    </div>
  {/each}
</div>

<style>
  .ci-table { display: grid; gap: var(--sp-2); }
  .ci-row {
    display: grid;
    grid-template-columns: 90px minmax(150px, 1.1fr) minmax(160px, 2fr) 84px minmax(120px, 1fr);
    gap: var(--sp-3);
    align-items: center;
    padding: var(--sp-1) 0;
    border-bottom: 1px solid var(--line-hairline);
  }
  .ci-row.head { align-items: end; border-bottom: 1px solid var(--line-rule); }
  .micro { font-size: var(--fs-11); text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
  .r { text-align: right; }
  .seat { color: var(--text-soft); font-size: var(--fs-13); }
  .value { display: grid; gap: 2px; }
  .v { font-size: var(--fs-18); color: var(--text-ink); }
  .ci { font-size: var(--fs-12); color: var(--text-soft); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  @media (max-width: 700px) {
    .ci-row { grid-template-columns: 1fr 1fr; }
    .ci-row.head { display: none; }
  }
</style>
