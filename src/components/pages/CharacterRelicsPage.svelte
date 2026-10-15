<script>
  /**
   * CharacterRelicsPage.svelte (C8) - the class's relics by tier. Levels and the purchased slot count
   * are character-wide; which presets equip a relic is chosen here through "Equipped in" (each preset
   * named, capped at the slots the level and purchases allow) and primarily in the Loadout page.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { relicsForClass, RELIC_BASE_SLOTS, RELIC_MAX_EXTRA_SLOTS } from '../../lib/game/relics.js';
  import { relicStatAt, relicStatLabel, formatRelicStat } from '../../lib/model/relics.js';
  import { relicSlotCap } from '../../lib/model/legality.js';
  import { classLabel } from '../../lib/game/classes.js';
  import { relicUsers } from '../../lib/build/usage.js';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Banner from '../ui/Banner.svelte';
  import PresetMenu from '../character/PresetMenu.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const TIERS = [
    ['bronze', 'Bronze'],
    ['silver', 'Silver'],
    ['gold', 'Gold'],
  ];
  const SLOT_OPTIONS = Array.from({ length: RELIC_MAX_EXTRA_SLOTS + 1 }, (_, i) => ({
    value: RELIC_BASE_SLOTS + i,
    label: `${RELIC_BASE_SLOTS + i} slots`,
  }));

  const character = $derived(rosterStore.current);
  const defs = $derived(character?.class ? relicsForClass(character.class) : []);
  const cap = $derived(relicSlotCap(character?.level, character?.extraRelicSlots));
  let slotChoice = $derived(RELIC_BASE_SLOTS + (character?.extraRelicSlots ?? 0));

  const levelOf = (id) => character.relics[id] ?? 0;

  function menuItems(def) {
    const owned = levelOf(def.id) > 0;
    return character.presets.map((p) => {
      const on = p.relicIds.includes(def.id);
      const full = !on && p.relicIds.length >= cap;
      return {
        id: p.id,
        label: p.name,
        checked: on,
        disabled: !on && (!owned || full),
        meta: on ? `${p.relicIds.length}/${cap}` : !owned ? 'not owned' : full ? `full ${p.relicIds.length}/${cap}` : `${p.relicIds.length}/${cap}`,
      };
    });
  }
</script>

{#if !character?.class}
  <EmptyState title="Choose a class first" text="Relics depend on the character's class.">
    {#snippet action()}<Button onclick={() => onNavigate('character/overview')}>Go to Overview</Button>{/snippet}
  </EmptyState>
{:else}
  <Panel title="Relics" scope="character">
    {#snippet meta()}<span class="sub">{classLabel(character.class)} · levels are character-wide</span>{/snippet}
    <div class="slots-row">
      <Select
        label="Relic slots"
        options={SLOT_OPTIONS}
        bind:value={slotChoice}
        hint="Slots bought in the game: 2 base + up to {RELIC_MAX_EXTRA_SLOTS}. Every preset may equip this many."
        onchange={(v) => rosterStore.setExtraRelicSlots(Number(v) - RELIC_BASE_SLOTS)}
      />
      <span class="cap num" data-testid="relic-cap">Cap {cap}</span>
    </div>
    {#if cap === 0}
      <Banner variant="info">Relics unlock at level 22; none can be equipped before then.</Banner>
    {/if}
    <ul class="presets" aria-label="Relics equipped per preset">
      {#each character.presets as p (p.id)}
        <li class:over={p.relicIds.length > cap}><span>{p.name}</span> <span class="num">{p.relicIds.length}/{cap}</span></li>
      {/each}
    </ul>
  </Panel>

  {#each TIERS as [tier, label] (tier)}
    <section class="tier-section">
      <h3 class="subheading">{label}</h3>
      {#each defs.filter((d) => d.tier === tier) as def (def.id)}
        {@const level = levelOf(def.id)}
        {@const used = relicUsers(character, def.id)}
        <div class="relic-row" data-relic={def.id}>
          <div class="relic-title">
            <span class="relic-name">{def.name}</span>
            <span class="relic-level-badge num">LV {level}/{def.maxLevel}</span>
          </div>
          <div class="rank-controls">
            <button type="button" aria-label="Lower {def.name}" disabled={level <= 0} onclick={() => rosterStore.setRelicLevel(def.id, level - 1)}>&minus;</button>
            <button type="button" aria-label="Raise {def.name}" disabled={level >= def.maxLevel} onclick={() => rosterStore.setRelicLevel(def.id, level + 1)}>+</button>
            <button type="button" class="btn-ghost" aria-label="Max {def.name}" disabled={level >= def.maxLevel} onclick={() => rosterStore.setRelicLevel(def.id, def.maxLevel)}>Max</button>
          </div>
          <span class="relic-stats">
            {#each def.bonuses as b (b.stat)}
              <span class="relic-stat">{formatRelicStat(b.stat, relicStatAt(b, Math.max(level, 1), def.maxLevel))} {relicStatLabel(b.stat)}</span>
            {/each}
            {#if level === 0}<span class="at-one">shown at level 1</span>{/if}
          </span>
          <PresetMenu label="Equipped in" items={menuItems(def)} onselect={(id) => rosterStore.togglePresetRelic(id, def.id)} />
          <span class="used-by">{used.length ? used.join(', ') : '—'}</span>
        </div>
      {/each}
    </section>
  {/each}
{/if}

<style>
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .slots-row { display: flex; align-items: flex-end; gap: var(--sp-4); flex-wrap: wrap; margin-bottom: var(--sp-3); }
  .slots-row :global(.field) { min-width: 12rem; }
  .cap { color: var(--text-soft); }
  .presets { display: flex; flex-wrap: wrap; gap: var(--sp-2) var(--sp-4); list-style: none; margin: var(--sp-3) 0 0; padding: 0; font-size: var(--fs-13); color: var(--text-soft); }
  .presets .over { color: var(--status-warn, var(--text-ink)); }
  .tier-section { margin-top: var(--sp-4); }
  .relic-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--sp-3);
    padding: var(--sp-2) var(--sp-3);
    background: var(--surface-2);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-1);
    margin-bottom: var(--sp-1);
  }
  .relic-title { flex: 1; display: flex; align-items: baseline; gap: var(--sp-2); min-width: 8rem; }
  .relic-name { font-weight: var(--fw-bold); }
  .relic-level-badge { color: var(--text-muted); font-size: var(--fs-12); }
  .rank-controls { display: flex; gap: var(--sp-1); }
  .relic-stats { display: flex; flex-direction: column; align-items: flex-end; min-width: 180px; text-align: right; color: var(--tier-gold); font-size: var(--fs-12); font-family: var(--font-data); }
  .at-one { color: var(--text-muted); font-family: var(--font-ui); }
  .used-by { font-size: var(--fs-12); color: var(--text-muted); min-width: 110px; text-align: right; }
</style>
