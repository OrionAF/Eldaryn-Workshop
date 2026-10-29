<script>
  /**
   * CharacterGearPage.svelte - C3: gear and enchant stones (ia.md §5.9). Sub-tabs Set 1 / Set 2 / Oblivion,
   * each with an Equipment tab (paper doll + item editor + socket line) and an Enchant stones tab.
   * The base realm edits Set 1 and Set 2 (9 slots each, one shared stone pool); the Oblivion realm
   * edits its single 12-slot loadout and its own stone pool (gear.md §1/§8, stones.md §4). The
   * `realm` prop pins the realm and hides the set tabs.
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { EQUIP_SETS } from '../../lib/model/equipment.js';
  import { dropAscension } from '../../lib/model/drop.js';
  import { BASE_SLOTS, slotsForRealm } from '../../lib/game/gear.js';
  import { STONE_TYPES } from '../../lib/game/stones.js';
  import Tabs from '../ui/Tabs.svelte';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import SlotSilhouette from '../gear/SlotSilhouette.svelte';
  import ItemEditor from '../gear/ItemEditor.svelte';
  import StoneGrid from '../gear/StoneGrid.svelte';
  import StoneForm from '../gear/StoneForm.svelte';
  import { STONE_COLOR, slotLabel, statLabel, formatStatValue } from '../gear/gearFormat.js';

  // `tab` is the optional third hash segment: 'stones' opens the Enchant stones tab.
  let { realm: realmProp = null, tab = null } = $props();

  const character = $derived(rosterStore.current);
  let setTab = $state('set1');
  let view = $state('equipment');
  let selectedSlot = $state('WEAPON');
  let selectedStoneId = $state(null);
  let filterType = $state('');
  let sortBy = $state('default');

  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const setKey = $derived(realmProp === 'oblivion' ? 'oblivion' : setTab === 'oblivion' && !unlocked ? 'set1' : setTab);
  const realm = $derived(setKey === 'oblivion' ? 'oblivion' : 'base');
  const setMeta = $derived(EQUIP_SETS.find((s) => s.key === setKey));
  const equip = $derived(character?.equipment[setKey]);
  const pool = $derived(realm === 'oblivion' ? character?.oblivionEnchantStones : character?.enchantStones);
  /** The sets whose sockets draw from this realm's stone pool. */
  const poolSets = $derived(
    EQUIP_SETS.filter((s) => s.realm === realm).map((s) => ({ key: s.key, label: s.label, enchantSlots: character.equipment[s.key].enchantSlots })),
  );
  const slot = $derived(slotsForRealm(realm).includes(selectedSlot) ? selectedSlot : 'WEAPON');
  const usersOf = (key) =>
    key === 'oblivion' ? [] : character.presets.filter((p) => p.equipmentSet === (key === 'set2' ? 2 : 1)).map((p) => p.name);
  const usedBy = $derived(usersOf(setKey));

  const setTabs = $derived([
    { id: 'set1', label: 'Set 1', sub: usersOf('set1').length ? `used by ${usersOf('set1').join(', ')}` : 'unused' },
    { id: 'set2', label: 'Set 2', sub: usersOf('set2').length ? `used by ${usersOf('set2').join(', ')}` : 'unused' },
    { id: 'oblivion', label: 'Oblivion', sub: unlocked ? 'own loadout and stones' : undefined, disabled: !unlocked, reason: 'Unlock Oblivion on Overview first' },
  ]);
  const viewTabs = $derived([
    { id: 'equipment', label: 'Equipment' },
    { id: 'stones', label: 'Enchant stones', count: pool.length },
  ]);

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
  const equippedStone = $derived(pool.find((s) => s.id === equippedStoneId) ?? null);
  const socketable = $derived(BASE_SLOTS.includes(slot));
  const typeName = (t) => STONE_TYPES.find((x) => x.enum === t)?.name ?? t;
  const typeOptions = $derived([
    { value: '', label: 'All types' },
    ...STONE_TYPES.filter((t) => (realm === 'oblivion' ? t.enum === 'OBLIVION' : t.enum !== 'OBLIVION')).map((t) => ({ value: t.enum, label: t.name })),
  ]);

  // Switching sets inside a realm keeps the stone selection (the pool is shared); switching realms cannot.
  let lastRealm = untrack(() => realm);
  $effect(() => {
    if (realm !== lastRealm) {
      lastRealm = realm;
      selectedStoneId = null;
      filterType = '';
    }
  });
  $effect(() => {
    if (selectedStoneId && !pool.some((s) => s.id === selectedStoneId)) selectedStoneId = null;
  });
  $effect(() => {
    if (tab === 'stones') view = 'stones';
  });
</script>

