<script>
  /**
   * RelicSuggesterPanel.svelte - the "Relic Suggester" block shared by the
   * Simulation and PVP screens' optimizer panels. The user enters how many
   * relic levels to simulate (N); one run answers "if I invested N levels
   * into any relic - including locked ones - which investment pays off
   * most?" via relicSuggester.js in the optimizer worker, scored with the
   * host screen's own objective (buildObjectiveSpec prop).
   *
   * Purely informational: no apply button - the app can't grant relic
   * levels the player hasn't earned, leveling stays a manual edit on the
   * Relics screen. Results are view-state only and reset when the
   * character or target preset changes.
   */
  import { runOptimizerTask } from '../lib/optimizerClient.js';
  import { RELIC_TIER_LABELS, RELICS_BY_CLASS } from '../lib/relicsData.js';
  import { parseFlat } from '../lib/format.js';

  let {
    character,
    preset, // the preset the host optimizer targets; null = not picked yet
    buildObjectiveSpec, // () => plain objectiveSpec capturing the screen's current settings
    scoreUnit = 'DPS',
    formatScore = (n) => n.toFixed(2),
    disabled = false, // host optimizer running - don't race two searches
    setStatus,
  } = $props();

  let levelsInput = $state('2');
  let running = $state(false);
  let progress = $state(null);
  let result = $state(null);
  let task = null;

  const levels = $derived(Math.max(0, Math.floor(parseFlat(levelsInput) || 0)));
  const hasRelics = $derived((RELICS_BY_CLASS[character?.class] || []).length > 0);
  const canRun = $derived(!!preset && hasRelics && levels > 0 && !disabled && !running);

  // A suggestion describes one character+preset - switching either makes it stale.
  $effect(() => {
    void character?.id;
    void preset?.id;
    result = null;
    progress = null;
  });

  async function run() {
    if (!canRun) return;
    running = true;
    result = null;
    progress = null;
    task = runOptimizerTask(
      {
        mode: 'suggest-relics',
        character,
        preset,
        relicLevelBoost: levels,
        objectiveSpec: buildObjectiveSpec(),
      },
      { onProgress: (p) => (progress = p) }
    );
    try {
      const r = await task.promise;
      result = r;
      setStatus?.(
        r.aborted
          ? 'Relic search cancelled — showing what was found so far'
          : r.changes.length === 0
            ? `Your current relics are already the best board even at +${r.levelBoost} levels`
            : `Best relic investment: +${r.improvementPct.toFixed(2)}% ${scoreUnit}`
      );
    } catch (err) {
      setStatus?.(`Relic Suggester failed: ${err?.message || err}`);
    } finally {
      running = false;
      task = null;
    }
  }

  function cancel() {
    task?.cancel();
  }

  function levelText(r) {
    if (r.atMax) return `lv ${r.fromLevel} (max)`;
    if (r.isUnlock) return `Unlock → lv ${r.toLevel}`;
    return `lv ${r.fromLevel} → ${r.toLevel}`;
  }

  function stepText(ch) {
    if (ch.kind === 'unlock') return `Unlock ${ch.name} → lv ${ch.toLevel}`;
    if (ch.kind === 'upgrade') return `Upgrade ${ch.name} lv ${ch.fromLevel} → ${ch.toLevel}`;
    if (ch.kind === 'equip') return `Equip ${ch.name}`;
    return `Unequip ${ch.name}`;
  }
</script>

