// U10: the duel task's seats, A.10 progress phases and checkpoint-on-cancel.
import { describe, it, expect } from 'vitest';
import { runTask } from './index.js';
import { runOptimizerTask } from '../optimizerClient.js';

const stats = (o = {}) => ({
  totalHp: 10000, totalAttack: 1000, totalAttackSpeed: 1, totalDoubleHit: 0, totalCritChance: 0,
  totalCritDamage: 1.5, totalLifesteal: 0, totalHpRegen: 0, totalDamageReduction: 0, totalBlockChance: 0,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 0,
  totalPvpAttack: 0, totalPvpDefense: 0, ...o,
});
const fighter = (o = {}) => ({ stats: stats(o), class: 'WARRIOR', spec: null, sigils: [] });

describe('duel task', () => {
  it('both: true also runs the swapped seat and reports it as `swapped`', async () => {
    const r = await runTask('duel', { attacker: fighter({ totalAttack: 5000 }), defender: fighter({ totalAttack: 10 }), n: 12, seed: 4, both: true });
    expect(r.n).toBe(12);
    expect(r.p).toBe(1);
    expect(r.swapped.n).toBe(12);
    expect(r.swapped.p).toBe(0); // the strong fighter now defends: the weak attacker never wins
  });

  it('progress carries A.10 phases, one per seat', async () => {
    const seen = [];
    await runTask('duel', { attacker: fighter(), defender: fighter(), n: 3, both: true, phaseLabels: ['I attack', 'I defend'] }, { onProgress: (p) => seen.push(p) });
    const last = seen[seen.length - 1];
    expect(last.phases.map((p) => [p.id, p.label, p.state])).toEqual([
      ['attacker', 'I attack', 'done'],
      ['defender', 'I defend', 'done'],
    ]);
    expect(seen.some((p) => p.phases[0].state === 'current' && p.phases[1].state === 'queued')).toBe(true);
  });

  it('a cancelled run posts its checkpoint before resolving aborted', async () => {
    const cps = [];
    const { promise, cancel } = runOptimizerTask({ mode: 'duel', attacker: fighter(), defender: fighter(), n: 100000 }, { onCheckpoint: (c) => cps.push(c) });
    setTimeout(cancel, 60);
    const r = await promise;
    expect(r.aborted).toBe(true);
    expect(cps.length).toBe(1);
    expect(cps[0].done).toBe(r.n);
  });
});
