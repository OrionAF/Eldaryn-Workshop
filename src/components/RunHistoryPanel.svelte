<script>
  /**
   * RunHistoryPanel.svelte - the Simulations Dashboard's statistics hub:
   * every auto-saved run (character.runHistory), filterable, with per-goal
   * progression charts (GoalTimelineChart), per-run detail breakdowns, and
   * combat timelines for traced duels (DuelTimeline).
   *
   * Rows past the per-kind detail limit render headline-only with a
   * "compact" badge (model.js compactRunHistory); pinned runs never
   * compact. Delete is a two-step ConfirmButton; notes persist per entry.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { formatFlat } from '../lib/format.js';
  import Chip from './Chip.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import GoalTimelineChart from './GoalTimelineChart.svelte';
  import DuelTimeline from './DuelTimeline.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const history = $derived(character.runHistory || []);

  const KIND_LABELS = {
    sim: 'Battle Sim',
    'sim-compare': 'Compare',
    opt: 'Optimizer',
    'pvp-sim': 'Duel',
    'pvp-opt': 'PVP Optimizer',
    'pvp-matrix': 'Matrix',
    'pvp-gauntlet': 'Gauntlet',
  };

  // --- Filters -------------------------------------------------------------
  let kindFilter = $state(null); // null = all
  let presetFilter = $state(''); // '' = all (matched by presetName - ids die with deleted presets)
  let dateFrom = $state('');
  let dateTo = $state('');

  const presetNames = $derived([...new Set(history.map((e) => e.presetName).filter(Boolean))]);
  const kindCounts = $derived.by(() => {
    const counts = {};
    for (const e of history) counts[e.kind] = (counts[e.kind] || 0) + 1;
    return counts;
  });

  const filtered = $derived(
    history.filter((e) => {
      if (kindFilter && e.kind !== kindFilter) return false;
      if (presetFilter && e.presetName !== presetFilter) return false;
      if (dateFrom && e.at < dateFrom) return false;
      if (dateTo && e.at > `${dateTo}T23:59:59.999Z`) return false;
      return true;
    })
  );

  let expandedId = $state(null);
  const toggle = (id) => (expandedId = expandedId === id ? null : id);

  function deleteEntry(entry) {
    if (expandedId === entry.id) expandedId = null;
    rosterStore.deleteRunEntry(entry.id);
    setStatus?.('Run deleted from history');
  }

  // --- Formatting ----------------------------------------------------------
  const fmtDamage = (n) => formatFlat(Math.round(n));
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  /** One compact mono line of the headline numbers, per kind. */
  function headlineLine(e) {
    const h = e.headline || {};
    switch (e.kind) {
      case 'sim':
        return h.meanDps != null ? `${fmtDamage(h.meanDps)} DPS · ${(h.iterations ?? 0).toLocaleString('en-US')} × ${h.durationSeconds ?? '?'}s` : '';
      case 'sim-compare':
        return h.deltaPct != null ? `${h.aName ?? 'A'} vs ${h.bName ?? 'B'} · ${h.deltaPct > 0 ? '+' : ''}${h.deltaPct.toFixed(2)}%` : '';
      case 'opt':
        return h.best != null ? `${fmtDamage(h.baseline ?? 0)} → ${fmtDamage(h.best)} ${h.unit ?? ''} (+${(h.improvementPct ?? 0).toFixed(2)}%)` : '';
      case 'pvp-sim':
        if (h.sample) return `sample fight vs ${h.opponentName ?? '?'}`;
        return h.winRate != null ? `${h.winRate.toFixed(1)}% win vs ${h.opponentName ?? '?'}` : '';
      case 'pvp-opt':
        return h.bestWinRate != null ? `${(h.baselineWinRate ?? 0).toFixed(1)}% → ${h.bestWinRate.toFixed(1)}% vs ${h.opponents ?? '?'}` : '';
      case 'pvp-matrix':
        return h.bestWinRate != null ? `${h.presetCount} × ${h.opponentCount} · best ${h.bestPresetName} ${h.bestWinRate.toFixed(1)}%` : '';
      case 'pvp-gauntlet':
        return h.bestWinRate != null ? `best ${h.bestWinRate.toFixed(1)}% overall${h.contradiction ? ' · ⚠ contradiction' : ''}` : '';
      default:
        return '';
    }
  }

  const histMax = (histogram) => Math.max(1, ...histogram.bins);
  const histBinLabel = (h, i) => {
    const width = (h.max - h.min) / h.bins.length;
    return `${fmtDamage(h.min + i * width)} – ${fmtDamage(h.min + (i + 1) * width)}: ${h.bins[i]} runs`;
  };

  /** Percentile strip positions as % of the [min,max] span. */
  const pctPos = (td, v) => (td.max === td.min ? 50 : ((v - td.min) / (td.max - td.min)) * 100);

  const damageRows = (byTag) => {
    const total = Object.values(byTag || {}).reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return Object.entries(byTag).map(([tag, mean]) => ({ tag, mean, pct: (mean / total) * 100 }));
  };
