<script>
  /**
   * ToolsDuelPage.svelte - T3 Duel (ia.md §3.4, §5.19): one of my presets against a saved opponent,
   * from either seat or both, as a session job. Reports the win rate with its Wilson interval,
   * a verdict with the N that would resolve it, "Run more", the fighters as the resolver reads them
   * and one sample duel. The Verify tab checks an exported fight log. Reads the character; writes
   * nothing. The result lives in the job store, so it survives navigation (plan U3).
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { prefs } from '../../lib/prefs.svelte.js';
  import { importFlow, takeHandoff } from '../../lib/importFlow.svelte.js';
  import { getDuelSetup, setDuelSetup } from '../../lib/duelSetup.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { formatHash } from '../../lib/routes.js';
  import { startJob, cancelJob, resumeJob, isStale, jobsStore, jobSignature } from '../../lib/jobs.svelte.js';
  import { runOptimizerTask } from '../../lib/optimizerClient.js';
  import { metricKey } from '../../lib/engine/metrics.js';
  import {
    presetDuelFighter,
    opponentFighter,
    missingStats,
    arrange,
    seatsFromResult,
    winRateVerdict,
    simulatedColumns,
    defaultedLabels,
    requiredStatsText,
  } from '../../lib/features/duel.js';
  import { fmtCount } from '../../lib/ui/statsFormat.js';
  import { orderStats, orderedStatLabel } from '../../lib/ui/statOrder.js';
  import { duelVerdictText, duelHeadline, duelJobChips } from '../../lib/ui/duelFormat.js';
  import Panel from '../ui/Panel.svelte';
  import Tabs from '../ui/Tabs.svelte';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import RunProgress from '../ui/RunProgress.svelte';
  import WinRateTable from '../duel/WinRateTable.svelte';
  import FightersTable from '../duel/FightersTable.svelte';
  import SampleDuel from '../duel/SampleDuel.svelte';
  import VerifyFightLog from '../duel/VerifyFightLog.svelte';
  import { duelFights } from '../../lib/calibration.js';
  import RunEstimate from '../ui/RunEstimate.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  /** Duels per seat. Effort sets precision only (plan Q4); the number is always on the button. */
  const EFFORT = { quick: 200, standard: 800, thorough: 3200 };
  const RUN_MORE_FACTOR = 4;
  const MAX_N = 25600;
  const SEED = 1;

  const character = $derived(rosterStore.current);
  const readOnly = (id) => [{ value: id, label: id }];

  let tabId = $state('duel'); // follows the route's tab segment (effect below)
  const kept = untrack(() => getDuelSetup(character.id));
  let presetPick = $state(kept?.presetPick ?? null);
  let opponentPick = $state(kept?.opponentPick ?? null);
  let seat = $state(kept?.seat ?? 'both');
  let effort = $state(kept?.effort ?? untrack(() => prefs.defaultEffort));
  let logHandoff = $state(null); // {text, n}: a fight log from the import dialog, for the Verify tab
  let handoffCount = 0;
  // The setup is kept for the session, so leaving the page and coming back finds it as it was.
  $effect(() => {
    setDuelSetup(character.id, { presetPick, opponentPick, seat, effort });
  });
  let jobId = $state(jobsStore.list.filter((j) => j.tool === 'duel').at(-1)?.id ?? null);
  let reroll = $state(null); // {jobId, trace, traceResult}
  let rerolling = $state(false);

  const preset = $derived(character.presets.find((p) => p.id === presetPick) ?? character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const opponent = $derived(character.opponents.find((o) => o.id === opponentPick) ?? character.opponents[0] ?? null);
  const mine = $derived(presetDuelFighter(character, preset.id));
  const theirs = $derived(opponent ? opponentFighter(opponent) : null);

  const blockers = $derived([
    ...missingStats(mine).map((m) => ({ text: `${preset.name} has no ${m}.`, fix: 'Open Stat Sheet', to: '#/builds/sheet' })),
    ...(theirs
      ? missingStats(theirs).map((m) => ({ text: `${opponent.name} has no ${m}.`, fix: 'Open Opponents', to: '#/tools/opponents' }))
      : []),
  ]);
  const blankRows = $derived(theirs?.defaulted?.length ? defaultedLabels(theirs.defaulted) : []);
  const perSeat = $derived(EFFORT[effort]);
  const total = $derived(perSeat * (seat === 'both' ? 2 : 1));

  // ---- the job ---------------------------------------------------------------------------------

  /** What a run depends on: the two fighters as the engine will read them, the seat and N. */
  function signatureFor(presetId, opponentId, seatId, n) {
    const c = rosterStore.current;
    const o = c?.opponents.find((x) => x.id === opponentId);
    if (!c || !o || !c.presets.some((p) => p.id === presetId)) return null;
    const inputs = metricKey('duel-inputs', presetDuelFighter(c, presetId), opponentFighter(o), seatId, n);
    return jobSignature({ characterKey: c.id, presetId, inputs });
  }

  function launch(request, meta) {
    const sig = () => signatureFor(meta.presetId, meta.opponentId, meta.seat, meta.n);
    jobId = startJob({
      tool: 'duel',
      title: `${meta.myName} vs ${meta.theirName}`,
      context: `${meta.seat === 'both' ? 'both seats' : `${meta.seat} seat`} · ${fmtCount(meta.n)} fights${meta.seat === 'both' ? ' each' : ''}`,
      request: { ...request, meta },
      signature: sig(),
      currentSignature: sig,
      openRoute: formatHash('tools/duel'),
      summarize: (r) => duelJobChips(r, meta.seat),
    });
  }

  function run() {
    if (blockers.length || !opponent) return;
    const n = perSeat;
    const pair = arrange(mine, theirs, seat === 'defender' ? 'defender' : 'attacker');
    const labels = seat === 'both' ? ['I attack', 'I defend'] : [seat === 'attacker' ? 'I attack' : 'I defend'];
    launch(
      { mode: 'duel', ...pair, n, seed: SEED, trace: true, both: seat === 'both', phaseLabels: labels },
      { seat, n, seed: SEED, presetId: preset.id, opponentId: opponent.id, myName: preset.name, theirName: opponent.name },
    );
  }

  const job = $derived(jobsStore.list.find((j) => j.id === jobId) ?? null);
  const meta = $derived(job?.request?.meta ?? null);
  const busy = $derived(job?.status === 'queued' || job?.status === 'running');
  const stale = $derived(job ? isStale(job) : false);
  const seats = $derived(job?.result && meta ? seatsFromResult(job.result, meta.seat) : null);
  // A Both-seats run stopped before both seats had samples says so instead of judging from one seat.
  const partial = $derived(!!seats && meta?.seat === 'both' && !(seats.attack && seats.defend));
  const verdict = $derived(partial ? null : winRateVerdict(seats?.total));
  const tableRows = $derived.by(() => {
    if (!seats?.total) return [];
    const rows = [];
    if (meta.seat === 'both') {
      if (!partial) rows.push({ id: 'total', label: 'Both seats', summary: seats.total });
      if (seats.attack) rows.push({ id: 'attack', label: 'I attack', summary: seats.attack });
      if (seats.defend) rows.push({ id: 'defend', label: 'I defend', summary: seats.defend });
    } else {
      rows.push({ id: 'total', label: meta.seat === 'attacker' ? 'I attack' : 'I defend', summary: seats.total });
    }
    return rows;
  });
  const segments = $derived(
    (job?.progress?.phases ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      state: job.status === 'cancelled' && p.state === 'current' ? 'cancelled' : p.state === 'current' ? 'active' : p.state,
      done: p.done,
      total: p.total,
    })),
  );
  const nextN = $derived(meta ? Math.min(MAX_N, meta.n * RUN_MORE_FACTOR) : 0);
  const canMore = $derived(!!meta && !busy && meta.n < MAX_N && job?.status === 'finished');

  function runMore() {
    if (!canMore || stale) return;
    const next = { ...meta, n: nextN };
    launch({ ...job.request, n: nextN, meta: next }, next);
  }

  // ---- the sample duel --------------------------------------------------------------------------

  const sample = $derived(reroll?.jobId === jobId ? reroll : job?.result?.trace ? job.result : null);
  const mineSide = $derived(meta?.seat === 'defender' ? 'defender' : 'attacker');
  const sampleNames = $derived(
    mineSide === 'attacker'
      ? { attacker: meta?.myName, defender: meta?.theirName }
      : { attacker: meta?.theirName, defender: meta?.myName },
  );

  async function rerollSample() {
    if (!job || rerolling) return;
    rerolling = true;
    const forJob = job.id;
    try {
      const { attacker, defender } = job.request;
      const r = await runOptimizerTask({ mode: 'duel', attacker, defender, n: 0, seed: SEED, trace: true, traceSeed: Math.floor(Math.random() * 1e9) }).promise;
      if (jobId === forJob) reroll = { jobId: forJob, trace: r.trace, traceResult: r.traceResult };
    } catch (e) {
      setStatus(`Could not show another sample: ${e.message}`);
    } finally {
      rerolling = false;
    }
  }

  // ---- tabs and display -------------------------------------------------------------------------

  // The Verify tab needs game-data import (Settings > Advanced); a log already handed over keeps it.
  const verifyShown = $derived(prefs.showImport || !!logHandoff);
  const TABS = $derived([
    { id: 'duel', label: 'Duel' },
    ...(verifyShown ? [{ id: 'verify', label: 'Verify a fight log' }] : []),
  ]);
  const onTab = (id) => go(formatHash('tools/duel', id === 'verify' ? 'verify' : null), { replace: true });
  $effect(() => {
    tabId = tab === 'verify' && verifyShown ? 'verify' : 'duel';
  });

  // A fight log handed over by the import dialog: on mount and whenever another one arrives, take it,
  // show the Verify tab and let it check the log.
  $effect(() => {
    importFlow.handoffSeq;
    untrack(() => {
      const text = takeHandoff('fightLog');
      if (text == null) return;
      logHandoff = { text, n: ++handoffCount };
      tabId = 'verify';
      go(formatHash('tools/duel', 'verify'), { replace: true });
    });
  });

  const columns = $derived(opponent && !blockers.length ? orderStats(simulatedColumns(mine, theirs), character.class, (row) => row.key)
    .map((row) => ({ ...row, label: orderedStatLabel(row.key, row.label, character.class) })) : []);
  const verifyFighters = $derived(
    opponent && !blockers.length
      ? { ...arrange(mine, theirs, 'attacker'), label: `${preset.name} vs ${opponent.name}` }
      : null,
  );
  const presetOptions = $derived(character.presets.map((p) => ({ value: p.id, label: p.name })));
  const opponentOptions = $derived(character.opponents.map((o) => ({ value: o.id, label: o.name })));
  const seatOptions = [
    { value: 'attacker', label: 'Attacker' },
    { value: 'defender', label: 'Defender' },
    { value: 'both', label: 'Both' },
  ];
  const effortOptions = [
    { value: 'quick', label: 'Quick', sub: `${fmtCount(EFFORT.quick)} fights` },
    { value: 'standard', label: 'Standard', sub: `${fmtCount(EFFORT.standard)} fights` },
    { value: 'thorough', label: 'Thorough', sub: `${fmtCount(EFFORT.thorough)} fights` },
  ];
