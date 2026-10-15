<script>
  /**
   * LoadoutRelics.svelte - B2 relic tray (ia.md §5.7): slots up to the character's cap (2 plus bought
   * extras, none below the unlock level), then the class's relics to pick from. A relic at level 0 cannot
   * be equipped and links to Relics. The cap message is inline and explains what to do.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { relicsForClass, relicById } from '../../lib/game/relics.js';
  import { relicSlotCap, UNLOCK_LEVELS } from '../../lib/model/legality.js';
  import Panel from '../ui/Panel.svelte';
  import ItemTile from '../ui/ItemTile.svelte';
  import { relicImage } from '../../lib/assets.js';

  let { character, preset } = $props();

  const cap = $derived(relicSlotCap(character.level, character.extraRelicSlots));
  const defs = $derived(relicsForClass(character.class));
  const equipped = $derived(preset.relicIds.map((id) => relicById(id)).filter(Boolean));
  let error = $state('');

  function toggle(def) {
    const has = preset.relicIds.includes(def.id);
    if (!has && preset.relicIds.length >= cap) {
      error = `All ${cap} relic slots are full. Remove a relic first${cap < 4 ? ', or buy more slots in Relics' : ''}.`;
      return;
    }
    error = '';
    rosterStore.togglePresetRelic(preset.id, def.id);
  }
</script>

<Panel title="Relics" scope="preset">
  {#snippet meta()}<span class="note"><span class="num">{preset.relicIds.length}</span> of <span class="num">{cap}</span> slots</span>{/snippet}
  {#if cap === 0}
    <p class="hint">Relics unlock at level {UNLOCK_LEVELS.RELICS}.</p>
  {:else}
    <div class="slots" aria-label="Relic slots">
      {#each Array.from({ length: cap }, (_, i) => i) as i (i)}
        {#if equipped[i]}
          <div class="slot filled" data-testid="relic-slot">{equipped[i].name} <span class="num">Lv{character.relics[equipped[i].id] ?? 0}</span></div>
        {:else}
          <div class="slot empty" data-testid="relic-slot">Empty</div>
        {/if}
      {/each}
    </div>
    <div class="grid" role="group" aria-label="Relics">
      {#each defs as def (def.id)}
        {@const lv = character.relics[def.id] ?? 0}
        {@const on = preset.relicIds.includes(def.id)}
        <div class="cell">
          <ItemTile name={def.name} art={relicImage(def.tier)} selected={on} disabled={lv === 0 && !on} onclick={() => toggle(def)}>
            {#snippet meta()}Level {lv}{/snippet}
          </ItemTile>
          {#if lv === 0 && !on}<a class="hint" href="#/character/relics">Level 0: set on Relics</a>{/if}
        </div>
      {/each}
    </div>
    {#if error}<p class="err" role="alert">{error}</p>{/if}
  {/if}
</Panel>

<style>
  .slots { display: flex; gap: var(--sp-2); flex-wrap: wrap; }
  .slot { padding: var(--sp-2) var(--sp-3); border: 1px solid var(--line-control); border-radius: var(--r-1); font-size: var(--fs-13); }
  .slot.empty { border-style: dashed; color: var(--text-muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: var(--sp-2); }
  .cell { display: grid; gap: var(--sp-1); }
  .hint, .note { font-size: var(--fs-12); color: var(--text-muted); }
  .err { margin: 0; color: var(--verdict-down); font-size: var(--fs-12); }
  .num { font-family: var(--font-data); }
</style>
