<script>
  /**
   * Select.svelte - labelled native <select> (design-system §4.6: native is acceptable for simple
   * lists). Optional muted `meta` beside the value, hint, and an error linked by aria-describedby.
   * `loading` shows a skeleton in place of the control.
   *
   * The chevron and meta are drawn OVER the select (pointer-events: none), not beside it, so a click
   * on the arrow opens the list; the select pads its right edge to clear them (meta by its length).
   * The label stays on one line (full text in its title) so a row of fields keeps its controls level.
   *
   * options: [{ value, label, disabled? }]
   */
  import Skeleton from './Skeleton.svelte';

  let {
    options,
    value = $bindable(),
    label,
    meta = '',
    hint = '',
    error = '',
    disabled = false,
    loading = false,
    hideLabel = false, // the label stays for assistive tech and tests, visually hidden (a column header names it)
    onchange = () => {},
  } = $props();
  const id = $props.id();
  const describedBy = $derived([error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined);
  const current = $derived(options.find((o) => String(o.value) === String(value))?.label ?? '');
  // Room for the chevron, plus the meta text at ~0.6em a character (12px meta text in the 14px select).
  const padRight = $derived(meta ? `calc(var(--sp-3) * 2 + 1em + ${(String(meta).length * 0.6).toFixed(1)}em)` : undefined);
</script>

<div class="field">
  <label for={id} title={label} class:visually-hidden={hideLabel}>{label}</label>
  {#if loading}
    <Skeleton height="var(--control-h)" />
  {:else}
    <div class="select" class:is-error={!!error} class:is-disabled={disabled}>
      <select
        {id}
        {disabled}
        bind:value
        title={current}
        style:padding-right={padRight}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        onchange={() => onchange(value)}
      >
        {#each options as opt (opt.value)}
          <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        {/each}
      </select>
      <span class="adorn" aria-hidden="true">
        {#if meta}<span class="meta">{meta}</span>{/if}
        <span class="chev">▾</span>
      </span>
    </div>
  {/if}
  {#if hint}<span class="hint" id="{id}-hint">{hint}</span>{/if}
  {#if error}<span class="err" id="{id}-err" role="alert"><span aria-hidden="true">⚠</span> {error}</span>{/if}
</div>

<style>
  .field { display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; gap: var(--field-gap); min-width: 0; }
  label {
    font-size: var(--fs-12);
    line-height: var(--field-label-h);
    font-weight: var(--fw-bold);
    color: var(--text-soft);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .select {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    height: var(--control-h);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
  }
  .select:hover { border-color: var(--line-control-hover); }
  select {
    grid-area: 1 / 1;
    appearance: none;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 calc(var(--sp-3) + 1em) 0 var(--sp-3);
    background: transparent;
    color: inherit;
    border: 0;
    border-radius: inherit;
    font: inherit;
    font-size: var(--fs-14);
    text-overflow: ellipsis;
    cursor: pointer;
  }
  select option { background: var(--surface-3); }
  .adorn {
    grid-area: 1 / 1;
    justify-self: end;
    align-self: center;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    padding: 0 var(--sp-3) 0 var(--sp-2);
    pointer-events: none;
  }
  .meta { color: var(--text-muted); font-size: var(--fs-12); white-space: nowrap; }
  .chev { color: var(--text-soft); }
  .select:hover .chev { color: var(--text-ink); }
  .select.is-error { border-color: var(--verdict-down); box-shadow: inset 2px 0 0 var(--verdict-down); }
  .select.is-disabled { color: var(--text-disabled); border-color: var(--line-rule); background: var(--surface-2); }
  .select.is-disabled select { cursor: not-allowed; }
  .select.is-disabled .chev { color: var(--text-disabled); }
  .hint { font-size: var(--fs-12); color: var(--text-muted); }
  .err { font-size: var(--fs-12); color: var(--verdict-down); display: flex; gap: 4px; align-items: center; }
  @media (pointer: coarse), (max-width: 700px) {
    .select { height: var(--hit); }
  }
</style>
