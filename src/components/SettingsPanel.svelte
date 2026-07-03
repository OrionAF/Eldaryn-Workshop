<script>
  /**
   * SettingsPanel.svelte - hard reset. Shown via Sidebar's "Reset all data" trigger.
   * Two-step: click "Reset all data" to reveal a confirm row, then type the
   * exact word RESET and press Enter (or click Confirm) - a plain "are you
   * sure?" click is too easy to fat-finger for something this destructive
   * and irreversible (wipes every character/gear/talent, no undo).
   */
  import { clearAllData } from '../lib/storage.js';

  let { open, onClose } = $props();

  let confirming = $state(false);
  let confirmText = $state('');

  const RESET_WORD = 'RESET';

  function startReset() {
    confirming = true;
    confirmText = '';
  }

  function cancelReset() {
    confirming = false;
    confirmText = '';
  }

  function doReset() {
    if (confirmText !== RESET_WORD) return;
    clearAllData();
    location.reload();
  }

  function onConfirmKeydown(e) {
    if (e.key === 'Enter') doReset();
  }

  function close() {
    confirming = false;
    confirmText = '';
    onClose();
  }
</script>

{#if open}
  <div class="inline-panel settings-panel" role="group" aria-label="Settings">
    {#if !confirming}
      <button type="button" class="reset-trigger" onclick={startReset}>Reset all data</button>
    {:else}
      <span class="reset-warning">
        This permanently deletes every character, gear, and talent build. Type {RESET_WORD} to confirm:
      </span>
      <input
        type="text"
        placeholder={RESET_WORD}
        bind:value={confirmText}
        onkeydown={onConfirmKeydown}
        aria-label="Type RESET to confirm"
      />
      <button type="button" onclick={doReset} disabled={confirmText !== RESET_WORD}>Confirm reset</button>
      <button type="button" onclick={cancelReset}>Cancel</button>
    {/if}
    <button type="button" onclick={close}>Close</button>
  </div>
{/if}

<style>
  .settings-panel {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
    flex-wrap: wrap;
  }
  .reset-trigger {
    color: var(--color-danger, #e05252);
  }
  .reset-warning {
    color: var(--color-danger, #e05252);
    font-size: 0.85rem;
    max-width: 24rem;
  }
</style>
