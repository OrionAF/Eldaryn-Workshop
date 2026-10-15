<script>
  /**
   * VerdictCard.svelte - one per equipment set in Drop Check (adapted from the v1 loadout card).
   * Lists every preset that wears the set, each with its own verdict for the drop: the closed-form
   * auto-attack DPS change straight away, then (when the simulation has run) the paired sim DPS
   * change with its 95% interval, survival and PVP win rate. "Apply to set" writes the drop into the
   * set, so every preset on it changes; a mixed verdict asks for a second click first.
   *
   * Props: setKey, setLabel, rows (features/swap.js prepareSwap rows of this set), results
   * (presetId -> runSwapMetrics result), status ('idle'|'waiting'|'running'|'done'|'cancelled'|
   * 'error'), onApply(setKey).
   */
  import { verdictFor, aggregateVerdict, statDeltas, statKeyLabel } from '../../lib/features/swap.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import { VERDICT_LABEL, VERDICT_GLYPH, flat, signedFlat, signedPct, prob, signedPts, ciFlat, ciPts } from './dropFormat.js';

  let { setKey, setLabel, rows, results = {}, status = 'idle', onApply } = $props();

  const verdicts = $derived(rows.map((r) => verdictFor(r, results[r.presetId] ?? null)));
  const aggregate = $derived(aggregateVerdict(verdicts.map((v) => v.verdict)));
  const pending = $derived(status === 'waiting' || status === 'running');

  function simPct(sim, which) {
    const base = sim.before.mean;
    return base > 0 ? (which / base) * 100 : NaN;
  }
</script>

<div
  class="verdict-card"
  class:mixed={aggregate === 'mixed'}
  class:upgrade={aggregate === 'upgrade'}
  class:downgrade={aggregate === 'downgrade'}
  data-set={setKey}
  data-verdict={aggregate}
