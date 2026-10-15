// harness/specs.js (H1): the spec x realm table every property test sweeps (plan C). Test support only.
// A Druid is swept three ways (BEAR, WOLF and formless) because the Form sigil changes the engine inputs.
import { classOfSpec } from '../game/classes.js';

/** @typedef {{key: string, cls: string, form: 'BEAR'|'WOLF'|null, utility: string|null, label: string}} HarnessSpec */

/** `utility`: the Form sigil that gives a Druid its form (null = no utility sigil for the Druid, the fixture's for the rest) */
export const HARNESS_SPECS = [
  { key: 'WARRIOR_DPS', form: null },
  { key: 'WARRIOR_TANK', form: null },
  { key: 'SENTINEL_MARKSMANSHIP', form: null },
  { key: 'SENTINEL_DISRUPTION', form: null },
  { key: 'MYSTIC_MAGE', form: null },
  { key: 'MYSTIC_DRUID', form: 'BEAR', utility: 'DIRE_URSINE' },
  { key: 'MYSTIC_DRUID', form: 'WOLF', utility: 'ALPHA_LUPINE' },
  { key: 'MYSTIC_DRUID', form: null, utility: null },
  { key: 'NECROMANCER_DEATHLORD', form: null },
  { key: 'NECROMANCER_DOOMWEAVER', form: null },
].map((s) => ({
  utility: null,
  ...s,
  cls: classOfSpec(s.key),
  label: s.key + (s.key === 'MYSTIC_DRUID' ? `:${s.form ?? 'formless'}` : ''),
}));

export const HARNESS_REALMS = ['base', 'oblivion'];

/** Every spec x realm pair: [{...spec, realm}] */
export const SPEC_REALMS = HARNESS_SPECS.flatMap((s) => HARNESS_REALMS.map((realm) => ({ ...s, realm })));
