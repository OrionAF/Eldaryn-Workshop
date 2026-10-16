// Starts the speed calibration as a session job (jobs.svelte.js) and stores its result as the
// device's calibration pref. Opt-in: only the Calibrate speed button calls this, never app start.
import { startJob, jobsStore } from './jobs.svelte.js';
import { rosterStore } from './rosterStore.svelte.js';
import { prefs, setPrefs } from './prefs.svelte.js';
import { buildFighter } from './build/fighter.js';
import { fixtureCharacter } from './build/fixtures.js';
import { presetDuelFighter, opponentFighter, missingStats } from './features/duel.js';
import { calibrationFrom } from './calibration.js';
import { jobWorkers } from './optimizerClient.js';
import { DEFAULT_BUDGET_MS } from './tasks/calibrate.js';

export const CALIBRATE_TOOL = 'calibrate';

/**
 * The request: the current character's active preset (a fixture Warrior when there is no character)
 * against the dummy and a dungeon step, plus a duel when the character has an opponent whose sheet is complete.
 */
export function calibrationRequest(character = rosterStore.current) {
  const c = character ?? fixtureCharacter('WARRIOR');
  const plain = JSON.parse(JSON.stringify(c));
  const fighter = buildFighter(plain, plain.activePresetId);
  let duel = null;
  try {
    const opp = plain.opponents?.find((o) => missingStats(opponentFighter(o)).length === 0);
    const mine = presetDuelFighter(plain, plain.activePresetId);
    if (opp && missingStats(mine).length === 0) duel = { attacker: mine, defender: opponentFighter(opp) };
  } catch {
    duel = null;
  }
  return { mode: 'calibrate', fighter, duel, budgetMs: DEFAULT_BUDGET_MS, usedFixture: !character };
}

export const calibrating = () => jobsStore.list.some((j) => j.tool === CALIBRATE_TOOL && (j.status === 'running' || j.status === 'queued'));

/** @returns {string|null} the job id (null when one is already running) */
export function startCalibration() {
  if (calibrating()) return null;
  const profile = prefs.cpuProfile;
  const request = { ...calibrationRequest(), workers: jobWorkers() };
  return startJob({
    tool: CALIBRATE_TOOL,
    title: 'Speed test',
    context: `${profile} profile`,
    request,
    notice: 'Speed test started. It takes about 6 seconds.',
    onFinish: (job) => {
      const cal = calibrationFrom(job.result, { profile });
      if (cal) setPrefs({ calibration: cal });
    },
    summarize: (r) => {
      const f = r?.fightsPerSec ?? {};
      return f.dummy ? [{ tone: 'up', text: `${Math.round(f.dummy)} fights/s` }] : [];
    },
  });
}
