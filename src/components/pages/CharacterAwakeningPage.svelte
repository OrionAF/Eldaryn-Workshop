<script>
  /**
   * CharacterAwakeningPage.svelte (C9) - path (Shadow / Radiant) and points, character-wide. The points
   * cap is what the character level allows (one per level from 45 to 59, legality.awakeningPointsForLevel),
   * never above the game's 15. Which bundle applies (spec override > class override > path default,
   * awakening.json calc.precedence) follows the active preset's talent spec.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { AWAKENING_PATHS, AWAKENING_CONSTANTS } from '../../lib/game/awakening.js';
  import { awakeningBundle, awakeningBonuses } from '../../lib/model/awakening.js';
  import { awakeningPointsForLevel } from '../../lib/model/legality.js';
  import { classLabel } from '../../lib/game/classes.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Panel from '../ui/Panel.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Banner from '../ui/Banner.svelte';
  import Button from '../ui/Button.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const LABELS = {
    attackPercent: 'Attack %', hpPercent: 'HP %', attackSpeedFlat: 'Attack Speed', critChanceFlat: 'Crit Chance',
    critDamageFlat: 'Crit Damage', hpRegenFlat: 'HP Regen', lifestealFlat: 'Lifesteal', damageReductionFlat: 'Damage Reduction',
    blockChanceFlat: 'Block Chance', penetrationFlat: 'Penetration', missChanceFlat: 'Evasion', blindChanceFlat: 'Blind Chance',
    paralyzeChanceFlat: 'Paralyze Chance', spellResistFlat: 'Spell Resist', spellDamageFlat: 'Spell Damage',
    spellCritChanceFlat: 'Spell Crit', spellVampFlat: 'Spell Vamp',
  };

  const character = $derived(rosterStore.current);
  const awakening = $derived(character.awakening);
  const cap = $derived(Math.min(AWAKENING_CONSTANTS.maxPoints, awakeningPointsForLevel(character.level)));
  const preset = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const spec = $derived(character.talentSets?.[preset?.talentSet === 1 ? 1 : 0]?.spec ?? null);
  const info = $derived(awakening.path ? awakeningBundle(awakening.path, character.class, spec) : null);
  const other = $derived(awakening.path ? (awakening.path === 'SHADOW' ? 'RADIANT' : 'SHADOW') : null);
  const otherInfo = $derived(other ? awakeningBundle(other, character.class, spec) : null);
  const totals = $derived(awakening.path ? awakeningBonuses(awakening.path, awakening.level, character.class, spec) : {});
  const otherTotals = $derived(other ? awakeningBonuses(other, awakening.level, character.class, spec) : {});
  const sourceText = $derived(
    info?.source === 'spec' ? `Spec override (${spec})` : info?.source === 'class' ? `Class override (${classLabel(character.class)})` : 'Path default',
  );
  const keys = $derived(
    [...new Set([...Object.keys(info?.bundle ?? {}), ...Object.keys(otherInfo?.bundle ?? {})])].filter((k) => info?.bundle[k] || otherInfo?.bundle[k]),
  );
</script>

<Panel title="Awakening" scope="character">
  {#snippet meta()}<span class="sub">one path, shared by all presets · bundle follows the spec of {preset.name}</span>{/snippet}
  <div class="path-selector" role="group" aria-label="Awakening path">
    {#each Object.entries(AWAKENING_PATHS) as [key, path] (key)}
      <button type="button" class="path-card" class:active={awakening.path === key} aria-pressed={awakening.path === key} onclick={() => rosterStore.setAwakeningPath(key)}>
        <span class="path-name">{path.name}</span>
        <span class="path-desc">{path.highlights.join(', ')}</span>
      </button>
    {/each}
  </div>

  {#if cap === 0}
    <Banner variant="info">Awakening points unlock at level {AWAKENING_CONSTANTS.unlockLevel}; this character is level {character.level}.</Banner>
  {/if}

  {#if !awakening.path}
    <p class="note">Choose a path above to begin allocating Awakening points.</p>
  {:else}
    <div class="points-row">
      <div class="points-field">
        <NumberField
          label="Awakening points"
          value={awakening.level}
          min={0}
          max={cap}
          disabled={cap === 0}
          onchange={(v) => rosterStore.setAwakeningLevel(v)}
        />
        <span class="of num" data-testid="points-cap">/ {cap} points</span>
      </div>
      <Button variant="ghost" disabled={awakening.level >= cap} onclick={() => rosterStore.setAwakeningLevel(cap)}>Max</Button>
      <ConfirmButton
        class="reset-btn"
        variant="danger"
        label="Reset path and points"
        confirmLabel="Confirm reset"
        prompt="Reset your path choice and all invested points?"
        onConfirm={() => rosterStore.resetAwakening()}
      />
    </div>

    <p class="hint source" data-testid="override-source">{sourceText} - {info.highlights.join(', ')}</p>

    <table class="bonus-table" data-testid="other-path">
      <caption class="sr-only">Bonuses at {awakening.level} points</caption>
      <thead>
        <tr>
          <th scope="col">Stat</th>
          <th scope="col" class="r">{AWAKENING_PATHS[awakening.path].name}</th>
          <th scope="col" class="r">Per point</th>
          <th scope="col" class="r">{AWAKENING_PATHS[other].name} at the same points</th>
        </tr>
      </thead>
      <tbody>
        {#each keys as key (key)}
          <tr>
            <th scope="row">{LABELS[key] ?? key}</th>
            <td class="r num">+{totals[key] ?? 0}</td>
            <td class="r num dim">+{info.bundle[key] ?? 0}</td>
            <td class="r num dim">+{otherTotals[key] ?? 0}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</Panel>

<style>
  .sub { color: var(--text-muted); font-size: var(--fs-12); }
  .hint { font-size: var(--fs-12); color: var(--text-muted); margin: 0 0 var(--sp-3); }
  .path-selector { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sp-3); margin-bottom: var(--sp-4); max-width: 640px; }
  @media (max-width: 700px) { .path-selector { grid-template-columns: 1fr; } }
  .path-card {
    display: grid;
    gap: var(--sp-1);
    padding: var(--sp-3);
    text-align: left;
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    background: var(--surface-3);
    color: var(--text-soft);
  }
  .path-name { font-weight: var(--fw-bold); letter-spacing: var(--track-label); text-transform: uppercase; font-size: var(--fs-12); }
  .path-desc { font-size: var(--fs-13); color: var(--text-muted); }
  .path-card.active { background: var(--brass-tint); border-color: var(--brass-400); color: var(--brass-200); }
  .note { color: var(--text-muted); }
  .points-row { display: flex; align-items: flex-end; flex-wrap: wrap; gap: var(--sp-3); margin-bottom: var(--sp-3); }
  /* The cap sits beside the field, not inside it: a unit drawn in the input overlapped the value. */
  .points-field { display: flex; align-items: flex-end; gap: var(--sp-2); }
  .points-field :global(.field) { width: 8rem; }
  .of { font-size: var(--fs-13); color: var(--text-soft); padding-bottom: var(--sp-2); white-space: nowrap; }
  :global(.reset-btn) { margin-left: auto; }
  .bonus-table { border-collapse: collapse; width: 100%; max-width: 640px; font-size: var(--fs-13); }
  .bonus-table th, .bonus-table td { padding: var(--sp-2); border-bottom: 1px solid var(--line-hairline); text-align: left; font-weight: normal; }
  .bonus-table thead th { color: var(--text-muted); font-size: var(--fs-12); font-weight: var(--fw-bold); }
  .r { text-align: right !important; }
  .dim { color: var(--text-muted); }
  .sr-only { position: absolute; top: 0; left: 0; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
