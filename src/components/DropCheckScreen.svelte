<script>
  /**
   * DropCheckScreen.svelte - the heart of the app: test a candidate item
   * against every preset built on either loadout at once. Verdict math is
   * unchanged dps.js/totals.js (compareSwap + resolveEffectiveTotals), just
   * resolved per-preset now instead of per-loadout.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { SLOTS, fieldsForTab } from '../lib/constants.js';
  import { DROP_GOALS } from '../lib/dropGoals.js';
  import { TANK_PROFILES } from '../lib/tankObjective.js';
  import Chip from './Chip.svelte';
  import StatsFields from './StatsFields.svelte';
  import VerdictCard from './VerdictCard.svelte';
  import LoadoutColumn from './LoadoutColumn.svelte';
  import Slider from './Slider.svelte';

  let { setStatus } = $props();

  const character = $derived(rosterStore.current);
  const drop = $derived(character.drop);
  const selectedSlot = $derived(drop?.slot ?? SLOTS[0]);
  const dropFields = $derived(fieldsForTab('gear', character.class));

  // Verdict goal (persisted per character - see model.js normaliseDropGoal).
  const dropGoal = $derived(character.dropGoal ?? { kind: 'dps-fast', ehpWeight: 0.5 });
  const availableGoals = $derived(DROP_GOALS.filter((g) => !g.warriorOnly || character.class === 'Warrior'));
  const tankEhpPct = $derived(Math.round((dropGoal.ehpWeight ?? 0.5) * 100));
  // Profile id derives from the persisted weight (no view-state to desync on
  // character switch): a named profile when the weight matches, else Custom.
  const tankProfileId = $derived(
    TANK_PROFILES.find((p) => Math.round(p.ehpWeight * 100) === tankEhpPct)?.id ?? 'custom'
  );

  function pickTankProfile(id) {
    const profile = TANK_PROFILES.find((p) => p.id === id);
    if (profile) rosterStore.setDropGoal({ ehpWeight: profile.ehpWeight });
  }

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

      <p class="disclaimer">
        ⚠ These DPS % changes are <strong>estimates</strong>, not confirmed numbers. Whether
        Penetration does anything in PVE is unconfirmed, and almost no PVE content shows stats or
        health to check against — World Boss and Fortress Boss are the exception, and even there
        only health is visible. Don't rely on this for Crusades or Celestial Trials (more than a
        DPS check) or PVP (mechanics not modeled here). Any gear changes you make are your call.
      </p>

      <div class="goal-controls">
        <div class="control" role="group" aria-label="Verdict goal">
          <span class="micro-label">Verdict goal</span>
          <div class="mode-toggle">
            {#each availableGoals as g (g.kind)}
              <button
                type="button"
                class:selected={dropGoal.kind === g.kind}
                onclick={() => rosterStore.setDropGoal({ kind: g.kind })}
              >
                {g.label}
              </button>
            {/each}
          </div>
        </div>
        {#if dropGoal.kind === 'tank'}
          <label class="control">
            <span class="micro-label">Tank profile</span>
            <select value={tankProfileId} onchange={(e) => pickTankProfile(e.target.value)} data-testid="drop-tank-profile-select">
              {#each TANK_PROFILES as p (p.id)}
                <option value={p.id}>{p.label}</option>
              {/each}
              <option value="custom">Custom</option>
            </select>
          </label>
          <label class="control balance-control">
            <span class="micro-label">Balance — sustain {100 - tankEhpPct} / {tankEhpPct} HP pool</span>
            <Slider
              min={0}
              max={100}
              step={5}
              value={tankEhpPct}
              oninput={(v) => rosterStore.setDropGoal({ ehpWeight: v / 100 })}
              ariaLabel="EHP versus sustain balance"
            />
          </label>
        {/if}
      </div>

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
  .disclaimer {
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--color-warning);
    background: var(--color-warning-soft);
    border: 1px solid var(--color-warning);
    border-radius: 6px;
    padding: 8px 10px;
    margin: 0 0 var(--space-4);
  }
  @media (min-width: 900px) {
    .altar :global(.stats-fields) {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px 26px;
    }
  }
  /* Goal control row - same .control/.mode-toggle pattern as the Simulation
     screen's optimizer controls (component-scoped there, so duplicated). */
  .goal-controls {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: var(--space-4);
    flex-wrap: wrap;
    margin-bottom: var(--space-4);
  }
  .control {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .control select,
  .control input {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
  }
  .mode-toggle {
    display: flex;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    overflow: hidden;
  }
  .mode-toggle button {
    background: var(--color-field);
    color: var(--color-muted);
    border: none;
    padding: 7px 12px;
    font-size: 12px;
    cursor: pointer;
    min-height: 34px;
  }
  .mode-toggle button + button {
    border-left: 1px solid var(--color-border);
  }
  .mode-toggle button.selected {
    background: var(--color-gold-tint);
    color: var(--color-gold-light);
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
    .goal-controls {
      align-items: stretch;
      flex-direction: column;
    }
    .control select,
    .control input {
      min-width: 0;
      width: 100%;
      min-height: 44px;
    }
    .mode-toggle button {
      flex: 1;
      min-height: 44px;
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
