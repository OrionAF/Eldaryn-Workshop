<script>
  /**
   * VerdictChip.svelte - glyph plus word (design-system §4.13). The word carries the meaning; the
   * glyph is decorative. Only `better` and `worse` take up/down colour: pending, estimate,
   * inconclusive, equivalent and remainder states are neutral or muted.
   * `verdict` is a Contrast verdict ('better' | 'worse' | 'equivalent' | 'unresolved') or one of
   * 'remainder' | 'pending' | 'queued', or a win-rate goal standing: 'meets' | 'below' | 'open' (optimiserView targetStanding). `label` overrides the word (e.g. "Upgrade · Set 1").
   */
  let { verdict = 'unresolved', label = '' } = $props();
  const KINDS = {
    better: ['▲', 'Significant', 'up'],
    worse: ['▼', 'Downgrade', 'down'],
    equivalent: ['◆', 'Equivalent', 'side'],
    unresolved: ['≈', 'Inconclusive', 'side'],
    remainder: ['', 'Remainder', 'muted'],
    meets: ['✓', 'Meets target', 'up'],
    below: ['', 'Below target', 'side'],
    open: ['≈', 'Target unresolved', 'side'],
    pending: ['', 'Simulating…', 'pending'],
    queued: ['', 'Queued', 'pending'],
  };
  const k = $derived(KINDS[verdict] ?? KINDS.unresolved);
</script>

<span class="vchip {k[2]}">
  {#if k[0]}<span class="g" aria-hidden="true">{k[0]}</span>{/if}{label || k[1]}
</span>

<style>
  .vchip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 8px;
    border-radius: var(--r-1);
    border: 1px solid var(--line-control);
    font-size: var(--fs-12);
    font-weight: var(--fw-bold);
    white-space: nowrap;
    color: var(--verdict-side);
  }
  .up { color: var(--verdict-up); background: var(--verdict-up-tint); border-color: var(--verdict-up); }
  .down { color: var(--verdict-down); background: var(--verdict-down-tint); border-color: var(--verdict-down); }
  .muted { color: var(--text-muted); font-weight: var(--fw-medium); border-style: dotted; }
  .pending { color: var(--text-muted); font-weight: var(--fw-medium); background: transparent; }
</style>
