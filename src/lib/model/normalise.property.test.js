// H1 property: normaliseCharacter on junk and on out-of-gate characters (plan C). Never throws, is
// idempotent, and its output holds every M1/M2 gate.
import { describe, it, expect } from 'vitest';
import { forAll, arbRawCharacter, arbJunkCharacter, arbJunk, junkify, pick, int } from '../harness/arbitrary.js';
import { HARNESS_SPECS } from '../harness/specs.js';
import { normaliseCharacter, normaliseRoster } from './index.js';
import {
  talentPointsForLevel, relicSlotCap, checkPreset, dualEquipUnlocked, dualTalentsUnlocked, mountsUnlocked,
} from './legality.js';
import { pointsSpent } from './talents.js';
import { stonePoolOf, STONE_STAT_DEFS } from './stones.js';
import { conduitTypesFor, maxItemLevel, secondaryStatMaxValue, itemStatLevel } from './equipment.js';
import { glyphQualityBand, MOUNT_GLYPH_SOCKETS } from './glyphs.js';
import { isFormSigil, MAX_ALTAR_TIER } from './sigils.js';
import { sigilBySpecies } from '../game/sigils.js';

// M1 reports the unlock gates through checkPreset and never repairs them (plan A.4); everything else it lists is repaired.
const REPORT_ONLY = new Set(['dualEquip', 'dualTalents', 'mounts', 'transcendence']);
const hardEntries = (c, p) => checkPreset(c, p).filter((e) => !e.warn && !REPORT_ONLY.has(e.gate));

const finiteDeep = (v, path = '') => {
  if (typeof v === 'number') expect(Number.isFinite(v), `${path} = ${v}`).toBe(true);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finiteDeep(x, `${path}.${k}`);
};

