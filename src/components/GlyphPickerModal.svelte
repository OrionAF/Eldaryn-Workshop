<script>
  /**
   * GlyphPickerModal.svelte - choose which glyphs sit on ONE mount.
   *
   * The six slots on a mount card are typed: 3 Minor, 2 Major, 1 Mythic
   * (SOURCE_DEFS.glyphs.tierCaps). Caps are per mount, so a glyph already
   * carried by three other mounts still fits here - there's no limit on how
   * many mounts share a glyph.
   *
   * A tier whose slots are full greys out its remaining options rather than
   * letting the click fail silently.
   */
  import { SOURCE_DEFS, rarityClass } from '../lib/constants.js';
  import { glyphImage } from '../lib/assets.js';
  import { majorGlyphById } from '../lib/glyphsData.js';
  import { formatPct } from '../lib/format.js';
  import { STAT_FIELDS } from '../lib/constants.js';
  import Modal from './Modal.svelte';

  let { open = $bindable(false), mount, glyphs = [], onToggle } = $props();

  const TIER_CAPS = SOURCE_DEFS.find((d) => d.key === 'glyphs').tierCaps;
  const TIER_LABELS = { minor: 'Minor', major: 'Major', mythic: 'Mythic' };

  const equipped = $derived(new Set(mount?.glyphIds || []));

  function countInTier(tier) {
    return (mount?.glyphIds || []).filter((id) => glyphs.find((g) => g.id === id)?.tier === tier).length;
  }

  function groupsFor() {
    return Object.keys(TIER_CAPS)
      .map((tier) => ({
        tier,
        cap: TIER_CAPS[tier],
        used: countInTier(tier),
        items: glyphs.filter((g) => g.tier === tier),
      }))
      .filter((group) => group.items.length > 0);
  }

  function label(glyph) {
    const major = majorGlyphById(glyph.special);
    if (major) return `${major.name} · ${major.description}`;
    const stat = STAT_FIELDS.find((f) => f.key === glyph.statKey)?.label ?? glyph.statKey;
    return `+${formatPct(glyph.value)}% ${stat}`;
  }
</script>

<Modal bind:open title={mount ? `Glyphs — ${mount.name}` : 'Glyphs'}>
  {#snippet children()}
    {#if !glyphs.length}
      <p class="empty">No glyphs in your inventory yet — add some below the mount grid.</p>
    {:else}
      {#each groupsFor() as group (group.tier)}
        {@const full = group.used >= group.cap}
        <section class="tier-group">
          <h4 class="micro-label">{TIER_LABELS[group.tier]} — {group.used}/{group.cap}</h4>
          <ul class="options">
            {#each group.items as glyph (glyph.id)}
              {@const on = equipped.has(glyph.id)}
              <li>
                <button
                  type="button"
                  class="option rarity-card {rarityClass(glyph.rarity)}"
                  class:on
                  disabled={!on && full}
                  aria-pressed={on}
                  onclick={() => onToggle(glyph.id, !on)}
                >
                  {#if glyphImage(glyph.tier, glyph.rarity)}
                    <img src={glyphImage(glyph.tier, glyph.rarity)} alt="" />
                  {/if}
                  <span class="option-text">
                    <span class="option-rarity">{glyph.rarity}</span>
                    <span class="option-label">{label(glyph)}</span>
                  </span>
                  <span class="check" aria-hidden="true">{on ? '✓' : ''}</span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
    {/if}
  {/snippet}
</Modal>

<style>
  .empty {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .tier-group {
    margin-bottom: var(--space-4);
  }
  .tier-group:last-child {
    margin-bottom: 0;
  }
  .options {
    list-style: none;
    margin: var(--space-2) 0 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: var(--space-2);
  }
  .option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 6px 8px;
    cursor: pointer;
    text-align: left;
    color: var(--color-ink);
  }
  .option:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .option.on {
    outline: 2px solid var(--color-gold);
    outline-offset: -2px;
  }
  .option img {
    width: 30px;
    height: 30px;
    object-fit: contain;
    flex: 0 0 auto;
  }
  .option-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }
  .option-rarity {
    font-size: 9.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--rarity-fg-strong, var(--color-muted));
  }
  .option-label {
    font-size: 11px;
    color: var(--color-soft);
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .check {
    color: var(--color-gold);
    flex: 0 0 auto;
  }
</style>
