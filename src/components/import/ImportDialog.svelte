<script>
  /**
   * ImportDialog.svelte - G3. One dialog for every JSON kind (ia.md §3.1, §3.2, §5.4): choose a file or paste,
   * then a report of what was recognised and what confirming will do. Nothing is written before the
   * confirm button; a rejected text shows the specific reason on the choose step. State and actions live in
   * lib/importFlow.svelte.js.
   */
  import Modal from '../Modal.svelte';
  import Button from '../ui/Button.svelte';
  import Banner from '../ui/Banner.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import SegmentedControl from '../ui/SegmentedControl.svelte';
  import { unitFor } from './importUnits.js';
  import { classLabel } from '../../lib/game/classes.js';
  import { describeReportEntry } from '../../lib/importPlan.js';
  import {
    importFlow,
    closeImport,
    confirmImport,
    backToChoose,
    setImportMode,
    setBackupFirst,
  } from '../../lib/importFlow.svelte.js';

  const plan = $derived(importFlow.plan);
  const title = $derived(
    !plan ? 'Import' : { profile: 'Import a game profile', opponent: 'Import a Rankings profile', roster: 'Restore a backup', lootBag: 'Loot bag', fightLog: 'Fight log' }[plan.kind],
  );
  const notes = $derived((plan?.report ?? []).map(describeReportEntry));
  const replacing = $derived(plan?.kind === 'roster' && plan.replaces.characters > 0);
  const updating = $derived(plan?.kind === 'profile' && !!plan.match && importFlow.mode === 'update');
  const confirmLabel = $derived(
    !plan
      ? ''
      : plan.kind === 'opponent'
        ? plan.match ? `Update ${plan.match.name}` : 'Save as opponent'
        : plan.kind === 'profile'
        ? updating
          ? `Update ${plan.match.name}`
          : 'Create character'
        : plan.kind === 'roster'
          ? replacing
            ? 'Replace all characters'
            : 'Restore backup'
          : plan.kind === 'lootBag'
            ? 'Open Drop Check'
            : 'Open the replay check',
  );
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
</script>

