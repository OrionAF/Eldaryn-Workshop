<script>
  /**
   * GlyphCard.svelte - one glyph in the inventory grid.
   *
   * Minor glyphs show their rolled secondary stat; major glyphs show the
   * resolved effect plus the sigil it retunes - which matters because a major
   * glyph is INERT unless that sigil is equipped on the preset AND the glyph
   * sits on the mount that preset rides (BigReworkV1 decision D2). When either
   * gate fails the card says so rather than silently doing nothing.
   *
   * Remove is the expanding two-step from app.css (.btn-danger.is-expanding):
   * the button grows across the footer and asks for confirmation, and any
   * click elsewhere (blur) backs out.
   */
  import { STAT_FIELDS, rarityClass } from '../lib/constants.js';
  import { glyphImage } from '../lib/assets.js';
  import { formatPct } from '../lib/format.js';

  let {
    glyph,
    major = null,
    sigilName = null,
    sigilEquipped = true,
    mountCount = 0,
    onEquippedIn,
    onRemove,
  } = $props();

  let confirming = $state(false);

  const art = $derived(glyphImage(glyph.tier, glyph.rarity));
  const statLabel = $derived(STAT_FIELDS.find((f) => f.key === glyph.statKey)?.label ?? glyph.statKey);
  const inert = $derived(!!major && !sigilEquipped);

  function handleRemove() {
    if (!confirming) {
      confirming = true;
      return;
    }
    confirming = false;
    onRemove();
  }
</script>

<div class="glyph-card rarity-card {rarityClass(glyph.rarity)}" class:inert>
  <span class="rarity-badge {rarityClass(glyph.rarity)}">{glyph.rarity}</span>

  {#if art}
    <img class="glyph-art" src={art} alt="" loading="lazy" />
  {/if}

  {#if major}
    <p class="glyph-name">{major.name}</p>
    <p class="effect">{major.description}</p>
    <p class="sigil-line" class:missing={!sigilEquipped}>
      {sigilName ?? major.sigilId}{#if !sigilEquipped}&nbsp;— not equipped{/if}
    </p>
    {#if !major.observed}
      <p class="estimated" title="Extrapolated from the observed rarities of this glyph">estimated values</p>
    {/if}
  {:else}
    <p class="effect">+{formatPct(glyph.value)}% {statLabel}</p>
  {/if}

  <div class="card-foot">
    {#if !confirming}
      <!-- Names the thing you'll be choosing (mounts) and how many already
           carry it, instead of the vaguer "Equipped in...". -->
      <button type="button" class="btn-ghost" onclick={onEquippedIn}>
        {mountCount > 0 ? `On ${mountCount} mount${mountCount === 1 ? '' : 's'}` : 'Add to mount'}
      </button>
    {/if}
    <button
      type="button"
      class="btn-danger is-expanding"
      class:is-confirming={confirming}
      onclick={handleRemove}
      onblur={() => (confirming = false)}
    >
      {confirming ? 'Confirm remove' : 'Remove'}
    </button>
  </div>
</div>

<style>
  .glyph-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    padding: var(--space-2);
    text-align: center;
  }

  /* A major glyph whose sigil isn't equipped does nothing - show that. */
  .glyph-card.inert {
    opacity: 0.6;
  }

  .glyph-art {
    display: block;
    width: 48px;
    height: 48px;
    object-fit: contain;
    outline: 1px solid rgba(0, 0, 0, 0.25);
    outline-offset: -1px;
    border-radius: var(--radius-field);
  }

  .glyph-name {
    margin: 0;
    font-size: 11.5px;
    font-weight: 600;
    color: var(--rarity-fg-strong, var(--color-ink));
  }

  .effect {
    margin: 0;
    font-size: 11px;
    color: var(--color-soft);
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
  }

  .sigil-line {
    margin: 0;
    font-size: 10px;
    color: var(--color-muted);
  }
  .sigil-line.missing {
    color: var(--color-warning);
  }

  .estimated {
    margin: 0;
    font-size: 9.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--color-dim);
  }

  .card-foot {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    margin-top: auto;
    padding-top: 5px;
  }
  .card-foot button {
    font-size: 10px;
    padding: 3px 6px;
  }
  .card-foot .btn-ghost {
    flex: 1;
    min-width: 0;
  }
</style>
