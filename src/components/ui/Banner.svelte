<script>
  /**
   * Banner.svelte - static inline notice (design-system §4.36). Error uses role=alert, the rest
   * role=status. The glyph is decorative; the lead word carries the meaning.
   */
  let { variant = 'info', lead = '', onclose = null, children, action } = $props();
  const GLYPH = { info: 'ⓘ', warn: '⚠', error: '✕', estimate: '≈', success: '✓' };
</script>

<div class="banner {variant}" role={variant === 'error' ? 'alert' : 'status'}>
  <span class="glyph" aria-hidden="true">{GLYPH[variant] ?? GLYPH.info}</span>
  <div class="text">
    {#if lead}<b>{lead}</b>{' '}{/if}{@render children?.()}
  </div>
  <div class="side">
    {@render action?.()}
    {#if onclose}<button type="button" class="close" aria-label="Dismiss" onclick={onclose}>×</button>{/if}
  </div>
</div>

<style>
  .banner {
    --bn: var(--status-info);
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    gap: var(--sp-3);
    align-items: start;
    padding: var(--sp-3);
    background: var(--surface-1);
    border: 1px solid var(--line-rule);
    border-left: 3px solid var(--bn);
    border-radius: var(--r-1);
    font-size: var(--fs-13);
    color: var(--text-soft);
  }
  .banner.success { --bn: var(--verdict-up); }
  .banner.warn { --bn: var(--status-warn); }
  .banner.error { --bn: var(--verdict-down); }
  .banner.estimate { --bn: var(--text-muted); border-left-style: dotted; }
  .glyph { color: var(--bn); line-height: 1.3; }
  b { color: var(--text-ink); }
  .side { display: flex; gap: var(--sp-2); align-items: center; }
  .close { background: none; border: 0; color: var(--text-soft); font-size: var(--fs-16); cursor: pointer; min-width: 24px; min-height: 24px; }
  .close:hover { color: var(--text-ink); }
</style>