<Modal open={importFlow.open && !!plan} {title} onclose={closeImport}>
  {#snippet children()}
    {#if !plan}
      <!-- never open without a report: the file / paste step is Settings > Import (ImportSection) -->
    {:else if plan.kind === 'profile'}
      <div class="report">
        <p class="lead"><b>{plan.character.name}</b>, {classLabel(plan.character.class)}, level {plan.character.level}</p>
        {#if plan.match}
          <SegmentedControl
            label="What to do with it"
            value={importFlow.mode}
            options={[
              { value: 'update', label: `Update ${plan.match.name}` },
              { value: 'create', label: 'Add as a new character' },
            ]}
            onchange={setImportMode}
          />
        {/if}
        {#if updating}
          <section aria-label="What will change">
            <h3>What will change</h3>
            {#if plan.diff.unchanged}
              <p class="muted">Nothing differs from what {plan.match.name} already has.</p>
            {:else}
              <ul>{#each plan.diff.lines as line (line)}<li>{line}</li>{/each}</ul>
            {/if}
            <p class="muted">Presets that came from the game are updated. Presets you made in the app, saved opponents and run history are kept. You can undo the update once, in Settings, Data.</p>
          </section>
        {:else}
          <section aria-label="What was read">
            <h3>What was read</h3>
            <ul class="counts">
              {#each plan.counts.filter((c) => c.count > 0) as c (c.id)}<li><span>{c.label}</span><b>{c.count}</b> <span class="muted">{unitFor(c.count, c.unit)}</span></li>{/each}
            </ul>
            {#if plan.sheet}
              <p>Your in-game stats are loaded into preset <b>{plan.sheet.presetName}</b>.</p>
            {:else}
              <p class="muted">No in-game stats in this profile.</p>
            {/if}
          </section>
        {/if}
        {#if notes.length}
          <section aria-label="Filled in or removed">
            <h3>Filled in or removed</h3>
            <ul>{#each notes as n, i (i)}<li class={n.tone}>{n.text}</li>{/each}</ul>
          </section>
        {/if}
        {#if plan.pendingItems > 0}
          <Banner variant="info">This profile also holds {plural(plan.pendingItems, 'pending drop')}. Check them in Drop Check after importing.</Banner>
        {/if}
        <p class="muted">Never read: player id, clan, quests, shop, currencies.</p>
      </div>
    {:else if plan.kind === 'opponent'}
      <div class="report">
        <p class="lead"><b>{plan.opponent.name}</b>, {classLabel(plan.opponent.class)}, level {plan.opponent.imported?.level}</p>
        <p>
          {plan.match ? `Refreshes the saved opponent ${plan.match.name} (the same player).` : 'Saved as a new PVP opponent.'}
          Its stats are taken as the game shows them. Its {plural(plan.sigils, 'worn sigil')}, altar tier and major glyphs decide its moves.
        </p>
        {#if plan.full}
          <Banner variant="warn" lead="Opponent library full">Remove a saved opponent on the Opponents page first.</Banner>
        {/if}
        <p class="muted">Only the display name and the player id (to refresh it later) are kept. Gear, pet, mount and relics are not used for an opponent.</p>
      </div>
    {:else if plan.kind === 'roster'}
      <div class="report">
        <p class="lead">A backup with {plural(plan.incoming.length, 'character')}{plan.v1 ? ' (an older version, converted)' : ''}.</p>
        <ul class="counts">
          {#each plan.incoming as c, i (i)}<li><span>{c.name}</span><b>{c.class ? classLabel(c.class) : 'no class'}</b> <span class="muted">level {c.level}, {plural(c.presets, 'preset')}</span></li>{/each}
        </ul>
        {#if replacing}
          <Banner variant="warn" lead="Replace all characters?">
            This replaces your {plural(plan.replaces.characters, 'character')} and {plural(plan.replaces.presets, 'preset')} with the backup.
          </Banner>
          <Checkbox checked={importFlow.backupFirst} label="Download my current characters first" onchange={setBackupFirst} />
        {/if}
        {#if notes.length}
          <section aria-label="Filled in or removed">
            <h3>Filled in or removed</h3>
            <ul>{#each notes as n, i (i)}<li class={n.tone}>{n.text}</li>{/each}</ul>
          </section>
        {/if}
      </div>
    {:else if plan.kind === 'lootBag'}
      <div class="report">
        <p class="lead">A loot bag with {plural(plan.items, 'item')}{plan.oblivionItems ? `, ${plan.oblivionItems} for Oblivion` : ''}.</p>
        <p class="muted">Drop Check judges each item against your sets and presets. Nothing about your characters changes here.</p>
      </div>
    {:else}
      <div class="report">
        <p class="lead">An arena fight log with {plural(plan.ticks, 'event')}.</p>
        <p class="muted">The replay check compares it with the combat rules. Nothing about your characters changes here.</p>
      </div>
    {/if}
    {#if plan && importFlow.error}<Banner variant="error">{importFlow.error}</Banner>{/if}
  {/snippet}
  {#snippet footer()}
    {#if plan}
      <Button variant="ghost" onclick={backToChoose}>Back</Button>
      <Button variant="ghost" onclick={closeImport}>Cancel</Button>
      <Button variant={replacing ? 'danger' : 'primary'} onclick={confirmImport}>{confirmLabel}</Button>
    {:else}
      <Button variant="ghost" onclick={closeImport}>Cancel</Button>
    {/if}
  {/snippet}
</Modal>

<style>
  .report { display: grid; gap: var(--sp-3); font-size: var(--fs-13); }
  .lead { margin: 0; font-size: var(--fs-16); }
  h3 { margin: 0 0 var(--sp-1); font-size: var(--fs-13); color: var(--text-soft); text-transform: uppercase; letter-spacing: 0.06em; }
  ul { margin: 0; padding-left: var(--sp-4); display: grid; gap: 2px; }
  .counts { list-style: none; padding: 0; }
  .counts li { display: flex; gap: var(--sp-2); align-items: baseline; }
  .counts li span:first-child { min-width: 9rem; color: var(--text-soft); }
  .muted { color: var(--text-muted); margin: 0; }
  li.warn { color: var(--status-warn); }
  .counts b { font-family: var(--font-data); font-variant-numeric: tabular-nums; }
  p { margin: 0; }
</style>