{#if character}
  {#if realmProp === 'oblivion'}
    <h2 class="pinned-title">Oblivion Gear</h2>
  {:else}
    <Tabs items={setTabs} bind:value={setTab} label="Equipment sets" idPrefix="gear-set" />
  {/if}
  <p class="scope-line">
    {#if realm === 'oblivion'}
      One loadout. The rest of the active preset carries over into the Oblivion realm.
    {:else if usedBy.length}
      {setMeta.label} is used by: {usedBy.join(', ')}
    {:else}
      No presets use {setMeta.label} yet.
    {/if}
  </p>

  <Tabs items={viewTabs} bind:value={view} label="Gear sections" idPrefix="gear-view" />

  {#if view === 'equipment'}
    <div class="layout" role="tabpanel" id="gear-view-panel-equipment">
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
          }}
        />
      </div>

      <Panel title={slotLabel(character.class, slot)} scope={realm === 'oblivion' ? 'oblivion' : null}>
        <div class="editor">
          <ItemEditor
            value={equip.items[slot]}
            {realm}
            {slot}
            class={character.class}
            ascension={dropAscension(character) || null}
            onchange={(item) => rosterStore.setEquipmentItem(setKey, slot, item)}
          />
        </div>
        {#snippet footer()}
          <div class="socket-foot">
            {#if !socketable}
              <span class="muted">This slot has no stone socket (sockets are on the 9 base slots).</span>
            {:else if equippedStone}
              <span class="socket-line">
                {slotLabel(character.class, slot)} socket: <strong>{typeName(equippedStone.type)}</strong>
                {#if !equippedStone.activated}<em>(inactive)</em>{/if}
                {#each equippedStone.stats as st (st.type)}
                  <span class="mono stat">{statLabel(st.type)} {formatStatValue(st.type, st.value)}</span>
                {/each}
              </span>
              <Button variant="ghost" size="small" onclick={() => rosterStore.unsocketStone(setKey, slot)}>Unsocket</Button>
              <Button
                variant="ghost"
                size="small"
                onclick={() => {
                  selectedStoneId = equippedStone.id;
                  view = 'stones';
                }}>Change</Button
              >
            {:else}
              <span class="socket-line">{slotLabel(character.class, slot)} socket: empty</span>
              <Button variant="ghost" size="small" onclick={() => (view = 'stones')}>Choose a stone</Button>
            {/if}
          </div>
        {/snippet}
      </Panel>
    </div>
  {:else}
    <div role="tabpanel" id="gear-view-panel-stones">
      <Panel title={realm === 'oblivion' ? 'Oblivion stones' : 'Stones for Set 1 and Set 2'} scope={realm === 'oblivion' ? 'oblivion' : null}>
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
          <div class="grid-col">
            <div class="grid-controls">
              <Select label="Type" options={typeOptions} bind:value={filterType} />
              <Select
                label="Sort"
                options={[
                  { value: 'default', label: 'Socketed, then rarity' },
                  { value: 'quality', label: 'Quality' },
                  { value: 'roll', label: 'Roll grade' },
                ]}
                bind:value={sortBy}
              />
            </div>
            <StoneGrid
              stones={pool}
              sets={poolSets}
              cls={character.class}
              {selectedStoneId}
              {equippedStoneId}
              typeFilter={filterType}
              {sortBy}
              onSelect={(id) => (selectedStoneId = id)}
            />
          </div>
        </div>
      </Panel>
    </div>
  {/if}
{/if}

<style>
  .pinned-title { margin: 0 0 var(--sp-3); }
  .scope-line { font-size: var(--fs-12); color: var(--text-muted); margin: var(--sp-2) 0 var(--sp-3); }
  .layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: var(--sp-6); margin-top: var(--sp-3); }
  .silhouette-col { min-width: 0; }
  .socket-foot { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); }
  .socket-line { font-size: var(--fs-13); color: var(--text-soft); display: inline-flex; flex-wrap: wrap; gap: var(--sp-2); align-items: baseline; }
  .stat { color: var(--text-muted); font-size: var(--fs-12); }
  .muted { color: var(--text-muted); font-size: var(--fs-12); }
  .stones-layout { display: grid; grid-template-columns: minmax(12rem, 16rem) minmax(0, 1fr); gap: var(--sp-4); align-items: start; margin-top: var(--sp-1); }
  .grid-col { display: grid; gap: var(--sp-3); min-width: 0; }
  .grid-controls { display: flex; flex-wrap: wrap; gap: var(--sp-3); }
  @media (max-width: 700px) {
    .layout, .stones-layout { grid-template-columns: 1fr; }
    .silhouette-col { display: flex; flex-direction: column; align-items: center; text-align: center; }
  }
</style>
