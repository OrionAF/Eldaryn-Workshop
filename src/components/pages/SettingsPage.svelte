<script>
  /**
   * SettingsPage.svelte - G6 route (`#/settings`). Interim page: Export all characters plus the
   * existing SettingsPanel (Danger zone, RESET rule). The Data / Preferences / Danger zone page with
   * "Export this character" replaces it (U4).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { back } from '../../lib/router.svelte.js';
  import SettingsPanel from '../SettingsPanel.svelte';
  import Button from '../ui/Button.svelte';

  let { setStatus = () => {} } = $props();
</script>

<div class="settings">
  <div>
    <Button variant="secondary" onclick={() => rosterStore.exportDownload()}>Export all characters</Button>
  </div>
  <SettingsPanel open={true} onClose={back} onStatus={setStatus} />
  <p class="privacy">100% local: everything runs in your browser and saves to this device only. Nothing is sent to a server.</p>
</div>

<style>
  .settings { display: grid; gap: var(--sp-4); max-width: 40rem; }
  .privacy { margin: 0; font-size: var(--fs-12); color: var(--text-muted); }
</style>
