<script>
  /**
   * StoneForm.svelte - the dual-mode panel for one stone pool. Add mode (nothing selected): pick a
   * type, then fill that type's stat rows as stones.md §1 / model `stoneRecipe` lay them out
   * (guaranteed PvP rows, Azure's Attack-or-Defense pick, free rows from the type's pool). Details
   * mode (a tile is selected): edit quality, Amplify level (+0..+10), Oblivion grade and stat
   * values, socket it into the selected slot of the selected set, or remove it. Every edit commits
   * to the store when its field is left (ui/NumberField) or changed (ui/Select).
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
  import { orderStats } from '../../lib/ui/statOrder.js';
  import ConfirmButton from '../ConfirmButton.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import Button from '../ui/Button.svelte';

  let { realm = 'base', stones, cls = null, setKey, setLabel, selectedSlot, canSocket = true, selectedStoneId = null, onSelect } = $props();

  const types = $derived(STONE_TYPES.filter((t) => (realm === 'oblivion' ? t.enum === 'OBLIVION' : t.enum !== 'OBLIVION')));
  const selected = $derived(stones.find((s) => s.id === selectedStoneId) ?? null);
  const socketedHere = $derived(selected && rosterStore.current?.equipment[setKey]?.enchantSlots[selectedSlot] === selected.id);

  // --- Add mode ---
  // The parent re-mounts this form per realm ({#key realm}), so the initial type is read once.
  let newType = $state(untrack(() => (realm === 'oblivion' ? 'OBLIVION' : 'PVE_ATTACK')));
  let newQuality = $state(null);
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
    return orderStats(recipe.freePool.filter((e) => !taken.has(e)), cls);
  }
  const canAdd = $derived(freeKeys.every((k) => k));

  function submitAdd() {
    if (!canAdd) return;
    const order = [...recipe.guaranteed, ...(choiceStat ? [choiceStat] : []), ...freeKeys];
    const stats = order.map((type) => ({ type, value: fromDisplay(type, String(values[type] ?? '')) }));
    const quality = newQuality == null ? NaN : Math.round(newQuality);
    const id = rosterStore.addEnchantStone(realm, {
      type: recipe.type,
      activated: newActivated,
      quality: Number.isFinite(quality) ? quality : null,
      oblivionLevel: recipe.type === 'OBLIVION' ? Number(newGrade) : null,
      stats,
    });
    newQuality = null;
    resetDraft();
    if (id) onSelect?.(id);
  }

  // --- Details mode ---
  function patch(p) {
    if (selected) rosterStore.updateEnchantStone(realm, selected.id, p);
  }
  function setStatValue(type, shown) {
    patch({ stats: selected.stats.map((s) => (s.type === type ? { ...s, value: fromDisplay(type, String(shown)) } : s)) });
  }
  function setQuality(n) {
    patch({ quality: n == null ? null : Math.round(n) });
  }
  const unitOf = (type) => (type === 'PVP_ATTACK' || type === 'PVP_DEFENSE' ? '' : '%');
  const typeOptions = $derived(types.map((t) => ({ value: t.enum, label: t.name })));
  const gradeOptions = OBLIVION_GRADES.map((g) => ({ value: g.level, label: `${g.level} - ${g.grade}` }));
  const choiceOptions = $derived((recipe.choice ?? []).map((t) => ({ value: t, label: statLabel(t) })));
  const freeSelectOptions = (i) => [{ value: '', label: 'Choose...' }, ...freeOptions(i).map((t) => ({ value: t, label: statLabel(t) }))];
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
    <p class="head-label">Add stone</p>
    <Select label="Stone type" options={typeOptions} value={newType} onchange={pickType} />
    <NumberField label="Quality (1-100)" nullable min={1} max={100} bind:value={newQuality} />
    <Checkbox bind:checked={newActivated} label="Activated" />
    {#if recipe.type === 'OBLIVION'}
      <Select label="Oblivion grade" options={gradeOptions} bind:value={newGrade} />
      <p class="hint">Oblivion Power comes from quality and grade, so it is not entered.</p>
    {/if}

    {#each recipe.guaranteed as type (type)}
      <NumberField label={statLabel(type)} unit={unitOf(type)} value={values[type] ?? null} onchange={(n) => (values[type] = n)} />
    {/each}

    {#if recipe.choice}
      <div class="pair">
        <Select label="PvP stat (one of)" options={choiceOptions} bind:value={choiceStat} />
        <NumberField label="PvP stat value" value={values[choiceStat] ?? null} onchange={(n) => (values[choiceStat] = n)} />
      </div>
    {/if}

    {#each freeKeys as _, i (i)}
      <div class="pair">
        <Select label="Free stat {i + 1}" options={freeSelectOptions(i)} bind:value={freeKeys[i]} />
        <NumberField label="Free stat {i + 1} value" unit={unitOf(freeKeys[i])} disabled={!freeKeys[i]} value={values[freeKeys[i]] ?? null} onchange={(n) => (values[freeKeys[i]] = n)} />
      </div>
    {/each}

    <div class="actions">
      <Button variant="primary" disabled={!canAdd} onclick={submitAdd}>Add stone</Button>
    </div>
  </div>
{:else}
  <div class="stone-form details-mode">
    <p class="head-label">{typeName(selected.type)}</p>
    <NumberField label="Quality (1-100)" nullable min={1} max={100} value={selected.quality} onchange={setQuality} />

    <Checkbox checked={selected.activated} label="Activated" onchange={(v) => patch({ activated: v })} />
    {#if !selected.activated}<p class="hint">An inactive stone adds nothing to your build, even when socketed.</p>{/if}

    <div class="amplify">
      <span class="label" id="amplify-label">Amplify (+0 to +{MAX_AMPLIFY_LEVEL})</span>
      <div class="amplify-row">
        <Stepper label="Amplify" min={0} max={MAX_AMPLIFY_LEVEL} value={selected.amplifyLevel} onchange={(n) => patch({ amplifyLevel: n })} />
        <span class="hint mono"><span data-testid="amplify-level">+{selected.amplifyLevel}</span> · x{multiplier.toFixed(2)} on every stat</span>
      </div>
    </div>

    {#if selected.oblivionLevel}
      <Select label="Oblivion grade" options={gradeOptions} value={selected.oblivionLevel} onchange={(v) => patch({ oblivionLevel: Number(v) })} />
      <p class="hint mono">
        Base {formatFlat(oblivionGrade(selected.oblivionLevel)?.baseAttack)} Attack / {formatFlat(oblivionGrade(selected.oblivionLevel)?.baseHp)} Health,
        Power x{oblivionGrade(selected.oblivionLevel)?.powerGradeMult}
      </p>
    {/if}

    {#each selected.stats as s (s.type)}
      <NumberField label={statLabel(s.type)} unit={unitOf(s.type)} value={Number(toDisplay(s.type, s.value))} onchange={(n) => setStatValue(s.type, n)} />
      <span class="hint mono">{statHint(s.type)}</span>
    {/each}

    <div class="actions">
      {#if !canSocket}
        <span class="hint">Select a base slot (not Belt, Gloves or Rift Core) to socket this stone.</span>
      {:else if socketedHere}
        <Button variant="ghost" onclick={() => rosterStore.unsocketStone(setKey, selectedSlot)}>Unsocket from {slotLabel(cls, selectedSlot)}</Button>
      {:else}
        <Button variant="primary" onclick={() => rosterStore.socketStone(setKey, selectedSlot, selected.id)}>Socket in {setLabel} {slotLabel(cls, selectedSlot)}</Button>
      {/if}
      <Button variant="ghost" onclick={() => onSelect?.(null)}>Done</Button>
      <ConfirmButton
        variant="danger"
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
  .stone-form { display: flex; flex-direction: column; gap: var(--sp-2); }
  .head-label {
    margin: 0;
    font-family: var(--font-ui);
    font-size: var(--fs-11);
    font-weight: var(--fw-bold);
    letter-spacing: var(--track-label);
    text-transform: uppercase;
    color: var(--text-soft);
  }
  .label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(6rem, 8rem); gap: var(--sp-2); align-items: end; }
  .amplify { display: grid; gap: 4px; }
  .amplify-row { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
  .hint { color: var(--text-muted); font-size: var(--fs-12); margin: 0; }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-2); }
</style>
