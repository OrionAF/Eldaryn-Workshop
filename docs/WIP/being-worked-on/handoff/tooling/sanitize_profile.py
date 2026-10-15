"""Whitelist-strip a captured /player/full-state profile into a test fixture (no name, player/clan ids, quests, economy).
Usage: python3 -I sanitize_profile.py <profile.json> <out.json> <label>"""
import json, sys
src, dst, label = sys.argv[1:4]
DROP_KEYS = {'createdAt', 'acquiredAt', 'activatedAt', 'upgradedFrom', 'qualityRerolledFrom', 'fragments'}
def scrub(o):
    if isinstance(o, dict): return {k: scrub(v) for k, v in o.items() if k not in DROP_KEYS}
    if isinstance(o, list): return [scrub(v) for v in o]
    return o
def pick(d, keys): return {k: d[k] for k in keys if k in (d or {})}
p = json.load(open(src))
out = pick(p, ['equipment', 'equipment2', 'activeEquipmentSet', 'skills', 'excludedDropStats',
               'talentState', 'talentState2', 'activeTalentSet', 'presets', 'activePresetId', 'awakeningState',
               'transcendence', 'transcendencePresets', 'activeTranscendencePresetId', 'enchantSlots', 'enchantSlots2',
               'enchantStones', 'computedStats', 'totalPower', 'fortressBuffs'])
out['_note'] = f"Stripped capture of a real 2.7.3 player profile ({label}), one of the user's own characters, committed with the user's permission 2026-10-15. Game state plus the server's computedStats and totalPower: no name, player ids, clan, quests or economy."
out['player'] = {'name': f'Fixture {label}', 'class': p['player']['class'], 'level': p['player']['level'], 'glyphs': p['player']['glyphs']}
out['petState'] = pick(p.get('petState'), ['ownedPets', 'equippedPetId', 'altar'])
out['mountState'] = pick(p.get('mountState'), ['ownedMounts', 'activeMountId'])
out['sigilState'] = pick(p.get('sigilState'), ['ownedSigils', 'equippedSpecies', 'utilitySlotSpecies', 'druidEquippedSpecies', 'druidUtilitySlotSpecies', 'altarTier'])
out['relicState'] = pick(p.get('relicState'), ['ownedRelics', 'equippedRelicIds', 'extraSlotsPurchased'])
if 'oblivionPrestige' in p: out['oblivionPrestige'] = pick(p['oblivionPrestige'], ['enabled', 'unlocked', 'activeRealm', 'oblivion'])
json.dump(scrub(out), open(dst, 'w'), indent=1)
s = open(dst).read()
for bad in [p['player']['playerId'], p['player']['name'], p['player'].get('parentPlayerId') or '@@none@@']:
    assert bad not in s, 'leak: ' + bad[:4]
print('ok', dst, len(s))
