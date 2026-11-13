<script>
  /**
   * GoalProfile.svelte - Drop Check's goal profiles (drop-check-goals.md §4.1): named goal lists on the character
   * ("Ranked", "Dailies"), one active. Pick, add (empty or a copy of the active one), rename, delete (never the last).
   *
   * Props: profiles ({id, name, goals}[]), activeId, max, onselect(id), onadd(name, copyFrom|null), onrename(id, name),
   * onremove(id).
   */
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';

  let { profiles = [], activeId, max = 8, onselect, onadd, onrename, onremove } = $props();

  let renaming = $state(false);
  let draft = $state('');
  const active = $derived(profiles.find((p) => p.id === activeId) ?? profiles[0]);
  const full = $derived(profiles.length >= max);

  function commit() {
    if (draft.trim()) onrename?.(active.id, draft);
    renaming = false;
  }
</script>

<div class="profile" data-testid="goal-profile">
  <Select
    label="Goal profile"
    value={active?.id}
    options={profiles.map((p) => ({ value: p.id, label: `${p.name} (${p.goals.length})` }))}
    onchange={(id) => onselect?.(id)}
  />
  <div class="acts">
    {#if renaming}
      <input
        type="text"
        class="name-input"
        aria-label="Profile name"
        maxlength={40}
        bind:value={draft}
        onkeydown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') renaming = false;
        }}
      />
      <Button variant="primary" size="small" onclick={commit}>Save</Button>
      <Button variant="ghost" size="small" onclick={() => (renaming = false)}>Cancel</Button>
    {:else}
      <Button variant="ghost" size="small" disabled={full} reason={`At most ${max} profiles`} onclick={() => onadd?.('', null)}>New</Button>
      <Button variant="ghost" size="small" disabled={full} reason={`At most ${max} profiles`} onclick={() => onadd?.(`${active.name} copy`, active.id)}>Copy</Button>
      <Button variant="ghost" size="small" onclick={() => { draft = active.name; renaming = true; }}>Rename</Button>
      {#if profiles.length > 1}
        <ConfirmButton size="small" label="Delete" prompt={`Delete ${active.name}?`} onConfirm={() => onremove?.(active.id)} />
      {/if}
    {/if}
  </div>
</div>

<style>
  .profile {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--sp-2) var(--sp-3);
    min-width: 0;
  }
  .acts { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-2); }
  .name-input {
    height: var(--control-h);
    padding: 0 var(--sp-2);
    background: var(--surface-3);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    color: var(--text-ink);
    font: inherit;
    font-size: var(--fs-13);
    min-width: 0;
  }
</style>
