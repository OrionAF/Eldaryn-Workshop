<script>
  /**
   * OptimiserScreen.svelte - PVE optimiser (rebuild-plan §5 row 2). Pick a preset, a target, an objective and
   * which build dimensions may change; the worker searches (tier 1 screens candidates cheaply, tier 2 re-measures
   * the finalists with more fights). Results show the top builds with N and a 95% interval on every simulated
   * number, a paired difference vs the current preset, and Apply to preset. Finished runs auto-save to history.
   */
  import { onDestroy } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { runOptimizerTask } from '../../lib/optimizerClient.js';
  import { SPACE_DEFAULTS } from '../../lib/search/candidates.js';
  import Chip from '../Chip.svelte';
  import TargetPicker from '../optimiser/TargetPicker.svelte';
  import SpacePicker from '../optimiser/SpacePicker.svelte';
  import ResultList from '../optimiser/ResultList.svelte';
  import RunHistory from '../optimiser/RunHistory.svelte';
  import { applyCandidate } from '../optimiser/apply.js';

  let { setStatus = () => {}, onNavigate = () => {} } = $props(); // eslint-disable-line no-unused-vars

  const EFFORT = {
    quick: { label: 'Quick', budget: { n1: 8, n2: 32, maxEvals: 150, maxMs: 8000 } },
    standard: { label: 'Standard', budget: {} },
    thorough: { label: 'Thorough', budget: { n1: 24, n2: 128, maxEvals: 800, maxMs: 40000 } },
  };
  const MAX_EVALS_DEFAULT = 400;

  const character = $derived(rosterStore.current);

  let presetPick = $state(null);
  let target = $state({ kind: 'dummy', seconds: 60 });
  let objective = $state({ kind: 'dps' });
  let space = $state({ ...SPACE_DEFAULTS });
  let effort = $state('standard');
  let seed = $state(1);
  let running = $state(false);
  let progress = $state(null);
  let last = $state(null); // { result, presetName, runId }
  let applying = $state(false);
  let job = null;

  const preset = $derived(character.presets.find((p) => p.id === presetPick) ?? character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const noRelics = $derived(space.relics && space.relicSlots < 1);

  const pctDone = $derived.by(() => {
    if (!progress) return 0;
    if (progress.phase === 'final') return progress.total ? Math.min(1, progress.done / progress.total) : 1;
    const cap = EFFORT[effort].budget.maxEvals ?? MAX_EVALS_DEFAULT;
    return Math.min(0.85, (progress.evals / cap) * 0.85); // tier 1 fills the first 85%, tier 2 the rest
  });
  const progressText = $derived(
    !progress ? 'starting' : progress.phase === 'final' ? `re-measuring finalists ${progress.done}/${progress.total}` : `screening builds: ${progress.evals} tried, searching ${progress.dimension ?? ''}`,
  );

  async function run() {
    if (running || !preset) return;
    const snapshot = { presetId: preset.id, presetName: preset.name, characterId: character.id };
    const req = {
      mode: 'optimize',
      v2: true,
      character: $state.snapshot(character),
      presetId: snapshot.presetId,
      target: $state.snapshot(target),
      objective: $state.snapshot(objective),
      space: { ...$state.snapshot(space) },
      budget: EFFORT[effort].budget,
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
      let runId = null;
      if (result.baseline && rosterStore.current?.id === snapshot.characterId) {
        runId = rosterStore.addRun(result, { presetName: snapshot.presetName })?.id ?? null;
      }
      last = { result, presetName: snapshot.presetName, runId, characterId: snapshot.characterId };
      setStatus(result.aborted ? 'Optimiser cancelled; showing the best found so far.' : '');
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
    const p = character.presets.find((x) => x.id === last.result.presetId);
    if (!p || character.id !== last.characterId) {
      setStatus('That preset no longer exists on this character.');
      return;
    }
    applying = true;
    try {
      applyCandidate(rosterStore, p.id, entry.candidate, p);
      setStatus(`Applied rank ${entry.rank} to ${p.name}. Re-run to measure against the new current build.`);
    } finally {
      applying = false;
    }
  }

  const res = $derived(last?.result ?? null);
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

  <TargetPicker bind:target bind:objective oblivionUnlocked={character.oblivion?.unlocked ?? false} />
  <SpacePicker bind:space />

  <div class="group">
    <span class="micro-label">Effort</span>
    <div class="chip-list">
      {#each Object.entries(EFFORT) as [key, e] (key)}
        <Chip label={e.label} selected={effort === key} onClick={() => (effort = key)} />
      {/each}
      <label class="seed">
        <span class="micro-label">Seed</span>
        <input class="mono" type="number" min="1" step="1" bind:value={seed} />
      </label>
    </div>
    <p class="hint">The same seed reproduces the same ranking. A different seed re-rolls the fights.</p>
  </div>

  <div class="run-row">
    {#if running}
      <button type="button" class="btn-danger" onclick={cancel}>Cancel</button>
      <progress max="1" value={pctDone} aria-label="Optimiser progress"></progress>
      <span class="mono progress-text" data-testid="optimiser-progress">{progressText}</span>
    {:else}
      <button type="button" class="btn-gold" disabled={noRelics} onclick={run}>Optimise {preset?.name ?? ''}</button>
    {/if}
  </div>
</section>

{#if res}
  <section class="panel" data-testid="optimiser-output">
    <div class="out-head">
      <h3 class="subheading">{res.target.label}: {res.objective.label}</h3>
      <span class="mono meta">
        {last.presetName}, realm {res.realm}, seed {res.seed}, tier {res.tier}, {res.stats.tier1} builds measured, {Math.round(res.stats.ms / 100) / 10} s
      </span>
    </div>
    {#if res.aborted}<p class="note" role="status">Cancelled: partial result{res.tier < 2 ? ' (finalists not re-measured, wider intervals)' : ''}.</p>{/if}
    {#if res.truncated}<p class="note" role="status">Stopped early on the {res.truncated === 'time' ? 'time' : 'evaluation'} limit; a longer effort may find more.</p>{/if}
    {#if !res.baseline}
      <p class="note" role="status">Cancelled before the current preset was measured; nothing to show.</p>
    {:else}
      <ResultList {unit} baseline={res.baseline} results={res.results} onApply={apply} {applying} />
      <p class="hint">
        Builds are scored as computed stats plus the preset's sheet residual, so gains are approximate when a build changes Attack% or HP% a lot. Verify a pick in game or on the Duel screen.
      </p>
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
</style>
