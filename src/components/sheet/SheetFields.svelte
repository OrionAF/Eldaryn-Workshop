<script>
  /**
   * SheetFields.svelte - entry of the in-game stat sheet (rebuild-plan §4 tier 2): one input per
   * class-shown total key, plus an optional "raw" input on capped rows (the RAW figure the game prints
   * above a soft cap). A blank field means "not entered" and the pipeline's computed value is used.
   *
   * Text goes through sheet.js parseSheetInput, which owns the number-format gotcha ("." is a thousands
   * separator on flat rows and a decimal point on percent rows; Attack Speed and Crit Damage are typed
   * as the shown percent). Drafts are left alone while a field is focused, committed on blur/Enter, and
   * resynced from `values` otherwise.
   */
  import { sheetKeyMeta, parseSheetInput, toDisplay } from '../../lib/engine/pipeline/sheet.js';
  import { formatFlat, formatPct } from '../../lib/format.js';

  /** @type {{keys: string[], values: Object<string, number>, computed?: Object|null, onChange: (key: string, value: number|null) => void}} */
  let { keys, values, computed = null, onChange } = $props();

  const rows = $derived(keys.map((k) => sheetKeyMeta(k)).filter(Boolean));

  const show = (key, v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return '';
    return sheetKeyMeta(key)?.kind === 'integer' ? formatFlat(v) : formatPct(toDisplay(key, v));
  };

  let drafts = $state({});
  let invalid = $state({});
  let focusedKey = $state(null);

  $effect(() => {
    for (const m of rows) {
      for (const k of m.rawKey ? [m.key, m.rawKey] : [m.key]) {
        if (k !== focusedKey) drafts[k] = show(k, values[k]);
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
    drafts[key] = show(key, v);
  }

  const onKey = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };
  const suffix = (m) => (m.kind === 'integer' ? '' : '%');
</script>

<div class="sheet-fields">
  {#each rows as m (m.key)}
    <div class="sheet-row" data-key={m.key}>
      <label class="row-label" for={`sheet-${m.key}`}>{m.label}</label>
      <span class="model-value mono" title="Value the model computes for this stat">
        {show(m.key, computed?.[m.key])}{suffix(m)}
      </span>
      <span class="input-wrap">
        <input
          id={`sheet-${m.key}`}
          type="text"
          inputmode="decimal"
          class:invalid={invalid[m.key]}
          aria-invalid={invalid[m.key] ? 'true' : 'false'}
          placeholder="from sheet"
          value={drafts[m.key] ?? ''}
          oninput={(e) => (drafts[m.key] = e.target.value)}
          onfocus={() => (focusedKey = m.key)}
          onblur={(e) => commit(m.key, e.target.value)}
          onkeydown={onKey}
        />
        <span class="unit">{suffix(m)}</span>
      </span>
      {#if m.rawKey}
        <span class="input-wrap raw">
          <input
            id={`sheet-${m.rawKey}`}
            type="text"
            inputmode="decimal"
            class:invalid={invalid[m.rawKey]}
            aria-invalid={invalid[m.rawKey] ? 'true' : 'false'}
            aria-label={`${m.label} raw`}
            placeholder="raw"
            value={drafts[m.rawKey] ?? ''}
            oninput={(e) => (drafts[m.rawKey] = e.target.value)}
            onfocus={() => (focusedKey = m.rawKey)}
            onblur={(e) => commit(m.rawKey, e.target.value)}
            onkeydown={onKey}
          />
          <span class="unit">{suffix(m)}</span>
        </span>
      {:else}
        <span></span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .sheet-fields { display: grid; grid-template-columns: 1fr; gap: 2px var(--space-5); }
  @media (min-width: 900px) { .sheet-fields { grid-template-columns: 1fr 1fr; } }
  .sheet-row {
    display: grid;
    grid-template-columns: minmax(90px, 1fr) 76px 108px 84px;
    align-items: center;
    gap: var(--space-2);
    padding: 3px 4px;
    border-bottom: 1px solid var(--color-border);
  }
  .row-label { color: var(--color-muted); font-size: 12.5px; }
  .model-value { color: var(--color-muted); font-size: 11.5px; text-align: right; opacity: 0.8; }
  .input-wrap { display: inline-flex; align-items: center; gap: 3px; }
  .input-wrap input { width: 100%; min-width: 0; text-align: right; }
  .input-wrap .unit { width: 10px; color: var(--color-muted); font-size: 11px; }
  input.invalid { border-color: var(--color-downgrade); }
  @media (max-width: 700px) {
    .sheet-row { grid-template-columns: minmax(70px, 1fr) 64px 90px 70px; }
  }
</style>