describe('normaliseCharacter property', () => {
  it('never throws on junk: anything at all, and a character with random fields replaced', () => {
    forAll('normalise-junk-anything', (rng) => arbJunk(rng, 3), (x) => {
      expect(() => normaliseCharacter(x)).not.toThrow();
    }, { runs: 300 });
    forAll('normalise-junk-character', (rng) => arbJunkCharacter(rng), (raw) => {
      const c = normaliseCharacter(raw);
      expect(c.presets.length).toBeGreaterThanOrEqual(2);
      expect(() => normaliseRoster({ schemaVersion: 2, characters: [raw] })).not.toThrow();
    }, { runs: 150 });
  });

  it('is idempotent: n(n(x)) deep-equals n(x)', () => {
    forAll('normalise-idempotent', (rng) => (rng() < 0.5 ? arbRawCharacter(rng) : arbJunkCharacter(rng)), (raw) => {
      const once = normaliseCharacter(raw);
      const twice = normaliseCharacter(once);
      // ids of an unnamed object are fresh per call; compare everything else
      expect(twice).toEqual(once);
    }, { runs: 200 });
  });

  it('every output holds the M1/M2 gates', () => {
    forAll('normalise-gates', (rng) => arbRawCharacter(rng), (raw) => {
      const c = normaliseCharacter(raw);
      const L = c.level;
      expect(L).toBeGreaterThanOrEqual(1);
      expect(L).toBeLessThanOrEqual(100);

      // talent cap
      for (const set of c.talentSets) expect(pointsSpent(set.allocation)).toBeLessThanOrEqual(talentPointsForLevel(L));

      // relic cap and ownership
      const cap = relicSlotCap(L, c.extraRelicSlots);
      for (const p of c.presets) {
        expect(p.relicIds.length).toBeLessThanOrEqual(cap);
        for (const id of p.relicIds) expect(c.relics[id], id).toBeGreaterThan(0);
      }

      // sigils: Form and Ancient stay level 1, altar tier in range, condition is absent or a string
      expect(c.sigils.altarTier).toBeGreaterThanOrEqual(1);
      expect(c.sigils.altarTier).toBeLessThanOrEqual(MAX_ALTAR_TIER);
      for (const [sp, own] of Object.entries(c.sigils.owned)) {
        const def = sigilBySpecies(sp);
        expect(def, sp).toBeTruthy();
        if (isFormSigil(sp) || def.rarity === 'Ancient') expect(own.level, sp).toBe(1);
        else expect(own.level).toBeGreaterThanOrEqual(1);
        if (own.condition !== undefined) expect(typeof own.condition).toBe('string');
        // below the conditions level the stored value is kept and ignored when the Fighter is built (build/fighter.property.test.js)
      }

      // every hard gate checkPreset knows; only advisory (warn) entries may remain
      for (const p of c.presets) {
        const hard = hardEntries(c, p);
        expect(hard, JSON.stringify(hard)).toEqual([]);
        // the report-only gates are listed exactly when the preset uses a locked feature
        const gates = new Set(checkPreset(c, p).map((e) => e.gate));
        expect(gates.has('dualEquip')).toBe(p.equipmentSet === 2 && !dualEquipUnlocked(L));
        expect(gates.has('dualTalents')).toBe(p.talentSet === 1 && !dualTalentsUnlocked(L));
        expect(gates.has('mounts')).toBe(!!p.mountId && !mountsUnlocked(L));
      }

      // stone pools and values
      for (const [list, pool] of [[c.enchantStones, 'base'], [c.oblivionEnchantStones, 'oblivion']]) {
        const ids = new Set();
        for (const s of list) {
          expect(stonePoolOf(s.type), s.type).toBe(pool);
          expect(ids.has(s.id)).toBe(false);
          ids.add(s.id);
          for (const st of s.stats) {
            const def = STONE_STAT_DEFS.get(st.type);
            expect(def, st.type).toBeTruthy();
            expect(st.value).toBeGreaterThanOrEqual(def.min);
            expect(st.value).toBeLessThanOrEqual(def.max);
          }
        }
      }

      // items: level cap, secondary ceiling, conduit legal for rarity and realm
      for (const [key, set] of Object.entries(c.equipment)) {
        const realm = key === 'oblivion' ? 'oblivion' : 'base';
        for (const item of Object.values(set.items)) {
          if (!item) continue;
          if (item.itemLevel != null) expect(item.itemLevel).toBeLessThanOrEqual(maxItemLevel(realm));
          const sl = itemStatLevel(item.itemLevel ?? maxItemLevel(realm), realm);
          for (const s of item.secondaryStats) expect(s.value, s.type).toBeLessThanOrEqual(secondaryStatMaxValue(s.type, sl));
          if (item.conduit) expect(conduitTypesFor(item.rarity, realm), `${item.rarity} ${item.conduit.type}`).toContain(item.conduit.type);
        }
      }

      // glyph quality inside the rarity's band; mount sockets within their counts
      for (const g of c.glyphs) {
        if (!g.secondary) continue;
        const [lo, hi] = glyphQualityBand(g.rarity);
        expect(g.secondary.quality).toBeGreaterThanOrEqual(lo);
        expect(g.secondary.quality).toBeLessThanOrEqual(hi);
      }
      for (const m of c.mounts) for (const [tier, n] of Object.entries(MOUNT_GLYPH_SOCKETS)) expect(m.glyphs[tier].length).toBe(n);

      // presets: set 2 and talent set 2 only once unlocked is reported by checkPreset (above); two-preset minimum
      expect(c.presets.length).toBeGreaterThanOrEqual(2);
      expect(c.presets.some((p) => p.id === c.activePresetId)).toBe(true);
    }, { runs: 200 });
  });

  it('output stats of every item and stone are finite', () => {
    forAll('normalise-finite', (rng) => arbJunkCharacter(rng, { spec: pick(rng, HARNESS_SPECS) }), (raw) => {
      const c = normaliseCharacter(raw);
      finiteDeep({ equipment: c.equipment, stones: [c.enchantStones, c.oblivionEnchantStones], relics: c.relics, level: c.level });
    }, { runs: 150 });
  });

  it('a junkified normalised character normalises to a valid one (round trip through junk)', () => {
    forAll('normalise-roundtrip', (rng) => junkify(normaliseCharacter(arbRawCharacter(rng)), rng, int(rng, 1, 5)), (raw) => {
      const c = normaliseCharacter(raw);
      for (const p of c.presets) expect(hardEntries(c, p)).toEqual([]);
    }, { runs: 150 });
  });
});
