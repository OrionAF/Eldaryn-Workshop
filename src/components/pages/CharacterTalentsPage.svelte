<script>
  /**
   * CharacterTalentsPage.svelte - C4: Set A / Set B (character.talentSets), each an independent spec
   * + rank allocation that presets point at (ia.md §5.10). The points bar is measured against what
   * the character's level grants (`talentPointsForLevel`, talents.md §3), not the 29-point maximum.
   * Trees come from the L1 catalogue (game/talents.js).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { talentSpecsForClass, talentSpec } from '../../lib/game/talents.js';
  import { pointsSpent } from '../../lib/model/talents.js';
  import { talentPointsForLevel, dualTalentsUnlocked, UNLOCK_LEVELS } from '../../lib/model/legality.js';
  import Tabs from '../ui/Tabs.svelte';
  import Select from '../ui/Select.svelte';
  import Panel from '../ui/Panel.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import Button from '../ui/Button.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import TalentTierList from '../talents/TalentTierList.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const specKeys = $derived(talentSpecsForClass(character?.class));
  const label = (i) => (i === 0 ? 'Set A' : 'Set B');

  let selected = $state('0');
  const index = $derived(Number(selected));
  const set = $derived(character.talentSets[index]);
  const usedBy = (i) => character.presets.filter((p) => p.talentSet === i).map((p) => p.name);
  const tabs = $derived(
    character.talentSets.map((_, i) => ({
      id: String(i),
      label: label(i),
      sub: usedBy(i).length ? `used by ${usedBy(i).join(', ')}` : 'unused',
      disabled: i === 1 && !dualTalentsUnlocked(character.level),
      reason: `Set B unlocks at level ${UNLOCK_LEVELS.DUAL_TALENTS}`,
    })),
  );
  // A level drop can leave Set B selected but locked; show Set A then.
  $effect(() => {
    if (selected === '1' && !dualTalentsUnlocked(character.level)) selected = '0';
  });

  const cap = $derived(talentPointsForLevel(character.level));
  const spent = $derived(pointsSpent(set.allocation));
  const specOptions = $derived([{ value: '', label: 'Choose a spec...' }, ...specKeys.map((k) => ({ value: k, label: talentSpec(k).name }))]);
  let specValue = $state('');
  $effect(() => {
    specValue = set.spec ?? '';
  });
</script>

{#if !character.class}
  <EmptyState title="Choose a class first" text="Talent trees depend on the class.">
    {#snippet action()}<Button onclick={() => onNavigate('character/overview')}>Pick a class on Overview</Button>{/snippet}
  </EmptyState>
{:else}
  <div class="talents">
    <Tabs items={tabs} bind:value={selected} label="Talent sets" idPrefix="talents" />
    <div role="tabpanel" id="talents-panel-{selected}">
      <Panel title="{label(index)} · {usedBy(index).length ? `used by ${usedBy(index).join(', ')}` : 'unused'}">
        <div class="controls">
          <Select
            label="Specialization for {label(index)}"
            options={specOptions}
            bind:value={specValue}
            onchange={(v) => rosterStore.setTalentSetSpec(index, v || null)}
          />
          <div class="points">
            <span class="points-label" id="points-label">Points</span>
            <div class="bar" role="progressbar" aria-labelledby="points-label" aria-valuemin="0" aria-valuemax={cap} aria-valuenow={spent}>
              <span class="fill" style="width: {cap > 0 ? Math.min(100, (spent / cap) * 100) : 0}%"></span>
            </div>
            <span class="points-readout num" data-testid="points">{spent} / {cap} pts</span>
            <span class="points-note">{cap === 0 ? `Talents unlock at level ${UNLOCK_LEVELS.TALENTS}.` : `Level ${character.level} grants ${cap} of 29.`}</span>
          </div>
          <ConfirmButton
            class="reset-btn"
            label={`Reset ${label(index)}`}
            confirmLabel="Confirm reset"
            prompt={`Reset all points spent in ${label(index)}?`}
            onConfirm={() => rosterStore.resetTalentSet(index)}
          />
        </div>

        {#if !set.spec}
          <p class="note">Choose a specialization above for {label(index)} to see its talent tree.</p>
        {:else}
          {#key set.spec}
            <TalentTierList specKey={set.spec} talentSetIndex={index} pointsLeft={cap - spent} />
          {/key}
        {/if}
      </Panel>
    </div>
  </div>
{/if}

<style>
  .talents { display: grid; gap: var(--sp-3); }
  .controls { display: flex; flex-wrap: wrap; gap: var(--sp-5); align-items: flex-end; margin-bottom: var(--sp-4); }
  .points { display: grid; gap: 4px; min-width: 14rem; flex: 1; }
  .points-label { font-size: var(--fs-12); font-weight: var(--fw-bold, 700); color: var(--text-soft); }
  .bar { height: 8px; background: var(--surface-3); border: 1px solid var(--line-control); border-radius: var(--r-1); overflow: hidden; }
  .fill { display: block; height: 100%; background: var(--brass-500); }
  .points-readout { font-size: var(--fs-13); color: var(--text-ink); }
  .points-note { font-size: var(--fs-12); color: var(--text-muted); }
  .note { color: var(--text-soft); }
  :global(.reset-btn) { margin-left: auto; }
</style>
