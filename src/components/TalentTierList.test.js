import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import TalentTierList from './TalentTierList.svelte';
import { rosterStore } from '../lib/rosterStore.svelte.js';

let target, app;

function seedTwoTierTree() {
  // Drain any tiers left by earlier tests in this file (shared singleton).
  rosterStore.roster.talentTrees.fury.tiers = [];
  rosterStore.addTalentTier('fury', 0); // tier 0: always unlocked
  rosterStore.addTalentTier('fury', 3); // tier 1: needs 3 pts spent in tier 0
  const [tier0, tier1] = rosterStore.roster.talentTrees.fury.tiers;
  const sharpAimId = rosterStore.addTalent('fury', tier0.id, 'Sharp Aim', 'crit');
  rosterStore.updateTalent('fury', sharpAimId, 'ranks', [2, 4, 6]);
  const gatedId = rosterStore.addTalent('fury', tier1.id, 'Gated Talent', 'attack_pct');
  rosterStore.updateTalent('fury', gatedId, 'ranks', [10]);
  return { sharpAimId, gatedId };
}

beforeEach(() => {
  localStorage.clear();
  rosterStore.setCharacterClass(rosterStore.current.id, 'Warrior');
  rosterStore.setLoadoutSpec(0, 'fury');
  target = document.createElement('div');
  document.body.appendChild(target);
});

function render() {
  app = mount(TalentTierList, { target, props: { specKey: 'fury', loadoutIndex: 0 } });
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