>
  <div class="card-header">
    <div class="title-group">
      <h3>{setLabel}</h3>
      <span class="preset-count">{rows.length} preset{rows.length === 1 ? '' : 's'}</span>
    </div>
    {#if aggregate === 'mixed'}
      <ConfirmButton
        class="apply-btn mixed"
        label={`Apply to ${setLabel}`}
        confirmLabel="Confirm mixed apply"
        prompt="This helps some presets and hurts others."
        onConfirm={() => onApply(setKey)}
      />
    {:else}
      <button type="button" class="apply-btn" class:clean-upgrade={aggregate === 'upgrade'} onclick={() => onApply(setKey)}>
        Apply to {setLabel}
      </button>
    {/if}
  </div>

  <ul class="rows">
    {#each rows as row, i (row.presetId)}
      {@const v = verdicts[i]}
      {@const res = results[row.presetId]}
      <li class={v.verdict} data-preset={row.presetId} data-verdict={v.verdict}>
        <div class="line head">
          <span class="glyph" aria-hidden="true">{VERDICT_GLYPH[v.verdict]}</span>
          <span class="preset-name">{row.name}</span>
          <span class="verdict-badge">{VERDICT_LABEL[v.verdict]}</span>
          <span class="basis">{row.method === 'anchored' ? (row.approx ? 'anchored on your sheet, approximate' : 'anchored on your sheet') : 'recomputed from gear'}</span>
        </div>
        <p class="coverage" data-coverage={v.coverage.join(',')}>
          {v.coverageLabel}{v.notJudged.length ? `. Not judged: ${v.notJudged.map(statKeyLabel).join(', ')}` : ''}{v.unresolved.length ? '. Too close to call at the largest run size.' : ''}
        </p>

        <div class="line metric-line">
          <span class="metric">Auto-attack DPS</span>
          <span class="values mono">
            {flat(row.closed.before)} → {flat(row.closed.after)}
            <span class="pct" class:up={row.closed.delta > 0} class:down={row.closed.delta < 0}>({signedPct(row.closed.pct, 2)})</span>
          </span>
        </div>

        {#if res?.sim}
          {@const d = res.sim.delta}
          <div class="line metric-line" data-metric="sim">
            <span class="metric">Sim DPS <span class="n">N={d.n}</span></span>
            <span class="values mono">
              {flat(res.sim.before.mean)} → {flat(res.sim.after.mean)}
              <span class="pct" class:up={d.lo > 0} class:down={d.hi < 0}>
                {signedFlat(d.delta)} ({signedPct(simPct(res.sim, d.delta), 2)})
              </span>
              <span class="ci">95% CI {ciFlat(d)}</span>
            </span>
          </div>
        {/if}

        {#if res?.survival}
          {@const d = res.survival.delta}
          <div class="line metric-line" data-metric="survival">
            <span class="metric">Survival <span class="n">N={d.n}</span></span>
            <span class="values mono">
              {prob(res.survival.before.mean)} → {prob(res.survival.after.mean)}
              <span class="pct" class:up={d.lo > 0} class:down={d.hi < 0}>{signedPts(d.delta)}</span>
              <span class="ci">95% CI {ciPts(d)}</span>
            </span>
          </div>
        {/if}

        {#each res?.pvp ?? [] as p (p.opponentId)}
          {@const d = p.delta}
          <div class="line metric-line" data-metric="pvp">
            <span class="metric">PVP vs {p.name} <span class="n">N={d.n}</span></span>
            <span class="values mono">
              {prob(p.before.mean)} → {prob(p.after.mean)}
              <span class="pct" class:up={d.lo > 0} class:down={d.hi < 0}>{signedPts(d.delta)}</span>
              <span class="ci">95% CI {ciPts(d)}</span>
            </span>
          </div>
        {/each}

        {#if pending && !res}
          <p class="pending-note">Simulating…</p>
        {/if}

        <details class="stat-changes">
          <summary>Stat changes</summary>
          {#each statDeltas(row.statsBefore, row.statsAfter) as s (s.key)}
            <div class="line metric-line">
              <span class="metric">{s.label}</span>
              <span class="values mono">
                {s.display.before} → {s.display.after}
                <span class="pct" class:up={s.delta > 0} class:down={s.delta < 0}>({s.delta > 0 ? '+' : ''}{s.display.delta})</span>
              </span>
            </div>
          {:else}
            <p class="pending-note">No stat changes.</p>
          {/each}
        </details>
      </li>
    {/each}
  </ul>

  {#if aggregate === 'mixed'}
    <p class="warning-strip">Mixed verdict: these presets share this set, so applying it helps some and hurts others.</p>
  {/if}
</div>

<style>
  .verdict-card {
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 11px 14px;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .title-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .verdict-card h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-ink);
  }
  .preset-count {
    font-size: 10px;
    color: var(--color-muted);
  }
  .verdict-card.upgrade {
    border-color: var(--color-upgrade-border);
    background: linear-gradient(180deg, var(--color-upgrade-soft), transparent);
  }
  .verdict-card.downgrade {
    border-color: var(--color-downgrade-border);
    background: linear-gradient(180deg, var(--color-downgrade-soft), transparent);
  }
  .verdict-card.mixed {
    border-color: var(--color-warning);
    background: linear-gradient(180deg, var(--color-warning-soft), transparent);
  }
  .rows {
    list-style: none;
    margin: 0 0 var(--space-2);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .rows li {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 12px;
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex-wrap: wrap;
  }
  .line.head {
    gap: 8px;
  }
  .glyph {
    width: 1em;
    text-align: center;
  }
  .rows li.upgrade .glyph,
  .rows li.upgrade .preset-name,
  .rows li.upgrade .verdict-badge {
    color: var(--color-upgrade);
  }
  .rows li.downgrade .glyph,
  .rows li.downgrade .preset-name,
  .rows li.downgrade .verdict-badge {
    color: var(--color-downgrade);
  }
  .rows li.mixed .glyph,
  .rows li.mixed .preset-name,
  .rows li.mixed .verdict-badge {
    color: var(--color-warning);
  }
  .preset-name {
    font-family: var(--font-heading);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .verdict-badge {
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .coverage {
    margin: 0;
    font-size: 10.5px;
    color: var(--color-muted);
  }
  .basis {
    margin-left: auto;
    font-size: 10px;
    color: var(--color-dim);
  }
  .metric-line {
    justify-content: space-between;
    font-size: 11px;
    color: var(--color-muted);
  }
  .values {
    text-align: right;
  }
  .metric .n {
    color: var(--color-dim);
    margin-left: 4px;
  }
  .ci {
    color: var(--color-dim);
    margin-left: 6px;
  }
  .pct {
    font-weight: 600;
  }
  .pct.up {
    color: var(--color-upgrade);
  }
  .pct.down {
    color: var(--color-downgrade);
  }
  .pending-note {
    margin: 0;
    font-size: 11px;
    color: var(--color-muted);
    font-style: italic;
  }
  .stat-changes {
    margin-top: 2px;
  }
  .stat-changes summary {
    cursor: pointer;
    font-size: 10.5px;
    color: var(--color-muted);
  }
  .warning-strip {
    font-size: 11px;
    color: var(--color-warning);
    margin: 0 0 var(--space-2);
  }
  .apply-btn {
    width: auto;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
    background: none;
    border: 1px solid var(--color-border-strong);
    color: var(--color-muted);
  }
  .apply-btn.clean-upgrade {
    background: var(--color-upgrade-soft);
    border-color: var(--color-upgrade);
    color: var(--color-upgrade);
  }
  :global(.apply-btn.mixed) {
    width: auto;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
    background: var(--color-warning-soft);
    border: 1px solid var(--color-warning);
    color: var(--color-warning);
  }
  @media (max-width: 700px) {
    .apply-btn {
      min-height: 44px;
    }
    .metric-line {
      flex-direction: column;
      align-items: flex-start;
      gap: 0;
    }
    .values {
      text-align: left;
    }
  }
</style>
