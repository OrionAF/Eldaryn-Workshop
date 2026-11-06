<script>
  /**
   * CharacterRelicsPage.svelte (C8) - the class's relics by tier. Levels and the purchased slot count
   * are character-wide; which presets equip a relic is chosen here through "Equipped in" (each preset
   * named, capped at the slots the level and purchases allow) and primarily in the Loadout page.
   * Lowering the slot count trims every preset's relics through reconcile, so the page names what
   * would be dropped and asks first.
   * Every relic row shares one column grid (name, level, effects, Equipped in), so the steppers, effects and
   * menus line up down the page; a relic at level 0 shows its level 1 effect, faded.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { relicsForClass, relicById, RELIC_BASE_SLOTS, RELIC_MAX_EXTRA_SLOTS } from '../../lib/game/relics.js';
  import { relicImage } from '../../lib/assets/relics.js';
  import { relicStatAt, relicStatLabel, formatRelicStat } from '../../lib/model/relics.js';
  import { relicSlotCap } from '../../lib/model/legality.js';
  import { classLabel } from '../../lib/game/classes.js';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Banner from '../ui/Banner.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Modal from '../Modal.svelte';
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
  const slotChoice = $derived(RELIC_BASE_SLOTS + (character?.extraRelicSlots ?? 0));
  let slotKey = $state(0); // remounts the select to show the stored count again after a cancel
  let pendingSlots = $state(null); // { count, trims: [{ preset, relics }] } while the dialog is open
  let trimOpen = $state(false);

  /** What a slot count of `count` would drop: every preset's relics past the new cap (reconcile keeps the first ones). */
  function trimsFor(count) {
    const newCap = relicSlotCap(character.level, count - RELIC_BASE_SLOTS);
    return character.presets
      .filter((p) => p.relicIds.length > newCap)
      .map((p) => ({ preset: p.name, relics: p.relicIds.slice(newCap).map((id) => relicById(id)?.name ?? id) }));
  }
  function onSlots(value) {
    const count = Number(value);
    const trims = trimsFor(count);
    if (trims.length === 0) return rosterStore.setExtraRelicSlots(count - RELIC_BASE_SLOTS);
    pendingSlots = { count, trims };
    trimOpen = true;
  }
  function confirmSlots() {
    rosterStore.setExtraRelicSlots(pendingSlots.count - RELIC_BASE_SLOTS);
    cancelSlots();
  }
  function cancelSlots() {
    trimOpen = false;
    pendingSlots = null;
    slotKey += 1;
  }

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
    <div class="field-row slots-row">
      <div class="slots-field">
        {#key slotKey}
          <Select label="Relic slots" options={SLOT_OPTIONS} value={slotChoice} onchange={onSlots} />
        {/key}
      </div>
      <div class="control-align readout">
        <span class="cap num" data-testid="relic-cap">Cap {cap}</span>
        <ul class="presets" aria-label="Relics equipped per preset">
          {#each character.presets as p (p.id)}
            <li class:over={p.relicIds.length > cap}><span class="p-name">{p.name}</span> <span class="num">{p.relicIds.length}/{cap}</span></li>
          {/each}
        </ul>
      </div>
    </div>
    <p class="hint">Slots bought in the game: {RELIC_BASE_SLOTS} base + up to {RELIC_MAX_EXTRA_SLOTS}; every preset may equip that many. A relic at level 0 shows its level 1 effect, faded.</p>
    {#if cap === 0}
      <Banner variant="info">Relics unlock at level 22; none can be equipped before then.</Banner>
    {/if}
  </Panel>

  {#each TIERS as [tier, label] (tier)}
    <section class="tier-section">
      <h3 class="tier-label">{label}</h3>
      {#each defs.filter((d) => d.tier === tier) as def (def.id)}
        {@const level = levelOf(def.id)}
        <div class="relic-row" data-relic={def.id}>
          <div class="relic-title">
            {#if relicImage(def.tier)}<img class="relic-icon" src={relicImage(def.tier)} alt="" loading="lazy" />{:else}<span class="relic-icon placeholder" aria-hidden="true">{def.name.charAt(0)}</span>{/if}
            <span class="relic-name">{def.name}</span>
            <span class="relic-level-badge num">max {def.maxLevel}</span>
          </div>
          <div class="level-controls">
            <Stepper label={def.name} value={level} min={0} max={def.maxLevel} onchange={(n) => rosterStore.setRelicLevel(def.id, n)} />
            <Button variant="ghost" size="small" aria-label="Max {def.name}" disabled={level >= def.maxLevel} onclick={() => rosterStore.setRelicLevel(def.id, def.maxLevel)}>Max</Button>
          </div>
          <div class="relic-stats" class:preview={level === 0} title={level === 0 ? 'Not owned: the effect at level 1' : undefined}>
            {#each def.bonuses as b (b.stat)}
              <span class="relic-stat"><span class="v num">{formatRelicStat(b.stat, relicStatAt(b, Math.max(level, 1), def.maxLevel))}</span> <span class="l">{relicStatLabel(b.stat)}</span></span>
            {/each}
            {#if level === 0}<span class="visually-hidden">shown at level 1</span>{/if}
          </div>
          <div class="equip">
            <PresetMenu label="Equipped in" items={menuItems(def)} onselect={(id) => rosterStore.togglePresetRelic(id, def.id)} />
          </div>
        </div>
      {/each}
    </section>
  {/each}

  <Modal bind:open={trimOpen} title="Lower relic slots to {pendingSlots?.count ?? ''}?" onclose={cancelSlots}>
    {#snippet children()}
      {#if pendingSlots}
        <p>Every preset can equip only {pendingSlots.count} relics at this count. Lowering it unequips:</p>
        <ul class="trims" aria-label="Relics that would be unequipped">
          {#each pendingSlots.trims as t (t.preset)}<li><strong>{t.preset}</strong>: {t.relics.join(', ')}</li>{/each}
        </ul>
        <p class="hint">Relic levels are kept; only the equipped choices are dropped.</p>
      {/if}
    {/snippet}
    {#snippet footer()}
      <Button variant="ghost" onclick={cancelSlots}>Keep {slotChoice} slots</Button>
      <Button variant="danger" onclick={confirmSlots}>Lower slots and unequip</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .hint { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .trims { margin: 0 0 var(--sp-3); padding-left: var(--sp-5); display: grid; gap: var(--sp-1); }
  .tier-label {
    margin: 0 0 var(--sp-2);
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .slots-row { margin-bottom: var(--sp-2); }
  .slots-field { width: 10rem; }
  .readout { display: flex; align-items: center; gap: var(--sp-4); min-height: var(--control-h); flex-wrap: wrap; }
  .cap { color: var(--text-ink); }
  .presets { display: flex; flex-wrap: wrap; gap: var(--sp-1) var(--sp-4); list-style: none; margin: 0; padding: 0; font-size: var(--fs-13); color: var(--text-soft); }
  .presets .over { color: var(--status-warn, var(--text-ink)); }
  .p-name { margin-right: var(--sp-1); }
  .tier-section { margin-top: var(--sp-4); }
  /* one column grid for every row on the page: name | level | effects | Equipped in */
  .relic-row {
    display: grid;
    grid-template-columns: minmax(12rem, 18rem) auto minmax(12rem, 1fr) 15rem;
    align-items: center;
    gap: var(--sp-2) var(--sp-5);
    padding: var(--sp-2) var(--sp-3);
    background: var(--surface-2);
    border: 1px solid var(--line-rule);
    border-radius: var(--r-1);
    margin-bottom: var(--sp-1);
  }
  .relic-title { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
  .relic-name { font-weight: var(--fw-bold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .relic-level-badge { color: var(--text-muted); font-size: var(--fs-12); white-space: nowrap; }
  .level-controls { display: flex; align-items: center; gap: var(--sp-2); }
  .relic-icon { width: 28px; height: 28px; object-fit: contain; flex: none; }
  .relic-icon.placeholder { display: grid; place-items: center; border: 1px dashed var(--line-control); border-radius: var(--r-2); color: var(--text-muted); font-size: var(--fs-12); }
  /* value | stat name, the values right-aligned on one edge */
  .relic-stats { display: grid; grid-template-columns: 7ch minmax(0, 1fr); gap: 2px var(--sp-2); font-size: var(--fs-12); color: var(--tier-gold); }
  .relic-stat { display: contents; }
  .relic-stat .v { text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .relic-stat .l { font-family: var(--font-ui); color: var(--text-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .relic-stats.preview, .relic-stats.preview .l { color: var(--text-muted); }
  .equip { min-width: 0; }
  .equip :global(.preset-menu) { max-width: 100%; }
  .equip :global(.preset-menu > button) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @media (max-width: 1100px) {
    .relic-row { grid-template-columns: minmax(0, 1fr) auto; }
    .relic-stats { grid-column: 1; }
    .equip { grid-column: 2; justify-self: end; }
  }
</style>
