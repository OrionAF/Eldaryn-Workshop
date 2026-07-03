<script>
  /**
   * VerdictCard.svelte - one per loadout in Drop Check. Lists every preset
   * using that loadout, each with its own upgrade/downgrade verdict against
   * the current drop, and an Equip button. A MIXED verdict (helps some
   * presets, hurts others) requires a two-step confirm before equipping -
   * a deviation from the design reference, which always equips on one
   * click; everything else about the verdict math/labels matches it.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { resolveEffectiveTotals } from '../lib/totals.js';
  import { compareSwap } from '../lib/dps.js';
  import { formatFlat } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let { loadout, loadoutIndex, character, drop, setStatus } = $props();

  const presetsUsingLoadout = $derived(character.presets.filter((p) => p.loadout === loadoutIndex));

  const rows = $derived(
    presetsUsingLoadout.map((preset) => {
      const result = compareSwap(resolveEffectiveTotals(character, preset), loadout.gear[drop.slot], drop.piece);
      return { preset, result };
    })
  );

  const anyUp = $derived(rows.some((r) => r.result.verdict === 'upgrade'));
  const anyDown = $derived(rows.some((r) => r.result.verdict === 'downgrade'));
  const mixed = $derived(anyUp && anyDown);
  const aggregate = $derived(
    presetsUsingLoadout.length === 0 ? 'empty' : mixed ? 'mixed' : anyUp ? 'upgrade' : anyDown ? 'downgrade' : 'neutral'
  );

  function pct(n) {
    if (!Number.isFinite(n)) return '—';
    return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
  }

  function verdictGlyph(verdict) {
    return verdict === 'upgrade' ? '▲' : verdict === 'downgrade' ? '▼' : '·';
  }

  function equip() {
    const n = presetsUsingLoadout.length;
    const name = loadout.name;
    const slot = drop.slot;
    rosterStore.applyDropToLoadout(loadoutIndex);
    rosterStore.startDrop(slot);
    setStatus?.(`Equipped to ${name} — ${n} preset${n === 1 ? '' : 's'} updated`);
  }
</script>

<div class="verdict-card" class:mixed class:upgrade={aggregate === 'upgrade'} class:downgrade={aggregate === 'downgrade'}>
  <h3>{loadout.name}</h3>

  {#if presetsUsingLoadout.length === 0}
    <p class="empty-note">No presets use this loadout — equipping changes nothing yet.</p>
  {:else}
    <ul class="rows">
      {#each rows as { preset, result } (preset.id)}
        <li class:up={result.verdict === 'upgrade'} class:down={result.verdict === 'downgrade'}>
          <span class="glyph">{verdictGlyph(result.verdict)}</span>
          <span class="preset-name">{preset.name}</span>
          <span class="deltas">
            DPS {formatFlat(result.current_dps)} → {formatFlat(result.new_dps)} ({pct(result.pct_change)}) · HPS ({pct(
              result.hps_pct_change
            )})
          </span>
        </li>
      {/each}
    </ul>

    {#if mixed}
      <p class="warning-strip">Mixed verdict: this loadout is shared — equipping helps some presets and hurts others.</p>
      <ConfirmButton
        class="equip-btn mixed"
        label={`Equip → ${loadout.name}`}
        confirmLabel="Confirm mixed equip"
        prompt="This helps some presets and hurts others."
        onConfirm={equip}
      />
    {:else}
      <button type="button" class="equip-btn" class:clean-upgrade={anyUp} onclick={equip}>Equip → {loadout.name}</button>
    {/if}
  {/if}
</div>

<style>
  .verdict-card {
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-panel);
    padding: 14px 16px;
  }
  .verdict-card h3 {
    margin: 0 0 var(--space-2);
    font-family: var(--font-heading);
    color: var(--nav-gear-light);
  }
  .verdict-card.upgrade {
    border-color: var(--color-upgrade-border);
    background: linear-gradient(180deg, rgba(64, 180, 111, 0.14), rgba(64, 180, 111, 0.04));
  }
  .verdict-card.downgrade {
    border-color: var(--color-downgrade-border);
    background: linear-gradient(180deg, rgba(214, 84, 88, 0.12), rgba(214, 84, 88, 0.03));
  }
  .verdict-card.mixed {
    border-color: var(--color-warning);
    background: linear-gradient(180deg, rgba(245, 198, 107, 0.08), rgba(245, 198, 107, 0.02));
  }
  .empty-note {
    color: var(--color-muted);
    font-size: 12px;
  }
  .rows {
    list-style: none;
    margin: 0 0 var(--space-3);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rows li {
    display: flex;
    align-items: baseline;
    gap: 6px;
    font-size: 12px;
  }
  .glyph {
    width: 1em;
  }
  .rows li.up .glyph,
  .rows li.up .preset-name {
    color: var(--color-upgrade);
  }
  .rows li.down .glyph,
  .rows li.down .preset-name {
    color: var(--color-downgrade);
  }
  .preset-name {
    font-family: var(--font-heading);
    font-weight: 700;
  }
  .deltas {
    margin-left: auto;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .warning-strip {
    font-size: 11px;
    color: var(--color-warning);
    margin: 0 0 var(--space-2);
  }
  .equip-btn {
    width: 100%;
    border-color: var(--color-border-strong);
    color: var(--color-muted);
  }
  .equip-btn.clean-upgrade {
    border-color: var(--color-upgrade-border);
    color: var(--color-upgrade);
  }
  :global(.equip-btn.mixed) {
    width: 100%;
    border-color: var(--color-warning);
    color: var(--color-warning);
  }
</style>