<div class="relic-suggester" data-testid="relic-suggester">
  <h3 class="subheading">Relic Suggester</h3>
  <p class="subline">
    Simulates every relic — including locked ones — with the levels below invested into each,
    and ranks which unlock or upgrade pays off most for this preset. Suggestions only; spend
    your Relic Medals in-game and record levels on the Relics screen.
  </p>

  <div class="controls">
    <label class="control">
      <span class="micro-label">Relic levels to simulate</span>
      <input
        type="text"
        inputmode="numeric"
        bind:value={levelsInput}
        disabled={running}
        data-testid="relic-suggest-levels"
      />
    </label>
    {#if running}
      <button type="button" class="btn-ghost" onclick={cancel}>Cancel — keep best so far</button>
    {:else}
      <button type="button" class="btn-ghost" onclick={run} disabled={!canRun} data-testid="relic-suggest-run">
        Suggest Relics
      </button>
    {/if}
  </div>

  {#if running && progress}
    <p class="progress mono" role="status">
      {progress.phase} — {progress.evals.toLocaleString('en-US')} builds evaluated
    </p>
  {/if}

  {#if result}
    <div class="suggest-card" data-testid="relic-suggest-result">
      {#if result.changes.length > 0}
        <p class="best-line">
          <span class="delta mono" class:positive={result.improvementPct > 0}>
            +{result.improvementPct.toFixed(2)}% {scoreUnit}
          </span>
          <span>if you invest +{result.levelBoost} levels where it counts:</span>
        </p>
        <ul class="steps">
          {#each result.changes as ch (ch.kind + ch.id)}
            <li>
              <span class="tier-badge {ch.tier}">{RELIC_TIER_LABELS[ch.tier]}</span>
              <span>{stepText(ch)}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="best-line">
          Your current relics are already the best board, even with +{result.levelBoost} levels
          simulated everywhere.
        </p>
      {/if}

      <table class="rank-table">
        <thead>
          <tr>
            <th>Relic</th>
            <th>Tier</th>
            <th>Investment</th>
            <!-- Not "gain": for a full preset this includes unequipping
                 something, and the header is where that has to be said. -->
            <th class="num">{scoreUnit} if levelled &amp; slotted</th>
          </tr>
        </thead>
        <tbody>
          {#each result.perRelic as r (r.id)}
            <tr>
              <td>
                {r.name}
                {#if r.gainIncludesSwap}
                  <span class="swap-note" data-testid="relic-swap-note">
                    replaces {r.displacedName ?? 'an equipped relic'}
                  </span>
                {/if}
              </td>
              <td><span class="tier-badge {r.tier}">{RELIC_TIER_LABELS[r.tier]}</span></td>
              <td class="mono">{levelText(r)}</td>
              <td class="num mono" class:positive={r.gain > 0} class:negative={r.gain < 0}>
                {r.gain > 0 ? '+' : ''}{formatScore(r.gain)}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if result.perRelic.some((r) => r.gainIncludesSwap)}
        <p class="subline">
          Your preset is full, so a relic that isn't equipped has to displace one. Rows marked
          <em>replaces</em> are scored with that swap included — a strong relic can still show a
          small number because what it pushes out is also strong.
        </p>
      {/if}
      {#if result.sampled}
        <p class="subline" data-testid="relic-sampled-note">
          These scores come from a simulated objective, so small differences between neighbouring
          rows may be sampling noise rather than a real ordering.
        </p>
      {/if}
      {#if result.aborted}
        <p class="subline">Cancelled early — the ranking above may be incomplete.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .relic-suggester {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--color-border-hairline);
  }

  .subline {
    color: var(--color-muted);
    font-size: 13px;
    margin: 4px 0 12px;
    max-width: 70ch;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
  }

  .control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .control input {
    width: 90px;
  }

  .progress {
    color: var(--color-muted);
    font-size: 12px;
    margin-top: 10px;
  }

  .suggest-card {
    margin-top: 14px;
    padding: 14px;
    border: 1px solid var(--color-border);
    border-radius: 8px;
    background: var(--color-inset);
  }

  .best-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 10px;
  }

  .delta {
    font-weight: 600;
  }

  .steps {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .steps li {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .rank-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .rank-table th {
    text-align: left;
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-muted);
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border);
  }

  .rank-table td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--color-border-hairline);
  }

  .rank-table .num {
    text-align: right;
  }

  .swap-note {
    display: block;
    font-size: 11px;
    color: var(--color-muted);
  }

  .positive {
    color: var(--color-upgrade);
  }

  .negative {
    color: var(--color-downgrade);
  }

  .tier-badge {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid currentColor;
  }

  .tier-badge.bronze {
    color: #c08552;
  }

  .tier-badge.silver {
    color: #b8c0cc;
  }

  .tier-badge.gold {
    color: var(--color-gold);
  }
</style>
