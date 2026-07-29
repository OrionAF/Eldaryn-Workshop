<script>
  /**
   * DuelTimeline.svelte - a compact SVG event strip for one traced duel
   * (the capped `detail.timeline` a sample fight stores in the run
   * history). Two lanes (you on top, opponent below); damage renders as
   * vertical bars scaled by a square-root of the hit size, control/utility
   * events as small marks. Hover any mark for the exact numbers. No chart
   * libraries - hand-rolled SVG by policy.
   */
  import { formatFlat } from '../lib/format.js';

  let { timeline = [], playerName = 'You', opponentName = 'Opponent', durationSeconds = 60 } = $props();

  const W = 600;
  const H = 96;
  const LANE_Y = { player: 34, opponent: 82 }; // lane baselines
  const MAX_BAR = 26;

  const span = $derived.by(() => {
    const last = timeline.length ? Math.max(...timeline.map((e) => e.t)) : 0;
    return Math.max(Number(durationSeconds) || 0, last, 1);
  });

  const maxAmount = $derived(Math.max(1, ...timeline.filter((e) => e.kind === 'damage').map((e) => e.amount || 0)));

  const x = (t) => 4 + (t / span) * (W - 8);
  const barH = (amount) => 3 + Math.sqrt((amount || 0) / maxAmount) * (MAX_BAR - 3);

  const MARK_COLORS = {
    damage: 'var(--nav-pvp)',
    heal: 'var(--color-hps, #58d68d)',
    blind: '#f5c66b',
    paralyze: '#c084fc',
    sigil: '#7a8cff',
    dodge: '#54d0ff',
    block: '#a4b0c0',
    death: '#ff5c5c',
  };

  const sideName = (side) => (side === 'player' ? playerName : opponentName);

  function markTitle(ev) {
    const who = sideName(ev.side);
    switch (ev.kind) {
      case 'damage':
        return `${ev.t.toFixed(2)}s — ${who} dealt ${formatFlat(Math.round(ev.amount))} (${ev.tag})${ev.crit ? ' CRIT' : ''}${ev.blocked ? ' blocked' : ''}`;
      case 'heal':
        return `${ev.t.toFixed(2)}s — ${who} healed ${formatFlat(Math.round(ev.amount))}`;
      case 'death':
        return `${ev.t.toFixed(2)}s — ${who} died`;
      case 'sigil':
        return `${ev.t.toFixed(2)}s — ${who} activated ${ev.name}`;
      default:
        return `${ev.t.toFixed(2)}s — ${who}: ${ev.kind.replace(/-/g, ' ')}`;
    }
  }
</script>

<div class="duel-timeline" data-testid="duel-timeline">
  <div class="lane-labels">
    <span class="micro-label">{playerName}</span>
    <span class="micro-label">{opponentName}</span>
  </div>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Combat timeline" preserveAspectRatio="none">
    <line x1="0" y1={LANE_Y.player} x2={W} y2={LANE_Y.player} stroke="var(--color-border)" stroke-width="1" />
    <line x1="0" y1={LANE_Y.opponent} x2={W} y2={LANE_Y.opponent} stroke="var(--color-border)" stroke-width="1" />
    {#each timeline as ev, i (i)}
      {@const laneY = LANE_Y[ev.side] ?? LANE_Y.player}
      {#if ev.kind === 'damage'}
        <rect x={x(ev.t) - 1} y={laneY - barH(ev.amount)} width="2" height={barH(ev.amount)} fill={MARK_COLORS.damage} opacity={ev.crit ? 1 : 0.75}>
          <title>{markTitle(ev)}</title>
        </rect>
      {:else if ev.kind === 'death'}
        <text x={x(ev.t)} y={laneY - 4} fill={MARK_COLORS.death} font-size="12" text-anchor="middle">✕<title>{markTitle(ev)}</title></text>
      {:else}
        <circle cx={x(ev.t)} cy={laneY - 3} r="2.4" fill={MARK_COLORS[ev.kind] || '#8892a6'}>
          <title>{markTitle(ev)}</title>
        </circle>
      {/if}
    {/each}
  </svg>
  <div class="axis mono">
    <span>0s</span>
    <span>{span.toFixed(0)}s</span>
  </div>
  <p class="legend">
    <span style="color: {MARK_COLORS.damage}">▍damage</span>
    <span style="color: {MARK_COLORS.heal}">● heal</span>
    <span style="color: {MARK_COLORS.sigil}">● sigil</span>
    <span style="color: {MARK_COLORS.blind}">● blind</span>
    <span style="color: {MARK_COLORS.paralyze}">● paralyze</span>
    <span style="color: {MARK_COLORS.dodge}">● dodge</span>
    <span style="color: {MARK_COLORS.death}">✕ death</span>
  </p>
</div>

<style>
  .duel-timeline {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  svg {
    width: 100%;
    height: 96px;
    display: block;
  }
  .lane-labels {
    display: flex;
    justify-content: space-between;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: var(--color-muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: 10px;
    margin: 0;
    color: var(--color-muted);
  }
</style>
