<script>
  /**
   * StoneForm.svelte - the dual-mode panel for one stone pool. Add mode (nothing selected): pick a
   * type, then fill that type's stat rows as stones.md §1 / model `stoneRecipe` lay them out
   * (guaranteed PvP rows, Azure's Attack-or-Defense pick, free rows from the type's pool). Details
   * mode (a tile is selected): edit quality, Amplify level (+0..+10), Oblivion grade and stat
   * values, socket it into the selected slot of the selected set, or remove it. Every edit commits
   * to the store on `change`.
   *
   * Props: realm ('base' | 'oblivion' - which pool), stones, setKey + setLabel (socket target set),
   * selectedSlot, selectedStoneId, onSelect(id | null).
   */
  import { untrack } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { STONE_TYPES, OBLIVION_GRADES, amplifyStep, oblivionGrade } from '../../lib/game/stones.js';
  import { stoneRecipe, STONE_STAT_DEFS, MAX_AMPLIFY_LEVEL } from '../../lib/model/stones.js';
  import { slotLabel, statLabel, toDisplay, fromDisplay } from './gearFormat.js';
  import { formatFlat } from '../../lib/format.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Checkbox from '../ui/Checkbox.svelte';

  let { realm = 'base', stones, cls = null, setKey, setLabel, selectedSlot, canSocket = true, selectedStoneId = null, onSelect } = $props();

  const types = $derived(STONE_TYPES.filter((t) => (realm === 'oblivion' ? t.enum === 'OBLIVION' : t.enum !== 'OBLIVION')));
  const selected = $derived(stones.find((s) => s.id === selectedStoneId) ?? null);
  const socketedHere = $derived(selected && rosterStore.current?.equipment[setKey]?.enchantSlots[selectedSlot] === selected.id);

  // --- Add mode ---
  // The parent re-mounts this form per realm ({#key realm}), so the initial type is read once.
  let newType = $state(untrack(() => (realm === 'oblivion' ? 'OBLIVION' : 'PVE_ATTACK')));
  let newQuality = $state('');
  let newActivated = $state(true);
  let newGrade = $state(1);
  let choiceStat = $state('');
  let values = $state({});
  let freeKeys = $state([]);
  const recipe = $derived(stoneRecipe(newType) ?? stoneRecipe(types[0].enum));

  function resetDraft() {
    values = {};
    freeKeys = Array(recipe.freeCount).fill('');
    choiceStat = recipe.choice?.[0] ?? '';
  }
  resetDraft();

  function pickType(t) {
    newType = t;
    resetDraft();
  }
  function freeOptions(i) {
    const taken = new Set([...recipe.guaranteed, ...(choiceStat ? [choiceStat] : []), ...freeKeys.filter((k, j) => j !== i && k)]);
    return recipe.freePool.filter((e) => !taken.has(e));
  }
  const canAdd = $derived(freeKeys.every((k) => k));

  function submitAdd() {
    if (!canAdd) return;
    const order = [...recipe.guaranteed, ...(choiceStat ? [choiceStat] : []), ...freeKeys];
    const stats = order.map((type) => ({ type, value: fromDisplay(type, values[type]) }));
    const quality = parseInt(newQuality, 10);
    const id = rosterStore.addEnchantStone(realm, {
      type: recipe.type,
      activated: newActivated,
      quality: Number.isFinite(quality) ? quality : null,
      oblivionLevel: recipe.type === 'OBLIVION' ? Number(newGrade) : null,
      stats,
    });
    newQuality = '';
    resetDraft();
    if (id) onSelect?.(id);
  }

  // --- Details mode ---
  function patch(p) {
    if (selected) rosterStore.updateEnchantStone(realm, selected.id, p);
  }
  function setStatValue(type, text) {
    patch({ stats: selected.stats.map((s) => (s.type === type ? { ...s, value: fromDisplay(type, text) } : s)) });
  }
  function setQuality(text) {
    const n = parseInt(text, 10);
    patch({ quality: Number.isFinite(n) ? n : null });
  }
  function typeName(t) {
    return STONE_TYPES.find((x) => x.enum === t)?.name ?? t;
  }
  const multiplier = $derived(selected ? (amplifyStep(selected.amplifyLevel)?.statMultiplier ?? 1) : 1);
  function statHint(type) {
    const d = STONE_STAT_DEFS.get(type);
    return d ? `Range ${toDisplay(type, d.min)} to ${toDisplay(type, d.max)}` : '';
  }
</script>

