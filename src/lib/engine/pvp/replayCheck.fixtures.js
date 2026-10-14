// Fighters of the synthetic /arena/fight sample (engine/__fixtures__/arena-fight.sample.json) and of
// the replayCheck tests. Test support only.
const stats = (o) => ({
  totalHp: 1000, totalAttack: 20, totalAttackSpeed: 1.3, totalDoubleHit: 15, totalCritChance: 30,
  totalCritDamage: 1.6, totalLifesteal: 0, totalHpRegen: 3, totalDamageReduction: 10, totalBlockChance: 12,
  totalMissChance: 0, totalBlindChance: 0, totalParalyzeChance: 0, totalPenetration: 25, totalPvpAttack: 30,
  totalPvpDefense: 20, ...o,
});
export const plainA = { class: 'WARRIOR', spec: 'WARRIOR_TANK', sigils: [], stats: stats({}) };
export const plainD = {
  class: 'SENTINEL', spec: 'SENTINEL_DISRUPTION', sigils: [],
  stats: stats({ totalAttackSpeed: 0.9, totalAttack: 24, totalHpRegen: 1.5, totalBlockChance: 0, totalMissChance: 10, totalDoubleHit: 0 }),
};
