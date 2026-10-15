// ui/duelFormat.js - words for the Duel page: verdict line, headline and job-tray chips from a
// win-rate summary. The numbers come from features/duel.js winRateVerdict; this file only phrases them.
import { fmtCount } from './statsFormat.js';
import { winRateVerdict, seatsFromResult } from '../features/duel.js';

const pct1 = (x) => `${(x * 100).toFixed(1)}%`;

/** One sentence under the headline. An unresolved verdict names N and the N that would resolve it. */
export function duelVerdictText(v) {
  if (!v) return '';
  if (v.verdict === 'better') return 'Favoured: the whole 95% interval is above even.';
  if (v.verdict === 'worse') return 'Unfavoured: the whole 95% interval is below even.';
  const edge = `${Number.isInteger(v.edgePts) ? v.edgePts : v.edgePts.toFixed(1)}-pt edge`;
  return v.nNeeded
    ? `Too close to call at N=${fmtCount(v.n)}: about N=${fmtCount(v.nNeeded)} would resolve a ${edge}.`
    : `Too close to call at N=${fmtCount(v.n)}.`;
}

export function duelHeadline(v, myName) {
  if (!v) return '';
  if (v.verdict === 'better') return `${myName} is ahead of even`;
  if (v.verdict === 'worse') return `${myName} is behind even`;
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
    { tone: v.verdict === 'unresolved' ? 'warn' : tone, text: v.verdict === 'unresolved' ? 'too close to call' : v.verdict === 'better' ? 'favoured' : 'unfavoured' },
  ];
}