{#if !selected}
  <div class="stone-form add-mode">
    <p class="micro-label">Add stone</p>
    <label class="field">
      <span class="label">Type</span>
      <select aria-label="Stone type" value={newType} onchange={(e) => pickType(e.currentTarget.value)}>
        {#each types as t (t.enum)}
          <option value={t.enum}>{t.name}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span class="label">Quality (1-100)</span>
      <input type="number" aria-label="Stone quality" min="1" max="100" bind:value={newQuality} />
    </label>
    <Checkbox bind:checked={newActivated} label="Activated" />
    {#if recipe.type === 'OBLIVION'}
      <label class="field">
        <span class="label">Grade</span>
        <select aria-label="Oblivion grade" bind:value={newGrade}>
          {#each OBLIVION_GRADES as g (g.level)}
            <option value={g.level}>{g.level} - {g.grade}</option>
          {/each}
        </select>
      </label>
      <p class="hint">Oblivion Power comes from quality and grade, so it is not entered.</p>
    {/if}

    {#each recipe.guaranteed as type (type)}
      <label class="field">
        <span class="label">{statLabel(type)}</span>
        <input type="text" inputmode="decimal" aria-label={statLabel(type)} title={statHint(type)} bind:value={values[type]} />
      </label>
    {/each}

    {#if recipe.choice}
      <div class="field">
        <span class="label">PvP stat (one of)</span>
        <div class="pair">
          <select aria-label="PvP stat" bind:value={choiceStat}>
            {#each recipe.choice as type (type)}
              <option value={type}>{statLabel(type)}</option>
            {/each}
          </select>
          <input type="text" inputmode="decimal" aria-label="PvP stat value" title={statHint(choiceStat)} bind:value={values[choiceStat]} />
        </div>
      </div>
    {/if}

    {#each freeKeys as _, i (i)}
      <div class="field">
        <span class="label">Stat {i + 1}</span>
        <div class="pair">
          <select aria-label={`Free stat ${i + 1}`} bind:value={freeKeys[i]}>
            <option value="">Choose...</option>
            {#each freeOptions(i) as type (type)}
              <option value={type}>{statLabel(type)}</option>
            {/each}
          </select>
          <input
            type="text"
            inputmode="decimal"
            aria-label={`Free stat ${i + 1} value`}
            title={statHint(freeKeys[i])}
            disabled={!freeKeys[i]}
            bind:value={values[freeKeys[i]]}
          />
        </div>
      </div>
    {/each}

    <button type="button" class="btn-gold add-btn" disabled={!canAdd} onclick={submitAdd}>Add stone</button>
  </div>
{:else}
  <div class="stone-form details-mode">
    <p class="micro-label">{typeName(selected.type)}</p>
    <label class="field">
      <span class="label">Quality (1-100)</span>
      <input type="number" aria-label="Stone quality" min="1" max="100" value={selected.quality ?? ''} onchange={(e) => setQuality(e.currentTarget.value)} />
    </label>

    <Checkbox checked={selected.activated} label="Activated" onchange={(v) => patch({ activated: v })} />
    {#if !selected.activated}<p class="hint">An inactive stone adds nothing to the build (stones.md §1), even when socketed.</p>{/if}

    <div class="field">
      <span class="label">Amplify (+0 to +{MAX_AMPLIFY_LEVEL})</span>
      <div class="rank-controls">
        <button type="button" aria-label="Amplify down" disabled={selected.amplifyLevel <= 0} onclick={() => patch({ amplifyLevel: selected.amplifyLevel - 1 })}>-</button>
        <span class="mono amplify-level" data-testid="amplify-level">+{selected.amplifyLevel}</span>
        <button type="button" aria-label="Amplify up" disabled={selected.amplifyLevel >= MAX_AMPLIFY_LEVEL} onclick={() => patch({ amplifyLevel: selected.amplifyLevel + 1 })}>+</button>
        <span class="hint mono">x{multiplier.toFixed(2)} on every stat</span>
      </div>
    </div>

    {#if selected.oblivionLevel}
      <label class="field">
        <span class="label">Oblivion grade</span>
        <select aria-label="Oblivion grade" value={selected.oblivionLevel} onchange={(e) => patch({ oblivionLevel: Number(e.currentTarget.value) })}>
          {#each OBLIVION_GRADES as g (g.level)}
            <option value={g.level}>{g.level} - {g.grade}</option>
          {/each}
        </select>
      </label>
      <p class="hint mono">
        Base {formatFlat(oblivionGrade(selected.oblivionLevel)?.baseAttack)} Attack / {formatFlat(oblivionGrade(selected.oblivionLevel)?.baseHp)} Health,
        Power x{oblivionGrade(selected.oblivionLevel)?.powerGradeMult}
      </p>
    {/if}

    {#each selected.stats as s (s.type)}
      <label class="field">
        <span class="label">{statLabel(s.type)}</span>
        <input type="text" inputmode="decimal" aria-label={statLabel(s.type)} title={statHint(s.type)} value={toDisplay(s.type, s.value)} onchange={(e) => setStatValue(s.type, e.currentTarget.value)} />
      </label>
    {/each}

    <div class="actions">
      {#if !canSocket}
        <span class="hint">Select a base slot (not Belt, Gloves or Rift Core) to socket this stone.</span>
      {:else if socketedHere}
        <button type="button" class="btn-ghost" onclick={() => rosterStore.unsocketStone(setKey, selectedSlot)}>Unsocket from {slotLabel(cls, selectedSlot)}</button>
      {:else}
        <button type="button" class="btn-gold" onclick={() => rosterStore.socketStone(setKey, selectedSlot, selected.id)}>Socket in {setLabel} {slotLabel(cls, selectedSlot)}</button>
      {/if}
      <button type="button" class="btn-ghost" onclick={() => onSelect?.(null)}>Done</button>
      <ConfirmButton
        class="btn-danger"
        label="Remove stone"
        confirmLabel="Confirm remove"
        prompt="Removes it from every set."
        onConfirm={() => {
          const id = selected.id;
          onSelect?.(null);
          rosterStore.removeEnchantStone(realm, id);
        }}
      />
    </div>
  </div>
{/if}

<style>
  .stone-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .stone-form .micro-label {
    margin: 0;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .label {
    font-size: 11px;
    color: var(--color-dim);
  }
  .pair {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 6rem;
    gap: var(--space-2);
  }
  .rank-controls {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .amplify-level {
    min-width: 2.5rem;
    text-align: center;
  }
  .hint {
    color: var(--color-muted);
    font-size: 11.5px;
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }
  .add-btn {
    align-self: flex-start;
    margin-top: var(--space-2);
  }
</style>
