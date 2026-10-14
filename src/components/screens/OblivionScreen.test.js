import { it, expect, beforeEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import OblivionScreen from './OblivionScreen.svelte';
import { rosterStore } from '../../lib/rosterStore.svelte.js';
import { strainRows, maxFloorAtThreshold, highestFreeFloor } from '../../lib/features/oblivionDungeon.js';
import { oblivionFloors } from '../../lib/tasks/oblivionFloors.js';

let target;
beforeEach(() => {
  localStorage.clear();
  rosterStore.addCharacter('Obl', 'WARRIOR');
  target = document.createElement('div');
  document.body.appendChild(target);
});

it('store: realm needs the unlock; level clamps', () => {
  expect(rosterStore.setActiveRealm('oblivion')).toBe(false);
  expect(rosterStore.current.oblivion.activeRealm).toBe('base');
  rosterStore.setOblivionUnlocked(true);
  expect(rosterStore.setActiveRealm('oblivion')).toBe(true);
  expect(rosterStore.current.oblivion.activeRealm).toBe('oblivion');
  rosterStore.setOblivionLevel(250);
  expect(rosterStore.current.oblivion.level).toBe(100);
  rosterStore.setOblivionLevel('nope');
  expect(rosterStore.current.oblivion.level).toBe(100);
  rosterStore.setOblivionUnlocked(false);
  expect(rosterStore.current.oblivion.activeRealm).toBe('base');
});

it('floor helpers: Math.round strain, free floor, threshold', () => {
  const rows = strainRows(0, 1, 12);
  expect(rows.find((r) => r.floor === 3).strain).toBe(0);
  expect(rows.find((r) => r.floor === 10).instability).toBe(171);
  expect(strainRows(171, 10, 10)[0].strain).toBe(0);
  expect(highestFreeFloor(171)).toBe(10);
  expect(maxFloorAtThreshold([{ floor: 1, p: 1 }, { floor: 2, p: 0.95 }, { floor: 3, p: 0.5 }])).toBe(2);
  expect(maxFloorAtThreshold([{ floor: 1, p: 0.1 }])).toBeNull();
});

it('oblivionFloors task: a strong fighter clears low floors; early stop on no wins', async () => {
  const stats = {
    totalHp: 1e9, totalAttack: 5e7, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0, totalCritDamage: 1.5,
    totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0, totalMissChance: 0,
    totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0, totalPvpAttack: 0, totalPvpDefense: 0,
    totalOblivionPower: 40,
  };
  const r = await oblivionFloors({ fighter: { stats, class: 'WARRIOR', spec: null, sigils: [] }, from: 1, to: 3, n: 8 });
  expect(r.power).toBe(40);
  expect(r.rows.map((x) => x.floor)).toEqual([1, 2, 3]);
  expect(r.rows[0].strain).toBe(0);
  expect(r.rows[0].p).toBe(1);
  expect(r.maxFloor).toBeGreaterThanOrEqual(1);
  const weak = await oblivionFloors({ fighter: { stats: { ...stats, totalAttack: 1, totalHp: 100 }, class: 'WARRIOR', spec: null, sigils: [] }, from: 1, to: 10, n: 4, maxMs: 20000 });
  expect(weak.rows).toHaveLength(3);
  expect(weak.maxFloor).toBeNull();
});

it('screen: locked shows a prompt; unlocked shows power, floors and the realm toggle', () => {
  const app = mount(OblivionScreen, { target });
  flushSync();
  expect(target.textContent).toContain('locked');
  unmount(app);

  rosterStore.setOblivionUnlocked(true);
  const app2 = mount(OblivionScreen, { target });
  flushSync();
  expect(target.querySelectorAll('.floor-table tbody tr')).toHaveLength(30);
  expect(target.querySelector('[data-testid="power"]')).not.toBeNull();
  const chip = [...target.querySelectorAll('.realm .chip')].find((b) => b.textContent.trim() === 'Oblivion');
  chip.click();
  flushSync();
  expect(rosterStore.current.oblivion.activeRealm).toBe('oblivion');
  unmount(app2);
});
