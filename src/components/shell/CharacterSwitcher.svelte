<script>
  /**
   * CharacterSwitcher.svelte - G1 (ia.md §2.1). The button shows the current character; its menu
   * switches character or opens the New / Edit dialogs. New requires name + class (a character can
   * no longer be made without a class through the UI). Delete is disabled for the last character.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { CLASSES, classLabel } from '../../lib/game/classes.js';
  import { go } from '../../lib/router.svelte.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { AFTER_IMPORT_PAGE_ID } from '../../lib/routes.js';
  import Menu from '../ui/Menu.svelte';
  import Select from '../ui/Select.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import Modal from '../Modal.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import ClassCrest from './ClassCrest.svelte';

  const NONE = '';
  const classOptions = (placeholder) => [{ value: NONE, label: placeholder }, ...CLASSES.map((c) => ({ value: c, label: classLabel(c) }))];

  const character = $derived(rosterStore.current);
  const characters = $derived(rosterStore.roster.characters);

  let menuOpen = $state(false);
  let newOpen = $state(false);
  let editOpen = $state(false);
  let newName = $state('');
  let newClass = $state(NONE);
  let newLevel = $state('');
  let editName = $state('');
  let editClass = $state(NONE);

  const sub = (c) => `${c.class ? classLabel(c.class) : 'No class'} · Lv ${c.level ?? 1}`;
  const items = $derived([
    ...characters.map((c) => ({
      id: c.id,
      label: c.name,
      meta: `${sub(c)} · ${c.presets.length} preset${c.presets.length === 1 ? '' : 's'}`,
      checked: c.id === character.id,
    })),
    { id: '-sep', separator: true },
    { id: '__new', label: '+ New character' },
    { id: '__edit', label: 'Edit character' },
  ]);

  function onSelect(item) {
    menuOpen = false;
    if (item.id === '__new') {
      newName = '';
      newClass = NONE;
      newLevel = '';
      newOpen = true;
    } else if (item.id === '__edit') {
      editName = character.name;
      editClass = character.class ?? NONE;
      editOpen = true;
    } else if (item.id !== character.id) {
      rosterStore.selectCharacter(item.id);
      notify(`Switched to ${rosterStore.current.name}`);
    }
  }

  const canCreate = $derived(newName.trim() !== '' && newClass !== NONE);
  const createReason = $derived(newName.trim() === '' ? 'Enter a name' : newClass === NONE ? 'Choose a class' : '');

  function create() {
    if (!canCreate) return;
    rosterStore.addCharacter(newName.trim(), newClass);
    const level = Math.trunc(Number(newLevel));
    if (newLevel !== '' && Number.isFinite(level)) rosterStore.setCharacterLevel(level);
    newOpen = false;
    notify(`Created ${rosterStore.current.name}`, { kind: 'success' });
    go(AFTER_IMPORT_PAGE_ID);
  }

  function rename() {
    if (editName.trim() === '') return;
    rosterStore.renameCharacter(character.id, editName);
  }

  function changeClass(value) {
    rosterStore.setCharacterClass(character.id, value === NONE ? null : value);
  }

  function remove() {
    const name = character.name;
    if (rosterStore.deleteCharacter(character.id)) {
      editOpen = false;
      notify(`Deleted ${name}`);
    }
  }
</script>

<div class="switcher">
  <button
    type="button"
    class="current"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => (menuOpen = !menuOpen)}
  >
    <ClassCrest cls={character.class} />
    <span class="text">
      <b class="name">{character.name}</b>
      <span class="sub">{sub(character)}</span>
    </span>
    <span class="chev" aria-hidden="true">▾</span>
  </button>
  {#if menuOpen}
    <div class="pop">
      <Menu label="Characters" {items} onselect={onSelect} onclose={() => (menuOpen = false)} />
    </div>
  {/if}
</div>

<Modal bind:open={newOpen} title="New character">
  {#snippet children()}
    <form class="form" onsubmit={(e) => { e.preventDefault(); create(); }}>
      <label class="text-field">
        <span>Name</span>
        <input type="text" bind:value={newName} autocomplete="off" />
      </label>
      <Select label="Class" options={classOptions('Choose class...')} bind:value={newClass} />
      <label class="text-field">
        <span>Level (optional)</span>
        <input type="number" min="1" max="100" inputmode="numeric" bind:value={newLevel} />
      </label>
    </form>
  {/snippet}
  {#snippet footer()}
    <Button variant="quiet" onclick={() => (newOpen = false)}>Cancel</Button>
    <Button variant="primary" disabled={!canCreate} reason={createReason} onclick={create}>Create character</Button>
  {/snippet}
</Modal>

<Modal bind:open={editOpen} title="Edit character">
  {#snippet children()}
    <div class="form">
      <label class="text-field">
        <span>Name</span>
        <input
          type="text"
          bind:value={editName}
          autocomplete="off"
          onkeydown={(e) => e.key === 'Enter' && rename()}
          onblur={rename}
        />
      </label>
      <Select label="Class" options={classOptions('No class')} bind:value={editClass} onchange={changeClass} />
      {#if editClass === NONE}
        <Banner variant="warn" lead="No class.">Most pages need a class; choose one on Overview before using them.</Banner>
      {/if}
      <div>
        <ConfirmButton
          label="Delete character"
          confirmLabel="Confirm delete"
          prompt={`Delete "${character.name}"?`}
          disabled={characters.length <= 1}
          onConfirm={remove}
        />
        {#if characters.length <= 1}<p class="hint">The last character cannot be deleted.</p>{/if}
      </div>
    </div>
  {/snippet}
  {#snippet footer()}
    <Button variant="primary" onclick={() => (editOpen = false)}>Done</Button>
  {/snippet}
</Modal>

<style>
  .switcher { position: relative; }
  .current {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: var(--control-h);
    padding: 2px var(--sp-2);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--r-1);
    color: var(--text-ink);
    text-align: left;
    cursor: pointer;
  }
  .current:hover { background: var(--surface-3); border-color: var(--line-control-hover); }
  .text { display: grid; line-height: 1.15; min-width: 0; }
  .name { font-size: var(--fs-14); max-width: 16ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { font-size: var(--fs-12); color: var(--text-muted); white-space: nowrap; }
  .chev { color: var(--text-muted); }
  .pop { position: absolute; top: calc(100% + var(--sp-1)); left: 0; min-width: 280px; z-index: var(--z-popover); }
  .form { display: grid; gap: var(--sp-3); }
  .text-field { display: grid; gap: 4px; }
  .text-field span { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .text-field input {
    height: var(--control-h);
    padding: 0 var(--sp-2);
    background: var(--surface-3);
    color: var(--text-ink);
    border: 1px solid var(--line-control);
    border-radius: var(--r-1);
    font-size: var(--fs-14);
  }
  .hint { margin: var(--sp-1) 0 0; font-size: var(--fs-12); color: var(--text-muted); }
  @media (max-width: 700px) {
    .text, .chev { display: none; }
  }
</style>
