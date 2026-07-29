<script>
  /**
   * GauntletResultPanel.svelte - renders a PVP archetype-gauntlet result
   * (pvpGauntlet.js runGauntlet output): a finalist × archetype win-rate
   * grid, each finalist's overall win-rate, and a contradiction banner when
   * the duel ranking disagrees with the closed-form ranking. Cells within a
   * coin-flip's CI render "even" (grey), so noise doesn't read as signal.
   */
  let { result } = $props();

  const finalists = $derived(result?.finalists ?? []);
  const archetypes = $derived(finalists[0]?.perArchetype ?? []);

  const label = (index) => (index === 0 ? 'Recommended' : `Runner-up ${index}`);
  const cellClass = (winRate, ci) => {
    if (Math.abs(winRate - 50) <= (ci || 0)) return 'even'; // indistinguishable from a coin flip
    return winRate >= 55 ? 'good' : winRate <= 45 ? 'bad' : '';
  };
  const fmtBudget = (n) => Math.round(n).toLocaleString('en-US');
</script>

{#if result && finalists.length}
  <div class="gauntlet-panel" data-testid="gauntlet-result">
    {#if result.contradiction?.flagged}
      <p class="contradiction" data-testid="gauntlet-contradiction">⚠ {result.contradiction.message}</p>
    {:else}
      <p class="agree">✓ {result.contradiction?.message ?? 'Closed-form and duel rankings agree.'}</p>
    {/if}
    <p class="meta mono">
      Opponents scaled to a {fmtBudget(result.budget)} Attack+Health budget · {result.iterations} duels each.
    </p>

    <div class="grid-wrap">
      <table class="gauntlet-grid mono">
        <thead>
          <tr>
            <th class="row-head">Build</th>
            <th>Overall</th>
            {#each archetypes as a (a.archetypeId)}
              <th class="arch-head" data-class={a.class} title="{a.name} ({a.class})">{a.name}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each finalists as f (f.index)}
            <tr>
              <th class="row-head">{label(f.index)}</th>
              <td class={cellClass(f.overallWinRate, f.ci)}>{f.overallWinRate.toFixed(0)}%</td>
              {#each f.perArchetype as a (a.archetypeId)}
                <td class={cellClass(a.winRate, a.ci)} title="{a.name} ({a.class}) — {a.winRate.toFixed(1)}% ± {(a.ci || 0).toFixed(1)}%">
                  {a.winRate.toFixed(0)}%
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="legend">Win-rate of each build vs each archetype. <span class="good-tag">green</span> = favoured, <span class="bad-tag">red</span> = losing, grey = within noise of a coin flip.</p>
  </div>
{/if}

<style>
  .gauntlet-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
  .contradiction {
    font-size: 13px;
    color: var(--color-downgrade, #c1594f);
    margin: 0;
  }
  .agree {
    font-size: 13px;
    color: var(--color-hps, #58d68d);
    margin: 0;
  }
  .meta {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0;
  }
  .grid-wrap {
    overflow-x: auto;
  }
  .gauntlet-grid {
    border-collapse: collapse;
    font-size: 11px;
  }
  .gauntlet-grid th,
  .gauntlet-grid td {
    border: 1px solid var(--color-border);
    padding: 2px 8px;
    text-align: right;
    white-space: nowrap;
  }
  .gauntlet-grid .row-head,
  .gauntlet-grid .arch-head {
    text-align: left;
    color: var(--color-muted);
    font-weight: 400;
  }
  .gauntlet-grid .arch-head[data-class='Warrior'] {
    color: var(--nav-mounts-light, #a8e0ab);
  }
  .gauntlet-grid .arch-head[data-class='Sentinel'] {
    color: var(--nav-talents-light, #a8e5ff);
  }
  .gauntlet-grid td.good {
    color: var(--color-hps, #58d68d);
  }
  .gauntlet-grid td.bad {
    color: var(--color-downgrade, #c1594f);
  }
  .gauntlet-grid td.even {
    color: var(--color-muted);
  }
  .legend {
    font-size: 11px;
    color: var(--color-muted);
    margin: 0;
  }
  .good-tag {
    color: var(--color-hps, #58d68d);
  }
  .bad-tag {
    color: var(--color-downgrade, #c1594f);
  }
</style>
