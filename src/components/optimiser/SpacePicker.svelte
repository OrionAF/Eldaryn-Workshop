<script>
  /**
   * SpacePicker.svelte - which build blocks the search may change (F2b). `space` is a bindable full
   * toggle map (search/space.js SPACE_DEFAULTS shape): the request sends every key, so an unticked box is an explicit false.
   */
  import Chip from '../Chip.svelte';

  let { space = $bindable() } = $props();

  // search/space.js BLOCKS; the relic cap is model/legality.js relicSlotCap, not a choice.
  const TOGGLES = [
    ['equipmentSet', 'Gear set'],
    ['spec', 'Talent set'],
    ['talents', 'Talent points'],
    ['pet', 'Pet'],
    ['mount', 'Mount'],
    ['minorGlyphs', 'Minor glyphs'],
    ['majorGlyphs', 'Major glyphs'],
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
  <p class="hint">Gear contents, stones, levels, awakening and pet/mount stats are never changed.</p>
</div>

<style>
  .space { display: flex; flex-direction: column; gap: 6px; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
</style>
