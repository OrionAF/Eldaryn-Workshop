<script>
  /**
   * ToolsOblivionPage.svelte - T5 Oblivion Floors (ia.md §5.20): locked state with inline unlock, summary
   * strip, scan setup, and a per-floor table. The scan is a job (jobs.svelte.js) so it survives navigation;
   * the result is read from the job, never copied. Floor resolution is [SERVER]: every figure here is a
   * model estimate of the client's fight (plan Q1/#105).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { computePresetStats } from '../../lib/build/stats.js';
  import { go } from '../../lib/router.svelte.js';
  import { startJob, cancelJob, resumeJob, isStale, jobSignature, jobsStore } from '../../lib/jobs.svelte.js';
  import {
    strainRows, WIN_THRESHOLD, FLOOR_EFFORT, floorScanRequest, floorScanInputs,
  } from '../../lib/features/oblivionDungeon.js';
  import { formatFlat } from '../../lib/format.js';
  import { oblivionFights } from '../../lib/calibration.js';
  import RunEstimate from '../ui/RunEstimate.svelte';
  import Panel from '../ui/Panel.svelte';
  import Banner from '../ui/Banner.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';

  let { setStatus = () => {} } = $props();

  const LAST_FLOOR = 60;
  const character = $derived(rosterStore.current);
  const unlocked = $derived(character?.oblivion?.unlocked === true);

  let from = $state(1);
  let to = $state(30);
  let effort = $state('standard');
  let threshold = $state(Math.round(WIN_THRESHOLD * 100));
  let applyOutputCut = $state(false); // Q2: instability cut OFF by default

  const opts = $derived({ from, to, effort, threshold: threshold / 100, applyOutputCut });
  const stats = $derived.by(() => {
    if (!character || !unlocked) return null;
    try {
      return computePresetStats(character, undefined, { realm: 'oblivion' }).effective;
    } catch {
      return null;
    }
  });
  const power = $derived(Math.round(Number(stats?.totalOblivionPower) || 0));
  const baseRows = $derived(strainRows(power, from, to));

  // The latest scan of this character; its result is read straight off the job.
  const job = $derived(
    character ? [...jobsStore.list].reverse().find((j) => j.tool === 'oblivion-floors' && j.context === character.id) : null,
  );
  const running = $derived(job?.status === 'running' || job?.status === 'queued');
  const stale = $derived(!!job && job.status !== 'running' && job.status !== 'queued' && isStale(job));
  const result = $derived(job?.result ?? null);
  const byFloor = $derived(Object.fromEntries((result?.rows ?? []).map((r) => [r.floor, r])));

  function scan() {
    if (!character || running) return;
    const o = opts;
    const id = character.id;
    startJob({
      tool: 'oblivion-floors',
      title: `Oblivion floors ${o.from}-${o.to}`,
      context: id,
      request: floorScanRequest(character, o),
      signature: jobSignature({ characterKey: id, inputs: floorScanInputs(character, o) }),
      currentSignature: () => jobSignature({ characterKey: id, inputs: floorScanInputs(rosterStore.current, opts) }),
      openRoute: 'tools/oblivion',
      notice: 'Floor run started',
      summarize: (r) => [{ tone: r?.maxFloor ? 'up' : 'warn', text: r?.maxFloor ? `Floor ${r.maxFloor} (estimate)` : 'No floor reached' }],
    });
  }

  const pct = (p) => `${(p * 100).toFixed(0)}%`;
  const secs = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)}s`);
  const maxLabel = $derived(
    result?.maxFloor == null ? '-' : result.scanCapped ? `${result.maxFloor}+ (scan limit)` : String(result.maxFloor),
  );
</script>

{#if character}
  <section class="obl">
    {#if !unlocked}
      <Panel title="Oblivion Floors" scope="oblivion">
        <EmptyState title="The Oblivion hero is locked" text="Unlock it to estimate how far this build climbs.">
          {#snippet action()}
            <Button variant="primary" onclick={() => rosterStore.setOblivionUnlocked(true)}>Unlock Oblivion</Button>
          {/snippet}
        </EmptyState>
      </Panel>
    {:else}
      <Panel title="Summary" scope="oblivion">
        <div class="strip">
          <div><span class="cap-label">Oblivion Power</span><strong class="num" data-testid="power">{formatFlat(power)}</strong></div>
          <div><span class="cap-label">Attack</span><strong class="num">{stats?.totalAttack == null ? '-' : formatFlat(stats.totalAttack)}</strong></div>
          <div><span class="cap-label">HP</span><strong class="num">{stats?.totalHp == null ? '-' : formatFlat(stats.totalHp)}</strong></div>
          <div>
            <span class="cap-label">Highest floor won {threshold}%+ of the time</span>
            <strong class="num" data-testid="max-floor">{stale ? '-' : maxLabel}</strong>
          </div>
          <div><span class="cap-label">Oblivion Level</span><strong class="num">{character.oblivion.level}</strong>
            <a href="#character/overview">Edit</a></div>
        </div>
        <p class="caption">An estimate: the game server decides the real fight. Gear for this realm is on the <a href="#character/gear">Gear page, Oblivion tab</a>.</p>
      </Panel>

      <Panel title="Floor setup" scope="tool">
        <div class="setup">
          <div class="field"><span class="micro-label" aria-hidden="true">From floor</span><Stepper label="From floor" bind:value={from} min={1} max={to} /></div>
          <div class="field"><span class="micro-label" aria-hidden="true">To floor</span><Stepper label="To floor" bind:value={to} min={from} max={LAST_FLOOR} /></div>
          <div class="field"><span class="micro-label" aria-hidden="true">Win chance needed %</span><Stepper label="Win chance needed %" bind:value={threshold} min={50} max={99} /></div>
          <SegmentedControl
            label="Effort" bind:value={effort}
            options={Object.entries(FLOOR_EFFORT).map(([value, n]) => ({ value, label: value[0].toUpperCase() + value.slice(1), sub: `${n} fights per floor` }))}
          />
          <RunEstimate bound="upper" fights={oblivionFights(to - from + 1, FLOOR_EFFORT[effort] ?? FLOOR_EFFORT.standard)} />
          <Checkbox label="Apply the instability output cut" bind:checked={applyOutputCut} />
        </div>
        <div class="actions">
          <Button variant="primary" disabled={running} loading={running} busyLabel="Running…" onclick={scan}>Simulate floors {from}-{to}</Button>
          {#if running}
            <Button variant="ghost" onclick={() => cancelJob(job.id)}>Cancel</Button>
            {#if job?.progress?.floor}<span class="num muted">floor {job.progress.floor}: {job.progress.done}/{job.progress.n}</span>{/if}
          {/if}
        </div>
        {#if job?.status === 'failed'}<Banner variant="error" lead="The floor run failed">{job.error}</Banner>{/if}
      </Panel>

      {#if stale}
        <Banner variant="warn" lead="Out of date">Your build or setup changed since this run. Run it again.</Banner>
      {/if}
      {#if job?.status === 'cancelled'}
        <Banner variant="info" lead="Cancelled">
          Showing the floors finished so far.
          {#snippet action()}<Button variant="ghost" size="small" onclick={() => resumeJob(job.id)}>Resume</Button>{/snippet}
        </Banner>
      {/if}
      {#if result?.assumptions?.length}
        <ul class="chips" aria-label="Assumptions">
          {#each result.assumptions as a (a.key)}<li class="chip-static" title={a.text}>{a.text}</li>{/each}
        </ul>
      {/if}

      <Panel title="Floors" scope="oblivion" stale={stale}>
        <!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be focusable) -->
        <div class="scroll" role="region" aria-label="Floors table" tabindex="0">
        <table class="floors" class:stale aria-label="Oblivion floors">
          <thead>
            <tr>
              <th>Floor</th><th class="r">Instability</th><th class="r">Net strain</th>
              <th class="r">Win %</th><th class="r">Likely range</th>
              <th class="r">Wins</th><th class="r">Deaths</th><th class="r">Ran out of time</th><th class="r">Fights</th><th class="r">Typical clear time</th>
            </tr>
          </thead>
          <tbody>
            {#each baseRows as row (row.floor)}
              {@const r = byFloor[row.floor]}
              <tr data-floor={row.floor} class:ok={r && r.verdict === 'pass'}>
                <td class="num">{row.floor}</td>
                <td class="num r">{formatFlat(row.instability)}</td>
                <td class="num r">{formatFlat(row.strain)}</td>
                <td class="num r" data-cell="win">
                  {#if r}<span class="bar" style:width="{Math.round(r.p * 100)}%"></span>{pct(r.p)}{:else}-{/if}
                </td>
                <td class="num r muted">{r ? `${pct(r.pLo)} - ${pct(r.pHi)}` : '-'}</td>
                <td class="num r">{r ? r.wins : '-'}</td>
                <td class="num r">{r ? r.deaths : '-'}</td>
                <td class="num r">{r ? r.timeouts : '-'}</td>
                <td class="num r muted">{r ? r.n : '-'}</td>
                <td class="num r muted">{r ? secs(r.medianMs) : '-'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        </div>
        <p class="caption">Likely range: where the real win rate probably lies, judged from the fights simulated. It is not a value from the game.</p>
      </Panel>
    {/if}
  </section>
{/if}

<style>
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .obl { display: grid; gap: var(--sp-4); }
  .strip, .setup, .actions { display: flex; flex-wrap: wrap; gap: var(--sp-4); align-items: flex-end; }
  .strip > div { display: flex; flex-direction: column; gap: var(--sp-1); }
  .field { display: flex; flex-direction: column; gap: var(--sp-1); }
  .caption, .muted { color: var(--text-muted); font-size: var(--fs-12); }
  .caption { margin: var(--sp-3) 0 0; }
  .chips { display: flex; flex-wrap: wrap; gap: var(--sp-2); list-style: none; margin: 0; padding: 0; }
  .chip-static {
    font-size: var(--fs-12); color: var(--text-soft); border: 1px solid var(--line-rule);
    border-radius: var(--r-2); padding: var(--sp-1) var(--sp-2);
  }
  .scroll { overflow-x: auto; max-width: 100%; }
  .floors { width: 100%; border-collapse: collapse; font-size: var(--fs-13); }
  .floors th { text-align: left; font-size: var(--fs-11); color: var(--text-muted); padding: var(--sp-1) var(--sp-2); }
  .floors td { padding: var(--sp-1) var(--sp-2); border-top: 1px solid var(--line-hairline); position: relative; }
  .floors .r { text-align: right; }
  .floors.stale { opacity: 0.45; filter: grayscale(1); }
  .bar { position: absolute; left: 0; bottom: 0; height: calc(var(--sp-1) * 0.5); background: var(--brass-500); }
  tr.ok td:first-child { color: var(--brass-400); }
</style>
