<script>
  /**
   * GlyphPickerModal.svelte - choose the glyph for ONE socket of one mount.
   *
   * Lists the inventory glyphs of the socket's tier. Sealed glyphs are shown but disabled (they must be unlocked in
   * the inventory first; Game/mounts-glyphs.md §8). Majors the class/specs cannot use are not offered at all. A glyph
   * already socketed on another mount can still be picked (the same instance may sit on several mounts); the
   * list notes where else it is.
   */
  import { glyphTypeInfo, majorGlyphAllowed } from '../../lib/model/glyphs.js';
  import { glyphImage } from '../../lib/assets/glyphs.js';
  import Modal from '../Modal.svelte';
  import { TIER_LABELS, glyphText, rarityClass } from './mountsView.js';

  let { open = $bindable(false), mountName = '', tier = 'minor', index = 0, current = null, glyphs = [], playerClass = null, specs = [], whereIs = () => null, onPick } = $props();

  const options = $derived(
    glyphs.filter((g) => {
      const info = glyphTypeInfo(g.glyphType);
      return info?.tier === tier && (tier !== 'major' || majorGlyphAllowed(g.glyphType, playerClass, specs));
    }),
  );

  function pick(id) {
    onPick(id);
    open = false;
  }
</script>

<Modal bind:open title="{TIER_LABELS[tier]} socket {index + 1} - {mountName}">
  {#snippet children()}
    {#if options.length === 0}
      <p class="empty">No usable {TIER_LABELS[tier].toLowerCase()} glyphs in your inventory.</p>
    {:else}
      <ul class="options">
        {#each options as glyph (glyph.id)}
          {@const where = whereIs(glyph.id)}
          {@const src = glyphImage(tier, glyph.rarity)}
          <li>
            <button
              type="button"
              class="option rarity-card {rarityClass(glyph.rarity)}"
              class:on={glyph.id === current}
              disabled={glyph.sealed}
              aria-pressed={glyph.id === current}
              onclick={() => pick(glyph.id)}
            >
              {#if src}<img {src} alt="" />{/if}
              <span class="option-text">
                <span class="option-rarity">{glyph.rarity}</span>
                <span class="option-label">{glyphText(glyph)}</span>
                {#if glyph.sealed}<span class="note">Unlock it in the inventory first</span>{:else if where && glyph.id !== current}<span class="note">Also on {where}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/snippet}
  {#snippet footer()}
    <button type="button" class="btn-ghost" disabled={!current} onclick={() => pick(null)}>Empty this socket</button>
  {/snippet}
</Modal>

<style>
  .empty {
    color: var(--color-muted);
    font-size: 12px;
    margin: 0;
  }
  .options {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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
    opacity: 0.45;
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
  }
  .note {
    font-size: 10px;
    color: var(--color-warning);
  }
</style>