</script>

<div class="page-tabs">
  <Tabs items={TABS} bind:value={tabId} label="Duel sections" idPrefix="duel" onchange={onTab} />
</div>

{#if tabId === 'verify' && verifyShown}
  <div role="tabpanel" id="duel-panel-verify">
    <VerifyFightLog fighters={verifyFighters} handoff={logHandoff} />
  </div>
{:else}
  <div role="tabpanel" id="duel-panel-duel" class="panes">
    <div data-testid="duel-setup">
      <Panel title="Setup" level="primary" scope="tool">
        <Select label="My preset" options={presetOptions} value={preset.id} onchange={(v) => (presetPick = v)} />
        {#if character.opponents.length}
          <Select
            label="Opponent"
            options={opponentOptions}
            value={opponent.id}
            onchange={(v) => (opponentPick = v)}
            hint="Edit opponents on the Opponents page."
          />
        {:else}
          <EmptyState title="No saved opponents yet" text="A duel needs an opponent's stat sheet.">
            {#snippet action()}<Button variant="secondary" onclick={() => go('#/tools/opponents')}>Open Opponents</Button>{/snippet}
          </EmptyState>
        {/if}
        <div class="field">
          <span class="lbl">Seat</span>
          <SegmentedControl label="Seat" options={seatOptions} bind:value={seat} />
          <span class="hint" data-testid="seat">
            {seat === 'both' ? 'You attack, then defend. Ties go to the defender, so the seat matters.' : `You are the ${seat}. Ties go to the defender.`}
          </span>
        </div>
        <div class="field">
          <span class="lbl">Effort</span>
          <SegmentedControl label="Effort" options={effortOptions} bind:value={effort} />
          <RunEstimate fights={duelFights(perSeat, seat === 'both' ? 2 : 1)} />
          <span class="hint">Fights per seat. More effort spots smaller differences and takes longer. Seed <span class="num">{SEED}</span>: the same seed gives the same result.</span>
        </div>
        {#each blockers as b (b.text)}
          <Banner variant="warn">
            {b.text} {requiredStatsText()}.
            {#snippet action()}<Button variant="ghost" size="small" onclick={() => go(b.to)}>{b.fix}</Button>{/snippet}
          </Banner>
        {/each}
        {#if !blockers.length && blankRows.length}
          <Banner variant="info" lead="Blank rows use neutral values.">
            {opponent.name}'s sheet leaves {blankRows.join(', ')} blank, so the duel counts them as 0 (Crit Damage as 150%).
          </Banner>
        {/if}
        {#snippet footer()}
          {#if busy}
            <Button variant="danger" size="block" onclick={() => cancelJob(job.id)}>Cancel</Button>
          {:else}
            <Button
              variant="primary"
              size="block"
              disabled={!opponent || blockers.length > 0}
              reason={!opponent ? 'Add an opponent first.' : blockers.length ? blockers[0].text : ''}
              onclick={run}>Run {fmtCount(total)} duels</Button
            >
          {/if}
        {/snippet}
      </Panel>
    </div>

    <div class="stack" data-testid="duel-output">
      {#if job}
        <Panel title={meta ? `${meta.myName} vs ${meta.theirName}` : 'Result'} level="primary" scope="tool" stale={stale}>
          {#if segments.length}
            <div data-testid="duel-progress"><RunProgress {segments} /></div>
          {/if}
          {#if job.status === 'failed'}
            <Banner variant="error" lead="The duel could not finish.">{job.error}</Banner>
          {/if}
          {#if stale}
            <Banner variant="warn" lead="Setup changed since this run.">The preset or the opponent is not what was simulated. Run again for a current result.</Banner>
          {/if}
          {#if job.status === 'cancelled'}
            <Banner variant="info" lead="Cancelled.">
              Showing the fights finished so far.
              {#snippet action()}<Button variant="ghost" size="small" onclick={() => resumeJob(job.id)}>Resume</Button>{/snippet}
            </Banner>
          {/if}
          {#if tableRows.length}
            <div class="headline" data-testid="duel-result">
              {#if partial}
                <h3 data-testid="duel-partial">Not finished yet</h3>
                <p>Only one seat has fights so far. The result for both seats appears once both finish.</p>
              {:else}
                <h3>{duelHeadline(verdict, meta.myName)}</h3>
                <p data-testid="duel-verdict">{duelVerdictText(verdict)}</p>
              {/if}
            </div>
            <WinRateTable rows={tableRows} {partial} />
            <dl class="facts">
              <div><dt>Average length</dt><dd>{seats.total.meanMs != null ? `${(seats.total.meanMs / 1000).toFixed(1)} s` : 'n/a'}</dd></div>
              <div><dt>Ran out of time</dt><dd>{seats.total.timeoutShare != null ? `${(seats.total.timeoutShare * 100).toFixed(1)}%` : 'n/a'}</dd></div>
              <div><dt>Seed</dt><dd>{meta.seed}</dd></div>
            </dl>
            <p class="note">A tie, or running out of time with equal Health, goes to the defender, as in the game. The PVP Health buff (x8 to x24 by the attacker's level) and double damage after 40 seconds are already included.</p>
            <details class="basis">
              <summary>How this works</summary>
              <p>Each fight is simulated with the game's own combat rules. The likely range is a 95% interval on the win rate. A result is clearly better or worse only when the whole range is on one side of 50%. Otherwise it is too close to call, and the estimate of how many fights would settle it assumes you want to spot a difference of at least 3 points.</p>
            </details>
            <div class="more">
              <Button variant="secondary" disabled={!canMore || stale} reason={stale ? 'Setup changed since this run.' : meta.n >= MAX_N ? 'Already at the most fights allowed.' : ''} onclick={runMore}>
                Run more fights ({fmtCount(nextN)} per seat)
              </Button>
            </div>
          {:else if busy}
            <p class="note">Running…</p>
          {/if}
        </Panel>

        {#if columns.length && meta}
          <Panel title="Stats used in the fight" scope="tool">
            <FightersTable rows={columns} myName={preset.name} theirName={opponent.name} />
          </Panel>
        {/if}

        {#if sample && meta}
          <SampleDuel
            trace={sample.trace}
            traceResult={sample.traceResult}
            attackerName={sampleNames.attacker}
            defenderName={sampleNames.defender}
            {mineSide}
            seed={reroll?.jobId === jobId ? null : meta.seed}
            {rerolling}
            onreroll={rerollSample}
          />
        {/if}
      {:else}
        <Panel title="Result" level="primary" scope="tool">
          <EmptyState title="No duel run yet" text="Pick a preset, an opponent and a seat, then run. The win rate appears here with its likely range." />
        </Panel>
        {#if columns.length}
          <Panel title="Stats used in the fight" scope="tool">
            <FightersTable rows={columns} myName={preset.name} theirName={opponent.name} />
          </Panel>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .page-tabs { margin-bottom: var(--sp-4); }
  .panes { display: grid; grid-template-columns: minmax(0, 360px) minmax(0, 1fr); gap: var(--sp-4); align-items: start; }
  .panes > * { min-width: 0; }
  @media (max-width: 1100px) { .panes { grid-template-columns: minmax(0, 1fr); } }
  .stack { display: grid; gap: var(--sp-4); min-width: 0; }
  .field { display: grid; gap: var(--sp-1); min-width: 0; }
  /* The segmented Seat and Effort controls fill the panel and wrap their segments instead of overflowing it. */
  .field :global(.seg) { display: flex; flex-wrap: wrap; width: 100%; max-width: 100%; box-sizing: border-box; }
  .field :global(.seg button) { flex: 1 1 auto; justify-content: center; white-space: normal; min-width: 0; }
  .lbl { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .hint, .note { color: var(--text-muted); font-size: var(--fs-12); margin: 0; overflow-wrap: anywhere; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .headline h3 { margin: 0; font-family: var(--font-display); font-size: var(--fs-20); }
  .headline p { margin: var(--sp-1) 0 0; color: var(--text-soft); font-size: var(--fs-13); }
  .facts { display: flex; flex-wrap: wrap; gap: var(--sp-5); margin: 0; }
  .facts div { display: grid; gap: var(--sp-1); }
  .facts dt { color: var(--text-muted); font-size: var(--fs-11); text-transform: uppercase; letter-spacing: var(--track-label); }
  .facts dd { margin: 0; font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .more { display: flex; gap: var(--sp-2); }
  .basis { font-size: var(--fs-12); color: var(--text-muted); }
  .basis summary { cursor: pointer; color: var(--text-soft); }
  .basis p { margin: var(--sp-2) 0 0; }
</style>
