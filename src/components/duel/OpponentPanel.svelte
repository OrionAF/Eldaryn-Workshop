<script>
  /**
   * OpponentPanel.svelte - the T4 editor for one saved opponent (ia.md §3.4, §5.19): name, class and
   * spec, the stat sheet typed from the arena profile, and the combat loadout. An opponent has no
   * gear, so its sheet IS its stat block. The rows it leaves blank are listed with the neutral value
   * the duel reads for them (data-model.md §7); the three rows with no neutral value are the
   * "Needs" line. Writes go through rosterStore.updateOpponent / setOpponentSheet (re-normalised).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { SPECS, classLabel } from '../../lib/game/classes.js';
  import { sheetKeysForClass } from '../../lib/engine/pipeline/sheet.js';
  import { MAX_OPPONENTS } from '../../lib/model/opponents.js';
  import { opponentFighter, missingStats, defaultedLabels, requiredStatsText } from '../../lib/features/duel.js';
  import Chip from '../Chip.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import SheetFields from '../sheet/SheetFields.svelte';
  import Panel from '../ui/Panel.svelte';
  import Banner from '../ui/Banner.svelte';
  import Button from '../ui/Button.svelte';
  import OpponentLoadout from './OpponentLoadout.svelte';

  let { opponent, onRemoved = () => {} } = $props();

  const keys = $derived(sheetKeysForClass(opponent.class, 'base').filter((k) => k !== 'totalDominion'));
  const fighter = $derived(opponentFighter(opponent));
  const missing = $derived(missingStats(fighter));
  const blank = $derived(defaultedLabels(fighter.defaulted));
  const full = $derived(rosterStore.current.opponents.length >= MAX_OPPONENTS);

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

<div data-testid="opponent-editor">
  <Panel title={opponent.name} level="primary" scope="tool">
    {#snippet meta()}
      <Button variant="ghost" size="small" disabled={full} onclick={() => rosterStore.duplicateOpponent(opponent.id)}>Duplicate</Button>
      <ConfirmButton class="btn-danger" label="Delete" confirmLabel="Confirm delete" prompt="Delete this opponent?" onConfirm={remove} />
    {/snippet}

    {#if missing.length}
      <Banner variant="warn" lead={`${requiredStatsText()}.`}>
        <span data-testid="opponent-needs">Not entered yet: {missing.join(', ')}. A duel cannot start until they are.</span>
      </Banner>
    {/if}
    {#if blank.length}
      <Banner variant="info" lead="Blank rows use neutral values.">
        <span data-testid="opponent-defaulted">The duel reads these as 0 (Crit Damage as 150%): {blank.join(', ')}.</span>
      </Banner>
    {/if}

    <div class="group">
      <label class="lbl" for="opp-name-{opponent.id}">Name</label>
      <input
        id="opp-name-{opponent.id}"
        type="text"
        aria-label="Opponent name"
        value={opponent.name}
        onblur={(e) => rosterStore.updateOpponent(opponent.id, { name: e.currentTarget.value })}
        onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
    </div>

    <div class="group">
      <span class="lbl">Class and spec</span>
      <div class="chips">
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
      <span class="lbl">Stat sheet</span>
      <p class="note">
        Type the numbers from the opponent's arena profile. Flat rows read "." as a thousands separator ("48.124" is 48124), percentage
        rows as a decimal point. The engine applies the x8 PVP HP buff itself, so enter plain Health.
      </p>
      <SheetFields {keys} values={opponent.sheet.values} onChange={onSheetChange} />
    </div>

    <OpponentLoadout {opponent} />
  </Panel>
</div>

<style>
  .group { display: grid; gap: 6px; min-width: 0; }
  .lbl { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .note { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  input[type='text'] {
    height: var(--control-h);
    padding: 0 var(--sp-3);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    font-family: var(--font-ui);
    font-size: var(--fs-14);
    max-width: 320px;
  }
  input[type='text']:hover { border-color: var(--line-control-hover); }
</style>
