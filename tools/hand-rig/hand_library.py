"""The pianist's hand pose library: example placements from the video, merged per shape, and the
lookup that finds the nearest example for given keys and fingers.

Build (plain Python 3, after hand_features.py), then check:
    python tools/hand-rig/hand_library.py build <hand-poses dir> --song seven-nation-army
    python tools/hand-rig/hand_library.py check <hand-poses dir> --song seven-nation-army
build reads features.json (and shapes.json from hand_shape.py, if there) and writes
poses/library/<song>.json next to this script (committed: numbers only, no frames, sound or song
times). Pure Python, so Blender can import it.

A shape is the hand, the pressed keys with their fingers, and the thumb's state. Its anchor is the
lowest pressed key; placement is kept relative to the anchor key's centre (x in white keys, depth in
cm, yaw in degrees), the median of the shape's repeats. Repeats whose landmarks were off the keys
(tipOffKey) give the placement only when the shape has no clean repeat; the entry then says so.
Onsets with a note still without a finger, or with the thumb's state unknown, are left out.

The shape is the median over the repeats whose fitted skeleton met the frame (shapes.json "ok"):
per finger 2-5 its spread (deg) and its curl relative to the hand's mean curl, the split of a curl
between MCP, PIP and DIP being hand_mech.BEND_SPLIT; the thumb's angles from the repeats where it was
fitted (not tucked). No repeat fits: shape null, and build lists the entry.

nearest() wants the same hand and finger set (else None: the old solver), and ranks by the same
intervals, the same black/white pattern, the thumb's state, register distance and repeats.
"""
import argparse, json, os
from statistics import median

HERE = os.path.dirname(os.path.abspath(__file__))
BLACK_PCS = {1, 3, 6, 8, 10}
PLACEMENT = ("knuckleDx", "knuckleDepthCm", "wristDx", "wristDepthCm", "yawDeg")


def library_path(song):
    return os.path.join(HERE, "poses", "library", song + ".json")


def shape_of(hand, pressed, thumb):
    """pressed: [(finger, pitch)]. The shape's key, its anchor pitch and its relative pressed list."""
    pressed = sorted(pressed, key=lambda fp: (fp[1], fp[0]))
    anchor = pressed[0][1]
    rel = [{"finger": f, "semitones": p - anchor, "black": p % 12 in BLACK_PCS} for f, p in pressed]
    key = f"{hand[0].upper()}:" + ",".join(f"{f}@{p}" for f, p in pressed) + f":{thumb}"
    return key, anchor, rel


def merged_shape(fits):
    """Median shape over fitted repeats (shapes.json records), or None."""
    fits = [s for s in fits if s["ok"]]
    if not fits:
        return None
    fingers = {f: {k: round(median(s["angles"][f][k] for s in fits), 3) for k in ("abd", "rel")} for f in "2345"}
    thumbs = [s["angles"]["1"] for s in fits if s["angles"]["1"]]
    thumb = {k: round(median(t[k] for t in thumbs), 1) for k in thumbs[0]} if thumbs else None
    return {"fingers": fingers, "thumb": thumb, "from": len(fits)}


def build(features, song, shapes=None):
    groups = {}
    skipped = {"finger": 0, "thumb": 0}
    for o in features["onsets"]:
        if any(n["finger"] is None for n in o["notes"]):
            skipped["finger"] += 1
            continue
        if o["thumb"] is None:
            skipped["thumb"] += 1
            continue
        anchor_x = min(o["notes"], key=lambda n: n["pitch"])["x"]
        key, anchor, rel = shape_of(o["hand"], [(n["finger"], n["pitch"]) for n in o["notes"]], o["thumb"])
        g = groups.setdefault(key, {"id": key, "hand": o["hand"], "anchorPitch": anchor, "pressed": rel,
                                    "thumb": o["thumb"], "clean": [], "off": [], "fits": []})
        if shapes and o["id"] in shapes:
            g["fits"].append(shapes[o["id"]])
        place = {"knuckleDx": o["knuckle"]["x"] - anchor_x, "knuckleDepthCm": o["knuckle"]["depthCm"],
                 "wristDx": o["wrist"]["x"] - anchor_x, "wristDepthCm": o["wrist"]["depthCm"], "yawDeg": o["yawDeg"]}
        g["off" if o["tipOffKey"] else "clean"].append((o["id"], place))
    entries = []
    for g in groups.values():
        used = g["clean"] or g["off"]
        entries.append({"id": g["id"], "hand": g["hand"], "anchorPitch": g["anchorPitch"], "pressed": g["pressed"],
                        "thumb": g["thumb"],
                        "placement": {k: round(median(p[k] for _, p in used), 3) for k in PLACEMENT},
                        "count": len(g["clean"]) + len(g["off"]), "placementFrom": len(used),
                        "offKeyOnly": not g["clean"], "shape": merged_shape(g["fits"]),
                        "source": {"song": song, "onsets": sorted(i for i, _ in g["clean"] + g["off"])}})
    entries.sort(key=lambda e: (e["hand"], e["anchorPitch"], e["id"]))
    return {"song": song, "units": {"x": "white keys from the anchor key's centre", "depth": "cm from the white front edge",
                                    "yaw": "deg on the key plane, + = fingers to the treble"},
            "entries": entries}, skipped


