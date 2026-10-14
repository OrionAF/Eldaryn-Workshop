<script>
  /**
   * DropImport.svelte - the "Import drops" input of Drop Check: load a .json file or paste the JSON.
   * It only hands the text on (`onimport(text)`); parsing and judging live in features/dropBatch.js.
   *
   * Props: onimport(text), error (string shown under the box), busy (disables the buttons).
   */
  let { onimport, error = '', busy = false } = $props();

  let text = $state('');
  let fileName = $state('');

  async function readFile(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function onFile(e) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    fileName = file.name;
    try {
      text = await readFile(file);
    } catch {
      text = '';
    }
    input.value = '';
    onimport(text);
  }
</script>

<div class="drop-import">
  <div class="row">
    <label class="btn-ghost file-btn">
      Load .json file
      <input type="file" accept=".json,application/json" aria-label="Loot-bag JSON file" onchange={onFile} disabled={busy} />
    </label>
    {#if fileName}<span class="file-name">{fileName}</span>{/if}
  </div>
  <textarea
    aria-label="Loot-bag JSON"
    rows="4"
    spellcheck="false"
    placeholder={'Or paste the loot-bag JSON here: {"pendingItems": [...]} or a full game profile'}
    bind:value={text}
  ></textarea>
  <div class="row">
    <button type="button" class="btn-gold" disabled={busy || !text.trim()} onclick={() => onimport(text)}>Check these drops</button>
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</div>

<style>
  .drop-import {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
  }
  .file-btn {
    position: relative;
    display: inline-block;
    cursor: pointer;
  }
  .file-btn input {
    position: absolute;
    inset: 0;
    opacity: 0;
    width: 100%;
    cursor: pointer;
  }
  .file-name {
    font-size: 11.5px;
    color: var(--color-muted);
  }
  textarea {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 8px 10px;
    font-size: 12px;
    font-family: var(--font-data);
    resize: vertical;
    max-width: 100%;
  }
  .error {
    margin: 0;
    font-size: 11.5px;
    color: var(--color-downgrade);
  }
  @media (max-width: 700px) {
    .row :global(button),
    .file-btn {
      min-height: 44px;
    }
  }
</style>
