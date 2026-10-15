<script>
  /**
   * ImportFile.svelte - the hidden file input behind the top-bar Import button and the phone Import
   * tab. This is the interim G3: pick a file, import it through the store, report through notify().
   * The kind-detecting dialog with the import report replaces it (U4). A game profile lands on
   * Overview (ia.md §5.1); a bad file shows the specific error and leaves the roster untouched.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { ImportError } from '../../lib/storage.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { go } from '../../lib/router.svelte.js';
  import { AFTER_IMPORT_PAGE_ID } from '../../lib/routes.js';

  let input = $state(null);

  /** Open the file picker. */
  export function open() {
    input?.click();
  }

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = rosterStore.importFromJson(await readFileAsText(file));
      if (result.kind === 'profile') {
        notify(`Imported ${result.name} from a game profile`, { kind: 'success' });
        go(AFTER_IMPORT_PAGE_ID);
      } else {
        notify('Imported the roster', { kind: 'success' });
      }
    } catch (err) {
      const reason = err instanceof ImportError ? err.message : 'not a valid roster file or game profile.';
      notify(`Import failed: ${reason}`, { kind: 'error' });
    }
  }
</script>

<input type="file" accept="application/json" bind:this={input} onchange={onFile} hidden aria-label="Import file" />
