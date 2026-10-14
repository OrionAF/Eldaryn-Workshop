<script>
  /**
   * ResultList.svelte - the top-N builds of an optimiser run (F2b, adapted from SimulatedPresetCard).
   * Every simulated number carries its N and 95% interval (rebuild-plan §5 fidelity labels). A row shows the
   * paired difference vs the current preset and the lines that differ; Apply writes it to the preset.
   * `onApply` is null for a saved run whose preset may have moved on (then the button is hidden).
   */
  import { fmtValue, fmtWithCi, fmtDelta, fmtDeltaCi } from './format.js';

  let { unit, baseline = null, results = [], onApply = null, applying = false } = $props();

  let open = $state({});
  const toggle = (key) => (open = { ...open, [key]: !open[key] });
  const rows = $derived(results);
  // A PVP win rate pools several matchups; the entry says how many duels each one had (F5).
  const nSplit = (e) => (e?.matchups?.length > 1 ? ` (${e.perMatchupN} x ${e.matchups.length})` : '');
  const nTitle = (e) => (e?.matchups ? 'Duels simulated for this number: N per matchup x matchups' : 'Fights simulated for this number');
</script>

<div class="results" data-testid="optimiser-results">
  {#if baseline}
    <div class="row baseline" data-testid="baseline-row">
      <span class="micro-label">Current preset</span>
      <span class="value mono">{fmtWithCi(unit, baseline)}</span>
      <span class="n mono" title={nTitle(baseline)}>N={baseline.n ?? 0}{nSplit(baseline)}</span>
    </div>
  {/if}

  {#each rows as e (e.key)}
    <div class="row" class:is-baseline={e.isBaseline} data-testid="result-row">
      <div class="head">
        <span class="rank mono">#{e.rank}</span>
        <span class="value mono">{fmtWithCi(unit, e)}</span>
        <span class="n mono" title={nTitle(e)}>N={e.n ?? 0}{nSplit(e)}</span>
        {#if e.isBaseline}
          <span class="tag">current preset</span>
        {:else if e.vsBaseline}
          <span class="delta mono" class:good={e.vsBaseline.significant && e.vsBaseline.delta > 0} class:bad={e.vsBaseline.significant && e.vsBaseline.delta < 0}>
            {fmtDelta(unit, e.vsBaseline)} vs current
          </span>
          <span class="ci mono">{fmtDeltaCi(unit, e.vsBaseline)}</span>
          <span class="tag">{e.vsBaseline.significant ? 'significant' : 'within noise'}</span>
        {/if}
        <span class="spacer"></span>
        {#if onApply && !e.isBaseline}
          <button type="button" class="btn-gold" disabled={applying} onclick={() => onApply(e)}>Apply to preset</button>
        {/if}
      </div>

      {#if !e.isBaseline}
        {#if e.changes?.length}
          <ul class="changes">
            {#each e.changes as c (c.label)}
              <li><span class="label">{c.label}</span> <span class="from">{c.from || 'none'}</span> to <span class="to">{c.to || 'none'}</span></li>
            {/each}
          </ul>
        {:else}
          <p class="hint">No differences from the current preset.</p>
        {/if}
      {/if}

      {#if e.matchups?.length}
        <ul class="matchups" data-testid="matchups">
          {#each e.matchups as m (m.opponentId + m.seat)}
            <li class="mono">
              <span class="who">{m.name}, {m.seat === 'attacker' ? 'I attack' : 'I defend'}</span>
              {fmtWithCi(unit, { value: m.p, lo: m.lo, hi: m.hi })} <span class="n">N={m.n}</span>
            </li>
          {/each}
        </ul>
      {/if}

      {#if e.lines?.length}
        <button type="button" class="btn-ghost small" onclick={() => toggle(e.key)}>{open[e.key] ? 'Hide' : 'Show'} full build</button>
        {#if open[e.key]}
          <dl class="lines">
            {#each e.lines as l (l.label)}
              <dt class="micro-label">{l.label}</dt><dd>{l.value}</dd>
            {/each}
          </dl>
        {/if}
      {/if}
    </div>
  {:else}
    <p class="hint">No results.</p>
  {/each}
</div>

<style>
  .results { display: flex; flex-direction: column; gap: var(--space-2); }
  .row { border: 1px solid var(--color-border); border-radius: var(--radius-panel); padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; background: var(--color-panel); }
  .row.baseline { flex-direction: row; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .row.is-baseline { border-color: var(--color-gold); }
  .head { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .spacer { flex: 1; }
  .value { font-size: 15px; color: var(--color-text); }
  .rank, .n, .ci { color: var(--color-muted); font-size: 12px; }
  .delta { font-size: 13px; }
  .delta.good { color: var(--color-success, #6bd18a); }
  .delta.bad { color: var(--color-warning); }
  .tag { font-size: 11px; color: var(--color-soft); border: 1px solid var(--color-border); border-radius: var(--radius-chip); padding: 1px 6px; }
  .changes { margin: 0; padding-left: 16px; font-size: 12px; color: var(--color-soft); }
  .changes .from { color: var(--color-muted); }
  .changes .to { color: var(--color-text); }
  .matchups { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: 12px; color: var(--color-soft); }
  .matchups .who { font-family: var(--font-body, inherit); margin-right: var(--space-2); }
  .lines { display: grid; grid-template-columns: max-content 1fr; gap: 2px var(--space-3); margin: 0; font-size: 12px; }
  .lines dd { margin: 0; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
  .small { align-self: flex-start; font-size: 12px; }
</style>
