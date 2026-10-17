"""Index a captured piano video for the pianist's example hands: keyboard calibration, onsets, hands.

Run with Python 3, numpy and Pillow, outside Blender; ffmpeg on PATH:
    python tools/hand-rig/video_hands.py <package> [--video input.mkv] [--out <dir>]
<package> is a capture handoff folder (notes.json, hands.raw.jsonl, roll-calibration.json); the
video and the output folder default to the package's parent (input.mkv, hand-poses/), all local.

The keyboard is calibrated from the video itself, not from the piano roll: the roll matches the keys
only at their back, and is up to half a key off at the front edge. A high percentile of frames
spread over the song gives a hand-free keyboard; white key boundaries are traced as lines, the white
and the black front edges as lines across; a homography maps the key plane (x in white keys from
C4's centre, depth in cm from the white front edge) to the image. keyboard.json keeps it.

An onset is the notes of one hand starting within ONSET_WINDOW. Its hand is picked by x, not by
MediaPipe's predicted side: of two hands the left one is the left hand's candidate, and a hand is
taken only if a fingertip lies within PICK_REACH white keys of the onset's keys. index.json keeps
every onset with its hand's landmarks from WINDOW[0] to WINDOW[1] around it, or hand: null.
"""
import argparse, json, os, subprocess, sys
import numpy as np

ONSET_WINDOW = 0.030                    # s: notes of one hand starting this close are one onset
WINDOW = (-0.150, 0.050)                # s: landmarks kept around an onset
SEARCH = 0.050                          # s: the onset frame may move this far to find its hand
PICK_REACH = 1.5                        # white keys: a hand's nearest tip must be this close to a key
TRACK_JUMP = 60                         # px: a window frame's hand without the anchor's trackId
                                        # must have its wrist this close to the anchor's
WHITE_L, BLACK_L = 15.0, 9.5            # cm, as the rig's keys (live_demo.py)
BLACK_FRONT = WHITE_L - BLACK_L         # cm: the black front edge behind the white one
PERCENTILE = 80                         # of the frames: the unoccluded, unlit key
CALIB_FRAMES = 31
TIPS = {1: 4, 2: 8, 3: 12, 4: 16, 5: 20}
WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]
C4_WHITE = 23                           # white keys from A0 to C4
A0, C8 = 21, 108
INTRO = ("right", 2.7, 18.5)            # the intro: the right hand alone, riff in the bass


def white_index(pitch):
    """White keys from A0 to this pitch's lower natural, and whether the pitch is black."""
    octave, pc = divmod(pitch - 12, 12)
    lower = max(p for p in WHITE_PCS if p <= pc)
    return octave * 7 + WHITE_PCS.index(lower) - 5, pc != lower


def key_x(pitch, black_offsets):
    """The key's centre in white keys from C4's centre."""
    w, black = white_index(pitch)
    x = w - C4_WHITE
    if black:
        x += black_offsets[(pitch - 1) % 12]
    return x


# ---- keyboard calibration -------------------------------------------------------------------

def grab_frames(video, times, width, height):
    frames = []
    for t in times:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1",
                              "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True, check=True).stdout
        frames.append(np.frombuffer(raw, np.uint8).reshape(height, width))
    return np.stack(frames)


def minima(row, lo, hi, flank=0.75, depth=0.05, reach=20):
    """Thin dark lines between two bright sides: white key boundaries along an image row.
    The row is divided by its running maximum first: the keys darken towards the frame's edges."""
    pad = np.pad(row, reach, mode="edge")
    row = row / np.maximum(np.lib.stride_tricks.sliding_window_view(pad, 2 * reach + 1).max(1), 1)
    out = []
    for x in range(max(lo, 6), min(hi, len(row) - 6)):
        v = row[x]
        if v == row[x - 4:x + 5].min() and min(row[x - 5], row[x + 5]) > max(flank, v + depth):
            out.append(x + parabola(row[x - 1], v, row[x + 1]))
    return out


def parabola(a, b, c):
    d = a - 2 * b + c
    return 0.0 if d <= 0 else 0.5 * (a - c) / d


def robust_line(xs, ys, tol=2.0, rounds=4):
    """y = p + q x by least squares, dropping points off the line by more than tol."""
    xs, ys = np.asarray(xs, float), np.asarray(ys, float)
    keep = np.ones(len(xs), bool)
    for _ in range(rounds):
        q, p = np.polyfit(xs[keep], ys[keep], 1)
        r = np.abs(ys - (p + q * xs))
        keep = r <= max(tol, 3 * np.median(r[keep]))
    return p, q, keep


