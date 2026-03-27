#!/usr/bin/env python3
"""Bump the version in manifest.json. Usage: bump-version.py [major|minor|patch]"""

import json
import pathlib
import sys

level = sys.argv[1] if len(sys.argv) > 1 else "patch"
idx = {"major": 0, "minor": 1, "patch": 2}
if level not in idx:
    print(f"Usage: {sys.argv[0]} [major|minor|patch]", file=sys.stderr)
    sys.exit(1)

p = pathlib.Path(__file__).parent / "manifest.json"
m = json.loads(p.read_text())
parts = list(map(int, m["version"].split(".")))
while len(parts) < 3:
    parts.append(0)

parts[idx[level]] += 1
for i in range(idx[level] + 1, 3):
    parts[i] = 0

m["version"] = ".".join(map(str, parts))
p.write_text(json.dumps(m, indent=2) + "\n")
print(m["version"])
