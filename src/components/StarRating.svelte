<script>
  /**
   * StarRating.svelte - the mount star-level control.
   *
   * Renders `total` stars (5 for every mount, per BigReworkV1) but only the
   * first `available` are selectable: beyond that the catalogue has no
   * HP%/ATK% envelope, so those levels get Lucide's `star-off` icon and are
   * inert rather than letting you pick a level we can't price.
   *
   * `value` 0 means "not owned". Clicking the star that IS the current value
   * clears back to 0 - that's how a mount gets un-owned now the separate
   * `owned` checkbox is gone, and it works from any star, not just the first
   * (clicking the lit 2nd star of a 2-star mount is the natural way to do it).
   *
   * Accessibility: this is a radiogroup, not a row of clickable divs. Arrow
   * keys move between levels, Home/End jump to the ends, and roving tabindex
   * keeps the group a single tab stop. Each star carries a 44x44 hit area via
   * ::before even though the icon itself is smaller.
   */
  let {
    value = 0,
    total = 5,
    available = total,
    label = 'Star level',
    disabled = false,
    onchange = () => {},
  } = $props();

  const stars = $derived(Array.from({ length: total }, (_, i) => i + 1));
  const selectable = $derived(Math.max(0, Math.min(available, total)));

  function pick(star) {
    if (disabled || star > selectable) return;
    onchange(star === value ? 0 : star);
  }

  function onKeyDown(event) {
    if (disabled || selectable === 0) return;
    const key = event.key;
    let next = null;
    if (key === 'ArrowRight' || key === 'ArrowUp') next = Math.min(selectable, (value || 0) + 1);
    else if (key === 'ArrowLeft' || key === 'ArrowDown') next = Math.max(0, (value || 0) - 1);
    else if (key === 'Home') next = 0;
    else if (key === 'End') next = selectable;
    if (next === null) return;
    event.preventDefault();
    if (next !== value) onchange(next);
  }

  /** Roving tabindex: the selected star owns the tab stop (star 1 when empty). */
  function tabIndexFor(star) {
    if (selectable === 0) return -1;
    const focused = value >= 1 && value <= selectable ? value : 1;
    return star === focused ? 0 : -1;
  }
</script>

<div
  class="stars"
  role="radiogroup"
  aria-label={label}
  aria-disabled={disabled || selectable === 0 ? 'true' : undefined}
>
  {#each stars as star (star)}
    {@const locked = star > selectable}
    <button
      type="button"
      role="radio"
      class="star"
      class:filled={!locked && star <= value}
      class:locked
      aria-checked={star === value}
      aria-label={locked ? `${star} stars - no data` : `${star} ${star === 1 ? 'star' : 'stars'}`}
      tabindex={tabIndexFor(star)}
      disabled={disabled || locked}
      onclick={() => pick(star)}
      onkeydown={onKeyDown}
    >
      {#if locked}
        <!-- Lucide "star-off" -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8.34 8.34 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-.59-3.43" />
          <path d="M18.42 12.76 22 9.27l-6.91-1.01L12 2l-1.44 2.91" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </svg>
      {:else}
        <!-- Lucide "star" -->
        <svg viewBox="0 0 24 24" fill={star <= value ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z" />
        </svg>
      {/if}
    </button>
  {/each}
</div>

<style>
  .stars {
    display: flex;
    align-items: center;
    justify-content: center;
    /* No gap: each button owns a contiguous slice of the row, so there is no
       dead space between stars and no reason for hit areas to overlap. */
    gap: 0;
  }

  .star {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    /* The BUTTON is the hit area, 28x28 with a 20px icon inside it. An earlier
       version kept a 22px button and grew the target with `::before {
       inset: -11px }`, which made each area 44px wide on a 24px pitch - so the
       right 20px of every star was covered by its NEXT sibling (later siblings
       paint on top) and clicks landed on the wrong star. Hit areas must tile,
       not overlap. */
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    /* Unfilled stars read as "available but unset", not as the rarity colour. */
    color: var(--color-dim);
    transition: color 120ms ease-out, transform 120ms ease-out;
  }

  /* Reach the 44px touch height without widening (and so without overlapping). */
  .star::before {
    content: '';
    position: absolute;
    inset-block: -8px;
    inset-inline: 0;
  }

  .star svg {
    width: 20px;
    height: 20px;
  }

  /* The rarity hue is the fill signal - large-glyph use, so plain --rarity-fg. */
  .star.filled {
    color: var(--rarity-fg, var(--color-gold));
  }

  .star:not(:disabled):hover {
    color: var(--rarity-fg, var(--color-gold));
  }

  .star:active:not(:disabled) {
    transform: scale(0.92);
  }

  .star.locked {
    color: var(--color-border-strong);
    cursor: default;
  }

  @media (max-width: 700px) {
    /* Wider slices for fingertips - still tiling, still no overlap. */
    .star {
      width: 40px;
      height: 40px;
    }
    .star::before {
      inset-block: -2px;
      inset-inline: 0;
    }
    .star svg {
      width: 24px;
      height: 24px;
    }
  }
</style>
