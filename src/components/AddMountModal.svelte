<script>
  /**
   * AddMountModal.svelte - name + rarity + base HP%/ATK% in one step, so a
   * new mount is never left at 0/0 after add (the old flow required editing
   * the inline row fields after creation).
   */
  import { RARITIES } from '../lib/constants.js';
  import { formatPct, parsePct } from '../lib/format.js';

  let { onSave, onClose } = $props();

  let name = $state('');
  let rarity = $state(RARITIES[0]);
  let hpPctDraft = $state('');
  let atkPctDraft = $state('');

  function save() {
    onSave({
      name: name.trim() || 'New Mount',
      rarity,
      baseHpPct: parsePct(hpPctDraft),
      baseAtkPct: parsePct(atkPctDraft),
    });
  }
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="modal" role="dialog" aria-label="Add Mount">
  <h3 class="subheading">Add Mount</h3>
  <div class="fields-row">
    <input type="text" placeholder="Mount name" aria-label="Mount name" bind:value={name} />
    <select aria-label="Rarity" bind:value={rarity}>
      {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
    </select>
  </div>
  <div class="fields-row">
    <label class="base-stat">
      HP%
      <input type="text" inputmode="decimal" placeholder={formatPct(0)} bind:value={hpPctDraft} />
    </label>
    <label class="base-stat">
      ATK%
      <input type="text" inputmode="decimal" placeholder={formatPct(0)} bind:value={atkPctDraft} />
    </label>
  </div>
  <div class="actions">
    <button type="button" class="btn-ghost" onclick={onClose}>Cancel</button>
    <button type="button" class="btn-gold" onclick={save}>Add Mount</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 30;
  }
  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 31;
    width: min(360px, calc(100vw - 32px));
    background: var(--color-panel);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: var(--space-4);
  }
  .modal h3 {
    margin: 0 0 var(--space-3);
  }
  .fields-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .fields-row input {
    flex: 1;
  }
  .base-stat {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 11px;
    color: var(--color-muted);
  }
  .base-stat input {
    width: 72px;
    text-align: right;
    font-size: 12.5px;
    font-family: var(--font-data);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
</style>
