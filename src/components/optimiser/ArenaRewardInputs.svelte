<script>
  import { ARENA_RANKS } from '../../lib/game/combatPvp.js';
  import { arenaInfluenceReward } from '../../lib/engine/pvp/arenaRewards.js';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';

  let { objective = $bindable(), target, opponents = [] } = $props();
  const selected = $derived(opponents.filter((o) => target.opponentIds.includes(o.id)));
  const ranks = [{ value: '', label: 'Choose your rank tier' }, ...ARENA_RANKS.map((r) => ({ value: r.rank, label: r.name ?? r.rank }))];
  const patch = (part) => { objective = { ...objective, ...part }; };
</script>

<div data-testid="arena-reward-inputs">
  <p class="hint">Attacking only. Compares Influence from wins, with equal attempts against each selected opponent. Loss rewards and game matchmaking are unknown.</p>
  <Select label="Your Arena rank tier" options={ranks} value={objective.rank ?? ''} onchange={(rank) => patch({ rank })} />
  <NumberField label="Your Arena position" nullable min={1} max={10000000} step={1} value={objective.position ?? null} onchange={(position) => patch({ position })} />
  {#each selected as opponent (opponent.id)}
    <NumberField label={`${opponent.name || 'Opponent'} Arena position`} nullable min={1} max={10000000} step={1}
      value={objective.opponentPositions?.[opponent.id] ?? null}
      onchange={(position) => patch({ opponentPositions: { ...objective.opponentPositions, [opponent.id]: position } })} />
    {@const reward = arenaInfluenceReward(objective.rank, objective.position, objective.opponentPositions?.[opponent.id])}
    {#if reward != null}<p class="hint">{opponent.name || 'Opponent'}: <span class="num">{reward}</span> Influence per win.</p>{/if}
  {/each}
  <p class="hint">Enter current positions from the same Arena ladder. Reward slots shift near the top. Imported profiles do not supply live positions.</p>
</div>
