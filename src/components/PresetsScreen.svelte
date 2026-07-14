<script>
  /**
   * PresetsScreen.svelte - the home screen (replaces the old Profile Stats
   * tab). Preset cards + an editor panel for whichever preset is selected,
   * plus a strip linking out to the character-wide screens (Mount & Glyphs,
   * Awakening, Transcendence) that every preset shares.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { TRANSCENDENCE_TREES } from '../lib/transcendenceData.js';
  import { effectiveUnlockedSet, totalIchorSpent } from '../lib/transcendence.js';
  import PresetCard from './PresetCard.svelte';
  import PresetEditor from './PresetEditor.svelte';

  let { setStatus, onNavigate } = $props();

  const character = $derived(rosterStore.current);

  // Selection lives on the character (persisted) so it survives screen and
  // character switches; the fallback covers a null/stale activePresetId.
  const editingId = $derived(character.activePresetId ?? character.presets[0]?.id ?? null);
  const editingPreset = $derived(
    character.presets.find((p) => p.id === editingId) ?? character.presets[0] ?? null
  );

  function selectForEdit(id) {
    rosterStore.setActivePreset(id);
  }

  function addPreset() {
    rosterStore.addPreset(); // addPreset makes the new preset active
  }

  function onDeleted() {
    // rosterStore.deletePreset already re-points activePresetId
  }

  // Which mount is ridden is per-preset (preset.mountId); the tile summarises
  // how many catalogue mounts have stats entered instead.
  const mountsWithStats = $derived(character.mounts.entries.filter((m) => m.baseHpPct || m.baseAtkPct).length);
  const equippedGlyphCount = $derived(character.glyphs.entries.filter((g) => g.equipped).length);
  const tree = $derived(TRANSCENDENCE_TREES[character.class]);
  const nodesPlaced = $derived(tree ? effectiveUnlockedSet(character.transcendence.unlockedPositions).size : 0);
  const ichorSpent = $derived(tree ? totalIchorSpent(character.transcendence.unlockedPositions, tree) : 0);
  const awakeningLabel = $derived(
    character.awakening.path === 'shadow' ? 'Shadow Path' : character.awakening.path === 'radiant' ? 'Radiant Path' : null
  );
</script>

<div class="header-row">
  <h2>Presets</h2>
  <button type="button" class="new-preset-btn" onclick={addPreset}>+ New Preset</button>
</div>

<div class="preset-grid">
  {#each character.presets as preset (preset.id)}
    <PresetCard {preset} {character} editing={preset.id === editingId} onSelect={() => selectForEdit(preset.id)} />
  {/each}
  <button type="button" class="new-preset-card" onclick={addPreset}>
    <span class="plus">+</span>
    <span class="title">New preset</span>
    <span class="sub">pick a loadout, talents, pet &amp; relics</span>
  </button>
</div>

{#if editingPreset}
  <PresetEditor preset={editingPreset} {character} {setStatus} {onDeleted} />
{/if}

<div class="character-wide-strip">
  <div class="strip-label">
    <span class="label-text">CHARACTER-WIDE</span>
    <span class="sub">shared by every preset</span>
    <span class="strip-fill"></span>
  </div>
  <div class="tiles">
    <button type="button" class="tile" onclick={() => onNavigate?.('mounts')}>
      <div class="tile-head">
        <span class="dot mounts"></span>
        <span class="tile-title">Mount &amp; Glyphs</span>
      </div>
      <span class="tile-primary">{mountsWithStats}/{character.mounts.entries.length} mounts entered</span>
      <span class="tile-detail">glyphs {equippedGlyphCount}/6 · ridden mount is chosen per preset</span>
    </button>
    <button type="button" class="tile" onclick={() => onNavigate?.('awakening')}>
      <div class="tile-head">
        <span class="dot awakening"></span>
        <span class="tile-title">Awakening</span>
      </div>
      {#if awakeningLabel}
        <span class="tile-primary">{character.awakening.points} / 15 · {awakeningLabel}</span>
      {:else}
        <span class="tile-primary">No path</span>
        <span class="tile-detail">choose Shadow or Radiant</span>
      {/if}
    </button>
    <button type="button" class="tile" onclick={() => onNavigate?.('transcendence')}>
      <div class="tile-head">
        <span class="dot transcendence"></span>
        <span class="tile-title">Transcendence</span>
      </div>
      <span class="tile-primary">{nodesPlaced} node{nodesPlaced === 1 ? '' : 's'}</span>
      <span class="tile-detail">{ichorSpent} ichor spent · one build per character</span>
    </button>
  </div>
</div>

<style>
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-4);
  }
  .header-row h2 {
    font-size: 16px;
    letter-spacing: 0.14em;
    margin: 0;
  }
  .new-preset-btn {
    font-size: 12px;
    font-weight: 600;
    color: var(--color-gold-light);
    border: 1px solid var(--color-gold);
    border-radius: 7px;
    padding: 6px 14px;
    background: none;
  }
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 14px;
  }
  .new-preset-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px dashed var(--color-border-strong);
    border-radius: var(--radius-panel);
    background: transparent;
    color: var(--color-muted);
    min-height: 130px;
  }
  .new-preset-card .plus {
    font-size: 22px;
    color: var(--color-dim);
  }
  .new-preset-card .title {
    font-size: 12px;
    color: var(--color-muted);
  }
  .new-preset-card .sub {
    font-size: 10.5px;
    color: var(--color-dim);
  }
  .character-wide-strip {
    margin-top: var(--space-8);
  }
  .strip-label {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .label-text {
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    color: var(--color-dim);
  }
  .strip-label .sub {
    font-size: 10.5px;
    color: var(--color-dim);
  }
  .strip-fill {
    height: 1px;
    flex: 1;
    background: var(--color-border);
    align-self: center;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 14px 16px;
    text-align: left;
  }
  .tile:hover {
    border-color: var(--color-border-strong);
  }
  .tile-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
  }
  .dot.mounts {
    background: var(--nav-mounts);
  }
  .dot.awakening {
    background: var(--nav-awakening);
  }
  .dot.transcendence {
    background: var(--nav-transcendence);
  }
  .tile-title {
    font-weight: 700;
    font-size: 12px;
  }
  .tile-primary {
    font-size: 16px;
    font-weight: 700;
    color: var(--color-ink);
  }
  .tile-detail {
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--color-muted);
  }
</style>
