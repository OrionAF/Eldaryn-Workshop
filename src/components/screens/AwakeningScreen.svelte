<script>
  /**
   * AwakeningScreen.svelte - path (Shadow / Radiant) + points 0..15, character-wide. Shows which
   * bundle applies (spec override > class override > path default; awakening.json calc.precedence).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { AWAKENING_PATHS, AWAKENING_CONSTANTS } from '../../lib/game/awakening.js';
  import { awakeningBundle, awakeningBonuses } from '../../lib/model/awakening.js';
  import { classLabel } from '../../lib/game/classes.js';
  import ConfirmButton from '../ConfirmButton.svelte';

  const LABELS = {
    attackPercent: 'Attack %', hpPercent: 'HP %', attackSpeedFlat: 'Attack Speed', critChanceFlat: 'Crit Chance',
    critDamageFlat: 'Crit Damage', hpRegenFlat: 'HP Regen', lifestealFlat: 'Lifesteal', damageReductionFlat: 'Damage Reduction',
    blockChanceFlat: 'Block Chance', penetrationFlat: 'Penetration', missChanceFlat: 'Evasion', blindChanceFlat: 'Blind Chance',
    paralyzeChanceFlat: 'Paralyze Chance', spellResistFlat: 'Spell Resist', spellDamageFlat: 'Spell Damage',
    spellCritChanceFlat: 'Spell Crit', spellVampFlat: 'Spell Vamp',
  };
  const MAX = AWAKENING_CONSTANTS.maxPoints;

  const character = $derived(rosterStore.current);
  const awakening = $derived(character.awakening);
  const preset = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const spec = $derived(character.talentSets?.[preset?.talentSet === 1 ? 1 : 0]?.spec ?? null);
  const info = $derived(awakening.path ? awakeningBundle(awakening.path, character.class, spec) : null);
  const totals = $derived(awakening.path ? awakeningBonuses(awakening.path, awakening.level, character.class, spec) : {});
  const sourceText = $derived(
    info?.source === 'spec' ? `Spec override (${spec})` : info?.source === 'class' ? `Class override (${classLabel(character.class)})` : 'Path default',
  );
</script>

<div class="header-row">
  <h2>Awakening</h2>
  <p class="hint">character-wide - one path, shared by all presets</p>
</div>

<div class="path-selector">
  {#each Object.entries(AWAKENING_PATHS) as [key, path] (key)}
    <button type="button" class="path-card" class:active={awakening.path === key} onclick={() => rosterStore.setAwakeningPath(key)}>{path.name}</button>
  {/each}
</div>

{#if !awakening.path}
  <p class="empty-hint">Choose a path above to begin allocating Awakening points.</p>
{:else}
  <div class="points-row">
    <span class="points-readout">{awakening.level} / {MAX} points</span>
    <div class="rank-controls">
      <button type="button" aria-label="Fewer points" disabled={awakening.level <= 0} onclick={() => rosterStore.setAwakeningLevel(awakening.level - 1)}>&minus;</button>
      <button type="button" aria-label="More points" disabled={awakening.level >= MAX} onclick={() => rosterStore.setAwakeningLevel(awakening.level + 1)}>+</button>
    </div>
    <ConfirmButton
      class="reset-btn btn-danger"
      label="Reset Awakening"
      confirmLabel="Confirm reset"
      prompt="Reset your path choice and all invested points?"
      onConfirm={() => rosterStore.resetAwakening()}
    />
  </div>

  <p class="hint source" data-testid="override-source">{sourceText} - {info.highlights.join(', ')}</p>

  <div class="bonus-list">
    {#each Object.entries(info.bundle).filter(([, per]) => per) as [key, per] (key)}
      <div class="bonus-row">
        <span class="bonus-label">{LABELS[key] ?? key}</span>
        <span class="bonus-value">
          +{totals[key] ?? 0}
          <span class="per-point">(+{per}/point)</span>
        </span>
      </div>
    {/each}
  </div>
{/if}

<style>
  .header-row { margin-bottom: var(--space-4); }
  .header-row h2 { margin: 0; }
  .hint { font-size: 11px; color: var(--color-muted); margin: 2px 0 0; }
  .source { margin: 0 0 var(--space-3); }
  .path-selector { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-bottom: var(--space-4); max-width: 560px; }
  @media (max-width: 700px) { .path-selector { grid-template-columns: 1fr; } }
  .path-card {
    padding: 10px;
    border: 1px solid var(--color-border-strong);
    border-radius: 7px;
    font-family: var(--font-heading);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.08em;
    background: none;
    color: var(--color-muted);
  }
  .path-card.active { background: var(--color-gold-tint); border-color: var(--color-gold); color: var(--color-gold-light); }
  .empty-hint { color: var(--color-muted); }
  .points-row { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-3); max-width: 560px; }
  .points-readout { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: 13px; color: var(--color-soft); }
  .rank-controls { display: flex; gap: var(--space-1); }
  :global(.reset-btn) { margin-left: auto; }
  .bonus-list { display: flex; flex-direction: column; gap: 0.35rem; margin-bottom: var(--space-4); max-width: 560px; }
  .bonus-row { display: flex; justify-content: space-between; padding: 8px 10px; background: var(--color-inset); border: 1px solid var(--color-border); border-radius: 7px; }
  .bonus-label { color: var(--color-muted); font-size: 12px; }
  .bonus-value { font-family: var(--font-data); font-size: 12.5px; color: var(--color-gold-light); }
  .per-point { color: var(--color-dim); font-size: 10.5px; }
</style>
