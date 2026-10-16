<script>
  /**
   * DropZone.svelte - file picker with drag-and-drop as an enhancement (design-system §4.26).
   * The zone is a real <button> that opens a hidden file input, so keyboard and touch work with no
   * drag at all. `onfile(file)` receives the first file. `error` and `summary` are shown below.
   */
  let {
    onfile,
    accept = '.json,application/json',
    label = 'Drop a game profile file or click to choose',
    hint = 'A .json file',
    error = '',
    summary = '',
    disabled = false,
  } = $props();
  const id = $props.id();

  let input = $state(null);
  let over = $state(false);

  function take(files) {
    const file = files?.[0];
    if (file && !disabled) onfile(file);
  }
  function onDrop(event) {
    event.preventDefault();
    over = false;
    take(event.dataTransfer?.files);
  }
</script>

<div class="wrap">
  <button
    type="button"
    class="dropzone"
    class:is-over={over}
    class:is-error={!!error}
    {disabled}
    aria-describedby={error ? `${id}-err` : undefined}
    onclick={() => input?.click()}
    ondragover={(e) => {
      e.preventDefault();
      over = true;
    }}
    ondragleave={() => (over = false)}
    ondrop={onDrop}
  >
    <span class="glyph" aria-hidden="true">⇪</span>
    <span class="text"><b>{label}</b><span class="hint">{hint}</span></span>
  </button>
  <input
    bind:this={input}
    {id}
    class="visually-hidden"
    type="file"
    {accept}
    tabindex="-1"
    aria-hidden="true"
    onchange={(e) => {
      take(e.currentTarget.files);
      e.currentTarget.value = '';
    }}
  />
  {#if error}<span class="err" id="{id}-err" role="alert"><span aria-hidden="true">⚠</span> {error}</span>{/if}
  {#if summary && !error}<span class="summary" role="status">{summary}</span>{/if}
</div>

<style>
  .wrap { display: grid; gap: var(--sp-2); }
  .dropzone {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    padding: var(--sp-3) var(--sp-4);
    border: 1px dashed var(--line-control);
    border-radius: var(--r-2);
    background: var(--surface-1);
    color: var(--text-soft);
    font-family: var(--font-ui);
    font-size: var(--fs-13);
    text-align: left;
    cursor: pointer;
  }
  .dropzone:hover { border-color: var(--line-control-hover); background: var(--surface-3); }
  .glyph { color: var(--brass-400); font-size: var(--fs-20); }
  .text { display: grid; gap: 2px; }
  b { color: var(--text-ink); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); }
  .dropzone.is-over { border-style: solid; border-color: var(--ember-500); background: var(--ember-tint); }
  .dropzone.is-error { border-color: var(--verdict-down); }
  .dropzone:disabled { color: var(--text-disabled); border-color: var(--line-rule); cursor: not-allowed; }
  .err { font-size: var(--fs-12); color: var(--verdict-down); display: flex; gap: 4px; align-items: center; }
  .summary { font-size: var(--fs-12); color: var(--text-soft); }
</style>
