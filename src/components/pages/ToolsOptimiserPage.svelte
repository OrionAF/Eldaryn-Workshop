<script module>
  // job -> the run it was saved as (null when it was not saved). Module state so a result that finished
  // while the page was closed is saved once, when the page is next open on that character.
  const recorded = new Map();
  const jobKey = (j) => `${j.id}@${j.queuedAt}`;
</script>

<script>
  /**
   * ToolsOptimiserPage.svelte - T2 Optimiser (ia.md §3.3, §5.17): five setup steps, a run as a session job,
   * ranked results with verdicts and per-change effects, a scoped Apply review, and a Run history tab.
   * The page reads the character and writes only on Apply. The result lives in the job store, so it survives
   * navigation; a finished run is saved to the character's history (model/runs.js schema 2). Search,
   * statistics and the result contract: docs/Reference/simulation.md.
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { formatHash } from '../../lib/routes.js';
  import { prefs } from '../../lib/prefs.svelte.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { loadUi, saveUi, EFFORTS } from '../../lib/uiState.js';
  import {
    startJob, cancelJob, resumeJob, retryJob, isStale, jobsStore, jobDebugLog,
  } from '../../lib/jobs.svelte.js';
  import { debugLogFileName } from '../../lib/search/debugLog.js';
  import DebugLog from '../optimiser/DebugLog.svelte';
  import { resolveTarget, objectiveKindsFor, makeObjective } from '../../lib/search/objectives.js';
  import ArenaRewardInputs from '../optimiser/ArenaRewardInputs.svelte';
  import { relicSlotCap } from '../../lib/model/legality.js';
  import { presetDuelFighter, opponentFighter, missingStats } from '../../lib/features/duel.js';
  import {
    normaliseSetup, setupFromRun, requestOf, searchCharacter, signatureOf, runApplyBlock, retiredGoalBlock, otherCharacters, targetContext,
  } from '../../lib/ui/optimiserSetup.js';
  import {
    viewResult, progressSegments, progressLine, effortPlan, enabledCount, toggleTotal, optimiserJobChips,
    fmtDuration, viewRun, OBJECTIVE_LABEL, MEASURED_COST, goalWinRate,
  } from '../../lib/ui/optimiserView.js';
  import { triesPerClear } from '../../lib/ui/winRateFormat.js';
  import WinRateTarget from '../optimiser/WinRateTarget.svelte';
  import PushLadder from '../optimiser/PushLadder.svelte';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import Panel from '../ui/Panel.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import RunProgress from '../ui/RunProgress.svelte';
  import StepList from '../ui/StepList.svelte';
  import { searchStepRows } from '../../lib/ui/searchSteps.js';
  import { RUN_PHASES } from '../../lib/ui/runPhases.js';
  import TargetPicker from '../tools/TargetPicker.svelte';
  import { rosterPartnerFor } from '../../lib/search/celestialObjective.js';
  import SpaceGroups from '../optimiser/SpaceGroups.svelte';
  import PowerGuard from '../optimiser/PowerGuard.svelte';
  import { presetPower } from '../../lib/build/power.js';
  import { powerFloorText } from '../../lib/search/search.js';
  import OptimiserResults from '../optimiser/OptimiserResults.svelte';
  import ApplyReview from '../optimiser/ApplyReview.svelte';
  import RunHistoryTab from '../optimiser/RunHistoryTab.svelte';
  import SetupEstimate from '../optimiser/SetupEstimate.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  // the roster's other characters: Celestial partners (their presets are resolved into the request)
  const others = $derived(otherCharacters(character, rosterStore.roster?.characters ?? []));
  // every character's saved runs: the setup estimate learns from runs like the one being set up
  const allRuns = $derived((rosterStore.roster?.characters ?? []).flatMap((c) => c.runs ?? []));

  // ---- setup, kept per character in the UI key ---------------------------------------------------

  const loadSetup = (c) => normaliseSetup(loadUi().optimiserSetups[c.id], c, prefs.defaultEffort, otherCharacters(c, rosterStore.roster?.characters ?? []));
  let loadedId = untrack(() => character.id);
  let setup = $state(untrack(() => loadSetup(character)));
  $effect.pre(() => {
    if (character.id !== loadedId) {
      loadedId = character.id;
      setup = loadSetup(character);
    }
  });
  $effect(() => {
    saveUi({ optimiserSetups: { [loadedId]: $state.snapshot(setup) } });
  });

  const preset = $derived(
    character.presets.find((p) => p.id === setup.presetId) ?? character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0],
  );
  const opponents = $derived(character.opponents ?? []);
  const isPvp = $derived(setup.target.kind === 'pvp');
  // Opponents deleted since they were picked fall out of the request.
  const pvpIds = $derived(isPvp ? setup.target.opponentIds.filter((id) => opponents.some((o) => o.id === id)) : []);
  const allowedObjectives = $derived(objectiveKindsFor(setup.target.kind, isPvp ? null : $state.snapshot(setup.target)));
  $effect(() => {
    if (!allowedObjectives.includes(setup.objective.kind)) setup.objective = { kind: allowedObjectives[0] };
  });
  const objectiveOptions = $derived(allowedObjectives.map((k) => ({ value: k, label: OBJECTIVE_LABEL[k] })));
  const resolvedFull = $derived.by(() => {
    const t = $state.snapshot(setup.target);
    try {
      const target = resolveTarget(t, targetContext(t, character, others));
      if (setup.objective.kind === 'arena-reward') makeObjective($state.snapshot(setup.objective), target);
      return { target, error: '' };
    } catch (e) {
      return { target: null, error: e?.message ?? String(e) };
    }
  });
  const resolvedTarget = $derived(resolvedFull.target);
  const targetLabel = $derived(resolvedTarget?.label ?? '');
  // the preset's Combat Power in the realm the fight uses (the guard compares candidates with the same figure)
  const currentPower = $derived.by(() => {
    try {
      return preset ? presetPower(character, preset.id, { realm: resolvedTarget?.realm ?? 'base' }).power : null;
    } catch {
      return null;
    }
  });
  const relicCap = $derived(relicSlotCap(character.level, character.extraRelicSlots));
  const plan = $derived(effortPlan(setup.effort, setup.objective, setup.target));
  const effortOptions = $derived(
    EFFORTS.map((level) => {
      const p = effortPlan(level, setup.objective, setup.target);
      return { value: level, label: level[0].toUpperCase() + level.slice(1), sub: p.sub };
    }),
  );
  const presetOptions = $derived(character.presets.map((p) => ({ value: p.id, label: p.name })));
  // the setup the run would start with (run() below), for the live estimate
  const estimateSetup = $derived.by(() => {
    const s = { ...$state.snapshot(setup), presetId: preset.id };
    if (isPvp) s.target = { ...s.target, opponentIds: [...pvpIds] };
    return s;
  });

  // ---- blockers ----------------------------------------------------------------------------------

  const blockers = $derived.by(() => {
    const floorBlock = setup.powerFloor != null && currentPower != null && currentPower < setup.powerFloor
      ? [{ text: powerFloorText(currentPower, setup.powerFloor) }]
      : [];
    return [...floorBlock, ...fightBlockers()];
  });
  function fightBlockers() {
    if (setup.target.kind === 'celestial') return resolvedFull.error ? [{ text: resolvedFull.error }] : [];
    if (!isPvp) return [];
    if (!opponents.length) return [{ text: 'PVP needs a saved opponent.', fix: 'Open Opponents', to: '#/tools/opponents' }];
    if (!pvpIds.length) return [{ text: 'Pick at least one opponent.' }];
    if (setup.objective.kind === 'arena-reward' && resolvedFull.error) return [{ text: resolvedFull.error }];
    const out = [];
    try {
      for (const m of missingStats(presetDuelFighter(character, preset.id))) out.push({ text: `${preset.name} has no ${m}.`, fix: 'Open Stat Sheet', to: '#/builds/sheet' });
    } catch {
      out.push({ text: `${preset.name} cannot be read as a fighter yet.`, fix: 'Open Stat Sheet', to: '#/builds/sheet' });
    }
    for (const id of pvpIds) {
      const o = opponents.find((x) => x.id === id);
      for (const m of missingStats(opponentFighter(o))) out.push({ text: `${o.name || 'Opponent'} has no ${m}.`, fix: 'Open Opponents', to: '#/tools/opponents' });
    }
    return out;
  }

  // ---- the job -----------------------------------------------------------------------------------

  const jobs = $derived(jobsStore.list.filter((j) => j.tool === 'optimiser' && j.request?.meta?.characterId === character.id));
  const live = $derived.by(() => {
    const last = jobs.at(-1);
    return last && (last.status === 'running' || last.status === 'queued') ? last : null;
  });
  // The result on screen: the latest that has one (a cancelled re-measure keeps the run it was measuring).
  const shown = $derived(
    [...jobs].reverse().find((j) => j.result?.schema === 'optimiser-result/2' && !(j.status === 'cancelled' && j.request.mode === 'optimizeMore')) ?? null,
  );
  const result = $derived(shown?.result ?? null);
  const failedJob = $derived(jobs.at(-1)?.status === 'failed' ? jobs.at(-1) : null);
  const view = $derived(result && result.status !== 'failed' ? viewResult(result) : null);
  const liveTries = $derived(view ? triesPerClear(goalWinRate(view)) : '');
  const stale = $derived(shown ? isStale(shown) : false);
  const cancelled = $derived(shown?.status === 'cancelled' && !live);
  const resultPreset = $derived(result ? character.presets.find((p) => p.id === result.request.presetId) ?? null : null);
  const segments = $derived(
    live
      ? progressSegments({ progress: live.progress, status: live.status })
      : result
        ? progressSegments({ result, status: shown.status })
        : [],
  );

  // the search's steps: live from the progress report, else the shown result's final list (none for Push or an old run)
  const stepRows = $derived(searchStepRows(live ? live.progress?.searchSteps : result?.search?.steps));

  function start(request, meta, { title, context }) {
    const sig = () => signatureOf(rosterStore.current, meta.presetId);
    return startJob({
      tool: 'optimiser',
      title,
      context,
      request: { ...request, meta },
      signature: sig(),
      currentSignature: sig,
      openRoute: formatHash('tools/optimiser'),
      summarize: optimiserJobChips,
    });
  }

  function run() {
    if (live || blockers.length || !preset) return;
    openRunId = null;
    const s = { ...$state.snapshot(setup), presetId: preset.id };
    if (isPvp) s.target = { ...s.target, opponentIds: [...pvpIds] };
    // the debug log setting (Settings, per device) rides in the request: the search never reads prefs
    const debug = prefs.debugLog !== 'off' ? { debug: prefs.debugLog } : {};
    start({ ...requestOf(s, character, others), ...debug }, { characterId: character.id, presetId: preset.id, presetName: preset.name, mode: 'optimize' }, {
      title: `Optimise ${preset.name}`,
      context: `${targetLabel} · ${OBJECTIVE_LABEL[s.objective.kind]}`,
    });
    setStatus('');
  }

  /** A Celestial run's roster partner as it is now (the task refuses it if the partner changed since). */
  function partnerOf(target) {
    const partner = rosterPartnerFor(target, others);
    return partner ? { partner } : {};
  }

  function runMore(row) {
    if (live || !shown || stale || !row.runMore || retiredGoalBlock(result)) return;
    const meta = { characterId: character.id, presetId: result.request.presetId, presetName: resultPreset?.name ?? '', mode: 'optimizeMore', fromJob: jobKey(shown) };
    const { debug: _log, ...measured } = result; // a re-measure keeps no debug log of the run it re-measures
    start(
      { mode: 'optimizeMore', character: searchCharacter(character), ...partnerOf(result.target), result: measured, rowKeys: [row.key], targetN: row.runMore.targetN },
      meta,
      { title: `Re-measure rank ${row.rank}`, context: `${result.target.label} · ${fmtCount(row.runMore.targetN)} fights` },
    );
  }

  // Save each finished run once, to the character it was run on.
  $effect(() => {
    const cid = rosterStore.current?.id;
    for (const j of jobsStore.list) {
      if (j.tool !== 'optimiser' || j.status !== 'finished' || recorded.has(jobKey(j))) continue;
      if (j.request?.meta?.characterId !== cid) continue;
      const r = j.result;
      if (r?.schema !== 'optimiser-result/2' || r.status !== 'done') {
        recorded.set(jobKey(j), null);
        continue;
      }
      untrack(() => {
        const prevId = recorded.get(j.request.meta.fromJob) ?? null; // fromJob is a jobKey
        const prev = prevId ? rosterStore.current.runs.find((x) => x.id === prevId) : null;
        const fields = prev
          ? { id: prev.id, at: prev.at, name: prev.name, notes: prev.notes, pinned: prev.pinned, applied: prev.applied }
          : {};
        const saved = rosterStore.addRun(r, { presetName: j.request.meta.presetName, ...fields });
        recorded.set(jobKey(j), saved?.id ?? null);
      });
    }
  });

  // ---- apply -------------------------------------------------------------------------------------

  let applyRow = $state(null);
  let applySource = $state(null); // {presetId, presetName, runId}: the preset the review writes to, the run to mark applied
  let applyOpen = $state(false);
  let applyError = $state('');
  const applyBlocked = $derived(
    !result || cancelled ? 'Not confirmed yet.'
      : stale ? 'The character changed since this run. Run again before applying.'
        : !resultPreset ? 'That preset no longer exists.' : '',
  );

  function askApply(row) {
    applySource = { presetId: resultPreset.id, presetName: resultPreset.name, runId: recorded.get(jobKey(shown)) ?? null };
    applyRow = row;
    applyError = '';
    applyOpen = true;
  }

  /** Apply from a saved run (Run history or the opened run): its stored write groups, its own preset. */
  function askApplySaved(run, row) {
    const p = character.presets.find((x) => x.id === run.presetId);
    if (!p) return;
    applySource = { presetId: p.id, presetName: p.name, runId: run.id };
    applyRow = row;
    applyError = '';
    applyOpen = true;
  }

  function confirmApply({ cand, include }) {
    if (!applyRow || !applySource) return;
    const r = rosterStore.applyCandidate(applySource.presetId, cand, { include });
    if (!r.ok) {
      applyError = r.violations.map((v) => v.detail).join('; ');
      return;
    }
    if (applySource.runId) rosterStore.setRunApplied(applySource.runId, applyRow.rank);
    applyOpen = false;
    notify(`Applied rank ${applyRow.rank} to ${applySource.presetName}. Run again to measure against the new current build.`, { kind: 'success' });
  }

  // ---- tabs --------------------------------------------------------------------------------------

  let tabId = $state('setup');
  $effect(() => {
    tabId = tab === 'history' ? 'history' : 'setup';
  });
  const tabs = $derived([
    { id: 'setup', label: 'Setup & results' },
    { id: 'history', label: 'Run history', count: (character.runs ?? []).length },
  ]);
  const onTab = (id) => go(formatHash('tools/optimiser', id === 'history' ? 'history' : null), { replace: true });

  // A saved run opened from the history: its stored result shows in Setup & results, with Apply while it still matches the character.
  // After a reload no job holds a result, so the newest saved run shows instead of "No run yet".
  let openRunId = $state(null);
  let dismissedSaved = $state(false);
  const openedRun = $derived((character.runs ?? []).find((r) => r.id === openRunId) ?? null);
  const latestRun = $derived(!openRunId && !dismissedSaved && !result && !live && !failedJob ? (character.runs ?? [])[0] ?? null : null);
  const savedRun = $derived(openedRun ?? latestRun);
  const savedView = $derived(savedRun ? viewRun(savedRun) : null);
  const savedTries = $derived(savedView ? triesPerClear(goalWinRate(savedView)) : '');
  const showSaved = $derived(!!savedRun && !live);
  function openRun(r) {
    openRunId = r.id;
    dismissedSaved = false;
    tabId = 'setup';
    go(formatHash('tools/optimiser'));
  }

  function rerun(r) {
    openRunId = null;
    setup = setupFromRun(r, character, prefs.defaultEffort, others);
    go(formatHash('tools/optimiser'));
    notify('Settings loaded from the run. Press Optimise to measure again.', { kind: 'info' });
  }
