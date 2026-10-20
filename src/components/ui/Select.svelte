<script>
  /**
   * Select.svelte - labelled native <select> (design-system §4.6: native is acceptable for simple
   * lists). Optional muted `meta` beside the value, hint, and an error linked by aria-describedby.
   * `loading` shows a skeleton in place of the control.
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
    onchange = () => {},
  } = $props();
  const id = $props.id();
  const describedBy = $derived([error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined);
</script>

<div class="field">
  <label for={id}>{label}</label>
  {#if loading}
    <Skeleton height="var(--control-h)" />
  {:else}
    <div class="select" class:is-error={!!error} class:is-disabled={disabled}>
      <select
        {id}
        {disabled}
        bind:value
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        onchange={() => onchange(value)}
      >
        {#each options as opt (opt.value)}
          <option value={opt.value} disabled={opt.disabled}>{opt.label}</option>
        {/each}
      </select>
      {#if meta}<span class="meta">{meta}</span>{/if}
      <span class="chev" aria-hidden="true">▾</span>
    </div>
  {/if}
  {#if hint}<span class="hint" id="{id}-hint">{hint}</span>{/if}
  {#if error}<span class="err" id="{id}-err" role="alert"><span aria-hidden="true">⚠</span> {error}</span>{/if}
</div>

<style>
  .field { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; min-width: 0; }
  label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .select {
    min-width: 0;
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: var(--control-h);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
  }
  .select:hover { border-color: var(--line-control-hover); }
  select {
    appearance: none;
    flex: 1;
    width: 100%;
    min-width: 0;
    height: 100%;
    padding: 0 var(--sp-3);
    background: transparent;
    color: inherit;
    border: 0;
    font: inherit;
    font-size: var(--fs-14);
    cursor: pointer;
  }
  select option { background: var(--surface-3); }
  .meta { color: var(--text-muted); font-size: var(--fs-12); white-space: nowrap; }
  .chev { color: var(--text-soft); padding-right: var(--sp-3); pointer-events: none; }
  .select.is-error { border-color: var(--verdict-down); box-shadow: inset 2px 0 0 var(--verdict-down); }
  .select.is-disabled { color: var(--text-disabled); border-color: var(--line-rule); background: var(--surface-2); }
  .select.is-disabled select { cursor: not-allowed; }
  .hint { font-size: var(--fs-12); color: var(--text-muted); }
  .err { font-size: var(--fs-12); color: var(--verdict-down); display: flex; gap: 4px; align-items: center; }
  @media (pointer: coarse), (max-width: 700px) {
    .select { height: var(--hit); }
  }
</style>
