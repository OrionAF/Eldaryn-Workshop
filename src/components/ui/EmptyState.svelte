<script>
  /** EmptyState.svelte - brass diamond, title, one sentence, one action (design-system §4.22). */
  let { title, text = '', icon, action } = $props();
</script>

<div class="empty">
  <span class="glyph" aria-hidden="true"><span>{#if icon}{@render icon()}{:else}◇{/if}</span></span>
  <b>{title}</b>
  {#if text}<p>{text}</p>{/if}
  {#if action}<div class="act">{@render action()}</div>{/if}
</div>

<style>
  .empty {
    display: grid;
    justify-items: center;
    text-align: center;
    gap: var(--sp-2);
    padding: var(--sp-6) var(--sp-4);
    color: var(--text-soft);
  }
  .glyph {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px dashed var(--brass-500);
    transform: rotate(45deg);
    color: var(--brass-400);
  }
  .glyph > span { transform: rotate(-45deg); }
  b { color: var(--text-ink); font-size: var(--fs-14); }
  p { margin: 0; font-size: var(--fs-13); max-width: 40ch; }
  .act { margin-top: var(--sp-2); }
</style>
