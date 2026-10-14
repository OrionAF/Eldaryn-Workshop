<script>
  /**
   * PickCard.svelte - a loadout choice with art and a radio dot (design-system §4.23 variants).
   * role=radio; put several inside a `role="radiogroup"` the caller labels. Selection is by click,
   * Enter or Space; arrow-key movement between cards is the group's job.
   */
  let { name, meta = '', art = null, checked = false, disabled = false, tabindex = undefined, onselect = () => {} } = $props();
</script>

<button
  type="button"
  class="pick"
  role="radio"
  aria-checked={checked}
  aria-disabled={disabled ? 'true' : undefined}
  {tabindex}
  onclick={() => !disabled && onselect()}
>
  {#if art}<img src={art} alt="" />{:else}<span class="noart" aria-hidden="true"></span>{/if}
  <span class="text">
    <span class="name">{name}</span>
    {#if meta}<span class="meta">{meta}</span>{/if}
  </span>
  <span class="radio-dot" aria-hidden="true"></span>
</button>

<style>
  .pick {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) auto;
    gap: var(--sp-3);
    align-items: center;
    width: 100%;
    padding: var(--sp-2) var(--sp-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-2);
    background: var(--surface-3);
    color: inherit;
    font-family: var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .pick:hover { background: var(--surface-4); border-color: var(--line-control-hover); }
  .pick[aria-checked='true'] { background: var(--surface-4); border-color: var(--ember-500); box-shadow: 0 0 0 1px var(--ember-500); }
  .pick[aria-disabled='true'] { opacity: 0.6; cursor: not-allowed; }
  img, .noart { width: 48px; height: 48px; object-fit: contain; }
  .text { display: grid; min-width: 0; }
  .name { font-weight: var(--fw-bold); color: var(--text-ink); }
  .meta { font-size: var(--fs-12); color: var(--text-soft); }
  .radio-dot { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-control); display: grid; place-items: center; }
  .pick[aria-checked='true'] .radio-dot { border-color: var(--ember-500); }
  .pick[aria-checked='true'] .radio-dot::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--ember-500); }
</style>
