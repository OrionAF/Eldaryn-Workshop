<script>
  /**
   * StatTable.svelte - stat / value / source table (design-system §4.14).
   *
   * rows: [{key, label, value, source?, base?, residual?}]. `mode="source"` shows a
   * ProvenanceTag per row; `mode="residual"` shows BASE and RESIDUAL (positive residuals in the
   * up colour, zero muted). Values are formatted by stat key (flat "." thousands vs percent).
   * `footer` is an optional summary line.
   */
  import { formatStat } from '../../lib/format.js';
  import ProvenanceTag from './ProvenanceTag.svelte';

  let { rows = [], mode = 'source', caption = '', footer = '' } = $props();
  const fmt = (key, v) => (v == null ? '-' : formatStat(key, v));
</script>

<table class="stat-table">
  {#if caption}<caption class="visually-hidden">{caption}</caption>{/if}
  <thead>
    <tr>
      <th scope="col">Stat</th>
      {#if mode === 'residual'}
        <th scope="col" class="r">Base</th><th scope="col" class="r">Gap</th>
      {/if}
      <th scope="col" class="r">Value</th>
      {#if mode === 'source'}<th scope="col" class="r">Source</th>{/if}
    </tr>
  </thead>
  <tbody>
    {#each rows as r (r.key)}
      <tr>
        <th scope="row" class="lbl">{r.label}</th>
        {#if mode === 'residual'}
          <td class="r dim">{fmt(r.key, r.base)}</td>
          <td class="r" class:up={r.residual > 0} class:dim={!r.residual}>{fmt(r.key, r.residual)}</td>
        {/if}
        <td class="r">{fmt(r.key, r.value)}</td>
        {#if mode === 'source'}<td class="r src">{#if r.source}<ProvenanceTag kind={r.source} />{/if}</td>{/if}
      </tr>
    {/each}
  </tbody>
  {#if footer}
    <tfoot><tr><td colspan={mode === 'residual' ? 4 : 3}>{footer}</td></tr></tfoot>
  {/if}
</table>

<style>
  .stat-table { width: 100%; border-collapse: collapse; font-size: var(--fs-13); }
  thead th {
    text-align: left;
    padding: 0 var(--sp-3);
    height: 30px;
    background: var(--surface-3);
    border-bottom: 1px solid var(--line-rule);
    font-size: var(--fs-11);
    font-weight: var(--fw-heavy);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .r { text-align: right; }
  td, tbody th {
    height: var(--row-h, 32px);
    padding: 0 var(--sp-3);
    border-bottom: 1px solid var(--line-hairline);
    color: var(--text-ink);
    font-weight: inherit;
  }
  td:not(.src) { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  tbody th.lbl { text-align: left; font-family: var(--font-ui); font-size: var(--fs-14); color: var(--text-soft); }
  tbody tr:hover :is(td, th) { background: var(--surface-4); }
  tbody tr:last-child :is(td, th) { border-bottom: 0; }
  .dim { color: var(--text-muted); }
  .up { color: var(--verdict-up); }
  tfoot td { height: 32px; background: var(--surface-2); color: var(--text-soft); font-family: var(--font-ui); border-top: 1px solid var(--line-rule); }
</style>
