<script>
  /**
   * TargetPicker.svelte - what the optimiser fights and what it scores (F2b). `target` and `objective` are
   * bindable plain specs in the shapes search/objectives.js resolveTarget / makeObjective accept; the
   * objective list follows objectiveKindsFor(target.kind).
   */
  import contentData from '../../data/game/pve-content.json';
  import { TARGET_KINDS, objectiveKindsFor } from '../../lib/search/objectives.js';
  import { chapterLabel } from '../../lib/game/combatPve.js';

  let { target = $bindable(), objective = $bindable(), oblivionUnlocked = false } = $props();

  const KIND_LABEL = {
    dummy: 'Training dummy',
    chapter: 'Campaign chapter',
    dungeon: 'Dungeon',
    oblivion: 'Oblivion floor',
    worldBoss: 'World boss',
    custom: 'Custom mob',
  };
  const OBJ_LABEL = {
    dps: 'Damage per second',
    'ttk-median': 'Time to kill, median',
    'ttk-p90': 'Time to kill, slow end (P90)',
    survival: 'Survival chance',
  };
  const DEFAULTS = {
    dummy: { kind: 'dummy', seconds: 60 },
    chapter: { kind: 'chapter', chapter: 1, level: 1 },
    dungeon: { kind: 'dungeon', id: 'dungeon_1', step: 1 },
    oblivion: { kind: 'oblivion', floor: 1 },
    worldBoss: { kind: 'worldBoss', affinity: 'NONE' },
    custom: { kind: 'custom', mob: { hp: 1000000, attack: 10000, attackSpeed: 1 }, seconds: 60 },
  };

  const dungeons = contentData.classicDungeons ?? [];
  const kinds = $derived(TARGET_KINDS.filter((k) => k !== 'oblivion' || oblivionUnlocked || target.kind === 'oblivion'));
  const objectives = $derived(objectiveKindsFor(target.kind));

  function pickKind(kind) {
    target = { ...DEFAULTS[kind] };
    if (!objectiveKindsFor(kind).includes(objective.kind)) objective = { kind: objectiveKindsFor(kind)[0] };
  }

  const intOf = (e, min, max) => Math.max(min, Math.min(max, Math.floor(Number(e.currentTarget.value)) || min));
  const numOf = (e, min) => Math.max(min, Number(e.currentTarget.value) || min);
</script>

<div class="picker" data-testid="target-picker">
  <label class="field">
    <span class="micro-label">Target</span>
    <select value={target.kind} onchange={(e) => pickKind(e.currentTarget.value)} data-testid="target-kind">
      {#each kinds as k (k)}<option value={k}>{KIND_LABEL[k]}</option>{/each}
    </select>
  </label>

  {#if target.kind === 'dummy'}
    <label class="field">
      <span class="micro-label">Seconds</span>
      <input class="mono" type="number" min="5" max="600" value={target.seconds} onchange={(e) => (target = { ...target, seconds: intOf(e, 5, 600) })} />
    </label>
  {:else if target.kind === 'chapter'}
    <label class="field">
      <span class="micro-label">Chapter</span>
      <input class="mono" type="number" min="1" max="22" value={target.chapter} onchange={(e) => (target = { ...target, chapter: intOf(e, 1, 22) })} />
      <span class="chapter-name" data-testid="chapter-name">{chapterLabel(target.chapter)}</span>
    </label>
    <label class="field">
      <span class="micro-label">Level</span>
      <input class="mono" type="number" min="1" max="10" value={target.level} onchange={(e) => (target = { ...target, level: intOf(e, 1, 10) })} />
    </label>
  {:else if target.kind === 'dungeon'}
    <label class="field">
      <span class="micro-label">Dungeon</span>
      <select value={target.id} onchange={(e) => (target = { ...target, id: e.currentTarget.value })}>
        {#each dungeons as d (d.id)}<option value={d.id}>{d.name}</option>{/each}
      </select>
    </label>
    <label class="field">
      <span class="micro-label">Step</span>
      <input class="mono" type="number" min="1" max="8" value={target.step} onchange={(e) => (target = { ...target, step: intOf(e, 1, 8) })} />
    </label>
  {:else if target.kind === 'oblivion'}
    <label class="field">
      <span class="micro-label">Floor</span>
      <input class="mono" type="number" min="1" max="999" value={target.floor} onchange={(e) => (target = { ...target, floor: intOf(e, 1, 999) })} />
    </label>
  {:else if target.kind === 'worldBoss'}
    <label class="field">
      <span class="micro-label">Affinity</span>
      <select value={target.affinity} onchange={(e) => (target = { ...target, affinity: e.currentTarget.value })}>
        <option value="NONE">None</option>
        <option value="FORTIFIED">Fortified</option>
        <option value="ENRAGED">Enraged</option>
      </select>
    </label>
  {:else if target.kind === 'custom'}
    <label class="field">
      <span class="micro-label">Mob HP</span>
      <input class="mono" type="number" min="1" value={target.mob.hp} onchange={(e) => (target = { ...target, mob: { ...target.mob, hp: numOf(e, 1) } })} />
    </label>
    <label class="field">
      <span class="micro-label">Mob attack</span>
      <input class="mono" type="number" min="0" value={target.mob.attack} onchange={(e) => (target = { ...target, mob: { ...target.mob, attack: numOf(e, 0) } })} />
    </label>
    <label class="field">
      <span class="micro-label">Mob attack speed</span>
      <input class="mono" type="number" min="0.1" step="0.1" value={target.mob.attackSpeed} onchange={(e) => (target = { ...target, mob: { ...target.mob, attackSpeed: numOf(e, 0.1) } })} />
    </label>
  {/if}

  <label class="field">
    <span class="micro-label">Maximise</span>
    <select value={objective.kind} onchange={(e) => (objective = { ...objective, kind: e.currentTarget.value })} data-testid="objective-kind">
      {#each objectives as k (k)}<option value={k}>{OBJ_LABEL[k]}</option>{/each}
    </select>
  </label>

  {#if objective.kind === 'survival'}
    <label class="field">
      <span class="micro-label">Survive for (s)</span>
      <input class="mono" type="number" min="5" max="600" value={objective.seconds ?? 60} onchange={(e) => (objective = { ...objective, seconds: intOf(e, 5, 600) })} />
    </label>
  {/if}
</div>

<style>
  .picker { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field input { width: 96px; }
  .chapter-name { color: var(--color-muted); font-size: 11px; }
</style>
