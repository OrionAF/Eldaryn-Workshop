"""Reduce a module index (from index_modules.py) to likely game-logic modules.

Serves: docs/Reference/Game/README.md ("Re-extracting after a game update").
Usage:  python3 -I filter_logic_modules.py <modules.json> <out.tsv>

Heuristics (tuned on 2.7.0): app code starts at Metro module id 3124 (the game
store); modules whose most frequent strings are React style keys are UI; library
code is dropped unless it mentions a game system. Output columns: id, line range
in decompiled.js, line count, function names, top strings.
"""
import json, re, sys

APP_START = 3124
UI = {'children', 'style', 'backgroundColor', 'color', 'preset', 'center',
      'borderColor', 'fontFamily', 'alignItems', 'gap'}
LIB = re.compile(r'(?i)fiber|reanimated|sentry|rrweb|i18n|lngs|polyfill|webpack|regenerator|buffer|stream|zlib|crypto|axios|firebase|expo|svg|gesture|navigation|metro|babel|hermes|promise|scheduler|immer|zustand|lodash|uuid|base64|utf8|http')
GAME = re.compile(r'(?i)talent|relic|sigil|glyph|mount|pet|crusade|celest|oblivion|transcend|awaken|rarity|gear|equip|stat|damage|attack|skill|stone|fortress|clan|pvp|arena|boss|drop|loot|class')
SKIP = ('get', '_interopDefault', '_interopNamespace', 'onPress')

modules = sorted(json.load(open(sys.argv[1])), key=lambda m: m['id'])
rows = []
for m in modules:
    if m['id'] < APP_START:
        continue
    if len(set(m['strings'][:12]) & UI) >= 2:
        continue
    txt = ' '.join(m['names'][:30] + m['strings'][:20])
    if LIB.search(txt) and not GAME.search(txt):
        continue
    if m['lines'] < 12 and not m['strings']:
        continue
    rows.append(m)

with open(sys.argv[2], 'w') as f:
    f.write("id\tlines(decompiled.js)\tn\tfunction names\ttop strings\n")
    for m in rows:
        nm = ','.join(dict.fromkeys(n for n in m['names'] if n not in SKIP))[:110]
        st = ','.join(s for s in m['strings'][:10] if s not in ('enumerable', 'get', 'value', 'default'))[:90]
        f.write(f"{m['id']}\t{m['start']}-{m['end']}\t{m['lines']}\t{nm}\t{st}\n")
print(len(rows), 'modules,', sum(m['lines'] for m in rows), 'lines')
