<script>
  /**
   * SpaceGroups.svelte - "Allowed to change" (ia.md §3.3 step 4): the search/space.js block toggles in six
   * groups with all/none per group and "Reset to defaults". `space` is a bindable full toggle map (an
   * unticked box is an explicit false in the request). The relic cap is not a choice: it is
   * model/legality.js relicSlotCap for the character's level and purchased slots, printed beside Relics.
   */
  import Chip from '../Chip.svelte';
  import Button from '../ui/Button.svelte';
  import { SPACE_GROUPS, setGroup, enabledCount, toggleTotal } from '../../lib/ui/optimiserView.js';
  import { SPACE_DEFAULTS } from '../../lib/search/space.js';

  let { space = $bindable(), relicCap = 0 } = $props();

  const flip = (key) => (space = { ...space, [key]: !space[key] });
  const groupOn = (g) => g.items.every(([k]) => space[k]);
  const groupOff = (g) => g.items.every(([k]) => !space[k]);
</script>

<div class="space" data-testid="space-picker">
  <div class="head">
    <span class="count"><span class="num">{enabledCount(space)}</span> of <span class="num">{toggleTotal}</span> parts may change</span>
    <Button variant="ghost" size="small" onclick={() => (space = { ...SPACE_DEFAULTS })}>Reset to defaults</Button>
    <Button variant="ghost" size="small" onclick={() => (space = setGroup(space, null, true))}>All</Button>
    <Button variant="ghost" size="small" onclick={() => (space = setGroup(space, null, false))}>None</Button>
  </div>
  {#each SPACE_GROUPS as g (g.id)}
    <div class="group" data-group={g.id}>
      <span class="cap-label">{g.label}</span>
      <div class="chips">
        {#each g.items as [key, label] (key)}
          <Chip {label} selected={space[key]} onClick={() => flip(key)} />
        {/each}
        {#if g.items.length > 1}
          <button type="button" class="link" disabled={groupOn(g)} onclick={() => (space = setGroup(space, g.id, true))}>all</button>
          <button type="button" class="link" disabled={groupOff(g)} onclick={() => (space = setGroup(space, g.id, false))}>none</button>
        {/if}
      </div>
      {#if g.id === 'relics'}
        <span class="note" data-testid="relic-cap">
          {relicCap > 0 ? `Fills up to ${relicCap} relic slots, the most this character has open.` : 'No relic slots are open at this level.'}
        </span>
      {/if}
    </div>
  {/each}
  <p class="note">Stone assignment uses only owned stones in the selected realm. Other presets sharing that gear set are affected. Gear items, stone rolls/levels, Awakening and pet/mount rolls stay fixed.</p>
</div>

<style>
  .space { display: grid; gap: var(--sp-3); }
  .head { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
  .count { flex: 1; font-size: var(--fs-12); color: var(--text-soft); }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .group { display: grid; gap: 4px; }
  .cap-label { font-size: var(--fs-11); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-muted); }
  .chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
  .link {
    background: none; border: 0; padding: 0 2px; min-height: 24px; cursor: pointer;
    color: var(--brass-400); font-size: var(--fs-12); text-decoration: underline; text-underline-offset: 3px;
  }
  .link:disabled { color: var(--text-muted); cursor: default; text-decoration: none; }
  .note { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
</style>
