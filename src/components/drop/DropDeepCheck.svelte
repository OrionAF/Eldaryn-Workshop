<script>
  /**
   * DropDeepCheck.svelte - Drop Check's deep check (features/deepCheck.js, simulation.md §Drop Check, Deep check).
   *
   * A plain check keeps everything but the item fixed. The deep check re-tunes one preset for one judge goal twice,
   * without and with the drop, then compares the two re-tuned builds on fresh fights, so a drop that only pays once
   * stones or talents move is credited, and a gain that re-tuning alone gives is not. Runs as a job (tool
   * 'drop-deep'); a saved Optimiser run of the same goal that is still current stands in for the run without.
   *
   * Props: character, realm, drop (character.drop), resolved (ui/dropGoals.js resolveDropGoals), precision,
   * hasStats, signature() (the page's staleness signature), setStatus.
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { jobsStore, startJob, cancelJob, isStale } from '../../lib/jobs.svelte.js';
  import { formatHash } from '../../lib/routes.js';
  import { equipSetKey } from '../../lib/build/presetInputs.js';
  import { goalCharacter, BATCH_SIM } from '../../lib/features/dropBatch.js';
  import { reusableRun, DEEP_SPACES } from '../../lib/features/deepCheck.js';
  import { setLabelOf } from '../../lib/features/dropView.js';
  import { runIsStale } from '../../lib/ui/optimiserSetup.js';
  import { deepGoals, deepRequest, deepCard, DEEP_MINUTES, DEEP_DEFAULT_MINUTES } from '../../lib/ui/deepCheckView.js';
  import Select from '../ui/Select.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import RunProgress from '../ui/RunProgress.svelte';
  import VerdictChip from '../ui/VerdictChip.svelte';
  import ScopeChip from '../ui/ScopeChip.svelte';

  let { character, realm, drop, resolved, precision, hasStats, signature, setStatus = () => {} } = $props();
  const id = $props.id();

  const SPACES = [
    { value: 'full', label: 'Full', sub: 'everything the Optimiser tunes' },
    { value: 'light', label: 'Light', sub: 'stones, talents, sigils, relics' },
  ];

  // presets that wear a set in the drop's realm and have a judge goal for it
  const presets = $derived(character.presets.filter((p) => deepGoals(resolved, realm, p.id).length));
  let presetId = $state(untrack(() => character.activePresetId));
  const pid = $derived(presets.some((p) => p.id === presetId) ? presetId : presets[0]?.id ?? null);
  const goals = $derived(pid ? deepGoals(resolved, realm, pid) : []);
  let goalId = $state(null);
  const gid = $derived(goals.some((r) => r.goal.id === goalId) ? goalId : goals[0]?.goal.id ?? null);
  let space = $state('full');
  let minutes = $state(DEEP_DEFAULT_MINUTES);

  const baseRequest = $derived(
    pid && gid && hasStats
      ? deepRequest({ character: goalCharacter(character), presetId: pid, drop, realm, resolved, goalId: gid, space, minutes, precision, seed: BATCH_SIM.seed })
      : null,
  );
  /** A saved Optimiser run that can stand in for the run without the drop (same preset, goal and space, current). */
  const reuse = $derived(
    baseRequest
      ? reusableRun(character.runs, { presetId: pid, goal: baseRequest.goal, space: DEEP_SPACES[space], character, isCurrent: (r) => !runIsStale(r, character) })
      : null,
  );

  const ownedBy = (j) => j.tool === 'drop-deep' && (() => { try { return JSON.parse(j.signature)[0] === character?.id; } catch { return false; } })();
  const job = $derived(jobsStore.list.findLast(ownedBy) ?? null);
  const busy = $derived(job?.status === 'queued' || job?.status === 'running');
  const stale = $derived(!!job && isStale(job));
  const result = $derived(job?.result ?? null);
  const card = $derived(result ? deepCard(result) : null);
  const ranPreset = $derived(result ? character.presets.find((p) => p.id === result.presetId) ?? null : null);
  const ranGoal = $derived(result ? resolved.find((r) => r.goal.id === result.goalId) ?? null : null);
  const segments = $derived(
    (job?.progress?.phases ?? []).map((p) => ({
      id: p.id,
      label: p.label,
      state: job.status === 'finished' || p.state === 'done' ? 'done' : job.status === 'cancelled' || job.status === 'failed' ? 'cancelled' : p.state === 'current' ? 'active' : 'queued',
      done: p.done,
      total: p.total,
    })),
  );

  const reason = $derived(
    !hasStats ? 'Enter at least one stat for the drop'
      : !presets.length ? `No judge goal for ${realm === 'oblivion' ? 'Oblivion' : 'base-realm'} drops judges a preset`
        : !baseRequest ? 'Pick a preset and a goal' : '',
  );

  function run() {
    if (!baseRequest) return;
    const request = { ...baseRequest, reuse };
    const p = character.presets.find((x) => x.id === pid);
    const g = goals.find((r) => r.goal.id === gid);
    startJob({
      tool: 'drop-deep',
      title: 'Drop Check · Deep check',
      context: `${p?.name ?? ''} · ${g?.label ?? ''} · ${space === 'light' ? 'Light' : 'Full'} · up to ${minutes * (reuse ? 1 : 2)} min`,
      request,
      signature: signature(),
      currentSignature: () => signature(),
      openRoute: formatHash('tools/drop'),
      notice: 'Deep check started. Progress is in Jobs.',
      summarize: (res) => {
        const c = deepCard(res);
        return [{ tone: { better: 'up', worse: 'down' }[c.chip.verdict] ?? 'warn', text: c.chip.label }];
      },
    });
  }

  let confirming = $state(null); // 'item' | 'retune' | null
  const setKey = $derived(result?.setKey ?? null);
  function applyItem() {
    confirming = null;
    const ok = rosterStore.applyDropToSet(setKey);
    setStatus(ok ? `Applied to ${setLabelOf(setKey)}` : `Could not apply to ${setLabelOf(setKey)}`);
  }
  function applyRetune() {
    confirming = null;
    // the re-tune first: when it is refused nothing has changed
    const r = rosterStore.applyCandidate(result.presetId, result.with.candidate);
    if (!r.ok) {
      setStatus(`Could not apply the re-tune: ${r.violations[0]?.detail ?? 'it is no longer legal'}`);
      return;
    }
    const ok = rosterStore.applyDropToSet(setKey);
    setStatus(ok ? `Applied the item to ${setLabelOf(setKey)} and the re-tune to ${ranPreset?.name ?? 'the preset'}` : `Applied the re-tune, but could not put the item in ${setLabelOf(setKey)}`);
  }
  const wornBy = $derived(setKey ? character.presets.filter((p) => equipSetKey(p, realm) === setKey).map((p) => p.name) : []);
