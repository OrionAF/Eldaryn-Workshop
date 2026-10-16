// ui/duelFormat.js - words for the Duel page: verdict line, headline and job-tray chips from a
// win-rate summary. The numbers come from features/duel.js winRateVerdict; this file only phrases them.
import { fmtCount } from './statsFormat.js';
import { winRateVerdict, seatsFromResult } from '../features/duel.js';

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;

/** One sentence under the headline. An unresolved verdict names the fights run and the fights that would settle it. */
export function duelVerdictText(v) {
  if (!v) return '';
  if (v.verdict === 'better') return 'Likely to win: even the low end of the likely range is above 50%.';
  if (v.verdict === 'worse') return 'Likely to lose: even the high end of the likely range is below 50%.';
  const edge = `${Number.isInteger(v.edgePts) ? v.edgePts : v.edgePts.toFixed(1)}-point lead`;
  return v.nNeeded
    ? `Too close to call after ${fmtCount(v.n)} fights. Around ${fmtCount(v.nNeeded)} fights should show whether a ${edge} is real.`
    : `Too close to call after ${fmtCount(v.n)} fights.`;
}

export function duelHeadline(v, myName) {
  if (!v) return '';
  if (v.verdict === 'better') return `${myName} is clearly ahead`;
  if (v.verdict === 'worse') return `${myName} is clearly behind`;
  return `${myName} and the opponent are too close to call`;
}

/** Chips for the finished job row. */
export function duelJobChips(result, seat) {
  const { total } = seatsFromResult(result, seat);
  const v = winRateVerdict(total);
  if (!v) return [];
  const tone = v.verdict === 'better' ? 'up' : v.verdict === 'worse' ? 'down' : 'warn';
  return [
    { tone, text: `${pct1(total.p)} win` },
    { tone: v.verdict === 'unresolved' ? 'warn' : tone, text: v.verdict === 'unresolved' ? 'too close to call' : v.verdict === 'better' ? 'likely to win' : 'likely to lose' },
  ];
}
