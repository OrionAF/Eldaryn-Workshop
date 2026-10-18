<script>
  /**
   * DuelTimeline.svelte - a compact SVG event strip for one traced PVP duel: the `DuelEvent` rows of
   * engine/pvp/events.js. Two lanes (the arena attacker on top, the defender below); damage is a
   * vertical bar scaled by the square root of the hit, everything else a small mark. Which lane a
   * row belongs to, and what it looks like, is features/duel.js classifyDuelEvent. Hover a mark for
   * the numbers. No chart libraries - hand-rolled SVG by policy.
   */
  import { formatFlat } from '../lib/format.js';
  import { classifyDuelEvent } from '../lib/features/duel.js';
  import { parseEventType } from '../lib/engine/pvp/events.js';

  /** @type {{events?: import('../lib/engine/pvp/events.js').DuelEvent[], attackerName?: string, defenderName?: string, durationMs?: number}} */
  let { events = [], attackerName = 'You', defenderName = 'Opponent', durationMs = 0 } = $props();

  const W = 600;
  const H = 96;
  const LANE_Y = { attacker: 34, defender: 82 }; // lane baselines
  const MAX_BAR = 26;

  const marks = $derived(events.map((ev) => ({ ev, ...classifyDuelEvent(ev) })));
  const span = $derived(Math.max(Number(durationMs) || 0, ...events.map((e) => e.timestamp || 0), 1000));
  const maxAmount = $derived(Math.max(1, ...marks.filter((m) => m.mark === 'damage').map((m) => m.amount)));

  const x = (t) => 4 + (t / span) * (W - 8);
  const barH = (amount) => 3 + Math.sqrt((amount || 0) / maxAmount) * (MAX_BAR - 3);

  const COLORS = {
    damage: 'var(--ember-500)',
    heal: 'var(--verdict-up)',
    spell: 'var(--scope-oblivion)',
    avoid: 'var(--status-info)',
    status: 'var(--status-warn)',
    lost: 'var(--text-muted)',
    minion: 'var(--scope-mount)',
    death: 'var(--verdict-down)',
    other: 'var(--text-muted)',
  };
  const LEGEND = [
    ['damage', '▍ damage'],
    ['heal', '● heal'],
    ['spell', '● spell'],
    ['avoid', '● avoided'],
    ['status', '● status'],
    ['lost', '● swing lost'],
    ['minion', '● minion'],
    ['death', '✕ death'],
  ];

  const nameOf = (lane) => (lane === 'attacker' ? attackerName : lane === 'defender' ? defenderName : '');
  const secs = (t) => (t / 1000).toFixed(2);

  function title(m) {
    const { ev, lane, mark, amount } = m;
    const at = `${secs(ev.timestamp)}s`;
    if (mark === 'end') return `${at} - time up`;
    const who = nameOf(lane);
    const { kind } = parseEventType(ev.type);
    const what = (ev.stunSource === 'SHIELD_BASH' ? 'Shield Bash ' : '') + (ev.spell?.name ? `${ev.spell.name} ` : '') + kind.replace(/_/g, ' ');
    if (mark === 'death') return `${at} - ${who} died`;
    const num = amount > 0 ? ` ${formatFlat(Math.round(amount))}` : '';
    const flags = `${ev.isCrit ? ' CRIT' : ''}${ev.doubleHit ? ' double hit' : ''}`;
    return `${at} - ${who}: ${what}${num}${flags}${ev.dazeMs ? ` (${secs(ev.dazeMs)}s)` : ev.paralyzeMs ? ` (${secs(ev.paralyzeMs)}s)` : ''}`;
  }
</script>

<div class="duel-timeline" data-testid="duel-timeline">
  <div class="lane-labels">
    <span class="cap-label">Top: {attackerName}</span>
    <span class="cap-label">Bottom: {defenderName}</span>
  </div>
  <svg viewBox="0 0 {W} {H}" role="img" aria-label="Duel timeline" preserveAspectRatio="none">
    <line x1="0" y1={LANE_Y.attacker} x2={W} y2={LANE_Y.attacker} stroke="var(--line-hairline)" stroke-width="1" />
    <line x1="0" y1={LANE_Y.defender} x2={W} y2={LANE_Y.defender} stroke="var(--line-hairline)" stroke-width="1" />
    {#each marks as m, i (i)}
      {#if m.mark === 'end'}
        <line x1={x(m.ev.timestamp)} y1="0" x2={x(m.ev.timestamp)} y2={H} stroke="var(--line-control)" stroke-dasharray="3 3">
          <title>{title(m)}</title>
        </line>
      {:else}
        {@const laneY = LANE_Y[m.lane] ?? LANE_Y.attacker}
        {#if m.mark === 'damage'}
          <rect
            x={x(m.ev.timestamp) - 1}
            y={laneY - barH(m.amount)}
            width="2"
            height={barH(m.amount)}
            fill={COLORS.damage}
            opacity={m.ev.isCrit ? 1 : 0.7}
          >
            <title>{title(m)}</title>
          </rect>
        {:else if m.mark === 'death'}
          <text x={x(m.ev.timestamp)} y={laneY - 4} fill={COLORS.death} font-size="12" text-anchor="middle">✕<title>{title(m)}</title></text>
        {:else}
          <circle cx={x(m.ev.timestamp)} cy={laneY - 3} r="2.4" fill={COLORS[m.mark] ?? COLORS.other}>
            <title>{title(m)}</title>
          </circle>
        {/if}
      {/if}
    {/each}
  </svg>
  <div class="axis mono">
    <span>0s</span>
    <span>{(span / 1000).toFixed(0)}s</span>
  </div>
  <p class="legend">
    {#each LEGEND as [key, text] (key)}
      <span style="color: {COLORS[key]}">{text}</span>
    {/each}
  </p>
</div>

<style>
  .cap-label { font-size: var(--fs-11); font-weight: var(--fw-heavy); letter-spacing: var(--track-label); text-transform: uppercase; color: var(--text-soft); }
  .duel-timeline {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
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
    color: var(--text-muted);
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-3);
    font-size: 10px;
    margin: 0;
    color: var(--text-muted);
  }
</style>
