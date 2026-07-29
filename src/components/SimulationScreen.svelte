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
   *
   * The exception: every completed run auto-saves a snapshot of the shown
   * numbers (display-ready plain data only, never the live candidate/build)
   * into character.runHistory via rosterStore.addRunHistoryEntry - the
   * Simulations Dashboard renders that history. No manual Save step.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { resolveEffectiveTotals, computePresetTotals } from '../lib/totals.js';
  import { runSimulation, compareSimulations, DEFAULT_EFFECTS } from '../lib/simulation.js';
  import { buildSigilEffects } from '../lib/sigilEffects.js';
  import { verifyDpsOutcome, SEARCH_DIMENSIONS, materializeCandidate, candidateFromCurrent } from '../lib/optimizer.js';
  import { describeBuildConfig } from '../lib/buildConfig.js';
  import { runOptimizerTask } from '../lib/optimizerClient.js';
  import { tankMetrics, TANK_PROFILES } from '../lib/tankObjective.js';
  import { pvpFactorMetrics } from '../lib/pvpGoalObjective.js';
  import { presetGoalLabel } from '../lib/model.js';
  import { computeStatWeights } from '../lib/statWeights.js';
  import { formatFlat, parseFlat } from '../lib/format.js';
  import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
  import SimulatedPresetCard from './SimulatedPresetCard.svelte';
  import RelicSuggesterPanel from './RelicSuggesterPanel.svelte';
  import Slider from './Slider.svelte';

  // Embedding props (Simulations page goal tabs): `presetFilterGoal`
  // narrows every preset picker to presets carrying that goal kind;
  // `lockedPresetId` pins the screen to one preset (Custom tabs);
  // `panels` gates which sections render. Defaults preserve the full
  // standalone behavior.
  let { setStatus, presetFilterGoal = null, lockedPresetId = null, panels = ['sim', 'compare', 'optimizer'] } = $props();

  const character = $derived(rosterStore.current);
  const presets = $derived.by(() => {
    if (lockedPresetId) return character.presets.filter((p) => p.id === lockedPresetId);
    if (presetFilterGoal) return character.presets.filter((p) => p.goal?.kind === presetFilterGoal);
    return character.presets;
  });

  let selectedPresetId = $state(null);
  const preset = $derived(presets.find((p) => p.id === selectedPresetId) || presets[0] || null);

  // The optimizer never assumes a preset - the user must pick the one to
  // optimize explicitly (no first-preset fallback like the sim above).
  let optPresetId = $state(null);
  // A locked embed (Custom goal tab) pins the optimizer to its one preset -
  // no explicit selection step.
  const optPreset = $derived(presets.find((p) => p.id === optPresetId) || (lockedPresetId ? presets[0] || null : null));

  const ITERATION_CHOICES = [1000, 5000, 10000];
  let iterations = $state(5000);
  let durationInput = $state('60');
  // Blank = a fresh random seed each run; entering the seed echoed in a
  // previous result replays that exact run.
  let seedInput = $state('');

  const durationSeconds = () => Math.max(1, parseFlat(durationInput) || 60);
  const enteredSeed = () => (seedInput.trim() === '' ? undefined : Number(seedInput) >>> 0);

  let simRunning = $state(false);
  let simResult = $state(null);

  // --- Preset vs preset comparison (paired RNG; view-state only) ---
  let cmpPresetAId = $state(null);
  let cmpPresetBId = $state(null);
  const cmpPresetA = $derived(presets.find((p) => p.id === cmpPresetAId) || null);
  const cmpPresetB = $derived(presets.find((p) => p.id === cmpPresetBId) || null);
  let cmpRunning = $state(false);
  let cmpResult = $state(null);

  let ichorInput = $state('0');
  // 'fast' = closed-form objective (exact flat sigil damage and buff-window
  // timeline); 'accurate' = closed-form screening + Monte Carlo confirmation
  // per adoption (captures buff/swing correlation, much slower).
  // View-state only, like the results themselves.
  let optMode = $state('fast');
  // Optimization goal comes from the selected preset's persisted assignment
  // (preset.goal, model.js) - there is no local dps/tank toggle anymore.
  // 'tank' is Warrior-only (normalisePresetGoal enforces it on the data).
  // 'pvp' and 'custom' both run the closed-form three-factor blend
  // (pvpGoalObjective.js) under the goal's slider weights; unassigned
  // (null) runs under the neutral DPS objective with a prompt to assign
  // one. Tank/PVP scoring is closed-form only, so the fast/accurate
  // toggle applies to DPS alone.
  const optGoalKind = $derived(optPreset?.goal?.kind ?? null);
  const optGoal = $derived(
    optGoalKind === 'tank' ? 'tank' : optGoalKind === 'pvp' || optGoalKind === 'custom' ? 'pvp' : 'dps'
  );
  const scoreUnitFor = (goal) => (goal === 'tank' ? 'Tank Score' : goal === 'pvp' ? 'PVP Score' : 'DPS');
  // The three slider weights, for the goal readout ("PVP · 40/30/30").
  const optPvpWeights = $derived(optGoal === 'pvp' ? optPreset?.goal?.weights : null);
  // EHP-vs-sustain balance as a percent (0 = pure sustain, 100 = pure
  // effective HP), persisted on the preset's goal. Named profiles preset it;
  // any other slider position reads back as Custom.
  const tankEhpPct = $derived(Math.round((optPreset?.goal?.ehpWeight ?? 0.5) * 100));
  const tankProfileId = $derived(
    TANK_PROFILES.find((p) => Math.round(p.ehpWeight * 100) === tankEhpPct)?.id ?? 'custom'
  );
  function pickTankProfile(id) {
    const profile = TANK_PROFILES.find((p) => p.id === id);
    if (profile && optPreset) rosterStore.setPresetGoal(optPreset.id, { ehpWeight: profile.ehpWeight });
  }
  function setTankEhpPct(pct) {
    if (optPreset) rosterStore.setPresetGoal(optPreset.id, { ehpWeight: pct / 100 });
  }
  // Monte Carlo iterations per confirmation eval in 'accurate' mode.
  const OPT_ACCURACY_CHOICES = [
    { label: 'Standard (100 sims/eval)', value: 100 },
    { label: 'High (250 sims/eval)', value: 250 },
    { label: 'Very high (500 sims/eval)', value: 500 },
  ];
  let optAccuracy = $state(100);
  // Per-dimension search locks: unchecked = keep that part of the build as-is.
  let optDims = $state(Object.fromEntries(SEARCH_DIMENSIONS.map((d) => [d.key, true])));
  let optRunning = $state(false);
  let optProgress = $state(null);
  let optResult = $state(null);
  let optResultGoal = $state('dps'); // the goal the shown result was searched under (optGoal can change after)
  let optVerify = $state(null); // 'accurate' mode: fresh-seed high-iteration before/after
  let optTask = null; // in-flight { cancel } handle (not view state)

  // Tank-goal result breakdown: the human-readable metrics behind the score,
  // before vs after (closed-form, cheap - recomputed from the recommendation).
  const tankBreakdown = $derived.by(() => {
    if (optResultGoal !== 'tank' || !optResult || !optPreset) return null;
    const before = tankMetrics(computePresetTotals(character, optPreset));
    const { candidateCharacter, candidatePreset } = materializeCandidate(character, optResult.best.candidate);
    const after = tankMetrics(computePresetTotals(candidateCharacter, candidatePreset));
    return { before, after };
  });

  // PVP-goal result breakdown: the three factor metrics behind the score,
  // before vs after (visible reasoning - decision 1 of the goals redesign).
  const pvpBreakdown = $derived.by(() => {
    if (optResultGoal !== 'pvp' || !optResult || !optPreset) return null;
    const before = pvpFactorMetrics(computePresetTotals(character, optPreset));
    const { candidateCharacter, candidatePreset } = materializeCandidate(character, optResult.best.candidate);
    const after = pvpFactorMetrics(computePresetTotals(candidateCharacter, candidatePreset));
    return { before, after };
  });

  // Character switches invalidate everything shown - the results describe a
  // different character's build.
  let lastCharacterId = $state(null);
  $effect(() => {
    if (character.id !== lastCharacterId) {
      lastCharacterId = character.id;
      selectedPresetId = null;
      optPresetId = null;
      simResult = null;
      cmpPresetAId = null;
      cmpPresetBId = null;
      cmpResult = null;
      optResult = null;
      optProgress = null;
      optVerify = null;
    }
  });

  // --- Auto-saved run history (persisted; rendered by the Simulations Dashboard) ---

  function recordSimRun() {
    if (!simResult || !preset) return;
    rosterStore.addRunHistoryEntry('sim', {
      name: `${preset.name} · ${iterations.toLocaleString('en-US')} × ${durationSeconds()}s`,
      goalKind: preset.goal?.kind ?? null,
      presetId: preset.id,
      presetName: preset.name,
      headline: {
        meanDps: simResult.meanDps,
        p5: simResult.totalDamage.p5,
        p95: simResult.totalDamage.p95,
        iterations,
        durationSeconds: durationSeconds(),
      },
      detail: {
        presetId: preset.id,
        presetName: preset.name,
        iterations,
        durationSeconds: durationSeconds(),
        seed: simResult.seed,
        meanDps: simResult.meanDps,
        expectedDps: simResult.expectedDps,
        totalDamage: simResult.totalDamage,
        observed: simResult.observed,
        histogram: simResult.histogram,
        damageByTag: simResult.damageByTag,
        // The build as simulated, resolved to display text NOW - names keep
        // meaning even after loadouts/pets/etc. are renamed or deleted.
        config: describeBuildConfig(character, candidateFromCurrent(character, preset)),
      },
    });
  }

  function recordOptRun() {
    if (!optResult || !optPreset) return;
    const unit = scoreUnitFor(optResultGoal);
    rosterStore.addRunHistoryEntry('opt', {
      name: `${optPreset.name} · ${unit} +${optResult.improvementPct.toFixed(2)}%`,
      goalKind: optPreset.goal?.kind ?? null,
      presetId: optPreset.id,
      presetName: optPreset.name,
      headline: {
        unit,
        baseline: optResult.baseline.score,
        best: optResult.best.score,
        improvementPct: optResult.improvementPct,
        ichorSpent: optResult.ichorSpent,
      },
      detail: {
        presetName: optPreset.name,
        goal: optResultGoal,
        unit,
        baselineScore: optResult.baseline.score,
        bestScore: optResult.best.score,
        improvementPct: optResult.improvementPct,
        ichorSpent: optResult.ichorSpent,
        evals: optResult.evals,
        elapsedMs: optResult.elapsedMs,
        changes: optResult.changes.map((ch) => ({
          dimension: ch.dimension,
          from: ch.from,
          to: ch.to,
          detail: Array.isArray(ch.detail) ? ch.detail : [],
        })),
        // The RECOMMENDED build (not the current one) - comparing two saved
        // optimizations means comparing what each one proposed.
        config: describeBuildConfig(character, optResult.best.candidate),
      },
    });
  }

  const fmt = (n) => n.toFixed(2);
  const fmtDamage = (n) => formatFlat(Math.round(n));

  /** Damage-source tags come from the engine: base swings, double hits, and
   * one `sigil_<defId>` per sigil active. Resolve sigil ids to names. */
  function tagLabel(tag) {
    if (tag === 'swing') return 'Basic swings';
    if (tag === 'double_hit') return 'Double hits';
    if (tag.startsWith('sigil_')) {
      const def = (SIGILS_BY_CLASS[character.class] || []).find((d) => d.id === tag.slice(6));
      return def ? def.name : tag.slice(6);
    }
    return tag;
  }

  // [{tag, label, mean, pct}] rows for the breakdown, largest first (the
  // engine already sorts damageByTag descending).
  const damageBreakdown = $derived.by(() => {
    if (!simResult?.damageByTag) return [];
    const total = Object.values(simResult.damageByTag).reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return Object.entries(simResult.damageByTag).map(([tag, mean]) => ({
      tag,
      label: tagLabel(tag),
      mean,
      pct: (mean / total) * 100,
    }));
  });

  const histogramMax = $derived(simResult?.histogram ? Math.max(1, ...simResult.histogram.bins) : 1);
  const histBinLabel = (i) => {
    const h = simResult.histogram;
    const width = (h.max - h.min) / h.bins.length;
    return `${fmtDamage(h.min + i * width)} – ${fmtDamage(h.min + (i + 1) * width)}: ${h.bins[i]} runs`;
  };

  function runSim() {
    if (!preset || simRunning) return;
    simRunning = true;
    const stats = resolveEffectiveTotals(character, preset);
    // Equipped sigils' actives (nukes, DoTs, timed buffs) join the base
    // crit/double-hit effects; their passives are already inside `stats`.
    const effects = [...DEFAULT_EFFECTS, ...buildSigilEffects(character, preset, stats.spell_damage)];
    // One macrotask so the disabled/"Running…" state paints before the work.
    setTimeout(() => {
      try {
        simResult = runSimulation({
          stats,
          iterations,
          effects,
          durationSeconds: durationSeconds(),
          seed: enteredSeed(),
        });
        recordSimRun(); // auto-saved to the run history - no manual Save step
        setStatus?.(`Simulated ${iterations.toLocaleString('en-US')} fights`);
      } finally {
        simRunning = false;
      }
    }, 0);
  }

  // --- Stat weights (computed lazily when the panel is opened) ---
  let showWeights = $state(false);
  const statWeights = $derived(showWeights && preset ? computeStatWeights(character, preset) : []);
  const maxWeight = $derived(statWeights.length ? Math.max(0.0001, ...statWeights.map((w) => w.deltaDps)) : 1);

  /** Swap a runner-up build into the shown recommendation. */
  function promoteAlternative(alt) {
    optResult = {
      ...optResult,
      best: { ...optResult.best, score: alt.score, candidate: alt.candidate },
      changes: alt.changes,
      improvementPct: alt.improvementPct,
      topCandidates: optResult.topCandidates,
    };
    optVerify = null; // the verified numbers described the previous winner
  }

  function runCompare() {
    if (!cmpPresetA || !cmpPresetB || cmpRunning) return;
    cmpRunning = true;
    const statsA = resolveEffectiveTotals(character, cmpPresetA);
    const statsB = resolveEffectiveTotals(character, cmpPresetB);
    const effectsA = [...DEFAULT_EFFECTS, ...buildSigilEffects(character, cmpPresetA, statsA.spell_damage)];
    const effectsB = [...DEFAULT_EFFECTS, ...buildSigilEffects(character, cmpPresetB, statsB.spell_damage)];
    setTimeout(() => {
      try {
        cmpResult = compareSimulations({
          statsA,
          statsB,
          effectsA,
          effectsB,
          iterations,
          durationSeconds: durationSeconds(),
          seed: enteredSeed(),
        });
        recordCompareRun(); // auto-saved to the run history
        setStatus?.(`Compared ${cmpPresetA.name} vs ${cmpPresetB.name} over ${iterations.toLocaleString('en-US')} paired fights`);
      } finally {
        cmpRunning = false;
      }
    }, 0);
  }

  function recordCompareRun() {
    if (!cmpResult || !cmpPresetA || !cmpPresetB) return;
    rosterStore.addRunHistoryEntry('sim-compare', {
      name: `${cmpPresetA.name} vs ${cmpPresetB.name}`,
      goalKind: cmpPresetA.goal?.kind ?? null,
      presetId: cmpPresetA.id,
      presetName: cmpPresetA.name,
      headline: {
        aName: cmpPresetA.name,
        bName: cmpPresetB.name,
        aDps: cmpResult.a.meanDps,
        bDps: cmpResult.b.meanDps,
        deltaPct: cmpResult.delta.pct,
      },
      detail: {
        presetAName: cmpPresetA.name,
        presetBName: cmpPresetB.name,
        meanDpsA: cmpResult.a.meanDps,
        meanDpsB: cmpResult.b.meanDps,
        deltaDps: cmpResult.delta.meanDps,
        ciHalfWidthDps: cmpResult.delta.ciHalfWidthDps,
        deltaPct: cmpResult.delta.pct,
        iterations: cmpResult.iterations,
        durationSeconds: cmpResult.durationSeconds,
        seed: cmpResult.seed,
      },
    });
  }

  // A recommendation describes one specific preset - picking a different
  // preset to optimize makes any shown result stale.
  function onOptPresetChange() {
    optResult = null;
    optProgress = null;
    optVerify = null;
  }

  /** The optimizer's objective spec under the preset's Goal + the panel's Scoring settings (shared with the Relic Suggester). */
  function buildOptObjectiveSpec() {
    return optGoal === 'tank'
      ? { kind: 'tank', ehpWeight: optPreset?.goal?.ehpWeight ?? 0.5 }
      : optGoal === 'pvp'
        ? { kind: 'pvp-goal', weights: { ...(optPreset?.goal?.weights ?? {}) } }
        : optMode === 'accurate'
          ? { kind: 'pve-accurate', iterations: optAccuracy, durationSeconds: durationSeconds() }
          : { kind: 'pve-fast' };
  }

  async function runOptimizer() {
    if (!optPreset || optRunning) return;
    optRunning = true;
    optResult = null;
    optProgress = null;
    optVerify = null;
    optTask = runOptimizerTask(
      {
        character,
        preset: optPreset,
        ichorBudget: Math.max(0, parseFlat(ichorInput)),
        searchDimensions: { ...optDims },
        objectiveSpec: buildOptObjectiveSpec(),
      },
      { onProgress: (p) => (optProgress = p) }
    );
    try {
      const result = await optTask.promise;
      if (optGoal === 'dps' && optMode === 'accurate' && !result.aborted) {
        // The search's winner was picked from low-iteration scores (biased
        // upward - winner's curse); this is the honest before/after.
        optVerify = verifyDpsOutcome({
          character,
          preset: optPreset,
          candidate: result.best.candidate,
          iterations: 5000,
          durationSeconds: durationSeconds(),
        });
      }
      optResult = result;
      optResultGoal = optGoal;
      if (!result.aborted) recordOptRun(); // auto-saved; a cancelled search isn't a finished run
      setStatus?.(
        result.aborted
          ? 'Search cancelled — showing the best build found so far'
          : result.changes.length === 0
            ? 'Already optimal — no changes found'
            : `Found +${result.improvementPct.toFixed(2)}% ${scoreUnitFor(optGoal)} in ${result.elapsedMs}ms`
      );
    } catch (err) {
      setStatus?.(`Optimizer failed: ${err?.message || err}`);
    } finally {
      optRunning = false;
      optTask = null;
    }
  }

  function cancelOptimizer() {
    optTask?.cancel();
  }

  /**
   * Write the recommendation to the chosen preset (or a fresh one when
   * targetPresetId is null). Character-wide sources (talents/mount/glyphs/
   * awakening/transcendence) are overwritten either way.
   */
  function applyOptimized(candidate, targetPresetId) {
    const targetId = targetPresetId ?? rosterStore.addPreset(`${optPreset.name} (Optimized)`);
    if (!rosterStore.applyOptimizerCandidate(targetId, candidate)) return;
    const target = character.presets.find((p) => p.id === targetId);
    setStatus?.(
      targetPresetId ? `Overrode "${target?.name}" with the optimized build` : `Created "${target?.name}" from the optimized build`
    );
    // The recommendation is now a real preset - both result panels are stale.
    optResult = null;
    optProgress = null;
    optVerify = null;
    simResult = null;
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before opening Simulation.</p>
{:else if !preset}
  <p class="empty-hint">Create a preset first — the simulation runs on a preset's totals.</p>
{:else}
  <div class="sim-screen">
    <div class="sim-main">
    {#if panels.includes('sim')}
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
        <label class="control">
          <span class="micro-label">Duration (s)</span>
          <input type="text" inputmode="numeric" bind:value={durationInput} />
        </label>
        <label class="control">
          <span class="micro-label">Seed (blank = random)</span>
          <input type="text" inputmode="numeric" placeholder="random" bind:value={seedInput} />
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
            {#if simResult.histogram?.bins.length > 1}
              <div class="histogram" data-testid="sim-histogram" role="img" aria-label="Total damage histogram">
                {#each simResult.histogram.bins as count, i (i)}
                  <div class="hist-bin" title={histBinLabel(i)}>
                    <div class="hist-bar" style:height="{(count / histogramMax) * 100}%" class:empty={count === 0}></div>
                  </div>
                {/each}
              </div>
            {/if}
            <div class="dist-row mono">
              {#each [['min', simResult.totalDamage.min], ['p5', simResult.totalDamage.p5], ['p25', simResult.totalDamage.p25], ['median', simResult.totalDamage.p50], ['p75', simResult.totalDamage.p75], ['p95', simResult.totalDamage.p95], ['max', simResult.totalDamage.max]] as [label, value] (label)}
                <div class="dist-cell">
                  <span class="dist-label">{label}</span>
                  <span class="dist-value">{fmtDamage(value)}</span>
                </div>
              {/each}
            </div>
          </div>

          {#if damageBreakdown.length > 0}
            <div class="breakdown" data-testid="sim-breakdown">
              <span class="micro-label">Damage by source (mean per fight)</span>
              {#each damageBreakdown as row (row.tag)}
                <div class="breakdown-row">
                  <span class="breakdown-label">{row.label}</span>
                  <span class="breakdown-value mono">{fmtDamage(row.mean)}</span>
                  <span class="breakdown-pct mono">{row.pct.toFixed(1)}%</span>
                  <div class="breakdown-track"><div class="breakdown-fill" style:width="{row.pct}%"></div></div>
                </div>
              {/each}
            </div>
          {/if}

          <p class="observed mono">
            Observed: crit {simResult.observed.critRate.toFixed(1)}% · double hit
            {simResult.observed.doubleHitRate.toFixed(1)}% · {simResult.observed.meanSwings.toFixed(0)} swings/fight ·
            best run {fmtDamage(simResult.bestRun.totalDamage)} · worst run {fmtDamage(simResult.worstRun.totalDamage)} ·
            seed {simResult.seed} (enter it above to replay)
          </p>
        </div>
      {/if}
    </section>

    <section class="panel">
      <h2 class="subheading">Stat Weights</h2>
      <p class="subline">
        What one more point of each stat is worth on <strong>{preset.name}</strong>'s calculated
        totals, scored by the optimizer's own DPS formula. A capped or empty stat scoring ~0 means
        it can't help anymore — hunt something else on gear.
      </p>
      <div>
        <button type="button" class="btn-ghost" onclick={() => (showWeights = !showWeights)} data-testid="toggle-stat-weights">
          {showWeights ? 'Hide' : 'Compute Stat Weights'}
        </button>
      </div>
      {#if showWeights && statWeights.length}
        <div class="weights" data-testid="stat-weights">
          {#each statWeights as w (w.label)}
            <div class="weight-row">
              <span class="weight-label">{w.label} <span class="weight-unit">{w.unit}</span></span>
              <span class="weight-value mono">+{w.deltaDps.toFixed(2)} DPS</span>
              <span class="weight-pct mono">+{w.deltaPct.toFixed(2)}%</span>
              <div class="breakdown-track"><div class="breakdown-fill" style:width="{(w.deltaDps / maxWeight) * 100}%"></div></div>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    {/if}

    {#if panels.includes('compare')}
    <section class="panel">
      <h2 class="subheading">Compare Presets</h2>
      <p class="subline">
        Fights both presets through the same random rolls (paired runs), so the delta is free of
        between-run luck. Uses the iterations, duration and seed set above.
      </p>
      <div class="controls">
        <label class="control">
          <span class="micro-label">Preset A</span>
          <select bind:value={cmpPresetAId} disabled={cmpRunning} data-testid="cmp-preset-a">
            <option value={null} disabled>Select a preset…</option>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <label class="control">
          <span class="micro-label">Preset B</span>
          <select bind:value={cmpPresetBId} disabled={cmpRunning} data-testid="cmp-preset-b">
            <option value={null} disabled>Select a preset…</option>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <button
          type="button"
          class="btn-gold run-btn"
          onclick={runCompare}
          disabled={cmpRunning || !cmpPresetA || !cmpPresetB}
          data-testid="run-compare"
        >
          {cmpRunning ? 'Comparing…' : 'Compare'}
        </button>
      </div>

      {#if cmpResult && cmpPresetA && cmpPresetB}
        <div class="tiles" data-testid="cmp-results">
          <div class="tile">
            <span class="micro-label">{cmpPresetA.name} — Mean DPS</span>
            <span class="mono value">{fmt(cmpResult.a.meanDps)}</span>
          </div>
          <div class="tile">
            <span class="micro-label">{cmpPresetB.name} — Mean DPS</span>
            <span class="mono value">{fmt(cmpResult.b.meanDps)}</span>
          </div>
          <div class="tile">
            <span class="micro-label">B − A (95% CI)</span>
            <span
              class="mono value"
              class:delta-pos={cmpResult.delta.meanDps > 0}
              class:delta-neg={cmpResult.delta.meanDps < 0}
            >
              {cmpResult.delta.meanDps > 0 ? '+' : ''}{fmt(cmpResult.delta.meanDps)} ± {fmt(cmpResult.delta.ciHalfWidthDps)}
            </span>
          </div>
          <div class="tile">
            <span class="micro-label">Relative</span>
            <span class="mono value">{cmpResult.delta.pct > 0 ? '+' : ''}{cmpResult.delta.pct.toFixed(2)}%</span>
          </div>
        </div>
      {/if}
    </section>

    {/if}

    {#if panels.includes('optimizer')}
    <section class="panel">
      <h2 class="subheading">Build Optimizer</h2>
      {#if optGoal === 'tank'}
        <p class="subline">
          Searches every build dimension for the tankiest build — shown as a recommendation, never
          auto-applied. The game exposes no monster damage numbers, so the score is built only from
          your own stats: <strong>Effective HP</strong> (Health ÷ what DMG Reduction lets through — the
          buffer against ability spikes) and <strong>Sustainable Incoming DPS</strong> (the hardest raw
          hit-stream your regen + lifesteal can out-heal after DMG Reduction and Block).
        </p>
      {:else if optGoal === 'pvp'}
        <p class="subline">
          Searches every build dimension for the best PVP build under this preset's slider weights —
          shown as a recommendation, never auto-applied. No specific opponent is assumed: the score
          blends <strong>Maximum Damage</strong> (expected damage/s, Penetration valued against a
          reference Block), <strong>Damage Mitigation</strong> (how much of an incoming hit-stream your
          Miss, Blind, Paralyze, Block, DMG Reduction, Spell Resist and PVP Defense prevent) and
          <strong>Survivability</strong> (Health plus what regen + lifesteal recover over a fight).
        </p>
      {:else}
        <p class="subline">
          Searches loadouts, talents, pets, relics, sigils, stones, mounts, glyphs, awakening, and transcendence
          for the highest-DPS build — shown as a recommendation, never auto-applied. Fortress buffs are
          taken as set on the preset. Sigil actives (nukes, DoTs, timed buffs) count toward the score.
        </p>
      {/if}

      {#if optPreset?.manualTotals}
        <p class="manual-warning">
          ⚠ This preset uses Manual totals. The optimizer compares Calculated totals — your manual
          entries are ignored while searching.
        </p>
      {/if}
      {#if optPreset && optGoalKind === null}
        <p class="manual-warning" data-testid="goal-unassigned-notice">
          ⚠ This preset has no goal assigned yet — set one in the Presets screen. Running under the
          neutral DPS objective meanwhile.
        </p>
      {/if}

      <div class="controls">
        <label class="control">
          <span class="micro-label">Preset to optimize</span>
          <select bind:value={optPresetId} onchange={onOptPresetChange} disabled={optRunning} data-testid="opt-preset-select">
            <option value={null} disabled>Select a preset…</option>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <label class="control">
          <span class="micro-label">Extra Ichor</span>
          <input type="text" inputmode="numeric" bind:value={ichorInput} />
        </label>
        {#if optPreset}
          <div class="control" role="group" aria-label="Goal">
            <span class="micro-label">Goal — from preset</span>
            <span class="goal-readout" data-testid="opt-goal-readout"
              >{presetGoalLabel(optPreset.goal) ?? 'Unassigned'}{optPvpWeights
                ? ` · ${Math.round(optPvpWeights.damage)}/${Math.round(optPvpWeights.mitigation)}/${Math.round(optPvpWeights.survivability)}`
                : ''}</span
            >
          </div>
        {/if}
        {#if optPreset && optGoalKind === 'tank'}
          <label class="control">
            <span class="micro-label">Tank profile</span>
            <select
              value={tankProfileId}
              onchange={(e) => pickTankProfile(e.target.value)}
              disabled={optRunning}
              data-testid="tank-profile-select"
            >
              {#each TANK_PROFILES as p (p.id)}
                <option value={p.id}>{p.label}</option>
              {/each}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label class="control balance-control">
            <span class="micro-label">Balance — sustain {100 - tankEhpPct} / {tankEhpPct} HP pool</span>
            <Slider
              min={0}
              max={100}
              step={5}
              value={tankEhpPct}
              oninput={(v) => setTankEhpPct(v)}
              disabled={optRunning}
              ariaLabel="EHP versus sustain balance"
            />
          </label>
        {:else if optGoal === 'dps'}
          <div class="control" role="group" aria-label="Scoring mode">
            <span class="micro-label">Scoring</span>
            <div class="mode-toggle">
              <button
                type="button"
                class:selected={optMode === 'fast'}
                onclick={() => (optMode = 'fast')}
                disabled={optRunning}
              >
                Faster · closed-form
              </button>
              <button
                type="button"
                class:selected={optMode === 'accurate'}
                onclick={() => (optMode = 'accurate')}
                disabled={optRunning}
              >
                Slower · sim-verified
              </button>
            </div>
          </div>
          {#if optMode === 'accurate'}
            <label class="control">
              <span class="micro-label">Search accuracy</span>
              <select bind:value={optAccuracy} disabled={optRunning}>
                {#each OPT_ACCURACY_CHOICES as c (c.value)}
                  <option value={c.value}>{c.label}</option>
                {/each}
              </select>
            </label>
          {/if}
        {/if}
        {#if optRunning}
          <button type="button" class="btn-ghost run-btn" onclick={cancelOptimizer}>
            Cancel — keep best so far
          </button>
        {:else}
          <button type="button" class="btn-gold run-btn" onclick={runOptimizer} disabled={!optPreset}>
            Find Best Build
          </button>
        {/if}
      </div>

      <fieldset class="dims" disabled={optRunning}>
        <legend class="micro-label">Search these dimensions (unchecked = keep as-is)</legend>
        <div class="dims-grid">
          {#each SEARCH_DIMENSIONS as d (d.key)}
            <label class="dim-toggle">
              <input type="checkbox" bind:checked={optDims[d.key]} />
              <span>{d.label}</span>
            </label>
          {/each}
        </div>
      </fieldset>

      <p class="ichor-hint">Resetting transcendence is free, so the optimizer always rebuilds the board from scratch using the Ichor already invested in your current nodes — plus any extra you enter here.</p>

      {#if optRunning && optProgress}
        <p class="progress mono" role="status">
          {optProgress.phase} — {optProgress.evals.toLocaleString('en-US')} builds evaluated — best {fmt(optProgress.bestScore)}
          {scoreUnitFor(optGoal)}
        </p>
      {/if}

      {#if optResult}
        {#if optVerify}
          <div class="tiles" data-testid="opt-verify">
            <div class="tile">
              <span class="micro-label">Verified Mean DPS Now</span>
              <span class="mono value">{fmt(optVerify.before.meanDps)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Verified Mean DPS Optimized</span>
              <span class="mono value dps">{fmt(optVerify.after.meanDps)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Verified Over</span>
              <span class="mono value">{optVerify.before.iterations.toLocaleString('en-US')} fights</span>
            </div>
          </div>
        {/if}
        {#if tankBreakdown}
          <div class="tiles" data-testid="tank-breakdown">
            <div class="tile">
              <span class="micro-label">Effective HP</span>
              <span class="mono value">{fmtDamage(tankBreakdown.before.ehp)} → <span class="hps">{fmtDamage(tankBreakdown.after.ehp)}</span></span>
            </div>
            <div class="tile">
              <span class="micro-label">Sustainable Incoming DPS</span>
              <span class="mono value">{fmtDamage(tankBreakdown.before.sustainDps)} → <span class="hps">{fmtDamage(tankBreakdown.after.sustainDps)}</span></span>
            </div>
            <!-- A "Self-Healing / s" tile lived here until 2026-07-28. Removed
                 by owner decision: the number behind it is computeHps, which
                 the combat audit rates as unreliable (F4 - ignores overheal,
                 derives lifesteal from undefended DPS, sums two terms that
                 fail under different conditions). Displaying it lent it more
                 credibility than it has earned. It still feeds sustainDps
                 above as a ranking proxy, which is defensible; showing it as
                 a headline figure was not. To be redesigned properly. -->
          </div>
        {/if}
        {#if pvpBreakdown}
          <div class="tiles" data-testid="pvp-breakdown">
            <div class="tile">
              <span class="micro-label">Maximum Damage / s</span>
              <span class="mono value">{fmtDamage(pvpBreakdown.before.maxDamage)} → <span class="dps">{fmtDamage(pvpBreakdown.after.maxDamage)}</span></span>
            </div>
            <div class="tile">
              <span class="micro-label">Damage Mitigation ×</span>
              <span class="mono value">{pvpBreakdown.before.mitigation.toFixed(2)} → <span class="dps">{pvpBreakdown.after.mitigation.toFixed(2)}</span></span>
            </div>
            <div class="tile">
              <span class="micro-label">Survivability (HP)</span>
              <span class="mono value">{fmtDamage(pvpBreakdown.before.survivability)} → <span class="hps">{fmtDamage(pvpBreakdown.after.survivability)}</span></span>
            </div>
          </div>
        {/if}
        <SimulatedPresetCard
          result={optResult}
          {character}
          scoreUnit={scoreUnitFor(optResultGoal)}
          onApply={applyOptimized}
          onPromote={promoteAlternative}
          applyPresets={presets.map((p) => ({ id: p.id, name: p.name }))}
          applyDefaultId={optPreset?.id}
        />
      {/if}

      <RelicSuggesterPanel
        {character}
        preset={optPreset}
        buildObjectiveSpec={buildOptObjectiveSpec}
        scoreUnit={scoreUnitFor(optGoal)}
        formatScore={fmt}
        disabled={optRunning}
        {setStatus}
      />
    </section>
    {/if}
    </div>
  </div>
{/if}

<style>
  .empty-hint {
    color: var(--color-muted);
    padding-top: var(--space-6);
  }
  .sim-screen {
    max-width: 860px;
  }
  .sim-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
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
  .dims {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-3) var(--space-3);
    margin: 0;
  }
  .dims-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
  }
  .dim-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--color-muted);
    cursor: pointer;
    min-height: 24px;
  }
  .dims[disabled] .dim-toggle {
    opacity: 0.6;
    cursor: default;
  }
  .goal-readout {
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--color-gold-light);
    padding: 7px 2px;
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
  .tile .value.delta-pos {
    color: var(--color-upgrade, #57d98a);
  }
  .tile .value.delta-neg {
    color: var(--color-downgrade, #ff7a7a);
  }
  .tile .value .hps {
    color: var(--color-upgrade);
  }
  .balance-control {
    min-width: 200px;
  }
  /* .balance-control is a flex column, so .slider stretches on its own. */
  .distribution {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  /* Histogram: one flex cell per bin, thin bars, 2px gaps, single hue (one
     series - no legend needed), native title tooltip per bin. */
  .histogram {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 72px;
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-2) 0;
  }
  .hist-bin {
    flex: 1;
    height: 100%;
    display: flex;
    align-items: flex-end;
  }
  .hist-bar {
    width: 100%;
    min-height: 2px;
    background: var(--color-dps);
    border-radius: 2px 2px 0 0;
    opacity: 0.85;
  }
  .hist-bar.empty {
    background: transparent;
  }
  .hist-bin:hover .hist-bar {
    opacity: 1;
  }
  .breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .breakdown-row {
    display: grid;
    grid-template-columns: minmax(90px, 1fr) auto auto minmax(60px, 2fr);
    gap: var(--space-3);
    align-items: center;
    font-size: 12px;
  }
  .breakdown-label {
    color: var(--color-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .breakdown-value {
    color: var(--color-ink);
  }
  .breakdown-pct {
    color: var(--color-muted);
    font-size: 11px;
    min-width: 5ch;
    text-align: right;
  }
  .breakdown-track {
    height: 6px;
    border-radius: 3px;
    background: var(--color-field);
    overflow: hidden;
  }
  .breakdown-fill {
    height: 100%;
    background: var(--color-dps);
    border-radius: 3px;
    opacity: 0.85;
  }
  .weights {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .weight-row {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) auto auto minmax(60px, 2fr);
    gap: var(--space-3);
    align-items: center;
    font-size: 12px;
  }
  .weight-label {
    color: var(--color-ink);
  }
  .weight-unit {
    color: var(--color-muted);
    font-size: 11px;
  }
  .weight-value {
    color: var(--color-dps);
  }
  .weight-pct {
    color: var(--color-muted);
    font-size: 11px;
    min-width: 7ch;
    text-align: right;
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
