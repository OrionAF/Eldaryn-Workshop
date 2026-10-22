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
    wide = false,
    labelledBy = undefined,
    onclose = () => {},
    children,
    footer,
  } = $props();

  const uid = $props.id();
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
  class:wide
  aria-labelledby={labelledBy ?? (title ? `${uid}-title` : undefined)}
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
      {#if title}<h2 id="{uid}-title">{title}</h2>{/if}
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
    border: 1px solid var(--frame-brass);
    border-radius: var(--r-3);
    background: var(--surface-2);
    color: var(--text-ink);
    width: min(var(--modal-w), calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    overflow: hidden;
    box-shadow: var(--elev-3);
  }

  .modal.wide { width: min(var(--modal-wide-w), calc(100vw - 32px)); }

  .modal::backdrop {
    background: var(--surface-scrim);
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
    gap: var(--sp-3);
    padding: var(--sp-3) var(--sp-4);
    background: var(--plate);
    border-bottom: 2px solid var(--frame-brass);
  }

  .modal-head h2 {
    margin: 0;
    flex: 1;
    font-family: var(--font-display);
    font-size: var(--fs-20);
    line-height: var(--lh-tight);
  }

  .modal-close {
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-1);
    color: var(--text-soft);
    font-size: var(--fs-20);
    line-height: 1;
    width: 32px;
    height: 32px;
    cursor: pointer;
  }

  .modal-close:hover {
    color: var(--text-ink);
    border-color: var(--line-control);
  }

  .modal-content {
    padding: var(--sp-4);
    overflow: auto;
  }

  .modal-foot {
    padding: var(--sp-3) var(--sp-4);
    border-top: 1px solid var(--line-hairline);
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-2);
  }

  @media (max-width: 700px) {
    .modal {
      width: calc(100vw - 16px);
      margin-bottom: 0;
    }
    .modal-close {
      width: var(--hit);
      height: var(--hit);
    }
  }
</style>
