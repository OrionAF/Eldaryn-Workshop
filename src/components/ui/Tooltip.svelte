<script>
  /**
   * Tooltip.svelte - text-only hint for the wrapped trigger (design-system §4.32).
   *
   * Wraps its children in a span that carries the hover/focus handlers and, while shown, points
   * aria-describedby at the role=tooltip element. Shown after `delay` ms, hidden on leave, blur or
   * Escape. Never interactive.
   */
  let { text, delay = 250, children } = $props();
  const id = $props.id();
  let shown = $state(false);
  let timer = null;

  function show() {
    clearTimeout(timer);
    timer = setTimeout(() => (shown = true), delay);
  }
  function hide() {
    clearTimeout(timer);
    shown = false;
  }
  function onKeyDown(event) {
    if (event.key === 'Escape' && shown) hide();
  }
</script>

<span
  class="tip-wrap"
  aria-describedby={shown ? `${id}-tip` : undefined}
  onmouseenter={show}
  onmouseleave={hide}
  onfocusin={show}
  onfocusout={hide}
  onkeydown={onKeyDown}
  role="presentation"
>
  {@render children?.()}
  {#if shown}
    <span class="tooltip" role="tooltip" id="{id}-tip">{text}</span>
  {/if}
</span>

<style>
  .tip-wrap { position: relative; display: inline-flex; }
  .tooltip {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: var(--z-tooltip);
    width: max-content;
    max-width: 260px;
    padding: 6px var(--sp-2);
    background: var(--surface-4);
    border: 1px solid var(--line-control);
    border-radius: var(--r-2);
    box-shadow: var(--elev-2);
    font-size: var(--fs-12);
    color: var(--text-ink);
    pointer-events: none;
  }
</style>
