"""Finger shape from the top video: the rig's joint angles fitted to the frame's landmarks inside the
joint walls, the played tips held on their keys.

Run with Python 3, numpy and Pillow, outside Blender; ffmpeg on PATH for --sheet:
    python tools/hand-rig/hand_shape.py <hand-poses dir> --rest <mech-report.json> [--from 2.7] [--to 18.5]
        [--sheet] [--video <input.mkv>]
Reads index.json, keyboard.json and features.json (the finger of each note, the thumb's state); writes
shapes.json next to them and, with --sheet, sheets/shape/<onset>.png overlays and sheets/shape-sheet.png.
<mech-report.json> comes from mech_sweep.py: the rig's rest hand in the hand frame.

Model: hand_mech.py's mechanism. Fingers 2-5 bend MCP, PIP and DIP about one hinge, in the vertical
plane of the finger turned by the spread at MCP. A top view cannot tell how a bend is shared between
the three (left free, the fit hooks tips at the DIP wall or bends them back under a tilted palm), so
the share comes from the side video (BEND_SPLIT) and the top view fits one curl per finger: MCP, PIP
and DIP are the split times the curl, the curl bounded so that no joint passes its wall. The thumb leaves its CMC cmc_radial off the index in
the palm's plane and cmc_palmar below it, and bends at MCP and IP towards the fingers in the plane
through it parallel to the palm (the thumb lying on its side). The root puts the hand on the keys:
the wrist's place, yaw, pitch and roll, the roll inside its wall ROLL. Every variable is bounded and
a projected Levenberg-Marquardt step never leaves the bounds: walls, not penalties.

Camera: the key plane's homography is no camera (its two focal-length constraints disagree), so the
frame is a weak perspective around the hand. The plane's Jacobian at the knuckles maps a step along
and into the keys; the image of a step up completes it to a scaled orthographic camera. That has two
solutions, mirror images in depth; the homography's perspective row picks one: the keys recede from
the camera, so a point above them shows where the plane is farther away. (Pixels cannot tell the two
apart; the other one bends the fingers into a claw under a palm tilted up.) A pressing tip lies on its key (TIP_ABOVE of the finger's radius over the white top, BLACK_TOP
more on a black key): that pins the depth the frame cannot see. No other joint goes below the white
top by less than TIP_ABOVE of its finger's radius: a free finger cannot sink into the keys, which the
frame alone allows.

Scale: the teacher's hand is not the rig's. One scale per video, the median of a first pass with the
scale free, multiplies the rig's lengths inside the fit only; angles carry over unchanged.

A thumb tucked under the palm (the frame review's state) is not fitted: MediaPipe draws it where it is
not. Its points are not used and its angles stay out of the record.
"""
import argparse, io, json, math, os, subprocess
import numpy as np
from hand_features import near_frames
from hand_mech import ABD_MAX, BEND_SPLIT, LIM, R_FINGER, THUMB_PALMAR_MAX, THUMB_RADIAL_MAX
from video_hands import TIPS, apply

WHITE_MM = 23.5                       # the plane's x unit, mm
ROLL = (-180.0, 20.0)                 # deg off palm-down, + = thumb down (the spec's roll wall)
PITCH = (-45.0, 60.0)                 # deg, + = fingers down
YAW = (-75.0, 75.0)                   # deg, + = fingers to the treble (mirrored for a left hand)
THUMB_PALMAR_MIN = -15.0              # deg: the thumb above the palm's plane (MED)
THUMB_RADIAL_MIN = -10.0              # deg: the thumb across the index towards the palm (MED)
SCALE = (0.7, 1.4)                    # the teacher's hand over the rig's, first pass
TIP_ABOVE = 0.8                       # of the finger's radius: the tip's axis over the key top (MED)
BLACK_TOP = 12.0                      # mm: a black key's top over the white one (MED)
CONTACT_PX = 2.0                      # residual px per mm of a pressing tip off its key's top
SHAPE_MAX_PX = 6.0                    # median joint error over this: the onset gets no shape
BLACK_PCS = {1, 3, 6, 8, 10}
CHAIN = {1: (1, 2, 3, 4), 2: (5, 6, 7, 8), 3: (9, 10, 11, 12), 4: (13, 14, 15, 16), 5: (17, 18, 19, 20)}
FINGER_KEYS = ("mcp", "pip", "dip", "abd")       # recorded; the first three are BEND_SPLIT * curl
FINGER_VARS = ("curl", "abd")
THUMB_KEYS = ("cmc_radial", "cmc_palmar", "t_mcp", "t_ip")
NAMES = (["yaw", "pitch", "roll", "tx", "ty", "tz"] + [f"{f}.{k}" for f in (2, 3, 4, 5) for k in FINGER_VARS]
         + [f"1.{k}" for k in THUMB_KEYS] + ["scale"])
