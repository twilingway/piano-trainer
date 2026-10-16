"""Candidate fingers per note from the video index, and the request list for the frame review sheets.

Run with Python 3 and numpy, after video_hands.py:
    python tools/hand-rig/finger_candidates.py <hand-poses dir> [--from 2.7] [--to 18.5]
Reads index.json and fingers.decisions.json (if any) from the folder; writes candidates.json (every
note: candidates with their reach and press, the automatic pick) and requests.json (the notes of
the time span still without a decided finger: what the review sheets must show).

A candidate is a fingertip within REACH white keys of the note's key at the onset frame. Its press
is how far the tip moved towards the palm's underside, relative to its knuckle, in the last PRESS_S
before the onset (MediaPipe world landmarks, mm, in the hand's own frame, so a moving hand does not
count). The pick is the candidate with the highest press (capped at PRESS_CAP) minus MISS_COST per white
key off the key: the press is noisy, so the distance leads and the frame review decides.
"""
import argparse, json, os
import numpy as np

REACH = 0.75                            # white keys
PRESS_S = 0.100                         # s before the onset
MISS_COST = 25.0                        # mm of press worth one white key of distance
PRESS_CAP = 10.0                        # mm: world landmarks jump by tens of mm; a press counts this much at most
TIPS = {1: 4, 2: 8, 3: 12, 4: 16, 5: 20}
KNUCKLES = {1: 2, 2: 5, 3: 9, 4: 13, 5: 17}
REVIEW_AT = (-0.100, -0.033, 0.0, 0.033)


def hand_frame(world, side):
    """Origin at the wrist; z out of the back of the hand (pianist's palm-down: up)."""
    w = np.asarray(world)
    o, i, p = w[0], w[5], w[17]
    x = i - p if side == "right" else p - i
    x /= np.linalg.norm(x)
    y = (i + p) / 2 - o
    y -= x * (x @ y)
    y /= np.linalg.norm(y)
    return o, np.vstack([x, y, np.cross(x, y)])


def tip_height(world, side, f):
    """The tip above its knuckle, along the back of the hand, mm."""
    o, R = hand_frame(world, side)
    w = np.asarray(world)
    return float((R @ (w[TIPS[f]] - o))[2] - (R @ (w[KNUCKLES[f]] - o))[2])


def keys_x(image, H_inv):
    p = np.c_[np.asarray(image)[:, :2], np.ones(len(image))] @ H_inv.T
    return p[:, 0] / p[:, 2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=1e9)
    a = ap.parse_args()
    idx = json.load(open(os.path.join(a.folder, "index.json"), encoding="utf-8"))
    kb = json.load(open(os.path.join(a.folder, "keyboard.json"), encoding="utf-8"))
    dec_path = os.path.join(a.folder, "fingers.decisions.json")
    decided = json.load(open(dec_path, encoding="utf-8"))["notes"] if os.path.exists(dec_path) else {}
    H_inv = np.linalg.inv(np.asarray(kb["H"]))
    out, requests = [], []
    for r in idx["onsets"]:
        if not r["track"]:
            for n in r["notes"]:
                out.append({"note": n["id"], "onset": r["id"], "candidates": [], "pick": None, "why": "no hand"})
            continue
        frames = [w for w in r["window"] if w.get("world")]
        at = min(frames, key=lambda w: abs(w["time"] - r["time"]))
        before = min(frames, key=lambda w: abs(w["time"] - (r["time"] - PRESS_S)))
        tx = keys_x(at["image"], H_inv)
        for n in r["notes"]:
            cands = []
            for f, i in TIPS.items():
                dx = float(tx[i] - n["x"])
                if abs(dx) <= REACH:
                    press = tip_height(before["world"], r["hand"], f) - tip_height(at["world"], r["hand"], f)
                    cands.append({"finger": f, "dx": round(dx, 3), "pressMm": round(press, 1),
                                  "score": round(max(-PRESS_CAP, min(PRESS_CAP, press)) - MISS_COST * abs(dx), 1)})
            cands.sort(key=lambda c: -c["score"])
            known = n.get("teacherFinger") or (decided.get(n["id"]) or {}).get("finger")
            pick = cands[0]["finger"] if cands else None
            out.append({"note": n["id"], "onset": r["id"], "time": r["time"], "hand": r["hand"], "pitch": n["pitch"],
                        "candidates": cands, "pick": pick, "known": known})
            if a.t0 <= r["time"] <= a.t1 and n["id"] not in decided:
                requests.append({"note": n["id"], "onset": r["id"], "time": r["time"], "hand": r["hand"],
                                 "pitch": n["pitch"], "keyX": n["x"], "track": r["track"],
                                 "frames": [round(r["time"] + dt, 3) for dt in REVIEW_AT],
                                 "candidates": [c["finger"] for c in cands] or list(TIPS), "autoPick": pick,
                                 "known": known})
    json.dump(out, open(os.path.join(a.folder, "candidates.json"), "w", encoding="utf-8"), indent=1)
    json.dump({"window": [a.t0, a.t1], "reviewAt": REVIEW_AT, "requests": requests},
              open(os.path.join(a.folder, "requests.json"), "w", encoding="utf-8"), indent=1)
    span = [c for c in out if a.t0 <= c.get("time", -1) <= a.t1]
    known = [c for c in span if c["known"]]
    print(f"notes {len(out)}, in span {len(span)}, no candidate {sum(1 for c in span if not c['candidates'])}, "
          f"requests {len(requests)}; known {len(known)}, auto agrees {sum(1 for c in known if c['pick'] == c['known'])}")
    for c in span:
        print(c["note"], c["time"], c["pitch"], "pick", c["pick"], "known", c["known"],
              [(k["finger"], k["dx"], k["pressMm"]) for k in c["candidates"]])


if __name__ == "__main__":
    main()
