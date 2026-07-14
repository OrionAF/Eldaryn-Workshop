<script>
  /**
   * SavedResultsRail.svelte - the persisted "Saved Results" rail shared by
   * the Simulation and PVP screens.
   *
   * Renders character.savedResults filtered to the `kinds` this screen owns
   * ('sim'/'opt'/'sim-compare' on Simulation, 'pvp-sim'/'pvp-opt' on PVP).
   * The rail knows how to render every kind's summary payload itself, so both
   * screens share one implementation of expand, rename, notes, pin, export,
   * compare and two-click delete. Saving is still each screen's job (the
   * summary shape is run-specific); re-running is delegated back through
   * `onRerun` because only the screen can drive its own controls.
   *
   * Summaries are display-ready plain data by contract (model.js
   * newSavedResult) - nothing here resolves against live build state.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { rateCiHalfWidth } from '../lib/pvpSimulation.js';
  import { formatFlat } from '../lib/format.js';

  let { kinds, setStatus, onRerun = null, canRerun = () => false } = $props();

  /** Parent screens call this (via bind:this) right after saving, so the
   * fresh snapshot opens for review. */
  export function expand(id) {
    compareMode = false;
    compareIds = [];
    expandedSavedId = id;
  }

  const character = $derived(rosterStore.current);
  const savedResults = $derived(
    (character.savedResults || [])
      .filter((r) => kinds.includes(r.kind))
      .slice()
      // Pinned first, then newest first (savedAt is ISO, so string order works).
      .sort((a, b) => (b.pinned === true) - (a.pinned === true) || (b.savedAt || '').localeCompare(a.savedAt || ''))
  );

  let expandedSavedId = $state(null);
  let confirmDeleteId = $state(null); // two-click delete, matching .btn-danger's .is-confirming convention
  let renamingId = $state(null);
  let renameInput = $state('');
  let compareMode = $state(false);
  let compareIds = $state([]);

  // Character switches invalidate all view state - the list is a different
  // character's results.
  let lastCharacterId = $state(null);
  $effect(() => {
    if (character.id !== lastCharacterId) {
      lastCharacterId = character.id;
      expandedSavedId = null;
      confirmDeleteId = null;
      renamingId = null;
      compareMode = false;
      compareIds = [];
    }
  });

  const KIND_LABELS = {
    sim: 'Sim',
    opt: 'Opt',
    'sim-compare': 'A/B',
    'pvp-sim': 'Duel',
    'pvp-opt': 'PVP Opt',
  };
  const GOLD_KINDS = ['opt', 'pvp-opt'];

  function toggleSaved(id) {
    if (compareMode) {
      pickForCompare(id);
      return;
    }
    expandedSavedId = expandedSavedId === id ? null : id;
    confirmDeleteId = null;
    renamingId = null;
  }

  function deleteSaved(id) {
    if (confirmDeleteId !== id) {
      confirmDeleteId = id;
      return;
    }
    rosterStore.deleteSavedResult(id);
    confirmDeleteId = null;
    compareIds = compareIds.filter((c) => c !== id);
    if (expandedSavedId === id) expandedSavedId = null;
    setStatus?.('Deleted saved result');
  }

  function startRename(r) {
    renamingId = r.id;
    renameInput = r.name;
  }

  function commitRename() {
    if (renameInput.trim()) rosterStore.renameSavedResult(renamingId, renameInput);
    renamingId = null;
  }

  function togglePin(r) {
    rosterStore.togglePinnedSavedResult(r.id);
  }

  function fmtSavedAt(iso) {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  const fmt = (n) => (typeof n === 'number' ? n.toFixed(2) : '—');
  const fmtDamage = (n) => formatFlat(Math.round(n));
  const fmtPct = (n) => `${(n ?? 0).toFixed(1)}%`;
  const fmtPctCi = (n, iters) =>
    iters ? `${(n ?? 0).toFixed(1)}% ± ${rateCiHalfWidth(n ?? 0, iters).toFixed(1)}` : fmtPct(n);

  // --- Export (plain text to clipboard) ------------------------------------

  /** Scalar leaves of the summary as "dotted.path: value" lines; config and
   * changes have their own nicer renderings, so they're skipped here. */
  function flattenScalars(obj, prefix = '', out = []) {
    for (const [key, value] of Object.entries(obj || {})) {
      if (key === 'config' || key === 'changes') continue;
      const path = prefix ? `${prefix}.${key}` : key;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        flattenScalars(value, path, out);
      } else if (['number', 'string', 'boolean'].includes(typeof value)) {
        out.push([path, value]);
      }
    }
    return out;
  }

  async function exportSaved(r) {
    const lines = [
      r.name,
      `Kind: ${KIND_LABELS[r.kind] || r.kind}`,
      `Saved: ${fmtSavedAt(r.savedAt)}`,
    ];
    if (r.notes) lines.push(`Notes: ${r.notes}`);
    lines.push('');
    for (const [path, value] of flattenScalars(r.summary)) {
      lines.push(`${path}: ${typeof value === 'number' ? +value.toFixed(4) : value}`);
    }
    if (r.summary.changes?.length) {
      lines.push('', 'Changes:');
      for (const ch of r.summary.changes) lines.push(`  ${ch.dimension}: ${ch.from} → ${ch.to}`);
    }
    if (r.summary.config?.length) {
      lines.push('', 'Configuration:');
      for (const line of r.summary.config) lines.push(`  ${line.label}: ${line.value}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setStatus?.('Copied result to clipboard');
    } catch {
      setStatus?.('Could not access the clipboard');
    }
  }

  // --- Compare mode ---------------------------------------------------------

  function toggleCompareMode() {
    compareMode = !compareMode;
    compareIds = [];
    if (compareMode) {
      expandedSavedId = null;
      confirmDeleteId = null;
      renamingId = null;
    }
  }

  function pickForCompare(id) {
    if (compareIds.includes(id)) {
      compareIds = compareIds.filter((c) => c !== id);
      return;
    }
    const picked = savedResults.find((r) => r.id === id);
    const first = compareIds.length ? savedResults.find((r) => r.id === compareIds[0]) : null;
    if (first && picked && first.kind !== picked.kind) {
      setStatus?.('Compare two results of the same kind');
      return;
    }
    compareIds = [...compareIds, id].slice(-2);
  }

  const compareEntries = $derived(compareIds.map((id) => savedResults.find((r) => r.id === id)).filter(Boolean));

  // Shared numeric leaves of both summaries: [path, a, b, delta].
  const compareRows = $derived.by(() => {
    if (compareEntries.length !== 2) return [];
    const a = new Map(flattenScalars(compareEntries[0].summary));
    const rows = [];
    for (const [path, bVal] of flattenScalars(compareEntries[1].summary)) {
      const aVal = a.get(path);
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        rows.push({ path, a: aVal, b: bVal, delta: bVal - aVal });
      }
    }
    return rows;
  });

  const fmtCompare = (n) =>
    Math.abs(n) >= 1000 ? formatFlat(Math.round(n)) : +n.toFixed(2);
</script>

<aside class="panel saved-panel" data-testid="saved-results" aria-label="Saved results">
  <div class="saved-header">
    <h2 class="subheading">Saved Results</h2>
    {#if savedResults.length >= 2}
      <button type="button" class="btn-ghost compare-toggle" class:active={compareMode} onclick={toggleCompareMode}>
        {compareMode ? 'Done' : 'Compare'}
      </button>
    {/if}
  </div>
  <p class="subline">
    Snapshots of past runs for this character — the numbers as they were, even after the build changes.
  </p>
  {#if savedResults.length === 0}
    <p class="saved-empty">
      Nothing saved yet. Run a simulation or the optimizer, then press <strong>Save Result</strong>.
    </p>
  {:else}
    {#if compareMode}
      <p class="saved-empty" role="status">
        {compareEntries.length < 2 ? 'Pick two results of the same kind to compare.' : ''}
      </p>
      {#if compareEntries.length === 2}
        <div class="compare-panel" data-testid="saved-compare">
          <div class="compare-names mono">
            <span class="compare-a">A · {compareEntries[0].name}</span>
            <span class="compare-b">B · {compareEntries[1].name}</span>
          </div>
          {#each compareRows as row (row.path)}
            <div class="compare-row mono">
              <span class="compare-path">{row.path.replaceAll('.', ' · ')}</span>
              <span>{fmtCompare(row.a)}</span>
              <span>{fmtCompare(row.b)}</span>
              <span class:pos={row.delta > 0} class:neg={row.delta < 0}>
                {row.delta > 0 ? '+' : ''}{fmtCompare(row.delta)}
              </span>
            </div>
          {:else}
            <p class="saved-empty">No shared numeric fields to compare.</p>
          {/each}
        </div>
      {/if}
    {/if}
    <ul class="saved-list">
      {#each savedResults as r (r.id)}
        <li class="saved-item" class:comparing={compareMode && compareIds.includes(r.id)}>
          <button
            type="button"
            class="saved-head"
            onclick={() => toggleSaved(r.id)}
            aria-expanded={expandedSavedId === r.id}
          >
            {#if r.pinned}<span class="saved-pin" title="Pinned">★</span>{/if}
            <span class="saved-kind" class:opt={GOLD_KINDS.includes(r.kind)}>{KIND_LABELS[r.kind] || r.kind}</span>
            <span class="saved-name">{r.name}</span>
            <span class="saved-date mono">{fmtSavedAt(r.savedAt)}</span>
          </button>
          {#if expandedSavedId === r.id && !compareMode}
            <div class="saved-body">
              {#if renamingId === r.id}
                <div class="rename-row">
                  <input
                    class="rename-input"
                    bind:value={renameInput}
                    onkeydown={(e) => e.key === 'Enter' && commitRename()}
                    aria-label="New name"
                  />
                  <button type="button" class="btn-ghost" onclick={commitRename}>Save</button>
                </div>
              {/if}

              {#if r.kind === 'sim'}
                {#if r.summary.meanDps != null}
                  <div class="saved-row"><span>Mean DPS</span><span class="mono dps">{fmt(r.summary.meanDps)}</span></div>
                {/if}
                {#if r.summary.expectedDps != null}
                  <div class="saved-row"><span>Expected DPS</span><span class="mono">{fmt(r.summary.expectedDps)}</span></div>
                {/if}
                {#if r.summary.totalDamage}
                  <div class="saved-row"><span>Mean Total</span><span class="mono">{fmtDamage(r.summary.totalDamage.mean ?? 0)}</span></div>
                  <div class="saved-row"><span>Median</span><span class="mono">{fmtDamage(r.summary.totalDamage.p50 ?? 0)}</span></div>
                  <div class="saved-row"><span>p5 – p95</span><span class="mono">{fmtDamage(r.summary.totalDamage.p5 ?? 0)} – {fmtDamage(r.summary.totalDamage.p95 ?? 0)}</span></div>
                {/if}
                {#if r.summary.observed}
                  <div class="saved-row"><span>Observed crit</span><span class="mono">{(r.summary.observed.critRate ?? 0).toFixed(1)}%</span></div>
                {/if}
                {#if r.summary.seed != null}
                  <div class="saved-row"><span>Seed (replayable)</span><span class="mono">{r.summary.seed}</span></div>
                {/if}
              {:else if r.kind === 'opt'}
                <div class="saved-row">
                  <span>{r.summary.goal === 'tank' ? 'Tank Score' : 'DPS'}</span>
                  <span class="mono">{fmt(r.summary.baselineScore ?? 0)} → <span class="dps">{fmt(r.summary.bestScore ?? 0)}</span></span>
                </div>
                {#if r.summary.improvementPct != null}
                  <div class="saved-row"><span>Improvement</span><span class="mono">+{r.summary.improvementPct.toFixed(2)}%</span></div>
                {/if}
                {#if r.summary.ichorSpent}
                  <div class="saved-row"><span>Ichor spent</span><span class="mono">{r.summary.ichorSpent}</span></div>
                {/if}
              {:else if r.kind === 'sim-compare'}
                <div class="saved-row"><span>{r.summary.presetAName || 'A'}</span><span class="mono">{fmt(r.summary.meanDpsA)} DPS</span></div>
                <div class="saved-row"><span>{r.summary.presetBName || 'B'}</span><span class="mono">{fmt(r.summary.meanDpsB)} DPS</span></div>
                {#if r.summary.deltaDps != null}
                  <div class="saved-row">
                    <span>B − A</span>
                    <span class="mono dps">{r.summary.deltaDps > 0 ? '+' : ''}{fmt(r.summary.deltaDps)} ± {fmt(r.summary.ciHalfWidthDps ?? 0)}</span>
                  </div>
                {/if}
                {#if r.summary.deltaPct != null}
                  <div class="saved-row"><span>Relative</span><span class="mono">{r.summary.deltaPct > 0 ? '+' : ''}{r.summary.deltaPct.toFixed(2)}%</span></div>
                {/if}
                {#if r.summary.seed != null}
                  <div class="saved-row"><span>Seed (replayable)</span><span class="mono">{r.summary.seed}</span></div>
                {/if}
              {:else if r.kind === 'pvp-sim'}
                {#if r.summary.opponentName}
                  <div class="saved-row"><span>Opponent</span><span class="mono">{r.summary.opponentName}</span></div>
                {/if}
                <div class="saved-row"><span>Win rate</span><span class="mono dps">{fmtPctCi(r.summary.winRate, r.summary.iterations)}</span></div>
                {#if r.summary.lossRate != null}
                  <div class="saved-row"><span>Loss rate</span><span class="mono">{fmtPctCi(r.summary.lossRate, r.summary.iterations)}</span></div>
                {/if}
                {#if r.summary.drawRate != null}
                  <div class="saved-row"><span>Draws</span><span class="mono">{fmtPct(r.summary.drawRate)}</span></div>
                {/if}
                {#if r.summary.meanTimeToKill != null}
                  <div class="saved-row"><span>Mean time to kill</span><span class="mono">{r.summary.meanTimeToKill.toFixed(1)}s</span></div>
                {/if}
                {#if r.summary.healthMultiplier != null}
                  <div class="saved-row"><span>Health</span><span class="mono">×{r.summary.healthMultiplier}</span></div>
                {/if}
                {#if r.summary.seed != null}
                  <div class="saved-row"><span>Seed (replayable)</span><span class="mono">{r.summary.seed}</span></div>
                {/if}
              {:else if r.kind === 'pvp-opt'}
                {#if r.summary.opponentName}
                  <div class="saved-row"><span>Opponent</span><span class="mono">{r.summary.opponentName}</span></div>
                {/if}
                <div class="saved-row">
                  <span>Win chance</span>
                  <span class="mono">{fmtPct(r.summary.beforeWinRate)} → <span class="dps">{fmtPct(r.summary.afterWinRate)}</span></span>
                </div>
                {#if r.summary.verifyIterations}
                  <div class="saved-row"><span>Verified over</span><span class="mono">{r.summary.verifyIterations.toLocaleString('en-US')} duels</span></div>
                {/if}
                {#if r.summary.healthMultiplier != null}
                  <div class="saved-row"><span>Health</span><span class="mono">×{r.summary.healthMultiplier}</span></div>
                {/if}
              {/if}

              {#if ['opt', 'pvp-opt'].includes(r.kind)}
                {#if r.summary.changes?.length}
                  <ul class="saved-changes">
                    {#each r.summary.changes as ch, i (i)}
                      <li><span class="saved-dim">{ch.dimension}</span> {ch.from} → {ch.to}</li>
                    {/each}
                  </ul>
                {:else}
                  <p class="saved-empty">No changes — build was already optimal.</p>
                {/if}
              {/if}

              {#if r.summary.config?.length}
                <div class="saved-config" data-testid="saved-config">
                  <span class="micro-label">{['opt', 'pvp-opt'].includes(r.kind) ? 'Recommended configuration' : 'Configuration'}</span>
                  {#each r.summary.config as line, i (i)}
                    <div class="config-line">
                      <span class="saved-dim">{line.label}</span>
                      <span class="config-value">{line.value}</span>
                    </div>
                  {/each}
                </div>
              {/if}

              <label class="notes-field">
                <span class="micro-label">Notes</span>
                <textarea
                  rows="2"
                  placeholder="Why this run matters…"
                  value={r.notes || ''}
                  onchange={(e) => rosterStore.setSavedResultNotes(r.id, e.target.value)}
                  data-testid="saved-notes"
                ></textarea>
              </label>

              <div class="saved-actions">
                <button type="button" class="btn-ghost" onclick={() => togglePin(r)} data-testid="saved-pin">
                  {r.pinned ? 'Unpin' : 'Pin'}
                </button>
                <button type="button" class="btn-ghost" onclick={() => startRename(r)}>Rename</button>
                <button type="button" class="btn-ghost" onclick={() => exportSaved(r)} data-testid="saved-export">Export</button>
                {#if onRerun && canRerun(r)}
                  <button type="button" class="btn-ghost" onclick={() => onRerun(r)} data-testid="saved-rerun">Re-run</button>
                {/if}
                <button
                  type="button"
                  class="btn-danger saved-delete"
                  class:is-confirming={confirmDeleteId === r.id}
                  onclick={() => deleteSaved(r.id)}
                >
                  {confirmDeleteId === r.id ? 'Confirm delete' : 'Delete'}
                </button>
              </div>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-panel);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .saved-panel {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100vh - var(--space-4) * 2);
    overflow-y: auto;
  }
  .saved-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .compare-toggle.active {
    color: var(--color-gold-light);
    border-color: var(--color-gold);
  }
  .subline {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted);
    max-width: 56ch;
  }
  .saved-empty {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted);
  }
  .saved-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .saved-item {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    overflow: hidden;
  }
  .saved-item.comparing {
    border-color: var(--color-gold);
  }
  .saved-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: none;
    border: none;
    color: var(--color-ink);
    padding: var(--space-2) var(--space-3);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    min-height: 40px;
  }
  .saved-head:hover {
    background: var(--color-field);
  }
  .saved-pin {
    flex: none;
    color: var(--color-gold-light);
    font-size: 11px;
  }
  .saved-kind {
    flex: none;
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-dps);
    border: 1px solid currentColor;
    border-radius: var(--radius-field);
    padding: 1px 6px;
    white-space: nowrap;
  }
  .saved-kind.opt {
    color: var(--color-gold-light);
  }
  .saved-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .saved-date {
    flex: none;
    font-size: 10px;
    color: var(--color-muted);
  }
  .saved-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3) var(--space-3);
    border-top: 1px solid var(--color-border-hairline);
  }
  .rename-row {
    display: flex;
    gap: var(--space-2);
  }
  .rename-input {
    flex: 1;
    min-width: 0;
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 6px 8px;
    font-size: 12px;
  }
  .saved-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 12px;
    color: var(--color-muted);
  }
  .saved-row .mono {
    color: var(--color-ink);
  }
  .saved-row .dps {
    color: var(--color-dps);
  }
  .saved-changes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--color-muted);
  }
  .saved-dim {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-gold-light);
    margin-right: 4px;
  }
  .saved-config {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    border-top: 1px solid var(--color-border-hairline);
    padding-top: var(--space-2);
    margin-top: var(--space-1);
  }
  .config-line {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .config-value {
    font-size: 11px;
    color: var(--color-ink);
    overflow-wrap: anywhere;
  }
  .notes-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    border-top: 1px solid var(--color-border-hairline);
    padding-top: var(--space-2);
  }
  .notes-field textarea {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--font-ui);
    resize: vertical;
  }
  .saved-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }
  .saved-delete {
    margin-left: auto;
  }
  .compare-panel {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .compare-names {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    padding-bottom: var(--space-1);
    border-bottom: 1px solid var(--color-border-hairline);
  }
  .compare-a {
    color: var(--color-dps);
  }
  .compare-b {
    color: var(--color-gold-light);
  }
  .compare-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    gap: var(--space-2);
    font-size: 11px;
    align-items: baseline;
  }
  .compare-row .pos {
    color: var(--color-upgrade, #57d98a);
  }
  .compare-row .neg {
    color: var(--color-downgrade, #ff7a7a);
  }
  .compare-path {
    color: var(--color-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (max-width: 1100px) {
    .saved-panel {
      position: static;
      max-height: none;
      overflow-y: visible;
    }
  }
  @media (max-width: 700px) {
    .panel {
      padding: var(--space-4) var(--space-3);
    }
    .rename-input,
    .notes-field textarea {
      min-height: 44px;
    }
  }
</style>
