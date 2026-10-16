<script>
  /**
   * AbsorbDialog.svelte - the "Absorb into base" preview (ia.md §5.8): for the five base stats, today's
   * value and the value after the sheet gap is moved into them, plus every preset this reaches (base
   * stats are character-wide). Nothing is written until Absorb is pressed.
   */
  import { absorbIntoBase } from '../../lib/build/residual.js';
  import Modal from '../Modal.svelte';
  import Button from '../ui/Button.svelte';
  import { statNumber } from './statText.js';

  let { open = $bindable(false), character, stats, onconfirm = () => {} } = $props();

  // Base-stat field -> the total key whose display rules apply to it.
  const FIELDS = [
    ['attack', 'Attack', 'totalAttack'],
    ['hp', 'Health', 'totalHp'],
    ['attackSpeed', 'Attack speed', 'totalAttackSpeed'],
    ['critChance', 'Crit chance', 'totalCritChance'],
    ['critDamage', 'Crit damage', 'totalCritDamage'],
  ];

  function previewBase() {
    return absorbIntoBase(character.baseResidual, stats.computed, stats.residual, stats.ctx).base;
  }
  const next = $derived(open ? previewBase() : character.baseResidual);
  const changed = $derived(FIELDS.filter(([f]) => next[f] !== character.baseResidual[f]));
  const unit = (total) => (total === 'totalAttack' || total === 'totalHp' ? '' : '%');

  function confirm() {
    onconfirm(next);
    open = false;
  }
</script>

<Modal bind:open title="Add the difference to your base stats">
  {#snippet children()}
    <p class="lead">
      The difference between your in-game stats and the app's numbers is added to your base stats, so the app then matches your in-game stats.
      Differences on other stats stay as they are.
    </p>
    <table class="preview" data-testid="absorb-preview">
      <thead><tr><th scope="col">Base stat</th><th scope="col" class="r">Now</th><th scope="col" class="r">After</th></tr></thead>
      <tbody>
        {#each changed as [field, label, total] (field)}
          <tr>
            <th scope="row">{label}</th>
            <td class="r num">{statNumber(total, character.baseResidual[field])}{unit(total)}</td>
            <td class="r num">{statNumber(total, next[field])}{unit(total)}</td>
          </tr>
        {:else}
          <tr><td colspan="3" class="dim">No base stat changes.</td></tr>
        {/each}
      </tbody>
    </table>
    <p class="reach" data-testid="absorb-reach">
      Base stats are shared, so this changes {character.presets.length === 1 ? 'the preset' : 'all'}
      <b>{character.presets.map((p) => p.name).join(', ')}</b>.
    </p>
  {/snippet}
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (open = false)}>Cancel</Button>
    <Button variant="primary" disabled={changed.length === 0} onclick={confirm}>Add</Button>
  {/snippet}
</Modal>

<style>
  .lead, .reach { margin: 0 0 var(--sp-3); font-size: var(--fs-13); color: var(--text-soft); }
  .preview { width: 100%; border-collapse: collapse; margin-bottom: var(--sp-3); font-size: var(--fs-13); }
  th, td { padding: var(--sp-1) var(--sp-2); border-bottom: 1px solid var(--line-hairline); text-align: left; font-weight: inherit; }
  .r { text-align: right; }
  .num { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  .dim { color: var(--text-muted); }
</style>