def edge_rows(img):
    """Image rows of the white front edge and the black front edge, as lines v = p + q u."""
    h, w = img.shape
    us, vf = [], []
    for u in range(20, w - 20, 3):
        col = img[:, u].astype(float)
        for v in range(int(h * 0.62), int(h * 0.80)):
            if col[v - 3:v].min() > 120 and col[v + 2:v + 5].max() < 60:
                us.append(u), vf.append(v + 0.5)
                break
    front = robust_line(us, vf)
    v_front = np.median(vf)
    ub, vb = [], []
    row = img[int(v_front) - 100].astype(float)       # inside the black keys
    dark = row < 70
    u = 0
    while u < w:
        if dark[u]:
            e = u
            while e < w and dark[e]:
                e += 1
            if 12 <= e - u <= 40:
                c = (u + e) // 2
                col = img[:, c].astype(float)
                for v in range(int(v_front) - 100, int(v_front)):
                    if col[v] > 120:
                        ub.append(c), vb.append(v - 0.5)
                        break
            u = e
        u += 1
    black = robust_line(ub, vb)
    return front, black, (len(us), int(front[2].sum())), (len(ub), int(black[2].sum()))


def trace_boundaries(img, v_lo, v_hi, step=4, link=3.0):
    """White key boundaries found row by row between v_lo and v_hi, linked into lines u = p + q v."""
    tracks = []
    for v in range(int(v_lo), int(v_hi), step):
        row = img[v - 1:v + 2].mean(0)
        for u in minima(row, 0, img.shape[1]):
            best = None
            for t in tracks:
                if t[-1][0] < v and abs(t[-1][1] - u) < link and (best is None or abs(t[-1][1] - u) < abs(best[-1][1] - u)):
                    best = t
            if best is not None and best[-1][0] != v:
                best.append((v, u))
            else:
                tracks.append([(v, u)])
    lines = []
    for t in tracks:
        if len(t) < 5:
            continue
        vs, us = zip(*t)
        p, q, keep = robust_line(vs, us, tol=1.0)
        lines.append({"p": p, "q": q, "v0": min(vs), "v1": max(vs), "n": int(keep.sum())})
    return lines


def meet(line_u, line_v):
    """Where boundary u = p + q v meets edge v = a + b u."""
    p, q = line_u
    a, b = line_v
    v = (a + b * p) / (1 - b * q)
    return p + q * v, v


def homography(src, dst):
    """3x3 H with dst ~ H src, by normalised DLT."""
    def norm(pts):
        pts = np.asarray(pts, float)
        c = pts.mean(0)
        s = np.sqrt(2) / np.mean(np.linalg.norm(pts - c, axis=1))
        return np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])
    T1, T2 = norm(src), norm(dst)
    a = []
    for (x, y), (u, v) in zip(src, dst):
        x, y, _ = T1 @ (x, y, 1)
        u, v, _ = T2 @ (u, v, 1)
        a.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        a.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    H = np.linalg.svd(np.asarray(a))[2][-1].reshape(3, 3)
    H = np.linalg.inv(T2) @ H @ T1
    return H / H[2, 2]


def apply(H, pts):
    pts = np.asarray(pts, float)
    q = np.c_[pts, np.ones(len(pts))] @ H.T
    return q[:, :2] / q[:, 2:]


