<script>
  /**
   * BuildsSheetPage.svelte - B3 (plan §D U7): the in-game stat sheet of the active preset (Base realm) or
   * of the shared Oblivion realm, as one table of model value, your sheet and the gap. The sheet is per
   * preset; the Oblivion realm has one sheet (character.oblivion.sheet) owned by one preset. Status rules
   * (fresh / stale / unverified): data-model.md §6. `tab` is the optional third hash segment. Below the
   * sheet, the preset's simulated stat weights (backlog §9, StatWeightsPanel).
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { notify } from '../../lib/notify.svelte.js';
  import { computePresetStats } from '../../lib/build/stats.js';
  import { sourceContributions } from '../../lib/build/contribution.js';
  import { sheetKeysForClass, sheetKeyMeta, normaliseSheetValues } from '../../lib/engine/pipeline/sheet.js';
  import Panel from '../ui/Panel.svelte';
  import Menu from '../ui/Menu.svelte';
  import Banner from '../ui/Banner.svelte';
  import Button from '../ui/Button.svelte';
  import ProvenanceTag from '../ui/ProvenanceTag.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import SheetTable from '../builds/SheetTable.svelte';
  import AbsorbDialog from '../builds/AbsorbDialog.svelte';
  import PasteSheetDialog from '../builds/PasteSheetDialog.svelte';
  import StatWeightsPanel from '../statWeights/StatWeightsPanel.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const preset = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const unlocked = $derived(!!character.oblivion?.unlocked);

  // The realm is the one in the top bar (G2): this page has no realm switch of its own.
  const realm = $derived(unlocked && character.oblivion.activeRealm === 'oblivion' ? 'oblivion' : 'base');

  const stats = $derived(computePresetStats(character, preset.id, { realm }));
  const owner = $derived(realm === 'oblivion' ? (character.presets.find((p) => p.id === character.oblivion.sheet?.presetId) ?? null) : preset);
  const keys = $derived(
    sheetKeysForClass(character.class, realm).filter((k) => k !== 'totalDominion' && !sheetKeyMeta(k)?.isRaw),
  );
  const sheetValues = $derived(stats.sheet?.values ?? {});
  const needsConfirm = $derived(stats.sheetStatus === 'stale' || stats.sheetStatus === 'unverified');
  const ABSORB_KEYS = ['totalAttack', 'totalHp', 'totalAttackSpeed', 'totalCritChance', 'totalCritDamage'];
  const absorbable = $derived(ABSORB_KEYS.some((k) => stats.residual[k]));

  function writeSheet(values) {
    const clean = normaliseSheetValues(values);
    const next = Object.keys(clean).length ? clean : null;
    if (realm === 'oblivion') rosterStore.setOblivionSheet(next, preset.id);
    else rosterStore.setPresetSheet(preset.id, next);
  }
  // Copy from another preset (base realm): a menu of presets that have a sheet; replacing asks first.
  const sources = $derived(
    character.presets.filter((p) => p.id !== preset.id && p.sheet && Object.keys(p.sheet.values ?? {}).length),
  );
  let copyOpen = $state(false);
  let copyWrap = $state(null);
  let pendingCopy = $state(null);
  // A pending Replace belongs to the preset and realm it was asked on; drop it when either changes.
  $effect(() => {
    void preset.id;
    void realm;
    pendingCopy = null;
  });
  function closeCopy() {
    copyOpen = false;
    copyWrap?.querySelector('button[aria-haspopup]')?.focus();
  }
  function doCopy(from) {
    pendingCopy = null;
    if (!rosterStore.copyPresetSheet(from.id, preset.id)) return;
    notify(`Copied the in-game stats from ${from.name}. Confirm they match this build.`, { kind: 'success' });
  }
  function pickCopy(item) {
    closeCopy();
    const from = sources.find((p) => p.id === item.id);
    if (!from) return;
    if (stats.sheet) pendingCopy = from;
    else doCopy(from);
  }
  function confirmSheet() {
    if (realm === 'oblivion') rosterStore.confirmOblivionSheet(preset.id);
    else rosterStore.confirmPresetSheet(preset.id);
  }
  function onChange(key, value) {
    const next = { ...sheetValues };
    if (value === null) delete next[key];
    else next[key] = value;
    writeSheet(next);
  }

  let pasteOpen = $state(false);
  function applyPaste(values) {
    writeSheet(values);
    notify('Pasted in-game stats. Check them against the game.', { kind: 'success' });
  }

  // Absorb: preview in a dialog, write on confirm, one-step undo while this page is open.
  let absorbOpen = $state(false);
  let undo = $state(null);
  function absorb(base) {
    undo = { before: { ...character.baseResidual }, presetName: preset.name };
    rosterStore.setBaseResidual(base);
    notify("Added the difference to your character's base stats.", { kind: 'success' });
  }
  function undoAbsorb() {
    if (!undo) return;
    rosterStore.setBaseResidual(undo.before);
    undo = null;
    notify('Base stats put back as they were.', { kind: 'info' });
  }
</script>

<div class="stack">
  <p class="realm-line" data-testid="sheet-realm">
    {realm === 'oblivion' ? 'Oblivion realm: one sheet, shared by the character.' : `Base realm: the sheet of ${preset.name}.`}
    {#if unlocked}Change realm in the top bar.{/if}
  </p>

  {#if undo}
    <Banner variant="info" lead="Done.">
      The difference was added to your base stats. Every preset shares them.
      {#snippet action()}<Button variant="ghost" size="small" onclick={undoAbsorb}>Undo</Button>{/snippet}
    </Banner>
  {/if}

  <Panel title="Your in-game stats vs the app's numbers" level="primary" scope={realm === 'oblivion' ? 'oblivion' : 'preset'}>
    {#snippet meta()}
      <span class="source" data-testid="sheet-source">
        {stats.source === 'sheet' ? 'Using your in-game stats where entered' : "Using the app's numbers"}
      </span>
      {#if stats.sheetStatus === 'stale'}<ProvenanceTag kind="stale" />{:else if stats.source === 'sheet'}<ProvenanceTag kind="sheet" />{:else}<ProvenanceTag kind="model" />{/if}
      {#if needsConfirm}
        <Button variant="secondary" size="small" data-testid="sheet-confirm" onclick={confirmSheet}>Confirm these match this build</Button>
      {/if}
      {#if realm === 'base' && sources.length}
        <span class="copy-menu" bind:this={copyWrap}>
          <Button variant="ghost" size="small" data-testid="sheet-copy" aria-haspopup="menu" aria-expanded={copyOpen} onclick={() => (copyOpen = !copyOpen)}>
            Copy from preset ▾
          </Button>
          {#if copyOpen}
            <span class="drop">
              <Menu label="Copy in-game stats from" items={sources.map((p) => ({ id: p.id, label: p.name }))} onselect={pickCopy} onclose={closeCopy} />
            </span>
          {/if}
        </span>
      {/if}
      <Button variant="ghost" size="small" data-testid="sheet-paste" onclick={() => (pasteOpen = true)}>Paste stats</Button>
      <Button variant="ghost" size="small" disabled={absorbOpen || !absorbable} reason={absorbable ? '' : "The app already matches your in-game stats on the five base stats."} onclick={() => (absorbOpen = true)}>
        Add the difference to base stats
      </Button>
      <ConfirmButton variant="danger" size="small" label="Clear in-game stats" confirmLabel="Confirm clear" prompt="Clear these in-game stats?" disabled={!stats.sheet} onConfirm={() => writeSheet({})} />
    {/snippet}

    {#if realm === 'oblivion'}
      <p class="note" data-testid="oblivion-owner">
        {#if owner}
          These Oblivion stats belong to <b>{owner.name}</b>{owner.id === preset.id ? '' : '. They only apply to that preset'}.
        {:else}
          One set of Oblivion stats is shared by the whole realm, and it applies to the preset it was entered for. If you type numbers here,
          they will apply to <b>{preset.name}</b>.
        {/if}
      </p>
    {/if}
    {#if pendingCopy}
      <Banner variant="warn" lead="Replace your in-game stats?">
        <span data-testid="sheet-copy-prompt">Replace the in-game stats of {preset.name} with those of {pendingCopy.name}?</span>
        {#snippet action()}
          <Button variant="danger" size="small" data-testid="sheet-copy-confirm" onclick={() => doCopy(pendingCopy)}>Replace</Button>
          <Button variant="ghost" size="small" onclick={() => (pendingCopy = null)}>Cancel</Button>
        {/snippet}
      </Banner>
    {/if}
    {#if needsConfirm}
      <Banner variant="warn" lead={stats.sheetStatus === 'stale' ? 'Out of date.' : 'Not confirmed.'}>
        <span data-testid="sheet-status">{stats.warnings[stats.warnings.length - 1]}</span>
      </Banner>
    {/if}
    <p class="note">
      Type the numbers from your in-game character sheet. Leave a row blank to use the app's number. In flat rows, "." separates
      thousands ("48.124" is 48124). In percentage rows, it is a decimal point.
    </p>
    <SheetTable
      playerClass={character.class}
      {keys}
      values={sheetValues}
      computed={stats.computed}
      contributions={() => sourceContributions(character, preset.id, { realm })}
      {onChange}
    />
  </Panel>

  <StatWeightsPanel {character} {preset} {realm} />
</div>

<svelte:window onclick={(e) => copyOpen && copyWrap && !copyWrap.contains(e.target) && (copyOpen = false)} />

<AbsorbDialog bind:open={absorbOpen} {character} {stats} onconfirm={absorb} />
<PasteSheetDialog bind:open={pasteOpen} {keys} values={sheetValues} playerClass={character.class} onapply={applyPaste} />

<style>
  .realm-line { margin: 0; font-size: var(--fs-13); color: var(--text-soft); }
  .stack { display: grid; gap: var(--sp-3); }
  .note { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .copy-menu { position: relative; display: inline-block; }
  .drop { position: absolute; top: calc(100% + var(--sp-1)); right: 0; z-index: var(--z-popover); }
  .source { font-size: var(--fs-12); color: var(--text-soft); }
</style>
