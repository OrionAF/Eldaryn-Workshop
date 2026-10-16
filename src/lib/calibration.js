// The stored speed calibration of this device (pref `calibration`, uiState.js) and what it says about
// a run's length. Written by the 'calibrate' task (tasks/calibrate.js); shape and staleness are here.
//
// Calibration: { profile, workers, fightsPerSec: {dummy, dungeon, duel?}, measuredAt (ms), version }.
// It describes THIS device under one CPU profile and one build, so it goes stale when the profile or
// the build id changes (a rebuilt engine can run at another speed). A stale calibration still
// gives estimates, labelled as old; it is never re-run on its own.
import { CPU_PROFILES } from './tasks/cpuProfile.js';

export const FIGHT_KINDS = Object.freeze(['dummy', 'dungeon', 'duel']);

/** The build id (vite.config.js `define`); plain 'dev' where the bundler did not set it. */
export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

const rate = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

/** Any value -> a valid calibration or null. Needs at least the dummy and dungeon rates. */
export function normaliseCalibration(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!CPU_PROFILES.includes(raw.profile)) return null;
  if (!Number.isInteger(raw.workers) || raw.workers < 1) return null;
  if (!Number.isFinite(raw.measuredAt) || typeof raw.version !== 'string') return null;
  const fightsPerSec = {};
  for (const k of FIGHT_KINDS) {
    const r = rate(raw.fightsPerSec?.[k]);
    if (r !== null) fightsPerSec[k] = r;
  }
  if (!fightsPerSec.dummy || !fightsPerSec.dungeon) return null;
  return { profile: raw.profile, workers: raw.workers, fightsPerSec, measuredAt: raw.measuredAt, version: raw.version };
}

/**
 * Why a calibration no longer applies: 'profile' (measured under another CPU profile), 'version'
 * (another build), or null when it is current. Profile is checked first.
 */
export function staleReason(cal, { profile, version = APP_VERSION } = {}) {
  if (!cal) return null;
  if (cal.profile !== profile) return 'profile';
  if (cal.version !== version) return 'version';
  return null;
}

/** A finished 'calibrate' result -> the calibration to store (null when it was cancelled or measured too little). */
export function calibrationFrom(result, { profile, now = Date.now(), version = APP_VERSION } = {}) {
  if (!result || result.aborted) return null;
  return normaliseCalibration({ profile, workers: result.workers, fightsPerSec: result.fightsPerSec, measuredAt: now, version });
}

/**
 * Seconds a run takes on this device: sum over kinds of fights / rate. A kind the calibration has no
 * rate for (no opponent when it was measured) counts at the slowest measured rate, so it is never
 * understated. Null without a calibration or fights.
 * @param {object|null} cal
 * @param {{dummy?: number, dungeon?: number, duel?: number}} fights  fight counts by kind
 */
export function estimateSeconds(cal, fights) {
  if (!cal || !fights) return null;
  const slowest = Math.min(...Object.values(cal.fightsPerSec));
  let total = 0;
  let any = false;
  for (const k of FIGHT_KINDS) {
    const n = fights[k];
    if (!(n > 0)) continue;
    any = true;
    total += n / (cal.fightsPerSec[k] ?? slowest);
  }
  return any ? total : null;
}

/** "under a minute", "about 3 min", "about 1 h 20 min". Coarse on purpose: it is an estimate. */
export function durationText(seconds) {
  if (seconds < 60) return 'under a minute';
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h >= 48) return `${Math.round(min / 1440)} days`;
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * The line a tool page shows: "About 3 min on this device (estimate)". `bound: 'upper'` says "Up to about"
 * (a run that can stop early), `'lower'` "At least about" (close comparisons run longer); `staleReason` adds that the figure is from an older measurement.
 */
export function estimateText(cal, fights, { bound = 'about', stale = null } = {}) {
  const s = estimateSeconds(cal, fights);
  if (s === null) return null;
  const d = durationText(s);
  const lead = bound === 'upper' ? 'Up to about' : bound === 'lower' ? 'At least about' : 'About';
  const phrase = d === 'under a minute' ? `${bound === 'upper' ? 'Up to' : bound === 'lower' ? 'At least' : 'Takes'} under a minute` : `${lead} ${d}`;
  const old = stale === 'profile' ? ' Measured with another Speed vs. battery setting.' : stale === 'version' ? ' Measured on an older version of the app.' : '';
  return `${phrase} on this device (estimate).${old}`;
}

// ---- expected fights per tool --------------------------------------------------------------------
// Budgets are the ones the search uses (search.js resolveEffort, features/swap.js DROP_PRECISION).

// Optimiser: search/estimate.js (it models the search itself; simulation.md §Estimates).

/** Drop Check: per preset and metric a before/after pair, each up to maxN fights (an upper bound). */
export function dropFights(request, maxN) {
  const items = request?.items?.length ?? 0;
  const per = 2 * maxN * items;
  return {
    ...(request?.sim ? { dummy: per } : {}),
    ...(request?.enemy ? { dungeon: per } : {}),
    ...((request?.opponents?.length ?? 0) > 0 ? { duel: per * request.opponents.length } : {}),
  };
}

/** Duel: n duels per seat. */
export const duelFights = (perSeat, seats = 1) => ({ duel: perSeat * seats });

/** Oblivion Floors: n fights on each floor of the scan (a scan that dies early stops sooner: an upper bound). */
export const oblivionFights = (floors, n) => ({ dungeon: floors * n });
