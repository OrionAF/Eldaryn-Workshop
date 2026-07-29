<script>
  /**
   * MountCard.svelte - one mount in the Mounts grid.
   *
   * Ownership is the star level: star 0 = not owned, and the Health/Attack
   * readouts and sliders only exist once a star is picked (BigReworkV1). Every
   * mount renders five stars; the ones past the catalogue's data render as
   * `star-off` and can't be clicked, because we'd have no HP%/ATK% envelope to
   * bound their sliders with.
   *
   * The sliders are flanked by the star's own min/max, so the numbers you can
   * actually roll are visible without dragging.
   */
  import { mountById, mountStarLevels, mountStarRange } from '../lib/mountsData.js';
  import { rarityClass } from '../lib/constants.js';
  import { mountImage } from '../lib/assets.js';
  import { formatPct } from '../lib/format.js';
  import StarRating from './StarRating.svelte';
  import Slider from './Slider.svelte';

  let { mount, glyphs = [], totalStars = 5, onStar, onValue, onOpenGlyphs } = $props();

  const def = $derived(mountById(mount.id));
  const available = $derived(mountStarLevels(def).length);
  const range = $derived(mountStarRange(def, mount.star || mountStarLevels(def)[0] || 1));
  const art = $derived(mountImage(mount.id));
  const owned = $derived(mount.star > 0);
  const slots = $derived(Array.from({ length: 6 }, (_, i) => glyphs[i] ?? null));
</script>

<div class="mount-card rarity-card {rarityClass(mount.rarity)}" class:owned>
  <h3 class="rarity-title">{mount.name}</h3>

  {#if art}
    <img class="mount-art" src={art} alt="" loading="lazy" />
  {/if}

  <StarRating
    value={mount.star}
    total={totalStars}
    {available}
    label="{mount.name} star level"
    onchange={(star) => onStar(star)}
  />

  {#if owned}
    <div class="stat-block">
      <span class="stat-label">Health: <span class="stat-num">{formatPct(mount.hpPct)}</span>%</span>
      <div class="slider-row">
        <span class="bound">{range.hp[0]}</span>
        <Slider
          min={range.hp[0]}
          max={range.hp[1]}
          step={1}
          value={mount.hpPct}
          ariaLabel="{mount.name} health percent"
          oninput={(v) => onValue('hpPct', v)}
        />
        <span class="bound">{range.hp[1]}</span>
      </div>
    </div>

    <div class="stat-block">
      <span class="stat-label">Attack: <span class="stat-num">{formatPct(mount.atkPct)}</span>%</span>
      <div class="slider-row">
        <span class="bound">{range.atk[0]}</span>
        <Slider
          min={range.atk[0]}
          max={range.atk[1]}
          step={1}
          value={mount.atkPct}
          ariaLabel="{mount.name} attack percent"
          oninput={(v) => onValue('atkPct', v)}
        />
        <span class="bound">{range.atk[1]}</span>
      </div>
    </div>

    <div class="glyph-row">
      <button type="button" class="btn-ghost glyph-button" onclick={onOpenGlyphs}>Glyphs</button>
      <div class="glyph-slots">
        {#each slots as slot, i (i)}
          <span class="glyph-slot" class:filled={!!slot} title={slot?.label ?? 'Empty slot'}>
            {#if slot?.art}
              <img src={slot.art} alt={slot.label} />
            {/if}
          </span>
        {/each}
      </div>
    </div>
  {:else}
    <p class="not-owned">not owned — pick a star level</p>
  {/if}
</div>

<style>
  .mount-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }

  /* Unowned mounts recede: desaturated art and a muted frame. */
  .mount-card:not(.owned) {
    border-color: var(--color-border);
    background: var(--color-inset);
  }
  .mount-card:not(.owned) .mount-art {
    filter: grayscale(1);
    opacity: 0.45;
  }
  .mount-card:not(.owned) .rarity-title {
    color: var(--color-muted);
  }

  .mount-art {
    display: block;
    width: 96px;
    height: 96px;
    margin: 0 auto;
    object-fit: contain;
    outline: 1px solid rgba(0, 0, 0, 0.25);
    outline-offset: -1px;
    border-radius: var(--radius-field);
  }

  .not-owned {
    margin: 0;
    text-align: center;
    font-size: 11.5px;
    color: var(--color-muted);
  }

  .stat-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-label {
    font-size: 11.5px;
    color: var(--color-soft);
  }
  .stat-num {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    color: var(--color-ink);
  }
  .slider-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .slider-row :global(.slider) {
    flex: 1;
    min-width: 0;
  }
  .bound {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 10px;
    color: var(--color-dim);
    min-width: 18px;
    text-align: center;
  }

  .glyph-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-top: auto;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-hairline);
  }
  .glyph-button {
    flex: 0 0 auto;
  }
  .glyph-slots {
    display: flex;
    gap: 3px;
    flex: 1;
    justify-content: flex-end;
  }
  .glyph-slot {
    width: 22px;
    height: 22px;
    border-radius: var(--radius-field);
    border: 1px dashed var(--color-border);
    background: var(--color-inset);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .glyph-slot.filled {
    border-style: solid;
    border-color: var(--color-gold);
  }
  .glyph-slot img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  @media (max-width: 700px) {
    .glyph-slot {
      width: 28px;
      height: 28px;
    }
  }
</style>