</script>

<div class="deep" aria-labelledby="{id}-h">
  <p class="hint">
    The check above changes only the item. A deep check re-tunes one preset for one goal twice, without and with the drop,
    then compares the two best builds on fresh fights. Use it when an item might pay only after stones or talents move.
  </p>
  {#if presets.length}
    <div class="controls">
      <Select label="Preset" value={pid ?? ''} options={presets.map((p) => ({ value: p.id, label: p.name }))} onchange={(v) => (presetId = v)} />
      <Select label="Goal" value={gid ?? ''} options={goals.map((r) => ({ value: r.goal.id, label: r.label }))} onchange={(v) => (goalId = v)} />
      <div class="block">
        <span class="cap-label">Search</span>
        <SegmentedControl label="Search" bind:value={space} options={SPACES} />
      </div>
      <Select label="Time per side" value={String(minutes)} options={DEEP_MINUTES.map((m) => ({ value: String(m), label: `${m} min` }))} onchange={(v) => (minutes = Number(v))} />
    </div>
  {:else}
    <p class="note" data-empty>Add a goal that judges {realm === 'oblivion' ? 'Oblivion' : 'base-realm'} drops (not a guard) to deep check a preset.</p>
  {/if}
  {#if reuse}
    <p class="hint" data-reuse>A saved Optimiser run of this goal is still current: it stands in for the run without the drop.</p>
  {/if}
  <div class="actions">
    <Button variant="secondary" disabled={!!reason || busy} {reason} loading={busy} busyLabel="Deep checking…" onclick={run}>Deep check</Button>
    {#if busy}<Button variant="ghost" onclick={() => cancelJob(job.id)}>Cancel</Button>{/if}
  </div>

  {#if job}
    <RunProgress {segments} />
    {#if job.status === 'failed' || result?.status === 'failed'}
      <Banner variant="error" lead="The deep check failed.">{job.error ?? result?.error}</Banner>
    {/if}
    {#if stale}
      <Banner variant="warn" lead="Out of date.">The drop, your gear or the goals changed since this deep check. Run it again for an up-to-date answer.</Banner>
    {/if}
    {#if card && result?.status !== 'failed'}
      <article class="card" id="{id}-h" data-verdict={card.chip.verdict}>
        <header class="head">
          <h3>{ranPreset?.name ?? 'Preset'} · {ranGoal?.label ?? 'Goal'}</h3>
          <span class="spacer"></span>
          {#if result.drop}<VerdictChip verdict={card.chip.verdict} label={card.chip.label} />{/if}
        </header>
        {#if card.partial}
          <p class="hint">Cancelled before it finished: {result.with ? 'the comparison is incomplete' : 'only the run without the drop finished'}.</p>
        {/if}
        {#if card.unworn}
          <p class="note">The best build with the drop moves {ranPreset?.name ?? 'the preset'} to another gear set, so it never wears the item.</p>
        {:else if card.drop}
          <p class="line"><span class="lbl">Drop, after both re-tunes</span><span class="num">{card.drop}</span></p>
        {/if}
        {#if card.retune}
          <p class="line"><span class="lbl">Re-tuning alone, without the drop</span><span class="num">{card.retune}</span></p>
        {/if}
        {#if card.withChanges.length && !card.unworn}
          <div class="changes">
            <span class="lbl">With the drop, also change</span>
            <ul>{#each card.withChanges as c (c)}<li>{c}</li>{/each}</ul>
          </div>
        {:else if result.with && !card.unworn}
          <p class="hint">The drop needs no other change.</p>
        {/if}
        {#each card.guards as g (g.id)}
          <p class="line guard" data-status={g.status}>
            <span class="lbl">Guard: {g.label}</span>
            <span class:fail={g.status === 'fail'}>{g.status === 'pass' ? 'Kept' : g.status === 'fail' ? 'Broken' : g.status === 'below' ? 'Already below' : 'Too close to call'}: {g.text}</span>
          </p>
        {/each}
        {#if card.reused}<p class="hint">The run without the drop is a saved Optimiser run.</p>{/if}
        {#if result.status === 'done' && !stale && setKey}
          <footer class="foot">
            <ScopeChip scope="character" target={`Gear ${setLabelOf(setKey)}`} sideEffects={wornBy} />
            <span class="spacer"></span>
            {#if confirming === null}
              <Button variant="secondary" size="small" onclick={() => (confirming = 'item')}>Item only…</Button>
              {#if !card.unworn && result.with?.changes?.length}
                <Button variant={result.verdict === 'upgrade' ? 'primary' : 'secondary'} size="small" onclick={() => (confirming = 'retune')}>Item + re-tune…</Button>
              {/if}
            {:else}
              <span class="confirm" role="group" aria-label="Confirm apply">
                <span class="hint">
                  {confirming === 'item'
                    ? `This puts the item in ${setLabelOf(setKey)} and changes ${wornBy.join(', ')}.`
                    : `This puts the item in ${setLabelOf(setKey)} and writes the re-tune to ${ranPreset?.name ?? 'the preset'}. Stones, talents and other character-wide choices change for every preset that shares them.`}
                </span>
                <Button variant="primary" size="small" confirming onclick={confirming === 'item' ? applyItem : applyRetune}>Confirm apply</Button>
                <Button variant="ghost" size="small" onclick={() => (confirming = null)}>Cancel</Button>
              </span>
            {/if}
          </footer>
        {/if}
      </article>
    {/if}
  {/if}
</div>

<style>
  .deep { display: grid; gap: var(--sp-3); min-width: 0; }
  .controls { display: flex; flex-wrap: wrap; gap: var(--sp-3); align-items: flex-end; }
  .block { display: grid; gap: var(--sp-1); }
  .actions { display: flex; gap: var(--sp-2); align-items: center; }
  .hint, .note { margin: 0; font-size: var(--fs-12); color: var(--text-soft); }
  .note { color: var(--text-ink); }
  .card {
    background: var(--surface-1);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-2);
    padding: var(--sp-3) var(--sp-4);
    display: grid;
    gap: var(--sp-2);
    min-width: 0;
  }
  .head, .foot { display: flex; align-items: center; flex-wrap: wrap; gap: var(--sp-2); }
  .foot { padding-top: var(--sp-2); border-top: 1px solid var(--line-hairline); }
  .spacer { flex: 1; }
  h3 { margin: 0; font-family: var(--font-display); font-size: var(--fs-14); color: var(--text-ink); }
  .line { margin: 0; display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--sp-2); font-size: var(--fs-12); color: var(--text-soft); }
  .lbl { color: var(--text-ink); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .guard .fail { color: var(--status-warn); }
  .changes { display: grid; gap: var(--sp-1); font-size: var(--fs-12); }
  .changes ul { margin: 0; padding-left: var(--sp-4); color: var(--text-soft); }
  .confirm { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
</style>
