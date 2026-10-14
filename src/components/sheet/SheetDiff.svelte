<script>
  /**
   * SheetDiff.svelte - tier-3 validation (rebuild-plan §4): the model's computed value next to the
   * sheet the user entered, one row per entered key, coloured by whether the gap is inside the key's
   * tolerance. "Absorb into base" moves the Attack / HP / Attack Speed / Crit residuals into the
   * character's base stats (build/residual.js absorbIntoBase), so the model reproduces the sheet.
   */
  import { diffSheet, summariseDiff } from '../../lib/engine/pipeline/sheetDiff.js';
  import { sheetKeyMeta, toDisplay } from '../../lib/engine/pipeline/sheet.js';
  import { formatFlat, formatPct } from '../../lib/format.js';

  /** @type {{computed: Object, sheet: {values: Object}|null, absorbable?: boolean, onAbsorb?: (() => void)|null}} */
  let { computed, sheet, absorbable = false, onAbsorb = null } = $props();

  const rows = $derived(diffSheet(computed, sheet));
  const summary = $derived(summariseDiff(rows));

  const fmt = (key, v) => {
    if (v == null) return '-';
    return sheetKeyMeta(key)?.kind === 'integer' ? formatFlat(v) : formatPct(toDisplay(key, v));
  };
  const fmtDelta = (key, d) => {
    if (d == null) return '-';
    if (d === 0) return '0';
    return `${d > 0 ? '+' : '-'}${fmt(key, Math.abs(d))}`;
  };
  const unit = (key) => (sheetKeyMeta(key)?.kind === 'integer' ? '' : '%');
</script>

{#if rows.length}
  <div class="diff">
    <div class="diff-head">
      <span class="micro-label">MODEL VS SHEET</span>
      <span class="summary mono" class:all-good={summary.unexplained === 0} data-testid="diff-summary">
        {summary.explained}/{summary.total} explained
      </span>
      {#if onAbsorb}
        <button type="button" class="btn-ghost absorb" disabled={!absorbable} onclick={() => onAbsorb?.()}>
          Absorb into base
        </button>
      {/if}
    </div>
    <table>
      <thead>
        <tr><th>Stat</th><th>Model</th><th>Sheet</th><th>Gap</th></tr>
      </thead>
      <tbody>
        {#each rows as r (r.key)}
          <tr class:ok={r.withinTolerance} class:off={!r.withinTolerance} data-key={r.key}>
            <td class="stat">{sheetKeyMeta(r.key)?.label ?? r.key}</td>
            <td class="mono">{fmt(r.key, r.computed)}{r.computed != null ? unit(r.key) : ''}</td>
            <td class="mono">{fmt(r.key, r.sheet)}{unit(r.key)}</td>
            <td class="mono delta">{fmtDelta(r.key, r.delta)}{r.delta != null ? unit(r.key) : ''}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    {#if onAbsorb}
      <p class="hint">
        Absorbing changes the character's base stats, which every preset shares. Gaps on other stats stay
        as carried residuals.
      </p>
    {/if}
  </div>
{/if}

<style>
  .diff-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-2); }
  .summary { font-size: 12px; color: var(--color-downgrade); flex: 1; }
  .summary.all-good { color: var(--color-upgrade); }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { text-align: right; font-weight: 600; font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--color-muted); padding: 3px 8px; }
  th:first-child, td.stat { text-align: left; }
  td { text-align: right; padding: 3px 8px; border-top: 1px solid var(--color-border); }
  td.stat { color: var(--color-soft); }
  tr.ok .delta { color: var(--color-upgrade); }
  tr.off { background: var(--color-downgrade-soft); }
  tr.off .delta { color: var(--color-downgrade); font-weight: 600; }
  .hint { color: var(--color-muted); font-size: 11.5px; margin: var(--space-2) 0 0; }
</style>
