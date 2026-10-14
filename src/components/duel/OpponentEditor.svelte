<script>
  /**
   * OpponentEditor.svelte - edits one saved PVP opponent: name, class/spec, the stat sheet typed from
   * the in-game arena profile (same fields as a preset sheet, rebuild-plan §4 tier 2) and the combat
   * loadout. An opponent has no gear, so its sheet IS its stat block; blank rows count as 0.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { SPECS, classLabel } from '../../lib/game/classes.js';
  import { sheetKeysForClass } from '../../lib/engine/pipeline/sheet.js';
  import { MAX_OPPONENTS } from '../../lib/model/opponents.js';
  import Chip from '../Chip.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import SheetFields from '../sheet/SheetFields.svelte';
  import OpponentLoadout from './OpponentLoadout.svelte';

  let { opponent, onRemoved = () => {} } = $props();

  const keys = $derived(sheetKeysForClass(opponent.class).filter((k) => k !== 'totalDominion'));

  function onSheetChange(key, value) {
    const next = { ...opponent.sheet.values };
    if (value === null) delete next[key];
    else next[key] = value;
    rosterStore.setOpponentSheet(opponent.id, next);
  }

  function remove() {
    rosterStore.removeOpponent(opponent.id);
    onRemoved();
  }
</script>

<div class="editor" data-testid="opponent-editor">
  <div class="editor-header">
    <h3>EDITING - {opponent.name.toUpperCase()}</h3>
    <span class="spacer"></span>
    <button
      type="button"
      class="btn-ghost"
      disabled={rosterStore.current.opponents.length >= MAX_OPPONENTS}
      onclick={() => rosterStore.duplicateOpponent(opponent.id)}>Duplicate</button
    >
    <ConfirmButton class="btn-danger" label="Delete" confirmLabel="Confirm delete" prompt="Delete this opponent?" onConfirm={remove} />
  </div>

  <div class="group">
    <span class="micro-label">Name</span>
    <input
      type="text"
      aria-label="Opponent name"
      value={opponent.name}
      onblur={(e) => rosterStore.updateOpponent(opponent.id, { name: e.currentTarget.value })}
      onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  </div>

  <div class="group">
    <span class="micro-label">Class and spec</span>
    <div class="chip-list">
      {#each SPECS as s (s.key)}
        <Chip
          label={`${classLabel(s.class)} · ${s.name}`}
          size="compact"
          selected={opponent.spec === s.key}
          onClick={() => rosterStore.updateOpponent(opponent.id, { class: s.class, spec: s.key })}
        />
      {/each}
    </div>
    <p class="note">Changing class or spec drops sigils and glyphs the new spec cannot use.</p>
  </div>

  <div class="group">
    <span class="micro-label">Stat sheet</span>
    <p class="note">
      Type the numbers from the opponent's arena profile. HP and Attack are required; flat rows read "." as a
      thousands separator ("48.124" is 48124), percentage rows as a decimal point. The engine applies the
      x8 PVP HP buff itself, so enter plain HP.
    </p>
    <SheetFields {keys} values={opponent.sheet.values} onChange={onSheetChange} />
  </div>

  <OpponentLoadout {opponent} />
</div>

<style>
  .editor {
    margin-top: 14px;
    background: var(--color-panel);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-panel);
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .editor-header { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
  .editor-header h3 { font-size: 12.5px; letter-spacing: 0.14em; color: var(--color-gold-light); margin: 0; white-space: nowrap; }
  .spacer { flex: 1; }
  .group { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .note { color: var(--color-muted); font-size: 11.5px; margin: 0; }
</style>
