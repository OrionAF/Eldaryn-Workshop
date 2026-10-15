<script>
  /**
   * DropImport.svelte - the "Import drops" input of Drop Check: load a .json file or paste the JSON.
   * It only hands the text on (`onimport(text)`); parsing and judging live in features/dropBatch.js.
   *
   * Props: onimport(text), error (string shown under the box), busy (disables the buttons).
   */
  import DropZone from '../ui/DropZone.svelte';
  import Textarea from '../ui/Textarea.svelte';
  import Button from '../ui/Button.svelte';

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

  async function onFile(file) {
    fileName = file.name;
    try {
      text = await readFile(file);
    } catch {
      text = '';
    }
    onimport(text);
  }
</script>

<div class="drop-import">
  <DropZone onfile={onFile} disabled={busy} label="Drop a loot-bag .json file or click to choose" hint={fileName || 'JSON file'} />
  <Textarea
    label="Loot-bag JSON"
    rows={4}
    placeholder={'Or paste the loot-bag JSON here: {"pendingItems": [...]} or a full game profile'}
    bind:value={text}
    {error}
  />
  <div>
    <Button variant="primary" disabled={busy || !text.trim()} onclick={() => onimport(text)}>Check these drops</Button>
  </div>
</div>

<style>
  .drop-import { display: grid; gap: var(--sp-3); min-width: 0; }
</style>
