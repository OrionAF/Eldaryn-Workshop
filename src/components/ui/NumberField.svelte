<script>
  /**
   * NumberField.svelte - mono, right-aligned numeric input (design-system §4.7).
   *
   * Parsing is format.js's, never a native number input: with a `statKey`, flat stats read "." as a
   * thousands separator ("48.124" is 48124) and percentage stats read it as a decimal point; without
   * one the text is read as a plain decimal. While the field has focus a live echo shows how the
   * text was read ("Read as 48.124"), so a wrongly typed separator is visible before it is saved.
   * The value commits on blur or Enter and the box then shows the formatted value. A value outside
   * [min, max] is not committed and shows an error linked by aria-describedby.
   */
  import { parseStat, parsePct, formatStat, formatPct } from '../../lib/format.js';

  let {
    value = $bindable(null),
    statKey = null,
    label,
    unit = '',
    min = null,
    max = null,
    nullable = false,
    error = '',
    disabled = false,
    onchange = () => {},
  } = $props();
  const id = $props.id();

  const fmt = (v) => (v == null ? '' : statKey ? formatStat(statKey, v) : formatPct(v));
  const parse = (t) => (statKey ? parseStat(statKey, t) : parsePct(t));

  let draft = $state(null); // null = not editing; show the formatted value
  let localError = $state('');

  const shown = $derived(draft ?? fmt(value));
  const shownError = $derived(error || localError);
  const echo = $derived(draft !== null && draft.trim() !== '' ? fmt(parse(draft)) : '');
  const describedBy = $derived([shownError ? `${id}-err` : null, echo ? `${id}-echo` : null].filter(Boolean).join(' ') || undefined);

  function commit() {
    if (draft === null) return;
    const text = draft;
    draft = null;
    if (text.trim() === '') {
      localError = '';
      if (nullable) {
        value = null;
        onchange(null);
      }
      return;
    }
    const n = parse(text);
    if (max != null && n > max) {
      localError = `Above the maximum (${fmt(max)})`;
      return;
    }
    if (min != null && n < min) {
      localError = `Below the minimum (${fmt(min)})`;
      return;
    }
    localError = '';
    value = n;
    onchange(n);
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="input num" class:is-error={!!shownError} class:is-disabled={disabled}>
    <input
      {id}
      type="text"
      inputmode="decimal"
      autocomplete="off"
      {disabled}
      value={shown}
      aria-invalid={shownError ? 'true' : undefined}
      aria-describedby={describedBy}
      oninput={(e) => (draft = e.currentTarget.value)}
      onfocus={() => (localError = '')}
      onblur={commit}
      onkeydown={(e) => e.key === 'Enter' && commit()}
    />
    {#if unit}<span class="unit">{unit}</span>{/if}
  </div>
  {#if echo}<span class="hint" id="{id}-echo" aria-live="polite">Read as <span class="num">{echo}</span>{unit ? ` ${unit}` : ''}</span>{/if}
  {#if shownError}<span class="err" id="{id}-err" role="alert"><span aria-hidden="true">⚠</span> {shownError}</span>{/if}
</div>

<style>
  .field { display: grid; gap: 4px; min-width: 0; }
  label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .input {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--sp-1);
    height: var(--control-h);
    padding: 0 var(--sp-3);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    font-family: var(--font-data);
    font-size: var(--fs-13);
    color: var(--text-ink);
  }
  .input:hover { border-color: var(--line-control-hover); }
  input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: 0;
    color: inherit;
    font: inherit;
    text-align: right;
  }
  input:focus-visible { outline: none; }
  .input:has(input:focus-visible) { outline: var(--focus-width) solid var(--focus-ring); outline-offset: var(--focus-offset); }
  .unit { color: var(--text-muted); font-family: var(--font-ui); font-size: var(--fs-12); }
  .input.is-error { border-color: var(--verdict-down); box-shadow: inset 2px 0 0 var(--verdict-down); }
  .input.is-disabled { color: var(--text-disabled); border-color: var(--line-rule); background: var(--surface-2); }
  .hint { font-size: var(--fs-12); color: var(--text-muted); }
  .err { font-size: var(--fs-12); color: var(--verdict-down); display: flex; gap: 4px; align-items: center; }
  @media (pointer: coarse), (max-width: 700px) {
    .input { height: var(--hit); }
  }
</style>
