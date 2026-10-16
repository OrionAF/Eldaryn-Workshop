<script>
  /**
   * CharacterOverviewPage.svelte - C1: identity (class, level) with the active preset's Combat Power
   * (build/power.js; the Power figure of design-system §4.38), the Oblivion unlock and the tier-1
   * base stats (ia.md §5.6). Lowering the level asks first: `previewLevelChange` lists what the
   * re-normalised character loses (model/legality.js, M1), and nothing is written until confirmed.
   */
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { CLASSES, classLabel, MAX_PLAYER_LEVEL } from '../../lib/game/classes.js';
  import { sigilBySpecies } from '../../lib/game/sigils.js';
  import { RESIDUAL_KEYS, defaultBaseResidual } from '../../lib/model/character.js';
  import { presetPower } from '../../lib/build/power.js';
  import { POWER_TERMS } from '../../lib/engine/power.js';
  import { formatFlat } from '../../lib/format.js';
  import ClassPrompt from '../shell/ClassPrompt.svelte';
  import Panel from '../ui/Panel.svelte';
  import Select from '../ui/Select.svelte';
  import Stepper from '../ui/Stepper.svelte';
  import NumberField from '../ui/NumberField.svelte';
  import Checkbox from '../ui/Checkbox.svelte';
  import Button from '../ui/Button.svelte';
  import Modal from '../Modal.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {}, tab = null } = $props();

  const character = $derived(rosterStore.current);
  const classless = $derived(!character?.class);
  const unlocked = $derived(character?.oblivion?.unlocked === true);

  // Combat Power of the active preset in the active realm (Game/stats.md §8)
  const activePreset = $derived(character?.presets?.find((p) => p.id === character.activePresetId) ?? character?.presets?.[0] ?? null);
  const realm = $derived(unlocked && character?.oblivion?.activeRealm === 'oblivion' ? 'oblivion' : 'base');
  const power = $derived.by(() => {
    if (!activePreset) return null;
    try {
      return presetPower(character, activePreset.id, { realm });
    } catch {
      return null;
    }
  });
  const TERM_LABEL = {
    equipment: 'Gear', sigils: 'Sigils', enchants: 'Stones', transcendence: 'Transcendence', pet: 'Pet',
    mount: 'Mount', relics: 'Relics', talents: 'Talents', awakening: 'Awakening', level: 'Level',
  };

  const classOptions = CLASSES.map((c) => ({ value: c, label: classLabel(c) }));
  const RESIDUAL = {
    attack: { label: 'Attack', statKey: 'totalAttack' },
    hp: { label: 'HP', statKey: 'totalHp' },
    attackSpeed: { label: 'Attack speed', unit: '×' },
    critChance: { label: 'Crit chance', unit: '%' },
    critDamage: { label: 'Crit damage', unit: '×' },
  };

  let classValue = $state(null);
  $effect(() => {
    classValue = character?.class ?? null;
  });
  function pickClass(cls) {
    if (cls && cls !== character.class) rosterStore.setCharacterClass(character.id, cls);
  }

  // --- Level ---
  let levelKey = $state(0); // remounts the stepper to show the stored level again after a cancel
  let pending = $state(null); // { level, preview } while the drop dialog is open
  let confirmOpen = $state(false);
  let saved = $state(false);

  function previewLines(p) {
    const lines = [];
    if (p.talentPointsLost > 0) lines.push(`${p.talentPointsLost} talent point${p.talentPointsLost === 1 ? '' : 's'} above the new cap`);
    for (const key of p.sigilsDropped) {
      const [presetId, species] = key.split(':');
      const preset = character.presets.find((x) => x.id === presetId);
      lines.push(`${sigilBySpecies(species)?.name ?? species} unequipped from ${preset?.name ?? 'a preset'}`);
    }
    if (p.relicsDropped > 0) lines.push(`${p.relicsDropped} equipped relic${p.relicsDropped === 1 ? '' : 's'} (slots unlock with level)`);
    if (p.awakeningPointsLost > 0) lines.push(`${p.awakeningPointsLost} Awakening level${p.awakeningPointsLost === 1 ? '' : 's'}`);
    for (const name of p.flagged ?? []) lines.push(`${name} is kept, but presets that use it are flagged and cannot be optimised until switched back`);
    for (const name of p.inert ?? []) lines.push(`${name} stops counting (kept, but does nothing below its unlock level)`);
    return lines;
  }
  function applyLevel(n) {
    rosterStore.setCharacterLevel(n);
    saved = true; // the inline tick is the confirmation (ia.md §5.6), no toast
  }
  function onLevel(n) {
    const preview = rosterStore.previewLevelChange(n);
    if (preview && previewLines(preview).length > 0) {
      pending = { level: n, preview };
      confirmOpen = true;
      return;
    }
    applyLevel(n);
  }
  function confirmLevel() {
    const n = pending.level;
    confirmOpen = false;
    pending = null;
    applyLevel(n);
  }
  function cancelLevel() {
    confirmOpen = false;
    pending = null;
    levelKey += 1;
  }

  // --- Oblivion ---
  function onOblivion(checked) {
    rosterStore.setOblivionUnlocked(checked);
    rosterStore.reconcileSkillLevels();
  }

  // --- Base stats ---
  function setResidual(key, v) {
    if (Number.isFinite(v) && v >= 0) rosterStore.setBaseResidual({ [key]: v });
  }
  const isDefault = $derived.by(() => {
    const d = defaultBaseResidual();
    return RESIDUAL_KEYS.every((k) => character.baseResidual[k] === d[k]);
  });
