<script>
  /**
   * RunCompare.svelte - two saved runs side by side (ia.md §5.17 "compare two runs"). Rows are what each
   * run measured; the values are only comparable when both answered the same question (same fight and
   * objective), and the panel says so when they did not. Nothing is re-simulated here.
   */
  import Banner from '../ui/Banner.svelte';
  import VerdictChip from '../ui/VerdictChip.svelte';
  import { fmtEstimate, fmtContrast, fmtContrastCi, fmtCount, verdictText } from '../../lib/ui/statsFormat.js';
  import { viewRun, changeText } from '../../lib/ui/optimiserView.js';

  let { a, b } = $props();

  const side = (run) => {
    const v = viewRun(run);
    const top = v?.rows?.[0] ?? null;
    return { run, v, top, unit: run.headline.unit || 'dps' };
  };
  const A = $derived(side(a));
  const B = $derived(side(b));
  const comparable = $derived(
    !!a.target?.key && a.target.key === b.target?.key && a.objective?.kind === b.objective?.kind && a.presetId === b.presetId,
  );
  const when = (iso) => (iso ? new Date(iso).toLocaleString() : '');
  const changesText = (s) => (s.top ? s.top.changes.map(changeText) : []);
</script>

<div class="compare" data-testid="run-compare">
  {#if !comparable}
    <Banner variant="info" lead="Different questions.">
      These runs used a different fight, objective or preset, so their values are not on one scale. Compare what changed, not the numbers.
    </Banner>
  {/if}
  <table>
    <thead><tr><th scope="col"></th><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr></thead>
    <tbody>
      <tr><th scope="row">When</th><td>{when(a.at)}</td><td>{when(b.at)}</td></tr>
      <tr><th scope="row">Preset</th><td>{a.presetName || 'n/a'}</td><td>{b.presetName || 'n/a'}</td></tr>
      <tr><th scope="row">Fight</th><td>{a.target?.label}</td><td>{b.target?.label}</td></tr>
      <tr><th scope="row">Maximise</th><td>{a.objective?.label}</td><td>{b.objective?.label}</td></tr>
      <tr><th scope="row">Precision</th><td class="num">{a.budget?.level ?? 'n/a'}{a.budget?.maxN ? `, up to N ${fmtCount(a.budget.maxN)}` : ''}, seed {a.seed}</td><td class="num">{b.budget?.level ?? 'n/a'}{b.budget?.maxN ? `, up to N ${fmtCount(b.budget.maxN)}` : ''}, seed {b.seed}</td></tr>
      <tr><th scope="row">Current build</th><td class="num">{A.v?.baseline ? fmtEstimate(A.unit, A.v.baseline.value) : 'detail compacted'}</td><td class="num">{B.v?.baseline ? fmtEstimate(B.unit, B.v.baseline.value) : 'detail compacted'}</td></tr>
      <tr><th scope="row">Best build</th><td class="num">{A.top ? fmtEstimate(A.unit, A.top.value) : 'none beat the current build'}</td><td class="num">{B.top ? fmtEstimate(B.unit, B.top.value) : 'none beat the current build'}</td></tr>
      <tr>
        <th scope="row">Best vs current</th>
        {#each [A, B] as s (s.run.id)}
          <td class="num">
            {#if s.top?.vsBaseline}
              {fmtContrast(s.unit, s.top.vsBaseline)} {fmtContrastCi(s.unit, s.top.vsBaseline)}
              <VerdictChip verdict={s.top.vsBaseline.verdict} />
              <span class="sub">{verdictText(s.top.vsBaseline)}</span>
            {:else}n/a{/if}
          </td>
        {/each}
      </tr>
      <tr>
        <th scope="row">Changes in the best build</th>
        {#each [A, B] as s (s.run.id)}
          <td>
            <ul>{#each changesText(s) as t (t)}<li>{t}</li>{:else}<li>none</li>{/each}</ul>
          </td>
        {/each}
      </tr>
    </tbody>
  </table>
</div>

<style>
  .compare { display: grid; gap: var(--sp-3); }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-13); color: var(--text-soft); }
  th, td { text-align: left; vertical-align: top; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--line-hairline); }
  thead th { color: var(--text-ink); }
  tbody th { color: var(--text-muted); font-weight: var(--fw-medium); white-space: nowrap; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .sub { font-size: var(--fs-12); color: var(--text-soft); }
  ul { margin: 0; padding-left: var(--sp-4); }
</style>
