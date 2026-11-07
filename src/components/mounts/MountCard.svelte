<script>
  /**
   * MountCard.svelte - one owned mount instance (copied from the v1 card, rebuilt on the v2 instance shape).
   *
   * A mount is { species, rarity, baseHp, baseAtk, level, glyphs }. baseHp/baseAtk are the level-1 rolls in percent
   * points; the contribution when ridden is round(base * (1 + 0.1 * (level - 1))) (Game/mounts-glyphs.md §5).
   * The fields and slider ends show that contribution at the mount's level, as the game's mount list does; a typed
   * value is stored as the roll that gives it (mountBaseForValue). The sliders step through the species' level-1
   * roll envelope (§3, derived), widened if a saved value falls outside it.
   * Six socket buttons (3 minor / 2 major / 1 mythic, grouped and captioned by tier) open the glyph picker.
   * Each stat is one compact row (name, field, then the slider), the level-1 rolls sit on one line under them,
   * and the footer is pinned, so every card in a row has the same shape whatever its level.
   */
  import { mountBySpecies } from '../../lib/game/mountsGlyphs.js';
  import { MOUNT_MAX_LEVEL, mountEffectiveStats, mountRollBounds, mountStatAtLevel, mountBaseForValue } from '../../lib/model/mounts.js';
  import { glyphTypeInfo } from '../../lib/model/glyphs.js';
  import { mountImage } from '../../lib/assets/mounts.js';
  import { glyphImage } from '../../lib/assets/glyphs.js';
  import StarRating from '../StarRating.svelte';
  import Slider from '../Slider.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import PresetMenu from '../character/PresetMenu.svelte';
  import { SOCKET_LAYOUT, TIER_LABELS, glyphText, rarityClass } from './mountsView.js';

  let { mount, glyphs = [], presets = [], onPatch, onRide, onSocket, onRemove } = $props();

  const species = $derived(mountBySpecies(mount.species));
  const bounds = $derived(mountRollBounds(mount.species));
  const hpRange = $derived([Math.min(bounds.hp[0], mount.baseHp), Math.max(bounds.hp[1], mount.baseHp)]);
  const atkRange = $derived([Math.min(bounds.atk[0], mount.baseAtk), Math.max(bounds.atk[1], mount.baseAtk)]);
  const effective = $derived(mountEffectiveStats(mount));
  const atLevel = (base) => mountStatAtLevel(base, mount.level);
  const art = $derived(mountImage(mount.species));
  const rideItems = $derived(presets.map((p) => ({ id: p.id, label: p.name, checked: p.mountId === mount.id, meta: p.mountId && p.mountId !== mount.id ? 'rides another' : '' })));
  const glyphById = $derived(new Map(glyphs.map((g) => [g.id, g])));

  const socketGroups = $derived(
    SOCKET_LAYOUT.map(({ tier, count }) => ({
      tier,
      slots: Array.from({ length: count }, (_, index) => {
        const glyph = glyphById.get(mount.glyphs[tier][index]) ?? null;
        return { tier, index, glyph, label: glyph ? glyphText(glyph) : 'Empty' };
      }),
    })),
  );
  const stats = $derived([
    { key: 'hp', name: 'Health', value: effective.hpPercent, base: mount.baseHp, range: hpRange, patch: (v) => ({ baseHp: v }) },
    { key: 'atk', name: 'Attack', value: effective.attackPercent, base: mount.baseAtk, range: atkRange, patch: (v) => ({ baseAtk: v }) },
  ]);
</script>

