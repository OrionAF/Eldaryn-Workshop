<script>
  /**
   * GearScreen.svelte - gear and enchant stones. The base realm edits Set 1 and Set 2 (9 slots
   * each, one shared stone pool); the Oblivion realm edits its single 12-slot loadout and its own
   * stone pool (gear.md §1/§8, stones.md §4). The `realm` prop pins the realm; without it, an
   * Oblivion-unlocked character gets a Base / Oblivion toggle.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { EQUIP_SETS } from '../../lib/model/equipment.js';
  import { BASE_SLOTS, slotsForRealm } from '../../lib/game/gear.js';
  import { STONE_TYPES } from '../../lib/game/stones.js';
  import Chip from '../Chip.svelte';
  import SlotSilhouette from '../gear/SlotSilhouette.svelte';
  import ItemEditor from '../gear/ItemEditor.svelte';
  import StoneGrid from '../gear/StoneGrid.svelte';
  import StoneForm from '../gear/StoneForm.svelte';
  import { STONE_COLOR, slotLabel } from '../gear/gearFormat.js';

  let { realm: realmProp = null } = $props();

  const character = $derived(rosterStore.current);
  let localRealm = $state('base');
  let baseSetKey = $state('set1');
  let selectedSlot = $state('WEAPON');
  let selectedStoneId = $state(null);

  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const realm = $derived(realmProp ?? (unlocked ? localRealm : 'base'));
  const setKey = $derived(realm === 'oblivion' ? 'oblivion' : baseSetKey);
  const setMeta = $derived(EQUIP_SETS.find((s) => s.key === setKey));
  const equip = $derived(character?.equipment[setKey]);
  const pool = $derived(realm === 'oblivion' ? character?.oblivionEnchantStones : character?.enchantStones);
  /** The sets whose sockets draw from this realm's stone pool. */
  const poolSets = $derived(
    EQUIP_SETS.filter((s) => s.realm === realm).map((s) => ({ key: s.key, label: s.label, enchantSlots: character.equipment[s.key].enchantSlots })),
  );
  const slot = $derived(slotsForRealm(realm).includes(selectedSlot) ? selectedSlot : 'WEAPON');
  const usedBy = $derived(
    realm === 'oblivion'
      ? []
      : character.presets.filter((p) => p.equipmentSet === (setKey === 'set2' ? 2 : 1)).map((p) => p.name),
  );

  /** Slot -> colour of the stone socketed there in the selected set (dot on the silhouette). */
  const stoneColors = $derived.by(() => {
    const out = {};
    for (const s of BASE_SLOTS) {
      const stone = pool?.find((x) => x.id === equip?.enchantSlots[s]);
      out[s] = stone ? STONE_COLOR[stone.type]?.color : null;
    }
    return out;
  });
  const equippedStoneId = $derived(BASE_SLOTS.includes(slot) ? (equip?.enchantSlots[slot] ?? null) : null);
  const socketable = $derived(BASE_SLOTS.includes(slot));

  function pickRealm(r) {
    localRealm = r;
    selectedStoneId = null;
  }
  function pickSet(k) {
    baseSetKey = k;
    selectedStoneId = null;
  }
</script>

{#if character}
  <div class="header-row">
    <h2>{realm === 'oblivion' ? 'Oblivion Gear' : 'Gear'}</h2>
    <div class="chip-list">
      {#if !realmProp && unlocked}
        <Chip label="Base" selected={realm === 'base'} onClick={() => pickRealm('base')} />
        <Chip label="Oblivion" selected={realm === 'oblivion'} onClick={() => pickRealm('oblivion')} />
      {/if}
      {#if realm === 'base'}
        {#each EQUIP_SETS.filter((s) => s.realm === 'base') as s (s.key)}
          <Chip label={s.label} selected={baseSetKey === s.key} onClick={() => pickSet(s.key)} />
        {/each}
      {/if}
    </div>
  </div>

  <div class="layout">
    <div class="silhouette-col">
      <SlotSilhouette
        items={equip.items}
        {realm}
        cls={character.class}
        label={setMeta.label}
        selectedSlot={slot}
        {stoneColors}
        onSelect={(s) => {
          selectedSlot = s;
          selectedStoneId = null;
        }}
      />
      {#if realm === 'oblivion'}
        <p class="used-by">One loadout. The rest of the active preset carries over into the Oblivion realm.</p>
      {:else if usedBy.length}
        <p class="used-by">{setMeta.label} is used by: {usedBy.join(', ')}</p>
      {:else}
        <p class="used-by">No presets use {setMeta.label} yet.</p>
      {/if}
    </div>

    <div class="field-col">
      <ItemEditor
        value={equip.items[slot]}
        {realm}
        {slot}
        class={character.class}
        onchange={(item) => rosterStore.setEquipmentItem(setKey, slot, item)}
      />

      <h3 class="subheading stones-heading">Enchant stones ({realm === 'oblivion' ? 'Oblivion pool' : 'shared by Set 1 and Set 2'})</h3>
      {#if socketable}
        <p class="socket-line">
          {slotLabel(character.class, slot)} socket:
          {#if equippedStoneId}
            <span class="mono">{STONE_TYPES.find((t) => t.enum === pool.find((s) => s.id === equippedStoneId)?.type)?.name ?? 'unknown'}</span>
          {:else}
            empty
          {/if}
        </p>
      {:else}
        <p class="socket-line">This slot has no stone socket (sockets are on the 9 base slots).</p>
      {/if}
      <div class="stones-layout">
        {#key realm}
          <StoneForm
            {realm}
            stones={pool}
            cls={character.class}
            {setKey}
            setLabel={setMeta.label}
            selectedSlot={slot}
            canSocket={socketable}
            {selectedStoneId}
            onSelect={(id) => (selectedStoneId = id)}
          />
        {/key}
        <StoneGrid
          stones={pool}
          sets={poolSets}
          cls={character.class}
          {selectedStoneId}
          {equippedStoneId}
          onSelect={(id) => (selectedStoneId = id)}
        />
      </div>
    </div>
  </div>
{/if}

<style>
  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
  }
  .header-row h2 {
    margin: 0;
  }
  .chip-list {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .layout {
    display: grid;
    grid-template-columns: 300px 1fr;
    gap: var(--space-6);
  }
  @media (max-width: 700px) {
    .layout {
      grid-template-columns: 1fr;
    }
    .silhouette-col {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
    }
  }
  .used-by {
    font-size: 11px;
    color: var(--color-dim);
    margin-top: var(--space-3);
  }
  .field-col {
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 16px 18px;
    min-width: 0;
  }
  .stones-heading {
    margin: var(--space-4) 0 var(--space-2);
  }
  .socket-line {
    font-size: 12px;
    color: var(--color-dim);
    margin: 0 0 var(--space-2);
  }
  .stones-layout {
    display: grid;
    grid-template-columns: minmax(12rem, 16rem) 1fr;
    gap: var(--space-4);
    align-items: start;
  }
  @media (max-width: 700px) {
    .stones-layout {
      grid-template-columns: 1fr;
    }
  }
</style>