</script>

{#if character}
  <div class="overview">
    {#if classless}
      <ClassPrompt />
    {/if}

    <Panel title="Identity">
      <div class="identity">
        <Select label="Class" options={classOptions} bind:value={classValue} onchange={pickClass} hint="Changing class drops what the new class cannot use." />
        <div class="level">
          <span class="level-label" id="level-label">Level (1-{MAX_PLAYER_LEVEL})</span>
          {#key levelKey}
            <Stepper label="Level" value={character.level} min={1} max={MAX_PLAYER_LEVEL} onchange={onLevel} />
          {/key}
          <span class="tick" role="status" aria-live="polite">{saved ? 'Saved' : ''}</span>
        </div>
        {#if power}
          <div class="power" data-testid="combat-power">
            <span class="micro-label">Combat Power · {activePreset.name}{realm === 'oblivion' ? ' · Oblivion' : ''}</span>
            <span class="hero">{formatFlat(power.power)}</span>
            <details>
              <summary>Breakdown</summary>
              <dl class="terms">
                {#each POWER_TERMS as t (t)}<dt>{TERM_LABEL[t]}</dt><dd>{formatFlat(power.terms[t])}</dd>{/each}
              </dl>
            </details>
            {#if power.gaps.length}
              <span class="tick" data-testid="power-gaps">At least this much: some gear has no {power.gaps.includes('rarity') ? 'rarity' : 'item level'} recorded.</span>
            {/if}
          </div>
        {/if}
      </div>
    </Panel>

    <Panel title="Oblivion" scope="oblivion">
      <Checkbox checked={unlocked} label="Oblivion unlocked" onchange={onOblivion} />
      <p class="note">
        Unlocking adds the Oblivion realm (its own gear and stones, and the Oblivion floors tool) and one extra
        level on the Oblivion skills. Locking returns skills to their normal cap.
      </p>
    </Panel>

    <Panel title="Base stats">
      <p class="note">Your starting stats before any gear. They begin at the game's own values. To match them to your in-game stats, use "Add the difference to base stats" on the Stat Sheet page.</p>
      <div class="residual">
        {#each RESIDUAL_KEYS as key (key)}
          <NumberField
            label={RESIDUAL[key].label}
            statKey={RESIDUAL[key].statKey ?? null}
            unit={RESIDUAL[key].unit ?? ''}
            min={0}
            value={character.baseResidual[key]}
            onchange={(v) => setResidual(key, v)}
          />
        {/each}
      </div>
      <div class="actions">
        <Button variant="ghost" disabled={isDefault} onclick={() => rosterStore.setBaseResidual(defaultBaseResidual())}>Reset to game defaults</Button>
        <Button variant="ghost" onclick={() => onNavigate('builds/sheet')}>Open Stat Sheet</Button>
      </div>
    </Panel>
  </div>

  <Modal bind:open={confirmOpen} title="Lower level to {pending?.level ?? ''}?" onclose={cancelLevel}>
    {#snippet children()}
      {#if pending}
        <p>This level does not unlock everything the character has set up. Changing it will drop or switch off:</p>
        <ul class="drops">
          {#each previewLines(pending.preview) as line (line)}<li>{line}</li>{/each}
        </ul>
      {/if}
    {/snippet}
    {#snippet footer()}
      <Button variant="ghost" onclick={cancelLevel}>Keep level {character.level}</Button>
      <Button variant="danger" onclick={confirmLevel}>Lower level and drop these</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  .overview { display: grid; gap: var(--sp-4); max-width: 56rem; }
  .identity { display: flex; flex-wrap: wrap; gap: var(--sp-6); align-items: flex-start; }
  .level { display: grid; gap: 4px; }
  .level-label { font-size: var(--fs-12); font-weight: var(--fw-bold); color: var(--text-soft); }
  .tick { font-size: var(--fs-12); color: var(--text-muted); min-height: 1em; }
  .power { display: grid; gap: var(--sp-1); }
  .power .micro-label { color: var(--brass-400); }
  .hero { font-family: var(--font-data); font-variant-numeric: tabular-nums; font-size: var(--fs-34); font-weight: var(--fw-medium); line-height: 1; letter-spacing: -0.01em; color: var(--text-ink); }
  @media (max-width: 700px) { .hero { font-size: var(--fs-26); } }
  .power summary { cursor: pointer; font-size: var(--fs-12); color: var(--text-soft); }
  .terms { display: grid; grid-template-columns: auto auto; gap: 2px var(--sp-3); margin: var(--sp-1) 0 0; font-size: var(--fs-12); }
  .terms dt { color: var(--text-soft); }
  .terms dd { margin: 0; text-align: right; font-family: var(--font-data); font-variant-numeric: tabular-nums; color: var(--text-ink); }
  .note { margin: 0 0 var(--sp-3); color: var(--text-soft); font-size: var(--fs-13); }
  .residual { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr)); gap: var(--sp-3); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--sp-2); margin-top: var(--sp-3); }
  .drops { margin: 0; padding-left: var(--sp-5); display: grid; gap: var(--sp-1); }
</style>