def calibrate(video, roll, duration, width, height):
    times = np.linspace(0.08, 0.92, CALIB_FRAMES) * duration
    img = np.percentile(grab_frames(video, times, width, height), PERCENTILE, axis=0)
    (fa, fb, _), (ba, bb, _), front_n, black_n = edge_rows(img)
    v_front = fa + fb * width / 2
    v_black = ba + bb * width / 2
    # E|F and B|C boundaries run the whole key: traced between the black keys and in front of them
    long_lines = [l for l in trace_boundaries(img, v_front - 210, v_black - 8)
                  if l["v1"] - l["v0"] > 60]
    # every boundary shows in front of the black keys
    short_lines = trace_boundaries(img, v_black + 8, v_front - 4)
    # name the long ones from the roll near the keys' back, where the roll is right
    roll_x = lambda pitch: roll["whiteAnchor"]["x"] + (white_index(pitch)[0] - white_index(roll["whiteAnchor"]["pitch"])[0]) * roll["whiteKeyPitchPixels"]
    v_back = v_front - 210
    named = {}
    for l in long_lines:
        u = l["p"] + l["q"] * v_back
        n = round((u - roll_x(A0)) / roll["whiteKeyPitchPixels"] + 0.5)      # boundary n: whites n-1 | n
        pc = WHITE_PCS[(n + 5) % 7]                                          # the white right of it
        if pc in (0, 5):                                                     # C or F: B|C, E|F
            if n not in named or l["n"] > named[n]["n"]:
                named[n] = l
    known = sorted(named)
    fronts = {n: meet((named[n]["p"], named[n]["q"]), (fa, fb))[0] for n in known}
    # the short ones are named between their long neighbours
    for l in short_lines:
        u, _ = meet((l["p"], l["q"]), (fa, fb))
        lo = max((n for n in known if fronts[n] <= u + 2), default=None)
        hi = min((n for n in known if fronts[n] >= u - 2), default=None)
        if lo is None or hi is None:
            continue
        n = lo if hi == lo else lo + round((u - fronts[lo]) / (fronts[hi] - fronts[lo]) * (hi - lo))
        if n not in named or (n not in known and l["n"] > named[n]["n"]):
            named[n] = l
    src, dst = [], []
    for n, l in named.items():
        x = n - C4_WHITE - 0.5
        src.append((x, 0.0)), dst.append(meet((l["p"], l["q"]), (fa, fb)))
        if n in known:
            src.append((x, BLACK_FRONT)), dst.append(meet((l["p"], l["q"]), (ba, bb)))
    H = homography(src, dst)
    err = np.linalg.norm(apply(H, src) - np.asarray(dst), axis=1)
    # the long lines must stay on their boundary all along: check them halfway to the back
    drift = []
    Hi = np.linalg.inv(H)
    for n in known:
        l = named[n]
        v = l["v0"] + 10
        drift.append(apply(Hi, [(l["p"] + l["q"] * v, v)])[0][0] - (n - C4_WHITE - 0.5))
    roll_back = []
    for pitch in (36, 48, 60, 72, 84):
        u_roll = roll_x(pitch)
        u_key = apply(H, [(key_x(pitch, {}), WHITE_L)])[0][0]
        roll_back.append(round(u_key - u_roll, 1))
    px_cm_x = float(np.linalg.norm(apply(H, [(0, 0)]) - apply(H, [(1 / 2.35, 0)])))
    px_cm_d = float(np.linalg.norm(apply(H, [(0, 0)]) - apply(H, [(0, 1)])))
    return img, {
        "H": H.tolist(),
        "plane": "x: white keys from C4's centre (+ treble); depth: cm from the white front edge (+ into the keys)",
        "whiteFront": {"p": fa, "q": fb, "vMid": v_front, "points": front_n},
        "blackFront": {"p": ba, "q": bb, "vMid": v_black, "points": black_n, "depthCm": BLACK_FRONT},
        "boundaries": {"total": len(named), "long": known},
        "residualPx": {"max": float(err.max()), "median": float(np.median(err))},
        "longLineDriftKeys": {"max": float(np.max(np.abs(drift))), "median": float(np.median(np.abs(drift)))},
        "rollVsKeysAtBackPx": dict(zip(("C2", "C3", "C4", "C5", "C6"), roll_back)),
        "pxPerCmAtC4": {"across": px_cm_x, "depth": px_cm_d},
        "frames": {"count": CALIB_FRAMES, "percentile": PERCENTILE, "times": [round(t, 2) for t in times]},
    }


# ---- onsets and hands -----------------------------------------------------------------------

def load_frames(path):
    frames = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            frames.append({"i": d["frameIndex"], "t": d["time"], "w": d["width"], "h": d["height"], "hands": d["hands"]})
    return frames


def onsets_of(notes):
    out = []
    for hand in ("left", "right"):
        group = None
        for n in sorted((n for n in notes if n["hand"] == hand), key=lambda n: n["onset"]):
            if group and n["onset"] - group["time"] <= ONSET_WINDOW:
                group["notes"].append(n)
            else:
                group = {"hand": hand, "time": n["onset"], "notes": [n]}
                out.append(group)
    out.sort(key=lambda o: o["time"])
    for k, o in enumerate(out):
        o["id"] = f"onset-{k + 1:04d}"
    return out