</script>

<section class="panel" data-testid="run-history">
  <h2 class="subheading">Simulation Statistics</h2>
  <p class="subline">
    Every finished run auto-saves here — {history.length} run{history.length === 1 ? '' : 's'} recorded.
    The newest {'≈'}50 per type keep their full breakdown; older runs keep their headline numbers
    forever (they still feed the charts below). Pin a run to keep its full detail permanently.
  </p>

  <GoalTimelineChart entries={filtered} />

  {#if history.length > 0}
    <div class="filters">
      <div class="chip-list" role="group" aria-label="Filter by run type">
        <Chip label="All ({history.length})" selected={kindFilter === null} onClick={() => (kindFilter = null)} size="compact" />
        {#each Object.keys(KIND_LABELS).filter((k) => kindCounts[k]) as k (k)}
          <Chip label="{KIND_LABELS[k]} ({kindCounts[k]})" selected={kindFilter === k} onClick={() => (kindFilter = kindFilter === k ? null : k)} size="compact" />
        {/each}
      </div>
      <div class="filter-controls">
        {#if presetNames.length > 1}
          <label class="filter-field">
            <span class="micro-label">Preset</span>
            <select bind:value={presetFilter}>
              <option value="">All presets</option>
              {#each presetNames as name (name)}
                <option value={name}>{name}</option>
              {/each}
            </select>
          </label>
        {/if}
        <label class="filter-field">
          <span class="micro-label">From</span>
          <input type="date" bind:value={dateFrom} />
        </label>
        <label class="filter-field">
          <span class="micro-label">To</span>
          <input type="date" bind:value={dateTo} />
        </label>
      </div>
    </div>
  {/if}

  {#if history.length === 0}
    <p class="empty">No runs yet — every Battle Simulation, comparison, optimizer search, duel, and matrix saves itself here the moment it finishes.</p>
  {:else if filtered.length === 0}
    <p class="empty">No runs match these filters.</p>
  {:else}
    <ul class="run-list">
      {#each filtered as e (e.id)}
        <li class="run" class:expanded={expandedId === e.id}>
          <button type="button" class="run-row" onclick={() => toggle(e.id)} aria-expanded={expandedId === e.id}>
            <span class="kind-badge" data-kind={e.kind}>{KIND_LABELS[e.kind] ?? e.kind}</span>
            <span class="run-name">
              {e.name}
              {#if e.pinned}<span class="pin-mark" title="Pinned — never compacts">★</span>{/if}
              {#if e.detail === null}<span class="compact-badge" title="Older run — full breakdown compacted, headline kept">compact</span>{/if}
            </span>
            <span class="headline mono">{headlineLine(e)}</span>
            <span class="run-date mono">{fmtDate(e.at)}</span>
          </button>

          {#if expandedId === e.id}
            <div class="run-detail" data-testid="run-detail">
              {#if e.notes}<p class="notes-display">{e.notes}</p>{/if}

              {#if e.detail === null}
                <p class="empty">This run was compacted — only its headline numbers remain. Pin runs you want to keep in full.</p>
              {:else if e.kind === 'sim'}
                <div class="tiles">
                  <div class="tile"><span class="micro-label">Mean DPS</span><span class="mono value dps">{fmtDamage(e.detail.meanDps)}</span></div>
                  <div class="tile"><span class="micro-label">Expected DPS</span><span class="mono value">{fmtDamage(e.detail.expectedDps)}</span></div>
                  <div class="tile"><span class="micro-label">Fights · Seed</span><span class="mono value">{(e.detail.iterations ?? 0).toLocaleString('en-US')} · {e.detail.seed}</span></div>
                </div>
                {#if e.detail.histogram?.bins?.length}
                  <div class="histogram" role="img" aria-label="Total damage distribution">
                    {#each e.detail.histogram.bins as count, i (i)}
                      <div class="hist-bin" title={histBinLabel(e.detail.histogram, i)}>
                        <div class="hist-bar" style="height: {(count / histMax(e.detail.histogram)) * 100}%"></div>
                      </div>
                    {/each}
                  </div>
                {/if}
                {#if e.detail.totalDamage}
                  {@const td = e.detail.totalDamage}
                  <div class="pct-strip-wrap">
                    <div class="pct-strip">
                      {#each [['p5', td.p5], ['p50', td.p50], ['p95', td.p95]] as [label, v] (label)}
                        <span class="pct-tick" style="left: {pctPos(td, v)}%" title="{label}: {fmtDamage(v)}"></span>
                      {/each}
                    </div>
                    <div class="pct-labels mono">
                      <span>min {fmtDamage(td.min)}</span>
                      <span>p50 {fmtDamage(td.p50)}</span>
                      <span>max {fmtDamage(td.max)}</span>
                    </div>
                  </div>
                {/if}
                {#if e.detail.damageByTag}
                  <div class="breakdown">
                    {#each damageRows(e.detail.damageByTag) as row (row.tag)}
                      <div class="breakdown-row">
                        <span class="breakdown-label">{row.tag}</span>
                        <div class="breakdown-bar"><div class="breakdown-fill" style="width: {row.pct}%"></div></div>
                        <span class="mono">{fmtDamage(row.mean)} · {row.pct.toFixed(1)}%</span>
                      </div>
                    {/each}
                  </div>
                {/if}
              {:else if e.kind === 'sim-compare'}
                <div class="tiles">
                  <div class="tile"><span class="micro-label">{e.detail.presetAName}</span><span class="mono value">{fmtDamage(e.detail.meanDpsA)} DPS</span></div>
                  <div class="tile"><span class="micro-label">{e.detail.presetBName}</span><span class="mono value">{fmtDamage(e.detail.meanDpsB)} DPS</span></div>
                  <div class="tile"><span class="micro-label">Delta</span><span class="mono value" class:dps={e.detail.deltaPct > 0}>{e.detail.deltaPct > 0 ? '+' : ''}{e.detail.deltaPct.toFixed(2)}% (± {e.detail.ciHalfWidthDps?.toFixed?.(2) ?? '?'})</span></div>
                </div>
              {:else if e.kind === 'opt'}
                <div class="tiles">
                  <div class="tile"><span class="micro-label">Baseline</span><span class="mono value">{fmtDamage(e.detail.baselineScore)} {e.detail.unit ?? ''}</span></div>
                  <div class="tile"><span class="micro-label">Best Found</span><span class="mono value dps">{fmtDamage(e.detail.bestScore)} {e.detail.unit ?? ''}</span></div>
                  <div class="tile"><span class="micro-label">Search</span><span class="mono value">{(e.detail.evals ?? 0).toLocaleString('en-US')} builds · {e.detail.elapsedMs}ms</span></div>
                </div>
                {#if e.detail.changes?.length}
                  <div class="changes">
                    <span class="micro-label">What it changed</span>
                    <ul>
                      {#each e.detail.changes as ch, i (i)}
                        <li class="mono">{ch.dimension}: {ch.from} → {ch.to}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              {:else if e.kind === 'pvp-sim'}
                {#if e.detail.traced}
                  <DuelTimeline
                    timeline={e.detail.timeline}
                    playerName={e.detail.presetName}
                    opponentName={e.detail.opponentName}
                    durationSeconds={e.detail.durationSeconds}
                  />
                  {#if e.detail.winner}<p class="mono winner-line">Winner: {e.detail.winner}</p>{/if}
                {:else}
                  <div class="tiles">
                    <div class="tile"><span class="micro-label">Win / Loss / Draw</span><span class="mono value">{e.detail.winRate?.toFixed(1)}% / {e.detail.lossRate?.toFixed(1)}% / {e.detail.drawRate?.toFixed(1)}%</span></div>
                    <div class="tile"><span class="micro-label">Kill Rate</span><span class="mono value">{e.detail.killRate?.toFixed(1)}%{e.detail.meanTimeToKill != null ? ` · ${e.detail.meanTimeToKill.toFixed(1)}s mean` : ''}</span></div>
                    <div class="tile"><span class="micro-label">Mean HP Left</span><span class="mono value">{e.detail.playerHpLeftPct?.toFixed(1)}%</span></div>
                  </div>
                {/if}
              {:else if e.kind === 'pvp-opt'}
                <div class="tiles">
                  <div class="tile"><span class="micro-label">Win Chance</span><span class="mono value">{e.detail.beforeWinRate?.toFixed(1)}% → <span class="dps">{e.detail.afterWinRate?.toFixed(1)}%</span></span></div>
                  <div class="tile"><span class="micro-label">Verified Over</span><span class="mono value">{(e.detail.verifyIterations ?? 0).toLocaleString('en-US')} duels each</span></div>
                </div>
                {#if e.detail.perOpponent?.length > 1}
                  <div class="changes">
                    <span class="micro-label">Per opponent</span>
                    <ul>
                      {#each e.detail.perOpponent as v (v.name)}
                        <li class="mono">{v.name}: {v.before.toFixed(1)}% → {v.after.toFixed(1)}%</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
                {#if e.detail.changes?.length}
                  <div class="changes">
                    <span class="micro-label">What it changed</span>
                    <ul>
                      {#each e.detail.changes as ch, i (i)}
                        <li class="mono">{ch.dimension}: {ch.from} → {ch.to}</li>
                      {/each}
                    </ul>
                  </div>
                {/if}
              {:else if e.kind === 'pvp-matrix'}
                <div class="matrix-mini-wrap">
                  <table class="matrix-mini mono">
                    <thead>
                      <tr>
                        <th></th>
                        {#each e.detail.opponentNames ?? [] as name (name)}<th>{name}</th>{/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each e.detail.rows ?? [] as row (row.presetName)}
                        <tr>
                          <th>{row.presetName}</th>
                          {#each row.cells as cell, i (i)}
                            <td class:good={cell && cell.winRate >= 55} class:bad={cell && cell.winRate <= 45}>
                              {cell ? `${cell.winRate.toFixed(0)}%` : '—'}
                            </td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {:else if e.kind === 'pvp-gauntlet'}
                {#if e.detail.contradiction?.flagged}
                  <p class="contradiction-note">⚠ {e.detail.contradiction.message}</p>
                {/if}
                <div class="matrix-mini-wrap">
                  <table class="matrix-mini mono">
                    <thead>
                      <tr>
                        <th>Build</th>
                        <th>Overall</th>
                        {#each e.detail.finalists?.[0]?.perArchetype ?? [] as a (a.archetypeId)}<th>{a.name}</th>{/each}
                      </tr>
                    </thead>
                    <tbody>
                      {#each e.detail.finalists ?? [] as f (f.label)}
                        <tr>
                          <th>{f.label}</th>
                          <td class:good={f.overallWinRate >= 55} class:bad={f.overallWinRate <= 45}>{f.overallWinRate.toFixed(0)}%</td>
                          {#each f.perArchetype as a (a.archetypeId)}
                            <td class:good={a.winRate >= 55} class:bad={a.winRate <= 45}>{a.winRate.toFixed(0)}%</td>
                          {/each}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}

              {#if e.detail?.config?.length}
                <details class="config">
                  <summary class="micro-label">Build configuration as run</summary>
                  <ul>
                    {#each e.detail.config as line (line.label)}
                      <li><span class="config-label">{line.label}</span><span class="mono">{line.value}</span></li>
                    {/each}
                  </ul>
                </details>
              {/if}

              <div class="entry-actions">
                <button type="button" class="btn-ghost" onclick={() => rosterStore.toggleRunEntryPinned(e.id)} data-testid="pin-run">
                  {e.pinned ? 'Unpin' : 'Pin — keep full detail'}
                </button>
                <ConfirmButton label="Delete" confirmLabel="Confirm delete" onConfirm={() => deleteEntry(e)} class="btn-danger" />
              </div>
              <textarea
                class="notes"
                placeholder="Notes for this run…"
                value={e.notes}
                onblur={(ev) => rosterStore.setRunEntryNotes(e.id, ev.target.value)}
              ></textarea>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .empty {
    color: var(--color-muted);
    font-size: 12px;
  }
  .filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-4) 0;
  }
  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .filter-controls {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .filter-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .run-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .run {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
  }
  .run.expanded {
    border-color: var(--nav-simulations);
  }
  .run-row {
    appearance: none;
    background: none;
    border: none;
    color: inherit;
    font: inherit;
    width: 100%;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) auto auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-2) var(--space-3);
    text-align: left;
    cursor: pointer;
  }
  .kind-badge {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--nav-simulations-light);
    background: var(--nav-simulations-tint);
    border-radius: 4px;
    padding: 2px 6px;
    text-align: center;
    white-space: nowrap;
  }
  .kind-badge[data-kind='pvp-sim'],
  .kind-badge[data-kind='pvp-opt'],
  .kind-badge[data-kind='pvp-matrix'] {
    color: var(--nav-pvp-light);
    background: var(--nav-pvp-tint);
  }
  .run-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .pin-mark {
    color: var(--color-gold, #d9a94b);
    margin-left: var(--space-1);
  }
  .compact-badge {
    font-size: 10px;
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 1px 4px;
    margin-left: var(--space-2);
  }
  .headline {
    font-size: 12px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .run-date {
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .run-detail {
    border-top: 1px solid var(--color-border);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .notes-display {
    font-size: 12px;
    color: var(--color-muted);
    font-style: italic;
    margin: 0;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--space-3);
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: var(--space-2) var(--space-3);
  }
  .tile .value {
    font-size: 14px;
  }
  .histogram {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 64px;
  }
  .hist-bin {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .hist-bar {
    width: 100%;
    background: var(--nav-simulations-tint);
    border-top: 2px solid var(--nav-simulations);
    min-height: 1px;
  }
  .pct-strip-wrap {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .pct-strip {
    position: relative;
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(to right, var(--nav-simulations-tint), var(--nav-simulations));
  }
  .pct-tick {
    position: absolute;
    top: -2px;
    width: 2px;
    height: 12px;
    background: var(--color-text, #e8e4da);
  }
  .pct-labels {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--color-muted);
  }
  .breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .breakdown-row {
    display: grid;
    grid-template-columns: minmax(80px, 140px) minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
    font-size: 12px;
  }
  .breakdown-bar {
    height: 6px;
    border-radius: 3px;
    background: var(--color-border);
    overflow: hidden;
  }
  .breakdown-fill {
    height: 100%;
    background: var(--nav-simulations);
  }
  .changes ul,
  .config ul {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-4);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .config li {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    list-style: none;
  }
  .config-label {
    color: var(--color-muted);
  }
  .contradiction-note {
    font-size: 12px;
    color: var(--color-downgrade, #c1594f);
    margin: 0 0 var(--space-2);
  }
  .matrix-mini-wrap {
    overflow-x: auto;
  }
  .matrix-mini {
    border-collapse: collapse;
    font-size: 11px;
  }
  .matrix-mini th,
  .matrix-mini td {
    border: 1px solid var(--color-border);
    padding: 2px 8px;
    text-align: right;
  }
  .matrix-mini td.good {
    color: var(--color-hps, #58d68d);
  }
  .matrix-mini td.bad {
    color: var(--color-danger, #c1594f);
  }
  .winner-line {
    font-size: 12px;
    margin: 0;
  }
  .entry-actions {
    display: flex;
    gap: var(--space-3);
    align-items: center;
  }
  .notes {
    min-height: 44px;
    resize: vertical;
    font-size: 12px;
  }
  @media (max-width: 700px) {
    .run-row {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .kind-badge {
      order: -1;
    }
    .headline {
      grid-column: 1 / -1;
      white-space: normal;
    }
  }
</style>
