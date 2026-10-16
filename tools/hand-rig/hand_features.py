"""Hand placement per onset from the video index: where the hand stands on the keys, which finger
plays each note and what the thumb does.

Run with Python 3 and numpy, after video_hands.py and the finger review:
    python tools/hand-rig/hand_features.py <hand-poses dir> [--from 2.7] [--to 18.5] [--yaw-table rows.json]
Reads index.json, keyboard.json, fingers.decisions.json and sheets/sheets.json (the last two if
there); writes features.json next to them.

Only the frame is used, through the key plane's homography: the landmarks of the frames within
NEAR_S of the onset (median) are mapped onto the keys as x in white keys from C4's centre
(+ treble) and depth in cm from the white front edge (+ into the keys). The knuckles are the mean of
the index..pinky MCPs; yaw is wrist -> middle MCP on the plane in cm (0 = fingers straight into the
keys, + = fingers to the treble). The knuckles and the wrist sit over the keys, so their projection
lands deeper than they are; the shift is about the same for every onset.

No joint angles, no pitch or roll: MediaPipe's world shape is too far off, and the rig's solver
builds the fingers. The thumb's state comes from the frame review, never from the landmarks, which
invent a thumb under the palm: pressing (it plays a note of the onset), tucked or visible.
"""
import argparse, json, math, os
import numpy as np
from video_hands import TIPS, apply

WHITE_CM = 2.35                         # the rig's white key width: the plane's x unit
NEAR_S = 0.018                          # s: landmarks of the frames this close to the onset
KNUCKLES = (5, 9, 13, 17)
OFF_KEY = 0.5                           # white keys: a played tip farther than this from its key


def near_frames(rec):
    frames = rec["window"]
    if not frames:
        return []
    near = [w for w in frames if abs(w["time"] - rec["time"]) <= NEAR_S]
    return near or [min(frames, key=lambda w: abs(w["time"] - rec["time"]))]


def thumb_state(rec, fingers, decided, sheets):
    if 1 in fingers:
        return "pressing", "finger"
    for n in rec["notes"]:
        state = (decided.get(n["id"]) or {}).get("thumb")
        if state:
            return state, "decision"
    for n in rec["notes"]:
        if sheets.get(n["id"]):
            return sheets[n["id"]], "sheet"
    return None, None


def placement(rec, Hi, decided, sheets):
    frames = near_frames(rec)
    if not frames:
        return None
    image = np.median([[p[:2] for p in w["image"]] for w in frames], axis=0)
    kb = apply(Hi, image)                                       # 21 x (white keys, cm)
    cm = kb * (WHITE_CM, 1.0)
    knuckle = kb[list(KNUCKLES)].mean(0)
    fwd = cm[9] - cm[0]
    notes = []
    for n in rec["notes"]:
        d = decided.get(n["id"]) or {}
        f = d.get("finger")
        tip = kb[TIPS[f]] if f else None
        notes.append({"id": n["id"], "pitch": n["pitch"], "x": n["x"], "finger": f, "origin": d.get("origin"),
                      "tipDx": None if tip is None else round(float(tip[0] - n["x"]), 3),
                      "tipDepthCm": None if tip is None else round(float(tip[1]), 2)})
    thumb, thumb_from = thumb_state(rec, [n["finger"] for n in notes], decided, sheets)
    return {"id": rec["id"], "hand": rec["hand"], "time": rec["time"], "frames": [w["frame"] for w in frames],
            "notes": notes,
            "knuckle": {"x": round(float(knuckle[0]), 3), "depthCm": round(float(knuckle[1]), 2)},
            "wrist": {"x": round(float(kb[0][0]), 3), "depthCm": round(float(kb[0][1]), 2)},
            "yawDeg": round(math.degrees(math.atan2(fwd[0], fwd[1])), 1),
            "thumb": thumb, "thumbFrom": thumb_from,
            "tipOffKey": rec["tipOffKey"] or any(n["tipDx"] is not None and abs(n["tipDx"]) > OFF_KEY for n in notes)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=1e9)
    ap.add_argument("--yaw-table", help="the earlier image-plane yaw table (rows.json), to compare")
    a = ap.parse_args()
    path = lambda name: os.path.join(a.folder, name)
    load = lambda name: json.load(open(path(name), encoding="utf-8"))
    idx, kb = load("index.json"), load("keyboard.json")
    decided = load("fingers.decisions.json")["notes"] if os.path.exists(path("fingers.decisions.json")) else {}
    sheets = {s["note"]: s["thumb"] for s in load("sheets/sheets.json")} if os.path.exists(path("sheets/sheets.json")) else {}
    Hi = np.linalg.inv(np.asarray(kb["H"]))
    span = [r for r in idx["onsets"] if a.t0 <= r["time"] <= a.t1]
    out = [p for p in (placement(r, Hi, decided, sheets) for r in span if r["track"]) if p]
    json.dump({"index": "index.json", "keyboard": "keyboard.json", "nearS": NEAR_S, "onsets": out},
              open(path("features.json"), "w", encoding="utf-8"), indent=1)

    notes = [n for o in out for n in o["notes"]]
    played = [n for n in notes if n["finger"]]
    print(f"onsets {len(span)}, with a hand {len(out)}; notes {len(notes)}, with a finger {len(played)}")
    print("thumb:", {s: sum(1 for o in out if str(o["thumb"]) == s) for s in sorted({str(o['thumb']) for o in out})},
          "from", {s: sum(1 for o in out if str(o["thumbFrom"]) == s) for s in sorted({str(o['thumbFrom']) for o in out})})
    if played:
        dx = np.abs([n["tipDx"] for n in played])
        print(f"played tips: |dx| median {np.median(dx):.3f} max {dx.max():.3f} keys; "
              f"depth median {np.median([n['tipDepthCm'] for n in played]):.1f} cm")
    print("tipOffKey:", [o["id"] for o in out if o["tipOffKey"]])
    if a.yaw_table:
        old = {r["id"]: r["yaw_0_9"] for r in json.load(open(a.yaw_table, encoding="utf-8"))}
        err = [o["yawDeg"] - old[o["notes"][0]["id"]] for o in out if o["notes"][0]["id"] in old]
        print(f"yaw vs the image-plane table ({len(err)}): median |err| {np.median(np.abs(err)):.1f} deg, "
              f"median err {np.median(err):+.1f}, max |err| {np.max(np.abs(err)):.1f}")
    for o in out:
        print(o["id"], o["hand"][0], f"{o['time']:.2f}", [(n["pitch"], n["finger"], n["tipDx"]) for n in o["notes"]],
              "knuckle", o["knuckle"]["x"], o["knuckle"]["depthCm"], "yaw", o["yawDeg"], "thumb", o["thumb"],
              "OFF" if o["tipOffKey"] else "")


if __name__ == "__main__":
    main()
