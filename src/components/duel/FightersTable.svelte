<script>
  /**
   * FightersTable.svelte - "Fighters as simulated" (ia.md §3.4): both stat blocks exactly as the
   * resolver reads them (blank rows completed, HP after the PVP buff at the attacker's level), so the inputs sit next to
   * the output. A row a side left blank is marked `default` and named in the cell's label.
   */
  import { displayStat } from '../../lib/features/duel.js';
  import { NEUTRAL_VALUE_TEXT } from '../../lib/engine/pvp/resolver.js';

  /** @type {{rows: Array<{key: string, label: string, mine: number|null, theirs: number|null, mineDefaulted: boolean, theirsDefaulted: boolean}>, myName: string, theirName: string}} */
  let { rows, myName, theirName } = $props();
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be keyboard reachable) -->
<div class="scroll" tabindex="0" role="region" aria-label="Stats used in the fight">
  <table class="stat-table" data-testid="fighters-table">
    <thead>
      <tr><th scope="col">Stat</th><th scope="col" class="r">{myName}</th><th scope="col" class="r">{theirName}</th></tr>
    </thead>
    <tbody>
      {#each rows as r (r.key)}
        <tr>
          <th scope="row" class="lbl">{r.label}</th>
          <td class="r num" class:dflt={r.mineDefaulted} data-defaulted={r.mineDefaulted ? 'true' : undefined}>
            {displayStat(r.key, r.mine)}{#if r.mineDefaulted}<span class="tag"><span class="visually-hidden"> (</span>default<span class="visually-hidden">: {NEUTRAL_VALUE_TEXT.cellHint})</span></span>{/if}
          </td>
          <td class="r num" class:dflt={r.theirsDefaulted} data-defaulted={r.theirsDefaulted ? 'true' : undefined}>
            {displayStat(r.key, r.theirs)}{#if r.theirsDefaulted}<span class="tag"><span class="visually-hidden"> (</span>default<span class="visually-hidden">: {NEUTRAL_VALUE_TEXT.cellHint})</span></span>{/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .scroll { overflow-x: auto; max-height: 420px; overflow-y: auto; }
  table { border-collapse: collapse; width: 100%; font-size: var(--fs-13); }
  th, td { padding: 3px var(--sp-3); border-bottom: 1px solid var(--line-hairline); }
  thead th { color: var(--text-muted); font-size: var(--fs-11); text-transform: uppercase; letter-spacing: 0.08em; text-align: left; position: sticky; top: 0; background: var(--surface-2); }
  .r { text-align: right; }
  .lbl { text-align: left; font-weight: 400; color: var(--text-soft); font-family: var(--font-ui); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .dflt { color: var(--text-muted); }
  .tag {
    margin-left: var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    color: var(--text-muted);
    border: 1px dashed var(--line-control);
    border-radius: var(--r-1);
    padding: 0 4px;
  }
</style>