IX = {n: i for i, n in enumerate(NAMES)}
UP = np.array([0.0, 0.0, 1.0])


def bounds():
    lo, hi = np.empty(len(NAMES)), np.empty(len(NAMES))
    box = {"yaw": YAW, "pitch": PITCH, "roll": ROLL, "tx": (-2000, 2000), "ty": (-400, 400), "tz": (0, 250),
           "1.cmc_radial": (THUMB_RADIAL_MIN, THUMB_RADIAL_MAX), "1.cmc_palmar": (THUMB_PALMAR_MIN, THUMB_PALMAR_MAX),
           "1.t_mcp": LIM["t_mcp"], "1.t_ip": LIM["t_ip"], "scale": SCALE}
    for f in (2, 3, 4, 5):
        box[f"{f}.curl"] = (0.0, min(LIM[k][1] / b for k, b in zip(("mcp", "pip", "dip"), BEND_SPLIT[f])))
        box[f"{f}.abd"] = (-ABD_MAX, ABD_MAX)
    for n, i in IX.items():
        lo[i], hi[i] = box[n]
    return lo, hi


def rx(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def ry(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rz(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def flat(v):
    v = np.array([v[0], v[1], 0.0])
    return v / np.linalg.norm(v)


def load_rest(path, side):
    """The rig's rest hand (hand frame, mm) from mech_sweep.py's report; side 'R' or 'L' (mirrored there)."""
    r = json.load(open(path, encoding="utf-8"))
    mcp = {int(f): np.array(p) for f, p in r["rest"][side]["mcp"].items()}
    tip = {int(f): np.array(p) for f, p in r["rest"][side]["tip"].items()}
    return {"mcp": mcp, "len": {int(f): v for f, v in r["len"][side].items()},
            "neutral": {f: flat(tip[f] - mcp[f]) for f in (2, 3, 4, 5)}, "idx": flat(mcp[2])}


def hand_points(rest, x):
    """The 21 MediaPipe joints of the rig hand (hand frame, mm, scaled) for the variables x."""
    s = x[IX["scale"]]
    P = np.zeros((21, 3))
    for f in (2, 3, 4, 5):
        m, p, d = (math.radians(b * x[IX[f"{f}.curl"]]) for b in BEND_SPLIT[f])
        a = math.radians(x[IX[f"{f}.abd"]])
        dirn = rz(a) @ rest["neutral"][f]
        q = rest["mcp"][f].copy()
        P[CHAIN[f][0]] = q
        for j, (L, h) in enumerate(zip(rest["len"][f], (-m, -m - p, -m - p - d))):
            q = q + L * (math.cos(h) * dirn + math.sin(h) * UP)
            P[CHAIN[f][j + 1]] = q
    r, pl, tm, ti = (math.radians(x[IX[f"1.{k}"]]) for k in THUMB_KEYS)
    fl = rz(r) @ rest["idx"]
    u = math.cos(pl) * fl - math.sin(pl) * UP
    w = rz(-math.pi / 2) @ fl                           # in the palm's plane, towards the fingers
    q = rest["mcp"][1].copy()
    P[1] = q
    for j, (L, h) in enumerate(zip(rest["len"][1], (0.0, tm, tm + ti))):
        q = q + L * (math.cos(h) * u + math.sin(h) * w)
        P[2 + j] = q
    return P * s


def rotation(x):
    return (rz(-math.radians(x[IX["yaw"]])) @ rx(-math.radians(x[IX["pitch"]]))
            @ ry(-math.radians(x[IX["roll"]])))


def world_points(rest, x):
    """Hand joints on the keys, mm: x along the keys (mirrored for a left hand), y into them, z up."""
    return hand_points(rest, x) @ rotation(x).T + x[IX["tx"]:IX["tz"] + 1]


def camera(H, q, mirror):
    """Weak perspective at the key-plane point q (white keys, cm): image = A @ world_mm + b."""
    def img(dx, dy):
        return apply(H, [[q[0] + dx / WHITE_MM, q[1] + dy / 10.0]])[0]
    J = np.c_[(img(1, 0) - img(-1, 0)) / 2, (img(0, 1) - img(0, -1)) / 2]   # 2x2: px per mm along / into
    p1, p2 = J
    a, e = p1 @ p2, p1 @ p1 - p2 @ p2
    c0 = math.sqrt(max((-e + math.sqrt(e * e + 4 * a * a)) / 2, 0.0))
    c1 = -a / c0 if c0 > 1e-6 else math.sqrt(max(-e, 0.0))
    c = np.array([c0, c1])
    recede = J @ (np.asarray(H)[2, :2] / [WHITE_MM, 10.0])   # image of a step away from the camera on the plane
    A = np.c_[J, c if c @ recede >= 0 else -c]
    b = img(0, 0) - J @ np.array([q[0] * WHITE_MM, q[1] * 10.0])
    if mirror:
        A = A @ np.diag([-1.0, 1.0, 1.0])
    return A, b


def project(cam, X):
    A, b = cam
    return X @ A.T + b


def residuals(x, ctx):
    X = world_points(ctx["rest"], x)
    r = (project(ctx["cam"], X[ctx["use"]]) - ctx["obs"][ctx["use"]]).ravel()
    tips = [CONTACT_PX * (X[TIPS[f]][2] - z) for f, z in ctx["press"]]
    floor = [CONTACT_PX * min(0.0, X[i][2] - z) for i, z in ctx["floor"]]
    return np.r_[r, tips, floor]


def fit(x0, active, lo, hi, fun, iters=300):
    """Projected Levenberg-Marquardt inside the box [lo, hi]; a variable on a wall that the gradient pushes
    out stays there for the step."""
    x = np.clip(x0, lo, hi)
    r = fun(x)
    cost, lam = r @ r, 1e-3
    for _ in range(iters):
        J = np.zeros((len(r), len(x)))
        for i in np.flatnonzero(active):
            h = 1e-3 if NAMES[i] == "scale" else 0.05
            xp = x.copy()
            xp[i] = x[i] + h if x[i] + h <= hi[i] else x[i] - h
            J[:, i] = (fun(xp) - r) / (xp[i] - x[i])
        g = J.T @ r
        free = active & ~(((x <= lo + 1e-9) & (g > 0)) | ((x >= hi - 1e-9) & (g < 0)))
        Jf = J[:, free]
        A = Jf.T @ Jf
        while True:
            dx = np.linalg.solve(A + lam * np.diag(np.diag(A) + 1e-6), -Jf.T @ r)
            xn = x.copy()
            xn[free] = np.clip(x[free] + dx, lo[free], hi[free])
            rn = fun(xn)
            cn = rn @ rn
            if cn < cost:
                break
            lam *= 4
            if lam > 1e8:
                return x, r
        done = cost - cn < 1e-6 * cost
        x, r, cost, lam = xn, rn, cn, max(lam / 3, 1e-7)
        if done:
            break
    return x, r


def onset_context(rec, feat, kb, rest_by_side):
    frames = near_frames(rec)
    obs = np.median([[p[:2] for p in w["image"]] for w in frames], axis=0)
    mirror = feat["hand"] == "left"
    knuckle = (feat["knuckle"]["x"], feat["knuckle"]["depthCm"])
    tucked = feat["thumb"] == "tucked"
    use = [i for i in range(21) if not (tucked and i in CHAIN[1])]
    press = []
    for n in feat["notes"]:
        if n["finger"] and not (tucked and n["finger"] == 1):
            z = R_FINGER[n["finger"]] * TIP_ABOVE + (BLACK_TOP if n["pitch"] % 12 in BLACK_PCS else 0.0)
            press.append((n["finger"], z))
    pressed = {TIPS[f] for f, _ in press}
    floor = [(i, R_FINGER[f] * TIP_ABOVE) for f, ch in CHAIN.items() if not (tucked and f == 1)
             for i in ch[1:] if i not in pressed]
    return {"rest": rest_by_side["L" if mirror else "R"], "floor": floor, "cam": camera(kb, knuckle, mirror),
            "obs": obs, "use": use, "press": press, "tucked": tucked, "mirror": mirror,
            "time": float(np.median([w["time"] for w in frames]))}


def start(feat, mirror, roll, scale):
    x = np.zeros(len(NAMES))
    sx = -1.0 if mirror else 1.0
    x[IX["yaw"]] = sx * feat["yawDeg"]
    x[IX["pitch"]], x[IX["roll"]] = 10.0, roll
    x[IX["tx"]] = sx * feat["wrist"]["x"] * WHITE_MM
    x[IX["ty"]] = feat["wrist"]["depthCm"] * 10.0
    x[IX["tz"]] = 60.0
    for f in (2, 3, 4, 5):
        x[IX[f"{f}.curl"]] = 1.0
    x[IX["1.cmc_radial"]], x[IX["1.cmc_palmar"]], x[IX["1.t_mcp"]], x[IX["1.t_ip"]] = 40.0, 20.0, 10.0, 10.0
    x[IX["scale"]] = scale
    return x


def fit_onset(ctx, feat, lo, hi, scale=None):
    active = np.ones(len(NAMES), bool)
    if scale is not None:
        active[IX["scale"]] = False
    if ctx["tucked"]:
        for k in THUMB_KEYS:
            active[IX[f"1.{k}"]] = False
    fun = lambda x: residuals(x, ctx)
    best = None
    for roll in (0.0, -30.0):
        x, r = fit(start(feat, ctx["mirror"], roll, scale or 1.0), active, lo, hi, fun)
        if best is None or r @ r < best[1] @ best[1]:
            best = (x, r)
    return best


def joint_errors(x, ctx):
    X = world_points(ctx["rest"], x)
    d = np.linalg.norm(project(ctx["cam"], X) - ctx["obs"], axis=1)
    return {i: float(d[i]) for i in ctx["use"]}, X


def record(feat, x, ctx, lo, hi):
    err, X = joint_errors(x, ctx)
    e = np.array(list(err.values()))
    walls = [n for n in NAMES[:-1] if n not in ("tx", "ty", "tz") and not (ctx["tucked"] and n.startswith("1."))
             and (x[IX[n]] <= lo[IX[n]] + 0.05 or x[IX[n]] >= hi[IX[n]] - 0.05)]
    angles = {str(f): {**{k: round(float(b * x[IX[f"{f}.curl"]]), 1) for k, b in zip(FINGER_KEYS, BEND_SPLIT[f])},
                       "abd": round(float(x[IX[f"{f}.abd"]]), 1), "curl": round(float(x[IX[f"{f}.curl"]]), 3)}
              for f in (2, 3, 4, 5)}
    mean = float(np.mean([x[IX[f"{f}.curl"]] for f in (2, 3, 4, 5)]))
    for f in (2, 3, 4, 5):
        angles[str(f)]["rel"] = round(float(x[IX[f"{f}.curl"]]) / mean, 3) if mean > 1e-6 else None
    angles["1"] = None if ctx["tucked"] else {k: round(float(x[IX[f"1.{k}"]]), 1) for k in THUMB_KEYS}
    sx = -1.0 if ctx["mirror"] else 1.0
    return {"id": feat["id"], "hand": feat["hand"], "time": feat["time"], "frameTime": round(ctx["time"], 4),
            "thumb": feat["thumb"], "angles": angles,
            "root": {"yawDeg": round(sx * float(x[IX["yaw"]]), 1), "pitchDeg": round(float(x[IX["pitch"]]), 1),
                     "rollDeg": round(float(x[IX["roll"]]), 1), "wristHeightMm": round(float(x[IX["tz"]]), 1)},
            "px": {"median": round(float(np.median(e)), 2), "p90": round(float(np.percentile(e, 90)), 2),
                   "max": round(float(e.max()), 2), "joints": {str(i): round(v, 1) for i, v in err.items()}},
            "tipOffKeyTopMm": {str(f): round(float(X[TIPS[f]][2] - z), 1) for f, z in ctx["press"]},
            "sunkMm": round(float(max([z - X[i][2] for i, z in ctx["floor"]] + [0.0])), 1),
            "atWall": walls, "ok": bool(np.median(e) <= SHAPE_MAX_PX)}


def run(recs, feats, kb, rests, lo, hi, scale):
    out, fits = [], []
    for rec, feat in zip(recs, feats):
        ctx = onset_context(rec, feat, kb, rests)
        x, _ = fit_onset(ctx, feat, lo, hi, scale)
        out.append(record(feat, x, ctx, lo, hi))
        fits.append((x, ctx))
    return out, fits


def grab(video, t):
    from PIL import Image
    png = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.3f}", "-i", video, "-frames:v", "1", "-f", "image2pipe",
                          "-vcodec", "png", "-"], capture_output=True, check=True).stdout
    return Image.open(io.BytesIO(png)).convert("RGB")


