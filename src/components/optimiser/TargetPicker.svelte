<script>
  /**
   * TargetPicker.svelte - what the optimiser fights and what it scores (F2b). `target` and `objective` are
   * bindable plain specs in the shapes search/objectives.js resolveTarget / makeObjective accept; the
   * objective list follows objectiveKindsFor(target.kind). The PVP target (F5) names saved opponents and a
   * seat; it is disabled, with a link to the Duel screen, while the character has none.
   */
  import { TARGET_KINDS, objectiveKindsFor } from '../../lib/search/objectives.js';
  import { chapterLabel } from '../../lib/game/combatPve.js';
  import { CLASSIC_DUNGEONS } from '../../lib/game/pveContent.js';
  import { PVP_MAX_OPPONENTS, PVP_SEATS } from '../../lib/search/pvpObjective.js';
  import { classLabel } from '../../lib/game/classes.js';
  import Chip from '../Chip.svelte';

  let { target = $bindable(), objective = $bindable(), oblivionUnlocked = false, opponents = [], onNavigate = () => {} } = $props();

  const KIND_LABEL = {
    dummy: 'Training dummy',
    chapter: 'Campaign chapter',
    dungeon: 'Dungeon',
    oblivion: 'Oblivion floor',
    worldBoss: 'World boss',
    custom: 'Custom mob',
    pvp: 'PVP vs my saved opponents',
  };
  const SEAT_LABEL = { attacker: 'Attacker', defender: 'Defender', both: 'Both seats' };
  const OBJ_LABEL = {
    dps: 'Damage per second',
    'ttk-median': 'Time to kill, median',
    'ttk-p90': 'Time to kill, slow end (P90)',
    survival: 'Survival chance',
    'pvp-winrate': 'PVP win rate',
  };
  const DEFAULTS = {
    dummy: { kind: 'dummy', seconds: 60 },
    chapter: { kind: 'chapter', chapter: 1, level: 1 },
    dungeon: { kind: 'dungeon', id: 'dungeon_1', step: 1 },
    oblivion: { kind: 'oblivion', floor: 1 },
    worldBoss: { kind: 'worldBoss', affinity: 'NONE' },
    custom: { kind: 'custom', mob: { hp: 1000000, attack: 10000, attackSpeed: 1 }, seconds: 60 },
  };
  const pvpDefault = () => ({ kind: 'pvp', opponentIds: opponents.slice(0, 1).map((o) => o.id), seats: 'attacker' });

  // classicDungeons is {note, dungeons}; the L1 accessor exposes the list
  const dungeons = CLASSIC_DUNGEONS;
  const kinds = $derived([...TARGET_KINDS.filter((k) => k !== 'oblivion' || oblivionUnlocked || target.kind === 'oblivion'), 'pvp']);
  const noOpponents = $derived(opponents.length === 0);
  const chosenIds = $derived(target.kind === 'pvp' ? target.opponentIds : []);
  const objectives = $derived(objectiveKindsFor(target.kind));

  function pickKind(kind) {
    target = kind === 'pvp' ? pvpDefault() : { ...DEFAULTS[kind] };
    if (!objectiveKindsFor(kind).includes(objective.kind)) objective = { kind: objectiveKindsFor(kind)[0] };
  }

  function toggleOpponent(id) {
    const has = chosenIds.includes(id);
    if (!has && chosenIds.length >= PVP_MAX_OPPONENTS) return;
    target = { ...target, opponentIds: has ? chosenIds.filter((x) => x !== id) : [...chosenIds, id] };
  }

  const intOf = (e, min, max) => Math.max(min, Math.min(max, Math.floor(Number(e.currentTarget.value)) || min));
  const numOf = (e, min) => Math.max(min, Number(e.currentTarget.value) || min);
</script>

<div class="picker" data-testid="target-picker">
  <label class="field">
    <span class="micro-label">Target</span>
    <select value={target.kind} onchange={(e) => pickKind(e.currentTarget.value)} data-testid="target-kind">
      {#each kinds as k (k)}<option value={k} disabled={k === 'pvp' && noOpponents && target.kind !== 'pvp'}>{KIND_LABEL[k]}</option>{/each}
    </select>
  </label>

  {#if target.kind === 'pvp'}
    <div class="field wide" data-testid="pvp-opponents">
      <span class="micro-label">Opponents (up to {PVP_MAX_OPPONENTS})</span>
      <div class="chip-list">
        {#each opponents as o (o.id)}
          <Chip label={`${o.name || 'Opponent'} (${classLabel(o.class)})`} selected={chosenIds.includes(o.id)} onClick={() => toggleOpponent(o.id)} />
        {/each}
      </div>
    </div>
    <div class="field wide" data-testid="pvp-seats">
      <span class="micro-label">My seat</span>
      <div class="chip-list">
        {#each PVP_SEATS as seat (seat)}
          <Chip label={SEAT_LABEL[seat]} selected={target.seats === seat} onClick={() => (target = { ...target, seats: seat })} />
        {/each}
      </div>
    </div>
  {:else if target.kind === 'dummy'}
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
{#if noOpponents}
  <p class="hint" data-testid="pvp-hint">
    PVP win rate needs a saved opponent.
    <button type="button" class="btn-ghost link" onclick={() => onNavigate('duel')}>Add one on the Duel screen</button>
  </p>
{:else if target.kind === 'pvp'}
  <p class="hint">
    Score is my win rate over every selected opponent and seat, each with its own N and 95% interval. Arena fights are resolved by the server; the rules here are the client's bundled simulator (derived, not confirmed).
  </p>
{/if}

<style>
  .picker { display: flex; flex-wrap: wrap; gap: var(--space-3); align-items: flex-end; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field input { width: 96px; }
  .field.wide { flex-basis: 100%; }
  .chip-list { display: flex; flex-wrap: wrap; gap: 6px; }
  .hint { color: var(--color-muted); font-size: 12px; margin: 0; }
  .link { font-size: 12px; padding: 0 6px; }
  .chapter-name { color: var(--color-muted); font-size: 11px; }
</style>
