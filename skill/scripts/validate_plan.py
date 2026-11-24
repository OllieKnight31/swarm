#!/usr/bin/env python3
"""
Validate a /swarm plan.json before launch, and print how many agents it can start.

Errors (block the launch):
  1. The plan is an object with a non-empty `units` list, and every unit is an object.
  2. Every unit has a unique `id` (letters, digits, - and _ only) and a non-empty `task`.
  3. `wave` is a whole number >= 1 (missing = 1).
  4. `writes`, `reads`, `checks` and `after` are lists of text when present.
  5. Within one wave, no file is written by more than one unit
     (units in the same wave run at the same time; two writers = lost edits).
  6. A unit never reads a file that another unit in the SAME wave writes
     (it would read a half-written file). Put the reader in a later wave.
  7. `after` (optional list of unit ids) only names units in an EARLIER wave.

Warnings (do not block):
  - A wave with a single unit (that wave is not parallel; fold it in if you can).
  - More than 12 units in one wave (they queue; check the split is not too fine).
  - A unit with no `deliverable` (the sceptic has nothing concrete to check against).

Usage:
    python3 validate_plan.py path/to/plan.json [--verify light|strict|off] [--gaps N] [--max-gap-units N]

Works on Python 3.8 or newer. Uses the standard library only.
"""

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")
# agents per unit (minimum, worst case): keep in step with scripts/swarm.workflow.js
PER_UNIT = {"off": (1, 1), "light": (2, 4), "strict": (3, 5)}


def is_wave(w):
    return isinstance(w, int) and not isinstance(w, bool) and w >= 1


def validate(plan):
    errors, warnings = [], []
    if not isinstance(plan, dict):
        return ["plan.json must be an object like {\"job\": \"...\", \"units\": [...]}"], warnings
    units = plan.get("units")
    if not isinstance(units, list) or not units:
        return ["plan.json needs a non-empty 'units' list"], warnings
    if not str(plan.get("job", "")).strip():
        warnings.append("plan has no 'job' text")

    ids, wave_of, good = set(), {}, []
    for i, u in enumerate(units):
        if not isinstance(u, dict):
            errors.append(f"unit #{i} is not an object")
            continue
        uid = u.get("id")
        if not isinstance(uid, str) or not uid:
            errors.append(f"unit #{i} has no id")
            continue
        if not SAFE_ID.match(uid):
            errors.append(f"unit id '{uid}' may only use letters, digits, - and _ (it becomes a file name)")
        if uid in ids:
            errors.append(f"duplicate unit id '{uid}'")
            continue
        ids.add(uid)
        good.append(u)
        if not str(u.get("task", "")).strip():
            errors.append(f"unit '{uid}' has an empty task")
        w = u.get("wave", 1)
        if not is_wave(w):
            errors.append(f"unit '{uid}' has invalid wave {w!r} (whole number >= 1, not in quotes)")
            w = 1
        wave_of[uid] = w
        for key in ("writes", "reads", "checks", "after"):
            v = u.get(key)
            if v is not None and not (isinstance(v, list) and all(isinstance(x, str) for x in v)):
                errors.append(f"unit '{uid}': '{key}' must be a list of text, for example [\"a.md\"]")
                u[key] = []
        if not str(u.get("deliverable", "")).strip():
            warnings.append(f"unit '{uid}' has no deliverable (say what done looks like)")

    by_wave = defaultdict(list)
    for u in good:
        by_wave[wave_of[u["id"]]].append(u)

    for w, group in sorted(by_wave.items()):
        writers = defaultdict(list)
        for u in group:
            for f in u.get("writes") or []:
                writers[f].append(u["id"])
        for f, owners in writers.items():
            if len(owners) > 1:
                errors.append(f"wave {w}: '{f}' written by {', '.join(owners)} (one owner per file per wave)")
        for u in group:
            for f in u.get("reads") or []:
                owners = [o for o in writers.get(f, []) if o != u["id"]]
                if owners:
                    errors.append(
                        f"wave {w}: '{u['id']}' reads '{f}' while {', '.join(owners)} writes it "
                        f"in the same wave; move the reader to a later wave"
                    )
        if len(group) == 1 and len(by_wave) > 1:
            warnings.append(f"wave {w} has one unit ({group[0]['id']}); it runs alone")
        if len(group) > 12:
            warnings.append(f"wave {w} has {len(group)} units; they queue and run a few at a time")

    for u in good:
        for dep in u.get("after") or []:
            if dep not in wave_of:
                errors.append(f"unit '{u['id']}' lists unknown dependency '{dep}'")
            elif wave_of[dep] >= wave_of[u["id"]]:
                errors.append(f"unit '{u['id']}' depends on '{dep}' which is not in an earlier wave")

    return errors, warnings


def agent_counts(n_units, verify, gaps, max_gap_units):
    lo, hi = PER_UNIT[verify]
    minimum = n_units * lo + (1 if gaps > 0 else 0) + 1
    worst = n_units * hi + gaps * (1 + max_gap_units * hi) + 1
    return minimum, worst


def parse_args(argv):
    opts = {"verify": "light", "gaps": 1, "max_gap_units": 5}
    path, i = None, 0
    while i < len(argv):
        a = argv[i]
        if a in ("--verify", "--gaps", "--max-gap-units"):
            if i + 1 >= len(argv):
                raise ValueError(f"{a} needs a value")
            val = argv[i + 1]
            if a == "--verify":
                if val not in PER_UNIT:
                    raise ValueError("--verify must be light, strict or off")
                opts["verify"] = val
            else:
                if not val.isdigit():
                    raise ValueError(f"{a} must be a whole number")
                opts["gaps" if a == "--gaps" else "max_gap_units"] = int(val)
            i += 2
        elif a.startswith("--"):
            raise ValueError(f"unknown option {a}")
        elif path is None:
            path = a
            i += 1
        else:
            raise ValueError("give one plan.json path")
    if path is None:
        raise ValueError("give the path to plan.json")
    return path, opts


def main():
    try:
        path, opts = parse_args(sys.argv[1:])
    except ValueError as e:
        print(f"RESULT: FAILED - {e}")
        print("Usage: python3 validate_plan.py path/to/plan.json [--verify light|strict|off] [--gaps N] [--max-gap-units N]")
        sys.exit(2)
    try:
        plan = json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        print(f"RESULT: FAILED - cannot read {path}: {e}")
        sys.exit(1)

    errors, warnings = validate(plan)
    units = [u for u in (plan.get("units") or [] if isinstance(plan, dict) else []) if isinstance(u, dict)]
    counts = defaultdict(int)
    for u in units:
        w = u.get("wave", 1)
        counts[w if is_wave(w) else 1] += 1
    print(f"Units: {len(units)} | Waves: {len(counts)} | "
          + " | ".join(f"w{w}: {n}" for w, n in sorted(counts.items())))
    for w in warnings:
        print(f"  [~] {w}")
    for e in errors:
        print(f"  [!] {e}")
    if errors:
        print("RESULT: FAILED - fix the plan before launching")
        sys.exit(1)
    lo, hi = agent_counts(len(units), opts["verify"], opts["gaps"], opts["max_gap_units"])
    print(f"Agents (verify={opts['verify']}, gap rounds={opts['gaps']}, max {opts['max_gap_units']} gap units per round): "
          f"at least {lo}, worst case {hi}")
    print(f"Tokens, very rough (50k to 110k per agent): {lo * 50 / 1000:.1f}M to {hi * 110 / 1000:.1f}M")
    print("RESULT: PASSED")


if __name__ == "__main__":
    main()
