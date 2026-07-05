<script>
  /**
   * AddPetModal.svelte - name + rarity + full stat contribution in one step,
   * so a new pet is never left with zeroed stats after add (the old flow
   * required a separate "Edit stats" click after creation).
   */
  import { RARITIES, fieldsForTab } from '../lib/constants.js';
  import { emptyStats } from '../lib/model.js';
  import StatsFields from './StatsFields.svelte';

  let { onSave, onClose } = $props();

  const fields = fieldsForTab('gear');

  let name = $state('');
  let rarity = $state(RARITIES[0]);
  let stats = $state(emptyStats());

  function save() {
    onSave({ name: name.trim() || 'New Pet', rarity, stats });
  }
</script>

<div class="backdrop" role="presentation" onclick={onClose}></div>
<div class="modal" role="dialog" aria-label="Add Pet">
  <h3 class="subheading">Add Pet</h3>
  <div class="fields-row">
    <input type="text" placeholder="Pet name" aria-label="Pet name" bind:value={name} />
    <select aria-label="Rarity" bind:value={rarity}>
      {#each RARITIES as r (r)}<option value={r}>{r}</option>{/each}
    </select>
  </div>
  <p class="micro-label">STAT CONTRIBUTION</p>
  <div class="stats-scroll">
    <StatsFields values={stats} {fields} onChange={(key, value) => (stats[key] = value)} />
  </div>
  <div class="actions">
    <button type="button" class="btn-ghost" onclick={onClose}>Cancel</button>
    <button type="button" class="btn-gold" onclick={save}>Add Pet</button>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 50;
  }
  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 51;
    width: min(420px, calc(100vw - 32px));
    max-height: calc(100vh - 64px);
    display: flex;
    flex-direction: column;
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
  .micro-label {
    margin: 0 0 6px;
  }
  .stats-scroll {
    overflow-y: auto;
    padding-right: 4px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
    margin-top: var(--space-4);
  }
</style>