def load(song):
    return json.load(open(library_path(song), encoding="utf-8"))


def nearest(library, hand, pressed, thumb=None):
    """The best entry for hand + [(finger, pitch)], as (entry, anchor pitch, how) or None.
    how: 'own' (same keys, fingers and thumb), else 'nearest'."""
    key, anchor, rel = shape_of(hand, pressed, thumb)
    fingers = sorted(r["finger"] for r in rel)
    pool = [e for e in library["entries"]
            if e["hand"] == hand and sorted(r["finger"] for r in e["pressed"]) == fingers]
    if not pool:
        return None
    def rank(e):
        same_iv = [(r["finger"], r["semitones"]) for r in e["pressed"]] == [(r["finger"], r["semitones"]) for r in rel]
        same_bw = [r["black"] for r in e["pressed"]] == [r["black"] for r in rel]
        return (not same_iv, not same_bw, thumb is not None and e["thumb"] != thumb,
                abs(e["anchorPitch"] - anchor), -e["count"])
    best = min(pool, key=rank)
    return best, anchor, "own" if best["id"] == key else "nearest"


def place(entry, anchor_x):
    """The entry's placement on a keyboard where the target anchor key's centre is at anchor_x."""
    p = entry["placement"]
    return {"knuckleX": anchor_x + p["knuckleDx"], "knuckleDepthCm": p["knuckleDepthCm"],
            "wristX": anchor_x + p["wristDx"], "wristDepthCm": p["wristDepthCm"], "yawDeg": p["yawDeg"]}


def check(features, library):
    own_fail, octave_fail, nearer, n = [], [], [], 0
    for o in features["onsets"]:
        if any(nt["finger"] is None for nt in o["notes"]) or o["thumb"] is None:
            continue
        n += 1
        pressed = [(nt["finger"], nt["pitch"]) for nt in o["notes"]]
        hit = nearest(library, o["hand"], pressed, o["thumb"])
        if not hit or hit[2] != "own":
            own_fail.append(o["id"])
    for e in library["entries"]:
        pressed = [(r["finger"], e["anchorPitch"] + r["semitones"] + 12) for r in e["pressed"]]
        hit = nearest(library, e["hand"], pressed, e["thumb"])
        x = 0.0                                             # any anchor x: an octave is 7 white keys
        if hit and hit[0]["id"] != e["id"]:
            # another entry of the same shape may sit nearer the shifted keys: then it is the right answer
            other = hit[0]
            if ([(r["finger"], r["semitones"], r["black"]) for r in other["pressed"]]
                    == [(r["finger"], r["semitones"], r["black"]) for r in e["pressed"]]
                    and other["thumb"] == e["thumb"] and abs(other["anchorPitch"] - hit[1]) < 12):
                nearer.append((e["id"], other["id"]))
                continue
        ok = (hit and hit[0]["id"] == e["id"] and hit[1] == e["anchorPitch"] + 12 and hit[2] == "nearest"
              and abs(place(hit[0], x + 7)["knuckleX"] - place(e, x)["knuckleX"] - 7) < 1e-9)
        if not ok:
            octave_fail.append(e["id"])
    return n, own_fail, octave_fail, nearer


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("command", choices=("build", "check"))
    ap.add_argument("folder", help="the hand-poses folder with features.json")
    ap.add_argument("--song", required=True)
    a = ap.parse_args()
    features = json.load(open(os.path.join(a.folder, "features.json"), encoding="utf-8"))
    if a.command == "build":
        shapes_path = os.path.join(a.folder, "shapes.json")
        shapes = ({s["id"]: s for s in json.load(open(shapes_path, encoding="utf-8"))["onsets"]}
                  if os.path.exists(shapes_path) else None)
        lib, skipped = build(features, a.song, shapes)
        os.makedirs(os.path.dirname(library_path(a.song)), exist_ok=True)
        with open(library_path(a.song), "w", encoding="utf-8", newline="\n") as f:
            json.dump(lib, f, indent=1)
            f.write("\n")
        print(f"entries {len(lib['entries'])} from {sum(e['count'] for e in lib['entries'])} onsets; "
              f"left out: no finger {skipped['finger']}, thumb unknown {skipped['thumb']}; offKeyOnly {[e['id'] for e in lib['entries'] if e['offKeyOnly']]}")
        if shapes is not None:
            print(f"shapes: {sum(1 for e in lib['entries'] if e['shape'])}/{len(lib['entries'])} entries; "
                  f"without a shape {[e['id'] for e in lib['entries'] if not e['shape']]}")
        for e in lib["entries"]:
            print(e["id"], "x", e["count"], "from", e["placementFrom"], e["placement"])
    else:
        n, own_fail, octave_fail, nearer = check(features, load(a.song))
        total = len(load(a.song)["entries"])
        print(f"own: {n - len(own_fail)}/{n} onsets find their entry; failed {own_fail}")
        print(f"octave up: {total - len(octave_fail) - len(nearer)}/{total} entries come back shifted; "
              f"a nearer entry of the same shape won {nearer}; failed {octave_fail}")


if __name__ == "__main__":
    main()
