// The Verify tab's panel for every fight it knows (the arena cases are in pages/ToolsDuelPage.test.js).
import { it, expect, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { setup, click } from '../ui/testkit.js';
import VerifyFightLog from './VerifyFightLog.svelte';
import dungeon from '../../lib/__fixtures__/real/dungeon-run-mystic-d4s8.json';
import raid from '../../lib/__fixtures__/real/raid-run-mystic-r4s8.json';
import fortress from '../../lib/__fixtures__/real/fortress-boss-top-fight.json';
import mystic from '../../lib/__fixtures__/real/profile-mystic-l50.json';
import sentinel from '../../lib/__fixtures__/real/profile-sentinel-l85-miss.json';
import { normaliseCharacter } from '../../lib/model/index.js';
import { gameProfileToCharacter } from '../../lib/model/gameProfile.js';
import { buildFighter } from '../../lib/build/fighter.js';
import { simulateWorldBoss, worldBossResponseOf } from '../../lib/engine/pve/worldBossReplay.js';
import { laneRng } from '../../lib/engine/rng.js';

let view;
afterEach(() => view?.done());

const characterOf = (profile) => normaliseCharacter(gameProfileToCharacter(profile));
const open = (log, props = {}) => {
  view = setup(VerifyFightLog, { handoff: { text: JSON.stringify(log), n: 1 }, ...props });
  flushSync();
};
const select = (label) => {
  const l = view.qa('[data-testid="verify-setup"] label').find((x) => x.textContent.trim() === label);
  return l ? document.getElementById(l.getAttribute('for')) : null;
};
const pick = (label, value) => {
  const el = select(label);
  el.value = String(value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
  flushSync();
};
const text = (id) => view.q(`[data-testid="${id}"]`)?.textContent.replace(/\s+/g, ' ').trim() ?? null;

it('with no log it lists the fights, says why Campaign is not one, and cannot check', () => {
  view = setup(VerifyFightLog);
  expect([...select('Fight').options].map((o) => o.textContent)).toEqual(['Arena duel', 'Dungeon', 'Village Raid', 'World Boss', 'Fortress Boss']);
  expect(text('campaign-note')).toMatch(/Campaign is not listed/);
  expect(view.qa('button').find((b) => /Check log again/.test(b.textContent)).disabled).toBe(true);
  expect(text('replay-rules')).toBeNull();
});

it('a dungeon log: the fight is read from it, and the step is asked for', () => {
  open(dungeon);
  expect(select('Fight').value).toBe('dungeon');
  expect(view.q('[data-testid="verify-setup"]').textContent).toContain('Read from the log.');
  expect(text('replay-checked')).toBe('Checked as Dungeon.');
  const before = view.qa('[data-testid="replay-rules"] tr.skipped').length;
  expect(before).toBeGreaterThan(0);
  pick('Dungeon', 'dungeon_4');
  pick('Step', 8);
  expect(text('replay-checked')).toMatch(/^Checked as Dungeon: .+, step 8\.$/);
  expect(view.qa('[data-testid="replay-rules"] tr.skipped').length).toBeLessThan(before);
  expect(text('replay-verdict')).toBe('No rule failed');
});

it('a dungeon log against the preset that fought it: nothing is skipped', () => {
  const character = characterOf(mystic);
  open(dungeon, { character });
  pick('Dungeon', 'dungeon_4');
  pick('Step', 8);
  expect(select('Preset')).toBeNull();
  click(view.q('[data-testid="verify-setup"] input[type="checkbox"]'));
  expect(select('Preset').value).toBe(character.activePresetId);
  expect(text('replay-verdict')).toBe('No rule failed');
  expect(text('replay-skipped')).toBeNull();
  expect(text('replay-checked')).toContain(`against ${character.presets.find((p) => p.id === character.activePresetId).name}`);
});

it('without a character the preset check is off, and says why', () => {
  open(dungeon);
  const box = view.q('[data-testid="verify-setup"] input[type="checkbox"]');
  expect(box.disabled).toBe(true);
  expect(view.q('[data-testid="verify-setup"]').textContent).toContain('no character is selected');
});

it('a Village Raid log is told from a dungeon, and the wrong step shows differences', () => {
  open(raid);
  expect(select('Fight').value).toBe('raid');
  pick('Village Raid', 'raid_4');
  pick('Step', 8);
  expect(text('replay-checked')).toBe('Checked as Village Raid: Shadow Enclave, step 8.');
  expect(text('replay-verdict')).toBe('No rule failed');
  pick('Step', 1);
  expect(text('replay-verdict')).toMatch(/differences? found/);
});

it('a Fortress log: the fortress comes from the boss it names', () => {
  open(fortress, { character: characterOf(sentinel) });
  expect(select('Fight').value).toBe('fortressBoss');
  expect(select('Fortress').value).toBe('TOP');
  expect(text('replay-checked')).toBe('Checked as Fortress Boss: Fortress Guardian.');
  click(view.q('[data-testid="verify-setup"] input[type="checkbox"]'));
  expect(text('replay-verdict')).toBe('No rule failed');
  expect(text('replay-skipped')).toBeNull();
});

it('a World Boss log: the affinity is asked for and the report says the fight is estimated', () => {
  const character = characterOf(sentinel);
  open(worldBossResponseOf(simulateWorldBoss(buildFighter(character, character.activePresetId), 'ENRAGED', laneRng(3))), { character });
  expect(select('Fight').value).toBe('worldBoss');
  expect(view.q('[data-testid="replay-check"] [role="status"]').textContent).toContain('not all of its rules are known');
  pick('Affinity', 'ENRAGED');
  click(view.q('[data-testid="verify-setup"] input[type="checkbox"]'));
  expect(text('replay-checked')).toMatch(/^Checked as World Boss \(Rising Wrath\), against /);
  expect(text('replay-verdict')).toBe('No rule failed');
});

it('picking another fight than the log shows says what the log looks like', () => {
  open(dungeon);
  pick('Fight', 'raid');
  expect(view.q('[data-testid="verify-setup"]').textContent).toContain('The log looks like Dungeon.');
  expect(select('Village Raid')).not.toBeNull();
  expect(select('Dungeon')).toBeNull();
});
