<script>
  /**
   * SheetTable.svelte - B3 (ia.md §5.8): entry and diff are one table, so there is one list of stats.
   * Columns: Stat, Model, Your sheet (input), raw (capped rows), Gap, Tolerance, Status. A row expands
   * to the model value split by source (build/contribution.js).
   *
   * Text goes through sheet.js parseSheetInput, which owns the number-format gotcha ("." is a thousands
   * separator on flat rows and a decimal point on percent rows; Attack Speed and Crit Damage are typed as
   * the shown percent). Drafts are left alone while a field is focused, committed on blur/Enter, and
   * resynced from `values` otherwise. A blank field means "not entered": the model value is used.
   */
  import { sheetKeyMeta, parseSheetInput, toleranceFor } from '../../lib/engine/pipeline/sheet.js';
  import { contributionRows } from '../../lib/build/contribution.js';
  import { statNumber, statText, gapText, isFlatStat } from './statText.js';
  import Checkbox from '../ui/Checkbox.svelte';
  import Button from '../ui/Button.svelte';
  import Num from '../ui/Num.svelte';
  import { orderStats, orderedStatLabel } from '../../lib/ui/statOrder.js';

  /** @type {{keys: string[], values: Object<string, number>, computed: Object, contributions?: (() => Object)|null, onChange: (key: string, value: number|null) => void}} */
  let { keys, values, computed, contributions = null, onChange, playerClass = null } = $props();

  const allRows = $derived(orderStats(keys, playerClass).map((k) => sheetKeyMeta(k)).filter(Boolean)
    .map((m) => ({ ...m, label: orderedStatLabel(m.key, m.label, playerClass) })));
  // No computed build (an opponent's sheet has none): the Model, Gap, Tolerance and Status columns would be
  // empty on every row, so they are not drawn.
  const hasModel = $derived(computed != null);

  let drafts = $state({});
  let invalid = $state({});
  let focusedKey = $state(null);
  let open = $state({});
  let onlyOff = $state(false);

  $effect(() => {
    for (const m of rows) {
      for (const k of m.rawKey ? [m.key, m.rawKey] : [m.key]) {
        if (k !== focusedKey) drafts[k] = typeof values[k] === 'number' ? statNumber(k, values[k]) : '';
      }
    }
  });

  function commit(key, text) {
    focusedKey = null;
    const t = text.trim();
    if (t === '') {
      invalid[key] = false;
      if (values[key] !== undefined) onChange(key, null);
      drafts[key] = '';
      return;
    }
    const v = parseSheetInput(key, t);
    if (v === null) {
      invalid[key] = true;
      return;
    }
    invalid[key] = false;
    onChange(key, v);
    drafts[key] = statNumber(key, v);
  }

  const onKey = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };
  const unit = (m) => (m.kind === 'integer' ? '' : '%');

  // What a focused field is read as (the echo that catches a wrongly typed separator).
  const echo = $derived.by(() => {
    if (!focusedKey || !(drafts[focusedKey] ?? '').trim()) return null;
    const v = parseSheetInput(focusedKey, drafts[focusedKey]);
    return v === null ? null : { key: focusedKey, text: statText(focusedKey, v) };
  });

  function status(m) {
    const shown = values[m.key];
    const calc = computed?.[m.key];
    if (typeof shown !== 'number') return { kind: 'blank', gap: null };
    if (typeof calc !== 'number') return { kind: 'unknown', gap: null };
    const gap = shown - calc;
    return { kind: Math.abs(gap) <= toleranceFor(m.key) + 1e-9 ? 'ok' : 'off', gap };
  }

  // The "only rows that are off" filter never hides the row being edited, so typing does not make it vanish.
  const rows = $derived(
    hasModel && onlyOff
      ? allRows.filter((m) => {
          const k = status(m).kind;
          return k === 'off' || k === 'unknown' || focusedKey !== null && (m.key === focusedKey || m.rawKey === focusedKey);
        })
      : allRows,
  );

  const summary = $derived.by(() => {
    let total = 0;
    let explained = 0;
    for (const m of allRows) {
      const s = status(m);
      if (s.kind === 'blank') continue;
      total += 1;
      if (s.kind === 'ok') explained += 1;
    }
    return { total, explained };
  });

  let contrib = $state(null);
  function toggle(key) {
    open[key] = !open[key];
    if (open[key] && !contrib && contributions) contrib = contributions();
  }
  const allOpen = $derived(rows.length > 0 && rows.every((m) => open[m.key]));
  function toggleAll() {
    const next = !allOpen;
    for (const m of rows) open[m.key] = next;
    if (next && !contrib && contributions) contrib = contributions();
  }
  $effect(() => {
    // The build changed under an open row: drop the cached split and rebuild it for the open rows.
    void computed;
    contrib = null;
    if (contributions && Object.values(open).some(Boolean)) contrib = contributions();
  });
