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
    startJob, cancelJob, resumeJob, retryJob, isStale, jobsStore,
  } from '../../lib/jobs.svelte.js';
  import { resolveTarget, objectiveKindsFor } from '../../lib/search/objectives.js';
  import { relicSlotCap } from '../../lib/model/legality.js';
  import { presetDuelFighter, opponentFighter, missingStats } from '../../lib/features/duel.js';
  import {
    normaliseSetup, setupFromRun, requestOf, searchCharacter, signatureOf, runApplyBlock,
  } from '../../lib/ui/optimiserSetup.js';
  import {
    viewResult, progressSegments, progressLine, effortPlan, enabledCount, toggleTotal, optimiserJobChips,
    fmtDuration, viewRun, OBJECTIVE_LABEL, MEASURED_COST,
  } from '../../lib/ui/optimiserView.js';
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
  import TargetPicker from '../tools/TargetPicker.svelte';
  import SpaceGroups from '../optimiser/SpaceGroups.svelte';
  import OptimiserResults from '../optimiser/OptimiserResults.svelte';
  import ApplyReview from '../optimiser/ApplyReview.svelte';
  import RunHistoryTab from '../optimiser/RunHistoryTab.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);

  // ---- setup, kept per character in the UI key ---------------------------------------------------

  const loadSetup = (c) => normaliseSetup(loadUi().optimiserSetups[c.id], c, prefs.defaultEffort);
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
  const targetLabel = $derived.by(() => {
    try {
      return resolveTarget($state.snapshot(setup.target), { character }).label;
    } catch {
      return '';
    }
  });
  const relicCap = $derived(relicSlotCap(character.level, character.extraRelicSlots));
  const plan = $derived(effortPlan(setup.effort, setup.objective));
  const effortOptions = $derived(
    EFFORTS.map((level) => {
      const p = effortPlan(level, setup.objective);
      return { value: level, label: level[0].toUpperCase() + level.slice(1), sub: p.sub };
    }),
  );
  const presetOptions = $derived(character.presets.map((p) => ({ value: p.id, label: p.name })));

  // ---- blockers ----------------------------------------------------------------------------------

  const blockers = $derived.by(() => {
    if (!isPvp) return [];
    if (!opponents.length) return [{ text: 'PVP needs a saved opponent.', fix: 'Open Opponents', to: '#/tools/opponents' }];
    if (!pvpIds.length) return [{ text: 'Pick at least one opponent.' }];
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
  });

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
    start(requestOf(s, character), { characterId: character.id, presetId: preset.id, presetName: preset.name, mode: 'optimize' }, {
      title: `Optimise ${preset.name}`,
      context: `${targetLabel} · ${OBJECTIVE_LABEL[s.objective.kind]}`,
    });
    setStatus('');
  }

  function runMore(row) {
    if (live || !shown || stale || !row.runMore) return;
    const meta = { characterId: character.id, presetId: result.request.presetId, presetName: resultPreset?.name ?? '', mode: 'optimizeMore', fromJob: jobKey(shown) };
    start(
      { mode: 'optimizeMore', character: searchCharacter(character), result, rowKeys: [row.key], targetN: row.runMore.targetN },
      meta,
      { title: `Re-measure rank ${row.rank}`, context: `${result.target.label} · N ${fmtCount(row.runMore.targetN)}` },
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
  const showSaved = $derived(!!savedRun && !live);
  function openRun(r) {
    openRunId = r.id;
    dismissedSaved = false;
    tabId = 'setup';
    go(formatHash('tools/optimiser'));
  }

  function rerun(r) {
    openRunId = null;
    setup = setupFromRun(r, character, prefs.defaultEffort);
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
          <TargetPicker bind:target={setup.target} bind:objective={setup.objective} {character} oblivionUnlocked={character.oblivion?.unlocked ?? false} playerLevel={character.level} {opponents} onNavigate={go} />
        </section>

        <section class="step">
          <h3><span class="n">III</span> Maximise</h3>
          <Select label="Objective" options={objectiveOptions} value={setup.objective.kind} onchange={(v) => (setup.objective = { kind: v })} />
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
            <span class="hint">Empty means the whole fight.</span>
          {/if}
        </section>

        <section class="step">
          <h3><span class="n">IV</span> Allowed to change</h3>
          <SpaceGroups bind:space={setup.space} {relicCap} />
        </section>

        <section class="step">
          <h3><span class="n">V</span> Effort</h3>
          <SegmentedControl label="Effort" stack options={effortOptions} value={setup.effort} onchange={(v) => (setup.effort = v)} />
          <NumberField label="Seed" min={1} value={setup.seed} onchange={(v) => (setup.seed = Math.max(1, Math.round(v)))} />
          <p class="hint" data-testid="effort-plan">
            Resolves differences of <span class="num">{plan.zone}</span>. Each comparison starts at N <span class="num">{fmtCount(plan.n0)}</span> and stops when it is resolved or at N <span class="num">{fmtCount(plan.maxN)}</span> per build, where it is reported as too close to call.
          </p>
          <!-- measured cost: docs/Reference/simulation.md §Cost -->
          <p class="hint" data-testid="effort-cost">
            Run time is not capped. Measured at Quick: {MEASURED_COST.small.space} {MEASURED_COST.small.time}, {MEASURED_COST.full.space} {MEASURED_COST.full.time}. Standard and Thorough take longer; PVP several times longer.
          </p>
          <p class="hint" data-testid="plan-summary">
            Searches <span class="num">{enabledCount(setup.space)}</span> of <span class="num">{toggleTotal}</span> dimensions{targetLabel ? ` against ${targetLabel}` : ''}. The same seed reproduces the same result.
          </p>
        </section>

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
            Saved {new Date(savedRun.at).toLocaleString()}. You can apply a build from it while the character still matches; Run more is off for a saved run.
            {#snippet action()}<Button variant="ghost" size="small" onclick={() => rerun(savedRun)}>Re-run with settings</Button>{/snippet}
          </Banner>
          {#if savedRun.headline.text}
            <div class="headline" role="status"><h3>{savedRun.headline.text}</h3></div>
          {/if}
          {#if savedView}
            <OptimiserResults
              view={savedView}
              presetName={savedRun.presetName || 'the preset'}
              unmeasured={() => savedRun.schema !== 2}
              onapply={(row) => askApplySaved(savedRun, row)}
              applyBlocked={runApplyBlock(savedRun, character)}
              missingWritesReason="This run was saved before it could be applied. Re-run with settings."
            />
          {:else}
            <p class="hint" data-testid="saved-compacted">Detail compacted to keep storage small; the headline above is kept. Pin a run to keep its detail.</p>
          {/if}
        </Panel>
      {:else if !result && !live && !failedJob}
        <Panel title="Results" level="primary" scope="tool">
          <EmptyState title="No run yet" text="Choose what to improve and what to fight, then press Optimise. Builds appear here with the change in your preset's result and a 95% interval." />
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
          {/if}
          {#if live}
            <p class="hint num" data-testid="progress-line">{progressLine(live.progress)}</p>
          {/if}
          {#if failedJob}
            <Banner variant="error" lead="The run failed.">
              {failedJob.error}
              {#snippet action()}<Button variant="ghost" size="small" onclick={() => retryJob(failedJob.id)}>Retry</Button>{/snippet}
            </Banner>
          {/if}
          {#if stale}
            <Banner variant="warn" lead="Setup changed since this run.">The character or the preset is not what was measured. Run again for a current result; Apply and Run more are off.</Banner>
          {/if}
          {#if cancelled}
            <Banner variant="info" lead="Cancelled.">
              These builds are provisional: they were not confirmed on fresh fights.
              {#snippet action()}<Button variant="ghost" size="small" onclick={() => resumeJob(shown.id)}>Resume</Button>{/snippet}
            </Banner>
          {/if}
          {#if result?.status === 'failed'}
            <Banner variant="error" lead="Cannot optimise yet.">
              {result.error?.message ?? 'The current preset breaks a game rule; fix it first.'}
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
              {#if result.headline.worseHidden > 0}<p>{result.headline.worseHidden} build{result.headline.worseHidden === 1 ? '' : 's'} measured worse and {result.headline.worseHidden === 1 ? 'is' : 'are'} hidden.</p>{/if}
            </div>
            {#if view.withheld > 0}
              <Banner variant="error" lead="Rows withheld.">{view.withheld} result{view.withheld === 1 ? '' : 's'} listed no change to the preset and {view.withheld === 1 ? 'was' : 'were'} not shown.</Banner>
            {/if}
            <OptimiserResults
              {view}
              presetName={resultPreset?.name ?? shown.request.meta.presetName}
              onapply={askApply}
              {applyBlocked}
              onrunmore={stale ? null : runMore}
              unmeasured={(row) => row.provisional}
              busy={!!live}
            />
            {#if result.search}
              <p class="hint" data-testid="search-summary">
                {fmtCount(result.search.evaluated)} builds tried over {result.search.blocks.filter((b) => b.enabled).length} dimensions, {fmtCount(result.search.fights?.total)} fights.
                {#if result.search.unresolved?.length}{result.search.unresolved.length} neighbouring comparison{result.search.unresolved.length === 1 ? '' : 's'} stayed too close to call at the largest N.{/if}
              </p>
            {/if}
          {/if}
        </Panel>

        {#if result && result.status !== 'failed'}
          <Panel title="How to read this" scope="tool">
            <ul class="read" data-testid="how-to-read">
              <li><b>Significant</b> means the whole 95% interval of the paired difference is above zero, corrected for the number of rows. <b>Equivalent</b> means it sits inside ±{result.request.effort.deltaKind === 'relative' ? `${+(result.request.effort.delta * 100).toFixed(2)}%` : `${+(result.request.effort.delta * 100).toFixed(1)} points`}. <b>Inconclusive</b> means it was still open at N {fmtCount(result.request.effort.maxN)}.</li>
              <li>Each change was measured alone on the current build with the same fights. The interaction remainder is what the changes add together beyond their separate effects; it has no interval.</li>
              {#if result.request.mode === 'pvp'}
                <li>Win rates pool every opponent and seat with equal N, each with a Wilson interval. Ties and timeouts at equal HP go to the defender. Your side is computed stats plus the preset's sheet residual when its sheet is fresh.</li>
              {:else}
                <li>Builds are scored as computed stats plus the preset's sheet residual when its sheet is fresh. Verify a pick in game or on Duel.</li>
              {/if}
              {#each result.target.assumptions as a (a.id)}
                <li><b>{a.tag}</b> {a.label}{a.value ? `: ${a.value}` : ''}</li>
              {/each}
            </ul>
          </Panel>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<ApplyReview bind:open={applyOpen} row={applyRow} presetName={applySource?.presetName ?? ''} error={applyError} onconfirm={confirmApply} />

<style>
  .page-tabs { margin-bottom: var(--sp-4); }
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
  .read { margin: 0; padding-left: var(--sp-5); display: grid; gap: var(--sp-2); color: var(--text-soft); font-size: var(--fs-13); }
</style>
