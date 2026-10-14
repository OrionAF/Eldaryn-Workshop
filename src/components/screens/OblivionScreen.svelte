<script>
  /**
   * OblivionScreen.svelte - the Oblivion hero (rebuild-plan §5 row 4, §7.3 F4): realm toggle, Oblivion
   * Level, Oblivion Power summary, a floor table with net strain and simulated win %, and the highest
   * floor at >= 90%. Gear editing is the shared GearScreen pinned to the Oblivion realm.
   */
  import { onDestroy } from 'svelte';
  import { rosterStore } from '../../lib/rosterStore.svelte.js';
  import { computePresetStats } from '../../lib/build/stats.js';
  import {
    strainRows, maxFloorAtThreshold, highestFreeFloor, runFloorScan, WIN_THRESHOLD,
  } from '../../lib/features/oblivionDungeon.js';
  import { formatFlat } from '../../lib/format.js';
  import Chip from '../Chip.svelte';
  import FloorTable from '../oblivion/FloorTable.svelte';
  import GearScreen from './GearScreen.svelte';

  // eslint-disable-next-line no-unused-vars
  let { setStatus = () => {}, onNavigate = () => {} } = $props();

  const FLOOR_COUNT = 30;
  const character = $derived(rosterStore.current);
  const unlocked = $derived(character?.oblivion?.unlocked === true);
  const realm = $derived(unlocked ? character.oblivion.activeRealm : 'base');

  const stats = $derived.by(() => {
    if (!character || !unlocked) return null;
    try {
      return computePresetStats(character, undefined, { realm: 'oblivion' }).effective;
    } catch {
      return null;
    }
  });
  const power = $derived(Math.round(Number(stats?.totalOblivionPower) || 0));
  const rows = $derived(strainRows(power, 1, FLOOR_COUNT));
  const freeFloor = $derived(highestFreeFloor(power, 60));

  let results = $state({});
  let scanning = $state(false);
  let progress = $state(null);
  let cancelScan = null;
  const scanned = $derived(Object.values(results));
  const maxFloor = $derived(maxFloorAtThreshold(scanned, WIN_THRESHOLD));

  async function scan() {
    if (scanning || !character) return;
    scanning = true;
    results = {};
    progress = null;
    try {
      const task = runFloorScan(character, { to: FLOOR_COUNT }, { onProgress: (p) => (progress = p) });
      cancelScan = task.cancel;
      const out = await task.promise;
      results = Object.fromEntries(out.rows.map((r) => [r.floor, r]));
      setStatus(out.aborted ? 'Floor scan cancelled' : 'Floor scan finished');
    } catch (e) {
      setStatus(`Floor scan failed: ${e.message}`);
    } finally {
      scanning = false;
      cancelScan = null;
    }
  }
  onDestroy(() => cancelScan?.());

  const fmt = (v) => (v == null ? '-' : formatFlat(v));
</script>

{#if character}
  <section class="oblivion-screen">
    <h2>Oblivion</h2>

    {#if !unlocked}
      <p class="hint">The Oblivion hero is locked. Unlock it on the Character screen.</p>
      <button type="button" class="btn-ghost" onclick={() => onNavigate('character')}>Go to Character</button>
    {:else}
      <div class="panel summary">
        <div class="realm" role="group" aria-label="Active realm">
          <span class="micro-label">Realm</span>
          <Chip label="Base" selected={realm === 'base'} onClick={() => rosterStore.setActiveRealm('base')} />
          <Chip label="Oblivion" selected={realm === 'oblivion'} onClick={() => rosterStore.setActiveRealm('oblivion')} />
        </div>
        <label>
          <span class="micro-label">Oblivion Level (0-100)</span>
          <input
            type="number" min="0" max="100" value={character.oblivion.level} aria-label="Oblivion Level"
            onchange={(e) => rosterStore.setOblivionLevel(e.currentTarget.value)}
          />
        </label>
        <div>
          <span class="micro-label">Oblivion Power</span>
          <strong class="num" data-testid="power">{formatFlat(power)}</strong>
        </div>
        <div>
          <span class="micro-label">Attack</span>
          <strong class="num">{fmt(stats?.totalAttack)}</strong>
        </div>
        <div>
          <span class="micro-label">HP</span>
          <strong class="num">{fmt(stats?.totalHp)}</strong>
        </div>
      </div>
      <p class="hint">
        Power cancels floor instability point for point; floors up to {freeFloor} have no net strain at {formatFlat(power)} power.
        The rest of the active preset (talents, pet, sigils, relics) carries into this realm.
      </p>

      <h3 class="subheading">Floors</h3>
      <div class="actions">
        <button type="button" class="btn-gold" disabled={scanning} onclick={scan}>
          {scanning ? 'Scanning...' : 'Simulate floors 1-' + FLOOR_COUNT}
        </button>
        {#if scanning}
          <button type="button" class="btn-ghost" onclick={() => cancelScan?.()}>Cancel</button>
          {#if progress}<span class="num muted">floor {progress.floor}: {progress.done}/{progress.n}</span>{/if}
        {/if}
        <span class="micro-label">Highest floor at {Math.round(WIN_THRESHOLD * 100)}%+</span>
        <strong class="num" data-testid="max-floor">{maxFloor ?? '-'}</strong>
      </div>
      <FloorTable {rows} {results} threshold={WIN_THRESHOLD} />

      <!-- GearScreen draws its own "Oblivion Gear" heading. -->
      <div class="gear"><GearScreen realm="oblivion" /></div>
    {/if}
  </section>
{/if}

<style>
  /* Body text matches the other screens (12.5px rows, 12px hints); the browser default is 16px. */
  .oblivion-screen {
    font-size: 12.5px;
  }
  .oblivion-screen h2 {
    margin-bottom: var(--space-3);
  }
  .oblivion-screen .subheading {
    margin: var(--space-4) 0 var(--space-2);
  }
  .hint {
    color: var(--color-muted);
    font-size: 12px;
    margin: var(--space-3) 0 0;
  }
  .summary,
  .actions,
  .realm {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3, 0.75rem);
    align-items: center;
  }
  .summary > div,
  .summary > label {
    display: flex;
    flex-direction: column;
  }
  .summary > .realm {
    flex-direction: row;
  }
  .gear {
    margin-top: var(--space-6);
  }
  .muted {
    color: var(--color-muted);
  }
</style>
