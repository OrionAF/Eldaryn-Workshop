<script>
  /**
   * SpacePicker.svelte - which build dimensions the search may change (F2b). `space` is a bindable full
   * toggle map (SPACE_DEFAULTS shape): the request sends every key, so an unticked box is an explicit false.
   */
  import Chip from '../Chip.svelte';

  let { space = $bindable() } = $props();

  const TOGGLES = [
    ['equipmentSet', 'Gear set'],
    ['talentSet', 'Talent set'],
    ['talents', 'Talent points'],
    ['pet', 'Pet'],
    ['mount', 'Mount'],
    ['glyphs', 'Glyphs'],
    ['relics', 'Relics'],
    ['sigils', 'Sigils'],
    ['utility', 'Utility sigil'],
    ['ancient', 'Ancient sigil'],
    ['conditions', 'Sigil conditions'],
    ['transcendence', 'Transcendence'],
  ];
  const flip = (key) => (space = { ...space, [key]: !space[key] });
</script>

<div class="space" data-testid="space-picker">
  <span class="micro-label">Allowed to change</span>
  <div class="chip-list">
    {#each TOGGLES as [key, label] (key)}
      <Chip {label} selected={space[key]} onClick={() => flip(key)} />
    {/each}
  </div>
  <label class="slots">
    <span class="micro-label">Relic slots to fill</span>
    <input
      class="mono"
      type="number"
      min="1"
      max="4"
      value={space.relicSlots}
      disabled={!space.relics}
      onchange={(e) => (space = { ...space, relicSlots: Math.max(1, Math.min(4, Math.floor(Number(e.currentTarget.value)) || 4)) })}
    />
  </label>
  <p class="hint">Gear contents, stones, levels, awakening and pet/mount stats are never changed.</p>
</div>

<style>
  .space { display: flex; flex-direction: column; gap: 6px; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .slots { display: flex; align-items: center; gap: var(--space-2); }
  .slots input { width: 64px; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
</style>
