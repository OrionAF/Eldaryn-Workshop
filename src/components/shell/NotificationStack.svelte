<script>
  /**
   * NotificationStack.svelte - toasts (design-system §4.19). Up to three, newest last. The container
   * is the polite live region (role=status); an error toast is role=alert. Info/success dismiss
   * themselves after 6 s (held while hovered or focused); warnings and errors stay until closed.
   * Every message is also in the Activity log.
   */
  import { notifications, dismiss, pauseDismiss, resumeDismiss } from '../../lib/notify.svelte.js';
  import Banner from '../ui/Banner.svelte';

  const VARIANT = { info: 'info', success: 'info', warn: 'warn', error: 'error' };
  const LEAD = { success: 'Done.' };
</script>

<div class="stack" role="status" aria-live="polite" aria-label="Notifications">
  {#each notifications.toasts as t (t.id)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="toast"
      data-kind={t.kind}
      onmouseenter={() => pauseDismiss(t.id)}
      onmouseleave={() => resumeDismiss(t.id)}
      onfocusin={() => pauseDismiss(t.id)}
      onfocusout={() => resumeDismiss(t.id)}
    >
      <Banner variant={VARIANT[t.kind] ?? 'info'} lead={LEAD[t.kind] ?? ''} onclose={() => dismiss(t.id)}>{t.message}</Banner>
    </div>
  {/each}
</div>

<style>
  .stack {
    position: fixed;
    right: var(--sp-6);
    bottom: var(--sp-6);
    display: grid;
    gap: var(--sp-2);
    width: min(380px, calc(100vw - 2 * var(--sp-4)));
    z-index: var(--z-toast);
    pointer-events: none;
  }
  .toast { pointer-events: auto; box-shadow: var(--elev-2); border-radius: var(--r-1); }
  @media (max-width: 700px) {
    .stack { right: var(--sp-4); bottom: calc(56px + var(--sp-3) + env(safe-area-inset-bottom, 0px)); }
  }
</style>
