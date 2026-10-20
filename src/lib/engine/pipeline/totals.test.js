import { describe, it, expect } from 'vitest';
import { calculateTotalStats } from './totals.js';
import { TOTAL_KEYS } from './sheet.js';

const BASE = { attack: 10, hp: 100, attackSpeed: 1, critChance: 0, critDamage: 1.5 };
const sec = (type, value) => ({ type, value });
const item = (attack, hp, ...secondaryStats) => ({ primaryStats: { attack, hp }, secondaryStats });
// calculateTotalStats(base, equipment, talents, pet, sigils, stones, awakening, a7, fortress,
//                     transcendence, mounts, ctx)
const calc = (equipment = {}, ctx = {}, src = {}) =>
  calculateTotalStats(
    BASE, equipment, src.talents, src.pet, src.sigils, src.stones, src.awakening, src.a7,
    src.fortress, src.transcendence, src.mounts, ctx,
  );

describe('calculateTotalStats (L1215735-1217872)', () => {
  it('base only: client baseStats pass through (L1215735-1215824)', () => {
    const out = calc({}, { playerClass: 'WARRIOR' });
    expect(out.totalAttack).toBe(10);
    expect(out.totalHp).toBe(100);
    expect(out.totalAttackSpeed).toBe(1);
    expect(out.totalCritDamage).toBe(1.5);
    expect(out.totalCritChance).toBe(0);
    expect(out.totalDominion).toBe(0);
    expect(Object.keys(out).some((k) => k.startsWith('raw'))).toBe(false);
    expect(out.disruptionEffect).toBeUndefined();
  });

  it('emits exactly the sheet total keys (L1217178-1217490)', () => {
    const out = calc({}, { playerClass: 'WARRIOR' });
    const keys = Object.keys(out).filter((k) => !k.startsWith('raw') && k !== 'disruptionEffect');
    expect([...keys].sort()).toEqual([...TOTAL_KEYS].sort());
  });

  it('gear primaries and Attack% / HP% multiply the flat sum, then floor (L1217135-1217177)', () => {
    // attack: (10+990) * (1+20/100) = 1200; hp: (100+4900) * (1+10/100) = 5500
    const out = calc({
      WEAPON: item(990, 0, sec('ATTACK_PERCENT', 20)),
      CHEST: item(0, 4900, sec('HEALTH_PERCENT', 10)),
    });
    expect(out.totalAttack).toBe(1200);
    expect(out.totalHp).toBe(5500);
    expect(out.totalAttackPercent).toBe(20);
    expect(out.totalHealthPercent).toBe(10);
  });

  it('floors fractional Attack / HP (L1217155-1217174)', () => {
    // 10 * 1.25 = 12.5 -> 12
    const out = calc({ WEAPON: item(0, 0, sec('ATTACK_PERCENT', 25)) });
    expect(out.totalAttack).toBe(12);
  });

  it('soft-caps a secondary and emits raw only above the cap (L1217191-1217226, L1217495+)', () => {
    // Crit raw 90 on 50/90: 50 + 40*(1-(80/120)^2) = 72.222 -> 72.2
    const out = calc({ RING: item(0, 0, sec('CRIT_CHANCE', 90)) });
    expect(out.totalCritChance).toBe(72.2);
    expect(out.rawCritChance).toBe(90);
    const under = calc({ RING: item(0, 0, sec('CRIT_CHANCE', 30)) });
    expect(under.totalCritChance).toBe(30);
    expect(under.rawCritChance).toBeUndefined();
  });

  it('doc worked examples: Block raw 80 -> 62.2, raw 120 -> 70, Penetration 66.08 -> 51 (stats.md §4.3)', () => {
    expect(calc({ RING: item(0, 0, sec('BLOCK_CHANCE', 80)) }).totalBlockChance).toBe(62.2);
    const b120 = calc({ RING: item(0, 0, sec('BLOCK_CHANCE', 120)) });
    expect(b120.totalBlockChance).toBe(70);
    expect(b120.rawBlockChance).toBe(120);
    expect(calc({ RING: item(0, 0, sec('PENETRATION', 66.08)) }).totalPenetration).toBe(51);
  });

  it('raw* uses parseFloat(toFixed), not Math.round (L1217495-1217870)', () => {
    // crit 50.25: total 50 + 40*(1-(80/80.25)^2) = 50.2488 -> 50.2; raw 50.25.toFixed(1) = "50.3"
    const out = calc({ RING: item(0, 0, sec('CRIT_CHANCE', 50.25)) });
    expect(out.totalCritChance).toBe(50.2);
    expect(out.rawCritChance).toBe(50.3);
  });

  it('Attack Speed / Crit Damage are multipliers rounded to 2 dp (L1217178-1217226)', () => {
    // crit damage 1.5 + 1.76 = 3.26 on 3/7: K=4, s=8: 3 + 4*(1-(8/8.26)^2) = 3.2478 -> 3.25
    const out = calc({ HEAD: item(0, 0, sec('CRIT_DAMAGE', 1.76)) });
    expect(out.totalCritDamage).toBe(3.25);
    expect(out.rawCritDamage).toBe(3.26);
  });

  it('sums every source additively; Flat crit damage divides by 100; mounts feed HP% twice (L1216223-1216883)', () => {
    const out = calc({}, { playerClass: 'WARRIOR' }, {
      talents: { attackPercent: 20, hpPercent: 5, critDamageFlat: 50, attackSpeedFlat: 0.1, dominionFlat: 2 },
      transcendence: { critDamageFlat: 25 },
      awakening: { critDamageFlat: 25, spellDamageFlat: null, spellResistFlat: null },
      pet: { flatAttack: 100, flatHp: 200, critDamage: 0.2 },
      sigils: { flatHp: 300, attackPercent: 5 },
      stones: { flatAttack: 50, pvpAttack: 50.4, pvpDefense: 10.5, oblivionPower: 7.4 },
      fortress: { pvpAttack: 25, pvpDefense: 0.2 },
      mounts: { hpPercent: 3, healthPercent: 2 },
    });
    // attack: (10+100+50) * (1+(20+5)/100) = 200
    expect(out.totalAttack).toBe(200);
    // hp: (100+200+300) * (1+(5+3+2)/100) = 660
    expect(out.totalHp).toBe(660);
    // crit damage: 1.5 + 0.5 + 0.25 + 0.2 + 0.25 = 2.7
    expect(out.totalCritDamage).toBe(2.7);
    expect(out.totalAttackSpeed).toBe(1.1);
    expect(out.totalPvpAttack).toBe(75); // round(50.4 + 25)
    expect(out.totalPvpDefense).toBe(11); // round(10.5 + 0.2)
    expect(out.totalOblivionPower).toBe(7);
    expect(out.totalSpellDamage).toBe(0);
    expect(out.totalDominion).toBe(0); // Warrior: dominion is Necromancer-only
  });

  it('a7 is summed when given, skipped when undefined (L1216672-1216754)', () => {
    const out = calc({}, {}, { a7: { attackPercent: 25, pvpAttack: 10 } });
    expect(out.totalAttack).toBe(12);
    expect(out.totalPvpAttack).toBe(10);
  });

  it('gear: PVP secondaries have no switch case; conduits and Oblivion Power sum and round (L1215856-1216210)', () => {
    const out = calc({
      WEAPON: { ...item(0, 0, sec('PVP_ATTACK', 50), sec('OBLIVION_POWER', 5.4)), conduit: { type: 'FLAME', value: 10.4 } },
      OFFHAND: { ...item(0, 0), conduit: { type: 'FLAME', value: 5.3 } },
      HEAD: { ...item(0, 0), conduit: { type: 'EARTHEN', value: 3.2 } },
      BELT: { ...item(0, 0), conduit: { type: 'DARK', value: 1.5 } },
    });
    expect(out.totalPvpAttack).toBe(0);
    expect(out.totalOblivionPower).toBe(5);
    expect(out.totalFlameConduit).toBe(16);
    expect(out.totalEarthenConduit).toBe(3);
    expect(out.totalDarkConduit).toBe(2);
  });

  it('null sources, empty slots and unknown slots are skipped', () => {
    const out = calculateTotalStats(BASE, { WEAPON: null, NOT_A_SLOT: item(999, 999) }, null, null, null, null, null, undefined, null, null, null, undefined);
    expect(out.totalAttack).toBe(10);
    expect(out.totalHp).toBe(100);
  });

  describe('Mystic', () => {
    const mystic = (activeSpec) => ({ playerClass: 'MYSTIC', activeSpec });
    const gear = {
      RING: item(0, 0, sec('DAMAGE_REDUCTION', 20), sec('BLOCK_CHANCE', 30), sec('SPELL_CRIT_CHANCE', 40),
        sec('DISRUPTION_CHANCE', 4), sec('FEAR_CHANCE', 3)),
    };
    it('zeroes DR / Block without an unlocking form and spell crit outside MYSTIC_MAGE (L1216903-1216935)', () => {
      const out = calc(gear, mystic('MYSTIC_DRUID'));
      expect(out.totalDamageReduction).toBe(0);
      expect(out.totalBlockChance).toBe(0);
      expect(out.totalSpellCritChance).toBe(0);
      const mage = calc(gear, mystic('MYSTIC_MAGE'));
      expect(mage.totalSpellCritChance).toBe(40);
      expect(mage.totalDamageReduction).toBe(0);
    });
    it('Disruption = disruption + fear; SILENCE is not emitted (L1216975-1216976, L1217395-1217404)', () => {
      const out = calc(gear, mystic('MYSTIC_MAGE'));
      expect(out.totalDisruptionChance).toBe(7);
      expect(out.disruptionEffect).toBeUndefined();
    });
    it('Bear form (Dire Ursine): HP/Attack multipliers, DR + Block unlock, STAGGER (L1216937-1217177)', () => {
      const bear = {
        form: 'BEAR', gearHpMult: 1.6, attackMult: 0.9, attackSpeedMult: 1, unlocksBlockAndDr: true,
        passiveEffects: [sec2('DAMAGE_REDUCTION', 5), sec2('BLOCK_CHANCE', 5), sec2('HP_REGEN', 12)],
      };
      const out = calc({ ...gear, WEAPON: item(990, 1000) }, { ...mystic('MYSTIC_DRUID'), formConfig: bear });
      expect(out.totalDamageReduction).toBe(25); // 20 gear + 5 form
      expect(out.totalBlockChance).toBe(35);
      expect(out.totalHpRegen).toBe(12);
      expect(out.totalAttack).toBe(900); // (10+990) * 0.9
      expect(out.totalHp).toBe(1700); // (100+1000 + 1000*(1.6-1)) = 1700
      expect(out.disruptionEffect).toBe('STAGGER');
    });
    it('Wolf form: attackSpeedMult applies to the raw sum before passives; FEAR (L1216937-1217110)', () => {
      const wolf = {
        form: 'WOLF', gearHpMult: 1.05, attackMult: 1.25, attackSpeedMult: 1.1, unlocksBlockAndDr: false,
        passiveEffects: [sec2('LIFESTEAL', 6), sec2('CRIT_CHANCE', 5), sec2('PENETRATION', 6),
          sec2('DAMAGE_REDUCTION', 5)],
      };
      const out = calc({ HEAD: item(0, 0, sec('ATTACK_SPEED', 0.5)) }, { ...mystic('MYSTIC_DRUID'), formConfig: wolf });
      expect(out.totalAttackSpeed).toBe(1.65); // (1 + 0.5) * 1.1
      expect(out.totalLifesteal).toBe(6);
      expect(out.totalCritChance).toBe(5);
      expect(out.totalPenetration).toBe(6);
      expect(out.totalDamageReduction).toBe(0); // Mystic without unlocksBlockAndDr: passive DR ignored
      expect(out.disruptionEffect).toBe('FEAR');
    });
    it('accepts the catalogue spelling `effects` for passiveEffects', () => {
      const out = calc({}, { ...mystic(null), formConfig: { form: 'BEAR', unlocksBlockAndDr: true, effects: [sec2('HP_REGEN', 12)] } });
      expect(out.totalHpRegen).toBe(12);
    });
  });

  it('non-Mystic keeps DR / passive DR from a form (class != MYSTIC branch, L1216990-1217110)', () => {
    const out = calc({}, { playerClass: 'WARRIOR', formConfig: { unlocksBlockAndDr: false, passiveEffects: [sec2('DAMAGE_REDUCTION', 5)] } });
    expect(out.totalDamageReduction).toBe(5);
  });

  it('form attackSpeedMult multiplies BEFORE the ATTACK_SPEED passive is added (L1216937-1217110)', () => {
    // (1 + 0.25) * 2 = 2.5, + 0.5 passive = 3.0; on 2/4: K=2, s=4: 2 + 2*(1-(4/5)^2) = 2.72
    const out = calc({ HEAD: item(0, 0, sec('ATTACK_SPEED', 0.25)) }, {
      playerClass: 'SENTINEL', formConfig: { attackSpeedMult: 2, passiveEffects: [sec2('ATTACK_SPEED', 0.5)] },
    });
    expect(out.totalAttackSpeed).toBe(2.72);
    expect(out.rawAttackSpeed).toBe(3);
  });

  describe('Necromancer', () => {
    const gear = {
      RING: item(0, 0, sec('CRIT_CHANCE', 30), sec('LIFESTEAL', 10), sec('PENETRATION', 20), sec('SOUL_LINK', 5),
        sec('MINION_ATTACK', 12.34), sec('FEAR_CHANCE', 4), sec('MINION_ATTACK_SPEED', 5)),
    };
    it('zeroes Crit / Lifesteal / Penetration after summation (L1217116-1217133)', () => {
      const out = calc(gear, { playerClass: 'NECROMANCER' });
      expect(out.totalCritChance).toBe(0);
      expect(out.totalLifesteal).toBe(0);
      expect(out.totalPenetration).toBe(0);
      expect(out.rawCritChance).toBeUndefined();
      expect(out.totalSoulLink).toBe(5);
      expect(out.totalMinionAttack).toBe(12.3);
    });
    it('Dominion = talents + transcendence + 1; Fear folds into Disruption with effect FEAR (§3.3, §3.5)', () => {
      const out = calc(gear, { playerClass: 'NECROMANCER' }, { talents: { dominionFlat: 2 }, transcendence: { dominionFlat: 3 } });
      expect(out.totalDominion).toBe(6);
      expect(out.totalDisruptionChance).toBe(4);
      expect(out.disruptionEffect).toBe('FEAR');
    });
    it('Minion Attack Speed has no soft cap and no raw key (L1217458-1217464)', () => {
      const out = calc(gear, { playerClass: 'NECROMANCER' });
      expect(out.totalMinionAttackSpeed).toBe(5);
      expect(out.rawMinionAttackSpeed).toBeUndefined();
    });
    it('Dominion without Necromancer is 0 and never read from gear', () => {
      expect(calc(gear, { playerClass: 'SENTINEL' }, { talents: { dominionFlat: 2 } }).totalDominion).toBe(0);
    });
  });

  it('every capped secondary emits raw* above its soft cap (L1217495-1217870)', () => {
    const pairs = [
      ['ATTACK_SPEED', 'rawAttackSpeed', 2.5], ['DOUBLE_HIT', 'rawDoubleHit', 61], ['CRIT_CHANCE', 'rawCritChance', 51],
      ['CRIT_DAMAGE', 'rawCritDamage', 3.5], ['HP_REGEN', 'rawHpRegen', 41], ['LIFESTEAL', 'rawLifesteal', 41],
      ['DAMAGE_REDUCTION', 'rawDamageReduction', 31], ['BLOCK_CHANCE', 'rawBlockChance', 41],
      ['MISS_CHANCE', 'rawMissChance', 51], ['BLIND_CHANCE', 'rawBlindChance', 31],
      ['PARALYZE_CHANCE', 'rawParalyzeChance', 9], ['PENETRATION', 'rawPenetration', 31],
      ['SPELL_RESIST', 'rawSpellResist', 41], ['SPELL_VAMP', 'rawSpellVamp', 41],
      ['DISRUPTION_CHANCE', 'rawDisruptionChance', 11], ['MINION_CRIT_CHANCE', 'rawMinionCritChance', 51],
      ['MINION_LIFESTEAL', 'rawMinionLifesteal', 41], ['SOUL_LINK', 'rawSoulLink', 41],
    ];
    for (const [type, rawKey, v] of pairs) {
      const out = calc({ RING: item(0, 0, sec(type, v)) }, { playerClass: 'WARRIOR' });
      // base attackSpeed is 1 and critDamage 1.5, so those raws include the base
      const expected = type === 'ATTACK_SPEED' ? v + 1 : type === 'CRIT_DAMAGE' ? v + 1.5 : v;
      expect(out[rawKey], rawKey).toBe(expected);
    }
    // Mystic MAGE spell crit raw
    const sc = calc({ RING: item(0, 0, sec('SPELL_CRIT_CHANCE', 51)) }, { playerClass: 'MYSTIC', activeSpec: 'MYSTIC_MAGE' });
    expect(sc.rawSpellCritChance).toBe(51);
  });
});

function sec2(stat, value) {
  return { stat, value };
}
