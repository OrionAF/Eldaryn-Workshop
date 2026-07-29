<script>
  /**
   * PvpScreen.svelte - Monte Carlo PVP duel simulator.
   *
   * Left: your side - one of your presets (effective totals + its equipped
   * sigils' actives). Right: a saved Opponent profile - class, manually
   * entered profile stats (their displayed in-game totals, so sigil passives
   * are already baked in), and up to 3 sigils with entered active numbers.
   *
   * Fights run in pvpSimulation.js: 60s or until death, with miss/block/
   * blind/paralyze/penetration/DMG-Reduction/PVP-rating mechanics, sigil
   * actives firing on cooldown (self-buffs at fight start, enemy-targeting
   * effects after the in-game 1s trigger delay), and sigil buffs allowed
   * to exceed stat caps for their duration. Results are view-state only.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import { runPvpSimulation, runTracedDuel, buildPvpSide, rateCiHalfWidth, PVP_HEALTH_MULTIPLIER } from '../lib/pvpSimulation.js';
  import { SEARCH_DIMENSIONS, candidateFromCurrent } from '../lib/optimizer.js';
  import { describeBuildConfig } from '../lib/buildConfig.js';
  import { runOptimizerTask } from '../lib/optimizerClient.js';
  import { verifyPvpWinRates, runPvpMatrix } from '../lib/pvpOptimizer.js';
  import { runGauntlet, buildBudget } from '../lib/pvpGauntlet.js';
  import SimulatedPresetCard from './SimulatedPresetCard.svelte';
  import GauntletResultPanel from './GauntletResultPanel.svelte';
  import RelicSuggesterPanel from './RelicSuggesterPanel.svelte';
  import { fieldsForTab, CLASSES, PRESET_SIGIL_CAP } from '../lib/constants.js';
  import { MAJOR_GLYPHS } from '../lib/glyphsData.js';
  import { SIGILS_BY_CLASS } from '../lib/sigilsData.js';
  import { sigilDamageInputs, activeSpecialGlyphIds } from '../lib/sigilEffects.js';
  import { formatStat, parseStat, formatFlat, parseFlat } from '../lib/format.js';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const presets = $derived(character.presets);
  const opponents = $derived(character.pvpOpponents || []);

  let selectedPresetId = $state(null);
  const preset = $derived(presets.find((p) => p.id === selectedPresetId) || presets[0] || null);

  let selectedOpponentId = $state(null);
  const opponent = $derived(opponents.find((o) => o.id === selectedOpponentId) || opponents[0] || null);

  // The optimizer never assumes a preset - the user must pick the one to
  // optimize explicitly (no first-preset fallback like the duel above).
  let optPresetId = $state(null);
  const optPreset = $derived(presets.find((p) => p.id === optPresetId) || null);

  // Passive-only sigils are omitted: their stats are already inside the
  // opponent's entered profile totals - only ACTIVE effects join the fight.
  const opponentSigilDefs = $derived((SIGILS_BY_CLASS[opponent?.class] || []).filter((d) => d.active));
  // Major glyphs only matter when the sigil they modify is equipped.
  const opponentGlyphDefs = $derived(MAJOR_GLYPHS.filter((g) => (opponent?.sigilIds || []).includes(g.sigilId)));
  const opponentStatFields = $derived(fieldsForTab('profile', opponent?.class));

  let iterationsInput = $state('1000');
  const iterationsCount = () => Math.min(50000, Math.max(100, parseFlat(iterationsInput) || 1000));
  let durationInput = $state('60');
  const durationSeconds = () => Math.max(1, parseFlat(durationInput) || 60);
  // Not a choice any more: since the Jul 2026 patch every fighter in Arena and
  // Clan War enters with the same ×8 pool (no level-45 breakpoint), so the old
  // ×1/×2/×3 mode toggle would only let you model fights that cannot happen.
  const healthMultiplier = PVP_HEALTH_MULTIPLIER;
  // Blank = a fresh random seed each run; entering the seed echoed in a
  // previous result replays that exact batch of duels.
  let seedInput = $state('');
  const enteredSeed = () => (seedInput.trim() === '' ? undefined : Number(seedInput) >>> 0);

  let renaming = $state(false);
  let renameInput = $state('');
  let confirmingDelete = $state(false);

  let simRunning = $state(false);
  let simResult = $state(null);
  let traceResult = $state(null); // "sample fight" combat log (view-state)
  let lastDuelSides = null; // the built sides of the last duel batch, for the trace (not view state)

  // --- Matchup matrix (every preset x every opponent; view-state only) ---
  const MATRIX_ITERATIONS = 1000;
  let matrixRunning = $state(false);
  let matrixProgress = $state(null);
  let matrixResult = $state(null);
  let matrixAbort = null; // AbortController (not view state)

  // Build-optimizer view state (recommendations only, never persisted).
  // Each candidate is SCREENED with cheap seed-A duels; a candidate that
  // beats the incumbent is CONFIRMED with heavier seed-B duels before it is
  // adopted (see pvpOptimizer.js's two-stage note).
  const PVP_ACCURACY_CHOICES = [
    { label: 'Quick (100 screen / 300 confirm)', screen: 100, confirm: 300 },
    { label: 'Standard (150 screen / 500 confirm)', screen: 150, confirm: 500 },
    { label: 'Thorough (300 screen / 1000 confirm)', screen: 300, confirm: 1000 },
  ];
  let pvpAccuracyIdx = $state(1);
  const VERIFY_ITERATIONS = 1000; // final before/after win-chance check
  let ichorInput = $state('0');
  // Multi-opponent optimization: null = follow the duel opponent above;
  // touching a checkbox pins an explicit selection.
  let optOpponentIds = $state(null);
  let optAggregate = $state('mean'); // 'mean' (ladder average) | 'min' (worst matchup)
  const selectedOptOpponents = $derived.by(() => {
    const ids = optOpponentIds ?? (opponent ? [opponent.id] : []);
    return opponents.filter((o) => ids.includes(o.id) && o.class);
  });
  function toggleOptOpponent(id, checked) {
    const ids = new Set(optOpponentIds ?? (opponent ? [opponent.id] : []));
    if (checked) ids.add(id);
    else ids.delete(id);
    optOpponentIds = [...ids];
  }
  // Aggregate a per-opponent verify list into one headline rate.
  const aggRate = (entries, which) => {
    const rates = entries.map((e) => e[which].winRate);
    return optAggregate === 'min' ? Math.min(...rates) : rates.reduce((a, b) => a + b, 0) / rates.length;
  };
  // Per-dimension search locks. Awakening starts LOCKED: resetting the path
  // costs real resources in-game, so searching it is opt-in per run.
  let optDims = $state(Object.fromEntries(SEARCH_DIMENSIONS.map((d) => [d.key, d.key !== 'awakening'])));
  let optRunning = $state(false);
  let optProgress = $state(null);
  let optResult = $state(null);
  let optVerify = $state(null);
  let optTask = null; // in-flight { cancel } handle (not view state)

  // Archetype-gauntlet validation of the optimizer finalists (on-demand).
  let gauntletRunning = $state(false);
  let gauntletProgress = $state(null); // { done, total }
  let gauntletResult = $state(null);
  let gauntletBudgetInput = $state('');
  let gauntletAbort = null;

  // Any change to the matchup (opponent edits, sigil toggles…) invalidates
  // both the duel results and the optimizer's recommendation.
  function clearResults() {
    simResult = null;
    traceResult = null;
    lastDuelSides = null;
    optResult = null;
    optVerify = null;
    optProgress = null;
    gauntletResult = null;
    gauntletProgress = null;
    matrixResult = null;
    matrixProgress = null;
  }

  // Character switches invalidate everything shown here.
  let lastCharacterId = $state(null);
  $effect(() => {
    if (character.id !== lastCharacterId) {
      lastCharacterId = character.id;
      selectedPresetId = null;
      optPresetId = null;
      selectedOpponentId = null;
      optOpponentIds = null;
      clearResults();
      renaming = false;
      confirmingDelete = false;
    }
  });

  // A recommendation describes one preset-vs-opponents matchup - switching
  // the preset, the opponent selection, or the aggregation makes it stale.
  let lastMatchupKey = $state(null);
  $effect(() => {
    const key = `${optPreset?.id ?? ''}|${selectedOptOpponents.map((o) => o.id).join(',')}|${optAggregate}`;
    if (key !== lastMatchupKey) {
      lastMatchupKey = key;
      optResult = null;
      optVerify = null;
      optProgress = null;
    }
  });

  const fmtPct = (n) => `${n.toFixed(1)}%`;
  // Rate with its 95% confidence half-width: "62.4% ± 3.0" - the honest
  // precision of a Monte Carlo rate over n duels.
  const fmtPctCi = (n, iters) => `${n.toFixed(1)}% ± ${rateCiHalfWidth(n, iters).toFixed(1)}`;
  const fmtSec = (n) => `${n.toFixed(1)}s`;
  const fmtDamage = (n) => formatFlat(Math.round(n));

  function addOpponent() {
    selectedOpponentId = rosterStore.addOpponent();
    clearResults();
  }

  function duplicateOpponent() {
    const id = rosterStore.duplicateOpponent(opponent.id);
    if (id) {
      selectedOpponentId = id;
      clearResults();
      setStatus?.('Duplicated opponent');
    }
  }

  function snapshotPreset(presetId) {
    if (!presetId) return;
    const id = rosterStore.addOpponentFromPreset(presetId);
    if (id) {
      selectedOpponentId = id;
      clearResults();
      setStatus?.('Snapshotted preset as an opponent');
    }
  }

  function deleteOpponent() {
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    rosterStore.deleteOpponent(opponent.id);
    selectedOpponentId = null;
    confirmingDelete = false;
    clearResults();
  }

  function commitRename() {
    if (renameInput.trim()) rosterStore.renameOpponent(opponent.id, renameInput);
    renaming = false;
  }

  function toggleSigil(sigilId, equipped) {
    if (!rosterStore.toggleOpponentSigil(opponent.id, sigilId, equipped) && equipped) {
      setStatus?.(`An opponent can only have ${PRESET_SIGIL_CAP} sigils`);
    }
  }

  function sigilFields(def) {
    const inputs = sigilDamageInputs(def);
    return {
      stats: def.active?.stats?.map((s) => s.statKey) || [],
      damage: inputs.damage || (def.active && def.active.stats.length === 0),
      tickDamage: inputs.tickDamage,
      regenDebuffPct: inputs.regenDebuffPct,
    };
  }

  function runSim() {
    if (!preset || !opponent?.class || simRunning) return;
    simRunning = true;
    const player = buildPvpSide({
      name: character.name,
      stats: resolveEffectiveTotals(character, preset),
      characterClass: character.class,
      sigilIds: preset.sigilIds,
      sigilValues: character.sigilValues,
      specialGlyphIds: activeSpecialGlyphIds(character, preset),
    });
    const enemy = buildPvpSide({
      name: opponent.name,
      stats: opponent.stats,
      characterClass: opponent.class,
      sigilIds: opponent.sigilIds,
      sigilValues: opponent.sigilValues,
      specialGlyphIds: opponent.specialGlyphIds || [],
    });
    lastDuelSides = { player, enemy };
    traceResult = null;
    const iterations = iterationsCount();
    // One macrotask so the disabled/"Fighting…" state paints before the work.
    setTimeout(() => {
      try {
        simResult = runPvpSimulation({
          player,
          opponent: enemy,
          iterations,
          durationSeconds: durationSeconds(),
          healthMultiplier,
          seed: enteredSeed(),
        });
        recordDuelRun(); // auto-saved to the run history - no manual Save step
        setStatus?.(`Fought ${iterations.toLocaleString('en-US')} duels vs ${opponent.name}`);
      } finally {
        simRunning = false;
      }
    }, 0);
  }

  async function runMatrix() {
    if (matrixRunning || simRunning || optRunning) return;
    matrixRunning = true;
    matrixResult = null;
    matrixProgress = null;
    matrixAbort = new AbortController();
    try {
      matrixResult = await runPvpMatrix({
        character,
        presets,
        opponents,
        durationSeconds: durationSeconds(),
        healthMultiplier,
        iterations: MATRIX_ITERATIONS,
        onProgress: (p) => (matrixProgress = p),
        signal: matrixAbort.signal,
      });
      recordMatrixRun(); // auto-saved (skips aborted matrices internally)
      setStatus?.(
        matrixResult.aborted
          ? 'Matrix cancelled — showing the finished cells'
          : `Ran ${presets.length} × ${opponents.length} matchups at ${MATRIX_ITERATIONS.toLocaleString('en-US')} duels each`
      );
    } finally {
      matrixRunning = false;
      matrixAbort = null;
      matrixProgress = null;
    }
  }

  function cancelMatrix() {
    matrixAbort?.abort();
  }

  const matrixCellClass = (cell) =>
    cell == null ? '' : cell.winRate >= 55 ? 'good' : cell.winRate <= 45 ? 'bad' : '';

  /** Replay duel #1 of the shown batch with the event trace on. */
  function showSampleFight() {
    if (!simResult || !lastDuelSides) return;
    traceResult = runTracedDuel({
      player: lastDuelSides.player,
      opponent: lastDuelSides.enemy,
      durationSeconds: simResult.durationSeconds,
      healthMultiplier: simResult.healthMultiplier,
      seed: simResult.seed,
    });
    recordSampleFight(); // auto-saved with its capped combat timeline
  }

  /** Damage-source tags: base swings, double hits, thorns, `sigil_<defId>`. */
  function tagLabel(tag, characterClass) {
    if (tag === 'swing') return 'Basic swings';
    if (tag === 'double_hit') return 'Double hits';
    if (tag === 'thorns') return 'Thorns';
    if (tag.startsWith('sigil_')) {
      const def = (SIGILS_BY_CLASS[characterClass] || []).find((d) => d.id === tag.slice(6));
      return def ? def.name : tag.slice(6);
    }
    return tag;
  }

  function breakdownRows(side, characterClass) {
    const total = Object.values(side.damageByTag || {}).reduce((a, b) => a + b, 0);
    if (total <= 0) return [];
    return Object.entries(side.damageByTag).map(([tag, mean]) => ({
      tag,
      label: tagLabel(tag, characterClass),
      mean,
      pct: (mean / total) * 100,
    }));
  }

  /** One combat-log event -> a readable line. */
  function traceLine(ev) {
    const name = ev.side === 'player' ? 'You' : opponent?.name || 'Opponent';
    const other = ev.side === 'player' ? opponent?.name || 'Opponent' : 'you';
    switch (ev.kind) {
      case 'damage': {
        const src =
          ev.tag === 'swing' ? 'hit' :
          ev.tag === 'double_hit' ? 'double-hit' :
          ev.tag === 'thorns' ? 'thorns-reflected onto' :
          `${tagLabel(ev.tag, ev.side === 'player' ? character.class : opponent?.class)} hit`;
        const qual = ev.crit ? ' (CRIT)' : ev.blocked ? ' (blocked — penetration only)' : '';
        return `${name} ${src} ${other} for ${fmtDamage(ev.amount)}${qual}`;
      }
      case 'dodge':
        return `${name} dodged`;
      case 'block':
        return `${name} blocked the hit completely`;
      case 'heal':
        return `${name} healed ${fmtDamage(ev.amount)}`;
      case 'blind':
        return `${name} inflicted a blind`;
      case 'paralyze':
        return `${name} paralyzed ${other}`;
      case 'blinded-swing':
        return `${name} swung blind — no damage`;
      case 'paralyzed-swing':
        return `${name} was paralyzed — swing skipped`;
      case 'sigil':
        return `${name} activated ${ev.name}`;
      case 'death':
        return `${name} died`;
      default:
        return ev.kind;
    }
  }

  /** Fresh-seed full-fidelity before/after per selected opponent. */
  function verifySelected(candidate) {
    return selectedOptOpponents.map((opp) => ({
      name: opp.name,
      ...verifyPvpWinRates({
        character,
        preset: optPreset,
        candidate,
        opponent: opp,
        healthMultiplier,
        durationSeconds: durationSeconds(),
        iterations: VERIFY_ITERATIONS,
      }),
    }));
  }

  /** The PVP objective spec under the panel's current opponent/accuracy settings (shared with the Relic Suggester). */
  function buildPvpObjectiveSpec() {
    const accuracy = PVP_ACCURACY_CHOICES[pvpAccuracyIdx];
    return {
      kind: 'pvp',
      opponents: selectedOptOpponents,
      aggregate: optAggregate,
      healthMultiplier,
      durationSeconds: durationSeconds(),
      screenIterations: accuracy.screen,
      confirmIterations: accuracy.confirm,
    };
  }

  async function runOptimizer() {
    if (!optPreset || selectedOptOpponents.length === 0 || optRunning || simRunning) return;
    optRunning = true;
    optResult = null;
    optVerify = null;
    optProgress = null;
    // Candidates are screened with cheap paired duels and confirmed on a
    // second seed before adoption; the search runs in a Web Worker.
    optTask = runOptimizerTask(
      {
        character,
        preset: optPreset,
        ichorBudget: Math.max(0, parseFlat(ichorInput)),
        searchDimensions: { ...optDims },
        objectiveSpec: buildPvpObjectiveSpec(),
      },
      { onProgress: (p) => (optProgress = p) }
    );
    try {
      const result = await optTask.promise;
      // The winner is re-verified at full fidelity on a fresh seed - the
      // honest before/after, free of the search's winner's-curse bias.
      optVerify = verifySelected(result.best.candidate);
      optResult = result;
      if (!result.aborted) recordPvpOptRun(); // auto-saved; a cancelled search isn't a finished run
      const vs = selectedOptOpponents.map((o) => o.name).join(' + ');
      setStatus?.(
        result.aborted
          ? 'Search cancelled — showing the best build found so far'
          : result.changes.length === 0
            ? 'Already optimal for this matchup — no changes found'
            : `Win chance ${aggRate(optVerify, 'before').toFixed(1)}% → ${aggRate(optVerify, 'after').toFixed(1)}% vs ${vs}`
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

  /** Swap a runner-up build into the shown recommendation and re-verify it. */
  function promoteAlternative(alt) {
    if (!optPreset || selectedOptOpponents.length === 0) return;
    optResult = {
      ...optResult,
      best: { ...optResult.best, score: alt.score, candidate: alt.candidate },
      changes: alt.changes,
      improvementPct: alt.improvementPct,
      topCandidates: optResult.topCandidates,
    };
    optVerify = verifySelected(alt.candidate);
  }

  /** Overwrite the preset chosen for optimization (+ character-wide sources) with the recommendation. */
  function applyOptimized(candidate) {
    if (!optPreset || !rosterStore.applyOptimizerCandidate(optPreset.id, candidate)) return;
    setStatus?.(`Applied optimized build to "${optPreset.name}"`);
    clearResults(); // the recommendation is now the current build
  }

  // --- Auto-saved run history (persisted; rendered by the Simulations Dashboard) ---

  function recordDuelRun() {
    if (!simResult || !preset || !opponent) return;
    rosterStore.addRunHistoryEntry('pvp-sim', {
      name: `${preset.name} vs ${opponent.name} · ${simResult.winRate.toFixed(1)}% win`,
      goalKind: preset.goal?.kind ?? null,
      presetId: preset.id,
      presetName: preset.name,
      headline: {
        opponentName: opponent.name,
        winRate: simResult.winRate,
        killRate: simResult.killRate,
        meanTimeToKill: simResult.killRate > 0 ? simResult.timeToKill.mean : null,
      },
      detail: {
        presetId: preset.id,
        presetName: preset.name,
        opponentId: opponent.id,
        opponentName: opponent.name,
        iterations: simResult.iterations,
        durationSeconds: simResult.durationSeconds,
        healthMultiplier,
        seed: simResult.seed,
        winRate: simResult.winRate,
        lossRate: simResult.lossRate,
        drawRate: simResult.drawRate,
        killRate: simResult.killRate,
        mutualKillRate: simResult.mutualKillRate,
        meanTimeToKill: simResult.killRate > 0 ? simResult.timeToKill.mean : null,
        playerDamageMean: simResult.player.damageDealt.mean,
        playerHpLeftPct: simResult.player.hpRemainingPct.mean,
        // The build as fought, resolved to display text NOW - names keep
        // meaning even after loadouts/pets/etc. are renamed or deleted.
        config: describeBuildConfig(character, candidateFromCurrent(character, preset)),
      },
    });
  }

  // A stored combat timeline is capped so traced fights can't dominate the
  // single-localStorage-key state blob (a 60s duel can log thousands of events).
  const TIMELINE_EVENT_CAP = 400;

  /** The traced sample fight is its own history entry - the one place a per-run combat timeline is persisted. */
  function recordSampleFight() {
    if (!traceResult || !preset || !opponent) return;
    rosterStore.addRunHistoryEntry('pvp-sim', {
      name: `${preset.name} vs ${opponent.name} · sample fight`,
      goalKind: preset.goal?.kind ?? null,
      presetId: preset.id,
      presetName: preset.name,
      headline: { opponentName: opponent.name, sample: true },
      detail: {
        traced: true,
        presetName: preset.name,
        opponentName: opponent.name,
        durationSeconds: simResult?.durationSeconds,
        healthMultiplier: simResult?.healthMultiplier,
        seed: traceResult.seed,
        winner: traceResult.run?.winner ?? null,
        timeline: traceResult.events.slice(0, TIMELINE_EVENT_CAP),
      },
    });
  }

  function recordPvpOptRun() {
    if (!optResult || !optVerify?.length || !optPreset) return;
    const vsNames = optVerify.map((v) => v.name).join(' + ');
    const before = aggRate(optVerify, 'before');
    const after = aggRate(optVerify, 'after');
    rosterStore.addRunHistoryEntry('pvp-opt', {
      name: `${optPreset.name} vs ${vsNames} · ${before.toFixed(1)}% → ${after.toFixed(1)}%`,
      goalKind: optPreset.goal?.kind ?? null,
      presetId: optPreset.id,
      presetName: optPreset.name,
      headline: { opponents: vsNames, baselineWinRate: before, bestWinRate: after, improvementPct: optResult.improvementPct },
      detail: {
        presetName: optPreset.name,
        opponentName: vsNames,
        aggregate: optVerify.length > 1 ? optAggregate : undefined,
        perOpponent: optVerify.map((v) => ({ name: v.name, before: v.before.winRate, after: v.after.winRate })),
        healthMultiplier,
        beforeWinRate: before,
        afterWinRate: after,
        verifyIterations: VERIFY_ITERATIONS,
        evals: optResult.evals,
        elapsedMs: optResult.elapsedMs,
        changes: optResult.changes.map((ch) => ({
          dimension: ch.dimension,
          from: ch.from,
          to: ch.to,
          detail: Array.isArray(ch.detail) ? ch.detail : [],
        })),
        // The RECOMMENDED build (not the current one).
        config: describeBuildConfig(character, optResult.best.candidate),
      },
    });
  }

  // --- Archetype gauntlet: validate the optimizer finalists ---
  const gauntletFinalists = $derived(optResult ? [optResult.best, ...(optResult.topCandidates ?? [])] : []);
  const gauntletDefaultBudget = $derived(optPreset ? buildBudget(character, optPreset) : 0);

  function gauntletLabel(i) {
    return i === 0 ? 'Recommended' : `Runner-up ${i}`;
  }

  async function runGauntletValidation() {
    if (!optResult || !optPreset || gauntletRunning) return;
    gauntletRunning = true;
    gauntletResult = null;
    gauntletProgress = null;
    gauntletAbort = new AbortController();
    const budget = Math.max(0, parseFlat(gauntletBudgetInput)) || gauntletDefaultBudget;
    try {
      const report = await runGauntlet({
        character,
        preset: optPreset,
        finalists: gauntletFinalists,
        budget,
        onProgress: (p) => (gauntletProgress = p),
        signal: gauntletAbort.signal,
      });
      if (report?.aborted) {
        setStatus?.('Gauntlet cancelled');
      } else {
        gauntletResult = report;
        recordGauntletRun(report);
        setStatus?.(
          report.contradiction?.flagged
            ? 'Gauntlet done — a runner-up out-duels the closed-form pick (see the flag)'
            : 'Gauntlet done — the closed-form pick holds up in duels'
        );
      }
    } catch (err) {
      setStatus?.(`Gauntlet failed: ${err?.message || err}`);
    } finally {
      gauntletRunning = false;
      gauntletProgress = null;
      gauntletAbort = null;
    }
  }

  function cancelGauntlet() {
    gauntletAbort?.abort();
  }

  function recordGauntletRun(report) {
    const best = report.finalists.reduce((a, b) => (b.overallWinRate > (a?.overallWinRate ?? -1) ? b : a), null);
    rosterStore.addRunHistoryEntry('pvp-gauntlet', {
      name: `${optPreset.name} · archetype gauntlet`,
      goalKind: optPreset.goal?.kind ?? null,
      presetId: optPreset.id,
      presetName: optPreset.name,
      headline: {
        bestWinRate: best?.overallWinRate ?? null,
        archetypeCount: report.finalists[0]?.perArchetype.length ?? 0,
        contradiction: !!report.contradiction?.flagged,
      },
      detail: {
        budget: report.budget,
        iterations: report.iterations,
        contradiction: report.contradiction,
        finalists: report.finalists.map((f) => ({
          label: gauntletLabel(f.index),
          score: f.score,
          overallWinRate: f.overallWinRate,
          perArchetype: f.perArchetype.map((a) => ({ archetypeId: a.archetypeId, name: a.name, class: a.class, winRate: a.winRate, ci: a.ci })),
        })),
      },
    });
  }

  function recordMatrixRun() {
    if (!matrixResult || matrixResult.aborted) return;
    const cells = matrixResult.rows.flatMap((row) => row.cells.filter(Boolean).map((cell) => ({ row, cell })));
    const best = cells.reduce((a, b) => (b.cell.winRate > (a?.cell.winRate ?? -1) ? b : a), null);
    rosterStore.addRunHistoryEntry('pvp-matrix', {
      name: `Matrix · ${presets.length} presets × ${opponents.length} opponents`,
      headline: {
        presetCount: presets.length,
        opponentCount: opponents.length,
        bestPresetName: best?.row.presetName ?? '',
        bestWinRate: best?.cell.winRate ?? null,
      },
      detail: {
        iterations: matrixResult.iterations,
        durationSeconds: matrixResult.durationSeconds,
        healthMultiplier: matrixResult.healthMultiplier,
        seed: matrixResult.seed,
        opponentNames: opponents.map((o) => o.name),
        rows: matrixResult.rows.map((row) => ({
          presetName: row.presetName,
          cells: row.cells.map((cell) => (cell ? { winRate: cell.winRate, lossRate: cell.lossRate, drawRate: cell.drawRate } : null)),
        })),
      },
    });
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before opening PVP.</p>
{:else if !preset}
  <p class="empty-hint">Create a preset first — your side of the fight uses a preset's totals.</p>
{:else}
  <div class="pvp-screen">
    <div class="pvp-main">
    <section class="panel">
      <h2 class="subheading">Duel Setup</h2>
      <p class="subline">
        The fight runs for the chosen duration or until someone dies — misses, blocks, blinds,
        paralyzes and sigils are rolled per swing. Sigil stat buffs can push a capped stat past its
        cap while they last.
      </p>

      <div class="controls">
        <label class="control">
          <span class="micro-label">Your Preset</span>
          <select bind:value={selectedPresetId}>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <label class="control">
          <span class="micro-label">Opponent</span>
          <select bind:value={selectedOpponentId} disabled={opponents.length === 0}>
            {#each opponents as o (o.id)}
              <option value={o.id}>{o.name}</option>
            {/each}
          </select>
        </label>
        <label class="control">
          <span class="micro-label">Iterations</span>
          <input class="num-input" type="text" inputmode="numeric" bind:value={iterationsInput} />
        </label>
        <label class="control">
          <span class="micro-label">Duration (s)</span>
          <input class="num-input" type="text" inputmode="numeric" bind:value={durationInput} />
        </label>
        <div class="control">
          <span class="micro-label">Health</span>
          <span
            class="hp-mult"
            title="Arena and Clan War give every fighter ×{healthMultiplier} their Health. Healing (HP Regen, shields) is still sized off your original max HP."
          >
            ×{healthMultiplier} <span class="hp-mult-note">PVP pool</span>
          </span>
        </div>
        <label class="control">
          <span class="micro-label">Seed (blank = random)</span>
          <input class="seed-input" type="text" inputmode="numeric" placeholder="random" bind:value={seedInput} />
        </label>
        <button
          type="button"
          class="btn-gold run-btn"
          onclick={runSim}
          disabled={simRunning || optRunning || !opponent?.class}
        >
          {simRunning ? 'Fighting…' : 'Run Duel'}
        </button>
      </div>
      {#if opponent && !opponent.class}
        <p class="hint">Pick the opponent's class below before running.</p>
      {/if}

      {#if simResult}
        <div class="results" data-testid="pvp-results">
          <div class="tiles">
            <div class="tile">
              <span class="micro-label">Win Rate</span>
              <span class="mono value win">{fmtPctCi(simResult.winRate, simResult.iterations)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Loss Rate</span>
              <span class="mono value loss">{fmtPctCi(simResult.lossRate, simResult.iterations)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Draws</span>
              <span class="mono value">{fmtPct(simResult.drawRate)}</span>
            </div>
            <div class="tile">
              <span class="micro-label">Mean Time to Kill</span>
              <span class="mono value">{simResult.killRate > 0 ? fmtSec(simResult.timeToKill.mean) : '—'}</span>
            </div>
          </div>

          <div class="side-stats mono">
            <div class="side-row">
              <span class="side-label">You</span>
              <span>dmg {fmtDamage(simResult.player.damageDealt.mean)}</span>
              <span>HP left {fmtPct(simResult.player.hpRemainingPct.mean)}</span>
              <span>crit {simResult.player.perRun.crits.toFixed(1)}/fight</span>
              <span>dodged by enemy {simResult.player.perRun.dodgedByEnemy.toFixed(1)}</span>
              <span>blocked {simResult.player.perRun.blockedByEnemy.toFixed(1)}</span>
              <span>blinds {simResult.player.perRun.blindsInflicted.toFixed(1)}</span>
              <span>paralyzes {simResult.player.perRun.paralyzesInflicted.toFixed(1)}</span>
            </div>
            <div class="side-row">
              <span class="side-label">{opponent.name}</span>
              <span>dmg {fmtDamage(simResult.opponent.damageDealt.mean)}</span>
              <span>HP left {fmtPct(simResult.opponent.hpRemainingPct.mean)}</span>
              <span>crit {simResult.opponent.perRun.crits.toFixed(1)}/fight</span>
              <span>dodged by you {simResult.opponent.perRun.dodgedByEnemy.toFixed(1)}</span>
              <span>blocked {simResult.opponent.perRun.blockedByEnemy.toFixed(1)}</span>
              <span>blinds {simResult.opponent.perRun.blindsInflicted.toFixed(1)}</span>
              <span>paralyzes {simResult.opponent.perRun.paralyzesInflicted.toFixed(1)}</span>
            </div>
          </div>

          <p class="observed mono">
            {fmtPct(simResult.killRate)} of duels ended in a kill ·
            {fmtPct(simResult.mutualKillRate)} mutual kills (count as losses) ·
            seed {simResult.seed} (enter it above to replay) ·
            damage p5–p95 {fmtDamage(simResult.player.damageDealt.p5)}–{fmtDamage(simResult.player.damageDealt.p95)}
          </p>

          <details class="duel-details" data-testid="duel-details">
            <summary class="micro-label">Details — damage sources, healing, spreads</summary>
            <div class="details-grid">
              {#each [{ label: 'You', side: simResult.player, cls: character.class }, { label: opponent.name, side: simResult.opponent, cls: opponent.class }] as entry (entry.label)}
                <div class="details-side">
                  <span class="side-label">{entry.label}</span>
                  <div class="detail-row mono"><span>Healed / fight</span><span>{fmtDamage(entry.side.perRun.healed)}</span></div>
                  <div class="detail-row mono"><span>Swings / fight</span><span>{entry.side.perRun.swings.toFixed(1)}</span></div>
                  <div class="detail-row mono"><span>Damage min · median · max</span><span>{fmtDamage(entry.side.damageDealt.min)} · {fmtDamage(entry.side.damageDealt.p50)} · {fmtDamage(entry.side.damageDealt.max)}</span></div>
                  <div class="detail-row mono"><span>HP left min · median · max</span><span>{fmtPct(entry.side.hpRemainingPct.min)} · {fmtPct(entry.side.hpRemainingPct.p50)} · {fmtPct(entry.side.hpRemainingPct.max)}</span></div>
                  {#each breakdownRows(entry.side, entry.cls) as row (row.tag)}
                    <div class="breakdown-row">
                      <span class="breakdown-label">{row.label}</span>
                      <span class="breakdown-value mono">{fmtDamage(row.mean)}</span>
                      <span class="breakdown-pct mono">{row.pct.toFixed(1)}%</span>
                      <div class="breakdown-track"><div class="breakdown-fill" style:width="{row.pct}%"></div></div>
                    </div>
                  {/each}
                </div>
              {/each}
            </div>
          </details>

          <div class="result-actions">
            <button type="button" class="btn-ghost" onclick={showSampleFight} data-testid="show-sample-fight">
              Show sample fight
            </button>
          </div>

          {#if traceResult}
            <div class="combat-log" data-testid="combat-log">
              <p class="log-head mono">
                Duel #1 of seed {traceResult.seed} — winner:
                {traceResult.run.winner === 'player' ? 'You' : traceResult.run.winner === 'opponent' ? opponent.name : 'Draw'}
                · ended at {traceResult.run.endTime.toFixed(1)}s
              </p>
              <ol class="log-list mono">
                {#each traceResult.events as ev, i (i)}
                  <li class:you={ev.side === 'player'}>
                    <span class="log-t">{ev.t.toFixed(2)}s</span>
                    <span>{traceLine(ev)}</span>
                  </li>
                {/each}
              </ol>
            </div>
          {/if}
        </div>
      {/if}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2 class="subheading">Matchup Matrix</h2>
        {#if matrixRunning}
          <button type="button" class="btn-ghost" onclick={cancelMatrix}>Cancel</button>
        {:else}
          <button
            type="button"
            class="btn-gold"
            onclick={runMatrix}
            disabled={simRunning || optRunning || !opponents.some((o) => o.class)}
            data-testid="run-matrix"
          >
            Run Matrix
          </button>
        {/if}
      </div>
      <p class="subline">
        Every preset against every saved opponent — {MATRIX_ITERATIONS.toLocaleString('en-US')} duels
        per cell on one shared seed, using the duration and health multiplier set above.
      </p>
      {#if matrixRunning && matrixProgress}
        <p class="progress mono" role="status">
          {matrixProgress.done} / {matrixProgress.total} matchups fought…
        </p>
      {/if}
      {#if matrixResult}
        <div class="matrix-scroll" data-testid="matrix-results">
          <table class="matrix mono">
            <thead>
              <tr>
                <th class="micro-label">Preset ↓ · Opponent →</th>
                {#each opponents as o (o.id)}
                  <th class="micro-label">{o.name}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each matrixResult.rows as row (row.presetId)}
                <tr>
                  <th class="matrix-preset">{row.presetName}</th>
                  {#each row.cells as cell, i (i)}
                    <td class={matrixCellClass(cell)} title={cell ? `win ${cell.winRate.toFixed(1)}% ± ${rateCiHalfWidth(cell.winRate, matrixResult.iterations).toFixed(1)} · loss ${cell.lossRate.toFixed(1)}% · draw ${cell.drawRate.toFixed(1)}%` : 'Opponent has no class'}>
                      {cell ? `${cell.winRate.toFixed(1)}%` : '—'}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if matrixResult.aborted}
          <p class="hint">Cancelled — unfinished matchups are missing.</p>
        {/if}
      {/if}
    </section>

    <section class="panel">
      <h2 class="subheading">Build Optimizer</h2>
      <p class="subline">
        Searches loadouts, talents, pets, relics, sigils, stones, mounts, glyphs, awakening, and
        transcendence for the build with the best chance of beating the selected opponent — or, with
        several opponents ticked, the best average (or worst-case) win rate across all of them.
        Shown as a recommendation, never auto-applied. Each candidate is scored by simulated duels,
        so a full search can take a few minutes.
      </p>

      {#if optPreset?.manualTotals}
        <p class="manual-warning">
          ⚠ This preset uses Manual totals. The optimizer compares Calculated totals — your manual
          entries are ignored while searching.
        </p>
      {/if}

      <div class="controls">
        <label class="control">
          <span class="micro-label">Preset to optimize</span>
          <select bind:value={optPresetId} disabled={optRunning} data-testid="opt-preset-select">
            <option value={null} disabled>Select a preset…</option>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
        </label>
        <label class="control">
          <span class="micro-label">Extra Ichor</span>
          <input class="ichor-input" type="text" inputmode="numeric" bind:value={ichorInput} />
        </label>
        <label class="control">
          <span class="micro-label">Search accuracy</span>
          <select bind:value={pvpAccuracyIdx} disabled={optRunning}>
            {#each PVP_ACCURACY_CHOICES as c, i (c.label)}
              <option value={i}>{c.label}</option>
            {/each}
          </select>
        </label>
        {#if optRunning}
          <button type="button" class="btn-ghost run-btn" onclick={cancelOptimizer}>
            Cancel — keep best so far
          </button>
        {:else}
          <button
            type="button"
            class="btn-gold run-btn"
            onclick={runOptimizer}
            disabled={simRunning || !optPreset || selectedOptOpponents.length === 0}
          >
            Optimize for This Matchup
          </button>
        {/if}
      </div>

      {#if opponents.filter((o) => o.class).length > 1}
        <fieldset class="dims" disabled={optRunning}>
          <legend class="micro-label">Opponents to optimize against</legend>
          <div class="dims-grid">
            {#each opponents.filter((o) => o.class) as o (o.id)}
              <label class="dim-toggle">
                <input
                  type="checkbox"
                  checked={selectedOptOpponents.some((s) => s.id === o.id)}
                  onchange={(e) => toggleOptOpponent(o.id, e.target.checked)}
                />
                <span>{o.name}</span>
              </label>
            {/each}
          </div>
          {#if selectedOptOpponents.length > 1}
            <div class="control agg-control" role="group" aria-label="Aggregation">
              <span class="micro-label">Optimize for</span>
              <div class="mode-toggle">
                <button type="button" class:selected={optAggregate === 'mean'} onclick={() => (optAggregate = 'mean')} disabled={optRunning}>
                  Average win rate
                </button>
                <button type="button" class:selected={optAggregate === 'min'} onclick={() => (optAggregate = 'min')} disabled={optRunning}>
                  Worst matchup
                </button>
              </div>
            </div>
          {/if}
        </fieldset>
      {/if}

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

      <p class="ichor-hint">
        Optimizes the preset chosen here against the opponent and health multiplier selected above. Resetting transcendence is
        free, so the board is always rebuilt from the Ichor already invested — plus any extra you
        enter here. Resetting your Awakening path is <em>not</em> free, so it starts unchecked —
        tick it above only if a respec is on the table.
      </p>

      {#if optRunning && optProgress}
        <p class="progress mono" role="status">
          {optProgress.phase} — {optProgress.evals.toLocaleString('en-US')} builds evaluated — best
          {optProgress.bestScore.toFixed(1)}% win
        </p>
      {/if}

      {#if optResult && optVerify?.length}
        <div class="results" data-testid="pvp-opt-results">
          <div class="tiles">
            <div class="tile">
              <span class="micro-label">Win Chance Now{optVerify.length > 1 ? (optAggregate === 'min' ? ' (worst)' : ' (avg)') : ''}</span>
              <span class="mono value">
                {optVerify.length === 1
                  ? fmtPctCi(aggRate(optVerify, 'before'), VERIFY_ITERATIONS)
                  : fmtPct(aggRate(optVerify, 'before'))}
              </span>
            </div>
            <div class="tile">
              <span class="micro-label">Win Chance Optimized{optVerify.length > 1 ? (optAggregate === 'min' ? ' (worst)' : ' (avg)') : ''}</span>
              <span
                class="mono value"
                class:win={aggRate(optVerify, 'after') > aggRate(optVerify, 'before')}
              >
                {optVerify.length === 1
                  ? fmtPctCi(aggRate(optVerify, 'after'), VERIFY_ITERATIONS)
                  : fmtPct(aggRate(optVerify, 'after'))}
              </span>
            </div>
            <div class="tile">
              <span class="micro-label">Verified Over</span>
              <span class="mono value">{VERIFY_ITERATIONS.toLocaleString('en-US')} duels{optVerify.length > 1 ? ' each' : ''}</span>
            </div>
          </div>
          {#if optVerify.length > 1}
            <div class="side-stats mono" data-testid="per-opponent-verify">
              {#each optVerify as v (v.name)}
                <div class="side-row">
                  <span class="side-label">{v.name}</span>
                  <span>now {fmtPct(v.before.winRate)}</span>
                  <span>optimized <span class:win-text={v.after.winRate > v.before.winRate}>{fmtPct(v.after.winRate)}</span></span>
                </div>
              {/each}
            </div>
          {/if}
          <SimulatedPresetCard result={optResult} {character} scoreUnit="% win" onApply={applyOptimized} onPromote={promoteAlternative} />

          <div class="gauntlet-controls" data-testid="gauntlet-controls">
            {#if gauntletRunning}
              <div class="gauntlet-progress" role="status">
                <span class="mono">
                  Dueling the gauntlet — {gauntletProgress ? `${gauntletProgress.done} / ${gauntletProgress.total}` : 'starting…'} matchups
                </span>
                <button type="button" class="btn-ghost" onclick={cancelGauntlet} data-testid="cancel-gauntlet">Cancel</button>
              </div>
            {:else}
              <button type="button" class="btn-ghost" onclick={runGauntletValidation} data-testid="validate-gauntlet">
                Validate vs archetype gauntlet
              </button>
              <label class="gauntlet-budget">
                <span class="micro-label">Opponent budget (Attack+Health)</span>
                <input
                  type="text"
                  inputmode="numeric"
                  placeholder={formatFlat(Math.round(gauntletDefaultBudget))}
                  bind:value={gauntletBudgetInput}
                  data-testid="gauntlet-budget"
                />
              </label>
            {/if}
          </div>
          {#if gauntletResult}
            <GauntletResultPanel result={gauntletResult} />
          {/if}
        </div>
      {/if}

      <RelicSuggesterPanel
        {character}
        preset={optPreset}
        buildObjectiveSpec={buildPvpObjectiveSpec}
        scoreUnit="% win"
        formatScore={(n) => n.toFixed(1)}
        disabled={optRunning || simRunning || selectedOptOpponents.length === 0}
        {setStatus}
      />
    </section>

    <section class="panel">
      <div class="opp-header">
        <h2 class="subheading">Opponents</h2>
        <div class="opp-add">
          <select
            class="snapshot-select"
            value=""
            onchange={(e) => {
              snapshotPreset(e.target.value);
              e.target.value = '';
            }}
            aria-label="Snapshot one of your presets as an opponent"
            data-testid="snapshot-preset"
          >
            <option value="" disabled>From preset…</option>
            {#each presets as p (p.id)}
              <option value={p.id}>{p.name}</option>
            {/each}
          </select>
          <button type="button" class="btn-ghost" onclick={addOpponent}>+ Add Opponent</button>
        </div>
      </div>
      <p class="subline">
        Enter the enemy's displayed profile totals exactly as the game shows them — sigil passives
        are already inside those numbers, so only their sigils' ACTIVE effects are added on top.
      </p>

      {#if !opponent}
        <p class="hint">No opponents yet — add one to enter their stats.</p>
      {:else}
        <div class="opp-toolbar">
          {#if renaming}
            <input
              class="rename-input"
              bind:value={renameInput}
              onkeydown={(e) => e.key === 'Enter' && commitRename()}
            />
            <button type="button" class="btn-ghost" onclick={commitRename}>Save</button>
          {:else}
            <span class="opp-name">{opponent.name}</span>
            <button
              type="button"
              class="btn-ghost"
              onclick={() => {
                renaming = true;
                renameInput = opponent.name;
              }}
            >
              Rename
            </button>
          {/if}
          <label class="control class-control">
            <span class="micro-label">Class</span>
            <select
              value={opponent.class}
              onchange={(e) => {
                rosterStore.setOpponentClass(opponent.id, e.target.value);
                clearResults();
              }}
            >
              <option value={null} disabled>Pick a class…</option>
              {#each CLASSES as c (c)}
                <option value={c}>{c}</option>
              {/each}
            </select>
          </label>
          <button type="button" class="btn-ghost" onclick={duplicateOpponent} data-testid="duplicate-opponent">
            Duplicate
          </button>
          <button
            type="button"
            class="btn-danger"
            class:is-confirming={confirmingDelete}
            onclick={deleteOpponent}
            onblur={() => (confirmingDelete = false)}
          >
            {confirmingDelete ? 'Confirm delete?' : 'Delete'}
          </button>
        </div>

        {#if opponent.class}
          <div class="stat-grid">
            {#each opponentStatFields as field (field.key)}
              <label class="stat-field">
                <span class="micro-label">{field.label}</span>
                <input
                  type="text"
                  inputmode="decimal"
                  value={formatStat(field.key, opponent.stats[field.key])}
                  onchange={(e) => {
                    rosterStore.setOpponentStat(opponent.id, field.key, parseStat(field.key, e.target.value));
                    clearResults();
                  }}
                />
              </label>
            {/each}
          </div>

          <h3 class="micro-label sigil-heading">Sigils ({opponent.sigilIds.length}/{PRESET_SIGIL_CAP})</h3>
          <div class="sigil-list">
            {#each opponentSigilDefs as def (def.id)}
              {@const equipped = opponent.sigilIds.includes(def.id)}
              <div class="sigil-row" class:equipped>
                <label class="sigil-toggle">
                  <input
                    type="checkbox"
                    checked={equipped}
                    onchange={(e) => {
                      toggleSigil(def.id, e.target.checked);
                      clearResults();
                    }}
                  />
                  <span class="sigil-name">{def.name}</span>
                  <span class="sigil-note">{def.notes}</span>
                </label>
                {#if equipped && def.active}
                  {@const fields = sigilFields(def)}
                  <div class="sigil-inputs">
                    {#each fields.stats as statKey (statKey)}
                      <label class="stat-field small">
                        <span class="micro-label">{statKey.replaceAll('_', ' ')}</span>
                        <input
                          type="text"
                          inputmode="decimal"
                          value={formatStat(statKey, opponent.sigilValues[def.id]?.active?.[statKey] ?? 0)}
                          onchange={(e) => {
                            rosterStore.setOpponentSigilValue(opponent.id, def.id, statKey, parseStat(statKey, e.target.value));
                            clearResults();
                          }}
                        />
                      </label>
                    {/each}
                    {#if fields.damage}
                      <label class="stat-field small">
                        <span class="micro-label">damage</span>
                        <input
                          type="text"
                          inputmode="numeric"
                          value={formatFlat(opponent.sigilValues[def.id]?.damage ?? 0)}
                          onchange={(e) => {
                            rosterStore.setOpponentSigilValue(opponent.id, def.id, 'damage', parseStat('attack', e.target.value));
                            clearResults();
                          }}
                        />
                      </label>
                    {/if}
                    {#if fields.tickDamage}
                      <label class="stat-field small">
                        <span class="micro-label">tick damage</span>
                        <input
                          type="text"
                          inputmode="numeric"
                          value={formatFlat(opponent.sigilValues[def.id]?.tickDamage ?? 0)}
                          onchange={(e) => {
                            rosterStore.setOpponentSigilValue(opponent.id, def.id, 'tickDamage', parseStat('attack', e.target.value));
                            clearResults();
                          }}
                        />
                      </label>
                    {/if}
                    {#if fields.regenDebuffPct}
                      <label class="stat-field small">
                        <span class="micro-label">regen debuff %</span>
                        <input
                          type="text"
                          inputmode="decimal"
                          value={formatStat('hp_regen', opponent.sigilValues[def.id]?.regenDebuffPct ?? 0)}
                          onchange={(e) => {
                            rosterStore.setOpponentSigilValue(opponent.id, def.id, 'regenDebuffPct', parseStat('hp_regen', e.target.value));
                            clearResults();
                          }}
                        />
                      </label>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          {#if opponentGlyphDefs.length > 0}
            <h3 class="micro-label sigil-heading">Special Glyphs</h3>
            <div class="sigil-list" data-testid="opponent-glyphs">
              {#each opponentGlyphDefs as g (g.id)}
                <div class="sigil-row" class:equipped={(opponent.specialGlyphIds || []).includes(g.id)}>
                  <label class="sigil-toggle">
                    <input
                      type="checkbox"
                      checked={(opponent.specialGlyphIds || []).includes(g.id)}
                      onchange={(e) => {
                        rosterStore.toggleOpponentSpecialGlyph(opponent.id, g.id, e.target.checked);
                        clearResults();
                      }}
                    />
                    <span class="sigil-name">{g.name}</span>
                    <span class="sigil-note">{g.description}</span>
                  </label>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      {/if}
    </section>
    </div>
  </div>
{/if}

<style>
  .empty-hint,
  .hint {
    color: var(--color-muted);
    font-size: 12px;
  }
  .empty-hint {
    padding-top: var(--space-6);
  }
  .pvp-screen {
    max-width: 860px;
  }
  .pvp-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    min-width: 0;
  }
  .gauntlet-controls {
    display: flex;
    align-items: flex-end;
    gap: var(--space-4);
    flex-wrap: wrap;
    margin-top: var(--space-3);
  }
  .gauntlet-progress {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: 12px;
  }
  .gauntlet-budget {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .gauntlet-budget input {
    width: 12ch;
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
  .control select {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    min-width: 120px;
  }
  .run-btn {
    min-height: 36px;
  }
  .hp-mult {
    display: flex;
    align-items: center;
    gap: 5px;
    min-height: 34px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }
  .hp-mult-note {
    font-family: var(--font-ui);
    font-size: 10.5px;
    color: var(--color-muted);
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
    padding: 7px 14px;
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
  .tile .value.win {
    color: var(--color-upgrade, #57d98a);
  }
  .tile .value.loss {
    color: var(--color-downgrade, #ff7a7a);
  }
  .side-stats {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
  }
  .side-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-2) var(--space-3);
    font-size: 11px;
    color: var(--color-muted);
  }
  .side-row + .side-row {
    border-top: 1px solid var(--color-border-hairline);
  }
  .side-label {
    color: var(--color-ink);
    font-weight: 600;
    min-width: 8ch;
  }
  .observed {
    margin: 0;
    font-size: 11px;
    color: var(--color-muted);
  }
  .num-input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    width: 100px;
    box-sizing: border-box;
  }
  .duel-details {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-3);
  }
  .duel-details summary {
    cursor: pointer;
    min-height: 24px;
  }
  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: var(--space-4);
    padding-top: var(--space-3);
  }
  .details-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }
  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: 11px;
    color: var(--color-muted);
  }
  .detail-row span:last-child {
    color: var(--color-ink);
  }
  .breakdown-row {
    display: grid;
    grid-template-columns: minmax(70px, 1fr) auto auto minmax(40px, 1.5fr);
    gap: var(--space-2);
    align-items: center;
    font-size: 11px;
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
  .result-actions {
    display: flex;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .combat-log {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .log-head {
    margin: 0;
    font-size: 11px;
    color: var(--color-gold-light);
  }
  .log-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 11px;
    color: var(--color-muted);
  }
  .log-list li {
    display: flex;
    gap: var(--space-2);
  }
  .log-list li.you {
    color: var(--color-ink);
  }
  .log-t {
    flex: none;
    min-width: 6ch;
    text-align: right;
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
  .ichor-input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    width: 100px;
    box-sizing: border-box;
  }
  .progress {
    margin: 0;
    font-size: 12px;
    color: var(--color-gold-light);
  }
  .seed-input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    width: 130px;
    box-sizing: border-box;
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
  .opp-header,
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  /* Wide matrices scroll inside their own container (mobile rule). */
  .matrix-scroll {
    overflow-x: auto;
  }
  .matrix {
    border-collapse: collapse;
    font-size: 12px;
    min-width: 100%;
  }
  .matrix th,
  .matrix td {
    border: 1px solid var(--color-border-hairline);
    padding: var(--space-2) var(--space-3);
    text-align: right;
    white-space: nowrap;
  }
  .matrix thead th {
    text-align: right;
    color: var(--color-muted);
  }
  .matrix thead th:first-child,
  .matrix-preset {
    text-align: left;
  }
  .matrix-preset {
    color: var(--color-ink);
    font-weight: 600;
  }
  .matrix td.good {
    color: var(--color-upgrade, #57d98a);
  }
  .matrix td.bad {
    color: var(--color-downgrade, #ff7a7a);
  }
  .opp-toolbar {
    display: flex;
    align-items: flex-end;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .opp-add {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .snapshot-select {
    background: var(--color-field);
    color: var(--color-muted);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 12px;
  }
  .agg-control {
    margin-top: var(--space-2);
  }
  .win-text {
    color: var(--color-upgrade, #57d98a);
  }
  .opp-name {
    font-weight: 600;
    align-self: center;
  }
  .rename-input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
  }
  .class-control {
    margin-left: auto;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }
  .stat-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat-field input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    width: 100%;
    box-sizing: border-box;
  }
  .stat-field.small {
    min-width: 110px;
  }
  .sigil-heading {
    margin: var(--space-2) 0 0;
  }
  .sigil-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .sigil-row {
    border: 1px solid var(--color-border-hairline);
    border-radius: var(--radius-field);
    padding: var(--space-2) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .sigil-row.equipped {
    border-color: var(--color-gold, #d9a94b);
  }
  .sigil-toggle {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    cursor: pointer;
  }
  .sigil-name {
    font-size: 13px;
    font-weight: 600;
  }
  .sigil-note {
    font-size: 11px;
    color: var(--color-muted);
  }
  .sigil-inputs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
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
    .stat-field input,
    .ichor-input,
    .seed-input,
    .num-input,
    .rename-input {
      min-width: 0;
      width: 100%;
      min-height: 44px;
    }
    .run-btn,
    .mode-toggle button {
      min-height: 44px;
    }
    .mode-toggle button {
      flex: 1;
    }
    .class-control {
      margin-left: 0;
    }
  }
</style>
