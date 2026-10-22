"""Reference results of the hand solver for its TypeScript port (src/render/three/handSolver).

    python tools/hand-rig/hand_golden.py

Plain Python with numpy, no Blender: the studio hand's rest from poses/studio-rest.json (hand_rest.py),
the Seven Nation Army example library. Writes src/render/three/handSolver/golden.json:
- "joints": hand_joints for a few explicit angle sets and roots;
- "place": place() on the check strikes (single notes 1-5, an interval, triads on whites and with a
  black, a four-note chord, an unreachable stretch, the left hand);
- "plan": plan() on short phrases (five fingers there and back, a riff, a jump past the speed limit,
  a held note, one finger twice).
"""
import json, os, sys, time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import hand_library, hand_mech as M, hand_plan as P

ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, "src", "render", "three", "handSolver", "golden.json")


def load_rest():
    r = json.load(open(os.path.join(HERE, "poses", "studio-rest.json"), encoding="utf-8"))["place"]
    return {"mcp": {int(f): np.array(v) for f, v in r["mcp"].items()},
            "len": {int(f): list(v) for f, v in r["len"].items()},
            "neutral": np.array(r["neutral"]), "idx": np.array(r["idx"])}


def pose_out(p):
    keep = ("source", "flags", "dropped", "rootVec", "curl", "k", "spread", "lift", "press", "missMm", "angles",
            "violations", "exampleYawDeg")
    return {k: p[k] for k in keep if k in p} | ({"hover": p["hover"]} if "hover" in p else {})


PLACE = [  # name, hand, [(finger, pitch)]
    *[(f"right single {f}", "right", [(f, p)]) for f, p in zip((1, 2, 3, 4, 5), (60, 62, 64, 65, 67))],
    ("right interval C E 1-3", "right", [(1, 60), (3, 64)]),
    ("right triad C E G 1-3-5", "right", [(1, 60), (3, 64), (5, 67)]),
    ("right triad D F# A 1-3-5", "right", [(1, 62), (3, 66), (5, 69)]),
    ("right chord C E G C 1-2-3-5", "right", [(1, 60), (2, 64), (3, 67), (5, 72)]),
    ("right unreachable C4 C6 1-5", "right", [(1, 60), (5, 84)]),
    ("left single 5 E2", "left", [(5, 40)]),
    ("left triad C3 E3 G3 5-3-1", "left", [(5, 48), (3, 52), (1, 55)]),
]


def strikes(hand, seq):
    """seq: [(time, [(finger, pitch, duration)])] -> hand_plan strikes."""
    out = []
    for i, (t, notes) in enumerate(seq):
        out.append({"id": f"{hand[0]}{i}", "time": t, "thumb": None,
                    "notes": [{"pitch": p, "finger": f, "end": round(t + d, 4)} for f, p, d in notes]})
    return out


FIVE = [(0.3 * i, [(f, p, 0.25)]) for i, (f, p) in
        enumerate(zip((1, 2, 3, 4, 5, 4, 3, 2, 1), (60, 62, 64, 65, 67, 65, 64, 62, 60)))]
RIFF = [(0.25 * i, [(f, p, 0.2)]) for i, (f, p) in
        enumerate(zip((3, 3, 1, 3, 4, 5, 5), (40, 40, 43, 40, 38, 36, 35)))]
PLAN = [  # name, hand, strikes
    ("right five fingers there and back", "right", strikes("right", FIVE)),
    ("left riff", "left", strikes("left", RIFF)),
    ("right jump past the limit", "right", strikes("right", [(0.0, [(1, 60, 0.1)]), (0.12, [(5, 91, 0.2)])])),
    ("right held note", "right", strikes("right", [(0.0, [(5, 67, 1.0)]), (0.4, [(3, 64, 0.3)]),
                                                     (0.8, [(1, 60, 0.3)])])),
    ("right one finger twice", "right", strikes("right", [(0.0, [(3, 64, 0.2)]), (0.3, [(3, 64, 0.2)])])),
]


def main():
    rest = load_rest()
    lib = hand_library.load("seven-nation-army")
    rng = np.random.default_rng(7)
    joints = []
    for i in range(4):
        shape = M.canonical_shape(lib, "right")
        ang = M.angles(shape, 0.6 + 0.3 * i, k={2: 1.1}, spread={3: 5.0, 1: (30.0, 10.0)}, lift={4: 10.0})
        root = [float(v) for v in rng.uniform([-10, -20, -40, -200, -150, 20], [10, 40, 10, 200, -50, 60])]
        joints.append({"angles": ang, "root": root, "joints": M.hand_joints(rest, ang, root).tolist()})
    place = []
    for name, hand, notes in PLACE:
        t = time.time()
        p = M.place(rest, lib, hand, notes)
        print(f"place {name}: {p['flags']} miss {p['missMm']} dropped {p['dropped']} {time.time() - t:.2f} s")
        place.append({"name": name, "hand": hand, "notes": notes, "pose": pose_out(p)})
    plan = []
    for name, hand, ss in PLAN:
        t = time.time()
        p = P.plan(rest, lib, hand, ss)
        flags = [r["flags"] for r in p["report"]]
        print(f"plan {name}: {len(ss)} strikes, {len(p['keys'])} keys, flags {flags} {time.time() - t:.2f} s")
        plan.append({"name": name, "hand": hand, "strikes": ss, "keys": p["keys"], "report": p["report"],
                     "poses": [pose_out(q) for q in p["poses"]]})
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"joints": joints, "place": place, "plan": plan}, f, default=float, separators=(",", ":"))
    print("hand_golden:", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