</script>

<div class="head">
  {#if hasModel}
    <Checkbox bind:checked={onlyOff} label="Only rows that are off" />
  {/if}
  {#if contributions}
    <Button variant="ghost" size="small" onclick={toggleAll}>{allOpen ? 'Collapse all' : 'Expand all'}</Button>
  {/if}
  <span
    class="summary num"
    class:all-good={hasModel ? summary.total > 0 && summary.explained === summary.total : summary.total === allRows.length}
    class:progress={!hasModel && summary.total < allRows.length}
    data-testid="diff-summary"
  >
    {#if hasModel}{summary.explained}/{summary.total} match{:else}{summary.total}/{allRows.length} entered{/if}
  </span>
</div>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be focusable) -->
<div class="scroll" role="region" aria-label="In-game stats table" tabindex="0">
  <table class="sheet" class:full={hasModel}>
    <thead>
      <tr>
        <th scope="col">Stat</th>{#if hasModel}<th scope="col" class="r">App</th>{/if}<th scope="col" class="r">In-game stats</th>
        <th scope="col" class="r">Before cap</th>{#if hasModel}<th scope="col" class="r">Gap</th><th scope="col" class="r">Allowed gap</th><th scope="col">Status</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as m (m.key)}
        {@const s = status(m)}
        <tr data-key={m.key} class:ok={s.kind === 'ok'} class:off={s.kind === 'off'}>
          <th scope="row" class="lbl">
            {#if contributions}
              <button type="button" class="expand" aria-expanded={!!open[m.key]} aria-controls="src-{m.key}" onclick={() => toggle(m.key)}>
                <span aria-hidden="true">{open[m.key] ? '▾' : '▸'}</span>
                <span>{m.label}</span>
              </button>
            {:else}
              {m.label}
            {/if}
          </th>
          {#if hasModel}<td class="r num dim" data-label="App" title="The number the app works out for this stat"><Num value={computed?.[m.key]} format={(v) => statText(m.key, v)} /></td>{/if}
          <td class="r" data-label="In-game stats">
            <span class="input-wrap">
              <input
                id={`sheet-${m.key}`}
                aria-label={m.label}
                type="text"
                inputmode="decimal"
                class:invalid={invalid[m.key]}
                aria-invalid={invalid[m.key] ? 'true' : 'false'}
                aria-describedby={invalid[m.key] ? `err-${m.key}` : echo?.key === m.key ? `echo-${m.key}` : undefined}
                placeholder="from game"
                value={drafts[m.key] ?? ''}
                oninput={(e) => (drafts[m.key] = e.target.value)}
                onfocus={() => (focusedKey = m.key)}
                onblur={(e) => commit(m.key, e.target.value)}
                onkeydown={onKey}
              />
              <span class="unit">{unit(m)}</span>
              <!-- the echo floats under the box, so typing never changes the row's height -->
              {#if !invalid[m.key] && echo?.key === m.key}<span class="echo" id="echo-{m.key}">Read as <span class="num">{echo.text}</span></span>{/if}
            </span>
            {#if invalid[m.key]}
              <span class="msg err" id="err-{m.key}" role="alert">
                {isFlatStat(m.key)
                  ? 'That is not a number. For flat stats, "." separates thousands: 48.124 is 48124.'
                  : 'That is not a number. For percent stats, "." is the decimal point.'}
              </span>
            {/if}
          </td>
          <td class="r raw" data-label="Before cap">
            {#if m.rawKey}
              <span class="input-wrap">
                <input
                  id={`sheet-${m.rawKey}`}
                  type="text"
                  inputmode="decimal"
                  class:invalid={invalid[m.rawKey]}
                  aria-invalid={invalid[m.rawKey] ? 'true' : 'false'}
                  aria-label={`${m.label} before cap`}
                  aria-describedby={echo?.key === m.rawKey ? `echo-${m.rawKey}` : undefined}
                  placeholder="before cap"
                  value={drafts[m.rawKey] ?? ''}
                  oninput={(e) => (drafts[m.rawKey] = e.target.value)}
                  onfocus={() => (focusedKey = m.rawKey)}
                  onblur={(e) => commit(m.rawKey, e.target.value)}
                  onkeydown={onKey}
                />
                <span class="unit">{unit(m)}</span>
                {#if !invalid[m.rawKey] && echo?.key === m.rawKey}<span class="echo" id="echo-{m.rawKey}">Read as <span class="num">{echo.text}</span></span>{/if}
              </span>
            {/if}
          </td>
          {#if hasModel}
          <td class="r num" data-label="Gap" class:warn={s.kind === 'off'}>{s.gap === null ? '-' : gapText(m.key, s.gap)}</td>
          <td class="r num dim" data-label="Allowed gap">±{statText(m.key, toleranceFor(m.key))}</td>
          <td class="status" data-label="Status">
            {#if s.kind === 'ok'}<span class="good"><span aria-hidden="true">✓</span> matches</span>
            {:else if s.kind === 'off'}<span class="bad"><span aria-hidden="true">!</span> off by {gapText(m.key, Math.abs(s.gap)).replace(/^[+-]/, '')}</span>
            {:else if s.kind === 'unknown'}<span class="dim">no app number</span>
            {:else}<span class="dim">app's number used</span>{/if}
          </td>
          {/if}
        </tr>
        {#if open[m.key] && contrib}
          {@const split = contributionRows(contrib, m.key)}
          <tr class="src-row" id="src-{m.key}">
            <td colspan={hasModel ? 7 : 3}>
              <ul class="split" aria-label="{m.label} by source">
                {#each split.rows.filter((r) => r.value !== 0) as r (r.id)}
                  <li><span>{r.label}</span><span class="num">{statText(m.key, r.value)}</span></li>
                {/each}
                <li class="rest" title="Some bonuses multiply each other and some hit caps, so the rows above do not add up exactly. This row is the leftover.">
                  <span>Leftover (bonuses that multiply, caps)</span><span class="num">{gapText(m.key, split.rest)}</span>
                </li>
                <li class="total"><span>App total</span><span class="num">{statText(m.key, split.total)}</span></li>
              </ul>
              <p class="note">Each row shows how much the total drops if you remove only that source.</p>
            </td>
          </tr>
        {/if}
      {/each}
    </tbody>
  </table>
  {#if rows.length === 0 && onlyOff}<p class="note empty">{summary.total > 0 ? 'All rows match.' : 'No in-game stats entered yet.'}</p>{/if}
</div>

<style>
  .head { display: flex; justify-content: flex-end; align-items: center; gap: var(--sp-4); flex-wrap: wrap; padding: 0 var(--sp-1) var(--sp-2); }
  .head .summary { margin-right: auto; }
  .note.empty { margin-left: var(--sp-3); }
  .summary { font-size: var(--fs-13); color: var(--verdict-down); }
  .summary.all-good { color: var(--verdict-up); }
  .summary.progress { color: var(--text-soft); }
  .scroll { overflow-x: auto; max-width: 100%; }
  /* sized to its columns, not stretched across the screen, so App and In-game sit side by side */
  table.sheet { width: auto; border-collapse: collapse; font-size: var(--fs-13); }
  table.sheet.full { min-width: 760px; }
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
  /* every cell centred on the input's line, so labels, numbers and boxes in a row share one baseline */
  td, tbody th { padding: var(--sp-1) var(--sp-3); border-bottom: 1px solid var(--line-hairline); font-weight: inherit; vertical-align: middle; }
  tbody th.lbl { text-align: left; color: var(--text-soft); font-family: var(--font-ui); font-size: var(--fs-14); font-weight: var(--fw-regular); letter-spacing: normal; text-transform: none; white-space: nowrap; }
  .src-row > td { vertical-align: top; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .dim { color: var(--text-muted); }
  .warn { color: var(--status-warn); }
  tr.off { background: var(--verdict-down-tint); }
  .expand { display: inline-flex; gap: var(--sp-1); align-items: center; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; font: inherit; }
  .input-wrap { position: relative; display: inline-flex; align-items: center; gap: 3px; }
  .echo {
    position: absolute;
    top: calc(100% + 3px);
    right: 13px;
    z-index: var(--z-popover);
    padding: 1px 6px;
    background: var(--surface-4);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    box-shadow: var(--elev-2);
    color: var(--text-soft);
    font-size: var(--fs-11);
    line-height: 16px;
    white-space: nowrap;
    pointer-events: none;
  }
  .echo .num { color: var(--text-ink); }
  .input-wrap input { width: 112px; text-align: right; font-family: var(--font-data); }
  .unit { width: 10px; color: var(--text-muted); font-size: var(--fs-12); }
  input.invalid { border-color: var(--verdict-down); }
  .msg { display: block; font-size: var(--fs-12); color: var(--text-muted); text-align: right; }
  .msg.err { color: var(--verdict-down); }
  .status { white-space: nowrap; font-size: var(--fs-12); }
  .good { color: var(--verdict-up); }
  .bad { color: var(--status-warn); }
  .split { list-style: none; margin: 0; padding: 0 0 0 var(--sp-5); display: grid; gap: 2px; max-width: 520px; }
  .split li { display: flex; justify-content: space-between; gap: var(--sp-4); color: var(--text-soft); }
  .split li.rest { color: var(--text-muted); }
  .split li.total { border-top: 1px solid var(--line-hairline); color: var(--text-ink); }
  .note { margin: var(--sp-1) 0 0 var(--sp-5); color: var(--text-muted); font-size: var(--fs-12); }

  /* Phone: one stacked card per stat instead of a 760px-wide table, so Your sheet, Raw, Gap, Tolerance
     and Status are all reachable without sideways scrolling. */
  @media (max-width: 700px) {
    /* .full is named so this out-ranks the desktop min-width above */
    table.sheet, table.sheet.full { min-width: 0; }
    table.sheet thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    table.sheet, table.sheet tbody { display: block; }
    tr[data-key] {
      display: grid;
      /* two lines per stat: name and status, then App | In-game | Gap */
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 0.8fr);
      gap: var(--sp-1) var(--sp-3);
      align-items: end;
      padding: var(--sp-3) var(--sp-2);
      border-bottom: 1px solid var(--line-hairline);
    }
    tr[data-key] > th.lbl { grid-column: 1 / span 2; display: block; padding: 0; border: 0; align-self: center; }
    tr[data-key] > td[data-label='Status'] { grid-column: 3; grid-row: 1; text-align: right; align-self: center; }
    tr[data-key] > td[data-label='Status']::before { content: none; }
    /* the tolerance is reference detail; the status already says whether the gap is inside it */
    tr[data-key] > td[data-label='Allowed gap'] { display: none; }
    tr[data-key] > td[data-label='App'] { grid-column: 1; grid-row: 2; }
    tr[data-key] > td[data-label='In-game stats'] { grid-column: 2; grid-row: 2; }
    table.sheet:not(.full) tr[data-key] > td[data-label='In-game stats'] { grid-column: 1 / span 2; }
    tr[data-key] > td[data-label='Gap'] { grid-column: 3; grid-row: 2; }
    tr[data-key] > td.raw { grid-column: 1 / -1; grid-row: 3; }
    .expand { min-height: var(--hit); }
    tr[data-key] > td { display: block; padding: 0; border: 0; text-align: left; min-width: 0; }
    tr[data-key] > td::before {
      content: attr(data-label);
      display: block;
      font-size: var(--fs-11);
      font-weight: var(--fw-heavy);
      letter-spacing: var(--track-label);
      text-transform: uppercase;
      color: var(--text-soft);
    }
    tr[data-key] > td.raw:not(:has(input)) { display: none; }
    .input-wrap { display: flex; }
    .input-wrap input { width: 100%; min-width: 0; min-height: var(--hit); text-align: left; }
    .msg { text-align: left; }
    .status { white-space: normal; }
    tr.src-row, tr.src-row > td { display: block; padding: var(--sp-2); }
    .split { padding-left: 0; }
    .note { margin-left: 0; }
  }
</style>
