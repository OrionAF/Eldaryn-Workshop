<script>
  /**
   * FloorTable.svelte - Oblivion Dungeon floors: raw instability, net strain after Oblivion Power and,
   * once a scan has run, win % (Wilson interval) and median clear time. `results` maps floor -> row.
   */
  import { formatFlat } from '../../lib/format.js';

  let { rows, results = {}, threshold = 0.9 } = $props();

  const pct = (p) => `${(p * 100).toFixed(0)}%`;
  const secs = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)}s`);
</script>

<table class="floor-table" aria-label="Oblivion floors">
  <thead>
    <tr>
      <th>Floor</th>
      <th>Instability</th>
      <th>Net strain</th>
      <th>Win %</th>
      <th>95% range</th>
      <th>Median clear</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.floor)}
      {@const r = results[row.floor]}
      <tr data-floor={row.floor} class:ok={r && r.p >= threshold} class:free={row.strain === 0}>
        <td class="num">{row.floor}</td>
        <td class="num">{formatFlat(row.instability)}</td>
        <td class="num">{formatFlat(row.strain)}</td>
        <td class="num" data-cell="win">{r ? pct(r.p) : '-'}</td>
        <td class="num muted">{r ? `${pct(r.pLo)} - ${pct(r.pHi)}` : '-'}</td>
        <td class="num muted">{r ? secs(r.medianMs) : '-'}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  .floor-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  th {
    text-align: right;
    font-size: 11px;
    font-weight: normal;
    color: var(--color-muted);
    padding: 0.25rem 0.5rem;
  }
  th:first-child,
  td:first-child {
    text-align: left;
  }
  td {
    text-align: right;
    padding: 0.2rem 0.5rem;
    border-top: 1px solid var(--color-border-hairline);
  }
  .muted {
    color: var(--color-muted);
  }
  tr.ok td:nth-child(4) {
    font-weight: bold;
  }
  tr.free td:nth-child(3) {
    opacity: 0.7;
  }
</style>
