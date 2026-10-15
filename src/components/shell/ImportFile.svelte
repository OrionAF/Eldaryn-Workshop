<script>
  /**
   * ImportFile.svelte - the shell's single import entry (G3): hosts the import dialog, opens it from the
   * top-bar Import button and the phone Import tab (`open()`), and opens it for a .json file dropped
   * anywhere on the window (ia.md §2.1). The dialog itself is components/import/ImportDialog.svelte.
   */
  import ImportDialog from '../import/ImportDialog.svelte';
  import { openImport, loadImportFile } from '../../lib/importFlow.svelte.js';

  /** Open the import dialog. */
  export function open() {
    openImport();
  }

  const hasFile = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

  function onDragOver(e) {
    if (hasFile(e)) e.preventDefault(); // allow the drop
  }

  function onDrop(e) {
    if (e.defaultPrevented || !hasFile(e)) return;
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    e.preventDefault();
    loadImportFile(file);
  }
</script>

<svelte:window ondragover={onDragOver} ondrop={onDrop} />
<ImportDialog />
