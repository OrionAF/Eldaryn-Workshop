import { describe, it, expect } from 'vitest';
import { normaliseTalents, migrateTalentsFromV1, sanitiseAllocation, pointsSpent, TALENT_POINT_CAP } from './talents.js';
import { talentTiers } from '../game/talents.js';

const t1 = (spec) => talentTiers(spec)[0].talents;
const t2 = (spec) => talentTiers(spec)[1].talents;

describe('normaliseTalents', () => {
  it('drops a spec of another class and clears allocation', () => {
    const raw = { talentSets: [{ spec: 'WARRIOR_DPS', allocation: { [t1('WARRIOR_DPS')[0].id]: 2 } }, { spec: 'MYSTIC_MAGE', allocation: {} }] };
    const out = normaliseTalents(raw, { class: 'MYSTIC' });
    expect(out.talentSets[0]).toEqual({ spec: null, allocation: {} });
    expect(out.talentSets[1].spec).toBe('MYSTIC_MAGE');
    expect(normaliseTalents(raw, { class: null }).talentSets[1].spec).toBeNull();
  });

  it('clamps ranks, drops unknown ids and talents of other specs', () => {
    const a = t1('WARRIOR_DPS')[0];
    const out = normaliseTalents(
      { talentSets: [{ spec: 'WARRIOR_DPS', allocation: { [a.id]: 99, nope: 3, [t1('WARRIOR_TANK')[0].id]: 2 } }] },
      { class: 'WARRIOR' },
    );
    expect(out.talentSets[0].allocation).toEqual({ [a.id]: a.maxRank });
  });

  it('gates tiers: tier 2 needs 5 points in tier 1', () => {
    const spec = 'WARRIOR_DPS';
    const tier2 = t2(spec)[0];
    expect(sanitiseAllocation({ [tier2.id]: 1 }, spec)).toEqual({});
    const tier1 = t1(spec);
    const alloc = { [tier1[0].id]: 5, [tier2.id]: 1 };
    expect(sanitiseAllocation(alloc, spec)).toEqual(alloc);
  });

  it('never exceeds the point cap and is idempotent', () => {
    const spec = 'WARRIOR_DPS';
    const all = {};
    for (const tier of talentTiers(spec)) for (const t of tier.talents) all[t.id] = t.maxRank;
    const once = sanitiseAllocation(all, spec);
    expect(pointsSpent(once)).toBeLessThanOrEqual(TALENT_POINT_CAP);
    expect(sanitiseAllocation(once, spec)).toEqual(once);
    const n = normaliseTalents({ talentSets: [{ spec, allocation: all }] }, { class: 'WARRIOR' });
    expect(normaliseTalents(n, { class: 'WARRIOR' })).toEqual(n);
  });

  it('survives garbage', () => {
    expect(normaliseTalents(null, { class: 'WARRIOR' }).talentSets).toHaveLength(2);
    expect(normaliseTalents({ talentSets: 'x' }, undefined).talentSets[0].spec).toBeNull();
  });
});

describe('migrateTalentsFromV1', () => {
  it('maps spec keys and matches talents by name, dropping unmatched', () => {
    const { value } = migrateTalentsFromV1({
      talentSets: [
        { spec: 'arms', allocation: { arms_t1_sharpened_blade: 3, arms_t1_made_up: 2 } },
        { spec: 'marksmanship', allocation: { marks_t1_hunters_drain: 2 } },
      ],
    });
    expect(value.talentSets[0]).toEqual({ spec: 'WARRIOR_DPS', allocation: { dps_t1_sharpened_blade: 3 } });
    expect(value.talentSets[1]).toEqual({ spec: 'SENTINEL_MARKSMANSHIP', allocation: { marks_t1_hunters_drain: 2 } });
  });

  it('empty or unknown specs become empty sets', () => {
    expect(migrateTalentsFromV1({}).value.talentSets).toEqual([{ spec: null, allocation: {} }, { spec: null, allocation: {} }]);
  });
});
