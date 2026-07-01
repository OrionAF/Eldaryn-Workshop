import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TalentTierList from './TalentTierList.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';
import { TALENT_TREES } from '../lib/talentTreeData.js';

let target, app;

function seedTwoTierTree() {
  // Tree content is static (talentTreeData.js) - tests substitute a tiny
  // fixture by mutating the imported TALENT_TREES directly (same module
  // instance TalentTierList/rosterStore import).
  const sharpAim = { id: 'sharp-aim', name: 'Sharp Aim', statKey: 'crit', ranks: [2, 4, 6] };
  const gated = { id: 'gated-talent', name: 'Gated Talent', statKey: 'attack_pct', ranks: [10] };
  TALENT_TREES.arms = {
    description: '',
    tiers: [
      { id: 'tier-0', threshold: 0, talents: [sharpAim] }, // tier 0: always unlocked
      { id: 'tier-1', threshold: 3, talents: [gated] }, // tier 1: needs 3 pts spent in tier 0
    ],
  };
  return { sharpAimId: sharpAim.id, gatedId: gated.id };
}

beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  rosterStore.setLoadoutSpec(0, 'arms');
  target = document.createElement('div');
  document.body.appendChild(target);
});

function render() {
  app = mount(TalentTierList, { target, props: { specKey: 'arms', loadoutIndex: 0 } });
  flushSync();
}

function cleanup() {
  unmount(app);
  target.remove();
}

it('rank 0 shows only NEXT; clicking + raises the rank and shows CURRENT (and NEXT if below max)', () => {
  const { sharpAimId } = seedTwoTierTree();
  render();

  const row = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim'));
  expect(row.querySelector('.talent-rank-badge').textContent).toBe('0/3');
  expect(row.querySelector('.talent-value').textContent).toContain('NEXT: +2%');
  expect(row.querySelector('.talent-value').textContent).not.toContain('CURRENT');

  row.querySelectorAll('.rank-controls button')[1].click(); // "+"
  flushSync();

  expect(rosterStore.current.loadouts[0].talentAllocation[sharpAimId]).toBe(1);
  const rowAfter = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim'));
  expect(rowAfter.querySelector('.talent-rank-badge').textContent).toBe('1/3');
  expect(rowAfter.querySelector('.talent-value').textContent).toContain('+2% CURRENT');
  expect(rowAfter.querySelector('.talent-value').textContent).toContain('NEXT: +4%');
  cleanup();
});

it('at max rank, only CURRENT shows and + is disabled', () => {
  seedTwoTierTree();
  render();

  const plusButton = () => [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim')).querySelectorAll('.rank-controls button')[1];
  plusButton().click();
  flushSync();
  plusButton().click();
  flushSync();
  plusButton().click(); // now at 3/3, max
  flushSync();

  const row = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim'));
  expect(row.querySelector('.talent-rank-badge').textContent).toBe('3/3');
  expect(row.querySelector('.talent-value').textContent).toContain('+6% CURRENT');
  expect(row.querySelector('.talent-value').textContent).not.toContain('NEXT');
  expect(plusButton().disabled).toBe(true);
  cleanup();
});

it('Tier 1 has no lock badge; a later tier shows Locked/Unlocked and gates its talent rows', () => {
  seedTwoTierTree();
  render();

  const tierSections = [...target.querySelectorAll('.tier-section')];
  expect(tierSections[0].querySelector('.tier-badge')).toBeNull(); // Tier 1: never shows a badge
  expect(tierSections[1].querySelector('.tier-badge').textContent).toContain('Locked');

  const gatedRow = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Gated Talent'));
  expect(gatedRow.classList.contains('locked')).toBe(true);
  expect(gatedRow.querySelectorAll('.rank-controls button')[1].disabled).toBe(true); // "+" disabled while locked
  cleanup();
});

it('unlocking a later tier by spending enough in the earlier one lifts the gate', () => {
  const { sharpAimId, gatedId } = seedTwoTierTree();
  render();

  const plusButton = () => [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim')).querySelectorAll('.rank-controls button')[1];
  plusButton().click();
  flushSync();
  plusButton().click();
  flushSync();
  plusButton().click(); // Sharp Aim at 3/3 -> 3 points spent in Tier 1, meeting Tier 2's threshold of 3
  flushSync();

  const tierSections = [...target.querySelectorAll('.tier-section')];
  expect(tierSections[1].querySelector('.tier-badge').textContent).toContain('Unlocked');

  const gatedRow = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Gated Talent'));
  expect(gatedRow.classList.contains('locked')).toBe(false);
  gatedRow.querySelectorAll('.rank-controls button')[1].click(); // now allowed
  flushSync();
  expect(rosterStore.current.loadouts[0].talentAllocation[gatedId]).toBe(1);
  expect(rosterStore.current.loadouts[0].talentAllocation[sharpAimId]).toBe(3);
  cleanup();
});
