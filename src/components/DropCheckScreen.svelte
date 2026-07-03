<script>
  /**
   * DropCheckScreen.svelte - the heart of the app: test a candidate item
   * against every preset built on either loadout at once. Verdict math is
   * unchanged dps.js/totals.js (compareSwap + resolveEffectiveTotals), just
   * resolved per-preset now instead of per-loadout.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SLOTS, fieldsForTab } from '../lib/constants.js';
  import Chip from './Chip.svelte';
  import StatsFields from './StatsFields.svelte';
  import VerdictCard from './VerdictCard.svelte';
  import LoadoutColumn from './LoadoutColumn.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const drop = $derived(character.drop);
  const selectedSlot = $derived(drop?.slot ?? SLOTS[0]);
  const dropFields = $derived(fieldsForTab('gear', character.class));

  // Ensure this character always has a drop to work with (per-character -
  // starts fresh on first visit, or after a character switch).
  $effect(() => {
    if (!character.drop) rosterStore.startDrop(SLOTS[0]);
  });

  function selectSlot(slot) {
    if (!drop || drop.slot !== slot) rosterStore.startDrop(slot);
  }

  function discardDrop() {
    rosterStore.startDrop(selectedSlot);
    setStatus?.('Drop discarded');
  }
</script>

{#if !character.class}
  <p class="empty-hint">Choose a class for this character before opening Drop Check.</p>
{:else if drop}
  <div class="drop-grid">
    <div class="loadout-col">
      <LoadoutColumn loadout={character.loadouts[0]} loadoutIndex={0} {character} {selectedSlot} onSelectSlot={selectSlot} />
    </div>

    <div class="altar">
      <div class="altar-header">
        <span class="rule"></span>
        <h2>DROP CHECK</h2>
        <span class="rule"></span>
      </div>
      <p class="subline">Enter the drop's stats — every preset renders its own judgment.</p>

      <div class="slot-chips">
        {#each SLOTS as slot (slot)}
          <Chip label={slot} selected={selectedSlot === slot} onClick={() => selectSlot(slot)} size="small" />
        {/each}
      </div>

      <StatsFields values={drop.piece} fields={dropFields} onChange={(key, value) => rosterStore.setDropField(key, value)} />

      <div class="verdict-cards">
        {#each character.loadouts as loadout, i (loadout.name)}
          <VerdictCard {loadout} loadoutIndex={i} {character} {drop} {setStatus} />
        {/each}
      </div>

      <button type="button" class="discard-btn" onclick={discardDrop}>Discard this drop</button>
      <p class="footnote">Equipping writes to the loadout — every preset that uses it updates.</p>
    </div>

    <div class="loadout-col">
      <LoadoutColumn loadout={character.loadouts[1]} loadoutIndex={1} {character} {selectedSlot} onSelectSlot={selectSlot} />
    </div>
  </div>
{/if}

<style>
  .empty-hint {
    color: var(--color-muted);
    padding-top: var(--space-6);
  }
  .drop-grid {
    display: grid;
    grid-template-columns: minmax(220px, 270px) minmax(0, 1fr) minmax(220px, 270px);
    gap: 18px;
  }
  @media (max-width: 1279px) {
    .drop-grid {
      display: flex;
      flex-direction: column;
    }
    /* Altar first regardless of DOM order once stacked - the drop
       inputs/verdicts are the primary task, the loadout columns are
       reference material below them. */
    .altar {
      order: -1;
    }
  }
  .loadout-col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }
  .altar {
    background: var(--color-panel);
    border: 1px solid var(--color-gold);
    box-shadow: var(--color-gold-glow-strong);
    border-radius: var(--radius-panel);
    padding: 20px 22px;
    min-width: 0;
  }
  .altar-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .altar-header h2 {
    font-size: 16px;
    letter-spacing: 0.16em;
    color: var(--color-gold-light);
    margin: 0;
    white-space: nowrap;
  }
  .altar-header .rule:first-child {
    background: linear-gradient(90deg, transparent, var(--color-gold));
  }
  .altar-header .rule:last-child {
    background: linear-gradient(270deg, transparent, var(--color-gold));
  }
  .rule {
    flex: 1;
    height: 1px;
  }
  .subline {
    text-align: center;
    color: var(--color-muted);
    font-size: 11.5px;
    margin: 6px 0 var(--space-4);
  }
  @media (min-width: 900px) {
    .altar :global(.stats-fields) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 26px;
    }
  }
  .slot-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 6px;
    margin-bottom: var(--space-4);
  }
  .verdict-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: var(--space-4);
  }
  @media (max-width: 700px) {
    .slot-chips {
      flex-wrap: nowrap;
      justify-content: flex-start;
      overflow-x: auto;
      padding-bottom: 4px;
    }
  }
  .discard-btn {
    display: block;
    margin: var(--space-4) auto 4px;
    background: none;
    border: none;
    color: var(--color-muted);
    text-decoration: underline dotted;
  }
  .footnote {
    text-align: center;
    font-size: 10.5px;
    color: var(--color-dim);
    margin: 0;
  }
</style>
