<script>
  /**
   * LinkingReportCard.svelte - the persisted linking-simulation report,
   * shown at the top of the Simulations Dashboard once
   * character.linkingSim !== null (goals/linking redesign). Reports, never
   * auto-applies: the awakening path locks via an explicit button, and each
   * preset's recommended build applies via its own button. "Reset initial
   * linking simulations" (Settings Danger Zone) brings the setup card back.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { PATH_LABELS, LINKING_PATHS } from '../lib/linkingSimulation.js';
  import { formatFlat } from '../lib/format.js';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const report = $derived(character.linkingSim);
  const pathLocked = $derived(character.awakening?.path === report?.lockedPath);

  const fmtScore = (n) => (Math.abs(n) >= 1000 ? formatFlat(Math.round(n)) : (Number(n) || 0).toFixed(1));
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  function lockPath() {
    if (pathLocked) return;
    // setAwakeningPath zeroes points on a real path change (game behaviour -
    // you re-invest into the new path); harmless when already on it (guarded).
    rosterStore.setAwakeningPath(report.lockedPath);
    setStatus?.(`${PATH_LABELS[report.lockedPath]} locked in — re-invest awakening points as you level`);
  }

  function presetExists(presetId) {
    return character.presets.some((p) => p.id === presetId);
  }

  function applyBuild(entry) {
    if (!presetExists(entry.presetId)) return;
    if (rosterStore.applyOptimizerCandidate(entry.presetId, entry.recommended.candidate)) {
      setStatus?.(`Applied the recommended build to "${entry.presetName}"`);
    }
  }

  // Stat-priority bar scaling per preset (relative to that preset's top |delta|).
  const barWidth = (entry, delta) => {
    const max = Math.max(1e-9, ...entry.recommended.statPriorities.map((s) => Math.abs(s.delta)));
    return `${(Math.abs(delta) / max) * 100}%`;
  };
</script>

{#if report}
  <section class="panel" data-testid="linking-report">
    <div class="report-head">
      <h2 class="subheading">Linking Report</h2>
      <span class="report-date mono">{fmtDate(report.completedAt)}</span>
    </div>

    <div class="verdict" data-testid="linking-verdict">
      <div class="verdict-line">
        <span class="verdict-badge">{PATH_LABELS[report.lockedPath]}</span>
        {#if pathLocked}
          <span class="locked-tag" data-testid="path-locked">Path locked ✓</span>
        {:else}
          <button type="button" class="btn-gold" onclick={lockPath} data-testid="lock-path">Lock in Awakening path</button>
        {/if}
      </div>
      <p class="reasoning">{report.reasoning}</p>
    </div>

    <!-- 2x2: each linked preset (goal) scored under both awakening paths. -->
    <div class="matrix-wrap">
      <table class="score-matrix mono" data-testid="score-matrix">
        <thead>
          <tr>
            <th>Preset · Goal</th>
            {#each LINKING_PATHS as path (path)}
              <th class:locked-col={path === report.lockedPath}>{PATH_LABELS[path]}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each report.presets as entry (entry.presetId)}
            <tr>
              <th class="row-head">{entry.presetName} · {entry.goalUnit}</th>
              {#each LINKING_PATHS as path (path)}
                {@const best = entry.scores[path] >= entry.scores[path === 'shadow' ? 'radiant' : 'shadow']}
                <td class:locked-col={path === report.lockedPath} class:best>{fmtScore(entry.scores[path])}</td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    {#each report.presets as entry (entry.presetId)}
      <div class="preset-report" data-testid="preset-report">
        <div class="preset-report-head">
          <span class="micro-label">{entry.presetName} · {entry.goalUnit}</span>
          <span class="talent-lean">Talents: {entry.recommended.talentLean.label} ({entry.recommended.talentLean.offense} off / {entry.recommended.talentLean.defense} def)</span>
        </div>

        {#if entry.recommended.changes?.length}
          <div class="changes">
            <span class="micro-label">Recommended changes (+{(entry.recommended.improvementPct ?? 0).toFixed(1)}%)</span>
            <ul>
              {#each entry.recommended.changes as ch, i (i)}
                <li class="mono">{ch.dimension}: {ch.from} → {ch.to}</li>
              {/each}
            </ul>
          </div>
        {:else}
          <p class="already-optimal">Already optimal for this goal under the locked path.</p>
        {/if}

        {#if entry.recommended.statPriorities?.length}
          <div class="priorities">
            <span class="micro-label">Stat priorities</span>
            {#each entry.recommended.statPriorities as s (s.label)}
              <div class="priority-bar-row">
                <span class="priority-label">{s.label} <span class="priority-unit">{s.unit}</span></span>
                <div class="priority-track"><div class="priority-fill" class:negative={s.delta < 0} style="width: {barWidth(entry, s.delta)}"></div></div>
                <span class="mono priority-delta">{s.deltaPct >= 0 ? '+' : ''}{s.deltaPct.toFixed(2)}%</span>
              </div>
            {/each}
          </div>
        {/if}

        <div class="preset-actions">
          <button
            type="button"
            class="btn-ghost"
            disabled={!presetExists(entry.presetId)}
            onclick={() => applyBuild(entry)}
            data-testid="apply-build"
          >
            Apply recommended build
          </button>
          {#if !presetExists(entry.presetId)}
            <span class="stale-note">This preset was deleted — can't apply.</span>
          {/if}
        </div>
      </div>
    {/each}
  </section>
{/if}

<style>
  .report-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
  }
  .report-date {
    font-size: 11px;
    color: var(--color-muted);
  }
  .verdict {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-3) 0 var(--space-5);
  }
  .verdict-line {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .verdict-badge {
    font-family: var(--font-heading, inherit);
    font-size: 15px;
    color: var(--nav-awakening-light, #f9dda6);
  }
  .locked-tag {
    font-size: 12px;
    color: var(--color-hps, #58d68d);
  }
  .reasoning {
    margin: 0;
    font-size: 13px;
    color: var(--color-muted);
    line-height: 1.5;
  }
  .matrix-wrap {
    overflow-x: auto;
  }
  .score-matrix {
    border-collapse: collapse;
    font-size: 13px;
  }
  .score-matrix th,
  .score-matrix td {
    border: 1px solid var(--color-border);
    padding: var(--space-2) var(--space-4);
    text-align: right;
  }
  .score-matrix .row-head,
  .score-matrix thead th:first-child {
    text-align: left;
    color: var(--color-muted);
  }
  .score-matrix .locked-col {
    background: var(--nav-simulations-tint);
  }
  .score-matrix td.best {
    color: var(--nav-simulations-light);
    font-weight: 600;
  }
  .preset-report {
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-4);
    margin-top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .preset-report-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .talent-lean {
    font-size: 12px;
    color: var(--color-muted);
  }
  .changes ul {
    margin: var(--space-1) 0 0;
    padding-left: var(--space-4);
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .already-optimal {
    font-size: 12px;
    color: var(--color-muted);
    margin: 0;
  }
  .priorities {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .priority-bar-row {
    display: grid;
    grid-template-columns: minmax(120px, 200px) minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
    font-size: 12px;
  }
  .priority-unit {
    color: var(--color-muted);
    font-size: 11px;
  }
  .priority-track {
    height: 6px;
    border-radius: 3px;
    background: var(--color-border);
    overflow: hidden;
  }
  .priority-fill {
    height: 100%;
    background: var(--nav-simulations);
  }
  .priority-fill.negative {
    background: var(--color-downgrade, #c1594f);
  }
  .priority-delta {
    color: var(--color-muted);
  }
  .preset-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .stale-note {
    font-size: 12px;
    color: var(--color-downgrade, #c1594f);
  }
</style>
