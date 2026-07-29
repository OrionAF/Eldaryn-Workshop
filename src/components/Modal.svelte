<script>
  /**
   * Modal.svelte - the app's only centred dialog.
   *
   * Built on native <dialog>.showModal(), which hands us focus trapping, Esc to
   * close, focus restored to the trigger, inertness of the page behind, and
   * implicit aria-modal semantics - all of which a div-with-a-backdrop would
   * have to reimplement (usually badly). The only thing it doesn't give is
   * click-outside, which is the light-dismiss handler below.
   *
   * jsdom's <dialog> support has been patchy across versions, so showModal /
   * close are called defensively - in a test environment the element still
   * gets its `open` attribute, so queries against modal content work.
   *
   * Usage:
   *   <Modal bind:open title="Glyphs">{#snippet children()}...{/snippet}</Modal>
   */
  let {
    open = $bindable(false),
    title = '',
    labelledBy = undefined,
    onclose = () => {},
    children,
    footer,
  } = $props();

  let dialog = $state(null);

  $effect(() => {
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      }
    } else if (dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  });

  function requestClose() {
    open = false;
    onclose();
  }

  /**
   * Light dismiss. A click whose target IS the dialog element landed on the
   * backdrop - anything inside the modal resolves to a descendant instead.
   */
  function onBackdropClick(event) {
    if (event.target === dialog) requestClose();
  }
</script>

<dialog
  bind:this={dialog}
  class="modal"
  aria-labelledby={labelledBy ?? (title ? 'modal-title' : undefined)}
  aria-label={!title && !labelledBy ? 'Dialog' : undefined}
  onclick={onBackdropClick}
  oncancel={(e) => {
    e.preventDefault();
    requestClose();
  }}
  onclose={() => {
    if (open) requestClose();
  }}
>
  <div class="modal-body">
    <header class="modal-head">
      {#if title}<h2 id="modal-title" class="subheading">{title}</h2>{/if}
      <button type="button" class="modal-close" onclick={requestClose} aria-label="Close">×</button>
    </header>

    <div class="modal-content">
      {@render children?.()}
    </div>

    {#if footer}
      <footer class="modal-foot">{@render footer()}</footer>
    {/if}
  </div>
</dialog>

<style>
  .modal {
    padding: 0;
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-panel);
    background: var(--color-panel);
    color: var(--color-ink);
    max-width: min(760px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.4), var(--color-gold-glow);
  }

  .modal::backdrop {
    background: rgba(8, 6, 16, 0.66);
  }

  .modal-body {
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 64px);
  }

  .modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-4) var(--space-3);
    border-bottom: 1px solid var(--color-border-hairline);
  }

  .modal-head h2 {
    margin: 0;
  }

  .modal-close {
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-field);
    color: var(--color-muted);
    font-size: 20px;
    line-height: 1;
    width: 30px;
    height: 30px;
    cursor: pointer;
  }

  .modal-close:hover {
    color: var(--color-ink);
    border-color: var(--color-border);
  }

  .modal-content {
    padding: var(--space-4);
    overflow: auto;
  }

  .modal-foot {
    padding: var(--space-3) var(--space-4);
    border-top: 1px solid var(--color-border-hairline);
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  @media (max-width: 700px) {
    .modal {
      max-width: calc(100vw - 16px);
    }
    .modal-close {
      width: 44px;
      height: 44px;
    }
  }
</style>
