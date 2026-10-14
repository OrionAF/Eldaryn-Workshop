<script>
  /** Textarea.svelte - labelled multi-line input for pasted JSON (design-system §4.35). Vertical resize only. */
  let { value = $bindable(''), label, rows = 4, placeholder = '', error = '', disabled = false, oninput = () => {} } = $props();
  const id = $props.id();
</script>

<div class="field">
  <label for={id}>{label}</label>
  <textarea
    {id}
    {rows}
    {placeholder}
    {disabled}
    bind:value
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={error ? `${id}-err` : undefined}
    class:is-error={!!error}
    oninput={() => oninput(value)}
  ></textarea>
  {#if error}<span class="err" id="{id}-err" role="alert"><span aria-hidden="true">⚠</span> {error}</span>{/if}
</div>

<style>
  .field { display: grid; gap: 4px; min-width: 0; }
  label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  textarea {
    min-height: 96px;
    resize: vertical;
    padding: var(--sp-2) var(--sp-3);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    font-family: var(--font-data);
    font-size: var(--fs-13);
  }
  textarea:hover { border-color: var(--line-control-hover); }
  textarea::placeholder { color: var(--text-muted); }
  textarea.is-error { border-color: var(--verdict-down); box-shadow: inset 2px 0 0 var(--verdict-down); }
  textarea:disabled { color: var(--text-disabled); border-color: var(--line-rule); background: var(--surface-2); cursor: not-allowed; }
  .err { font-size: var(--fs-12); color: var(--verdict-down); display: flex; gap: 4px; align-items: center; }
</style>
