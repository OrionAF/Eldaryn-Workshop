<script>
  /**
   * MountCard.svelte - one owned mount instance (copied from the v1 card, rebuilt on the v2 instance shape).
   *
   * A mount is { species, rarity, baseHp, baseAtk, level, glyphs }. baseHp/baseAtk are the level-1 rolls in percent
   * points; the contribution when ridden is round(base * (1 + 0.1 * (level - 1))) (Game/mounts-glyphs.md §5).
   * The sliders span the species' level-1 roll envelope (§3, derived), widened if a saved value falls outside it.
   * Six socket buttons (3 minor / 2 major / 1 mythic) open the glyph picker.
   */
  import { mountBySpecies } from '../../lib/game/mountsGlyphs.js';
  import { MOUNT_MAX_LEVEL, mountEffectiveStats, mountRollBounds } from '../../lib/model/mounts.js';
  import { glyphTypeInfo } from '../../lib/model/glyphs.js';
  import { mountImage } from '../../lib/assets/mounts.js';
  import { glyphImage } from '../../lib/assets/glyphs.js';
  import StarRating from '../StarRating.svelte';
  import Slider from '../Slider.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import { SOCKET_LAYOUT, TIER_LABELS, glyphText, rarityClass } from './mountsView.js';

  let { mount, glyphs = [], riddenBy = [], activePresetName = null, ridingActive = false, onPatch, onRide, onSocket, onRemove } = $props();

  const species = $derived(mountBySpecies(mount.species));
  const bounds = $derived(mountRollBounds(mount.species));
  const hpRange = $derived([Math.min(bounds.hp[0], mount.baseHp), Math.max(bounds.hp[1], mount.baseHp)]);
  const atkRange = $derived([Math.min(bounds.atk[0], mount.baseAtk), Math.max(bounds.atk[1], mount.baseAtk)]);
  const effective = $derived(mountEffectiveStats(mount));
  const art = $derived(mountImage(mount.species));
  const glyphById = $derived(new Map(glyphs.map((g) => [g.id, g])));

  const slots = $derived(
    SOCKET_LAYOUT.flatMap(({ tier, count }) =>
      Array.from({ length: count }, (_, index) => {
        const glyph = glyphById.get(mount.glyphs[tier][index]) ?? null;
        return { tier, index, glyph, label: glyph ? glyphText(glyph) : 'Empty' };
      }),
    ),
  );
</script>

<div class="mount-card rarity-card {rarityClass(mount.rarity)}" data-mount-id={mount.id}>
  <h3 class="rarity-title">{species?.name ?? mount.species}</h3>
  <span class="rarity-badge badge">{mount.rarity}</span>

  {#if art}
    <img class="mount-art" src={art} alt="" loading="lazy" />
  {/if}

  <StarRating
    value={mount.level}
    total={MOUNT_MAX_LEVEL}
    label="{species?.name ?? mount.species} level"
    onchange={(level) => level > 0 && onPatch({ level })}
  />

  <div class="stat-block">
    <span class="stat-label">Base Health: <span class="stat-num">{mount.baseHp}</span>%</span>
    <div class="slider-row">
      <span class="bound">{hpRange[0]}</span>
      <Slider min={hpRange[0]} max={hpRange[1]} step={1} value={mount.baseHp} ariaLabel="{species?.name} base health percent" oninput={(v) => onPatch({ baseHp: v })} />
      <span class="bound">{hpRange[1]}</span>
    </div>
  </div>
  <div class="stat-block">
    <span class="stat-label">Base Attack: <span class="stat-num">{mount.baseAtk}</span>%</span>
    <div class="slider-row">
      <span class="bound">{atkRange[0]}</span>
      <Slider min={atkRange[0]} max={atkRange[1]} step={1} value={mount.baseAtk} ariaLabel="{species?.name} base attack percent" oninput={(v) => onPatch({ baseAtk: v })} />
      <span class="bound">{atkRange[1]}</span>
    </div>
  </div>

  <p class="effective" aria-label="Ridden bonus">
    Ridden: <span class="stat-num">+{effective.hpPercent}%</span> HP, <span class="stat-num">+{effective.attackPercent}%</span> ATK
  </p>

  <div class="sockets" role="group" aria-label="Glyph sockets">
    {#each slots as slot (slot.tier + slot.index)}
      {@const info = slot.glyph ? glyphTypeInfo(slot.glyph.glyphType) : null}
      <button
        type="button"
        class="socket"
        class:filled={!!slot.glyph}
        title={slot.label}
        aria-label="{TIER_LABELS[slot.tier]} socket {slot.index + 1}: {slot.label}"
        onclick={() => onSocket(slot.tier, slot.index)}
      >
        {#if slot.glyph && info}
          {@const src = glyphImage(info.tier, slot.glyph.rarity)}
          {#if src}<img src={src} alt="" />{:else}<span class="socket-dot"></span>{/if}
        {/if}
      </button>
    {/each}
  </div>

  <div class="card-foot">
    <button type="button" class="btn-ghost ride" aria-pressed={ridingActive} disabled={!activePresetName} onclick={onRide}>
      {ridingActive ? `Riding (${activePresetName})` : activePresetName ? `Ride with ${activePresetName}` : 'No preset'}
    </button>
    <ConfirmButton class="btn-danger" label="Remove" confirmLabel="Confirm remove" onConfirm={onRemove} />
  </div>
  {#if riddenBy.length > 0}
    <p class="ridden-by">Used by: {riddenBy.join(', ')}</p>
  {/if}
</div>

<style>
  .mount-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
  }
  .badge {
    align-self: center;
  }
  .mount-art {
    display: block;
    width: 96px;
    height: 96px;
    margin: 0 auto;
    object-fit: contain;
    border-radius: var(--radius-field);
  }
  .stat-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .stat-label,
  .effective {
    font-size: 11.5px;
    color: var(--color-soft);
    margin: 0;
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
  .sockets {
    display: flex;
    gap: var(--space-1);
    justify-content: center;
    padding-top: var(--space-2);
    border-top: 1px solid var(--color-border-hairline);
  }
  .socket {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: var(--radius-field);
    border: 1px dashed var(--color-border-strong);
    background: var(--color-inset);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
  }
  .socket:hover {
    border-color: var(--color-gold);
  }
  .socket.filled {
    border-style: solid;
    border-color: var(--color-gold);
  }
  .socket img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .socket-dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-pill);
    background: var(--color-gold);
  }
  .card-foot {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
  }
  .ridden-by {
    margin: 0;
    font-size: 10.5px;
    color: var(--color-muted);
  }
  @media (max-width: 700px) {
    .socket {
      width: 40px;
      height: 40px;
    }
  }
</style>