</script>

<div class="page-tabs">
  <Tabs items={tabs} bind:value={tabId} label="Optimiser sections" idPrefix="opt" onchange={onTab} />
</div>

{#if tabId === 'history'}
  <div role="tabpanel" id="opt-panel-history">
    <RunHistoryTab onrerun={rerun} onopen={openRun} onapply={askApplySaved} />
  </div>
{:else}
  <div role="tabpanel" id="opt-panel-setup" class="panes">
    <div data-testid="optimiser-setup">
      <Panel title="Setup" level="primary" scope="tool">
        <section class="step">
          <h3><span class="n">I</span> Build to improve</h3>
          <Select label="Preset" options={presetOptions} value={preset.id} onchange={(v) => (setup.presetId = v)} />
        </section>

        <section class="step">
          <h3><span class="n">II</span> Fight</h3>
          <TargetPicker bind:target={setup.target} bind:objective={setup.objective} {character} oblivionUnlocked={character.oblivion?.unlocked ?? false} playerLevel={character.level} {opponents} characters={others} onNavigate={go} />
        </section>

        <section class="step">
          <h3><span class="n">III</span> Maximise</h3>
            <Select label="Objective" options={objectiveOptions} value={setup.objective.kind} onchange={(v) => {
              setup.objective = { kind: v };
              if (v === 'arena-reward') setup.target = { ...setup.target, seats: 'attacker' };
            }} />
            {#if setup.objective.kind === 'arena-reward'}
              <ArenaRewardInputs bind:objective={setup.objective} target={setup.target} {opponents} />
            {/if}
          {#if setup.objective.kind === 'survival'}
            <NumberField
              label="Survive for (s)"
              unit="s"
              min={5}
              max={600}
              nullable
              value={setup.objective.seconds ?? null}
              onchange={(v) => (setup.objective = v == null ? { kind: 'survival' } : { kind: 'survival', seconds: Math.round(v) })}
            />
            <span class="hint">Leave empty to survive the whole fight.</span>
          {/if}
          {#if setup.objective.kind === 'win-chance'}
            <span class="hint" data-testid="win-chance-explain">Finds the build with the best chance to clear this. If builds are equal, it picks the one with the fewest changes. Speed does not matter.</span>
          {/if}
          {#if setup.objective.kind === 'win-rate' || setup.objective.kind === 'push'}
            <WinRateTarget bind:objective={setup.objective} start={targetLabel} rung={setup.target.kind === 'celestial' ? 'level' : 'step'} />
          {/if}
        </section>

        <section class="step">
          <h3><span class="n">IV</span> Allowed to change</h3>
          <SpaceGroups bind:space={setup.space} bind:relicBudget={setup.relicBudget} {relicCap} />
          <PowerGuard bind:floor={setup.powerFloor} {currentPower} />
        </section>

        <section class="step">
          <h3><span class="n">V</span> Effort</h3>
          <SegmentedControl label="Effort" stack options={effortOptions} value={setup.effort} onchange={(v) => (setup.effort = v)} />
          <NumberField label="Seed" min={1} value={setup.seed} onchange={(v) => (setup.seed = Math.max(1, Math.round(v)))} />
          <p class="hint" data-testid="effort-plan">
            Spots differences of <span class="num">{plan.zone}</span> or more. Each build starts with <span class="num">{fmtCount(plan.n0)}</span> fights and gets up to <span class="num">{fmtCount(plan.maxN)}</span> if the result is still unclear. After that it is called too close to call.
          </p>
          <details class="phases" data-testid="effort-plan-details">
            <summary>How this works</summary>
            <p class="hint">
              The search resolves differences of <span class="num">{plan.zone}</span>. It compares each build with the best so far on the same fights, starting at <span class="num">{fmtCount(plan.n0)}</span> fights per comparison and adding more until the result is clear or <span class="num">{fmtCount(plan.maxN)}</span> fights per build is reached.
            </p>
          </details>
          <!-- measured cost: docs/Reference/simulation.md §Cost -->
          <p class="hint" data-testid="effort-cost">
            Runs have no time limit. Quick takes {MEASURED_COST.small.time} when it may change {MEASURED_COST.small.space}, and {MEASURED_COST.full.time} when it may change {MEASURED_COST.full.space}. Standard and Thorough take longer; PVP takes several times longer.
          </p>
          <p class="hint" data-testid="plan-summary">
            Tries changing <span class="num">{enabledCount(setup.space)}</span> of <span class="num">{toggleTotal}</span> parts of your build{targetLabel ? ` against ${targetLabel}` : ''}. The same seed gives the same result.
          </p>
        </section>

        <SetupEstimate setup={estimateSetup} {character} history={allRuns} />

        {#each blockers as b (b.text)}
          <Banner variant="warn">
            {b.text}
            {#snippet action()}{#if b.fix}<Button variant="ghost" size="small" onclick={() => go(b.to)}>{b.fix}</Button>{/if}{/snippet}
          </Banner>
        {/each}

        {#snippet footer()}
          {#if live}
            <Button variant="danger" size="block" onclick={() => cancelJob(live.id)}>Cancel</Button>
          {:else}
            <Button
              variant="primary"
              size="block"
              disabled={blockers.length > 0}
              reason={blockers.length ? blockers[0].text : ''}
              onclick={run}>Optimise {preset.name}</Button
            >
          {/if}
        {/snippet}
      </Panel>
    </div>

    <div class="stack" data-testid="optimiser-output">
      {#if showSaved}
        <Panel title={savedRun.name} level="primary" scope="tool">
          {#snippet meta()}
            <Button variant="ghost" size="small" onclick={() => { openRunId = null; dismissedSaved = true; }}>Close</Button>
          {/snippet}
          <Banner variant="info" lead="Saved run.">
            Saved {new Date(savedRun.at).toLocaleString()}. You can apply a build from it while your character is unchanged. Run more is not available for a saved run.
            {#snippet action()}<Button variant="ghost" size="small" disabled={!!retiredGoalBlock(savedRun)} reason={retiredGoalBlock(savedRun)} onclick={() => rerun(savedRun)}>Run again with these settings</Button>{/snippet}
          </Banner>
          {#if savedRun.headline.text}
            <div class="headline" role="status">
              <h3>{savedRun.headline.text}</h3>
              {#if savedTries}<p data-testid="headline-tries">Best win rate: {savedTries}.</p>{/if}
            </div>
          {/if}
          {#if savedView?.push}<PushLadder push={savedView.push} />{/if}
          {#if savedView}
            <OptimiserResults
              view={savedView}
              presetName={savedRun.presetName || 'the preset'}
              unmeasured={() => savedRun.schema !== 2}
              onapply={(row) => askApplySaved(savedRun, row)}
              applyBlocked={runApplyBlock(savedRun, character)}
              missingWritesReason="This run was saved before it could be applied. Run it again with these settings."
            />
          {:else}
            <p class="hint" data-testid="saved-compacted">The details of this run were trimmed to save space; the summary above is kept. Pin a run to keep its details.</p>
          {/if}
        </Panel>
        {#if savedRun.debug}<DebugLog debug={savedRun.debug} />{/if}
      {:else if !result && !live && !failedJob}
        <Panel title="Results" level="primary" scope="tool">
          <EmptyState title="No run yet" text="Choose what to improve and what to fight, then press Optimise. Better builds appear here, each with the likely range of its gain." />
        </Panel>
      {:else}
        <Panel title={result ? `${result.request ? (resultPreset?.name ?? shown.request.meta.presetName) : ''} vs ${result.target.label}` : 'Running'} level="primary" scope="tool" {stale}>
          {#snippet meta()}
            {#if result}
              <span class="meta">{result.objective.label} · seed <span class="num">{result.request.seed}</span> · {fmtDuration(result.stats?.ms)}</span>
            {/if}
          {/snippet}

          {#if segments.length}
            <div data-testid="optimiser-progress"><RunProgress {segments} /></div>
            <details class="phases" data-testid="phase-help">
              <summary>What the steps mean</summary>
              <dl>
                {#each RUN_PHASES as ph (ph.id)}
                  <dt>{ph.label}</dt>
                  <dd>{ph.text}</dd>
                {/each}
              </dl>
            </details>
          {/if}
          {#if stepRows.length}
            <div data-testid="search-steps"><StepList id="optimiser-search-steps" title="Search steps" steps={stepRows} /></div>
          {/if}
          {#if live}
            <p class="hint num" data-testid="progress-line">{progressLine(live.progress)}</p>
            {#if live.progress?.steps?.length}
              <ol class="rung-steps" data-testid="push-steps" aria-label="Steps climbed">
                {#each live.progress.steps as st (st.id)}
                  <li class:current={st.state === 'current'}>{st.label}{st.text ? `: ${st.text}` : ''}</li>
                {/each}
              </ol>
            {/if}
          {/if}
          {#if failedJob}
            <Banner variant="error" lead="The run failed.">
              {failedJob.error}
              {#snippet action()}<Button variant="ghost" size="small" disabled={!!retiredGoalBlock(failedJob.request)} reason={retiredGoalBlock(failedJob.request)} onclick={() => retryJob(failedJob.id)}>Retry</Button>{/snippet}
            </Banner>
          {/if}
          {#if stale}
            <Banner variant="warn" lead="Setup changed since this run.">Your character or preset has changed since the run. Run again for an up-to-date result. Apply and Run more are not available until then.</Banner>
          {/if}
          {#if cancelled}
            <Banner variant="info" lead="Cancelled.">
              These builds are not final: they were not yet checked on fresh fights.
              {#snippet action()}<Button variant="ghost" size="small" disabled={!!retiredGoalBlock(shown.request)} reason={retiredGoalBlock(shown.request)} onclick={() => resumeJob(shown.id)}>Resume</Button>{/snippet}
            </Banner>
          {/if}
          {#if result?.status === 'failed'}
            <Banner variant="error" lead="Cannot optimise yet.">
              {result.error?.message ?? 'The current preset breaks a game rule. Fix it first.'}
              {#snippet action()}<Button variant="ghost" size="small" onclick={() => go('#/builds/loadout')}>Open Loadout</Button>{/snippet}
            </Banner>
            {#if result.baselineViolations?.length}
              <ul class="violations" data-testid="baseline-violations">
                {#each result.baselineViolations as v (v.gate + v.field + v.detail)}<li>{v.detail}</li>{/each}
              </ul>
            {/if}
          {/if}
          {#each result?.warnings ?? [] as w (w.code + w.message)}
            <Banner variant={w.severity === 'warn' ? 'warn' : 'info'}>{w.message}</Banner>
          {/each}

          {#if view}
            <div class="headline" role="status">
              <h3>{result.headline.text}</h3>
              {#if liveTries}<p data-testid="headline-tries">Best win rate: {liveTries}.</p>{/if}
              {#if result.headline.worseHidden > 0}<p>{result.headline.worseHidden} build{result.headline.worseHidden === 1 ? '' : 's'} measured worse and {result.headline.worseHidden === 1 ? 'is' : 'are'} hidden.</p>{/if}
            </div>
            {#if view.push}<PushLadder push={view.push} />{/if}
            {#if view.withheld > 0}
              <Banner variant="error" lead="Some builds are hidden.">{view.withheld} build{view.withheld === 1 ? '' : 's'} would not change your preset, so {view.withheld === 1 ? 'it is' : 'they are'} not shown.</Banner>
            {/if}
            <OptimiserResults
              {view}
              presetName={resultPreset?.name ?? shown.request.meta.presetName}
              onapply={askApply}
              {applyBlocked}
              onrunmore={stale || retiredGoalBlock(result) ? null : runMore}
              unmeasured={(row) => row.provisional}
              busy={!!live}
            />
            {#if result.search}
              <p class="hint" data-testid="search-summary">
                {fmtCount(result.search.evaluated)} builds tried across {result.search.blocks.filter((b) => b.enabled).length} parts of your build, {fmtCount(result.search.fights?.total)} fights.
                {#if result.search.unresolved?.length}{result.search.unresolved.length} comparison{result.search.unresolved.length === 1 ? '' : 's'} stayed too close to call even after the most fights allowed.{/if}
              </p>
            {/if}
          {/if}
        </Panel>

        {#if result && result.status !== 'failed'}
          <Panel title="How to read this" scope="tool">
            <ul class="read" data-testid="how-to-read">
              <li><b>Clearly better</b> means the whole likely range of the gain is above zero. <b>About the same</b> means the difference stays within ±{result.objective.unit === 'influence' ? `${+result.request.effort.delta.toFixed(3)} Influence per attack` : result.request.effort.deltaKind === 'relative' ? `${+(result.request.effort.delta * 100).toFixed(2)}%` : `${+(result.request.effort.delta * 100).toFixed(1)} points`}. <b>Too close to call</b> means it was still unclear after {fmtCount(result.request.effort.maxN)} fights.</li>
              <li>Each change was tested alone on your current build, on the same fights. The last row shows what the changes add together beyond their separate effects; it has no likely range.</li>
              {#if result.objective.unit === 'influence'}
                <li>Client reward-table Influence multiplied by your chance to win. Equal attempts against the selected opponents; attacking only. This assumes the displayed reward applies to a win. Loss rewards and game matchmaking are unknown.</li>
              {:else if result.request.mode === 'pvp'}
                <li>Win rates combine every opponent and seat, with the same number of fights for each. Ties and timeouts at equal HP go to the defender. Your side uses the app's numbers, plus the gap to your in-game stats when those are up to date.</li>
              {:else}
                <li>Builds use the app's numbers, plus the gap to your in-game stats when those are up to date. Check a pick in the game or on Duel.</li>
              {/if}
              {#each result.target.assumptions as a (a.id)}
                <li><b>{a.tag}</b> {a.label}{a.value ? `: ${a.value}` : ''}</li>
              {/each}
            </ul>
          </Panel>
          {#if result.debug}
            <DebugLog debug={result.debug} getLog={() => jobDebugLog(shown.id)} fileName={debugLogFileName(character.name)} />
          {/if}
        {/if}
      {/if}
    </div>
  </div>
{/if}

<ApplyReview bind:open={applyOpen} row={applyRow} presetName={applySource?.presetName ?? ''} error={applyError} onconfirm={confirmApply} />

<style>
  .page-tabs { margin-bottom: var(--sp-4); }
  .phases { margin-top: var(--sp-2); font-size: var(--fs-12); color: var(--text-muted); }
  .phases summary { cursor: pointer; color: var(--brass-400); }
  .phases dl { margin: var(--sp-2) 0 0; display: grid; gap: 4px; }
  .phases dt { color: var(--text-ink); font-weight: var(--fw-bold); }
  .phases dd { margin: 0 0 var(--sp-1); color: var(--text-soft); }
  .panes { display: grid; grid-template-columns: minmax(0, 360px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  .panes > * { min-width: 0; }
  @media (max-width: 1100px) { .panes { grid-template-columns: minmax(0, 1fr); } }
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  /* Segmented Effort control and fields fill the panel and wrap instead of overflowing it. */
  .step :global(.seg) { display: flex; flex-wrap: wrap; width: 100%; max-width: 100%; box-sizing: border-box; }
  .step :global(.seg button) { flex: 1 1 auto; justify-content: center; white-space: normal; min-width: 0; }
  .step { min-width: 0; display: grid; gap: var(--sp-3); padding-bottom: var(--sp-3); border-bottom: 1px solid var(--line-hairline); }
  .step:last-of-type { border-bottom: 0; }
  .step h3 { margin: 0; display: flex; align-items: center; gap: var(--sp-2); font-size: var(--fs-14); color: var(--text-ink); }
  .n {
    display: inline-grid; place-items: center; min-width: calc(var(--sp-1) * 5.5); height: calc(var(--sp-1) * 5.5); padding: 0 var(--sp-1);
    border: 1px solid var(--brass-500); border-radius: var(--r-1); color: var(--brass-200);
    font-family: var(--font-data); font-size: var(--fs-11);
  }
  .hint { margin: 0; color: var(--text-muted); font-size: var(--fs-12); overflow-wrap: anywhere; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .meta { color: var(--text-soft); font-size: var(--fs-12); }
  .headline h3 { margin: 0; font-family: var(--font-display); font-size: var(--fs-20); }
  .headline p { margin: var(--sp-1) 0 0; color: var(--text-soft); font-size: var(--fs-13); }
  .violations { margin: 0; padding-left: var(--sp-5); color: var(--text-soft); font-size: var(--fs-13); }
  .rung-steps { margin: 0; padding-left: var(--sp-5); display: grid; gap: 2px; color: var(--text-muted); font-size: var(--fs-12); max-height: calc(var(--sp-5) * 8); overflow-y: auto; }
  .rung-steps .current { color: var(--text-ink); }
  .read { margin: 0; padding-left: var(--sp-5); display: grid; gap: var(--sp-2); color: var(--text-soft); font-size: var(--fs-13); }
</style>
