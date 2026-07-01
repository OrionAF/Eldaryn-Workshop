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

// --- Authoring: add tier/talent, edit name/stat/ranks, remove ---
it('+ Add Tier creates a new tier using the threshold input', () => {
  seedTwoTierTree();
  render();

  const startCount = rosterStore.roster.talentTrees.fury.tiers.length;
  const thresholdInput = target.querySelector('.add-tier-form input[type="number"]');
  thresholdInput.value = '7';
  thresholdInput.dispatchEvent(new Event('input', { bubbles: true }));
  target.querySelector('.add-tier-form button').click();
  flushSync();

  expect(rosterStore.roster.talentTrees.fury.tiers.length).toBe(startCount + 1);
  expect(rosterStore.roster.talentTrees.fury.tiers.at(-1).threshold).toBe(7);
  cleanup();
});

it('+ Add Talent creates a blank talent and opens its editor', () => {
  seedTwoTierTree();
  render();

  const startCount = rosterStore.roster.talentTrees.fury.tiers[0].talents.length;
  target.querySelector('.add-talent').click();
  flushSync();

  expect(rosterStore.roster.talentTrees.fury.tiers[0].talents.length).toBe(startCount + 1);
  expect(target.querySelector('.talent-editor')).not.toBeNull();
  cleanup();
});

it('editing name/stat/rank values in the talent editor writes through to the tree', () => {
  const { sharpAimId } = seedTwoTierTree();
  render();

  const row = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim'));
  row.querySelector('.edit-toggle').click();
  flushSync();

  const editor = target.querySelector('.talent-editor');
  const nameInput = editor.querySelector('input[type="text"]');
  nameInput.value = 'Renamed Talent';
  nameInput.dispatchEvent(new Event('input', { bubbles: true }));
  nameInput.dispatchEvent(new Event('blur', { bubbles: true }));

  const statSelect = editor.querySelector('select');
  statSelect.value = 'attack_pct';
  statSelect.dispatchEvent(new Event('change', { bubbles: true }));

  const rankInputs = editor.querySelectorAll('.rank-value input');
  rankInputs[0].value = '99';
  rankInputs[0].dispatchEvent(new Event('input', { bubbles: true }));
  rankInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
  flushSync();

  const talent = rosterStore.roster.talentTrees.fury.tiers[0].talents.find((t) => t.id === sharpAimId);
  expect(talent.name).toBe('Renamed Talent');
  expect(talent.statKey).toBe('attack_pct');
  expect(talent.ranks[0]).toBe(99);
  cleanup();
});

it('+ Add Rank grows the ranks array; Remove Last Rank shrinks it but never below 1', () => {
  const { sharpAimId } = seedTwoTierTree();
  render();

  const row = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim'));
  row.querySelector('.edit-toggle').click();
  flushSync();

  const addRankBtn = () => [...target.querySelector('.talent-editor').querySelectorAll('button')].find((b) => b.textContent === '+ Add Rank');
  addRankBtn().click();
  flushSync();
  let talent = rosterStore.roster.talentTrees.fury.tiers[0].talents.find((t) => t.id === sharpAimId);
  expect(talent.ranks.length).toBe(4); // was 3

  const removeRankBtn = () => [...target.querySelector('.talent-editor').querySelectorAll('button')].find((b) => b.textContent === 'Remove Last Rank');
  removeRankBtn().click();
  removeRankBtn().click();
  removeRankBtn().click();
  flushSync();
  talent = rosterStore.roster.talentTrees.fury.tiers[0].talents.find((t) => t.id === sharpAimId);
  expect(talent.ranks.length).toBe(1);
  expect(removeRankBtn().disabled).toBe(true); // refuses to go below 1
  cleanup();
});

it('Remove deletes a talent, and Remove Tier deletes a tier', () => {
  const { sharpAimId } = seedTwoTierTree();
  render();

  const row = [...target.querySelectorAll('.talent-row')].find((r) => r.textContent.includes('Sharp Aim'));
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Remove').click();
  flushSync();
  expect(rosterStore.roster.talentTrees.fury.tiers[0].talents.some((t) => t.id === sharpAimId)).toBe(false);

  const startTierCount = rosterStore.roster.talentTrees.fury.tiers.length;
  target.querySelector('.remove-tier').click();
  flushSync();
  expect(rosterStore.roster.talentTrees.fury.tiers.length).toBe(startTierCount - 1);
  cleanup();
});