<div class="mount-card rarity-card {rarityClass(mount.rarity)}" data-mount-id={mount.id}>
  <h3 class="card-title">{species?.name ?? mount.species}</h3>
  <span class="badge">{mount.rarity}</span>

  {#if art}
    <img class="mount-art" src={art} alt="" loading="lazy" />
  {/if}

  <StarRating
    value={mount.level}
    total={MOUNT_MAX_LEVEL}
    label="{species?.name ?? mount.species} level"
    onchange={(level) => level > 0 && onPatch({ level })}
  />

  <div class="stats">
    {#each stats as st (st.key)}
      <div class="stat-row">
        <span class="stat-name" aria-hidden="true">{st.name}</span>
        <NumberField label={st.name} hideLabel value={st.value} min={0} unit="%" onchange={(v) => onPatch(st.patch(mountBaseForValue(v, mount.level)))} />
        <div class="slider-row">
          <span class="bound">{atLevel(st.range[0])}</span>
          <Slider min={st.range[0]} max={st.range[1]} step={1} value={st.base} ariaLabel="{species?.name} {st.name.toLowerCase()} percent" ariaValueText="{st.value}%" oninput={(v) => onPatch(st.patch(v))} />
          <span class="bound">{atLevel(st.range[1])}</span>
        </div>
      </div>
    {/each}
    <p class="roll" data-testid="mount-roll" title="The stored rolls; the fields show them at level {mount.level}, as the game does">
      Level 1 roll: <span class="stat-num">{mount.baseHp}%</span> HP · <span class="stat-num">{mount.baseAtk}%</span> ATK
    </p>
  </div>

  <div class="sockets" role="group" aria-label="Glyph sockets">
    {#each socketGroups as group (group.tier)}
      <div class="socket-group">
        <div class="socket-row">
          {#each group.slots as slot (slot.index)}
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
        <span class="socket-tier" aria-hidden="true">{TIER_LABELS[group.tier]}</span>
      </div>
    {/each}
  </div>

  <div class="card-foot">
    <PresetMenu label="Ridden in" items={rideItems} onselect={(id) => onRide(id)} />
    <ConfirmButton variant="danger" size="small" label="Remove" confirmLabel="Confirm remove" onConfirm={onRemove} />
  </div>
</div>

<style>
  .mount-card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding: var(--sp-3);
    min-width: 0;
  }
  .card-title { margin: 0; font-family: var(--font-display); font-size: var(--fs-14); text-align: center; color: var(--r-up, var(--text-ink)); }
  .badge {
    align-self: center;
    padding: 1px var(--sp-2);
    border: 1px solid var(--line-control);
    border-radius: var(--r-pill);
    color: var(--r-up, var(--text-muted));
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
  }
  .mount-art { display: block; width: 96px; height: 96px; margin: 0 auto; object-fit: contain; border-radius: var(--r-2); }
  .stats { display: grid; gap: var(--sp-2); min-width: 0; }
  /* name | field on one line, the slider over the roll range under them */
  .stat-row { display: grid; grid-template-columns: minmax(0, 1fr) 5.5rem; align-items: center; gap: 2px var(--sp-2); min-width: 0; }
  .stat-name { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .roll { margin: 0; font-size: var(--fs-11); color: var(--text-muted); }
  .stat-num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-soft); }
  .slider-row { grid-column: 1 / -1; display: grid; grid-template-columns: 3ch minmax(0, 1fr) 3ch; align-items: center; gap: var(--sp-2); min-width: 0; }
  .bound { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: var(--fs-11); color: var(--text-muted); text-align: center; }
  .sockets { display: flex; gap: var(--sp-3); justify-content: center; padding-top: var(--sp-2); border-top: 2px solid var(--frame-mount); }
  .socket-group { display: grid; justify-items: center; gap: 2px; }
  .socket-row { display: flex; gap: var(--sp-1); }
  .socket-tier { font-size: var(--fs-11); line-height: 1.2; color: var(--text-muted); }
  .socket {
    width: 32px;
    height: 32px;
    padding: 0;
    border-radius: var(--r-2);
    border: 1px dashed var(--line-control);
    background: var(--surface-1);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    cursor: pointer;
  }
  .socket:hover { border-color: var(--brass-400); }
  .socket.filled { border-style: solid; border-color: var(--brass-400); }
  .socket img { width: 100%; height: 100%; object-fit: contain; }
  .socket-dot { width: 10px; height: 10px; border-radius: var(--r-pill); background: var(--brass-400); }
  .card-foot { display: flex; gap: var(--sp-2); align-items: center; justify-content: space-between; margin-top: auto; padding-top: var(--sp-2); border-top: 1px solid var(--line-hairline); }
  .card-foot :global(.preset-menu) { min-width: 0; }
  .card-foot :global(.preset-menu > button) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 700px) {
    .socket { width: var(--hit); height: var(--hit); }
  }
</style>
