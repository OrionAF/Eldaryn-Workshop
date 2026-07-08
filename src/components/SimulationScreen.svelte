<script>
  /**
   * SimulationScreen.svelte - Monte Carlo World Boss simulation + build
   * optimizer.
   *
   * Section A plays out a 60s target-dummy fight many times with the
   * selected preset's effective totals (simulation.js) and shows the damage
   * DISTRIBUTION next to the closed-form expected DPS.
   *
   * Section B searches every build dimension (optimizer.js) and renders the
   * result as a read-only SimulatedPresetCard - recommendations only,
   * nothing is written to the store.
   *
   * Results are view-state only (not persisted) and reset on character
   * switch. The sim itself is fast (tens of ms) - the single setTimeout
   * before running just lets the "Running…" label paint first.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import { runSimulation, DEFAULT_EFFECTS } from '../lib/simulation.js';
  import { buildSigilEffects } from '../lib/sigilEffects.js';
  import { optimize, createMonteCarloObjective } from '../lib/optimizer.js';
  import { formatFlat } from '../lib/format.js';
  import SimulatedPresetCard from './SimulatedPresetCard.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const presets = $derived(character.presets);

  let selectedPresetId = $state(null);
  const preset = $derived(presets.find((p) => p.id === selectedPresetId) || presets[0] || null);

  const ITERATION_CHOICES = [1000, 5000, 10000];
  let iterations = $state(5000);

  let simRunning = $state(false);
  let simResult = $state(null);

  let ichorInput = $state('0');
  // 'fast' = closed-form objective (exact flat sigil damage, uptime-approx
  // buffs); 'accurate' = Monte Carlo sim per candidate (exact, much slower).
  // View-state only, like the results themselves.
  let optMode = $state('fast');
  let optRunning = $state(false);
  let optProgress = $state(null);
  let optResult = $state(null);

  // Character switches invalidate everything shown - the results describe a
  // different character's build.
  let lastCharacterId = $state(null);
  $effect(() => {
    if (character.id !== lastCharacterId) {
      lastCharacterId = character.id;
      selectedPresetId = null;
      simResult = null;
      optResult = null;
      optProgress = null;
    }
  });

  const fmt = (n) => n.toFixed(2);
  const fmtDamage = (n) => formatFlat(Math.round(n));

  function runSim() {
    if (!preset || simRunning) return;
    simRunning = true;
    const stats = resolveEffectiveTotals(character, preset);
    // Equipped sigils' actives (nukes, DoTs, timed buffs) join the base
    // crit/double-hit effects; their passives are already inside `stats`.
    const effects = [...DEFAULT_EFFECTS, ...buildSigilEffects(character, preset)];
    // One macrotask so the disabled/"Running…" state paints before the work.
    setTimeout(() => {
      try {
        simResult = runSimulation({ stats, iterations, effects });
        setStatus?.(`Simulated ${iterations.toLocaleString('en-US')} fights`);
      } finally {
        simRunning = false;
      }
    }, 0);
  }

  async function runOptimizer() {
    if (!preset || optRunning) return;
    optRunning = true;
    optResult = null;
    optProgress = null;
    try {
      optResult = await optimize({
        character,
        preset,
        ichorBudget: Math.max(0, Number(ichorInput) || 0),
        // 'fast' relies on optimize()'s default sigil-aware closed-form objective.
        ...(optMode === 'accurate' ? { objective: createMonteCarloObjective() } : {}),
        onProgress: (p) => (optProgress = p),
      });
      setStatus?.(
        optResult.changes.length === 0
          ? 'Already optimal — no changes found'
          : `Found +${optResult.improvementPct.toFixed(2)}% DPS in ${optResult.elapsedMs}ms`
      );
    } finally {
      optRunning = false;
    }
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before opening Simulation.</p>
{:else if !preset}
  <p class="empty-hint">Create a preset first — the simulation runs on a preset's totals.</p>
{:else}
  <div class="sim-screen">
    <section class="panel">
      <h2 class="subheading">Battle Simulation</h2>
      <p class="subline">
        60 seconds vs a World Boss target dummy — each run rolls crits and double hits per swing.
        Estimates only: relative DPS, no boss defense or mechanics.
      </p>

      <div class="controls">
        <label class="control">
          <span class="micro-label">Preset</span>
          <select bind:value={selectedPresetId}>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <label class="control">
          <span class="micro-label">Iterations</span>
          <select bind:value={iterations}>
            {#each ITERATION_CHOICES as n (n)}
              <option value={n}>{n.toLocaleString('en-US')}</option>
            {/each}
          </select>
        </label>
        <button type="button" class="btn-gold run-btn" onclick={runSim} disabled={simRunning}>
          {simRunning ? 'Running…' : 'Run Simulation'}
        </button>
      </div>

      {#if simResult}
        <div class="results" data-testid="sim-results">
          <div class="tiles">
            <div class="tile">
              <span class="micro-label">Mean DPS</span>
              <span class="mono value dps">{fmt(simResult.meanDps)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Expected DPS</span>
              <span class="mono value">{fmt(simResult.expectedDps)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Mean Total Damage</span>
              <span class="mono value">{fmtDamage(simResult.totalDamage.mean)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Std Dev</span>
              <span class="mono value">{fmtDamage(simResult.totalDamage.stdDev)}</span>
            </div>
          </div>

          <div class="distribution">
            <span class="micro-label">Total damage distribution</span>
            <div class="dist-row mono">
              {#each [['min', simResult.totalDamage.min], ['p5', simResult.totalDamage.p5], ['p25', simResult.totalDamage.p25], ['median', simResult.totalDamage.p50], ['p75', simResult.totalDamage.p75], ['p95', simResult.totalDamage.p95], ['max', simResult.totalDamage.max]] as [label, value] (label)}
                <div class="dist-cell">
                  <span class="dist-label">{label}</span>
                  <span class="dist-value">{fmtDamage(value)}</span>
                </div>
              {/each}
            </div>
          </div>

          <p class="observed mono">
            Observed: crit {simResult.observed.critRate.toFixed(1)}% · double hit
            {simResult.observed.doubleHitRate.toFixed(1)}% · {simResult.observed.meanSwings.toFixed(0)} swings/fight ·
            best run {fmtDamage(simResult.bestRun.totalDamage)} · worst run {fmtDamage(simResult.worstRun.totalDamage)}
          </p>
        </div>
      {/if}
    </section>

    <section class="panel">
      <h2 class="subheading">Build Optimizer</h2>
      <p class="subline">
        Searches loadouts, talents, pets, relics, sigils, stones, mounts, glyphs, awakening, and transcendence
        for the highest-DPS build — shown as a recommendation, never auto-applied. Fortress buffs are
        taken as set on the preset. Sigil actives (nukes, DoTs, timed buffs) count toward the score.
      </p>

      {#if preset.manualTotals}
        <p class="manual-warning">
          ⚠ This preset uses Manual totals. The optimizer compares Calculated totals — your manual
          entries are ignored while searching.
        </p>
      {/if}

      <div class="controls">
        <label class="control">
          <span class="micro-label">Extra Ichor</span>
          <input type="number" min="0" step="1" bind:value={ichorInput} />
        </label>
        <div class="control" role="group" aria-label="Scoring mode">
          <span class="micro-label">Scoring</span>
          <div class="mode-toggle">
            <button
              type="button"
              class:selected={optMode === 'fast'}
              onclick={() => (optMode = 'fast')}
              disabled={optRunning}
            >
              Faster · approximate
            </button>
            <button
              type="button"
              class:selected={optMode === 'accurate'}
              onclick={() => (optMode = 'accurate')}
              disabled={optRunning}
            >
              Slower · sim-accurate
            </button>
          </div>
        </div>
        <button type="button" class="btn-gold run-btn" onclick={runOptimizer} disabled={optRunning}>
          {optRunning ? 'Searching…' : 'Find Best Build'}
        </button>
      </div>
      <p class="ichor-hint">Resetting transcendence is free, so the optimizer always rebuilds the board from scratch using the Ichor already invested in your current nodes — plus any extra you enter here.</p>

      {#if optRunning && optProgress}
        <p class="progress mono" role="status">
          {optProgress.phase} — {optProgress.evals.toLocaleString('en-US')} builds evaluated — best {fmt(optProgress.bestScore)} DPS
        </p>
      {/if}

      {#if optResult}
        <SimulatedPresetCard result={optResult} {character} />
      {/if}
    </section>
  </div>
{/if}

<style>
  .empty-hint {
    color: var(--color-muted);
    padding-top: var(--space-6);
  }
  .sim-screen {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    max-width: 860px;
  }
  .panel {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-panel);
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .subline {
    margin: 0;
    font-size: 12px;
    color: var(--color-muted);
    max-width: 56ch;
  }
  .controls {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
    flex-wrap: wrap;
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .control select,
  .control input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    min-width: 120px;
  }
  .control input {
    font-family: var(--font-data);
  }
  .run-btn {
    min-height: 36px;
  }
  .mode-toggle {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    overflow: hidden;
  }
  .mode-toggle button {
    background: var(--color-field);
    color: var(--color-muted);
    border: none;
    padding: 7px 12px;
    font-size: 12px;
    cursor: pointer;
    min-height: 34px;
  }
  .mode-toggle button + button {
    border-left: 1px solid var(--color-border);
  }
  .mode-toggle button.selected {
    background: var(--color-gold-tint);
    color: var(--color-gold-light);
  }
  .mode-toggle button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .results {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--space-3);
  }
  .tile {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .tile .value {
    font-size: 17px;
  }
  .tile .value.dps {
    color: var(--color-dps);
  }
  .distribution {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .dist-row {
    display: flex;
    gap: 0;
    overflow-x: auto;
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
  }
  .dist-cell {
    flex: 1;
    min-width: 76px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    border-right: 1px solid var(--color-border-hairline);
  }
  .dist-cell:last-child {
    border-right: none;
  }
  .dist-label {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-muted);
  }
  .dist-value {
    font-size: 13px;
  }
  .observed {
    margin: 0;
    font-size: 11px;
    color: var(--color-muted);
  }
  .manual-warning {
    margin: 0;
    font-size: 12px;
    color: var(--color-warning);
    background: var(--color-warning-soft);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-3);
  }
  .ichor-hint {
    margin: calc(-1 * var(--space-2)) 0 0;
    font-size: 11px;
    color: var(--color-muted);
    max-width: 56ch;
  }
  .progress {
    margin: 0;
    font-size: 12px;
    color: var(--color-gold-light);
  }
  @media (max-width: 700px) {
    .panel {
      padding: var(--space-4) var(--space-3);
    }
    .controls {
      align-items: stretch;
      flex-direction: column;
    }
    .control select,
    .control input {
      min-width: 0;
      width: 100%;
      min-height: 44px;
    }
    .run-btn {
      min-height: 44px;
    }
    .mode-toggle button {
      flex: 1;
      min-height: 44px;
    }
  }
</style>