class Plane:
    def __init__(self, H, width, height):
        self.Hi = np.linalg.inv(np.asarray(H))
        self.w, self.h = width, height

    def px(self, lm):
        return np.array([[p["x"] * self.w, p["y"] * self.h] for p in lm])

    def keys(self, lm):
        """The landmarks on the key plane: x in white keys from C4, depth in cm."""
        return apply(self.Hi, self.px(lm))


def nearest_tips(plane, hand, xs):
    """Per key x: the nearest fingertip and its signed distance in white keys."""
    k = plane.keys(hand["landmarks"])
    out = []
    for x in xs:
        f, d = min(((f, k[i][0] - x) for f, i in TIPS.items()), key=lambda fd: abs(fd[1]))
        out.append((f, float(d)))
    return out


def pick(plane, frame, onset, xs, others):
    """The hand of this onset in a frame, or None, and how it was chosen."""
    hands = sorted(frame["hands"], key=lambda h: h["landmarks"][0]["x"])
    if not hands:
        return None, "none"
    def reach(h):
        return max(abs(d) for _, d in nearest_tips(plane, h, xs))
    if len(hands) == 2:
        first = hands[0] if onset["hand"] == "left" else hands[1]
        second = hands[1] if first is hands[0] else hands[0]
        if reach(first) <= PICK_REACH:
            return first, "by-x"
        if reach(second) <= PICK_REACH:
            return second, "swapped"
        return None, "far"
    h = hands[0]
    if reach(h) > PICK_REACH:
        return None, "far"
    # the one hand may belong to the other hand's onset at the same moment
    for o in others:
        ox = [n["x"] for n in o["notes"]]
        if max(abs(d) for _, d in nearest_tips(plane, h, ox)) < reach(h):
            return None, "other-hand"
    return h, "single"


def lm_list(lm, scale=1.0, nd=4):
    return [[round(p["x"] * scale, nd), round(p["y"] * scale, nd), round(p["z"] * scale, nd)] for p in lm]


def index_onsets(frames, notes, plane, black_offsets):
    times = np.array([f["t"] for f in frames])
    fps = 1 / np.median(np.diff(times))
    for n in notes:
        n["x"] = key_x(n["pitch"], black_offsets)
    onsets = onsets_of(notes)
    for o in onsets:
        xs = [n["x"] for n in o["notes"]]
        others = [p for p in onsets if p["hand"] != o["hand"] and abs(p["time"] - o["time"]) <= 0.1]
        k0 = int(np.argmin(np.abs(times - o["time"])))
        found = None
        for dk in sorted(range(-round(SEARCH * fps), round(SEARCH * fps) + 1), key=abs):
            k = k0 + dk
            if 0 <= k < len(frames):
                h, how = pick(plane, frames[k], o, xs, others)
                if h is not None:
                    found = (k, h, how)
                    break
                if dk == 0:
                    miss = how
        record = {"id": o["id"], "hand": o["hand"], "time": round(o["time"], 4),
                  "notes": [{"id": n["id"], "pitch": n["pitch"], "x": round(n["x"], 4), "onset": round(n["onset"], 4),
                             "offset": round(n.get("displayedOffset") or n["estimatedOffset"], 4),
                             "teacherFinger": n.get("teacherFinger"), "writtenFinger": n.get("writtenFinger")}
                            for n in o["notes"]]}
        if found is None:
            record.update(track=None, why=miss)
            o["record"] = record
            continue
        k, h, how = found
        for n, (f, d) in zip(record["notes"], nearest_tips(plane, h, xs)):
            n["nearestTip"] = {"finger": f, "dx": round(d, 3)}
        # no tip over a key: the landmarks are off the hand, or the key is pressed out of frame
        record["tipOffKey"] = any(abs(n["nearestTip"]["dx"]) > 0.5 for n in record["notes"])
        anchor_wrist = plane.px(h["landmarks"][:1])[0]
        window = []
        for j in range(k + round(WINDOW[0] * fps), k + round(WINDOW[1] * fps) + 1):
            if not 0 <= j < len(frames):
                continue
            fr = frames[j]
            same = [g for g in fr["hands"] if g["trackId"] == h["trackId"]]
            if not same:
                near = [(np.linalg.norm(plane.px(g["landmarks"][:1])[0] - anchor_wrist), g) for g in fr["hands"]]
                same = [g for dist, g in sorted(near, key=lambda dg: dg[0]) if dist <= TRACK_JUMP][:1]
            if not same:
                window.append({"frame": fr["i"], "time": fr["t"], "hand": None})
                continue
            g = same[0]
            window.append({"frame": fr["i"], "time": fr["t"], "trackId": g["trackId"],
                           "predictedSide": g.get("predictedSide"),
                           "image": [[round(x * plane.w, 1), round(y * plane.h, 1), z] for x, y, z in lm_list(g["landmarks"], nd=5)],
                           "world": lm_list(g["worldLandmarks"], 1000, 2)})     # mm
        record.update(track=h["trackId"], how=how, frame=frames[k]["i"], frameShift=round(frames[k]["t"] - o["time"], 4),
                      window=window)
        o["record"] = record
    return [o["record"] for o in onsets]


