"""Index Metro modules in a Hermes-decompiled React Native bundle.

Serves: docs/Reference/Game/README.md ("Re-extracting after a game update").
Usage:  python3 -I index_modules.py <decompiled.js> <modules.json>

Writes one record per `__d(fn, id, deps)` registration: id, start/end line,
deps, the `// Original name:` function names inside, and the most frequent
string literals. Line numbers are what the Reference/Game docs cite.
"""
import json, re, sys

src, out = sys.argv[1], sys.argv[2]
re_d = re.compile(r'^    r\d+ = r0\.__d;$')
re_id = re.compile(r'^    r\d+ = (\d+);$')
re_deps = re.compile(r'^    r\d+ = \[([\d, ]*)\];$')
re_bind = re.compile(r'^    r\d+ = r\d+\.bind\(r\d+\)\(r\d+, r\d+, r\d+\);$')
re_name = re.compile(r'Original name: ([A-Za-z0-9_$]+)')
re_str = re.compile(r"'([A-Za-z][A-Za-z0-9_ .%/:-]{2,60})'")

modules = []
start = None
names, strs = [], {}
prev = [None, None]  # last two lines
with open(src, encoding='utf-8', errors='replace') as f:
    for i, line in enumerate(f, 1):
        line = line.rstrip('\n')
        if re_d.match(line):
            start = i; names = []; strs = {}
        elif start is not None:
            m = re_name.search(line)
            if m: names.append(m.group(1))
            for s in re_str.findall(line):
                strs[s] = strs.get(s, 0) + 1
            if re_bind.match(line) and prev[0] and prev[1]:
                mi = re_id.match(prev[0]); md = re_deps.match(prev[1])
                if mi and md:
                    deps = [int(x) for x in md.group(1).replace(' ', '').split(',') if x]
                    top = sorted(strs.items(), key=lambda kv: -kv[1])[:40]
                    modules.append({'id': int(mi.group(1)), 'start': start, 'end': i,
                                    'lines': i - start + 1, 'deps': deps,
                                    'names': names[:200], 'n_names': len(names),
                                    'strings': [k for k, _ in top]})
                    start = None
        prev = [prev[1], line]
json.dump(modules, open(out, 'w'), indent=0)
print(len(modules), 'modules;', sum(m['lines'] for m in modules), 'lines covered')
