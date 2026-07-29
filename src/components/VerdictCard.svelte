<script>
  /**
   * VerdictCard.svelte - one per loadout in Drop Check. Lists every preset
   * using that loadout, each with its own upgrade/downgrade verdict against
   * the current drop, and an Equip button. A MIXED verdict (helps some
   * presets, hurts others) requires a two-step confirm before equipping -
   * a deviation from the design reference, which always equips on one
   * click; everything else about the verdict math/labels matches it.
   *
   * The verdict is scored under the character's persisted dropGoal (see
   * dropGoals.js): compareSwap still supplies the before/after totals and
   * the DPS context line, but up/down comes from the goal scorer. The
   * 'dps-accurate' goal renders instantly with the fast estimate (flagged
   * pending) and a debounced Monte Carlo pass confirms per row.
   */
  import { rosterStore } from '../lib/rosterStore.svelte.js';
  import { computePresetRawTotals, applyStatCaps } from '../lib/totals.js';
  import { compareSwap, computeDps } from '../lib/dps.js';
  import { createDropScorer, scoreSwapMonteCarlo, DROP_GOALS } from '../lib/dropGoals.js';
  import { formatFlat } from '../lib/format.js';
  import ConfirmButton from './ConfirmButton.svelte';

  let { loadout, loadoutIndex, character, drop, setStatus } = $props();

  const presetsUsingLoadout = $derived(character.presets.filter((p) => p.loadout === loadoutIndex));

  const goal = $derived(character.dropGoal ?? { kind: 'dps-fast', ehpWeight: 0.5 });
  const scoreLabel = $derived(DROP_GOALS.find((g) => g.kind === goal.kind)?.scoreLabel ?? 'Score');

  // Debounced Monte Carlo confirmation for the 'dps-accurate' goal, keyed by
  // preset id. A monotonic request id discards results from superseded runs
  // (the $effect below resets the map and re-arms on any input change).
  let mcScores = $state({});
  let mcRequestId = 0;

  // Drop Check always compares against gear-derived totals, regardless of a
  // preset's Manual/Calculated toggle - a Manual preset's hand-entered totals
  // have no relationship to the equipped gear a drop would actually replace.
  //
  // The swap is applied to RAW (pre-curve) totals and the soft-cap curve is
  // applied once afterwards - swapping on curved totals would let an item's
  // printed stats bypass diminishing returns. `before`/`after` stay raw for
  // the goal scorers (they curve their own input, dropGoals.js); the DPS
  // context line is computed from the curved versions here.
  function capAwareSwap(preset) {
    const raw = compareSwap(computePresetRawTotals(character, preset), loadout.gear[drop.slot], drop.piece);
    const curDps = computeDps(applyStatCaps(raw.before));
    const newDps = computeDps(applyStatCaps(raw.after));
    return {
      before: raw.before,
      after: raw.after,
      current_dps: curDps,
      new_dps: newDps,
      pct_change: curDps ? (newDps / curDps - 1) * 100 : NaN,
    };
  }

  const rows = $derived(
    presetsUsingLoadout.map((preset) => {
      const result = capAwareSwap(preset);
      const scorer = createDropScorer(goal, character, preset);
      const mc = goal.kind === 'dps-accurate' ? mcScores[preset.id] : null;
      const curScore = mc ? mc.curScore : scorer(result.before);
      const newScore = mc ? mc.newScore : scorer(result.after);
      const scorePct = curScore ? (newScore / curScore - 1) * 100 : NaN;
      return {
        preset,
        result,
        curScore,
        newScore,
        scorePct,
        verdict: newScore > curScore ? 'upgrade' : newScore < curScore ? 'downgrade' : 'no change',
        pending: goal.kind === 'dps-accurate' && !mc,
      };
    })
  );

  $effect(() => {
    // Read every input the simulation depends on so ANY change (stat field
    // keystrokes included - snapshot walks the piece's fields) re-arms the
    // debounce and invalidates in-flight results.
    const kind = goal.kind;
    const slot = drop.slot;
    $state.snapshot(drop.piece);
    const presets = presetsUsingLoadout;
    mcRequestId += 1;
    mcScores = {};
    if (kind !== 'dps-accurate' || presets.length === 0) return;
    const id = mcRequestId;
    const timer = setTimeout(async () => {
      for (const preset of presets) {
        const { before, after } = compareSwap(computePresetRawTotals(character, preset), loadout.gear[slot], drop.piece);
        const scores = scoreSwapMonteCarlo({ character, preset, beforeTotals: before, afterTotals: after });
        if (id !== mcRequestId) return;
        mcScores = { ...mcScores, [preset.id]: scores };
        // Yield between rows so a many-preset loadout can't freeze the frame.
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  const anyUp = $derived(rows.some((r) => r.verdict === 'upgrade'));
  const anyDown = $derived(rows.some((r) => r.verdict === 'downgrade'));
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
  <div class="card-header">
    <div class="title-group">
      <h3>{loadout.name}</h3>
      {#if presetsUsingLoadout.length}
        <span class="preset-count">{presetsUsingLoadout.length} preset{presetsUsingLoadout.length === 1 ? '' : 's'}</span>
      {/if}
    </div>
    {#if presetsUsingLoadout.length}
      {#if mixed}
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

  {#if presetsUsingLoadout.length === 0}
    <p class="empty-note">No presets use this loadout — equipping changes nothing yet.</p>
  {:else}
    <ul class="rows">
      {#each rows as { preset, result, curScore, newScore, scorePct, verdict, pending } (preset.id)}
        <li class:up={verdict === 'upgrade'} class:down={verdict === 'downgrade'}>
          <span class="glyph">{pending ? '~' : verdictGlyph(verdict)}</span>
          <span class="preset-name">{preset.name}</span>
          <span class="deltas">
            {#if goal.kind !== 'dps-fast'}
              <span class="goal-score" class:pending>
                {scoreLabel} {formatFlat(curScore)} → {formatFlat(newScore)}
                <span class="pct" class:up={verdict === 'upgrade'} class:down={verdict === 'downgrade'}
                  >({pct(scorePct)})</span
                >{#if pending}<span class="pending-note">sim…</span>{/if}
              </span>
              ·
            {/if}
            DPS {formatFlat(result.current_dps)} → {formatFlat(result.new_dps)}
            <span class="pct" class:up={verdict === 'upgrade'} class:down={verdict === 'downgrade'}
              >({pct(result.pct_change)})</span
            >
          </span>
        </li>
      {/each}
    </ul>

    {#if mixed}
      <p class="warning-strip">Mixed verdict: this loadout is shared — equipping helps some presets and hurts others.</p>
    {/if}
  {/if}
</div>

<style>
  .verdict-card {
    background: var(--color-inset);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 11px 14px;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .title-group {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .verdict-card h3 {
    margin: 0;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--color-ink);
  }
  .preset-count {
    font-size: 10px;
    color: var(--color-muted);
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
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .deltas {
    margin-left: auto;
    font-family: var(--font-data);
    font-variant-numeric: tabular-nums;
    font-size: 11px;
    color: var(--color-muted);
    white-space: nowrap;
  }
  .pct {
    font-weight: 600;
  }
  .pct.up {
    color: var(--color-upgrade);
  }
  .pct.down {
    color: var(--color-downgrade);
  }
  .goal-score {
    color: var(--color-ink);
  }
  .goal-score.pending {
    color: var(--color-muted);
  }
  .pending-note {
    margin-left: 4px;
    font-size: 10px;
    color: var(--color-muted);
    font-style: italic;
  }
  @media (max-width: 1500px) {
    .deltas {
      white-space: normal;
      text-align: right;
    }
  }
  .warning-strip {
    font-size: 11px;
    color: var(--color-warning);
    margin: 0 0 var(--space-2);
  }
  .equip-btn {
    width: auto;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
    background: none;
    border: 1px solid #5c4a4e;
    color: #a08b8d;
  }
  .equip-btn.clean-upgrade {
    background: rgba(64, 180, 111, 0.18);
    border: 1px solid #7fe0a6;
    color: #baf1d1;
  }
  :global(.equip-btn.mixed) {
    width: auto;
    font-size: 12px;
    font-weight: 600;
    padding: 7px 14px;
    border-radius: 6px;
    background: var(--color-warning-soft);
    border: 1px solid var(--color-warning);
    color: var(--color-warning);
  }
</style>
