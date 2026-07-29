<script>
  /**
   * DashboardSetupCard.svelte - the Simulations Dashboard's setup section.
   * Visible only while the linking simulation has never completed
   * (character.linkingSim === null - the parent gates it). Walks the user
   * through finishing the two linked presets (checklists via
   * linkingSetup.js), exposes goal configuration in place (same chips/
   * sliders as PresetEditor, writing through rosterStore.setPresetGoal),
   * and hosts the "Initiate linking simulations" button - rendered
   * disabled until that slice lands.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { linkedPresets, presetSetupChecks, linkingSetupReady } from '../lib/linkingSetup.js';
  import { runLinkingSimulation, goalUnitLabel, PATH_LABELS } from '../lib/linkingSimulation.js';
  import Chip from './Chip.svelte';
  import GoalSliders from './GoalSliders.svelte';
  import Slider from './Slider.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const linked = $derived(linkedPresets(character));
  const pair = $derived(linked.slice(0, 2)); // the linking sim reads only the first two linked presets
  const ready = $derived(linkingSetupReady(character));

  // Priority slider: 50 = pure minimax regret; toward a preset weights that
  // preset's goal more heavily in the shared-path decision.
  let priority = $state(50);
  let running = $state(false);
  let stageInfo = $state(null); // { stage, total, presetName, path, progress }
  let abortController = null;

  async function initiate() {
    if (!ready || running) return;
    running = true;
    stageInfo = null;
    abortController = new AbortController();
    try {
      const outcome = await runLinkingSimulation({
        character,
        linked: pair,
        priority,
        onStage: (info) => (stageInfo = info),
        signal: abortController.signal,
      });
      if (outcome?.aborted) {
        setStatus?.('Linking simulation cancelled');
      } else {
        rosterStore.completeLinkingSim(outcome);
        setStatus?.(`Linking simulation complete — ${PATH_LABELS[outcome.lockedPath]} locked in`);
      }
    } catch (err) {
      setStatus?.(`Linking simulation failed: ${err?.message || err}`);
    } finally {
      running = false;
      stageInfo = null;
      abortController = null;
    }
  }

  function cancel() {
    abortController?.abort();
  }

  const fmtScore = (n) => (n >= 1000 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));

  const GOAL_BLURBS = {
    dps: 'Maximize sustained damage per second — World Boss and farm content.',
    tank: 'Maximize survival — a blend of effective HP and out-healable incoming damage.',
    pvp: 'Balance Maximum Damage, Damage Mitigation and Survivability with the three sliders.',
    custom: 'Your own slider blend — rename it and weight the three factors freely.',
  };

  const goalKinds = $derived([
    { kind: 'dps', label: 'DPS' },
    ...(character.class === 'Warrior' ? [{ kind: 'tank', label: 'Tank' }] : []),
    { kind: 'pvp', label: 'PVP' },
    { kind: 'custom', label: 'Custom' },
  ]);

  function setGoalKind(preset, kind) {
    rosterStore.setPresetGoal(preset.id, { kind: preset.goal.kind === kind ? null : kind });
  }
</script>

<section class="panel" data-testid="dashboard-setup">
  <h2 class="subheading">Linking Simulation Setup</h2>
  <p class="subline">
    The one-time linking simulation reads your two <strong>linked</strong> presets, weighs every
    stat, and locks in the Awakening path both builds will share. Finish setting both presets up
    first — everything below feeds the search.
  </p>

  <div class="preset-cards">
    {#each linked as preset (preset.id)}
      <div class="setup-preset">
        <span class="micro-label">{preset.name}</span>

        <ul class="checklist">
          {#each presetSetupChecks(character, preset) as check (check.key)}
            <li class:done={check.done} class:optional={check.optional && !check.done}>
              <span class="check-glyph" aria-hidden="true">{check.done ? '✓' : check.optional ? '·' : '○'}</span>
              {check.label}{check.optional && !check.done ? ' (optional — no pets owned)' : ''}
            </li>
          {/each}
        </ul>

        <span class="micro-label goal-label">Goal{preset.goal.kind === null ? ' — unassigned' : ''}</span>
        <div class="chip-list">
          {#each goalKinds as g (g.kind)}
            <Chip label={g.label} selected={preset.goal.kind === g.kind} onClick={() => setGoalKind(preset, g.kind)} size="compact" />
          {/each}
        </div>
        {#if preset.goal.kind !== null}
          <p class="goal-blurb">{GOAL_BLURBS[preset.goal.kind]}</p>
        {/if}
        {#if preset.goal.kind === 'custom'}
          <input
            type="text"
            placeholder="Custom goal name"
            value={preset.goal.name}
            onblur={(e) => rosterStore.setPresetGoal(preset.id, { name: e.target.value })}
            onkeydown={(e) => e.key === 'Enter' && e.target.blur()}
          />
        {/if}
        {#if preset.goal.kind === 'tank'}
          <label class="goal-slider">
            <span class="micro-label">Balance — sustain {100 - Math.round(preset.goal.ehpWeight * 100)} / {Math.round(preset.goal.ehpWeight * 100)} HP pool</span>
            <Slider
              min={0}
              max={100}
              step={5}
              value={Math.round(preset.goal.ehpWeight * 100)}
              oninput={(v) => rosterStore.setPresetGoal(preset.id, { ehpWeight: v / 100 })}
              ariaLabel="EHP weight"
            />
          </label>
        {/if}
        {#if preset.goal.kind === 'pvp' || preset.goal.kind === 'custom'}
          <GoalSliders weights={preset.goal.weights} onChange={(w) => rosterStore.setPresetGoal(preset.id, { weights: w })} />
        {/if}
      </div>
    {/each}
  </div>

  {#if running}
    <div class="progress-panel" data-testid="linking-progress" role="status">
      <div class="progress-head">
        <span class="micro-label">
          {stageInfo?.kind === 'verify' ? 'Verifying' : 'Searching'}
          {stageInfo ? stageInfo.stage + 1 : 1} / {stageInfo?.total ?? 4}
          {#if stageInfo}— {stageInfo.presetName} · {PATH_LABELS[stageInfo.path]}{/if}
        </span>
        <button type="button" class="btn-ghost" onclick={cancel} data-testid="cancel-linking">Cancel — discard</button>
      </div>
      {#if stageInfo?.progress}
        <p class="progress-line mono">
          {stageInfo.progress.phase} — {(stageInfo.progress.evals ?? 0).toLocaleString('en-US')} builds evaluated · best {fmtScore(stageInfo.progress.bestScore ?? 0)}
        </p>
      {/if}
      <p class="progress-note">
        Four full-depth searches (each linked preset × both awakening paths), then a head-to-head
        re-run of the winners for any Monte Carlo goal. This is a one-time, go-deep pass — it can
        take a few minutes.
      </p>
    </div>
  {:else}
    <div class="priority-row">
      <span class="micro-label">Path priority</span>
      <div class="priority-slider">
        <span class="priority-end">{pair[0]?.name} · {goalUnitLabel(pair[0]?.goal?.kind)}</span>
        <Slider
          min={0}
          max={100}
          step={5}
          bind:value={priority}
          ariaLabel="Path decision priority between the two linked presets"
          data-testid="priority-slider"
        />
        <span class="priority-end">{pair[1]?.name} · {goalUnitLabel(pair[1]?.goal?.kind)}</span>
      </div>
      <span class="priority-value mono">
        {priority === 50 ? 'balanced (minimax regret)' : `${priority} / ${100 - priority}`}
      </span>
    </div>

    <div class="initiate-row">
      <button type="button" class="btn-gold" disabled={!ready} onclick={initiate} data-testid="initiate-linking">
        Initiate Linking Simulations
      </button>
      <span class="coming-soon">
        {ready ? 'Both presets are ready — locks the shared Awakening path.' : 'Finish the checklists above first.'}
      </span>
    </div>
  {/if}
</section>

<style>
  .preset-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: var(--space-5);
    margin-top: var(--space-4);
  }
  .setup-preset {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: var(--space-4);
  }
  .checklist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: 13px;
    color: var(--color-muted);
  }
  .checklist li.done {
    color: var(--color-hps);
  }
  .checklist li.optional {
    opacity: 0.6;
  }
  .check-glyph {
    display: inline-block;
    width: 1.2em;
  }
  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .goal-blurb {
    font-size: 12px;
    color: var(--color-muted);
    margin: 0;
  }
  .goal-slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
  .priority-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-5);
  }
  .priority-slider {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .priority-slider :global(.slider) {
    flex: 1;
    min-width: 0;
  }
  .priority-end {
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .priority-value {
    font-size: 12px;
    color: var(--nav-simulations-light);
  }
  .initiate-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    margin-top: var(--space-4);
    flex-wrap: wrap;
  }
  .coming-soon {
    font-size: 12px;
    color: var(--color-muted);
  }
  .progress-panel {
    margin-top: var(--space-5);
    border: 1px solid var(--nav-simulations);
    border-radius: var(--radius-panel);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .progress-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
    flex-wrap: wrap;
  }
  .progress-line {
    font-size: 12px;
    margin: 0;
  }
  .progress-note {
    font-size: 12px;
    color: var(--color-muted);
    margin: 0;
  }
</style>
