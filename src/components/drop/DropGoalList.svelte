<script>
  /**
   * DropGoalList.svelte - the goals Drop Check judges a drop by (design: drop-check-goals.md §3): the Optimiser's
   * fight and objective, saved on the character. Each row says what it measures and whether this drop meets it
   * (an Oblivion goal judges only Oblivion drops). Add and Edit open one inline editor: the Optimiser's
   * TargetPicker, then the objectives a swap can be judged by.
   *
   * Props: resolved (ui/dropGoals.js resolveDropGoals), character, characters (the roster's others), realm (of
   * the drop), max, onadd(goal), onupdate(id, goal), onremove(id).
   */
  import TargetPicker from '../tools/TargetPicker.svelte';
  import ArenaRewardInputs from '../optimiser/ArenaRewardInputs.svelte';
  import Select from '../ui/Select.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Button from '../ui/Button.svelte';
  import { go } from '../../lib/router.svelte.js';
  import { FASTEST_CLEAR_TRIES } from '../../lib/search/objectives.js';
  import { OBJECTIVE_LABEL } from '../../lib/ui/optimiserView.js';
  import { dropObjectiveKinds, resolveDropGoal, NEW_GOAL } from '../../lib/ui/dropGoals.js';

  let { resolved = [], character, characters = [], realm = 'base', max = 8, onadd, onupdate, onremove } = $props();

  // null: closed; 'new': adding; else the id of the goal being edited
  let editing = $state(null);
  let draft = $state(structuredClone(NEW_GOAL));
  let confirmId = $state(null);

  const opponents = $derived(character?.opponents ?? []);
  const allowed = $derived(dropObjectiveKinds(draft.target.kind, draft.target.kind === 'pvp' ? null : $state.snapshot(draft.target)));
  // TargetPicker picks from the Optimiser's objectives; keep the draft on one Drop Check can judge.
  $effect(() => {
    if (allowed.length && !allowed.includes(draft.objective.kind)) draft.objective = { kind: allowed[0] };
  });
  const check = $derived(editing ? resolveDropGoal($state.snapshot(draft), character, characters) : null);

  function open(id, goal) {
    draft = structuredClone($state.snapshot(goal ?? NEW_GOAL));
    editing = id;
    confirmId = null;
  }
  function save() {
    if (!check?.ok) return;
    const goal = { target: check.goal.target, objective: $state.snapshot(draft.objective) };
    if (editing === 'new') onadd?.(goal);
    else onupdate?.(editing, goal);
    editing = null;
  }
  function remove(id) {
    if (confirmId !== id) {
      confirmId = id;
      return;
    }
    confirmId = null;
    if (editing === id) editing = null;
    onremove?.(id);
  }
  const realmNote = (r) => (!r.ok ? r.error : r.realm !== realm ? (r.realm === 'oblivion' ? 'Judges Oblivion drops only' : 'Judges base-realm drops only') : '');
</script>

<div class="goals" data-testid="drop-goals">
  {#if resolved.length}
    <ul class="list" aria-label="Goals">
      {#each resolved as r (r.goal.id)}
        <li class:off={!r.ok || r.realm !== realm} data-goal={r.goal.id}>
          <div class="txt">
            <span class="lbl">{r.label}</span>
            {#if realmNote(r)}<span class="note" class:bad={!r.ok}>{realmNote(r)}</span>{/if}
          </div>
          <div class="acts">
            <Button variant="ghost" size="small" disabled={editing !== null} onclick={() => open(r.goal.id, r.goal)}>Edit</Button>
            <Button variant="ghost" size="small" confirming={confirmId === r.goal.id} onclick={() => remove(r.goal.id)}>
              {confirmId === r.goal.id ? 'Confirm remove' : 'Remove'}
            </Button>
          </div>
        </li>
      {/each}
    </ul>
  {:else if editing === null}
    <p class="hint">
      No goals yet. A goal is a fight and what to get better at in it, as in the Optimiser: DPS against a boss, the
      chance to clear a dungeon, your win rate against saved opponents. Every drop is judged by each goal.
    </p>
  {/if}

  {#if editing !== null}
    <div class="editor" role="group" aria-label={editing === 'new' ? 'New goal' : 'Edit goal'}>
      <TargetPicker
        bind:target={draft.target}
        bind:objective={draft.objective}
        {character}
        oblivionUnlocked={character?.oblivion?.unlocked ?? false}
        playerLevel={character?.level}
        {opponents}
        {characters}
        onNavigate={go}
      />
      <Select
        label="Judge by"
        options={allowed.map((k) => ({ value: k, label: OBJECTIVE_LABEL[k] ?? k }))}
        value={draft.objective.kind}
        onchange={(v) => {
          draft.objective = { kind: v };
          if (v === 'arena-reward') draft.target = { ...draft.target, seats: 'attacker' };
        }}
      />
      {#if draft.objective.kind === 'arena-reward'}
        <ArenaRewardInputs bind:objective={draft.objective} target={draft.target} {opponents} />
      {/if}
      {#if draft.objective.kind === 'survival'}
        <NumberField
          label="Survive for (s)"
          unit="s"
          min={5}
          max={600}
          nullable
          value={draft.objective.seconds ?? null}
          onchange={(v) => (draft.objective = v == null ? { kind: 'survival' } : { kind: 'survival', seconds: Math.round(v) })}
        />
      {/if}
      {#if draft.objective.kind === 'fastest-clear'}
        <NumberField
          label="Tries"
          min={FASTEST_CLEAR_TRIES.min}
          max={FASTEST_CLEAR_TRIES.max}
          value={draft.objective.tries ?? FASTEST_CLEAR_TRIES.default}
          onchange={(v) => (draft.objective = { kind: 'fastest-clear', tries: Math.round(v) })}
        />
      {/if}
      {#if check && !check.ok}<p class="note bad">{check.error}</p>{/if}
      <div class="acts">
        <Button variant="primary" size="small" disabled={!check?.ok} reason={check?.error ?? ''} onclick={save}>{editing === 'new' ? 'Add goal' : 'Save goal'}</Button>
        <Button variant="ghost" size="small" onclick={() => (editing = null)}>Cancel</Button>
      </div>
    </div>
  {:else}
    <div>
      <Button variant="secondary" size="small" disabled={resolved.length >= max} reason={`At most ${max} goals`} onclick={() => open('new', null)}>+ Add goal</Button>
    </div>
  {/if}
</div>

<style>
  .goals { display: grid; gap: var(--sp-3); min-width: 0; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: var(--sp-2); }
  .list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: var(--sp-2);
    padding: var(--sp-2);
    background: var(--surface-2);
    border: 1px solid var(--line-hairline);
    border-radius: var(--r-1);
  }
  .list li.off .lbl { color: var(--text-soft); }
  .txt { display: grid; gap: var(--sp-1); min-width: 0; }
  .lbl { font-size: var(--fs-13); color: var(--text-ink); overflow-wrap: anywhere; }
  .acts { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
  .editor {
    display: grid;
    gap: var(--sp-3);
    padding: var(--sp-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
  }
  .hint,
  .note { margin: 0; font-size: var(--fs-12); color: var(--text-soft); }
  .note.bad { color: var(--status-warn); }
</style>