def summary(records):
    def stats(rs):
        found = [r for r in rs if r["track"]]
        dx = [abs(n["nearestTip"]["dx"]) for r in found for n in r["notes"]]
        return {"onsets": len(rs), "withHand": len(found), "noHand": len(rs) - len(found),
                "noHandWhy": {w: sum(1 for r in rs if not r["track"] and r["why"] == w) for w in {r.get("why") for r in rs if not r["track"]}},
                "picked": {w: sum(1 for r in found if r["how"] == w) for w in {r["how"] for r in found}},
                "notes": len(dx), "tipDxMedian": round(float(np.median(dx)), 3) if dx else None,
                "tipDxP90": round(float(np.percentile(dx, 90)), 3) if dx else None,
                "tipOverHalfKey": sum(1 for d in dx if d > 0.5)}
    hand, t0, t1 = INTRO
    intro = [r for r in records if r["hand"] == hand and t0 <= r["time"] <= t1]
    return {"all": stats(records), "left": stats([r for r in records if r["hand"] == "left"]),
            "right": stats([r for r in records if r["hand"] == "right"]), "intro": stats(intro),
            "introOverHalfKey": [{"id": r["id"], "time": r["time"], "pitches": [n["pitch"] for n in r["notes"]],
                                  "dx": [n["nearestTip"]["dx"] for n in r["notes"]]}
                                 for r in intro if not r["track"] or any(abs(n["nearestTip"]["dx"]) > 0.5 for n in r["notes"])]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("package")
    ap.add_argument("--video")
    ap.add_argument("--out")
    ap.add_argument("--recalibrate", action="store_true")
    a = ap.parse_args()
    pkg = os.path.abspath(a.package)
    video = a.video or os.path.join(os.path.dirname(pkg), "input.mkv")
    out = a.out or os.path.join(os.path.dirname(pkg), "hand-poses")
    os.makedirs(out, exist_ok=True)
    notes = json.load(open(os.path.join(pkg, "notes.json"), encoding="utf-8"))["notes"]
    roll = json.load(open(os.path.join(pkg, "roll-calibration.json"), encoding="utf-8"))
    frames = load_frames(os.path.join(pkg, "hands.raw.jsonl"))
    width, height = frames[0]["w"], frames[0]["h"]
    kb_path = os.path.join(out, "keyboard.json")
    if a.recalibrate or not os.path.exists(kb_path):
        img, kb = calibrate(video, roll, frames[-1]["t"], width, height)
        from PIL import Image
        Image.fromarray(img.astype(np.uint8)).save(os.path.join(out, "keyboard.png"))
        json.dump(kb, open(kb_path, "w", encoding="utf-8"), indent=1)
    kb = json.load(open(kb_path, encoding="utf-8"))
    print("keyboard:", json.dumps({k: kb[k] for k in ("boundaries", "residualPx", "longLineDriftKeys",
                                                      "rollVsKeysAtBackPx", "pxPerCmAtC4")}))
    pitch_px = roll["whiteKeyPitchPixels"]
    names = {1: "C#", 3: "D#", 6: "F#", 8: "G#", 10: "A#"}
    black_offsets = {pc - 1: roll["blackKeyOffsetsFromLowerNatural"][nm] / pitch_px for pc, nm in names.items()}
    plane = Plane(kb["H"], width, height)
    records = index_onsets(frames, notes, plane, black_offsets)
    s = summary(records)
    json.dump({"package": pkg, "keyboard": "keyboard.json", "window": WINDOW, "onsetWindow": ONSET_WINDOW,
               "summary": s, "onsets": records}, open(os.path.join(out, "index.json"), "w", encoding="utf-8"))
    json.dump(s, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
