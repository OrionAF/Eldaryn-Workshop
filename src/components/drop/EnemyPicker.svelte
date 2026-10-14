<script>
  /**
   * EnemyPicker.svelte - the PVE target for Drop Check's survival metric: a campaign chapter and
   * level, a classic dungeon step, or (Oblivion realm) a dungeon floor. Emits a spec for
   * features/swap.js buildEnemy().
   *
   * Props: value ({kind, ...}), realm ('base'|'oblivion'), onchange(spec).
   */
  import { PVE_CHAPTERS, PVE_HARD_CHAPTERS, PVE_PROGRESS_CONSTANTS } from '../../lib/game/combatPve.js';
  import { CLASSIC_DUNGEONS, OBLIVION_FLOORS } from '../../lib/game/pveContent.js';

  let { value, realm = 'base', onchange } = $props();

  const levels = Array.from({ length: PVE_PROGRESS_CONSTANTS.levelsPerChapter }, (_, i) => i + 1);
  const kinds = $derived(
    realm === 'oblivion'
      ? [{ id: 'oblivion', label: 'Oblivion floor' }]
      : [{ id: 'campaign', label: 'Campaign' }, { id: 'dungeon', label: 'Dungeon' }],
  );
  const kind = $derived(kinds.some((k) => k.id === value?.kind) ? value.kind : kinds[0].id);

  const chapters = [
    ...PVE_CHAPTERS.map((c) => ({ chapter: c.chapter, label: `${c.chapter}. ${c.name}` })),
    ...PVE_HARD_CHAPTERS.map((c) => ({ chapter: c.chapter, label: `Hard: ${c.name}` })),
  ];
  const steps = Array.from({ length: 8 }, (_, i) => i + 1);

  function pickKind(k) {
    if (k === 'campaign') onchange({ kind: 'campaign', chapter: 1, level: 1 });
    else if (k === 'dungeon') onchange({ kind: 'dungeon', id: CLASSIC_DUNGEONS[0].id, step: 1 });
    else onchange({ kind: 'oblivion', floor: 10 });
  }
  const patch = (p) => onchange({ ...value, ...p });
</script>

<div class="enemy-picker">
  <label class="field">
    <span class="micro-label">Target</span>
    <select aria-label="Enemy kind" value={kind} onchange={(e) => pickKind(e.currentTarget.value)}>
      {#each kinds as k (k.id)}
        <option value={k.id}>{k.label}</option>
      {/each}
    </select>
  </label>

  {#if kind === 'campaign'}
    <label class="field">
      <span class="micro-label">Chapter</span>
      <select aria-label="Chapter" value={value.chapter} onchange={(e) => patch({ chapter: Number(e.currentTarget.value) })}>
        {#each chapters as c (c.chapter)}
          <option value={c.chapter}>{c.label}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span class="micro-label">Level</span>
      <select aria-label="Level" value={value.level} onchange={(e) => patch({ level: Number(e.currentTarget.value) })}>
        {#each levels as l (l)}
          <option value={l}>{l}</option>
        {/each}
      </select>
    </label>
  {:else if kind === 'dungeon'}
    <label class="field">
      <span class="micro-label">Dungeon</span>
      <select aria-label="Dungeon" value={value.id} onchange={(e) => patch({ id: e.currentTarget.value })}>
        {#each CLASSIC_DUNGEONS as d (d.id)}
          <option value={d.id}>{d.name}</option>
        {/each}
      </select>
    </label>
    <label class="field">
      <span class="micro-label">Step</span>
      <select aria-label="Step" value={value.step} onchange={(e) => patch({ step: Number(e.currentTarget.value) })}>
        {#each steps as s (s)}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </label>
  {:else}
    <label class="field">
      <span class="micro-label">Floor</span>
      <select aria-label="Floor" value={value.floor} onchange={(e) => patch({ floor: Number(e.currentTarget.value) })}>
        {#each OBLIVION_FLOORS as f (f.floor)}
          <option value={f.floor}>{f.floor}</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

<style>
  .enemy-picker {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  select {
    background: var(--color-field);
    color: var(--color-ink);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-field);
    padding: 7px 10px;
    font-size: 13px;
    max-width: 100%;
  }
  @media (max-width: 700px) {
    select {
      min-height: 44px;
    }
  }
</style>
