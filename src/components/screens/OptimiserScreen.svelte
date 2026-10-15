<script>
  /**
   * OptimiserScreen.svelte - the build optimiser (search/search.js, docs/Reference/simulation.md §Search).
   * Pick a preset, a target, an objective and which build blocks may change; the worker races every legal
   * build, keeps only the changes that matter and confirms them on fresh fights. Every number carries N and a
   * 95% interval; a row's verdict against the current preset is family-wise corrected. Effort sets precision
   * only, never a time limit. Results come through optimiser/resultAdapter.js until U8 replaces this screen.
   */
  import { onDestroy } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { runOptimizerTask } from '../../lib/optimizerClient.js';
  import { SPACE_DEFAULTS } from '../../lib/search/space.js';
  import { EFFORT_LEVELS, resolveEffort } from '../../lib/search/search.js';
  import Chip from '../Chip.svelte';
  import TargetPicker from '../optimiser/TargetPicker.svelte';
  import SpacePicker from '../optimiser/SpacePicker.svelte';
  import ResultList from '../optimiser/ResultList.svelte';
  import RunHistory from '../optimiser/RunHistory.svelte';
  import { legacyView } from '../optimiser/resultAdapter.js';

  let { setStatus = () => {}, onNavigate = () => {} } = $props(); // eslint-disable-line no-unused-vars

  const EFFORT_LABEL = { quick: 'Quick', standard: 'Standard', thorough: 'Thorough' };

  const character = $derived(rosterStore.current);

  let presetPick = $state(null);
  let target = $state({ kind: 'dummy', seconds: 60 });
  let objective = $state({ kind: 'dps' });
  let space = $state({ ...SPACE_DEFAULTS });
  let effort = $state('standard');
  let seed = $state(1);
  let running = $state(false);
  let progress = $state(null);
  let last = $state(null); // { result, view, presetName, runId, characterId }
  let applying = $state(false);
  let job = null;

  const preset = $derived(character.presets.find((p) => p.id === presetPick) ?? character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const isPvp = $derived(target.kind === 'pvp');
  const opponents = $derived(character.opponents ?? []);
  // Opponents deleted since they were picked fall out of the request; a PVP run needs at least one left.
  const pvpIds = $derived(isPvp ? target.opponentIds.filter((id) => opponents.some((o) => o.id === id)) : []);
  const noPvpPick = $derived(isPvp && pvpIds.length === 0);
  const relative = $derived(objective.kind === 'dps' || String(objective.kind).startsWith('ttk'));
  const effortHint = $derived.by(() => {
    const e = resolveEffort(effort, { deltaKind: relative ? 'relative' : 'absolute' });
    const zone = relative ? `${(e.delta * 100).toFixed(2)}%` : `${(e.delta * 100).toFixed(1)} points`;
    return `Resolves differences of ${zone}; a comparison still open at ${e.maxN.toLocaleString('en-US')} fights is reported as too close to call.`;
  });

  const pctDone = $derived.by(() => {
    if (!progress?.phases) return 0;
    const i = progress.phases.findIndex((p) => p.state === 'current');
    return i < 0 ? 0 : (i + 0.5) / progress.phases.length;
  });
  const progressText = $derived.by(() => {
    if (!progress?.phases) return 'starting';
    const cur = progress.phases.find((p) => p.state === 'current');
    const c = progress.counts ?? {};
    return `${cur?.label ?? 'Working'}${progress.block ? ` (${progress.block})` : ''}: ${c.evaluated ?? 0} builds, ${(c.fights ?? 0).toLocaleString('en-US')} fights`;
  });

  async function run() {
    if (running || !preset) return;
    const snapshot = { presetId: preset.id, presetName: preset.name, characterId: character.id };
    const req = {
      mode: 'optimize',
      character: $state.snapshot(character),
      presetId: snapshot.presetId,
      target: isPvp ? { ...$state.snapshot(target), opponentIds: [...pvpIds] } : $state.snapshot(target),
      objective: $state.snapshot(objective),
      space: { ...$state.snapshot(space) },
      effort,
      seed: Number(seed) || 1,
    };
    running = true;
    progress = null;
    setStatus('');
    const own = runOptimizerTask(req, { onProgress: (p) => (progress = p) });
    job = own;
    try {
      const result = await own.promise;
      if (job !== own) return;
      const view = legacyView(result);
      let runId = null;
      if (result.status === 'done' && rosterStore.current?.id === snapshot.characterId) {
        runId = rosterStore.addRun(view, { presetName: snapshot.presetName })?.id ?? null;
      }
      last = { result, view, presetName: snapshot.presetName, runId, characterId: snapshot.characterId };
      setStatus(result.status === 'cancelled' ? 'Optimiser cancelled; showing provisional builds.' : '');
    } catch (e) {
      if (job === own) setStatus(`Optimiser failed: ${e.message}`);
    } finally {
      if (job === own) {
        running = false;
        job = null;
      }
    }
  }

  const cancel = () => job?.cancel();
  onDestroy(cancel);

  function apply(entry) {
    if (!last || applying) return;
    const p = character.presets.find((x) => x.id === last.view.presetId);
    if (!p || character.id !== last.characterId) {
      setStatus('That preset no longer exists on this character.');
      return;
    }
    applying = true;
    try {
      const r = rosterStore.applyCandidate(p.id, entry.candidate);
      setStatus(r.ok
        ? `Applied rank ${entry.rank} to ${p.name}. Re-run to measure against the new current build.`
        : `Not applied: ${r.violations.map((v) => v.detail).join('; ')}`);
    } finally {
      applying = false;
    }
  }

  const res = $derived(last?.view ?? null);
  const unit = $derived(res?.objective?.unit ?? 'dps');
</script>

<div class="header-row">
  <h2>Optimiser</h2>
  <p class="hint">Searches the allowed build choices for the best result on a target. Every number is simulated: N fights, 95% interval.</p>
</div>

<section class="panel" data-testid="optimiser-setup">
  <div class="group">
    <span class="micro-label">Preset to improve</span>
    <div class="chip-list">
      {#each character.presets as p (p.id)}
        <Chip label={p.name} selected={preset?.id === p.id} onClick={() => (presetPick = p.id)} />
      {/each}
    </div>
  </div>

  <TargetPicker bind:target bind:objective oblivionUnlocked={character.oblivion?.unlocked ?? false} playerLevel={character.level} {opponents} {onNavigate} />
  <SpacePicker bind:space />

  <div class="group">
    <span class="micro-label">Effort</span>
    <div class="chip-list">
      {#each EFFORT_LEVELS as key (key)}
        <Chip label={EFFORT_LABEL[key]} selected={effort === key} onClick={() => (effort = key)} />
      {/each}
      <label class="seed">
        <span class="micro-label">Seed</span>
        <input class="mono" type="number" min="1" step="1" bind:value={seed} />
      </label>
    </div>
    <p class="hint">{effortHint} The same seed reproduces the same result. A different seed re-rolls the fights.</p>
  </div>

  <div class="run-row">
    {#if running}
      <button type="button" class="btn-danger" onclick={cancel}>Cancel</button>
      <progress max="1" value={pctDone} aria-label="Optimiser progress"></progress>
      <span class="mono progress-text" data-testid="optimiser-progress">{progressText}</span>
    {:else}
      <button type="button" class="btn-gold" disabled={noPvpPick} onclick={run}>Optimise {preset?.name ?? ''}</button>
      {#if noPvpPick && opponents.length}<span class="hint">Pick at least one opponent.</span>{/if}
    {/if}
  </div>
</section>

{#if res}
  <section class="panel" data-testid="optimiser-output">
    <div class="out-head">
      <h3 class="subheading">{res.target.label}: {res.objective.label}</h3>
      <span class="mono meta">
        {last.presetName}, realm {res.realm}, seed {res.seed}, {res.stats.tier1} builds raced, {Math.round(res.stats.ms / 100) / 10} s
      </span>
    </div>
    {#if res.headline}<p class="headline" role="status">{res.headline.text}</p>{/if}
    {#if res.aborted}<p class="note" role="status">Cancelled: these builds are provisional (not confirmed on fresh fights).</p>{/if}
    {#if res.baselineViolations?.length}
      <p class="note" role="status">The current preset breaks a game rule; fix it first: {res.baselineViolations.map((v) => v.detail).join('; ')}</p>
    {/if}
    {#each res.warnings ?? [] as w (w.code + w.message)}<p class="hint">{w.message}</p>{/each}
    {#if !res.baseline}
      <p class="note" role="status">{res.error?.message ?? 'Nothing to show.'}</p>
    {:else}
      <ResultList {unit} baseline={res.baseline} results={res.results} onApply={apply} {applying} />
      {#if res.objective.kind === 'pvp-winrate'}
        <p class="hint">
          Win rates are the mean over every opponent and seat, with N duels and a 95% Wilson interval, measured on fresh duels after the search. Ties go to the defender. Your side is computed stats plus the preset's confirmed sheet residual.
        </p>
      {:else}
      <p class="hint">
        Builds are scored as computed stats plus the preset's confirmed sheet residual. Each listed change was needed: dropping it measured significantly worse. Verify a pick in game or on the Duel screen.
      </p>
      {/if}
    {/if}
  </section>
{/if}

<RunHistory />

<style>
  .header-row { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
  h2 { font-family: var(--font-heading); margin: 0; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
  .header-row .hint { flex: 1; }
  .panel {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 16px 18px;
    margin-bottom: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .seed { display: flex; align-items: center; gap: var(--space-2); margin-left: var(--space-3); }
  .seed input { width: 80px; }
  .run-row { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  progress { flex: 1; min-width: 120px; max-width: 320px; }
  .progress-text, .meta { font-size: 12px; color: var(--color-muted); }
  .out-head { display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
  .note { color: var(--color-warning); font-size: 12px; margin: 0; }
  .headline { margin: 0; font-size: 13px; color: var(--color-text); }
</style>
