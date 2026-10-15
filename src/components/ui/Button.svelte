<script>
  /**
   * Button.svelte - the five button variants (design-system §4.10).
   *
   * A disabled button given a `reason` stays focusable (aria-disabled + title) so the reason can be
   * read; without one it is natively disabled. `loading` swaps the label for `busyLabel`, sets
   * aria-busy and ignores clicks. Width is locked while loading so the row does not jump.
   */
  let {
    variant = 'secondary',
    size = 'default',
    type = 'button',
    disabled = false,
    reason = '',
    loading = false,
    busyLabel = 'Running…',
    confirming = false,
    onclick = () => {},
    children,
    ...rest
  } = $props();

  let el = $state(null);
  let lockedWidth = $state(null);
  $effect(() => {
    if (loading && el && lockedWidth === null) lockedWidth = el.getBoundingClientRect().width;
    if (!loading) lockedWidth = null;
  });

  const soft = $derived(disabled && !!reason);
  function handle(event) {
    if (disabled || loading) {
      event.preventDefault();
      return;
    }
    onclick(event);
  }
</script>

<button
  bind:this={el}
  {type}
  class="btn btn-{variant}"
  class:btn-sm={size === 'small'}
  class:btn-block={size === 'block'}
  class:is-confirming={confirming}
  disabled={disabled && !reason}
  aria-disabled={soft ? 'true' : undefined}
  aria-busy={loading ? 'true' : undefined}
  title={soft ? reason : undefined}
  style={lockedWidth ? `min-width:${lockedWidth}px` : undefined}
  onclick={handle}
  {...rest}
>
  {#if loading}{busyLabel}{:else}{@render children?.()}{/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    height: var(--control-h);
    padding: 0 var(--sp-4);
    border-radius: var(--r-1);
    border: 1px solid transparent;
    cursor: pointer;
    font-family: var(--font-ui);
    font-size: var(--fs-14);
    font-weight: var(--fw-bold);
    white-space: nowrap;
    transition: background-color var(--dur-1) var(--ease-out), border-color var(--dur-1) var(--ease-out), color var(--dur-1) var(--ease-out);
  }
  .btn-primary { background: var(--ember-500); color: var(--on-ember); border-color: var(--ember-700); }
  .btn-primary:hover { background: var(--ember-300); }
  .btn-primary:active { background: var(--ember-600); box-shadow: inset 0 2px 0 color-mix(in srgb, black 25%, transparent); }
  .btn-secondary { background: transparent; color: var(--brass-200); border-color: var(--brass-500); }
  .btn-secondary:hover { background: var(--brass-tint); border-color: var(--brass-400); }
  .btn-secondary:active { background: var(--surface-4); }
  .btn-ghost { background: transparent; color: var(--text-soft); border-color: var(--line-control); }
  .btn-ghost:hover { color: var(--text-ink); border-color: var(--line-control-hover); background: var(--surface-3); }
  .btn-ghost:active { background: var(--surface-4); }
  .btn-quiet { background: transparent; color: var(--text-soft); border-color: transparent; padding: 0 var(--sp-2); }
  .btn-quiet:hover { color: var(--text-ink); background: var(--surface-3); text-decoration: underline; }
  .btn-quiet:active { background: var(--surface-4); }
  .btn-danger { background: transparent; color: var(--verdict-down); border-color: color-mix(in srgb, var(--verdict-down) 55%, transparent); }
  .btn-danger:hover { background: var(--verdict-down-tint); }
  .btn-danger.is-confirming { background: var(--verdict-down); color: var(--on-ember); border-color: var(--verdict-down); }
  .btn-sm { height: 28px; padding: 0 var(--sp-3); font-size: var(--fs-12); }
  .btn-block { width: 100%; height: var(--hit); }
  .btn:disabled,
  .btn[aria-disabled='true'] {
    background: transparent;
    color: var(--text-disabled);
    border-color: var(--line-rule);
    cursor: not-allowed;
    text-decoration: none;
    box-shadow: none;
  }
  .btn[aria-busy='true'] { position: relative; overflow: hidden; pointer-events: none; }
  .btn[aria-busy='true']::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 2px;
    width: 40%;
    background: currentColor;
    animation: btn-run 1.2s var(--ease-out) infinite;
  }
  @keyframes btn-run { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
  @media (pointer: coarse), (max-width: 700px) {
    .btn { min-height: var(--hit); }
  }
</style>
