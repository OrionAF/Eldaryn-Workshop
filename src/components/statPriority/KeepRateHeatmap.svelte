<script>
  /**
   * KeepRateHeatmap.svelte - keep rate per gear stat (rows, in the top bracket's order) and level
   * range (columns) on the diverging kept/dropped scale; gray is about drop odds. A column header
   * opens that range; hovering or focusing a cell reads it out under the table.
   */
  import { keepStep } from '../../lib/features/statPriority.js';

  let { data, columns, value, onpick } = $props();

  const MIX = { 1: 40, 2: 70, 3: 100 };
  const order = $derived(columns.at(-1)?.stats.map((s) => s.type) ?? []);
  let focus = $state(null); // { key, type }

  function cellStyle(kr) {
    const s = keepStep(kr, data.method);
    if (s === 0) return 'background: var(--div-mid); color: var(--text-soft)';
    const pole = s > 0 ? 'var(--div-kept)' : 'var(--div-dropped)';
    const ink = Math.abs(s) === 3 ? 'var(--surface-1)' : 'var(--text-ink)';
    return `background: color-mix(in oklab, ${pole} ${MIX[Math.abs(s)]}%, var(--div-mid)); color: ${ink}`;
  }
  const legend = [0.4, 0.55, 0.7, 1, 1.2, 1.6, 2.2];

  const detail = $derived.by(() => {
    if (!focus) return null;
    const b = columns.find((c) => c.key === focus.key);
    const s = b?.stats.find((x) => x.type === focus.type);
    if (!s) return null;
    const role = b.priority.includes(s.type) ? 'Priority' : b.ban.includes(s.type) ? `Block list #${b.ban.indexOf(s.type) + 1}` : 'Below drop odds';
    return { b, s, role };
  });
  const fmt = (v) => (v == null ? '–' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 1 }));
</script>

<div class="legend">
  <span>Dropped</span>
  <span class="ramp" aria-hidden="true">{#each legend as kr (kr)}<i style={cellStyle(kr)}></i>{/each}</span>
  <span>Kept</span>
  <span class="legend-note">Gray: about what drops (×{data.method.AVOID_MAX} to ×{data.method.STRONG_MIN}). Values are ×keep rate.</span>
</div>
<div class="scroll">
  <table class="hm">
    <thead>
      <tr>
        <th scope="col"><span class="visually-hidden">Stat</span></th>
        {#each columns as b (b.key)}
          <th scope="col" class:sel={b.key === value}>
            <button type="button" class="num" aria-pressed={b.key === value} onclick={() => onpick(b.key)}>{b.key}</button>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each order as t (t)}
        <tr>
          <th scope="row">{data.labels[t]}</th>
          {#each columns as b (b.key)}
            {@const s = b.stats.find((x) => x.type === t)}
            {#if s}
              <!-- svelte-ignore a11y_mouse_events_have_key_events (the same numbers are in the stats table) -->
              <td
                class="num"
                class:sel-col={b.key === value}
                style={cellStyle(s.keepRate)}
                onmouseenter={() => (focus = { key: b.key, type: t })}
                onmouseleave={() => (focus = null)}
              >{s.keepRate.toFixed(1)}</td>
            {:else}
              <td class="na">–</td>
            {/if}
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
<p class="detail" aria-live="polite">
  {#if detail}
    <b>{detail.s.label}</b> · level {detail.b.key} · {detail.role}: kept <span class="num">×{detail.s.keepRate.toFixed(2)}</span>
    (<span class="num">{detail.s.observed}</span> pieces vs <span class="num">{detail.s.expected}</span> expected) · median total
    <span class="num">{fmt(detail.s.median)}%</span>
  {:else}
    Point at a cell for its counts. Click a column heading to open that range.
  {/if}
</p>

<style>
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2) var(--sp-3); margin-bottom: var(--sp-3); font-size: var(--fs-12); color: var(--text-muted); }
  .ramp { display: inline-flex; gap: 2px; }
  .ramp i { display: block; width: 22px; height: 12px; border-radius: var(--r-1); }
  .scroll { overflow-x: auto; }
  .hm { width: 100%; min-width: 36rem; border-collapse: separate; border-spacing: 2px; }
  .hm th { padding: 4px 6px; font-size: var(--fs-12); font-weight: normal; color: var(--text-muted); white-space: nowrap; }
  .hm thead th button {
    padding: 2px 6px;
    background: none;
    border: 0;
    border-radius: var(--r-1);
    color: inherit;
    font-size: var(--fs-12);
    cursor: pointer;
  }
  .hm thead th button:hover { color: var(--text-ink); }
  .hm thead th.sel button { background: var(--ember-500); color: var(--on-ember); font-weight: var(--fw-bold); }
  .hm tbody th { text-align: left; font-size: var(--fs-13); color: var(--text-soft); }
  .hm tbody th,
  .hm thead th:first-child { position: sticky; left: 0; z-index: 1; background: var(--surface-2); }
  .hm td { height: 28px; min-width: 3.25rem; text-align: center; font-size: var(--fs-12); border-radius: var(--r-1); }
  .hm td:hover { outline: 2px solid var(--text-ink); outline-offset: -1px; }
  .hm td.sel-col { box-shadow: inset 0 0 0 1px var(--ember-500); }
  .hm td.na { background: none; color: var(--text-muted); }
  .detail { margin: var(--sp-3) 0 0; min-height: 2.6em; font-size: var(--fs-12); color: var(--text-muted); }
  .detail b { color: var(--text-ink); }
</style>
