// H2 client-transcription differential for the progression gates the model owns (redesign plan §C):
// talent points, relic slots, awakening points and the conduit rarity rule, against the hand
// transcriptions in engine/__client__/progression.client.js. Exact equality on seeded inputs over the
// domain the model is fed (see each case for the gates the model adds on top of the client).
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../engine/rng.js';
import { talentPointsForLevel, relicSlotCap, awakeningPointsForLevel, UNLOCK_LEVELS } from './legality.js';
import { conduitTypesFor } from './equipment.js';
import { RARITY_IDS } from '../game/gear.js';
import * as CP from '../engine/__client__/progression.client.js';

const N = process.env.HARNESS_DEEP ? 100_000 : 10_000;
const SEED = 0x5eed2b;

function levels() {
  const r = mulberry32(SEED);
  const out = [];
  for (let L = -20; L <= 300; L++) out.push(L);
  for (let i = 0; i < N; i++) out.push(r() < 0.5 ? Math.floor(r() * 400) - 50 : r() * 200);
  return out;
}

describe('progression gates against the client', () => {
  const Ls = levels();

  it('talentPointsForLevel = getAvailableTalentPoints(level, 0)', () => {
    for (const L of Ls) expect(talentPointsForLevel(L), `level ${L}`).toBe(CP.getAvailableTalentPoints(L, 0));
  });

  it('awakeningPointsForLevel = getAvailableAwakeningPoints(level, 0)', () => {
    for (const L of Ls) expect(awakeningPointsForLevel(L), `level ${L}`).toBe(CP.getAvailableAwakeningPoints(L, 0));
  });

  // The client's getMaxRelicSlots takes only the purchased count; the model adds the relic unlock
  // level (UNLOCK_LEVELS.RELICS) and clamps the count to a whole number >= 0.
  it('relicSlotCap = getMaxRelicSlots(extra) from the unlock level on', () => {
    const r = mulberry32(SEED + 1);
    for (let i = 0; i < N; i++) {
      const L = UNLOCK_LEVELS.RELICS + Math.floor(r() * 200);
      const extra = Math.floor(r() * 6);
      expect(relicSlotCap(L, extra), `level ${L}, extra ${extra}`).toBe(CP.getMaxRelicSlots(extra));
    }
    expect(relicSlotCap(UNLOCK_LEVELS.RELICS - 1, 2)).toBe(0);
  });

  // conduitTypesFor lists every type rollConduitForRarity can roll for that rarity and realm. A
  // missing rarity (migrated items) is the model's permissive case and has no client counterpart.
  it('conduitTypesFor = the support of rollConduitForRarity', () => {
    const rarities = [...RARITY_IDS, 'BOGUS', ''];
    expect(RARITY_IDS).toStrictEqual(CP.RARITY_ORDER);
    for (const rarity of rarities) {
      for (const realm of ['base', 'oblivion']) {
        const support = new Set();
        for (const u of [0, 0.25, 0.5, 0.75, 0.999]) {
          const t = CP.rollConduitTypeForRarity(rarity, () => u, realm === 'oblivion');
          if (t) support.add(t);
        }
        expect([...conduitTypesFor(rarity, realm)].sort(), `${rarity} ${realm}`).toStrictEqual([...support].sort());
      }
    }
  });
});
