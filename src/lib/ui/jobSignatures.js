/**
 * jobSignatures.js - the staleness signature of each tool's job, in one place (jobs.svelte.js, "Staleness").
 *
 * Live jobs get their `currentSignature` closure from the page that starts them; those pages and the
 * resolver for jobs restored after a reload both call the functions here, so the two cannot drift. The
 * job store may not import the roster store or pages (CLAUDE.md layers), so the shell registers
 * `restoredJobSignature` with `setRestoredSignatureResolver`.
 */
import { jobSignature } from '../jobs.svelte.js';
import { metricKey } from '../engine/metrics.js';
import { presetDuelFighter, opponentFighter } from '../features/duel.js';
import { floorScanInputs } from '../features/oblivionDungeon.js';
import { signatureOf } from './optimiserSetup.js';

/** Drop Check (single, bag, deep): gear, presets and drop of the character, plus the bag's entry keys. */
export function dropSignature(character, extra = '') {
  const c = character;
  return jobSignature({ characterKey: c?.id ?? '', presetId: '', inputs: JSON.stringify([c?.equipment, c?.presets, c?.drop ?? null, c?.dropCheck ?? null, extra]) });
}

/** One duel job; null when the character, opponent or preset is gone. */
export function duelSignature(character, presetId, opponentId, seatId, n) {
  const o = character?.opponents.find((x) => x.id === opponentId);
  if (!character || !o || !character.presets.some((p) => p.id === presetId)) return null;
  const inputs = metricKey('duel-inputs', presetDuelFighter(character, presetId), opponentFighter(o), seatId, n);
  return jobSignature({ characterKey: character.id, presetId, inputs });
}

/** Oblivion floor scan; null when the character, or the preset the scan named (none: the default), is gone. */
export function floorScanSignature(character, opts) {
  if (!character || (opts?.presetId && !character.presets.some((p) => p.id === opts.presetId))) return null;
  return jobSignature({ characterKey: character.id, inputs: floorScanInputs(character, opts) });
}

/**
 * The signature a restored job's run would get now. `findCharacter(id)` returns the character or null.
 * Returns null (stale) when the character or preset no longer exists, and the saved signature when the
 * tool is unknown (nothing to compare).
 */
export function restoredJobSignature(job, findCharacter) {
  let key;
  try {
    key = JSON.parse(job.signature)[0];
  } catch {
    return job.signature ?? null;
  }
  const character = findCharacter(key);
  if (!character) return null;
  const m = job.request?.meta ?? {};
  switch (job.tool) {
    case 'optimiser':
      return character.presets.some((p) => p.id === m.presetId) ? signatureOf(character, m.presetId) : null;
    case 'duel':
      return duelSignature(character, m.presetId, m.opponentId, m.seat, m.n);
    case 'oblivion-floors':
      return floorScanSignature(character, job.meta?.opts);
    case 'drop':
    case 'drop-deep':
      return dropSignature(character);
    case 'drop-bag':
      return dropSignature(character, job.meta?.extra ?? '');
    default:
      return job.signature ?? null;
  }
}
