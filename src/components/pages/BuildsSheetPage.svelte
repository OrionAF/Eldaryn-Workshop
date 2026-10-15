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
  import Tabs from '../ui/Tabs.svelte';
  import Banner from '../ui/Banner.svelte';
  import Button from '../ui/Button.svelte';
  import ProvenanceTag from '../ui/ProvenanceTag.svelte';
  import ConfirmButton from '../ConfirmButton.svelte';
  import SheetTable from '../builds/SheetTable.svelte';
  import AbsorbDialog from '../builds/AbsorbDialog.svelte';
  import StatWeightsPanel from '../statWeights/StatWeightsPanel.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const preset = $derived(character.presets.find((p) => p.id === character.activePresetId) ?? character.presets[0]);
  const unlocked = $derived(!!character.oblivion?.unlocked);

  let chosen = $state(null);
  const realm = $derived(unlocked && (chosen ?? (character.oblivion.activeRealm === 'oblivion' ? 'oblivion' : 'base')) === 'oblivion' ? 'oblivion' : 'base');
  const tabItems = $derived([
    { id: 'base', label: `Base realm: ${preset.name}` },
    { id: 'oblivion', label: 'Oblivion realm: shared', disabled: !unlocked, reason: 'Unlock Oblivion on Overview first.' },
  ]);

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

  // Absorb: preview in a dialog, write on confirm, one-step undo while this page is open.
  let absorbOpen = $state(false);
  let undo = $state(null);
  function absorb(base) {
    undo = { before: { ...character.baseResidual }, presetName: preset.name };
    rosterStore.setBaseResidual(base);
    notify('Absorbed the sheet gap into the character base stats.', { kind: 'success' });
  }
  function undoAbsorb() {
    if (!undo) return;
    rosterStore.setBaseResidual(undo.before);
    undo = null;
    notify('Restored the base stats from before the absorb.', { kind: 'info' });
  }
</script>

<div class="stack">
  <Tabs items={tabItems} value={realm} label="Realm" idPrefix="sheet" onchange={(v) => (chosen = v)} />

  {#if undo}
    <Banner variant="info" lead="Absorbed.">
      The gap was moved into the base stats, which every preset shares.
      {#snippet action()}<Button variant="ghost" size="small" onclick={undoAbsorb}>Undo</Button>{/snippet}
    </Banner>
  {/if}

  <Panel title="Your sheet vs the model" level="primary" scope={realm === 'oblivion' ? 'oblivion' : 'preset'}>
    {#snippet meta()}
      <span class="source" data-testid="sheet-source">
        {stats.source === 'sheet' ? 'Using your sheet where entered' : 'Using computed totals'}
      </span>
      {#if stats.sheetStatus === 'stale'}<ProvenanceTag kind="stale" />{:else if stats.source === 'sheet'}<ProvenanceTag kind="sheet" />{:else}<ProvenanceTag kind="model" />{/if}
      {#if needsConfirm}
        <Button variant="secondary" size="small" data-testid="sheet-confirm" onclick={confirmSheet}>Confirm sheet matches this build</Button>
      {/if}
      <Button variant="ghost" size="small" disabled={absorbOpen || !absorbable} reason={absorbable ? '' : 'The model already matches the sheet on the five base stats.'} onclick={() => (absorbOpen = true)}>
        Absorb into base
      </Button>
      <ConfirmButton variant="danger" size="small" label="Clear sheet" confirmLabel="Confirm clear" prompt="Clear this sheet?" disabled={!stats.sheet} onConfirm={() => writeSheet({})} />
    {/snippet}

    {#if realm === 'oblivion'}
      <p class="note" data-testid="oblivion-owner">
        {#if owner}
          This Oblivion sheet belongs to <b>{owner.name}</b>{owner.id === preset.id ? '' : '; it applies only to that preset'}.
        {:else}
          The Oblivion sheet is shared by the realm and applies to the preset it was entered for. Entering numbers here makes
          <b>{preset.name}</b> its owner.
        {/if}
      </p>
    {/if}
    {#if needsConfirm}
      <Banner variant="warn" lead={stats.sheetStatus === 'stale' ? 'Stale.' : 'Unconfirmed.'}>
        <span data-testid="sheet-status">{stats.warnings[stats.warnings.length - 1]}</span>
      </Banner>
    {/if}
    <p class="note">
      Type the numbers from the in-game character sheet. Leave a row blank to use the model's value. Flat rows read "." as a
      thousands separator ("48.124" is 48124); percentage rows read it as a decimal point.
    </p>
    <SheetTable
      {keys}
      values={sheetValues}
      computed={stats.computed}
      contributions={() => sourceContributions(character, preset.id, { realm })}
      {onChange}
    />
  </Panel>

  <StatWeightsPanel {character} {preset} {realm} />
</div>

<AbsorbDialog bind:open={absorbOpen} {character} {stats} onconfirm={absorb} />

<style>
  .stack { display: grid; gap: var(--sp-3); }
  .note { margin: 0; color: var(--text-muted); font-size: var(--fs-12); }
  .source { font-size: var(--fs-12); color: var(--text-soft); }
</style>