def overlay(video, rec, x, ctx, path):
    """The frame around the hand: MediaPipe's joints (green) and the fitted rig's skeleton (orange)."""
    from PIL import ImageDraw
    im = grab(video, ctx["time"])
    X = world_points(ctx["rest"], x)
    rig, mp = project(ctx["cam"], X), ctx["obs"]
    pts = np.r_[rig[ctx["use"]], mp[ctx["use"]]]
    x0, y0 = (pts.min(0) - 50).astype(int)
    x1, y1 = (pts.max(0) + 50).astype(int)
    dr = ImageDraw.Draw(im)
    for P, col, wd in ((mp, (60, 230, 90), 2), (rig, (255, 140, 30), 3)):
        for f, ch in CHAIN.items():
            if f == 1 and ctx["tucked"]:
                continue
            seq = [0, *ch]
            for a, b in zip(seq, seq[1:]):
                dr.line([tuple(P[a]), tuple(P[b])], fill=col, width=wd)
            for i in seq:
                dr.ellipse([P[i][0] - 3, P[i][1] - 3, P[i][0] + 3, P[i][1] + 3], fill=col)
    crop = im.crop((max(x0, 0), max(y0, 0), min(x1, im.width), min(y1, im.height)))
    crop.save(path)
    return crop


def sheet(crops, labels, path, cell=300, cols=6):
    from PIL import Image, ImageDraw
    rows = (len(crops) + cols - 1) // cols
    out = Image.new("RGB", (cols * cell, rows * (cell + 18)), (20, 20, 20))
    dr = ImageDraw.Draw(out)
    for k, (c, lab) in enumerate(zip(crops, labels)):
        c = c.copy()
        c.thumbnail((cell, cell))
        X, Y = (k % cols) * cell, (k // cols) * (cell + 18)
        out.paste(c, (X, Y + 18))
        dr.text((X + 4, Y + 3), lab, fill=(230, 230, 230))
    out.save(path)


def distribution(out):
    ok = [o for o in out if o["ok"]]
    print(f"angles over {len(ok)} onsets with a shape (p5 / p50 / p95; walls); split MCP/PIP/DIP {BEND_SPLIT}:")
    for f in ("2", "3", "4", "5"):
        print(f"  finger {f}: " + "  ".join(
            f"{k} {np.percentile([o['angles'][f][k] for o in ok], 5):.{d}f}/"
            f"{np.median([o['angles'][f][k] for o in ok]):.{d}f}/{np.percentile([o['angles'][f][k] for o in ok], 95):.{d}f}"
            for k, d in (("curl", 2), ("rel", 2), ("mcp", 0), ("pip", 0), ("dip", 0), ("abd", 0))) if ok else "-")
    th = [o for o in ok if o["angles"]["1"]]
    if th:
        print("  thumb: " + "  ".join(
            f"{k} {np.percentile([o['angles']['1'][k] for o in th], 5):.0f}/{np.median([o['angles']['1'][k] for o in th]):.0f}/"
            f"{np.percentile([o['angles']['1'][k] for o in th], 95):.0f}" for k in THUMB_KEYS) + f" ({len(th)} onsets)")
    walls = {}
    for o in ok:
        for n in o["atWall"]:
            walls[n] = walls.get(n, 0) + 1
    print("  at a wall:", dict(sorted(walls.items(), key=lambda kv: -kv[1])) or "none")
    print(f"  limits: MCP {LIM['mcp']}, PIP {LIM['pip']}, DIP {LIM['dip']}, abd +-{ABD_MAX}, thumb MCP {LIM['t_mcp']}, "
          f"IP {LIM['t_ip']}, CMC radial {THUMB_RADIAL_MIN}..{THUMB_RADIAL_MAX}, palmar {THUMB_PALMAR_MIN}..{THUMB_PALMAR_MAX}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--rest", required=True, help="mech-report.json from mech_sweep.py")
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=1e9)
    ap.add_argument("--sheet", action="store_true")
    ap.add_argument("--check-pitch", action="store_true",
                    help="refit with the pitch held at -20 and 0 deg: how far the stored numbers move")
    ap.add_argument("--video", help="default: input.mkv in the folder's parent")
    a = ap.parse_args()
    path = lambda name: os.path.join(a.folder, name)
    load = lambda name: json.load(open(path(name), encoding="utf-8"))
    idx, features = {r["id"]: r for r in load("index.json")["onsets"]}, load("features.json")
    kb = np.asarray(load("keyboard.json")["H"])
    rests = {s: load_rest(a.rest, s) for s in ("R", "L")}
    feats = [o for o in features["onsets"] if a.t0 <= o["time"] <= a.t1 and all(n["finger"] for n in o["notes"])]
    recs = [idx[o["id"]] for o in feats]
    lo, hi = bounds()

    first = run(recs, feats, kb, rests, lo, hi, None)
    scale = float(np.median([x[IX["scale"]] for x, _ in first[1]]))
    print(f"pass 1 (scale free): median joint error {np.median([o['px']['median'] for o in first[0]]):.2f} px; "
          f"the teacher's hand / the rig's: {scale:.3f}")
    out, fits = run(recs, feats, kb, rests, lo, hi, scale)

    meds = [o["px"]["median"] for o in out]
    print(f"onsets {len(out)}: joint error median of medians {np.median(meds):.2f} px, worst {max(meds):.2f}; "
          f"tips off the key top max {max([abs(v) for o in out for v in o['tipOffKeyTopMm'].values()] or [0]):.1f} mm, "
          f"free joints sunk max {max(o['sunkMm'] for o in out):.1f} mm")
    print(f"no shape (median > {SHAPE_MAX_PX} px):", [(o["id"], o["px"]["median"]) for o in out if not o["ok"]])
    distribution(out)
    json.dump({"index": "index.json", "features": "features.json", "rest": os.path.basename(a.rest),
               "scale": round(scale, 4), "shapeMaxPx": SHAPE_MAX_PX, "onsets": out},
              open(path("shapes.json"), "w", encoding="utf-8"), indent=1)

    if a.check_pitch:
        for pitch in (-20.0, 0.0):
            lo2, hi2 = lo.copy(), hi.copy()
            lo2[IX["pitch"]] = hi2[IX["pitch"]] = pitch
            held, _ = run(recs, feats, kb, rests, lo2, hi2, scale)
            dr = [abs(h["angles"][f]["rel"] - o["angles"][f]["rel"]) for h, o in zip(held, out) for f in "2345"]
            da = [abs(h["angles"][f]["abd"] - o["angles"][f]["abd"]) for h, o in zip(held, out) for f in "2345"]
            dc = [abs(h["angles"][f]["curl"] - o["angles"][f]["curl"]) for h, o in zip(held, out) for f in "2345"]
            print(f"pitch held at {pitch:+.0f}: px median {np.median([h['px']['median'] for h in held]):.2f}; "
                  f"|d rel| median {np.median(dr):.3f} p90 {np.percentile(dr, 90):.3f}; |d abd| median "
                  f"{np.median(da):.1f} deg; |d curl| median {np.median(dc):.2f} (not stored)")

    if a.sheet:
        video = a.video or os.path.join(os.path.dirname(os.path.abspath(a.folder)), "input.mkv")
        os.makedirs(path(os.path.join("sheets", "shape")), exist_ok=True)
        crops, labels = [], []
        for rec, o, (x, ctx) in zip(recs, out, fits):
            crops.append(overlay(video, rec, x, ctx, path(os.path.join("sheets", "shape", o["id"] + ".png"))))
            labels.append(f"{o['id'][-4:]} {o['px']['median']:.1f}px {'' if o['ok'] else 'NO SHAPE'}")
        sheet(crops, labels, path(os.path.join("sheets", "shape-sheet.png")))
        print("sheet:", path(os.path.join("sheets", "shape-sheet.png")))


if __name__ == "__main__":
    main()
