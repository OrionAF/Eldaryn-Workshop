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

  /** @type {{keys: string[], values: Object<string, number>, computed: Object, contributions?: (() => Object)|null, onChange: (key: string, value: number|null) => void}} */
  let { keys, values, computed, contributions = null, onChange } = $props();

  const rows = $derived(keys.map((k) => sheetKeyMeta(k)).filter(Boolean));
  // No computed build (an opponent's sheet has none): the Model, Gap, Tolerance and Status columns would be
  // empty on every row, so they are not drawn.
  const hasModel = $derived(computed != null);

  let drafts = $state({});
  let invalid = $state({});
  let focusedKey = $state(null);
  let open = $state({});

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

  const summary = $derived.by(() => {
    let total = 0;
    let explained = 0;
    for (const m of rows) {
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
  $effect(() => {
    // The build changed under an open row: drop the cached split and rebuild it for the open rows.
    void computed;
    contrib = null;
    if (contributions && Object.values(open).some(Boolean)) contrib = contributions();
  });
</script>

<div class="head">
  <span class="summary num" class:all-good={summary.total > 0 && summary.explained === summary.total} data-testid="diff-summary">
    {#if hasModel}{summary.explained}/{summary.total} match{:else}{summary.total}/{rows.length} entered{/if}
  </span>
</div>
<!-- svelte-ignore a11y_no_noninteractive_tabindex (a scrollable region must be focusable) -->
<div class="scroll" role="region" aria-label="In-game stats table" tabindex="0">
  <table class="sheet">
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
          {#if hasModel}<td class="r num dim" data-label="App" title="The number the app works out for this stat">{statText(m.key, computed?.[m.key])}</td>{/if}
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
            </span>
            {#if invalid[m.key]}
              <span class="msg err" id="err-{m.key}" role="alert">
                {isFlatStat(m.key)
                  ? 'That is not a number. For flat stats, "." separates thousands: 48.124 is 48124.'
                  : 'That is not a number. For percent stats, "." is the decimal point.'}
              </span>
            {:else if echo?.key === m.key}
              <span class="msg" id="echo-{m.key}">Read as {echo.text}</span>
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
                  placeholder="before cap"
                  value={drafts[m.rawKey] ?? ''}
                  oninput={(e) => (drafts[m.rawKey] = e.target.value)}
                  onfocus={() => (focusedKey = m.rawKey)}
                  onblur={(e) => commit(m.rawKey, e.target.value)}
                  onkeydown={onKey}
                />
                <span class="unit">{unit(m)}</span>
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
</div>

<style>
  .head { display: flex; justify-content: flex-end; padding: 0 var(--sp-1) var(--sp-2); }
  .summary { font-size: var(--fs-13); color: var(--verdict-down); }
  .summary.all-good { color: var(--verdict-up); }
  .scroll { overflow-x: auto; max-width: 100%; }
  table.sheet { width: 100%; min-width: 760px; border-collapse: collapse; font-size: var(--fs-13); }
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
  td, tbody th { padding: var(--sp-1) var(--sp-3); border-bottom: 1px solid var(--line-hairline); font-weight: inherit; vertical-align: top; }
  tbody th.lbl { text-align: left; color: var(--text-soft); font-size: var(--fs-14); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .dim { color: var(--text-muted); }
  .warn { color: var(--status-warn); }
  tr.off { background: var(--verdict-down-tint); }
  .expand { display: inline-flex; gap: var(--sp-1); align-items: center; background: none; border: 0; padding: 0; cursor: pointer; color: inherit; font: inherit; }
  .input-wrap { display: inline-flex; align-items: center; gap: 3px; }
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
    table.sheet { min-width: 0; }
    table.sheet thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    table.sheet, table.sheet tbody { display: block; }
    tr[data-key] {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--sp-2) var(--sp-3);
      padding: var(--sp-3) var(--sp-2);
      border-bottom: 1px solid var(--line-hairline);
    }
    tr[data-key] > th.lbl { grid-column: 1 / -1; display: block; padding: 0; border: 0; }
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
    .input-wrap input { width: 100%; min-width: 0; text-align: left; }
    .msg { text-align: left; }
    .status { white-space: normal; }
    tr.src-row, tr.src-row > td { display: block; padding: var(--sp-2); }
    .split { padding-left: 0; }
    .note { margin-left: 0; }
  }
</style>
